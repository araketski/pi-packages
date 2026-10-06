import { randomUUID } from 'node:crypto';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

type ReadonlySessionManager = ExtensionContext['sessionManager'];

// Fresh implementation; no legacy Goal source or persistence reader is reused.
export const STATE_ENTRY = 'araketski.goal.state.v1';
const LEDGER_BYTES = 16 * 1024;
export type RequirementStatus = 'pending' | 'blocked' | 'verified';
export type ReviewKind = 'criteria' | 'evidence';
export type RestoreReason = 'startup' | 'reload' | 'new' | 'resume' | 'fork' | 'tree' | 'compact';
export interface Evidence {
  id: string;
  reference: string;
  claim: string;
}
export interface Criterion {
  id: string;
  criterion: string;
}
export interface Requirement extends Criterion {
  status: RequirementStatus;
  evidence: Evidence[];
  blocker?: string;
}
export interface Settings {
  restorePolicy: 'pause' | 'restore-idle' | 'resume';
  classifiersEnabled: boolean;
}
export interface Assessment {
  outcome: 'sufficient' | 'insufficient' | 'uncertain';
  diagnostic: string;
}
export interface Review extends Assessment {
  criteriaRevision: number;
  evidenceRevision?: number;
  inputKey: string;
  configurationKey: string;
}
export interface Goal {
  id: string;
  objective: string;
  revision: number;
  criteriaRevision: number;
  evidenceRevision: number;
  status: 'active' | 'paused' | 'complete' | 'budget-limited' | 'cleared';
  settings: Settings;
  ledger: Requirement[];
  reviews: { criteria?: Review; evidence?: Review };
}
export interface GoalSnapshot {
  schema: 1;
  goal: Goal | null;
}
export interface Binding {
  goalId: string;
  revision: number;
}
export interface ReviewTicket extends Binding {
  sessionId: string;
  generation: number;
  kind: ReviewKind;
  inputKey: string;
  configurationKey: string;
}

