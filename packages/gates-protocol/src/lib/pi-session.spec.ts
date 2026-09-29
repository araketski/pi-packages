import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createEventBus, SessionManager } from '@earendil-works/pi-coding-agent';
import { createGateOwner, createGateObserver } from '../index.js';
import type { GateHost } from '../index.js';

const cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function persistentSession() {
  const dir = mkdtempSync(join(process.env.HOME!, '.cache/gates-pi-session-'));
  cleanup.push(dir);
  const manager = SessionManager.create(process.cwd(), dir);
  // Give the persistent fixture a conversation (Pi also persists on a user message).
  manager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'session created' }],
    provider: 'anthropic',
    api: 'anthropic-messages',
    model: 'test',
    stopReason: 'stop',
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  });
  const events = createEventBus();
  const pi: GateHost = {
    events,
    appendEntry: (kind, data) => {
      manager.appendCustomEntry(kind, data);
    },
  };
  return { manager, pi, events };
}

// @mara checks REQ-GATES-SESSION-HISTORY
// @mara checks REQ-GATES-RECONCILIATION
it('reopens a real Pi session with model-invisible historical intent', () => {
  const { manager, pi, events } = persistentSession();
  const file = manager.getSessionFile()!;
  expect(existsSync(file)).toBe(true);
  const ctx = { sessionManager: manager };
  const owner = createGateOwner(pi, 'tmux-bash');
  owner.start(ctx);
  owner.reconcile(ctx, []);
  owner.acquire(ctx, { id: 'job' });
  expect(manager.getEntries().filter((entry) => entry.type === 'custom')).toHaveLength(2);
  expect(manager.buildSessionContext().messages.some((message) => message.role === 'custom')).toBe(
    false,
  );
  owner.close();
  // The live external job does not rewind with the visible Pi transcript.
  manager.resetLeaf();
  manager.appendCustomEntry('other-branch', { note: 'new branch without a gate entry' });
  expect(
    manager
      .getBranch()
      .some((entry) => entry.type === 'custom' && entry.customType === 'araketski.pi-gates/v1'),
  ).toBe(false);

  const reopened = SessionManager.open(file);
  const observer = createGateObserver({ events });
  observer.start({ sessionManager: reopened });
  expect(observer.view().owners).toEqual([
    { owner: 'tmux-bash', state: 'unconfirmed', gates: [{ id: 'job' }] },
  ]);
  const recovered = createGateOwner(
    {
      events,
      appendEntry: (kind, data) => {
        reopened.appendCustomEntry(kind, data);
      },
    },
    'tmux-bash',
  );
  recovered.start({ sessionManager: reopened });
  recovered.reconcile({ sessionManager: reopened }, []);
  expect(observer.view().owners).toEqual([{ owner: 'tmux-bash', state: 'confirmed', gates: [] }]);
  observer.close();
  recovered.close();
});

// @mara checks REQ-GATES-SESSION-HISTORY
it('persists early gate history with the first user message before any assistant reply', () => {
  const dir = mkdtempSync(join(process.env.HOME!, '.cache/gates-pi-session-'));
  cleanup.push(dir);
  const manager = SessionManager.create(process.cwd(), dir);
  const events = createEventBus();
  const owner = createGateOwner(
    {
      events,
      appendEntry: (kind, data) => {
        manager.appendCustomEntry(kind, data);
      },
    },
    'early-owner',
  );
  const observer = createGateObserver({ events });
  try {
    const ctx = { sessionManager: manager };
    owner.start(ctx);
    owner.reconcile(ctx, []);
    owner.acquire(ctx, { id: 'pending' });
    const file = manager.getSessionFile()!;
    expect(existsSync(file)).toBe(false);

    const prompt = { role: 'user' as const, content: 'first prompt', timestamp: Date.now() };
    manager.appendMessage(prompt);
    expect(existsSync(file)).toBe(true);
    owner.close();

    const reopened = SessionManager.open(file);
    expect(reopened.buildSessionContext().messages).toEqual([prompt]);
    observer.start({ sessionManager: reopened });
    expect(observer.view().owners).toEqual([
      { owner: 'early-owner', state: 'unconfirmed', gates: [{ id: 'pending' }] },
    ]);
  } finally {
    owner.close();
    observer.close();
  }
});

it('keeps gate entries inside an ephemeral Pi session without promising recovery', () => {
  const manager = SessionManager.inMemory();
  const events = createEventBus();
  const pi: GateHost = {
    events,
    appendEntry: (kind, data) => {
      manager.appendCustomEntry(kind, data);
    },
  };
  const ctx = { sessionManager: manager };
  const owner = createGateOwner(pi, 'tmux-bash');
  const observer = createGateObserver(pi);
  owner.start(ctx);
  observer.start(ctx);
  observer.finishDiscovery();
  owner.reconcile(ctx, [{ id: 'job' }]);
  expect(observer.view().readiness).toBe('confirmed');
  expect(manager.getSessionFile()).toBeUndefined();
  expect(manager.getEntries().filter((entry) => entry.type === 'custom')).toHaveLength(1);
  expect(manager.buildSessionContext().messages).toEqual([]);
  owner.close();
  observer.close();
});
