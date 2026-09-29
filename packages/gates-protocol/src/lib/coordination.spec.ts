import { describe, expect, it, vi } from 'vitest';
import { createGateObserver, createGateOwner, GATE_ENTRY_TYPE } from '../index.js';

type Entry = { type: 'custom'; customType: string; data: unknown };

function fixture() {
  const entries: Entry[] = [];
  let sessionId = 'session-a';
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  const emitted: Array<{ channel: string; data: unknown; entries: number }> = [];
  const events = {
    on(channel: string, handler: (data: unknown) => void) {
      if (!handlers.has(channel)) handlers.set(channel, new Set());
      handlers.get(channel)!.add(handler);
      return () => { handlers.get(channel)?.delete(handler); };
    },
    emit(channel: string, data: unknown) {
      emitted.push({ channel, data, entries: entries.length });
      for (const handler of handlers.get(channel) ?? []) handler(data);
    },
  };
  const pi = { events, appendEntry: vi.fn((customType: string, data: unknown) => {
    entries.push({ type: 'custom', customType, data });
  }) };
  const ctx = { sessionManager: {
    getSessionId: () => sessionId,
    getEntries: () => entries,
  } };
  return { entries, emitted, events, pi, ctx, setSession: (id: string) => { sessionId = id; } };
}

