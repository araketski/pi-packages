import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ControlAuthority, LaunchRequest, OutputSink } from '@araketski/pi-jobs-core';
import { expect, it, vi } from 'vitest';
import { createLocalExecutor, type LocalHandle } from '../extensions/jobs/local-executor.ts';
import { readProcess, alive, processes } from '../extensions/jobs/linux-evidence.mjs';

const { supervisors } = vi.hoisted(() => ({ supervisors: new Map<number, ChildProcess>() }));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return {
    ...actual,
    fork: (...args: Parameters<typeof actual.fork>) => {
      const child = actual.fork(...args);
      child.once('spawn', () => supervisors.set(child.pid!, child));
      child.once('close', () => supervisors.delete(child.pid!));
      return child;
    },
  };
});

const authority: ControlAuthority = Object.freeze({
  runtimeId: 'R',
  ownerId: 'O',
  generation: 'G',
});
let sequence = 0;
const request = (extra: Partial<LaunchRequest> = {}): LaunchRequest => ({
  identity: {
    runtimeId: 'R',
    ownerId: 'O',
    sessionId: 'S',
    jobId: String(++sequence),
    producerId: 'unknown/external',
  },
  authority,
  awaiting: true,
  delivery: 'automatic',
  lifetime: 'managed',
  ...extra,
});
async function fixture(
  command: string,
  fn: (
    h: LocalHandle,
    executor: ReturnType<typeof createLocalExecutor>,
    output: () => string,
  ) => Promise<void>,
  extra = {},
  req = request(),
) {
  const executor = createLocalExecutor({ authority: () => authority });
  const chunks: Buffer[] = [];
  const sink: OutputSink = {
    append: async ({ bytes }) => {
      chunks.push(Buffer.from(bytes));
    },
  };
  const launched = await executor.launch(
    req,
    { command, cwd: process.cwd(), stopGraceMs: 50, ...extra },
    sink,
  );
  expect(launched.status).toBe('ok');
  if (launched.status !== 'ok') throw Error(launched.reason);
  try {
    await fn(launched.value, executor, () => Buffer.concat(chunks).toString());
  } finally {
    await executor.stop(launched.value, authority, 0);
    await Promise.race([
      executor.completion(launched.value),
      sleep(3000).then(() => {
        throw Error('fixture cleanup unconfirmed');
      }),
    ]);
  }
}
async function until(fn: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await fn()) return;
    await sleep(10);
  }
  throw Error('fixture condition not observed');
}

