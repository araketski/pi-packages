import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from './index.js';
import { createJobsTestAdapter, createUnknownJobFixture } from './testing.js';
import type { ControlRequest, ExecutionState, JobIdentity, LaunchRequest } from './index.js';
import type { JobsClock } from './lifecycle.js';

const identity: JobIdentity = {
  runtimeId: 'R',
  ownerId: 'O',
  sessionId: 'S',
  jobId: 'J',
  producerId: 'opaque/external',
};
const authority = { runtimeId: 'R', ownerId: 'O', generation: 'G' };
const request: LaunchRequest = {
  identity,
  authority,
  awaiting: true,
  lifetime: 'managed',
  delivery: 'automatic',
};
const control: ControlRequest = { requestId: 'stop-1', job: identity, authority };
const clock: JobsClock = {
  now: () => Date.now(),
  schedule: (callback, ms) => {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};
const terminal: ExecutionState = { state: 'terminal', outcome: { kind: 'exit', exitCode: 7 } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function setup(overrides: Partial<LaunchRequest> = {}) {
  const fake = createJobsTestAdapter(clock);
  let held = authority;
  const lifecycle = core.createJobLifecycle({
    request: { ...request, ...overrides },
    handle: fake.handle,
    adapter: fake.adapter,
    clock,
    startedAtMs: 0,
    authorize: (value) => value.authority === held,
  });
  return {
    fake,
    lifecycle,
    rotate: () => {
      held = { ...authority, generation: 'next' };
    },
  };
}

describe('explicit settings', () => {
  it('resolves defaults and user/project/job precedence without a default deadline', () => {
    expect(core.resolveJobsLifecycleSettings()).toEqual({
      graceMs: 5000,
      foregroundBudgetMs: 5000,
      pollIntervalMs: 100,
      awaiting: true,
      lifetime: 'managed',
      delivery: 'automatic',
    });
    expect(
      core.resolveJobsLifecycleSettings(
        { graceMs: 90, hardTimeoutMs: 1000 },
        { graceMs: 80, awaiting: false },
        { graceMs: 70, hardTimeoutMs: null },
      ),
    ).toMatchObject({ graceMs: 70, awaiting: false });
    expect(
      core.resolveJobsLifecycleSettings({ hardTimeoutMs: 1000 }, {}, { hardTimeoutMs: null }),
    ).not.toHaveProperty('hardTimeoutMs');
  });
  it.each([
    { graceMs: -1 },
    { hardTimeoutMs: NaN },
    { pollIntervalMs: 0 },
    { foregroundBudgetMs: 0.5 },
    { hardTimeoutMs: 2 ** 31 },
    { quotaBytes: 10 },
  ])('rejects invalid settings %j', (value) => {
    expect(() => core.resolveJobsLifecycleSettings(value)).toThrow(/Invalid/);
  });
});

describe('execution and owner control', () => {
  it('retains full identity and unknown/running/terminal state, with terminal absorbing', async () => {
    const { fake, lifecycle } = setup();
    expect(await lifecycle.inspect(identity)).toMatchObject({
      status: 'ok',
      value: { identity, execution: { state: 'unknown' } },
    });
    fake.setExecution({ state: 'running' });
    expect(await lifecycle.inspect(identity)).toMatchObject({
      value: { execution: { state: 'running' } },
    });
    fake.setExecution(terminal);
    expect(await lifecycle.inspect(identity)).toMatchObject({ value: { execution: terminal } });
    fake.setExecution({ state: 'unknown', reason: 'stale' });
    expect(await lifecycle.inspect(identity)).toMatchObject({ value: { execution: terminal } });
    expect(vi.getTimerCount()).toBe(0);
    lifecycle.dispose();
  });
  it.each([
    { state: 'terminal', outcome: { kind: 'terminated', signal: 'SIGTERM' } },
    { state: 'terminal', outcome: { kind: 'launch-failed', reason: 'not executable' } },
  ] satisfies ExecutionState[])('preserves actual observed outcome %j', async (state) => {
    const { fake, lifecycle } = setup();
    fake.setExecution(state);
    expect(await lifecycle.stop(control)).toEqual({
      status: 'ok',
      value: { state: 'already-terminal', execution: state },
    });
    expect(fake.stopCalls).toHaveLength(0);
    expect(lifecycle.stopIntent()).toBeUndefined();
    lifecycle.dispose();
  });
  it('completion wins cancellation before and after stop admission without relabeling', async () => {
    const a = setup();
    a.fake.setExecution(terminal);
    expect(await a.lifecycle.stop(control, 'foreground-cancel')).toMatchObject({
      value: { state: 'already-terminal' },
    });
    expect(a.fake.stopCalls).toHaveLength(0);
    a.lifecycle.dispose();
    const b = setup();
    b.fake.setExecution({ state: 'running' });
    expect(await b.lifecycle.stop(control, 'foreground-cancel')).toMatchObject({
      value: { state: 'requested' },
    });
    b.fake.setExecution(terminal);
    expect(await b.lifecycle.inspect(identity)).toMatchObject({
      value: { execution: terminal, delivery: { state: 'pending' } },
    });
    expect(b.lifecycle.stopIntent()).toMatchObject({
      reason: 'foreground-cancel',
      state: 'requested',
    });
    b.lifecycle.dispose();
  });
  it('passes default grace, retains requested intent, and adapter escalates only if necessary', async () => {
    const { fake, lifecycle } = setup();
    fake.setExecution({ state: 'running' });
    await lifecycle.stop(control);
    expect(fake.stopCalls).toEqual([{ authority, graceMs: 5000 }]);
    expect(await lifecycle.inspect(identity)).toMatchObject({
      value: { execution: { state: 'running' }, awaiting: true },
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(fake.forcedStops()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.forcedStops()).toBe(1);
    expect(await lifecycle.inspect(identity)).toMatchObject({
      value: { execution: { state: 'terminal', outcome: { kind: 'terminated' } } },
    });
    lifecycle.dispose();
    fake.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('passes configured grace and does not force a gracefully completed execution', async () => {
    const fake = createJobsTestAdapter(clock);
    const lifecycle = core.createJobLifecycle({
      request,
      handle: fake.handle,
      adapter: fake.adapter,
      clock,
      startedAtMs: 0,
      settings: { graceMs: 12 },
      authorize: (r) => r.authority === authority,
    });
    fake.setExecution({ state: 'running' });
    await lifecycle.stop(control);
    expect(fake.stopCalls[0]?.graceMs).toBe(12);
    fake.setExecution(terminal);
    await vi.advanceTimersByTimeAsync(20);
    expect(fake.forcedStops()).toBe(0);
    lifecycle.dispose();
    fake.dispose();
  });
  it('denies copied authority, rotated generation and mismatched full identity without acting', async () => {
    const { fake, lifecycle, rotate } = setup();
    expect(await lifecycle.stop({ ...control, authority: { ...authority } })).toMatchObject({
      status: 'denied',
    });
    for (const key of ['runtimeId', 'ownerId', 'sessionId', 'jobId', 'producerId'] as const) {
      expect(
        await lifecycle.stop({ ...control, job: { ...identity, [key]: 'other' } }),
      ).toMatchObject({ status: 'denied' });
    }
    rotate();
    expect(await lifecycle.setAwaiting({ ...control, awaiting: false })).toMatchObject({
      status: 'denied',
    });
    expect(await lifecycle.stop(control)).toMatchObject({ status: 'denied' });
    expect(fake.stopCalls).toHaveLength(0);
    lifecycle.dispose();
  });
  it('rechecks current authority after asynchronous observation, coalescing observations', async () => {
    const fake = createJobsTestAdapter(clock);
    let valid = true;
    let resolve!: (value: ExecutionState) => void;
    const observe = vi.fn<() => Promise<ExecutionState>>(
      () =>
        new Promise<ExecutionState>((done) => {
          resolve = done;
        }),
    );
    const lifecycle = core.createJobLifecycle({
      request,
      handle: fake.handle,
      adapter: { ...fake.adapter, observe },
      clock,
      startedAtMs: 0,
      authorize: () => valid,
    });
    const first = lifecycle.stop(control);
    const second = lifecycle.inspect(identity);
    await Promise.resolve();
    expect(observe).toHaveBeenCalledTimes(1);
    valid = false;
    resolve({ state: 'running' });
    expect(await first).toMatchObject({ status: 'denied' });
    await second;
    expect(fake.stopCalls).toHaveLength(0);
    lifecycle.dispose();
  });
  it('stop-awaiting preserves unresolved execution, delivery, lifetime and visibility', async () => {
    const { lifecycle } = setup();
    const before = await lifecycle.inspect(identity);
    const after = await lifecycle.setAwaiting({ ...control, awaiting: false });
    expect(after).toMatchObject({
      status: 'ok',
      value: {
        awaiting: false,
        execution: { state: 'unknown' },
        delivery: { state: 'pending' },
        lifetime: 'managed',
        identity,
      },
    });
    expect(before).toMatchObject({ value: { awaiting: true } });
    lifecycle.dispose();
  });
  it('coalesces authorized stop calls and allows retry after unconfirmed admission', async () => {
    const fake = createJobsTestAdapter(clock);
    let calls = 0;
    const lifecycle = core.createJobLifecycle({
      request,
      handle: fake.handle,
      clock,
      startedAtMs: 0,
      authorize: () => true,
      adapter: {
        ...fake.adapter,
        stop: async () => {
          calls++;
          return calls === 1
            ? { status: 'unknown', reason: 'backend disconnected' }
            : { status: 'ok', value: { requested: true } };
        },
      },
    });
    const replies = await Promise.all([
      lifecycle.stop(control),
      lifecycle.stop({ ...control, requestId: 'second' }),
    ]);
    expect(calls).toBe(1);
    expect(replies[0]).toMatchObject({ status: 'unknown' });
    expect(lifecycle.stopIntent()).toMatchObject({ state: 'unconfirmed' });
    await lifecycle.stop(control);
    await lifecycle.stop(control);
    expect(calls).toBe(2);
    lifecycle.dispose();
  });
  it('preserves unknown from observation throws and malformed terminal evidence', async () => {
    const fake = createJobsTestAdapter(clock);
    const lifecycle = core.createJobLifecycle({
      request,
      handle: fake.handle,
      clock,
      startedAtMs: 0,
      authorize: () => true,
      adapter: {
        ...fake.adapter,
        observe: async () => {
          throw new Error('gone');
        },
        stop: async () => {
          throw new Error('lost stop');
        },
      },
    });
    expect(await lifecycle.inspect(identity)).toMatchObject({
      value: { execution: { state: 'unknown', reason: expect.stringContaining('gone') } },
    });
    expect(await lifecycle.stop(control)).toMatchObject({ status: 'unknown' });
    expect(lifecycle.stopIntent()).toMatchObject({ state: 'unconfirmed' });
    lifecycle.dispose();
    const malformed = core.createJobLifecycle({
      request,
      handle: fake.handle,
      clock,
      startedAtMs: 0,
      authorize: () => true,
      adapter: {
        ...fake.adapter,
        observe: async () => ({ state: 'terminal', outcome: { kind: 'exit', exitCode: NaN } }),
      },
    });
    expect(await malformed.inspect(identity)).toMatchObject({
      value: { execution: { state: 'unknown' } },
    });
    malformed.dispose();
  });
  it('has no default hard timer, explicit hard timeout uses normal stop, terminal/dispose clean timers', async () => {
    const a = setup();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(a.fake.stopCalls).toHaveLength(0);
    a.lifecycle.dispose();
    vi.setSystemTime(0);
    const b = setup({ hardTimeoutMs: 40 });
    b.fake.setExecution({ state: 'running' });
    await vi.advanceTimersByTimeAsync(39);
    expect(b.fake.stopCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(b.fake.stopCalls).toHaveLength(1);
    expect(b.lifecycle.stopIntent()).toMatchObject({ reason: 'hard-timeout' });
    b.fake.dispose();
    b.lifecycle.dispose();
    expect(vi.getTimerCount()).toBe(0);
    const c = setup({ hardTimeoutMs: 20 });
    c.fake.setExecution(terminal);
    await c.lifecycle.inspect(identity);
    expect(vi.getTimerCount()).toBe(0);
    c.lifecycle.dispose();
  });
  it('uses original start time for recovered deadlines and retains denied timeout diagnostic', async () => {
    vi.setSystemTime(100);
    const { lifecycle, fake, rotate } = setup({ hardTimeoutMs: 20 });
    rotate();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.stopCalls).toHaveLength(0);
    expect(lifecycle.stopIntent()).toMatchObject({
      state: 'unconfirmed',
      reply: { status: 'denied' },
    });
    lifecycle.dispose();
    expect(await lifecycle.inspect(identity)).toMatchObject({ status: 'unavailable' });
  });
});

describe('review race regressions', () => {
  it.each(['explicit', 'hard-timeout'] as const)(
    'hung observation cannot prevent %s stop admission',
    async (mode) => {
      const fake = createJobsTestAdapter(clock);
      let finishObservation!: (state: ExecutionState) => void;
      const observe = vi.fn<() => Promise<ExecutionState>>(
        () =>
          new Promise((resolve) => {
            finishObservation = resolve;
          }),
      );
      const lifecycle = core.createJobLifecycle({
        request: { ...request, ...(mode === 'hard-timeout' ? { hardTimeoutMs: 10 } : {}) },
        handle: fake.handle,
        adapter: { ...fake.adapter, observe },
        clock,
        startedAtMs: 0,
        settings: { pollIntervalMs: 5 },
        authorize: (r) => r.authority === authority,
      });
      const inspection = lifecycle.inspect(identity);
      const stop = mode === 'explicit' ? lifecycle.stop(control) : undefined;
      await vi.advanceTimersByTimeAsync(20);
      expect(fake.stopCalls).toHaveLength(1);
      expect(lifecycle.stopIntent()).toMatchObject({ state: 'requested' });
      expect(await stop).toEqual(
        mode === 'explicit' ? { status: 'ok', value: { state: 'requested' } } : undefined,
      );
      finishObservation(terminal);
      await inspection;
      expect(await lifecycle.inspect(identity)).toMatchObject({ value: { execution: terminal } });
      lifecycle.dispose();
      fake.dispose();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('dispose removes a pending pre-stop observation bound and prevents action', async () => {
    const fake = createJobsTestAdapter(clock);
    const lifecycle = core.createJobLifecycle({
      request,
      handle: fake.handle,
      adapter: { ...fake.adapter, observe: async () => new Promise(() => undefined) },
      clock,
      startedAtMs: 0,
      authorize: () => true,
    });
    const admission = lifecycle.stop(control);
    expect(lifecycle.stopIntent()).toMatchObject({ state: 'unconfirmed' });
    expect(vi.getTimerCount()).toBe(1);
    lifecycle.dispose();
    expect(await admission).toMatchObject({ status: 'unavailable' });
    expect(fake.stopCalls).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    fake.dispose();
  });
  it('a hung any-wait owner does not starve later healthy completion or duplicate hung calls', async () => {
    const hung = { ...identity, jobId: 'hung' };
    let healthyCalls = 0;
    let hungCalls = 0;
    const wait = core.waitForJobs(
      { requestId: 'W', selection: { mode: 'any', jobs: [identity, hung] }, timeoutMs: 50 },
      async (job) => {
        if (job.jobId === 'hung') {
          hungCalls++;
          return new Promise(() => undefined);
        }
        healthyCalls++;
        return {
          status: 'ok',
          value: {
            ...createUnknownJobFixture(job),
            execution: healthyCalls > 1 ? terminal : { state: 'running' },
          },
        };
      },
      { clock, pollIntervalMs: 5 },
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(await wait).toMatchObject({ value: { state: 'completed' } });
    expect(healthyCalls).toBeGreaterThan(1);
    expect(hungCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('all waits preserve terminal execution while accepting later awaiting/delivery/capability status', async () => {
    const b = { ...identity, jobId: 'B' };
    let aCalls = 0;
    const wait = core.waitForJobs(
      { requestId: 'W', selection: { mode: 'all', jobs: [identity, b] }, timeoutMs: 30 },
      async (job) => {
        if (job.jobId === 'J') {
          aCalls++;
          return {
            status: 'ok',
            value: {
              ...createUnknownJobFixture(job),
              execution: aCalls === 1 ? terminal : { state: 'unknown', reason: 'missing' },
              awaiting: aCalls === 1,
              delivery: {
                state: 'pending',
                mode: aCalls === 1 ? 'automatic' : 'next-natural-turn',
              },
              capabilities: {
                stop: false,
                setAwaiting: aCalls > 1,
                setDelivery: false,
                readOutput: false,
                readResult: false,
              },
            },
          };
        }
        return {
          status: 'ok',
          value: {
            ...createUnknownJobFixture(job),
            execution: aCalls > 1 ? terminal : { state: 'running' },
          },
        };
      },
      { clock, pollIntervalMs: 5 },
    );
    await vi.advanceTimersByTimeAsync(30);
    expect(await wait).toMatchObject({
      value: {
        state: 'completed',
        jobs: [
          {
            reply: {
              value: {
                execution: terminal,
                awaiting: false,
                delivery: { mode: 'next-natural-turn' },
                capabilities: { setAwaiting: true },
              },
            },
          },
          expect.anything(),
        ],
      },
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('explicit current-owner routing', () => {
  it('routes complete identities to actual owners and never derives authority from snapshots', async () => {
    const a = setup();
    const other = { ...identity, producerId: 'another-opaque' };
    const b = setup({ identity: other });
    const owners = new Map([
      [JSON.stringify(identity), a.lifecycle],
      [JSON.stringify(other), b.lifecycle],
    ]);
    const router = core.createJobsLifecycleRouter((job) => owners.get(JSON.stringify(job)), {
      clock,
      pollIntervalMs: 1,
    });
    expect(await router.stop({ ...control, authority: { ...authority } })).toMatchObject({
      status: 'denied',
    });
    await router.stop({ ...control, job: other });
    expect(a.fake.stopCalls).toHaveLength(0);
    expect(b.fake.stopCalls).toHaveLength(1);
    expect(await router.inspect({ ...identity, sessionId: 'fork' })).toMatchObject({
      status: 'unknown',
    });
    expect(await router.setAwaiting({ ...control, awaiting: false })).toMatchObject({
      value: { awaiting: false },
    });
    const waited = router.wait({
      requestId: 'routed',
      selection: { mode: 'one', jobs: [identity] },
      timeoutMs: 5,
    });
    await vi.advanceTimersByTimeAsync(5);
    expect(await waited).toMatchObject({ value: { state: 'timed-out' } });
    // A wrong lookup cannot target a different execution.
    const wrong = core.createJobsLifecycleRouter(() => a.lifecycle, { clock });
    expect(await wrong.stop({ ...control, job: other })).toMatchObject({ status: 'denied' });
    expect(await wrong.inspect(other)).toMatchObject({ status: 'unknown' });
    a.lifecycle.dispose();
    b.lifecycle.dispose();
    b.fake.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('non-consuming selected waits', () => {
  it.each(['one', 'any', 'all'] as const)(
    'waits for %s and cleans all timers/listeners',
    async (mode) => {
      const a = setup();
      const b = setup({ identity: { ...identity, jobId: 'B' } });
      const selection: core.WaitSelection =
        mode === 'one'
          ? { mode, jobs: [identity] }
          : { mode, jobs: [identity, { ...identity, jobId: 'B' }] };
      const abort = new AbortController();
      const remove = vi.spyOn(abort.signal, 'removeEventListener');
      const wait = core.waitForJobs(
        { requestId: 'W', selection, signal: abort.signal },
        (job) => (job.jobId === 'J' ? a.lifecycle.inspect(job) : b.lifecycle.inspect(job)),
        { clock, pollIntervalMs: 10 },
      );
      await vi.advanceTimersByTimeAsync(10);
      a.fake.setExecution(terminal);
      await vi.advanceTimersByTimeAsync(10);
      if (mode === 'all') {
        b.fake.setExecution(terminal);
        await vi.advanceTimersByTimeAsync(10);
      }
      expect(await wait).toMatchObject({ status: 'ok', value: { state: 'completed' } });
      expect(a.fake.stopCalls).toHaveLength(0);
      expect(b.fake.stopCalls).toHaveLength(0);
      expect(await a.lifecycle.inspect(identity)).toMatchObject({
        value: { delivery: { state: 'pending' } },
      });
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      a.lifecycle.dispose();
      b.lifecycle.dispose();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('any completes without waiting for another selected owner with hung inspection', async () => {
    const other = { ...identity, jobId: 'hung' };
    const wait = core.waitForJobs(
      { requestId: 'W', selection: { mode: 'any', jobs: [identity, other] }, timeoutMs: 50 },
      async (job) =>
        job.jobId === 'hung'
          ? new Promise(() => undefined)
          : { status: 'ok', value: { ...createUnknownJobFixture(identity), execution: terminal } },
      { clock },
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(await wait).toMatchObject({
      value: {
        state: 'completed',
        jobs: [{ reply: { value: { execution: terminal } } }, { reply: { status: 'unknown' } }],
      },
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('all retains accepted terminal evidence despite a later uncertain owner response', async () => {
    const other = { ...identity, jobId: 'B' };
    let round = 0;
    const wait = core.waitForJobs(
      { requestId: 'W', selection: { mode: 'all', jobs: [identity, other] }, timeoutMs: 30 },
      async (job) => {
        if (job.jobId === 'J') {
          round++;
          return {
            status: 'ok',
            value: {
              ...createUnknownJobFixture(job),
              execution: round === 1 ? terminal : { state: 'unknown', reason: 'owner offline' },
            },
          };
        }
        return {
          status: 'ok',
          value: {
            ...createUnknownJobFixture(job),
            execution: round > 1 ? terminal : { state: 'running' },
          },
        };
      },
      { clock, pollIntervalMs: 10 },
    );
    await vi.advanceTimersByTimeAsync(30);
    expect(await wait).toMatchObject({ value: { state: 'completed' } });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('unknown never completes; timeout returns status without stopping or consuming', async () => {
    const { lifecycle, fake } = setup();
    const wait = core.waitForJobs(
      { requestId: 'W', selection: { mode: 'one', jobs: [identity] }, timeoutMs: 20 },
      lifecycle.inspect,
      { clock },
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(await wait).toMatchObject({
      value: {
        state: 'timed-out',
        jobs: [
          {
            reply: {
              value: {
                execution: { state: 'unknown' },
                delivery: { state: 'pending' },
                awaiting: true,
              },
            },
          },
        ],
      },
    });
    expect(fake.stopCalls).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    lifecycle.dispose();
  });
  it.each(['timeout', 'abort'] as const)(
    'settles on %s even with hung inspection and ignores late callback',
    async (kind) => {
      let done!: (value: core.JobReply<core.JobObservation>) => void;
      const inspect = vi.fn<() => Promise<core.JobReply<core.JobObservation>>>(
        () =>
          new Promise<core.JobReply<core.JobObservation>>((resolve) => {
            done = resolve;
          }),
      );
      const signal = new AbortController();
      const wait = core.waitForJobs(
        {
          requestId: 'W',
          selection: { mode: 'one', jobs: [identity] },
          timeoutMs: 50,
          signal: signal.signal,
        },
        inspect,
        { clock },
      );
      if (kind === 'abort') signal.abort();
      else await vi.advanceTimersByTimeAsync(50);
      const result = await wait;
      expect(result).toMatchObject({
        value: {
          state: kind === 'abort' ? 'cancelled' : 'timed-out',
          jobs: [{ reply: { status: 'unknown' } }],
        },
      });
      done({ status: 'ok', value: { ...createUnknownJobFixture(identity), execution: terminal } });
      await vi.advanceTimersByTimeAsync(1000);
      expect(vi.getTimerCount()).toBe(0);
      expect(inspect).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ value: { jobs: [{ reply: { status: 'unknown' } }] } });
    },
  );
  it('rejects invalid/duplicate/empty/sparse selections and mismatched routing cannot complete', async () => {
    for (const jobs of [
      [],
      [identity, identity],
      Object.assign([] as JobIdentity[], { length: 1 }),
    ]) {
      expect(
        await core.waitForJobs(
          { requestId: 'W', selection: { mode: 'all', jobs } },
          async () => ({ status: 'unknown', reason: 'missing' }),
          { clock },
        ),
      ).toMatchObject({ status: 'invalid' });
    }
    const inspect = async () => ({
      status: 'ok' as const,
      value: {
        ...createUnknownJobFixture({ ...identity, producerId: 'other' }),
        execution: terminal,
      },
    });
    const wait = core.waitForJobs(
      { requestId: 'W', selection: { mode: 'one', jobs: [identity] }, timeoutMs: 10 },
      inspect,
      { clock },
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(await wait).toMatchObject({
      value: { state: 'timed-out', jobs: [{ reply: { status: 'unknown' } }] },
    });
  });
  it('returns cancelled for pre-abort and timeout for zero budget, without inspection', async () => {
    const inspect = vi.fn<(job: JobIdentity) => Promise<core.JobReply<core.JobObservation>>>();
    const abort = new AbortController();
    abort.abort();
    expect(
      await core.waitForJobs(
        { requestId: 'W', selection: { mode: 'one', jobs: [identity] }, signal: abort.signal },
        inspect,
        { clock },
      ),
    ).toMatchObject({ value: { state: 'cancelled' } });
    expect(
      await core.waitForJobs(
        { requestId: 'W', selection: { mode: 'one', jobs: [identity] }, timeoutMs: 0 },
        inspect,
        { clock },
      ),
    ).toMatchObject({ value: { state: 'timed-out' } });
    expect(inspect).not.toHaveBeenCalled();
  });
});