function demand(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  demand(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Expected an object',
  );
  demand(
    Object.keys(value).every((key) => keys.includes(key)),
    'Unexpected state field',
  );
}
function text(value: unknown, max = LEDGER_BYTES): asserts value is string {
  demand(
    typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value) <= max,
    'Expected bounded nonempty text',
  );
}
function revision(value: unknown): asserts value is number {
  demand(Number.isSafeInteger(value) && (value as number) >= 0, 'Invalid revision');
}
function validateLedger(ledger: unknown): asserts ledger is Requirement[] {
  demand(Array.isArray(ledger) && ledger.length <= 50, 'Ledger allows at most 50 requirements');
  demand(
    Buffer.byteLength(JSON.stringify(ledger)) <= LEDGER_BYTES,
    `Ledger exceeds ${LEDGER_BYTES} serialized bytes`,
  );
  const ids = new Set<string>();
  for (const requirement of ledger) {
    object(requirement, ['id', 'criterion', 'status', 'evidence', 'blocker']);
    text(requirement.id, 128);
    text(requirement.criterion);
    demand(!ids.has(requirement.id), 'duplicate requirement ID');
    ids.add(requirement.id);
    demand(
      ['pending', 'blocked', 'verified'].includes(requirement.status as string),
      'Invalid requirement status',
    );
    demand(
      Array.isArray(requirement.evidence) && requirement.evidence.length <= 20,
      'Requirement allows at most 20 evidence items',
    );
    const evidenceIds = new Set<string>();
    for (const evidence of requirement.evidence) {
      object(evidence, ['id', 'reference', 'claim']);
      text(evidence.id, 128);
      text(evidence.reference);
      text(evidence.claim);
      demand(!evidenceIds.has(evidence.id), 'duplicate evidence ID');
      evidenceIds.add(evidence.id);
    }
    if (requirement.status === 'blocked') text(requirement.blocker, 1024);
    else demand(requirement.blocker === undefined, 'Only blocked requirements have a blocker');
    if (requirement.status === 'verified')
      demand(requirement.evidence.length > 0, 'Verified requirements need evidence');
  }
}
function validateSnapshot(value: unknown): asserts value is GoalSnapshot {
  object(value, ['schema', 'goal']);
  demand(value.schema === 1, 'Unknown state schema');
  if (value.goal === null) return;
  const goal = value.goal;
  object(goal, [
    'id',
    'objective',
    'revision',
    'criteriaRevision',
    'evidenceRevision',
    'status',
    'settings',
    'ledger',
    'reviews',
  ]);
  text(goal.id, 128);
  text(goal.objective, 4096);
  revision(goal.revision);
  revision(goal.criteriaRevision);
  revision(goal.evidenceRevision);
  demand(
    goal.criteriaRevision <= goal.evidenceRevision && goal.evidenceRevision <= goal.revision,
    'Inconsistent revisions',
  );
  demand(
    ['active', 'paused', 'complete', 'budget-limited', 'cleared'].includes(goal.status as string),
    'Invalid goal status',
  );
  object(goal.settings, ['restorePolicy', 'classifiersEnabled']);
  demand(
    ['pause', 'restore-idle', 'resume'].includes(goal.settings.restorePolicy as string),
    'Invalid restore policy',
  );
  demand(typeof goal.settings.classifiersEnabled === 'boolean', 'Invalid classifier setting');
  validateLedger(goal.ledger);
  object(goal.reviews, ['criteria', 'evidence']);
  for (const kind of ['criteria', 'evidence'] as const) {
    const review = goal.reviews[kind];
    if (review === undefined) continue;
    object(review, [
      'outcome',
      'diagnostic',
      'criteriaRevision',
      'evidenceRevision',
      'inputKey',
      'configurationKey',
    ]);
    demand(
      ['sufficient', 'insufficient', 'uncertain'].includes(review.outcome as string),
      'Invalid assessment outcome',
    );
    text(review.diagnostic, 1024);
    text(review.inputKey, 256);
    text(review.configurationKey, 256);
    demand(review.criteriaRevision === goal.criteriaRevision, 'Stale criteria review');
    demand(
      kind === 'evidence'
        ? review.evidenceRevision === goal.evidenceRevision
        : review.evidenceRevision === undefined,
      'Stale evidence review',
    );
  }
  if (goal.status === 'complete') {
    demand(
      goal.ledger.length > 0 && goal.ledger.every((r) => r.status === 'verified'),
      'Complete goals need an evidenced checklist',
    );
    demand(
      Object.values(goal.reviews).every((r) => (r as Review).outcome === 'sufficient'),
      'Complete goal has a review refusal',
    );
  }
}
function latest(session: ReadonlySessionManager) {
  return session
    .getBranch()
    .reverse()
    .find((entry) => entry.type === 'custom' && entry.customType === STATE_ENTRY);
}
function terminal(goal: Goal) {
  return ['complete', 'budget-limited', 'cleared'].includes(goal.status);
}

/** Serialized, branch-local storage seam. It neither inspects evidence nor schedules work. */
export class GoalState {
  private snapshot: GoalSnapshot = { schema: 1, goal: null };
  private session?: ReadonlySessionManager;
  private sessionId?: string;
  private stateEntryId?: string;
  private generation = 0;
  private tickets: Partial<Record<ReviewKind, ReviewTicket>> = {};
  diagnostic: string | null = null;
  private readonly append: (snapshot: GoalSnapshot) => void;

  constructor(append: (snapshot: GoalSnapshot) => void) {
    this.append = append;
  }

  inspect(): GoalSnapshot {
    return structuredClone(this.snapshot);
  }

  detach(): void {
    this.generation++;
    this.session = undefined;
    this.sessionId = undefined;
    this.stateEntryId = undefined;
    this.tickets = {};
    this.snapshot = { schema: 1, goal: null };
    this.diagnostic = null;
  }