it.each([
  ['printf quick', 0],
  ['printf nonzero; exit 7', 7],
])('observes actual quick output and exit: %s', async (command, exitCode) => {
  await fixture(command, async (h, e, output) => {
    expect(await e.foreground(h)).toEqual({
      kind: 'completed',
      execution: { state: 'terminal', outcome: { kind: 'exit', exitCode } },
    });
    expect(output()).toBe(exitCode ? 'nonzero' : 'quick');
    expect(await e.observe(h)).toEqual({ state: 'terminal', outcome: { kind: 'exit', exitCode } });
    await e.stop(h, authority, 0);
    expect((await e.observe(h)).state).toBe('terminal');
  });
});
it('reports launch failure separately from nonzero exit', async () => {
  await fixture(
    'printf should-not-run',
    async (h, e, output) => {
      expect(await e.foreground(h)).toMatchObject({
        kind: 'completed',
        execution: {
          state: 'terminal',
          outcome: { kind: 'launch-failed', reason: expect.stringContaining('ENOENT') },
        },
      });
      expect(output()).toBe('');
    },
    { shell: '/missing-owned-fixture-shell' },
  );
});
it('hands off one command/PID, drains output and survives its old foreground signal', async () => {
  const abort = new AbortController();
  const executor = createLocalExecutor({ authority: () => authority });
  let output = '';
  const r = await executor.launch(
    request(),
    {
      command: 'printf "pid=%s\\n" "$$"; sleep .2; printf "pid=%s\\n" "$$"; printf tail',
      cwd: process.cwd(),
      foregroundBudgetMs: 80,
    },
    {
      append: async ({ bytes }) => {
        output += Buffer.from(bytes).toString();
      },
    },
    abort.signal,
  );
  expect(r.status).toBe('ok');
  if (r.status !== 'ok') throw Error(r.reason);
  const h = r.value;
  try {
    expect(await executor.foreground(h)).toMatchObject({ kind: 'background' });
    const evidence = executor.evidence(h);
    expect(evidence.supervisor?.startTicks).toBeTruthy();
    expect(evidence.bootId).toBeTruthy();
    abort.abort();
    expect(await executor.completion(h)).toEqual({
      state: 'terminal',
      outcome: { kind: 'exit', exitCode: 0 },
    });
    const pids = [...output.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]));
    expect(pids).toEqual([evidence.commandPid, evidence.commandPid]);
    expect(output.endsWith('tail')).toBe(true);
  } finally {
    await executor.stop(h, authority, 0);
    await executor.completion(h);
  }
});
it('background launch is immediate and has no default execution deadline', async () => {
  const before = Date.now();
  await fixture(
    'sleep .15; printf survived',
    async (h, e, output) => {
      expect(await e.foreground(h)).toMatchObject({ kind: 'background' });
      expect(Date.now() - before).toBeLessThan(100);
      expect((await e.observe(h)).state).toBe('running');
      expect(await e.completion(h)).toEqual({
        state: 'terminal',
        outcome: { kind: 'exit', exitCode: 0 },
      });
      expect(output()).toBe('survived');
    },
    { background: true },
  );
});
it('foreground abort stops owned children gracefully without touching an unrelated owned fixture', async () => {
  const other = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const otherIdentity = readFileSync(`/proc/${other.pid}/stat`, 'utf8');
  const abort = new AbortController();
  const e = createLocalExecutor({ authority: () => authority });
  let output = '';
  const r = await e.launch(
    request(),
    {
      command:
        'trap "printf root-stopped; exit 0" TERM; (trap "printf child-stopped; exit 0" TERM; printf child-ready; while :; do sleep .02; done) & wait',
      cwd: process.cwd(),
      stopGraceMs: 500,
    },
    {
      append: async ({ bytes }) => {
        output += Buffer.from(bytes).toString();
      },
    },
    abort.signal,
  );
  expect(r.status).toBe('ok');
  if (r.status !== 'ok') throw Error(r.reason);
  try {
    await until(() => output.includes('child-ready'));
    abort.abort();
    expect(await e.foreground(r.value)).toMatchObject({ kind: 'completed' });
    expect((await e.completion(r.value)).state).toBe('terminal');
    expect(output).toContain('child-stopped');
    expect(
      readFileSync(`/proc/${other.pid}/stat`, 'utf8').split(')')[1].split(' ').slice(19, 21),
    ).toEqual(otherIdentity.split(')')[1].split(' ').slice(19, 21));
    expect(other.exitCode).toBeNull();
  } finally {
    await e.stop(r.value, authority, 0);
    await e.completion(r.value);
    // This is a directly spawned fixture ChildProcess, not a PID from product observations.
    other.kill('SIGKILL');
    await new Promise<void>((resolve) => other.once('close', () => resolve()));
  }
});
it('escalates an owned group only after configured grace and verifies death', async () => {
  await fixture(
    'trap "" TERM; printf ready; while :; do sleep .1; done',
    async (h, e, output) => {
      await until(() => output().includes('ready'));
      const before = Date.now();
      expect(await e.stop(h, authority, 120)).toEqual({ status: 'ok', value: { requested: true } });
      expect((await e.observe(h)).state).toBe('running');
      expect(await e.completion(h)).toEqual({
        state: 'terminal',
        outcome: { kind: 'terminated', signal: 'SIGKILL' },
      });
      expect(Date.now() - before).toBeGreaterThanOrEqual(110);
      expect(e.evidence(h).remainingLiveGroup).toEqual([]);
    },
    { background: true },
  );
});
it('explicit hard timeout uses owned stop/escalation rather than foreground handoff', async () => {
  await fixture(
    'trap "" TERM; printf ready; while :; do sleep .1; done',
    async (h, e) => {
      expect(await e.foreground(h)).toMatchObject({ kind: 'background' });
      expect(await e.completion(h)).toMatchObject({
        state: 'terminal',
        outcome: { kind: 'terminated' },
      });
    },
    { background: true },
    request({ hardTimeoutMs: 150 }),
  );
});
it('denies copied/stale authority, foreign handles, persistent local lifetime and invalid timing without launching', async () => {
  let current = authority;
  const e = createLocalExecutor({ authority: () => current });
  const sink = { append: async () => {} };
  expect(
    await e.launch(
      request({ authority: { ...authority } }),
      { command: 'true', cwd: process.cwd() },
      sink,
    ),
  ).toMatchObject({ status: 'denied' });
  expect(
    await e.launch(
      request({ lifetime: 'persistent' }),
      { command: 'true', cwd: process.cwd() },
      sink,
    ),
  ).toMatchObject({ status: 'unsupported' });
  expect(
    await e.launch(request({ hardTimeoutMs: -1 }), { command: 'true', cwd: process.cwd() }, sink),
  ).toMatchObject({ status: 'invalid' });
  await fixture(
    'sleep .1',
    async (h, owner) => {
      expect(await e.stop(h, authority, 0)).toMatchObject({ status: 'denied' });
      expect(await owner.stop(h, { ...authority }, 0)).toMatchObject({ status: 'denied' });
    },
    { background: true },
  );
  const r = await e.launch(
    request(),
    { command: 'sleep .2', cwd: process.cwd(), background: true },
    sink,
  );
  if (r.status !== 'ok') throw Error(r.reason);
  current = Object.freeze({ ...authority, generation: 'new' });
  try {
    expect(await e.stop(r.value, authority, 0)).toMatchObject({ status: 'denied' });
    await e.completion(r.value);
  } finally {
    current = authority;
    await e.stop(r.value, authority, 0);
    await e.completion(r.value);
  }
});
it('reports an escaped pipe-holding child as unknown without waiting for its pipes or signalling it', async () => {
  const escapedCode = 'console.log("escaped-ready");setTimeout(()=>{},1400)';
  const script = `const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e",${JSON.stringify(escapedCode)}],{detached:true,stdio:"inherit"});child.unref();setTimeout(()=>{},250);`;
  const command = `${JSON.stringify(process.execPath)} -e '${script.replaceAll("'", "'\\''")}'`;
  await fixture(
    command,
    async (h, e, output) => {
      await until(() => output().includes('escaped-ready') && e.evidence(h).escaped.length > 0);
      const escaped = e.evidence(h).escaped[0];
      try {
        const observation = await Promise.race([
          e.completion(h),
          sleep(500).then(() => ({ state: 'still-waiting' })),
        ]);
        expect(observation).toMatchObject({ state: 'unknown' });
        expect(readProcess(escaped.pid)?.startTicks).toBe(escaped.startTicks);
        expect(alive(readProcess(escaped.pid)!)).toBe(true);
        expect(await e.stop(h, authority, 0)).not.toMatchObject({
          status: 'ok',
          value: { confirmed: true },
        });
      } finally {
        // The fixture child has a bounded self-exit. Never signal an escaped numeric PID.
        await until(() => {
          const p = readProcess(escaped.pid);
          return !p || p.startTicks !== escaped.startTicks || !alive(p);
        });
      }
    },
    { background: true },
  );
});

