import { describe, expect, it } from 'vitest';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { createJobsSessionRuntime, type JobsPiContext } from './session.js';
import { createCompletionCoordinator } from './delivery.js';
import type { FinalResult, LaunchRequest } from './index.js';

function fixture() {
  const manager = SessionManager.inMemory(process.cwd());
  const output = {
    create: async () => 'memory',
    write: async () => {},
    read: async () => ({ bytes: new Uint8Array(), totalBytes: 0, headBytes: 0, finished: true }),
    remove: async () => {},
  };
  const diagnostics: string[] = [];
  const runtime = createJobsSessionRuntime({
    runtimeId: 'R',
    participantId: 'P',
    inbox: createCompletionCoordinator(),
    output,
    cleanupMs: 5,
    reconciliationMs: 5,
    diagnose: (m) => diagnostics.push(m),
  });
  const ctx: JobsPiContext = {
    sessionManager: manager,
    mode: 'tui',
    isIdle: () => false,
    hasPendingMessages: () => false,
    abort() {},
  };
  const request: LaunchRequest = {
    identity: {
      runtimeId: 'R',
      sessionId: manager.getSessionId(),
      ownerId: 'O',
      producerId: 'external',
      jobId: 'J',
    },
    authority: { runtimeId: 'R', ownerId: 'O', generation: 'owned' },
    awaiting: true,
    lifetime: 'managed',
    delivery: 'automatic',
  };
  const final: FinalResult = {
    identity: { job: request.identity, resultId: 'final' },
    outcome: { kind: 'exit', exitCode: 0 },
    content: 'complete',
  };
  const pi = {
    appendEntry: (type: string, data: unknown) => {
      manager.appendCustomEntry(type, data);
    },
    sendMessage() {},
  };
  return { runtime, manager, ctx, request, final, pi, diagnostics };
}

describe('session binding safety', () => {
  it('preserves an actual completion racing shutdown while the original append boundary remains valid', async () => {
    const f = fixture();
    let finalReply;
    await f.runtime.start(f.pi, f.ctx, 'startup');
    await f.runtime.admit(f.request, {
      cancel: async () => {
        finalReply = await f.runtime.complete(f.final);
      },
      dispose() {},
    });
    await f.runtime.shutdown('quit');
    expect(finalReply).toEqual({ status: 'ok', value: undefined });
    const saved = f.manager
      .getEntries()
      .filter(
        (entry) => entry.type === 'custom' && entry.customType === 'araketski.pi-jobs/storage',
      );
    expect(
      saved.some(
        (entry) =>
          (entry as { data?: { result?: FinalResult } }).data?.result?.identity.resultId ===
          'final',
      ),
    ).toBe(true);
  });
  it('retains live output and completion across the callback-free reload handoff', async () => {
    const f = fixture();
    let invalid = false,
      oldCalls = 0,
      freshCalls = 0;
    await f.runtime.start(
      {
        ...f.pi,
        appendEntry: (type, data) => {
          if (invalid) throw Error('stale callback');
          oldCalls++;
          f.pi.appendEntry(type, data);
        },
      },
      f.ctx,
      'startup',
    );
    await f.runtime.admit(f.request, { cancel: async () => {}, dispose() {} });
    await f.runtime.shutdown('reload');
    invalid = true;
    expect(
      (await f.runtime.capture(f.request.identity, new TextEncoder().encode('late'))).status,
    ).toBe('ok');
    const pending = f.runtime.complete(f.final);
    await Promise.resolve();
    await f.runtime.start(
      {
        ...f.pi,
        appendEntry: (type, data) => {
          freshCalls++;
          f.pi.appendEntry(type, data);
        },
      },
      f.ctx,
      'reload',
    );
    expect((await pending).status).toBe('ok');
    expect(oldCalls).toBe(1);
    expect(freshCalls).toBe(1);
    expect(f.runtime.readResult(f.request.identity)).toEqual({ status: 'ok', value: f.final });
    await f.runtime.shutdown('quit');
  });
  it('bounds owned managed cancellation and rejects late writes while retaining uncertainty', async () => {
    const f = fixture();
    let cancelled = 0,
      disposed = 0;
    await f.runtime.start(f.pi, f.ctx, 'startup');
    await f.runtime.admit(f.request, {
      cancel: async () => {
        cancelled++;
        await new Promise(() => {});
      },
      dispose: () => {
        disposed++;
      },
    });
    const before = performance.now();
    await f.runtime.shutdown('new');
    expect(performance.now() - before).toBeLessThan(200);
    expect(cancelled).toBe(1);
    expect(disposed).toBe(1);
    expect((await f.runtime.complete(f.final)).status).toBe('unavailable');
    expect(f.diagnostics.some((m) => m.includes('unconfirmed'))).toBe(true);
  });
});
