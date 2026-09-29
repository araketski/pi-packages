import { describe, expect, it } from 'vitest';
import { GateProjection } from './projection.js';

// @mara checks REQ-GATES-SCOPED-STATE
// @mara checks REQ-GATES-RECONCILIATION
describe('session gate projection', () => {
  it('keeps restored intent unconfirmed until its owner reports even an empty set', () => {
    const state = new GateProjection('session-a');
    state.remember('tmux-bash', [{ id: 'job-a' }]);
    state.finishDiscovery();
    expect(state.view()).toEqual({
      sessionId: 'session-a',
      readiness: 'unconfirmed',
      owners: [{ owner: 'tmux-bash', state: 'unconfirmed', gates: [{ id: 'job-a' }] }],
    });
    state.confirm('tmux-bash', []);
    expect(state.view().readiness).toBe('confirmed');
    expect(state.view().owners).toEqual([
      { owner: 'tmux-bash', state: 'confirmed', gates: [] },
    ]);
  });

  it('does not let an owner snapshot replace another owner or session', () => {
    const a = new GateProjection('session-a');
    const b = new GateProjection('session-b');
    a.confirm('tmux-bash', [{ id: 'shared' }, { id: 'other' }]);
    a.confirm('goal', [{ id: 'shared' }]);
    b.confirm('tmux-bash', [{ id: 'shared' }]);
    a.confirm('tmux-bash', []);
    expect(a.view().owners).toEqual([
      { owner: 'goal', state: 'confirmed', gates: [{ id: 'shared' }] },
      { owner: 'tmux-bash', state: 'confirmed', gates: [] },
    ]);
    expect(b.view().owners).toEqual([
      { owner: 'tmux-bash', state: 'confirmed', gates: [{ id: 'shared' }] },
    ]);
  });

  it('cannot demote confirmed state when old history is rediscovered', () => {
    const state = new GateProjection('session-a');
    state.confirm('tmux-bash', []);
    state.remember('tmux-bash', [{ id: 'old-job' }]);
    expect(state.view().owners).toEqual([
      { owner: 'tmux-bash', state: 'confirmed', gates: [] },
    ]);
  });

  it('does not mutate known gates when a snapshot is malformed', () => {
    const state = new GateProjection('session-a');
    state.confirm('tmux-bash', [{ id: 'running' }]);
    expect(() => state.confirm('tmux-bash', [{ id: 'duplicate' }, { id: 'duplicate' }])).toThrow();
    expect(() => state.confirm('tmux-bash', [{ id: ' ' }])).toThrow();
    expect(state.view().owners).toEqual([
      { owner: 'tmux-bash', state: 'confirmed', gates: [{ id: 'running' }] },
    ]);
  });

  it('returns copies so observers cannot clear an owner’s gates', () => {
    const state = new GateProjection('session-a');
    state.confirm('tmux-bash', [{ id: 'running' }]);
    const snapshot = state.view();
    snapshot.owners[0].gates.splice(0);
    expect(state.view().owners[0].gates).toEqual([{ id: 'running' }]);
  });
});