it('never downgrades verified termination while a slow output sink is flushing', async () => {
  const e = createLocalExecutor({ authority: () => authority });
  let started = false;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const r = await e.launch(
    request(),
    {
      command:
        'trap "exit 0" TERM; printf ready; head -c 4000000 /dev/zero; while :; do sleep .1; done',
      cwd: process.cwd(),
    },
    {
      append: async () => {
        started = true;
        await barrier;
      },
    },
  );
  if (r.status !== 'ok') throw Error(r.reason);
  try {
    await until(() => started);
    await sleep(50); // Fill the bounded pipe/read buffers behind the blocked sink.
    await e.stop(r.value, authority, 50);
    await until(async () => (await e.observe(r.value)).state === 'terminal');
    let settled = false;
    void e.completion(r.value).then(() => {
      settled = true;
    });
    await sleep(1150);
    expect(await e.observe(r.value)).toEqual({
      state: 'terminal',
      outcome: { kind: 'exit', exitCode: 0 },
    });
    expect(settled).toBe(false);
    release();
    expect(await e.completion(r.value)).toEqual({
      state: 'terminal',
      outcome: { kind: 'exit', exitCode: 0 },
    });
  } finally {
    release();
    await e.stop(r.value, authority, 0);
    await e.completion(r.value);
  }
});

