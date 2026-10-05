import { afterEach, expect, it, vi } from 'vitest';
import { createForegroundHandoff } from '../extensions/jobs/foreground.ts';

const identity = {
  runtimeId: 'R',
  ownerId: 'O',
  sessionId: 'S',
  jobId: 'J',
  producerId: 'external',
};
const terminal = { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } } as const;
afterEach(() => vi.useRealTimers());

it('defaults to five seconds, detaches abort at handoff and never returns duplicate foreground completion', async () => {
  vi.useFakeTimers();
  const signal = new AbortController();
  const cancel = vi.fn();
  const h = createForegroundHandoff({ identity, signal: signal.signal, cancel });
  let result: unknown;
  void h.result.then((r) => {
    result = r;
  });
  await vi.advanceTimersByTimeAsync(4999);
  expect(result).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(await h.result).toEqual({ kind: 'background', identity });
  signal.abort();
  h.finish(terminal);
  expect(cancel).not.toHaveBeenCalled();
  expect(await h.result).toEqual({ kind: 'background', identity });
});

it('completion before a configured boundary wins; terminal evidence survives late abort', async () => {
  vi.useFakeTimers();
  const signal = new AbortController();
  const cancel = vi.fn();
  const h = createForegroundHandoff({ identity, budgetMs: 25, signal: signal.signal, cancel });
  await vi.advanceTimersByTimeAsync(24);
  h.finish(terminal);
  signal.abort();
  await vi.advanceTimersByTimeAsync(1);
  expect(await h.result).toEqual({ kind: 'completed', execution: terminal });
  expect(cancel).not.toHaveBeenCalled();
});

it('handoff first keeps the eventual outcome separate, and explicit background is immediate', async () => {
  vi.useFakeTimers();
  const h = createForegroundHandoff({ identity, budgetMs: 12, cancel: vi.fn() });
  await vi.advanceTimersByTimeAsync(12);
  h.finish(terminal);
  expect(await h.result).toEqual({ kind: 'background', identity });
  const background = createForegroundHandoff({ identity, background: true, cancel: vi.fn() });
  expect(await background.result).toEqual({ kind: 'background', identity });
});

it('foreground abort suppresses budget handoff and requests cancellation exactly once', async () => {
  vi.useFakeTimers();
  const signal = new AbortController();
  const cancel = vi.fn();
  const h = createForegroundHandoff({ identity, signal: signal.signal, cancel });
  signal.abort();
  expect(cancel).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(6000);
  let settled = false;
  void h.result.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  h.finish(terminal);
  expect(await h.result).toEqual({ kind: 'completed', execution: terminal });
});

it('uncertain stop yields unknown, never completion, and pre-aborted calls request stop rather than handoff', async () => {
  const signal = new AbortController();
  signal.abort();
  const cancel = vi.fn();
  const h = createForegroundHandoff({ identity, background: true, signal: signal.signal, cancel });
  expect(cancel).toHaveBeenCalledOnce();
  h.finish({ state: 'unknown', reason: 'termination not verified' });
  expect(await h.result).toEqual({ kind: 'unknown', reason: 'termination not verified' });
});
