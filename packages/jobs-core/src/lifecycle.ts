import type {
  ControlAuthority,
  ControlRequest,
  DeliveryMode,
  ExecutionAdapter,
  ExecutionState,
  JobIdentity,
  JobObservation,
  JobReply,
  LaunchRequest,
  WaitRequest,
} from './index.js';

/** Monotonic clock. Cancellation removes only the scheduled callback. */
export interface JobsClock {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}
export const systemJobsClock: JobsClock = {
  now: () => performance.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};
export interface JobsLifecycleSettingsInput {
  graceMs?: number;
  foregroundBudgetMs?: number;
  pollIntervalMs?: number;
  hardTimeoutMs?: number | null;
  awaiting?: boolean;
  lifetime?: 'managed' | 'persistent';
  delivery?: DeliveryMode;
}
export interface JobsLifecycleSettings extends Omit<JobsLifecycleSettingsInput, 'hardTimeoutMs'> {
  graceMs: number;
  foregroundBudgetMs: number;
  pollIntervalMs: number;
  awaiting: boolean;
  lifetime: 'managed' | 'persistent';
  delivery: DeliveryMode;
  hardTimeoutMs?: number;
}
const maxTimerMs = 2 ** 31 - 1;
const duration = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= minimum &&
  value <= maxTimerMs;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}