it('surfaces unexpected supervisor loss even while an observed escaped child holds output pipes', async () => {
  const escapedCode = 'console.log("escaped-loss-ready");setTimeout(()=>{},1400)';
  const script = `const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e",${JSON.stringify(escapedCode)}],{detached:true,stdio:"inherit"});child.unref();setTimeout(()=>{},250);`;
  await fixture(
    `${JSON.stringify(process.execPath)} -e '${script}'`,
    async (h, e, output) => {
      await until(
        () => output().includes('escaped-loss-ready') && e.evidence(h).escaped.length > 0,
      );
      const evidence = e.evidence(h);
      const escaped = evidence.escaped[0];
      const supervisor = supervisors.get(evidence.supervisor!.pid);
      try {
        expect(supervisor).toBeDefined();
        expect(readProcess(supervisor!.pid!)?.startTicks).toBe(evidence.supervisor!.startTicks);
        // Signal only the captured, directly spawned fixture ChildProcess, not a copied numeric PID.
        expect(supervisor!.kill('SIGKILL')).toBe(true);
        await until(() => supervisor!.signalCode === 'SIGKILL');
        expect(await e.observe(h)).toMatchObject({ state: 'unknown' });
        expect(
          await Promise.race([
            e.completion(h),
            sleep(400).then(() => ({ state: 'still-waiting' })),
          ]),
        ).toMatchObject({ state: 'unknown' });
      } finally {
        await until(() => {
          const p = readProcess(escaped.pid);
          return !p || p.startTicks !== escaped.startTicks || !alive(p);
        });
      }
    },
    { background: true },
  );
});

it('verifies forced group death before waiting for a blocked output sink', async () => {
  const e = createLocalExecutor({ authority: () => authority });
  let started = false;
  let release!: () => void;
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const r = await e.launch(
    request(),
    {
      command: 'trap "" TERM; printf ready; head -c 4000000 /dev/zero; while :; do sleep .1; done',
      cwd: process.cwd(),
    },
    {
      append: async () => {
        started = true;
        await barrier;
      },
    },
  );
  if (r.status !== 'ok') throw Error(r.reason);
  try {
    await until(() => started);
    await sleep(50);
    const leader = e.evidence(r.value).supervisor!;
    await e.stop(r.value, authority, 50);
    await until(() => supervisors.get(leader.pid)?.signalCode === 'SIGKILL');
    await sleep(1100);
    expect(
      processes().filter(
        (p) => p.group === leader.group && p.session === leader.session && alive(p),
      ),
    ).toEqual([]);
    expect(await e.observe(r.value)).toEqual({
      state: 'terminal',
      outcome: { kind: 'terminated', signal: 'SIGKILL' },
    });
    let settled = false;
    void e.completion(r.value).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    expect(await e.foreground(r.value)).toMatchObject({
      kind: 'completed',
      execution: { state: 'terminal', outcome: { kind: 'terminated', signal: 'SIGKILL' } },
    });
    expect(await e.completion(r.value)).toEqual({
      state: 'terminal',
      outcome: { kind: 'terminated', signal: 'SIGKILL' },
    });
  } finally {
    release();
    await e.stop(r.value, authority, 0);
    await e.completion(r.value);
  }
});

