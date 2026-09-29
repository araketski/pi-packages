export interface GateIdentity {
  id: string;
}

export interface OwnerView {
  owner: string;
  state: 'unconfirmed' | 'confirmed';
  gates: GateIdentity[];
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

function gateIds(gates: readonly GateIdentity[]): string[] {
  if (!Array.isArray(gates)) throw new Error('Invalid gate snapshot.');
  const ids = gates.map((gate) => identity(gate?.id, 'gate ID'));
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate gate ID in owner snapshot.');
  return ids;
}

/** Session-local projection; historic gates are not proof of live external work. */
export class GateProjection {
  private readonly owners = new Map<string, { state: OwnerView['state']; gates: Set<string> }>();
  readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = identity(sessionId, 'session ID');
  }

  // @mara implements REQ-GATES-RECONCILIATION
  remember(owner: string, gates: readonly GateIdentity[]): void {
    identity(owner, 'owner ID');
    const ids = gateIds(gates);
    if (this.owners.get(owner)?.state === 'confirmed') return;
    this.owners.set(owner, { state: 'unconfirmed', gates: new Set(ids) });
  }

  // @mara implements REQ-GATES-SCOPED-STATE
  // @mara implements REQ-GATES-RECONCILIATION
  confirm(owner: string, gates: readonly GateIdentity[]): void {
    identity(owner, 'owner ID');
    const ids = gateIds(gates);
    this.owners.set(owner, { state: 'confirmed', gates: new Set(ids) });
  }

  view(): SessionGateView {
    return {
      sessionId: this.sessionId,
      owners: [...this.owners].sort(([a], [b]) => a.localeCompare(b)).map(([owner, data]) => ({
        owner,
        state: data.state,
        gates: [...data.gates].sort().map((id) => ({ id })),
      })),
    };
  }
}
