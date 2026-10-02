import { EventEmitter } from 'node:events';
import {
  STATUS_SET_EVENT,
  STATUS_CLEAR_EVENT,
  STATUS_SNAPSHOT_EVENT,
  STATUS_SNAPSHOT_REQUEST_EVENT,
} from '@araketski/pi-statusline-protocol';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { registerSessionActivity } from '../extensions/session-activity/index.ts';
import type { ActivityPublisher } from '../extensions/session-activity/publisher.ts';
import type { generateActivity } from '../extensions/session-activity/summary.ts';

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;
const fixtures: { dir: string; emit: (type: string, ctx?: ExtensionContext) => Promise<void> }[] =
  [];
afterEach(async () => {
  for (const h of fixtures.splice(0)) {
    await h.emit('session_shutdown');
    rmSync(h.dir, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
const tick = () => new Promise<void>((done) => setImmediate(done));
function harness(mode: ExtensionContext['mode'] = 'tui', available = true) {
  const dir = mkdtempSync(join(tmpdir(), 'activity-extension-'));
  vi.stubEnv('PI_CODING_AGENT_DIR', dir);
  const handlers = new Map<string, Handler>();
  const publisher = {
    available,
    publish: vi.fn<ActivityPublisher['publish']>(async () => true),
    clear: vi.fn<ActivityPublisher['clear']>(async () => true),
    dispose: vi.fn(),
  };
  const generate = vi.fn<typeof generateActivity>(async () => 'Running parser tests');
  const createPublisher = vi.fn(() => publisher);
  const events = new EventEmitter();
  const statuses = new Map<string, string>([['unrelated', 'Keep me']]);
  const set = vi.fn();
  const clear = vi.fn();
  const snapshot = vi.fn();
  events.on(STATUS_SET_EVENT, set);
  events.on(STATUS_CLEAR_EVENT, clear);
  events.on(STATUS_SNAPSHOT_EVENT, snapshot);
  const setStatus = vi.fn((key: string, text: string | undefined) => {
    if (text === undefined) statuses.delete(key);
    else statuses.set(key, text);
  });
  const ctx = {
    mode,
    hasUI: true,
    isIdle: vi.fn(() => true),
    sessionManager: { getSessionId: () => 'root' },
    ui: { notify: vi.fn(), setStatus, theme: { fg: (_color: string, text: string) => text } },
  } as unknown as ExtensionContext;
  const pi = {
    events: {
      emit: (name: string, value: unknown) => events.emit(name, value),
      on: (name: string, listener: (value: unknown) => void) => {
        events.on(name, listener);
        return () => events.off(name, listener);
      },
    },
    on: (type: string, handler: Handler) => {
      handlers.set(type, handler);
    },
    setSessionName: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
  };
  registerSessionActivity(pi as unknown as ExtensionAPI, createPublisher, generate);
  const emit = async (type: string, context = ctx) => {
    await handlers.get(type)?.(
      {
        type,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Checking parser' }],
          stopReason: 'toolUse',
        },
      },
      context,
    );
  };
  fixtures.push({ dir, emit });
  return {
    dir,
    ctx,
    pi,
    emit,
    publisher,
    generate,
    createPublisher,
    events,
    statuses,
    set,
    clear,
    snapshot,
    setStatus,
  };
}
// @mara checks REQ-SESSION-ACTIVITY-ISOLATION
// @mara checks REQ-SESSION-ACTIVITY-CLEANUP
// @mara implements VER-SESSION-ACTIVITY-CONTRACT
it.each(['rpc', 'json', 'print'] as const)(
  'does nothing in %s mode despite inherited Herdr context',
  async (mode) => {
    const h = harness(mode);
    await h.emit('session_start');
    await h.emit('agent_start');
    await h.emit('turn_end');
    await h.emit('agent_settled');
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.publisher.clear).not.toHaveBeenCalled();
    expect(h.publisher.publish).not.toHaveBeenCalled();
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.events.listenerCount(STATUS_SNAPSHOT_REQUEST_EVENT)).toBe(0);
  },
);
// @mara checks REQ-SESSION-ACTIVITY-STATUSLINE
it('reports locally without Herdr, recovers late snapshots and clears/disposes only activity', async () => {
  const h = harness('tui', false);
  await h.emit('session_start');
  await h.emit('agent_start');
  await h.emit('turn_end');
  await tick();
  expect(h.generate).toHaveBeenCalledTimes(1);
  expect(h.statuses.get('activity')).toBe('Running parser tests');
  expect(h.set).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      source: 'session-activity',
      key: 'activity',
      text: 'Running parser tests',
    }),
  );
  h.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, {});
  expect(h.snapshot).toHaveBeenLastCalledWith({
    source: 'session-activity',
    statuses: [expect.objectContaining({ key: 'activity', text: 'Running parser tests' })],
  });
  expect(h.publisher.publish).not.toHaveBeenCalled();
  expect(h.publisher.clear).not.toHaveBeenCalled();
  await h.emit('agent_end');
  expect(h.statuses.has('activity')).toBe(true);
  await h.emit('agent_settled');
  expect(h.statuses.has('activity')).toBe(false);
  expect(h.statuses.get('unrelated')).toBe('Keep me');
  expect(h.clear).toHaveBeenCalledExactlyOnceWith({ source: 'session-activity', key: 'activity' });
  await h.emit('session_shutdown');
  expect(h.events.listenerCount(STATUS_SNAPSHOT_REQUEST_EVENT)).toBe(0);
});
it('publishes and clears locally while Herdr is gated or fails, without duplicate generation', async () => {
  const h = harness();
  let release!: (accepted: boolean) => void;
  h.publisher.publish.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  await h.emit('session_start');
  await h.emit('agent_start');
  await h.emit('turn_end');
  expect(h.statuses.get('activity')).toBe('Running parser tests');
  release(false);
  await tick();
  for (let i = 0; i < 5; i++) await h.emit('turn_end');
  await tick();
  expect(h.generate).toHaveBeenCalledTimes(2);
  expect(h.generate.mock.calls[1]?.[3]).toBe('Running parser tests');
  expect(h.set).toHaveBeenCalledTimes(1);
  expect(h.publisher.publish).toHaveBeenCalledTimes(1);
  h.publisher.clear.mockRejectedValueOnce(new Error('Herdr unavailable'));
  await h.emit('agent_settled');
  expect(h.statuses.has('activity')).toBe(false);
});
it('reports root turns only, clears at final settlement and not at inner agent_end', async () => {
  const h = harness();
  await h.emit('session_start');
  await h.emit('agent_start');
  await h.emit('turn_end', {
    ...h.ctx,
    sessionManager: { getSessionId: () => 'nested' },
  } as unknown as ExtensionContext);
  expect(h.generate).not.toHaveBeenCalled();
  expect(h.setStatus).not.toHaveBeenCalled();
  await h.emit('turn_end');
  await tick();
  expect(h.publisher.publish).toHaveBeenCalledExactlyOnceWith(
    'Running parser tests',
    expect.any(AbortSignal),
  );
  expect(h.statuses.get('activity')).toBe('Running parser tests');
  expect(h.generate).toHaveBeenCalledTimes(1);
  h.publisher.clear.mockClear();
  await h.emit('agent_end');
  expect(h.publisher.clear).not.toHaveBeenCalled();
  await h.emit('agent_settled');
  await tick();
  expect(h.publisher.clear).toHaveBeenCalledTimes(1);
  await h.emit('agent_start');
  await h.emit('turn_end');
  await tick();
  expect(h.generate).toHaveBeenCalledTimes(2);
  expect(h.pi.setSessionName).not.toHaveBeenCalled();
  expect(h.pi.sendMessage).not.toHaveBeenCalled();
  expect(h.pi.registerTool).not.toHaveBeenCalled();
  expect(h.pi.registerCommand).not.toHaveBeenCalled();
});
it('navigation resets and ongoing work summarizes after the next turn, not immediately', async () => {
  const h = harness();
  await h.emit('session_start');
  await h.emit('agent_start');
  await h.emit('turn_end');
  await tick();
  (h.ctx.isIdle as ReturnType<typeof vi.fn>).mockReturnValue(false);
  await h.emit('session_tree');
  expect(h.statuses.has('activity')).toBe(false);
  expect(h.generate).toHaveBeenCalledTimes(1);
  await h.emit('turn_end');
  await tick();
  expect(h.generate).toHaveBeenCalledTimes(2);
});

