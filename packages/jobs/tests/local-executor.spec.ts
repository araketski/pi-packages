import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ControlAuthority, LaunchRequest, OutputSink } from '@araketski/pi-jobs-core';
import { expect, it } from 'vitest';
import { createLocalExecutor, type LocalHandle } from '../extensions/jobs/local-executor.ts';
import { readProcess, alive } from '../extensions/jobs/linux-evidence.mjs';

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