  restore(session: ReadonlySessionManager, reason: RestoreReason): void {
    this.detach();
    this.session = session;
    this.sessionId = session.getSessionId();
    const entry = latest(session);
    this.stateEntryId = entry?.id;
    if (!entry || entry.type !== 'custom') return;
    try {
      validateSnapshot(entry.data);
      this.snapshot = structuredClone(entry.data);
    } catch {
      this.diagnostic = 'Ignored malformed latest Goal state';
      return;
    }
    const goal = this.snapshot.goal;
    if (
      (reason === 'startup' || reason === 'reload') &&
      goal?.status === 'active' &&
      goal.settings.restorePolicy === 'pause'
    ) {
      const next = this.inspect();
      next.goal!.status = 'paused';
      next.goal!.revision++;
      try {
        this.commit(next);
      } catch (error) {
        this.detach();
        throw error;
      }
    }
  }

  private assertSession(): void {
    demand(
      this.session && this.session.getSessionId() === this.sessionId,
      'No current bound session',
    );
    demand(
      latest(this.session)?.id === this.stateEntryId,
      'Selected branch state changed; restore the session first',
    );
  }
  private commit(next: GoalSnapshot): void {
    this.assertSession();
    validateSnapshot(next);
    // Pi exceptions propagate. Never acknowledge failure or bypass it with file writes.
    this.append(structuredClone(next));
    this.snapshot = next;
    this.stateEntryId = latest(this.session!)?.id;
    this.tickets = {};
  }
  private assertGoal(binding: Binding, active = true): Goal {
    this.assertSession();
    const goal = this.snapshot.goal;
    demand(goal && goal.id === binding.goalId, 'Wrong current goal identity');
    demand(goal.revision === binding.revision, 'Stale expected revision');
    if (active) demand(goal.status === 'active', 'Mutation requires an active goal');
    return goal;
  }
  private change(binding: Binding, mutate: (goal: Goal) => void, active = true): void {
    this.assertGoal(binding, active);
    const next = this.inspect();
    const goal = next.goal!;
    mutate(goal);
    goal.revision++;
    this.commit(next);
  }
  private ledgerChange(binding: Binding, mutate: (goal: Goal) => boolean): void {
    this.change(binding, (goal) => {
      const criteriaChanged = mutate(goal);
      goal.evidenceRevision++;
      delete goal.reviews.evidence;
      if (criteriaChanged) {
        goal.criteriaRevision++;
        delete goal.reviews.criteria;
      }
    });
  }
  private requirement(goal: Goal, id: string): Requirement {
    const requirement = goal.ledger.find((r) => r.id === id);
    demand(requirement, 'Unknown requirement');
    return requirement;
  }

  create(objective: string): void {
    this.assertSession();
    text(objective, 4096);
    demand(!this.snapshot.goal || terminal(this.snapshot.goal), 'A current goal already exists');
    this.commit({
      schema: 1,
      goal: {
        id: randomUUID(),
        objective,
        revision: 0,
        criteriaRevision: 0,
        evidenceRevision: 0,
        status: 'active',
        settings: { restorePolicy: 'pause', classifiersEnabled: true },
        ledger: [],
        reviews: {},
      },
    });
  }
  initializeRequirements(binding: Binding, criteria: Criterion[]): void {
    demand(criteria.length > 0, 'Initialize a nonempty checklist');
    this.ledgerChange(binding, (goal) => {
      demand(goal.ledger.length === 0, 'Initialization needs an empty ledger');
      goal.ledger = criteria.map((r) => ({ ...r, status: 'pending', evidence: [] }));
      return true;
    });
  }
  upsertRequirement(binding: Binding, criterion: Criterion): void {
    // Unchanged criteria are not material changes and preserve review/cache identity.
    const existing = this.snapshot.goal?.ledger.find((r) => r.id === criterion.id);
    if (existing?.criterion === criterion.criterion) {
      this.assertGoal(binding);
      return;
    }
    this.ledgerChange(binding, (goal) => {
      const requirement = goal.ledger.find((r) => r.id === criterion.id);
      if (requirement) {
        requirement.criterion = criterion.criterion;
        requirement.status = 'pending';
        delete requirement.blocker;
      } else goal.ledger.push({ ...criterion, status: 'pending', evidence: [] });
      return true;
    });
  }
  addEvidence(binding: Binding, requirementId: string, evidence: Evidence): void {
    this.ledgerChange(binding, (goal) => {
      this.requirement(goal, requirementId).evidence.push({ ...evidence });
      return false;
    });
  }
  removeEvidence(binding: Binding, requirementId: string, evidenceId: string): void {
    this.ledgerChange(binding, (goal) => {
      const requirement = this.requirement(goal, requirementId);
      const index = requirement.evidence.findIndex((e) => e.id === evidenceId);
      demand(index >= 0, 'Unknown evidence');
      requirement.evidence.splice(index, 1);
      if (requirement.status === 'verified') requirement.status = 'pending';
      return false;
    });
  }
  setRequirementStatus(
    binding: Binding,
    requirementId: string,
    status: RequirementStatus,
    blocker?: string,
  ): void {
    const current = this.requirement(this.assertGoal(binding), requirementId);
    if (
      current.status === status &&
      current.blocker === (status === 'blocked' ? blocker : undefined)
    )
      return;
    this.ledgerChange(binding, (goal) => {
      const requirement = this.requirement(goal, requirementId);
      requirement.status = status;
      if (status === 'blocked') {
        demand(blocker?.trim(), 'Blocked requirements need a blocker');
        text(blocker, 1024);
        requirement.blocker = blocker;
      } else delete requirement.blocker;
      return false;
    });
  }
  resetLedger(binding: Binding): void {
    this.ledgerChange(binding, (goal) => {
      goal.ledger = [];
      return true;
    });
  }
  updateSettings(binding: Binding, settings: Partial<Settings>): void {
    this.change(
      binding,
      (goal) => {
        goal.settings = { ...goal.settings, ...settings };
      },
      false,
    );
  }

