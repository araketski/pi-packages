import type { ExtensionContext, TurnEndEvent } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import { ActivityCoordinator } from '../extensions/session-activity/coordinator.ts';
import { defaults, type ActivityConfig } from '../extensions/session-activity/config.ts';
import type { ActivityPublisher } from '../extensions/session-activity/publisher.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const tick = () => new Promise<void>((done) => setImmediate(done));
function harness(intervalTurns = 5) {
  const publisher = {
    available: true as boolean,
    publish: vi.fn<ActivityPublisher['publish']>(async () => true),
    clear: vi.fn<ActivityPublisher['clear']>(async () => true),
    dispose: vi.fn(),
  } satisfies ActivityPublisher;
  const generate = vi.fn(
    async (
      _ctx: ExtensionContext,
      _config: ActivityConfig,
      _digest: string,
      _previous: string | undefined,
      _signal: AbortSignal,
    ) => 'Running parser tests' as string | undefined,
  );
  let id = 'main';
  const ctx = {
    mode: 'tui',
    sessionManager: { getSessionId: () => id },
  } as unknown as ExtensionContext;
  const coordinator = new ActivityCoordinator(publisher, { ...defaults, intervalTurns }, generate);
  const turn = (text = 'Inspecting parser code', stopReason = 'toolUse') => {
    const message = {
      role: 'assistant',
      content: [{ type: 'text', text }],
      stopReason,
    } as TurnEndEvent['message'];
    coordinator.turn(ctx, message);
  };
  coordinator.start(ctx);
  return {
    publisher,
    generate,
    ctx,
    coordinator,
    turn,
    replace: () => {
      id = 'replacement';
    },
  };
}

// @mara checks REQ-SESSION-ACTIVITY-CADENCE
// @mara checks REQ-SESSION-ACTIVITY-PHRASE
// @mara checks REQ-SESSION-ACTIVITY-ASYNC
// @mara checks REQ-SESSION-ACTIVITY-CLEANUP
// @mara implements VER-SESSION-ACTIVITY-CONTRACT
describe('activity coordination', () => {
  it('updates at turns 1, 6, 11 and suppresses unchanged/exact duplicate publication', async () => {
    const h = harness();
    for (let i = 1; i <= 11; i++) {
      h.turn(`turn ${i}`);
      await tick();
    }
    expect(h.generate).toHaveBeenCalledTimes(3);
    expect(h.publisher.publish).toHaveBeenCalledTimes(1);
    expect(h.generate.mock.calls[1]?.[3]).toBe('Running parser tests');
    h.generate.mockResolvedValue(undefined);
    for (let i = 0; i < 5; i++) h.turn();
    await tick();
    expect(h.publisher.publish).toHaveBeenCalledTimes(1);
  });
  it('uses configurable cadence, resets each run and ignores repeated starts before settlement', async () => {
    const h = harness(2);
    h.turn('old run');
    await tick();
    h.coordinator.start(h.ctx);
    h.turn();
    await tick();
    expect(h.generate).toHaveBeenCalledTimes(1);
    h.turn();
    await tick();
    expect(h.generate).toHaveBeenCalledTimes(2);
    await h.coordinator.reset();
    h.coordinator.start(h.ctx);
    h.turn('new run');
    await tick();
    expect(h.generate).toHaveBeenCalledTimes(3);
    expect(h.generate.mock.calls[2]?.[2]).not.toContain('old run');
    expect(h.generate.mock.calls[2]?.[3]).toBeUndefined();
    expect(h.publisher.clear).toHaveBeenCalledTimes(1);
  });
  it('coalesces due updates to the latest digest, publishing the valid earlier result first', async () => {
    const h = harness(1);
    const pending = deferred<string | undefined>();
    h.generate.mockReturnValueOnce(pending.promise);
    h.turn('old activity');
    for (let i = 0; i < 20; i++) h.turn(`latest-${i}`);
    expect(h.generate).toHaveBeenCalledTimes(1);
    pending.resolve('Inspecting parser code');
    await tick();
    expect(h.generate).toHaveBeenCalledTimes(2);
    expect(h.generate.mock.calls[1]?.[2]).toContain('latest-19');
    expect(h.generate.mock.calls[1]?.[2]).not.toContain('old activity');
    expect(h.publisher.publish.mock.calls.map((args) => args[0])).toEqual([
      'Inspecting parser code',
      'Running parser tests',
    ]);
  });
  it('settles without waiting for generation and forbids a late result after reset/replacement', async () => {
    const h = harness();
    const pending = deferred<string | undefined>();
    h.generate.mockReturnValueOnce(pending.promise);
    h.turn();
    const signal = h.generate.mock.calls[0]?.[4];
    h.replace();
    await h.coordinator.reset();
    expect(signal?.aborted).toBe(true);
    pending.resolve('Running obsolete tests');
    await tick();
    expect(h.publisher.publish).not.toHaveBeenCalled();
    expect(h.publisher.clear).toHaveBeenCalledTimes(1);
  });
  it('does not record failed publication and retries only at a normal later interval', async () => {
    const h = harness(1);
    h.publisher.publish.mockResolvedValueOnce(false);
    h.turn();
    await tick();
    expect(h.publisher.publish).toHaveBeenCalledTimes(1);
    h.turn();
    await tick();
    expect(h.publisher.publish).toHaveBeenCalledTimes(2);
    expect(h.generate.mock.calls[1]?.[3]).toBeUndefined();
  });
  it('skips failed/aborted messages and ignores other session contexts', async () => {
    const h = harness();
    h.turn('failed', 'error');
    h.turn('aborted', 'aborted');
    h.replace();
    h.turn();
    await tick();
    expect(h.generate).not.toHaveBeenCalled();
  });
  it('contains background rejection, has no failure retry and stops outside availability', async () => {
    const h = harness(1);
    h.generate.mockRejectedValueOnce(new Error('provider failure'));
    h.turn();
    await tick();
    expect(h.generate).toHaveBeenCalledTimes(1);
    h.publisher.available = false;
    h.turn();
    await tick();
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.publisher.publish).not.toHaveBeenCalled();
  });
});
