import { SessionManager } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { GoalState, STATE_ENTRY, type GoalSnapshot } from '../extensions/goal/state.ts';

function fixture() {
  const session = SessionManager.inMemory();
  const state = new GoalState((data) => session.appendCustomEntry(STATE_ENTRY, data));
  state.restore(session, 'new');
  return { state, session };
}
function binding(state: GoalState) {
  const goal = state.inspect().goal!;
  return { goalId: goal.id, revision: goal.revision };
}
function evidenced(state: GoalState) {
  state.create('Ship an observable outcome');
  evidencedAfterCreation(state);
}
function evidencedAfterCreation(state: GoalState) {
  state.initializeRequirements(binding(state), [
    { id: 'r1', criterion: 'A consumer loads the resource' },
  ]);
  state.addEvidence(binding(state), 'r1', {
    id: 'e1',
    reference: 'test receipt',
    claim: 'Consumer loaded',
  });
  state.setRequirementStatus(binding(state), 'r1', 'verified');
}

describe('fresh bounded goal ledger', () => {
  it('creates an empty ledger and completes only a nonempty evidenced checklist', () => {
    const { state, session } = fixture();
    expect(state.inspect().goal).toBeNull();
    state.create('Consumer loads');
    expect(state.inspect().goal?.ledger).toEqual([]);
    expect(() => state.recordTerminal(binding(state), 'complete')).toThrow(/checklist/);
    state.initializeRequirements(binding(state), [{ id: 'r', criterion: 'Loads' }]);
    expect(() => state.setRequirementStatus(binding(state), 'r', 'verified')).toThrow(/evidence/);
    state.addEvidence(binding(state), 'r', { id: 'e', reference: 'receipt', claim: 'Loaded' });
    state.setRequirementStatus(binding(state), 'r', 'verified');
    const verified = state.inspect().goal;
    const reopened = new GoalState(() => {
      throw new Error('No write expected');
    });
    reopened.restore(session, 'resume');
    expect(reopened.inspect().goal).toEqual(verified);
    state.recordTerminal(binding(state), 'complete');
    expect(() =>
      state.addEvidence(binding(state), 'r', { id: 'e2', reference: 'x', claim: 'x' }),
    ).toThrow(/active/);
    const history = JSON.stringify(session.getEntries());
    state.create('Next outcome');
    expect(state.inspect().goal?.ledger).toEqual([]);
    expect(JSON.stringify(session.getEntries().slice(0, -1))).toBe(history);
  });

  it('checks identities and expected revisions without partial writes', () => {
    const { state, session } = fixture();
    state.create('Outcome');
    const old = binding(state);
    state.upsertRequirement(old, { id: 'r', criterion: 'Passes' });
    const before = JSON.stringify(session.getEntries());
    expect(() => state.upsertRequirement(old, { id: 'r2', criterion: 'Fails' })).toThrow(
      /revision/,
    );
    expect(() => state.resetLedger({ ...binding(state), goalId: 'another' })).toThrow(/goal/);
    expect(JSON.stringify(session.getEntries())).toBe(before);
    expect(() => state.create('Unconfirmed replacement')).toThrow(/current/);
  });

  it('supports upsert, status, removal and reset with verification invalidation', () => {
    const { state } = fixture();
    evidenced(state);
    const original = state.inspect().goal!;
    state.upsertRequirement(binding(state), {
      id: 'r1',
      criterion: 'Changed acceptance criterion',
    });
    expect(state.inspect().goal?.ledger[0]).toMatchObject({
      status: 'pending',
      evidence: original.ledger[0].evidence,
    });
    expect(state.inspect().goal?.criteriaRevision).toBe(original.criteriaRevision + 1);
    expect(() => state.setRequirementStatus(binding(state), 'r1', 'blocked')).toThrow(/blocker/);
    state.setRequirementStatus(binding(state), 'r1', 'blocked', 'Need consumer input');
    expect(state.inspect().goal?.ledger[0].blocker).toBe('Need consumer input');
    state.setRequirementStatus(binding(state), 'r1', 'verified');
    expect(state.inspect().goal?.ledger[0].blocker).toBeUndefined();
    state.removeEvidence(binding(state), 'r1', 'e1');
    expect(state.inspect().goal?.ledger[0]).toMatchObject({ status: 'pending', evidence: [] });
    expect(() => state.removeEvidence(binding(state), 'r1', 'missing')).toThrow(/evidence/);
    expect(() =>
      state.addEvidence(binding(state), 'missing', { id: 'e', reference: 'x', claim: 'x' }),
    ).toThrow(/requirement/);
    state.resetLedger(binding(state));
    expect(state.inspect().goal?.ledger).toEqual([]);
  });

  it('bounds requirement/evidence counts and serialized UTF-8 ledger bytes', () => {
    const { state, session } = fixture();
    state.create('Outcome');
    state.initializeRequirements(
      binding(state),
      Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, criterion: 'Pass' })),
    );
    expect(() => state.upsertRequirement(binding(state), { id: 'r51', criterion: 'Pass' })).toThrow(
      /50/,
    );
    for (let i = 0; i < 20; i++)
      state.addEvidence(binding(state), 'r0', { id: `e${i}`, reference: 'ref', claim: 'Pass' });
    expect(() =>
      state.addEvidence(binding(state), 'r0', { id: 'e21', reference: 'ref', claim: 'Pass' }),
    ).toThrow(/20/);
    const before = JSON.stringify(session.getEntries());
    expect(() =>
      state.upsertRequirement(binding(state), { id: 'large', criterion: 'é'.repeat(8192) }),
    ).toThrow();
    expect(JSON.stringify(session.getEntries())).toBe(before);
    state.resetLedger(binding(state));
    state.upsertRequirement(binding(state), { id: 'r', criterion: 'é'.repeat(8100) });
    expect(Buffer.byteLength(JSON.stringify(state.inspect().goal?.ledger))).toBeLessThanOrEqual(
      16384,
    );
    expect(() =>
      state.addEvidence(binding(state), 'r', { id: 'e', reference: 'ref', claim: 'é'.repeat(100) }),
    ).toThrow(/16384/);
    state.resetLedger(binding(state));
    const overhead = Buffer.byteLength(
      JSON.stringify([{ id: 'exact', criterion: '', status: 'pending', evidence: [] }]),
    );
    state.upsertRequirement(binding(state), {
      id: 'exact',
      criterion: 'x'.repeat(16384 - overhead),
    });
    expect(Buffer.byteLength(JSON.stringify(state.inspect().goal?.ledger))).toBe(16384);
    expect(() =>
      state.upsertRequirement(binding(state), {
        id: 'exact',
        criterion: 'x'.repeat(16385 - overhead),
      }),
    ).toThrow(/16384/);
  });

  it('rejects empty/duplicate initialization and duplicate evidence without losing history', () => {
    const { state } = fixture();
    state.create('Outcome');
    expect(() => state.initializeRequirements(binding(state), [])).toThrow();
    expect(() =>
      state.initializeRequirements(binding(state), [
        { id: 'r', criterion: 'Pass' },
        { id: 'r', criterion: 'Other' },
      ]),
    ).toThrow(/duplicate/);
    state.upsertRequirement(binding(state), { id: 'r', criterion: 'Pass' });
    expect(() =>
      state.initializeRequirements(binding(state), [{ id: 'other', criterion: 'Pass' }]),
    ).toThrow(/empty/);
    state.addEvidence(binding(state), 'r', { id: 'e', reference: 'ref', claim: 'Pass' });
    expect(() =>
      state.addEvidence(binding(state), 'r', { id: 'e', reference: 'ref', claim: 'Pass' }),
    ).toThrow(/duplicate/);
    const before = state.inspect();
    state.upsertRequirement(binding(state), { id: 'r', criterion: 'Pass' });
    expect(state.inspect()).toEqual(before);
    expect(() =>
      state.upsertRequirement(binding(state), { id: 'empty', criterion: ' ' }),
    ).toThrow();
  });
});