// @mara checks REQ-GATES-PENDING-STATE
// @mara checks REQ-GATES-RECONCILIATION
// @mara checks REQ-GATES-SESSION-HISTORY
// @mara checks REQ-GATES-PERSIST-BEFORE-SIGNAL
// @mara checks REQ-GATES-HEALTH-DIAGNOSTICS
describe('gate coordination across Pi extension instances', () => {
  it('keeps a late observer unconfirmed until its owner verifies live work', () => {
    const f = fixture();
    const owner = createGateOwner(f.pi, 'tmux-bash');
    owner.start(f.ctx);
    owner.reconcile(f.ctx, [{ id: 'job-a' }]);
    const observer = createGateObserver(f.pi);
    observer.start(f.ctx);
    expect(observer.view().owners).toEqual([
      { owner: 'tmux-bash', state: 'confirmed', gates: [{ id: 'job-a' }] },
    ]);
    owner.release(f.ctx, 'job-a');
    expect(observer.view().owners[0].gates).toEqual([]);
    expect(f.emitted.filter((event) => (event.data as { kind?: string }).kind === 'snapshot')
      .every((event) => event.entries > 0)).toBe(true);
    expect(f.entries.map((entry) => entry.customType)).toEqual([
      GATE_ENTRY_TYPE, GATE_ENTRY_TYPE,
    ]);
    expect(f.entries.every(({ data }) => !Object.hasOwn(data as object, 'suppressNotice'))).toBe(true);
    owner.close();
    observer.close();
  });

  it('does not mistake restored journal entries for verified current work', () => {
    const f = fixture();
    const owner = createGateOwner(f.pi, 'tmux-bash');
    owner.start(f.ctx);
    owner.reconcile(f.ctx, [{ id: 'old-job' }]);
    owner.close();
    const observer = createGateObserver(f.pi);
    observer.start(f.ctx);
    expect(observer.view().owners).toEqual([
      { owner: 'tmux-bash', state: 'unconfirmed', gates: [{ id: 'old-job' }] },
    ]);
    const reloaded = createGateOwner(f.pi, 'tmux-bash');
    reloaded.start(f.ctx);
    expect(observer.view().owners[0]).toEqual({
      owner: 'tmux-bash', state: 'unconfirmed', gates: [{ id: 'old-job' }],
    });
    reloaded.reconcile(f.ctx, []);
    expect(observer.view().owners).toEqual([
      { owner: 'tmux-bash', state: 'confirmed', gates: [] },
    ]);
    observer.close();
    reloaded.close();
  });

  it('rejects an unjournaled acquisition without telling observers it happened', () => {
    const f = fixture();
    const owner = createGateOwner(f.pi, 'tmux-bash');
    const observer = createGateObserver(f.pi);
    owner.start(f.ctx);
    observer.start(f.ctx);
    owner.reconcile(f.ctx, []);
    const before = f.emitted.length;
    f.pi.appendEntry.mockImplementationOnce(() => { throw new Error('append failed'); });
    expect(() => owner.acquire(f.ctx, { id: 'job' })).toThrow('append failed');
    expect(f.emitted).toHaveLength(before);
    expect(observer.view().owners[0].gates).toEqual([]);
    owner.close();
    observer.close();
  });

  it('rejects a failed release or reconciliation without clearing known gates', () => {
    const f = fixture();
    const owner = createGateOwner(f.pi, 'tmux-bash');
    const observer = createGateObserver(f.pi);
    owner.start(f.ctx);
    owner.reconcile(f.ctx, [{ id: 'running' }]);
    observer.start(f.ctx);
    const before = f.emitted.length;
    f.pi.appendEntry.mockImplementationOnce(() => { throw new Error('append failed'); });
    expect(() => owner.release(f.ctx, 'running')).toThrow('append failed');
    f.pi.appendEntry.mockImplementationOnce(() => { throw new Error('append failed'); });
    expect(() => owner.reconcile(f.ctx, [])).toThrow('append failed');
    expect(f.emitted).toHaveLength(before);
    expect(observer.view().owners[0].gates).toEqual([{ id: 'running' }]);
    observer.close();
    owner.close();
  });

  it('warns when a known owner stops answering without clearing its gate', () => {
    const f = fixture();
    let now = 100;
    const owner = createGateOwner(f.pi, 'tmux-bash');
    const observer = createGateObserver(f.pi, { now: () => now, timeoutMs: 500 });
    owner.start(f.ctx);
    owner.reconcile(f.ctx, [{ id: 'running' }]);
    observer.start(f.ctx);
    owner.close();
    observer.refresh();
    expect(observer.view().owners[0]).toEqual({
      owner: 'tmux-bash', state: 'unconfirmed', gates: [{ id: 'running' }],
    });
    now = 601;
    expect(observer.view().owners[0]).toEqual({
      owner: 'tmux-bash', state: 'unconfirmed', gates: [{ id: 'running' }],
      diagnostics: ['unresponsive'],
    });
    const resumed = createGateOwner(f.pi, 'tmux-bash');
    resumed.start(f.ctx);
    expect(observer.view().owners[0].state).toBe('unconfirmed');
    resumed.reconcile(f.ctx, [{ id: 'running' }]);
    expect(observer.view().owners[0]).toEqual({
      owner: 'tmux-bash', state: 'confirmed', gates: [{ id: 'running' }],
    });
    resumed.close();
    observer.close();
  });

  it('reports only the owner that failed to answer a fresh request', () => {
    const f = fixture();
    let now = 0;
    const a = createGateOwner(f.pi, 'tmux-bash');
    const b = createGateOwner(f.pi, 'other');
    const observer = createGateObserver(f.pi, { now: () => now, timeoutMs: 50 });
    a.start(f.ctx);
    b.start(f.ctx);
    a.reconcile(f.ctx, [{ id: 'job' }]);
    b.reconcile(f.ctx, [{ id: 'job' }]);
    observer.start(f.ctx);
    a.close();
    observer.refresh();
    now = 51;
    expect(observer.view().owners).toEqual([
      { owner: 'other', state: 'confirmed', gates: [{ id: 'job' }] },
      { owner: 'tmux-bash', state: 'unconfirmed', gates: [{ id: 'job' }], diagnostics: ['unresponsive'] },
    ]);
    b.close();
    observer.close();
  });

  it('diagnoses a lease lapse without expiring the awaited work', () => {
    const f = fixture();
    let now = 1_000;
    const owner = createGateOwner(f.pi, 'tmux-bash');
    const observer = createGateObserver(f.pi, { now: () => now, timeoutMs: 100 });
    owner.start(f.ctx);
    owner.reconcile(f.ctx, [{ id: 'running', leaseUntil: 1_500 }]);
    observer.start(f.ctx);
    now = 1_501;
    expect(observer.view().owners[0]).toEqual({
      owner: 'tmux-bash', state: 'confirmed', gates: [{ id: 'running', leaseUntil: 1_500 }],
      diagnostics: ['stale'],
    });
    owner.reconcile(f.ctx, [{ id: 'running', leaseUntil: 2_000 }]);
    expect(observer.view().owners[0]).toEqual({
      owner: 'tmux-bash', state: 'confirmed', gates: [{ id: 'running', leaseUntil: 2_000 }],
    });
    owner.close();
    observer.close();
  });

  it('marks duplicate owner notices as hidden without suppressing journal or live gates', () => {
    const f = fixture();
    const owner = createGateOwner(f.pi, 'tmux-bash', { suppressNotice: true });
    const observer = createGateObserver(f.pi);
    owner.start(f.ctx);
    observer.start(f.ctx);
    owner.reconcile(f.ctx, []);
    owner.acquire(f.ctx, { id: 'job' });
    owner.release(f.ctx, 'job');
    expect(f.entries).toHaveLength(3);
    expect(f.entries.every(({ data }) => (data as { suppressNotice?: boolean }).suppressNotice === true)).toBe(true);
    expect(observer.view().owners).toEqual([
      { owner: 'tmux-bash', state: 'confirmed', gates: [] },
    ]);
    owner.close();
    observer.close();
  });

  it('does not invent completion on session tree navigation', () => {
    const f = fixture();
    const owner = createGateOwner(f.pi, 'tmux-bash');
    const observer = createGateObserver(f.pi);
    owner.start(f.ctx);
    owner.reconcile(f.ctx, [{ id: 'job-a' }]);
    observer.start(f.ctx);
    observer.start(f.ctx); // re-read the entire session, including abandoned branches
    expect(observer.view().owners[0].gates).toEqual([{ id: 'job-a' }]);
    f.setSession('session-b');
    observer.start(f.ctx);
    expect(observer.view().sessionId).toBe('session-b');
    expect(observer.view().owners).toEqual([]);
    observer.close();
    owner.close();
  });
});
