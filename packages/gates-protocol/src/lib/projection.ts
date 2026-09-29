export interface GateIdentity {
  id: string;
  /** Unix milliseconds; an elapsed lease only produces a diagnostic. */
  leaseUntil?: number;
}

export interface OwnerView {
  owner: string;
  state: 'unconfirmed' | 'confirmed';
  gates: GateIdentity[];
  diagnostics?: Array<'unresponsive' | 'stale'>;
}

export interface SessionGateView {
  sessionId: string;
  owners: OwnerView[];
}

function identity(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    !value ||
    value.length > 128 ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    throw new Error(`Invalid ${label}: expected a nonblank identity of at most 128 characters.`);
  }
  return value;
}

function validatedGates(gates: readonly GateIdentity[]): Map<string, number | undefined> {
  if (!Array.isArray(gates)) throw new Error('Invalid gate snapshot.');
  const result = new Map<string, number | undefined>();
  for (const gate of gates) {
    const id = identity(gate?.id, 'gate ID');
    if (result.has(id)) throw new Error('Duplicate gate ID in owner snapshot.');
    if (gate.leaseUntil !== undefined && (!Number.isFinite(gate.leaseUntil) || gate.leaseUntil < 0)) {
      throw new Error('Invalid gate lease deadline.');
    }
    result.set(id, gate.leaseUntil);
  }
  return result;
}

/** Session-local projection; historic gates are not proof of live external work. */
export class GateProjection {
  private readonly owners = new Map<string, { state: OwnerView['state']; gates: Map<string, number | undefined> }>();
  readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = identity(sessionId, 'session ID');
  }

  // @mara implements REQ-GATES-RECONCILIATION
  remember(owner: string, gates: readonly GateIdentity[]): void {
    identity(owner, 'owner ID');
    const ids = validatedGates(gates);
    const prior = this.owners.get(owner);
    if (prior?.state === 'confirmed') return;
    this.owners.set(owner, {
      state: 'unconfirmed', gates: new Map([...(prior?.gates ?? []), ...ids]),
    });
  }

  // @mara implements REQ-GATES-SCOPED-STATE
  // @mara implements REQ-GATES-RECONCILIATION
  confirm(owner: string, gates: readonly GateIdentity[]): void {
    identity(owner, 'owner ID');
    const ids = validatedGates(gates);
    this.owners.set(owner, { state: 'confirmed', gates: ids });
  }

  /** Await a fresh owner report without erasing previously known gates. */
  expect(owner: string): void {
    identity(owner, 'owner ID');
    const prior = this.owners.get(owner);
    this.owners.set(owner, { state: 'unconfirmed', gates: new Map(prior?.gates ?? []) });
  }

  view(): SessionGateView {
    return {
      sessionId: this.sessionId,
      owners: [...this.owners].sort(([a], [b]) => a.localeCompare(b)).map(([owner, data]) => ({
        owner,
        state: data.state,
        gates: [...data.gates].sort(([a], [b]) => a.localeCompare(b)).map(([id, leaseUntil]) =>
          leaseUntil === undefined ? { id } : { id, leaseUntil }),
      })),
    };
  }
}
