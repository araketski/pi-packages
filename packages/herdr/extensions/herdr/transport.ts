import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import { isAbsolute } from 'node:path';

export interface LocalContext {
  socketPath: string;
  workspaceId: string;
  tabId: string;
  paneId: string;
}
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';
export interface PaneInfo extends Record<string, unknown> {
  pane_id: string;
  terminal_id: string;
  workspace_id: string;
  tab_id: string;
  focused: boolean;
  agent_status: AgentStatus;
  revision: number;
  label?: string | null;
}
export type MoveDestination =
  | { type: 'new_workspace'; label?: string; tab_label?: string }
  | { type: 'new_tab'; workspace_id: string; label?: string }
  | {
      type: 'tab';
      tab_id: string;
      target_pane_id: string;
      split: 'right' | 'down';
      ratio?: number;
    };
export interface TransportOptions {
  timeoutMs?: number;
  maxLineBytes?: number;
  maxBufferedEvents?: number;
}
export class HerdrError extends Error {
  readonly code: string;
  readonly ambiguous: boolean;
  readonly source: 'transport' | 'server' | 'context';
  constructor(
    code: string,
    message: string,
    ambiguous = false,
    source: HerdrError['source'] = 'transport',
  ) {
    super(message);
    this.name = 'HerdrError';
    this.code = code;
    this.ambiguous = ambiguous;
    this.source = source;
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('Expected an object');
  return value as Record<string, unknown>;
}
function invalid(message: string) {
  return new HerdrError('invalid_response', message);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function id(value: unknown): asserts value is string {
  if (!nonempty(value))
    throw new HerdrError(
      'invalid_context',
      'An explicit nonempty resource ID is required',
      false,
      'context',
    );
}
export function resolveLocalContext(
  env: Record<string, string | undefined> = process.env,
): LocalContext {
  const { HERDR_ENV, HERDR_SOCKET_PATH, HERDR_WORKSPACE_ID, HERDR_TAB_ID, HERDR_PANE_ID } = env;
  if (
    HERDR_ENV !== '1' ||
    !HERDR_SOCKET_PATH ||
    !isAbsolute(HERDR_SOCKET_PATH) ||
    HERDR_SOCKET_PATH.includes('\0')
  ) {
    throw new HerdrError(
      'invalid_context',
      'A Herdr-managed local context with an absolute inherited socket path is required',
      false,
      'context',
    );
  }
  id(HERDR_WORKSPACE_ID);
  id(HERDR_TAB_ID);
  id(HERDR_PANE_ID);
  return {
    socketPath: HERDR_SOCKET_PATH,
    workspaceId: HERDR_WORKSPACE_ID,
    tabId: HERDR_TAB_ID,
    paneId: HERDR_PANE_ID,
  };
}
function pane(value: unknown): PaneInfo {
  const p = record(value);
  if (
    !['pane_id', 'terminal_id', 'workspace_id', 'tab_id'].every((key) => nonempty(p[key])) ||
    typeof p.focused !== 'boolean' ||
    !['idle', 'working', 'blocked', 'done', 'unknown'].includes(p.agent_status as string) ||
    !Number.isSafeInteger(p.revision) ||
    (p.revision as number) < 0 ||
    (p.label !== undefined && p.label !== null && typeof p.label !== 'string')
  )
    throw invalid('Invalid PaneInfo');
  return p as PaneInfo;
}
const eventNames = [
  'pane.created',
  'pane.updated',
  'pane.moved',
  'pane.closed',
  'pane.exited',
] as const;
type PaneEvent = { event: (typeof eventNames)[number]; data: Record<string, unknown> };
function event(value: unknown): PaneEvent {
  const e = record(value),
    data = record(e.data);
  const name = eventNames.find((name) => name.replaceAll('.', '_') === e.event);
  if (!name || data.type !== e.event)
    throw invalid(`Invalid pane event: ${String(e.event)} / ${String(data.type)}`);
  if (['pane.created', 'pane.updated', 'pane.moved'].includes(name)) pane(data.pane);
  else if (!nonempty(data.pane_id) || !nonempty(data.workspace_id))
    throw invalid(`Invalid pane event IDs: ${JSON.stringify(data)}`);
  if (
    name === 'pane.moved' &&
    !['previous_pane_id', 'previous_workspace_id', 'previous_tab_id'].every((key) =>
      nonempty(data[key]),
    )
  )
    throw invalid(`Invalid pane move IDs: ${JSON.stringify(data)}`);
  return { event: name, data };
}

// One request per socket; only the subscription socket remains open. This is not a multiplexed RPC client.
class JsonRequest {
  readonly reply: Promise<Record<string, unknown>>;
  private socket: Socket;
  private timer: ReturnType<typeof setTimeout>;
  private buffer = Buffer.alloc(0);
  private settled = false;
  private stopped = false;
  private written = false;
  private mutation: boolean;
  private reject!: (error: HerdrError) => void;
  constructor(
    context: LocalContext,
    method: string,
    params: object,
    options: Required<TransportOptions>,
    validate: (result: Record<string, unknown>) => void,
    mutation: boolean,
    onEvent?: (value: unknown) => void,
    onFault?: (error: HerdrError) => void,
  ) {
    this.mutation = mutation;
    const requestId = randomUUID();
    let resolve!: (result: Record<string, unknown>) => void;
    this.reply = new Promise((yes, no) => {
      resolve = yes;
      this.reject = no;
    });
    const fail = (cause: unknown) => {
      if (this.stopped) return;
      const error =
        cause instanceof HerdrError ? cause : new HerdrError('disconnected', String(cause));
      const failure = new HerdrError(
        error.code,
        error.message,
        error.source !== 'server' && mutation && this.written,
        error.source,
      );
      if (!this.settled) {
        this.settled = true;
        this.reject(failure);
      }
      this.stop();
      onFault?.(failure);
    };
    this.timer = setTimeout(
      () => fail(new HerdrError('timeout', `${method} deadline exceeded`)),
      options.timeoutMs,
    );
    this.socket = createConnection(context.socketPath);
    this.socket.on('connect', () => {
      this.written = true;
      this.socket.write(JSON.stringify({ id: requestId, method, params }) + '\n');
    });
    this.socket.on('error', fail);
    this.socket.on('close', () => fail(new HerdrError('disconnected', `${method} socket closed`)));
    this.socket.on('data', (chunk) => {
      try {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (!this.stopped) {
          const end = this.buffer.indexOf(10);
          if ((end < 0 ? this.buffer.length : end) > options.maxLineBytes)
            throw invalid('JSON line exceeds byte limit');
          if (end < 0) return;
          const line = this.buffer.subarray(0, end).toString('utf8');
          this.buffer = this.buffer.subarray(end + 1);
          let value: unknown;
          try {
            value = JSON.parse(line);
          } catch {
            throw invalid('Malformed JSON line');
          }
          if (this.settled) {
            if (!onEvent) throw invalid('Unexpected extra reply');
            onEvent(value);
            continue;
          }
          const response = record(value);
          if (response.id !== requestId || 'result' in response === 'error' in response)
            throw invalid('Reply ID or envelope mismatch');
          if ('error' in response) {
            const error = record(response.error);
            if (!nonempty(error.code) || typeof error.message !== 'string')
              throw invalid('Invalid structured error');
            throw new HerdrError(error.code, error.message, false, 'server');
          }
          const result = record(response.result);
          validate(result);
          this.settled = true;
          clearTimeout(this.timer);
          resolve(result);
          if (!onEvent) this.stop();
        }
      } catch (error) {
        fail(error);
      }
    });
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket.destroy();
  }
  cancel() {
    if (!this.settled) {
      this.settled = true;
      this.reject(
        new HerdrError('disconnected', 'Transport closed', this.mutation && this.written),
      );
    }
    this.stop();
  }
}

export class HerdrTransport {
  private readonly context: LocalContext;
  private readonly options: Required<TransportOptions>;
  private subscription?: JsonRequest;
  private requests = new Set<JsonRequest>();
  private panes = new Map<string, PaneInfo>();
  private state: 'disconnected' | 'connecting' | 'ready' | 'stale' = 'disconnected';
  private error?: HerdrError;
  private version?: string;
  private protocol?: number;
  private buffered: PaneEvent[] = [];
  private generation = 0;
  private eventRevision = 0;
  constructor(context: LocalContext, options: TransportOptions = {}) {
    this.context = Object.freeze(
      resolveLocalContext({
        HERDR_ENV: '1',
        HERDR_SOCKET_PATH: context.socketPath,
        HERDR_WORKSPACE_ID: context.workspaceId,
        HERDR_TAB_ID: context.tabId,
        HERDR_PANE_ID: context.paneId,
      }),
    );
    this.options = {
      timeoutMs: options.timeoutMs ?? 5000,
      maxLineBytes: options.maxLineBytes ?? 1024 * 1024,
      maxBufferedEvents: options.maxBufferedEvents ?? 256,
    };
    if (
      this.options.timeoutMs > 2147483647 ||
      !Object.values(this.options).every((value) => Number.isSafeInteger(value) && value > 0)
    )
      throw new HerdrError(
        'invalid_context',
        'Transport limits must be positive safe integers; timeoutMs must not exceed 2147483647',
        false,
        'context',
      );
  }
  view() {
    return {
      state: this.state,
      version: this.version,
      protocol: this.protocol,
      panes: structuredClone([...this.panes.values()]),
      error: this.error,
    };
  }
  private stale(error: HerdrError) {
    this.state = 'stale';
    this.error = error;
    this.subscription?.stop();
    this.buffered = [];
  }
  private observe() {
    return { panes: new Map(this.panes), events: this.eventRevision };
  }
  private cacheReply(p: PaneInfo, before: { panes: Map<string, PaneInfo>; events: number }) {
    // A reply describes state at server evaluation time, not necessarily at arrival time.
    // Never replace a record changed/removed since the request began. For an unknown
    // terminal, any intervening lifecycle event prevents inserting a potentially closed pane.
    const unchanged = before.panes.has(p.terminal_id)
      ? before.panes.get(p.terminal_id) === this.panes.get(p.terminal_id)
      : before.events === this.eventRevision;
    if (this.state === 'ready' && unchanged) this.panes.set(p.terminal_id, p);
  }
  private apply(e: PaneEvent) {
    ++this.eventRevision;
    if (e.event === 'pane.created' || e.event === 'pane.updated' || e.event === 'pane.moved') {
      const p = pane(e.data.pane);
      this.panes.set(p.terminal_id, p);
    } else {
      for (const [terminal, p] of this.panes)
        if (p.pane_id === e.data.pane_id) {
          if (e.event === 'pane.closed') this.panes.delete(terminal);
          else this.panes.set(terminal, { ...p, exited: true });
        }
    }
  }
  private async request(
    method: string,
    params: object,
    tag: string,
    validate: (result: Record<string, unknown>) => void = () => {},
    mutation = false,
  ) {
    const generation = this.generation;
    const request = new JsonRequest(
      this.context,
      method,
      params,
      this.options,
      (result) => {
        if (result.type !== tag)
          throw invalid(`Unexpected ${method} result type: ${String(result.type)}`);
        validate(result);
      },
      mutation,
    );
    this.requests.add(request);
    try {
      return await request.reply;
    } catch (error) {
      if (
        generation === this.generation &&
        error instanceof HerdrError &&
        error.source === 'transport'
      )
        this.stale(error);
      throw error;
    } finally {
      request.stop();
      this.requests.delete(request);
    }
  }
  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'ready')
      throw new HerdrError('not_ready', 'Close or reconnect before connecting again');
    const generation = ++this.generation;
    this.state = 'connecting';
    this.error = undefined;
    this.buffered = [];
    this.subscription = new JsonRequest(
      this.context,
      'events.subscribe',
      { subscriptions: eventNames.map((type) => ({ type })) },
      this.options,
      (result) => {
        if (result.type !== 'subscription_started')
          throw invalid('Invalid subscription acknowledgement');
      },
      false,
      (value) => {
        const e = event(value);
        if (this.state === 'connecting') {
          if (this.buffered.length >= this.options.maxBufferedEvents)
            throw invalid('Bootstrap event buffer exceeded');
          this.buffered.push(e);
        } else if (this.state === 'ready') this.apply(e);
      },
      (error) => {
        if (this.generation === generation) this.stale(error);
      },
    );
    try {
      await this.subscription.reply;
      if (this.state !== 'connecting')
        throw this.error ?? new HerdrError('disconnected', 'Bootstrap interrupted');
      const response = await this.request('session.snapshot', {}, 'session_snapshot', (result) => {
        const snapshot = record(result.snapshot);
        if (
          !nonempty(snapshot.version) ||
          !Number.isSafeInteger(snapshot.protocol) ||
          (snapshot.protocol as number) < 0 ||
          !Array.isArray(snapshot.panes)
        )
          throw invalid('Invalid session snapshot');
        snapshot.panes.forEach(pane);
      });
      if (generation !== this.generation || this.state !== 'connecting')
        throw this.error ?? new HerdrError('disconnected', 'Bootstrap interrupted');
      const snapshot = record(response.snapshot);
      this.panes = new Map((snapshot.panes as PaneInfo[]).map((p) => [p.terminal_id, p]));
      this.version = snapshot.version as string;
      this.protocol = snapshot.protocol as number;
      for (const e of this.buffered) this.apply(e);
      this.buffered = [];
      this.state = 'ready';
    } catch (error) {
      if (generation === this.generation) this.stale(error as HerdrError);
      throw error;
    }
  }
  async reconnect() {
    this.close();
    await this.connect();
  }
  close() {
    ++this.generation;
    this.subscription?.cancel();
    this.subscription = undefined;
    for (const request of this.requests) request.cancel();
    this.state = 'disconnected';
    this.error = undefined;
    this.buffered = [];
  }
  private ready() {
    if (this.state !== 'ready')
      throw new HerdrError(
        'not_ready',
        this.error?.message ?? 'Connect/resnapshot before issuing pane operations',
      );
  }
  private async query(method: 'pane.current' | 'pane.get', params: object) {
    this.ready();
    const before = this.observe();
    const result = await this.request(
      method,
      params,
      method === 'pane.current' ? 'pane_current' : 'pane_info',
      (result) => {
        const p = pane(result.pane);
        if (method === 'pane.get' && p.pane_id !== (params as { pane_id: string }).pane_id)
          throw invalid('Pane query target mismatch');
      },
    );
    const p = pane(result.pane);
    this.cacheReply(p, before);
    return structuredClone(p);
  }
  async currentPane() {
    return this.query('pane.current', { caller_pane_id: this.context.paneId });
  }
  async getPane(paneId: string) {
    id(paneId);
    return this.query('pane.get', { pane_id: paneId });
  }
  async renamePane(paneId: string, label: string | null) {
    id(paneId);
    this.ready();
    if (label !== null && typeof label !== 'string')
      throw new HerdrError('invalid_context', 'Label must be a string or null', false, 'context');
    const before = this.observe();
    const result = await this.request(
      'pane.rename',
      { pane_id: paneId, label },
      'pane_info',
      (result) => {
        if (pane(result.pane).pane_id !== paneId) throw invalid('Pane rename target mismatch');
      },
      true,
    );
    const p = pane(result.pane);
    this.cacheReply(p, before);
    return { acknowledged: true as const, pane: structuredClone(p) };
  }
  async movePane(paneId: string, destination: MoveDestination) {
    id(paneId);
    this.ready();
    if (destination.type === 'new_tab') id(destination.workspace_id);
    else if (destination.type === 'tab') {
      id(destination.tab_id);
      id(destination.target_pane_id);
      if (
        !['right', 'down'].includes(destination.split) ||
        (destination.ratio !== undefined &&
          (!Number.isFinite(destination.ratio) || destination.ratio <= 0 || destination.ratio >= 1))
      )
        throw new HerdrError('invalid_context', 'Invalid split destination', false, 'context');
    } else if (destination.type !== 'new_workspace')
      throw new HerdrError('invalid_context', 'Invalid move destination', false, 'context');
    const before = this.observe();
    const result = await this.request(
      'pane.move',
      { pane_id: paneId, destination, focus: false },
      'pane_move',
      (result) => {
        const move = record(result.move_result);
        pane(move.pane);
        if (
          move.previous_pane_id !== paneId ||
          typeof move.changed !== 'boolean' ||
          ![
            'previous_pane_id',
            'previous_workspace_id',
            'previous_tab_id',
            'focused_pane_id',
          ].every((key) => nonempty(move[key]))
        )
          throw invalid('Invalid pane move result');
      },
      true,
    );
    const move = record(result.move_result),
      p = pane(move.pane);
    this.cacheReply(p, before);
    return structuredClone(move) as Record<string, unknown> & {
      changed: boolean;
      pane: PaneInfo;
      previous_pane_id: string;
    };
  }
}