it('never reports completion while a repeatedly forked confined child is still alive', async () => {
  for (let i = 0; i < 16; i++)
    await fixture(
      `/bin/bash -c 'sleep .050; sleep .2 >/dev/null 2>&1 &' & exit 0`,
      async (h, e) => {
        const leader = await (async () => {
          await until(() => !!e.evidence(h).supervisor);
          return e.evidence(h).supervisor!;
        })();
        try {
          expect(await e.completion(h)).toEqual({
            state: 'terminal',
            outcome: { kind: 'exit', exitCode: 0 },
          });
          await sleep(20);
          expect(
            processes().filter(
              (p) => p.group === leader.group && p.session === leader.session && alive(p),
            ),
          ).toEqual([]);
        } finally {
          // Every test child is bounded; verify actual group cleanup even if the assertion fails.
          await until(
            () =>
              !processes().some(
                (p) => p.group === leader.group && p.session === leader.session && alive(p),
              ),
          );
        }
      },
      { background: true },
    );
}, 15000);

it('does not treat a stop request as proof that an unexpected supervisor death killed the command', async () => {
  await fixture(
    'trap "" TERM; printf ready; sleep .5; exit 7',
    async (h, e, output) => {
      await until(() => output().includes('ready'));
      const leader = e.evidence(h).supervisor!;
      const supervisor = supervisors.get(leader.pid)!;
      try {
        expect(await e.stop(h, authority, 5000)).toMatchObject({ status: 'ok' });
        expect(readProcess(leader.pid)?.startTicks).toBe(leader.startTicks);
        expect(supervisor.kill('SIGKILL')).toBe(true);
        expect(await e.completion(h)).toMatchObject({ state: 'unknown' });
      } finally {
        await until(
          () =>
            !processes().some(
              (p) => p.group === leader.group && p.session === leader.session && alive(p),
            ),
        );
      }
    },
    { background: true },
  );
});

it('reports actual completion after more than 1024 observed short-lived children', async () => {
  await fixture(
    'for batch in {1..20}; do for i in {1..64}; do sleep .15 & done; wait; done; printf done',
    async (h, e, output) => {
      expect(await e.foreground(h)).toMatchObject({
        kind: 'completed',
        execution: { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } },
      });
      expect(await e.completion(h)).toEqual({
        state: 'terminal',
        outcome: { kind: 'exit', exitCode: 0 },
      });
      expect(output()).toBe('done');
      expect(e.evidence(h)).toMatchObject({ remainingLiveGroup: [], escaped: [] });
    },
    { foregroundBudgetMs: 20000 },
  );
}, 25000);