  beginReview(kind: ReviewKind, inputKey: string, configurationKey: string): ReviewTicket {
    this.assertSession();
    text(inputKey, 256);
    text(configurationKey, 256);
    const goal = this.snapshot.goal;
    demand(goal?.status === 'active', 'Review requires an active goal');
    const ticket: ReviewTicket = {
      goalId: goal.id,
      revision: goal.revision,
      sessionId: this.sessionId!,
      generation: this.generation,
      kind,
      inputKey,
      configurationKey,
    };
    this.tickets[kind] = ticket;
    return ticket;
  }
  recordReview(ticket: ReviewTicket, assessment: Assessment): boolean {
    const goal = this.snapshot.goal;
    if (
      !this.session ||
      this.session.getSessionId() !== ticket.sessionId ||
      this.generation !== ticket.generation ||
      this.tickets[ticket.kind] !== ticket ||
      goal?.id !== ticket.goalId ||
      goal.revision !== ticket.revision ||
      latest(this.session)?.id !== this.stateEntryId
    )
      return false;
    this.change(ticket, (next) => {
      next.reviews[ticket.kind] = {
        ...assessment,
        criteriaRevision: next.criteriaRevision,
        ...(ticket.kind === 'evidence' ? { evidenceRevision: next.evidenceRevision } : {}),
        inputKey: ticket.inputKey,
        configurationKey: ticket.configurationKey,
      };
    });
    return true;
  }
  cachedReview(kind: ReviewKind, inputKey: string, configurationKey: string): Review | null {
    this.assertSession();
    const review = this.snapshot.goal?.reviews[kind];
    return review?.inputKey === inputKey && review.configurationKey === configurationKey
      ? structuredClone(review)
      : null;
  }
  hasApplicableRefusal(): boolean {
    this.assertSession();
    return Object.values(this.snapshot.goal?.reviews ?? {}).some((r) => r.outcome !== 'sufficient');
  }
  /** Storage guard only. The future controller must also inspect artifacts and confirm gates. */
  recordTerminal(binding: Binding, status: 'complete' | 'budget-limited' | 'cleared'): void {
    this.change(
      binding,
      (goal) => {
        if (status === 'complete') {
          demand(
            goal.ledger.length > 0 &&
              goal.ledger.every((r) => r.status === 'verified' && r.evidence.length > 0),
            'Completion needs a nonempty evidenced checklist',
          );
          demand(!this.hasApplicableRefusal(), 'Completion refused by applicable review');
        }
        goal.status = status;
      },
      status !== 'cleared',
    );
  }
}