function diagnostic(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function validIdentity(value: unknown): value is JobIdentity {
  return (
    record(value) &&
    ['runtimeId', 'ownerId', 'sessionId', 'jobId', 'producerId'].every((key) => id(value[key]))
  );
}
function validAuthority(value: unknown): value is ControlAuthority {
  return record(value) && ['runtimeId', 'ownerId', 'generation'].every((key) => id(value[key]));
}
function key(job: JobIdentity): string {
  return JSON.stringify([job.runtimeId, job.ownerId, job.sessionId, job.jobId, job.producerId]);
}
function execution(value: unknown): value is ExecutionState {
  if (!record(value) || 'exitCode' in value || 'resultId' in value) return false;
  if (value.state === 'running') return !('outcome' in value);
  if (value.state === 'unknown') return diagnostic(value.reason) && !('outcome' in value);
  const outcome = value.outcome;
  return (
    value.state === 'terminal' &&
    record(outcome) &&
    ((outcome.kind === 'exit' && Number.isSafeInteger(outcome.exitCode)) ||
      (outcome.kind === 'terminated' && id(outcome.signal)) ||
      (outcome.kind === 'launch-failed' && diagnostic(outcome.reason)))
  );
}
function mode(value: unknown): value is DeliveryMode {
  return value === 'automatic' || value === 'next-natural-turn' || value === 'display-only';
}
function observation(value: unknown, job: JobIdentity): value is JobObservation {
  if (
    !record(value) ||
    !validIdentity(value.identity) ||
    key(value.identity) !== key(job) ||
    !execution(value.execution) ||
    typeof value.awaiting !== 'boolean' ||
    (value.lifetime !== 'managed' && value.lifetime !== 'persistent') ||
    !record(value.capabilities) ||
    !['stop', 'setAwaiting', 'setDelivery', 'readOutput', 'readResult'].every(
      (name) => typeof (value.capabilities as Record<string, unknown>)[name] === 'boolean',
    ) ||
    !record(value.delivery) ||
    !mode(value.delivery.mode)
  )
    return false;
  const delivery = value.delivery;
  if (delivery.state === 'not-required')
    return delivery.mode === 'display-only' && !('receipt' in delivery);
  if (delivery.state === 'pending' || delivery.state === 'unknown') return !('receipt' in delivery);
  const receipt = delivery.receipt;
  return (
    delivery.state === 'delivered' &&
    value.execution.state === 'terminal' &&
    delivery.mode !== 'display-only' &&
    record(receipt) &&
    record(receipt.result) &&
    validIdentity(receipt.result.job) &&
    key(receipt.result.job) === key(job) &&
    id(receipt.result.resultId) &&
    record(receipt.record) &&
    receipt.record.sessionId === job.sessionId &&
    id(receipt.record.entryId) &&
    (receipt.record.kind === 'tool-result' || receipt.record.kind === 'custom-message') &&
    id(receipt.contentDigest)
  );
}
function copy<T>(value: T): T {
  return structuredClone(value);
}
function reason(error: unknown): string {
  return error instanceof Error ? error.message || error.name : String(error);
}

/** Explicit objects only; no configuration files, quota overrides or command classification. */
// @mara implements DES-JOBS-GENERIC-LIFECYCLE
export function resolveJobsLifecycleSettings(
  user: JobsLifecycleSettingsInput = {},
  project: JobsLifecycleSettingsInput = {},
  job: JobsLifecycleSettingsInput = {},
): JobsLifecycleSettings {
  const result: JobsLifecycleSettings = {
    graceMs: 5000,
    foregroundBudgetMs: 5000,
    pollIntervalMs: 100,
    awaiting: true,
    lifetime: 'managed',
    delivery: 'automatic',
  };
  for (const input of [user, project, job]) {
    if (
      !record(input) ||
      Object.keys(input).some(
        (name) =>
          ![
            'graceMs',
            'foregroundBudgetMs',
            'pollIntervalMs',
            'hardTimeoutMs',
            'awaiting',
            'lifetime',
            'delivery',
          ].includes(name),
      )
    )
      throw new Error('Invalid lifecycle settings keys.');
    for (const name of ['graceMs', 'foregroundBudgetMs', 'pollIntervalMs'] as const) {
      if (input[name] !== undefined) {
        if (!duration(input[name], name === 'pollIntervalMs' ? 1 : 0))
          throw new Error(`Invalid ${name}.`);
        result[name] = input[name];
      }
    }
    if (input.hardTimeoutMs === null) delete result.hardTimeoutMs;
    else if (input.hardTimeoutMs !== undefined) {
      if (!duration(input.hardTimeoutMs)) throw new Error('Invalid hardTimeoutMs.');
      result.hardTimeoutMs = input.hardTimeoutMs;
    }
    if (input.awaiting !== undefined) {
      if (typeof input.awaiting !== 'boolean') throw new Error('Invalid awaiting.');
      result.awaiting = input.awaiting;
    }
    if (input.lifetime !== undefined) {
      if (input.lifetime !== 'managed' && input.lifetime !== 'persistent')
        throw new Error('Invalid lifetime.');
      result.lifetime = input.lifetime;
    }
    if (input.delivery !== undefined) {
      if (!mode(input.delivery)) throw new Error('Invalid delivery.');
      result.delivery = input.delivery;
    }
  }
  return result;
}
export type StopReason = 'explicit' | 'foreground-cancel' | 'hard-timeout';
export type StopStatus =
  | { state: 'requested' }
  | { state: 'already-terminal'; execution: ExecutionState & { state: 'terminal' } };
export interface StopIntent {
  requestId: string;
  reason: StopReason;
  state: 'requested' | 'unconfirmed';
  reply: JobReply<StopStatus>;
}
export interface JobLifecycle {
  inspect(this: void, job: JobIdentity): Promise<JobReply<JobObservation>>;
  stop(request: ControlRequest, reason?: StopReason): Promise<JobReply<StopStatus>>;
  setAwaiting(request: ControlRequest & { awaiting: boolean }): Promise<JobReply<JobObservation>>;
  stopIntent(): StopIntent | undefined;
  /** Cancels monitoring responsibility only. Does not stop execution or consume results. */
  dispose(): void;
}

/** Policy for an already launched handle; not a store, complete owner port or native Pi integration. */
// @mara implements DES-JOBS-GENERIC-LIFECYCLE
export function createJobLifecycle<Handle>(options: {
  request: LaunchRequest;
  handle: Handle;
  adapter: Pick<ExecutionAdapter<Handle, unknown>, 'observe' | 'stop'>;
  /** Must validate current possession/generation and backend ownership; field equality is insufficient. */
  authorize(request: ControlRequest): boolean;
  clock?: JobsClock;
  startedAtMs: number;
  settings?: JobsLifecycleSettingsInput;
}): JobLifecycle {
  const clock = options.clock ?? systemJobsClock;
  const request = options.request;
  if (
    !validIdentity(request.identity) ||
    !validAuthority(request.authority) ||
    request.authority.runtimeId !== request.identity.runtimeId ||
    request.authority.ownerId !== request.identity.ownerId ||
    typeof request.awaiting !== 'boolean' ||
    !mode(request.delivery) ||
    (request.lifetime !== 'managed' && request.lifetime !== 'persistent') ||
    !Number.isFinite(options.startedAtMs) ||
    options.startedAtMs > clock.now()
  )
    throw new Error('Invalid lifecycle launch identity/settings/start time.');
  const settings = resolveJobsLifecycleSettings(
    options.settings,
    {},
    {
      awaiting: request.awaiting,
      lifetime: request.lifetime,
      delivery: request.delivery,
      ...(request.hardTimeoutMs !== undefined ? { hardTimeoutMs: request.hardTimeoutMs } : {}),
    },
  );
  const job = copy(request.identity);
  // Preserve the owner-held reference for possession checks, but isolate backend data at action time.
  const launchAuthority = request.authority;
  let state: JobObservation = {
    identity: job,
    execution: { state: 'unknown', reason: 'No execution observation yet.' },
    awaiting: settings.awaiting,
    lifetime: settings.lifetime,
    delivery: {
      mode: settings.delivery,
      state: settings.delivery === 'display-only' ? 'not-required' : 'pending',
    },
    capabilities: {
      stop: true,
      setAwaiting: true,
      setDelivery: false,
      readOutput: false,
      readResult: false,
    },
  };
  let disposed = false;
  let cancelDeadline: (() => void) | undefined;
  let observing: Promise<void> | undefined;
  let stopping: Promise<JobReply<StopStatus>> | undefined;
  let intent: StopIntent | undefined;
  let pendingIntent: StopIntent | undefined;
  const stopObservationBounds = new Set<() => void>();
  const unavailable = (): JobReply<never> => ({
    status: 'unavailable',
    reason: 'Lifecycle monitoring disposed; execution outcome unchanged.',
  });
  function allowed(value: ControlRequest): JobReply<never> | undefined {
    if (disposed) return unavailable();
    if (!id(value.requestId) || !validIdentity(value.job) || !validAuthority(value.authority))
      return { status: 'invalid', reason: 'Invalid control request.' };
    if (
      key(value.job) !== key(job) ||
      value.authority.runtimeId !== job.runtimeId ||
      value.authority.ownerId !== job.ownerId
    )
      return { status: 'denied', reason: 'Control identity does not match this owner/job.' };
    try {
      if (options.authorize(value) === true) return undefined;
    } catch {
      /* Failure to establish authority is denial, not permission. */
    }
    return {
      status: 'denied',
      reason: 'Current owner authority/possession could not be established.',
    };
  }
  function refresh(): Promise<void> {
    if (observing) return observing;
    if (disposed || state.execution.state === 'terminal') return Promise.resolve();
    observing = (async () => {
      let next: ExecutionState;
      try {
        const raw = await options.adapter.observe(options.handle);
        next = execution(raw)
          ? copy(raw)
          : { state: 'unknown', reason: 'Malformed execution observation.' };
      } catch (error) {
        next = { state: 'unknown', reason: `Observation failed: ${reason(error)}` };
      }
      if (disposed) return;
      state = { ...state, execution: next };
      if (next.state === 'terminal') {
        cancelDeadline?.();
        cancelDeadline = undefined;
      }
    })().finally(() => {
      observing = undefined;
    });
    return observing;
  }
  function refreshBeforeStop(): Promise<void> {
    const sample = refresh();
    return new Promise((resolve) => {
      let finished = false;
      let cancel: (() => void) | undefined;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancel?.();
        stopObservationBounds.delete(finish);
        resolve();
      };
      stopObservationBounds.add(finish);
      cancel = clock.schedule(() => {
        if (!disposed && state.execution.state !== 'terminal')
          state = {
            ...state,
            execution: {
              state: 'unknown',
              reason: 'Pre-stop observation exceeded its polling budget.',
            },
          };
        finish();
      }, settings.pollIntervalMs);
      void sample.then(finish);
    });
  }
  async function stop(
    value: ControlRequest,
    stopReason: StopReason = 'explicit',
  ): Promise<JobReply<StopStatus>> {
    const denied = allowed(value);
    if (denied) return denied;
    if (!['explicit', 'foreground-cancel', 'hard-timeout'].includes(stopReason))
      return { status: 'invalid', reason: 'Invalid stop reason.' };
    const captured = {
      requestId: value.requestId,
      job: copy(value.job),
      authority: value.authority,
    };
    if (stopping) return stopping;
    pendingIntent = {
      requestId: captured.requestId,
      reason: stopReason,
      state: 'unconfirmed',
      reply: { status: 'unknown', reason: 'Pre-stop observation/admission is pending.' },
    };
    stopping = (async (): Promise<JobReply<StopStatus>> => {
      await refreshBeforeStop();
      const rejected = allowed(captured);
      if (rejected) return rejected;
      if (state.execution.state === 'terminal')
        return {
          status: 'ok',
          value: { state: 'already-terminal', execution: copy(state.execution) },
        };
      if (intent?.state === 'requested') return copy(intent.reply);
      let reply: JobReply<StopStatus>;
      intent = {
        requestId: captured.requestId,
        reason: stopReason,
        state: 'unconfirmed',
        reply: { status: 'unknown', reason: 'Stop admission is pending.' },
      };
      try {
        const result = await options.adapter.stop(
          options.handle,
          copy(captured.authority),
          settings.graceMs,
        );
        if (result.status === 'ok' && result.value?.requested === true)
          reply = { status: 'ok', value: { state: 'requested' } };
        else if (
          result.status !== 'ok' &&
          diagnostic(result.reason) &&
          ['unknown', 'unavailable', 'denied', 'unsupported', 'invalid'].includes(result.status)
        )
          reply = copy(result);
        else reply = { status: 'unknown', reason: 'Malformed stop admission reply.' };
      } catch (error) {
        reply = { status: 'unknown', reason: `Stop admission failed: ${reason(error)}` };
      }
      intent = {
        requestId: captured.requestId,
        reason: stopReason,
        state: reply.status === 'ok' ? 'requested' : 'unconfirmed',
        reply: copy(reply),
      };
      return reply;
    })().finally(() => {
      stopping = undefined;
      pendingIntent = undefined;
    });
    return stopping;
  }
  const lifecycle: JobLifecycle = {
    async inspect(value) {
      if (disposed) return unavailable();
      if (!validIdentity(value) || key(value) !== key(job))
        return { status: 'unknown', reason: 'No matching current execution identity.' };
      await refresh();
      return disposed ? unavailable() : { status: 'ok', value: copy(state) };
    },
    stop,
    async setAwaiting(value) {
      const rejected = allowed(value);
      if (rejected) return rejected;
      if (typeof value.awaiting !== 'boolean')
        return { status: 'invalid', reason: 'Awaiting must be boolean.' };
      state = { ...state, awaiting: value.awaiting };
      return { status: 'ok', value: copy(state) };
    },
    stopIntent: () => (pendingIntent ?? intent) && copy((pendingIntent ?? intent)!),
    dispose() {
      disposed = true;
      cancelDeadline?.();
      cancelDeadline = undefined;
      for (const finish of stopObservationBounds) finish();
    },
  };
  if (settings.hardTimeoutMs !== undefined) {
    cancelDeadline = clock.schedule(
      () => {
        cancelDeadline = undefined;
        const timeoutRequest = {
          requestId: 'hard-timeout',
          job: copy(job),
          authority: launchAuthority,
        };
        void stop(timeoutRequest, 'hard-timeout').then((reply) => {
          if (!disposed && reply.status !== 'ok' && intent?.state !== 'requested')
            intent = {
              requestId: timeoutRequest.requestId,
              reason: 'hard-timeout',
              state: 'unconfirmed',
              reply: copy(reply),
            };
        });
      },
      Math.max(0, options.startedAtMs + settings.hardTimeoutMs - clock.now()),
    );
  }
  return lifecycle;
}