it('retains the supervisor until a zombie-leader process finishes its worker threads', async () => {
  // pthread_exit is not exposed by Node. The compiler is fixture-only, not a runtime prerequisite.
  const root = mkdtempSync(join(tmpdir(), 'pi-jobs-thread-'));
  const marker = join(root, 'marker');
  const binary = join(root, 'worker');
  try {
    execFileSync('cc', [
      '-pthread',
      fileURLToPath(new URL('./fixtures/threaded-worker.c', import.meta.url)),
      '-o',
      binary,
    ]);
    const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
    await fixture(
      `${quote(binary)} ${quote(marker)} >/dev/null 2>&1 & printf 'worker=%s\\n' "$!"; sleep .15`,
      async (h, e, output) => {
        await until(() => output().includes('worker='));
        const pid = Number(/worker=(\d+)/.exec(output())![1]);
        try {
          await until(() => readProcess(pid)?.state === 'Z');
          const fields = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(/\s+/);
          expect(Number(fields[17])).toBeGreaterThan(1); // Kernel nr_threads includes live member tasks.
          await sleep(250); // The Bash root is finished; the confined worker still executes.
          expect(await e.observe(h)).toMatchObject({ state: 'running' });
          expect(alive(readProcess(e.evidence(h).supervisor!.pid)!)).toBe(true);
          expect(await e.foreground(h)).toMatchObject({
            kind: 'completed',
            execution: { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } },
          });
          expect(existsSync(marker)).toBe(true);
          expect(readFileSync(marker, 'utf8')).toBe('worker done\n');
        } finally {
          await until(() => existsSync(marker)); // The bounded worker self-exits even on a failing assertion.
          await until(() => {
            try {
              const stat = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(/\s+/);
              return stat[0] === 'Z' && Number(stat[17]) === 1;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
              throw error;
            }
          }); // Verify member-task teardown, not a cached adapter result or fixed sleep.
        }
      },
      { foregroundBudgetMs: 4000 },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 10000);

it('serializes stdout/stderr sink appends with bounded stream backpressure', async () => {
  const e = createLocalExecutor({ authority: () => authority });
  let inFlight = 0;
  let peak = 0;
  let bytes = 0;
  const r = await e.launch(
    request(),
    {
      command: 'head -c 200000 /dev/zero & head -c 200000 /dev/zero >&2 & wait',
      cwd: process.cwd(),
    },
    {
      append: async (chunk) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await sleep(3);
        bytes += chunk.bytes.byteLength;
        inFlight--;
      },
    },
  );
  if (r.status !== 'ok') throw Error(r.reason);
  try {
    expect(await e.completion(r.value)).toMatchObject({
      state: 'terminal',
      outcome: { kind: 'exit', exitCode: 0 },
    });
    expect(bytes).toBe(400000);
    expect(peak).toBe(1);
  } finally {
    await e.stop(r.value, authority, 0);
    await e.completion(r.value);
  }
});

it('keeps the real five-second foreground default separate from any hard deadline', async () => {
  const before = Date.now();
  await fixture(
    'printf "pid=%s\\n" "$$"; sleep 5.2; printf "pid=%s\\n" "$$"',
    async (h, e, output) => {
      expect(await e.foreground(h)).toMatchObject({ kind: 'background' });
      expect(Date.now() - before).toBeGreaterThanOrEqual(4900);
      expect((await e.observe(h)).state).toBe('running');
      expect(await e.completion(h)).toEqual({
        state: 'terminal',
        outcome: { kind: 'exit', exitCode: 0 },
      });
      const pids = [...output().matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]));
      expect(pids).toEqual([e.evidence(h).commandPid, e.evidence(h).commandPid]);
    },
  );
}, 7000);

it('uses the real five-second default grace for foreground abort escalation', async () => {
  const e = createLocalExecutor({ authority: () => authority });
  const abort = new AbortController();
  let output = '';
  const r = await e.launch(
    request(),
    { command: 'trap "" TERM; printf ready; while :; do sleep .1; done', cwd: process.cwd() },
    {
      append: async ({ bytes }) => {
        output += Buffer.from(bytes).toString();
      },
    },
    abort.signal,
  );
  if (r.status !== 'ok') throw Error(r.reason);
  try {
    await until(() => output.includes('ready'));
    const before = Date.now();
    abort.abort();
    expect(await e.foreground(r.value)).toMatchObject({
      kind: 'completed',
      execution: { state: 'terminal', outcome: { kind: 'terminated', signal: 'SIGKILL' } },
    });
    expect(Date.now() - before).toBeGreaterThanOrEqual(4900);
  } finally {
    await e.stop(r.value, authority, 0);
    await e.completion(r.value);
  }
}, 7000);

it('drains large output after sink rejection without killing the command or fabricating success', async () => {
  const e = createLocalExecutor({ authority: () => authority });
  const r = await e.launch(
    request(),
    { command: 'head -c 4000000 /dev/zero; exit 3', cwd: process.cwd() },
    {
      append: async () => {
        throw Error('fixture sink failed');
      },
    },
  );
  if (r.status !== 'ok') throw Error(r.reason);
  try {
    expect(await e.completion(r.value)).toEqual({
      state: 'terminal',
      outcome: { kind: 'exit', exitCode: 3 },
    });
    expect(e.diagnostics(r.value)).toContainEqual(expect.stringContaining('fixture sink failed'));
  } finally {
    await e.stop(r.value, authority, 0);
    await e.completion(r.value);
  }
});