describe('latest assessment storage, not classifiers', () => {
  it('caches unchanged reviews and preserves refusals across settings/fallback and replay', () => {
    const { state, session } = fixture();
    evidenced(state);
    const ticket = state.beginReview('evidence', 'inputs-sha', 'profile-v1');
    expect(
      state.recordReview(ticket, { outcome: 'uncertain', diagnostic: 'Missing inspected result' }),
    ).toBe(true);
    expect(state.cachedReview('evidence', 'inputs-sha', 'profile-v1')?.outcome).toBe('uncertain');
    expect(state.cachedReview('evidence', 'different-input', 'profile-v1')).toBeNull();
    const unchanged = state.inspect();
    state.setRequirementStatus(binding(state), 'r1', 'verified');
    expect(state.inspect()).toEqual(unchanged);
    expect(state.hasApplicableRefusal()).toBe(true);
    state.updateSettings(binding(state), { classifiersEnabled: false });
    expect(state.cachedReview('evidence', 'inputs-sha', 'disabled')).toBeNull();
    expect(state.hasApplicableRefusal()).toBe(true);
    const failedCall = state.beginReview('evidence', 'inputs-sha', 'disabled');
    expect(() =>
      state.recordReview(failedCall, {
        outcome: 'unavailable',
        diagnostic: 'No classifier',
      } as never),
    ).toThrow(/assessment/);
    expect(state.hasApplicableRefusal()).toBe(true);
    expect(() => state.recordTerminal(binding(state), 'complete')).toThrow(/review/);
    state.restore(session, 'resume');
    expect(state.hasApplicableRefusal()).toBe(true);
    const explicit = state.beginReview('evidence', 'inputs-sha', 'profile-v1');
    state.recordReview(explicit, {
      outcome: 'sufficient',
      diagnostic: 'Adequate supplied context',
    });
    expect(state.hasApplicableRefusal()).toBe(false);
    expect(state.inspect().goal?.ledger[0].status).toBe('verified');
    state.recordTerminal(binding(state), 'complete');
  });

  it('invalidates only relevant reviews and rejects stale/superseded/session tickets', () => {
    const { state, session } = fixture();
    evidenced(state);
    state.recordReview(state.beginReview('criteria', 'criteria', 'profile'), {
      outcome: 'sufficient',
      diagnostic: 'Observable criteria',
    });
    const stale = state.beginReview('evidence', 'evidence', 'profile');
    state.addEvidence(binding(state), 'r1', {
      id: 'e2',
      reference: 'ref',
      claim: 'Supporting claim',
    });
    expect(state.recordReview(stale, { outcome: 'sufficient', diagnostic: 'Late answer' })).toBe(
      false,
    );
    expect(state.cachedReview('criteria', 'criteria', 'profile')).not.toBeNull();
    const first = state.beginReview('evidence', 'evidence', 'profile');
    const second = state.beginReview('evidence', 'evidence', 'profile');
    expect(state.recordReview(first, { outcome: 'sufficient', diagnostic: 'Superseded' })).toBe(
      false,
    );
    expect(
      state.recordReview(second, { outcome: 'insufficient', diagnostic: 'Not adequate' }),
    ).toBe(true);
    state.upsertRequirement(binding(state), { id: 'r1', criterion: 'Material change' });
    expect(state.cachedReview('criteria', 'criteria', 'profile')).toBeNull();
    expect(state.hasApplicableRefusal()).toBe(false);
    const previousSession = state.beginReview('criteria', 'criteria', 'profile');
    state.restore(SessionManager.inMemory(), 'new');
    expect(
      state.recordReview(previousSession, { outcome: 'sufficient', diagnostic: 'Wrong session' }),
    ).toBe(false);
    state.restore(session, 'resume');
    expect(
      state.recordReview(previousSession, { outcome: 'sufficient', diagnostic: 'Old binding' }),
    ).toBe(false);
    state.detach();
    expect(() => state.create('Detached')).toThrow(/session/);
  });
});

