import { GateProjection, type GateIdentity, type SessionGateView } from './projection.js';

/** Custom Pi entry type; entries are history, not model messages or proof of live work. */
export const GATE_ENTRY_TYPE = 'araketski.pi-gates/v1';
const CHANNEL = 'araketski.pi-gates/v1';

type JournalEntry =
  | { version: 1; kind: 'reconcile'; sessionId: string; owner: string; gates: GateIdentity[] }
  | { version: 1; kind: 'acquire' | 'release'; sessionId: string; owner: string; gateId: string };
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

function validGates(value: unknown): value is GateIdentity[] {
  return Array.isArray(value) && value.every((gate) => isRecord(gate) && validId(gate.id)) &&
    new Set(value.map((gate: GateIdentity) => gate.id)).size === value.length;
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
  if ((value.kind === 'acquire' || value.kind === 'release') && validId(value.gateId)) {
    return { version: 1, kind: value.kind, sessionId: value.sessionId, owner: value.owner, gateId: value.gateId };
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
export function createGateOwner(pi: GateHost, owner: string) {
  if (!validId(owner)) throw new Error('Invalid gate owner ID.');
  let activeSession: string | undefined;
  let ready = false;
  let gates = new Set<string>();
  let unsubscribe: (() => void) | undefined;
  const send = (signal: Signal) => pi.events.emit(CHANNEL, signal);
  const snapshot = (): Signal => ({
    kind: 'snapshot', sessionId: activeSession!, owner,
    gates: [...gates].sort().map((id) => ({ id })),
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
      gates = new Set();
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
      const next = new Set(verified.map((gate) => gate.id));
      pi.appendEntry(GATE_ENTRY_TYPE, { version: 1, kind: 'reconcile', sessionId: id, owner, gates: verified.map((gate) => ({ id: gate.id })) } satisfies JournalEntry);
      gates = next;
      ready = true;
      send(snapshot());
    },
    acquire(ctx: GateContext, gate: GateIdentity): void {
      const id = assertSession(ctx);
      if (!ready) throw new Error('Reconcile this gate owner before acquisition.');
      if (!gate || !validId(gate.id)) throw new Error('Invalid gate ID.');
      if (gates.has(gate.id)) return;
      pi.appendEntry(GATE_ENTRY_TYPE, { version: 1, kind: 'acquire', sessionId: id, owner, gateId: gate.id } satisfies JournalEntry);
      gates.add(gate.id);
      send(snapshot());
    },
    release(ctx: GateContext, gateId: string): void {
      const id = assertSession(ctx);
      if (!ready) throw new Error('Reconcile this gate owner before clearance.');
      if (!validId(gateId)) throw new Error('Invalid gate ID.');
      if (!gates.has(gateId)) return;
      pi.appendEntry(GATE_ENTRY_TYPE, { version: 1, kind: 'release', sessionId: id, owner, gateId } satisfies JournalEntry);
      gates.delete(gateId);
      send(snapshot());
    },
    close(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      ready = false;
      activeSession = undefined;
      gates = new Set();
    },
  };
}

// @mara implements REQ-GATES-RECONCILIATION
// @mara implements REQ-GATES-SESSION-HISTORY
export function createGateObserver(pi: Pick<GateHost, 'events'>) {
  let projection: GateProjection | undefined;
  let unsubscribe: (() => void) | undefined;
  const send = (signal: Signal) => pi.events.emit(CHANNEL, signal);
  return {
    start(ctx: GateContext): void {
      const id = sessionId(ctx);
      const history = new Map<string, Set<string>>();
      for (const entry of ctx.sessionManager.getEntries()) {
        if (!isRecord(entry) || entry.type !== 'custom' || entry.customType !== GATE_ENTRY_TYPE) continue;
        const event = parseJournal(entry.data);
        if (!event || event.sessionId !== id) continue;
        if (event.kind === 'reconcile') {
          history.set(event.owner, new Set(event.gates.map((gate) => gate.id)));
        } else {
          const known = history.get(event.owner) ?? new Set<string>();
          if (event.kind === 'acquire') known.add(event.gateId);
          else known.delete(event.gateId);
          history.set(event.owner, known);
        }
      }
      projection = new GateProjection(id);
      for (const [owner, gates] of history) projection.remember(owner, [...gates].map((gateId) => ({ id: gateId })));
      unsubscribe?.();
      unsubscribe = pi.events.on(CHANNEL, (raw) => {
        const message = parseSignal(raw);
        if (!projection || !message || message.sessionId !== projection.sessionId) return;
        if (message.kind === 'announce') projection.remember(message.owner!, []);
        if (message.kind === 'snapshot') projection.confirm(message.owner, message.gates);
      });
      send({ kind: 'request', sessionId: id });
    },
    view(): SessionGateView {
      if (!projection) throw new Error('Gate observer has not started.');
      return projection.view();
    },
    close(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      projection = undefined;
    },
  };
}
