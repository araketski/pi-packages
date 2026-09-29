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