export interface JobsLifecycleRouter {
  inspect(this: void, job: JobIdentity): Promise<JobReply<JobObservation>>;
  stop(request: ControlRequest, reason?: StopReason): Promise<JobReply<StopStatus>>;
  setAwaiting(request: ControlRequest & { awaiting: boolean }): Promise<JobReply<JobObservation>>;
  wait(request: WaitRequest): Promise<JobReply<JobsWaitResult>>;
}

/** Explicit runtime composition, not discovery-based authorization or a global owner registry. */
// @mara implements DES-JOBS-GENERIC-LIFECYCLE
export function createJobsLifecycleRouter(
  ownerFor: (job: JobIdentity) => JobLifecycle | undefined,
  options: { clock?: JobsClock; pollIntervalMs?: number } = {},
): JobsLifecycleRouter {
  async function route<T>(
    job: JobIdentity,
    action: (owner: JobLifecycle) => Promise<JobReply<T>>,
  ): Promise<JobReply<T>> {
    if (!validIdentity(job)) return { status: 'invalid', reason: 'Invalid routing identity.' };
    try {
      const owner = ownerFor(copy(job));
      return owner
        ? await action(owner)
        : { status: 'unknown', reason: 'Current owner could not be resolved.' };
    } catch (error) {
      return { status: 'unknown', reason: `Owner route failed: ${reason(error)}` };
    }
  }
  const inspect = (job: JobIdentity) => route(job, (owner) => owner.inspect(copy(job)));
  return {
    inspect,
    stop: (request, stopReason) => route(request.job, (owner) => owner.stop(request, stopReason)),
    setAwaiting: (request) => route(request.job, (owner) => owner.setAwaiting(request)),
    wait: (request) => waitForJobs(request, inspect, options),
  };
}