describe('ordinary replay and audit safety', () => {
  it('ignores legacy data and refuses malformed latest state rather than older restoration', () => {
    const { state, session } = fixture();
    session.appendCustomEntry('goal-state', { status: 'active', evidence: ['legacy'] });
    const legacy = JSON.stringify(session.getEntries());
    state.restore(session, 'startup');
    expect(state.inspect().goal).toBeNull();
    expect(JSON.stringify(session.getEntries())).toBe(legacy);
    evidenced(state);
    const valid = state.inspect() as GoalSnapshot;
    session.appendCustomEntry(STATE_ENTRY, {
      ...valid,
      goal: {
        ...valid.goal,
        ledger: [{ id: 'r', criterion: 'Pass', status: 'verified', evidence: [] }],
      },
    });
    state.restore(session, 'resume');
    expect(state.inspect().goal).toBeNull();
    expect(state.diagnostic).toMatch(/malformed/);
    expect(JSON.stringify(session.getEntries().slice(0, 1))).toBe(legacy);
  });

  it('preserves terminal audit, pauses startup, selects branches and survives compaction', () => {
    const { state, session } = fixture();
    evidenced(state);
    const active = session.getLeafId()!;
    state.restore(session, 'startup');
    expect(state.inspect().goal?.status).toBe('paused');
    session.branch(active);
    state.restore(session, 'tree');
    expect(state.inspect().goal?.status).toBe('active');
    session.appendCompaction('Summary, not goal authority', active, 10);
    state.restore(session, 'compact');
    expect(state.inspect().goal?.ledger[0].status).toBe('verified');
    state.recordTerminal(binding(state), 'cleared');
    const terminal = JSON.stringify(session.getEntries());
    state.restore(session, 'reload');
    expect(state.inspect().goal?.status).toBe('cleared');
    state.create('Fresh outcome');
    expect(JSON.stringify(session.getEntries().slice(0, -1))).toBe(terminal);
  });

  it('honors nondefault restore policy without dispatching and retains budget-limited audit', () => {
    for (const restorePolicy of ['restore-idle', 'resume'] as const) {
      const { state, session } = fixture();
      evidenced(state);
      state.updateSettings(binding(state), { restorePolicy });
      const before = state.inspect();
      state.restore(session, 'startup');
      expect(state.inspect()).toEqual(before);
      state.recordTerminal(binding(state), 'budget-limited');
      const audit = JSON.stringify(session.getEntries());
      state.restore(session, 'reload');
      expect(state.inspect().goal?.status).toBe('budget-limited');
      state.create('New goal');
      expect(JSON.stringify(session.getEntries().slice(0, -1))).toBe(audit);
    }
  });

  it('rejects mutation after branch selection changes without a fresh event binding', () => {
    const { state, session } = fixture();
    state.create('Original');
    const original = session.getLeafId()!;
    evidencedAfterCreation(state);
    const ticket = state.beginReview('evidence', 'input', 'config');
    const stale = binding(state);
    session.branch(original);
    expect(() => state.resetLedger(stale)).toThrow(/branch/);
    expect(
      state.recordReview(ticket, { outcome: 'sufficient', diagnostic: 'Late branch result' }),
    ).toBe(false);
    state.restore(session, 'tree');
    expect(state.inspect().goal?.ledger).toEqual([]);
  });

  it('does not publish a successful mutation when Pi append fails', () => {
    const session = SessionManager.inMemory();
    const state = new GoalState(() => {
      throw new Error('Pi append failed');
    });
    state.restore(session, 'new');
    expect(() => state.create('Outcome')).toThrow(/Pi append failed/);
    expect(state.inspect().goal).toBeNull();
  });
});
