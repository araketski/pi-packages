import { GateProjection, type GateIdentity, type SessionGateView } from './projection.js';

/** Custom Pi entry type; entries are history, not model messages or proof of live work. */
export const GATE_ENTRY_TYPE = 'araketski.pi-gates/v1';
const CHANNEL = 'araketski.pi-gates/v1';

type JournalEntry = (
  | { version: 1; kind: 'reconcile'; sessionId: string; owner: string; gates: GateIdentity[] }
  | { version: 1; kind: 'acquire'; sessionId: string; owner: string; gate: GateIdentity }
  | { version: 1; kind: 'release'; sessionId: string; owner: string; gateId: string }
) & { suppressNotice?: true };
type Signal =
  | { kind: 'request' | 'announce'; sessionId: string; owner?: string }
  | { kind: 'snapshot'; sessionId: string; owner: string; gates: GateIdentity[] };

/** Narrow structural Pi host: no runtime dependency on Pi in the published library. */
export interface GateHost {
  events: {
    emit(channel: string, data: unknown): void;
    on(channel: string, handler: (data: unknown) => void): () => void;
  };
  appendEntry(customType: string, data: unknown): void;
}

export interface GateContext {
  sessionManager: {
    getSessionId(): string;
    getEntries(): readonly unknown[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    value.trim() === value && !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
}

function validGate(value: unknown): value is GateIdentity {
  return isRecord(value) && validId(value.id) &&
    (value.leaseUntil === undefined || (typeof value.leaseUntil === 'number' &&
      Number.isFinite(value.leaseUntil) && value.leaseUntil >= 0));
}

function validGates(value: unknown): value is GateIdentity[] {
  return Array.isArray(value) && value.every(validGate) &&
    new Set(value.map((gate: GateIdentity) => gate.id)).size === value.length;
}

function copyGate(gate: GateIdentity): GateIdentity {
  return gate.leaseUntil === undefined ? { id: gate.id } : { id: gate.id, leaseUntil: gate.leaseUntil };
}

function parseSignal(value: unknown): Signal | undefined {
  if (!isRecord(value) || !validId(value.sessionId)) return undefined;
  if (value.kind === 'request') return { kind: 'request', sessionId: value.sessionId };
  if (value.kind === 'announce' && validId(value.owner)) {
    return { kind: 'announce', sessionId: value.sessionId, owner: value.owner };
  }
  if (value.kind === 'snapshot' && validId(value.owner) && validGates(value.gates)) {
    return { kind: 'snapshot', sessionId: value.sessionId, owner: value.owner, gates: value.gates };
  }
  return undefined;
}

function parseJournal(value: unknown): JournalEntry | undefined {
  if (!isRecord(value) || value.version !== 1 || !validId(value.sessionId) || !validId(value.owner)) return undefined;
  if (value.kind === 'reconcile' && validGates(value.gates)) {
    return { version: 1, kind: 'reconcile', sessionId: value.sessionId, owner: value.owner, gates: value.gates };
  }
  if (value.kind === 'acquire' && validGate(value.gate)) {
    return { version: 1, kind: 'acquire', sessionId: value.sessionId, owner: value.owner, gate: copyGate(value.gate) };
  }
  if (value.kind === 'release' && validId(value.gateId)) {
    return { version: 1, kind: 'release', sessionId: value.sessionId, owner: value.owner, gateId: value.gateId };
  }
  return undefined;
}

function sessionId(ctx: GateContext): string {
  const id = ctx.sessionManager.getSessionId();
  if (!validId(id)) throw new Error('Invalid gate session ID.');
  return id;
}

// @mara implements REQ-GATES-PENDING-STATE
// @mara implements REQ-GATES-PERSIST-BEFORE-SIGNAL
export function createGateOwner(pi: GateHost, owner: string, options: { suppressNotice?: boolean } = {}) {
  if (!validId(owner)) throw new Error('Invalid gate owner ID.');
  if (options.suppressNotice !== undefined && typeof options.suppressNotice !== 'boolean') {
    throw new Error('Invalid gate notice preference.');
  }
  const notice = options.suppressNotice ? { suppressNotice: true as const } : {};
  let activeSession: string | undefined;
  let ready = false;
  let gates = new Map<string, GateIdentity>();
  let unsubscribe: (() => void) | undefined;
  const send = (signal: Signal) => pi.events.emit(CHANNEL, signal);
  const snapshot = (): Signal => ({
    kind: 'snapshot', sessionId: activeSession!, owner,
    gates: [...gates].sort(([a], [b]) => a.localeCompare(b)).map(([, gate]) => copyGate(gate)),
  });
  const assertSession = (ctx: GateContext) => {
    const id = sessionId(ctx);
    if (!activeSession || id !== activeSession) throw new Error('Gate owner is not active in this session.');
    return id;
  };
  return {
    start(ctx: GateContext): void {
      const id = sessionId(ctx);
      unsubscribe?.();
      activeSession = id;
      ready = false;
      gates = new Map();
      unsubscribe = pi.events.on(CHANNEL, (raw) => {
        const message = parseSignal(raw);
        if (message?.kind === 'request' && message.sessionId === activeSession) {
          send(ready ? snapshot() : { kind: 'announce', sessionId: activeSession, owner });
        }
      });
      send({ kind: 'announce', sessionId: id, owner });
    },
    reconcile(ctx: GateContext, verified: readonly GateIdentity[]): void {
      const id = assertSession(ctx);
      if (!validGates(verified)) throw new Error('Invalid verified gate snapshot.');
      const next = new Map(verified.map((gate) => [gate.id, copyGate(gate)] as const));
      pi.appendEntry(GATE_ENTRY_TYPE, { version: 1, kind: 'reconcile', sessionId: id, owner, gates: verified.map(copyGate), ...notice } satisfies JournalEntry);
      gates = next;
      ready = true;
      send(snapshot());
    },
    acquire(ctx: GateContext, gate: GateIdentity): void {
      const id = assertSession(ctx);
      if (!ready) throw new Error('Reconcile this gate owner before acquisition.');
      if (!validGate(gate)) throw new Error('Invalid gate.');
      if (gates.has(gate.id)) return;
      pi.appendEntry(GATE_ENTRY_TYPE, { version: 1, kind: 'acquire', sessionId: id, owner, gate: copyGate(gate), ...notice } satisfies JournalEntry);
      gates.set(gate.id, copyGate(gate));
      send(snapshot());
    },
    release(ctx: GateContext, gateId: string): void {
      const id = assertSession(ctx);
      if (!ready) throw new Error('Reconcile this gate owner before clearance.');
      if (!validId(gateId)) throw new Error('Invalid gate ID.');
      if (!gates.has(gateId)) return;
      pi.appendEntry(GATE_ENTRY_TYPE, { version: 1, kind: 'release', sessionId: id, owner, gateId, ...notice } satisfies JournalEntry);
      gates.delete(gateId);
      send(snapshot());
    },
    close(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      ready = false;
      activeSession = undefined;
      gates = new Map();
    },
  };
}

// @mara implements REQ-GATES-RECONCILIATION
// @mara implements REQ-GATES-HEALTH-DIAGNOSTICS
// @mara implements REQ-GATES-SESSION-HISTORY
export function createGateObserver(
  pi: Pick<GateHost, 'events'>,
  options: { now?: () => number; timeoutMs?: number } = {},
) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid gate owner timeout.');
  let projection: GateProjection | undefined;
  let unsubscribe: (() => void) | undefined;
  const pending = new Map<string, number>();
  const send = (signal: Signal) => pi.events.emit(CHANNEL, signal);
  return {
    start(ctx: GateContext): void {
      const id = sessionId(ctx);
      const history = new Map<string, Map<string, GateIdentity>>();
      for (const entry of ctx.sessionManager.getEntries()) {
        if (!isRecord(entry) || entry.type !== 'custom' || entry.customType !== GATE_ENTRY_TYPE) continue;
        const event = parseJournal(entry.data);
        if (!event || event.sessionId !== id) continue;
        if (event.kind === 'reconcile') {
          history.set(event.owner, new Map(event.gates.map((gate) => [gate.id, copyGate(gate)])));
        } else {
          const known = history.get(event.owner) ?? new Map<string, GateIdentity>();
          if (event.kind === 'acquire') known.set(event.gate.id, copyGate(event.gate));
          else known.delete(event.gateId);
          history.set(event.owner, known);
        }
      }
      projection = new GateProjection(id);
      pending.clear();
      for (const [owner, gates] of history) {
        projection.remember(owner, [...gates.values()]);
        pending.set(owner, now());
      }
      unsubscribe?.();
      unsubscribe = pi.events.on(CHANNEL, (raw) => {
        const message = parseSignal(raw);
        if (!projection || !message || message.sessionId !== projection.sessionId) return;
        if (message.kind === 'announce') {
          projection.expect(message.owner!);
          pending.set(message.owner!, now());
        }
        if (message.kind === 'snapshot') {
          projection.confirm(message.owner, message.gates);
          pending.delete(message.owner);
        }
      });
      send({ kind: 'request', sessionId: id });
    },
    /** Call only after the current Pi session's extensions have finished owner registration. */
    finishDiscovery(): void {
      if (!projection) throw new Error('Gate observer has not started.');
      projection.finishDiscovery();
    },
    /** Ask every known owner again; unknown state never implies completion. */
    refresh(): void {
      if (!projection) throw new Error('Gate observer has not started.');
      for (const { owner } of projection.view().owners) {
        projection.expect(owner);
        pending.set(owner, now());
      }
      send({ kind: 'request', sessionId: projection.sessionId });
    },
    view(): SessionGateView {
      if (!projection) throw new Error('Gate observer has not started.');
      const result = projection.view();
      for (const owner of result.owners) {
        const diagnostics: Array<'unresponsive' | 'stale'> = [];
        if (owner.gates.some((gate) => gate.leaseUntil !== undefined && gate.leaseUntil <= now())) {
          diagnostics.push('stale');
        }
        const requestedAt = pending.get(owner.owner);
        if (requestedAt !== undefined && now() - requestedAt > timeoutMs) diagnostics.push('unresponsive');
        if (diagnostics.length) owner.diagnostics = diagnostics;
      }
      return result;
    },
    close(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      projection = undefined;
      pending.clear();
    },
  };
}