export interface SelectedJobStatus {
  identity: JobIdentity;
  reply: JobReply<JobObservation>;
}
export interface JobsWaitResult {
  state: 'completed' | 'timed-out' | 'cancelled';
  /** Latest accepted status in selection order; observation is not a delivery receipt. */
  jobs: readonly SelectedJobStatus[];
}
/** Read-only selection policy. Timeout/cancellation never calls execution or delivery control. */
// @mara implements DES-JOBS-GENERIC-LIFECYCLE
export function waitForJobs(
  request: WaitRequest,
  inspect: (job: JobIdentity) => Promise<JobReply<JobObservation>>,
  options: { clock?: JobsClock; pollIntervalMs?: number } = {},
): Promise<JobReply<JobsWaitResult>> {
  const clock = options.clock ?? systemJobsClock;
  const interval = options.pollIntervalMs ?? 100;
  const selection = request.selection;
  if (
    !id(request.requestId) ||
    !selection ||
    !['one', 'any', 'all'].includes(selection.mode) ||
    !Array.isArray(selection.jobs) ||
    !selection.jobs.length ||
    (selection.mode === 'one' && selection.jobs.length !== 1) ||
    !Array.from(selection.jobs).every(validIdentity) ||
    new Set(selection.jobs.map(key)).size !== selection.jobs.length ||
    !duration(interval, 1) ||
    (request.timeoutMs !== undefined && !duration(request.timeoutMs))
  )
    return Promise.resolve({
      status: 'invalid',
      reason: 'Invalid wait selection/budget/poll interval.',
    });
  const jobs = copy([...selection.jobs]);
  const waitMode = selection.mode;
  const signal = request.signal;
  const latest: SelectedJobStatus[] = jobs.map((identity) => ({
    identity,
    reply: { status: 'unknown', reason: 'No wait observation yet.' },
  }));
  return new Promise((resolve) => {
    let settled = false;
    let cancelPoll: (() => void) | undefined;
    let cancelTimeout: (() => void) | undefined;
    const finish = (state: JobsWaitResult['state']) => {
      if (settled) return;
      settled = true;
      cancelPoll?.();
      cancelTimeout?.();
      signal?.removeEventListener('abort', abort);
      resolve({ status: 'ok', value: { state, jobs: copy(latest) } });
    };
    const abort = () => finish('cancelled');
    const inFlight = new Set<number>();
    const terminal = (value: SelectedJobStatus) =>
      value.reply.status === 'ok' && value.reply.value.execution.state === 'terminal';
    const accept = (index: number, value: SelectedJobStatus) => {
      if (settled) return;
      const previous = latest[index]!;
      if (previous.reply.status === 'ok' && previous.reply.value.execution.state === 'terminal') {
        // Preserve execution evidence, not stale awaiting/delivery/capability fields.
        if (value.reply.status === 'ok')
          latest[index] = {
            ...value,
            reply: {
              status: 'ok',
              value: { ...value.reply.value, execution: previous.reply.value.execution },
            },
          };
      } else latest[index] = value;
      if (waitMode === 'any' ? latest.some(terminal) : latest.every(terminal)) finish('completed');
    };
    const sample = async (identity: JobIdentity, index: number): Promise<void> => {
      try {
        const raw = await inspect(copy(identity));
        let reply: JobReply<JobObservation>;
        if (raw.status === 'ok' && observation(raw.value, identity)) reply = copy(raw);
        else if (
          raw.status !== 'ok' &&
          diagnostic(raw.reason) &&
          ['unknown', 'unavailable', 'denied', 'unsupported', 'invalid'].includes(raw.status)
        )
          reply = copy(raw);
        else reply = { status: 'unknown', reason: 'Malformed or mismatched selected observation.' };
        accept(index, { identity, reply });
      } catch (error) {
        accept(index, {
          identity,
          reply: { status: 'unknown', reason: `Inspection failed: ${reason(error)}` },
        });
      } finally {
        inFlight.delete(index);
      }
    };
    const poll = () => {
      cancelPoll = undefined;
      if (settled) return;
      // One stalled owner retains only its own in-flight slot, never the whole selection.
      jobs.forEach((identity, index) => {
        if (inFlight.has(index)) return;
        inFlight.add(index);
        void sample(identity, index);
      });
      if (!settled) cancelPoll = clock.schedule(poll, interval);
    };
    if (signal?.aborted) {
      finish('cancelled');
      return;
    }
    if (request.timeoutMs === 0) {
      finish('timed-out');
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    if (request.timeoutMs !== undefined)
      cancelTimeout = clock.schedule(() => finish('timed-out'), request.timeoutMs);
    poll();
  });
}