it('reload rereads configuration, resets ongoing work and rejects the old generation', async () => {
  const h = harness();
  let release!: (value: string) => void;
  h.generate.mockReturnValueOnce(
    new Promise((done) => {
      release = done;
    }),
  );
  await h.emit('session_start');
  await h.emit('agent_start');
  await h.emit('turn_end');
  const oldSignal = h.generate.mock.calls[0]?.[4];
  const nextPublisher = {
    available: true,
    publish: vi.fn<ActivityPublisher['publish']>(async () => true),
    clear: vi.fn<ActivityPublisher['clear']>(async () => true),
    dispose: vi.fn(),
  };
  h.createPublisher.mockReturnValue(nextPublisher);
  writeFileSync(join(h.dir, 'session-activity.json'), JSON.stringify({ intervalTurns: 1 }));
  (h.ctx.isIdle as ReturnType<typeof vi.fn>).mockReturnValue(false);
  await h.emit('session_start');
  expect(oldSignal?.aborted).toBe(true);
  expect(h.generate).toHaveBeenCalledTimes(1);
  await h.emit('turn_end');
  await tick();
  expect(h.generate.mock.calls[1]?.[1].intervalTurns).toBe(1);
  release('Obsolete old activity');
  await tick();
  expect(h.publisher.publish).not.toHaveBeenCalled();
  expect(nextPublisher.publish).toHaveBeenCalledTimes(1);
  expect(h.publisher.dispose).toHaveBeenCalledTimes(1);
  expect(h.events.listenerCount(STATUS_SNAPSHOT_REQUEST_EVENT)).toBe(1);
  h.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, {});
  expect(h.snapshot).toHaveBeenLastCalledWith(
    expect.objectContaining({
      statuses: [expect.objectContaining({ text: 'Running parser tests' })],
    }),
  );
  expect(h.statuses.get('activity')).toBe('Running parser tests');
});
it('still attempts Herdr when local publication throws and disposes the registration', async () => {
  const h = harness();
  h.setStatus.mockImplementationOnce(() => {
    throw new Error('local UI failed');
  });
  await h.emit('session_start');
  await h.emit('agent_start');
  await h.emit('turn_end');
  await tick();
  expect(h.publisher.publish).toHaveBeenCalledExactlyOnceWith(
    'Running parser tests',
    expect.any(AbortSignal),
  );
  expect(h.generate).toHaveBeenCalledTimes(1);
  expect(h.set).not.toHaveBeenCalled();
  await h.emit('session_shutdown');
  expect(h.events.listenerCount(STATUS_SNAPSHOT_REQUEST_EVENT)).toBe(0);
});
it('rejects a late Herdr completion after settlement without restoring local status', async () => {
  const h = harness();
  let release!: (value: boolean) => void;
  h.publisher.publish.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  await h.emit('session_start');
  await h.emit('agent_start');
  await h.emit('turn_end');
  expect(h.statuses.has('activity')).toBe(true);
  await h.emit('agent_settled');
  expect(h.statuses.has('activity')).toBe(false);
  release(true);
  await tick();
  expect(h.set).toHaveBeenCalledTimes(1);
  h.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, {});
  expect(h.snapshot).toHaveBeenLastCalledWith({ source: 'session-activity', statuses: [] });
});
it('keeps local activity cleared after a late generation without Herdr', async () => {
  const h = harness('tui', false);
  let release!: (value: string) => void;
  h.generate.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  await h.emit('session_start');
  await h.emit('agent_start');
  await h.emit('turn_end');
  await h.emit('agent_settled');
  release('Obsolete activity');
  await tick();
  expect(h.setStatus).not.toHaveBeenCalled();
  expect(h.statuses.has('activity')).toBe(false);
});
