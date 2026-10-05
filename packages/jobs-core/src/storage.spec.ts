import { spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager, truncateHead } from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it } from 'vitest';
import * as core from './index.js';
import { createUnknownJobFixture } from './testing.js';
import type { JobReply, LaunchRequest, JobObservation, FinalResult } from './index.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const job = (jobId = 'J', sessionId = 'S', producerId = 'external/opaque') => ({
  runtimeId: 'R',
  ownerId: 'O',
  sessionId,
  jobId,
  producerId,
});
const launch = (identity = job()): LaunchRequest => ({
  identity,
  authority: { runtimeId: 'R', ownerId: 'O', generation: 'G' },
  awaiting: true,
  delivery: 'automatic',
  lifetime: 'managed',
});
function ok<T>(reply: JobReply<T>): T {
  expect(reply).toHaveProperty('status', 'ok');
  if (reply.status !== 'ok') throw new Error(reply.reason);
  return reply.value;
}
const bytes = (text: string) => new TextEncoder().encode(text);
const text = (value: Uint8Array) => new TextDecoder().decode(value);
async function root() {
  const path = await mkdtemp(join(tmpdir(), 'session-store-'));
  roots.push(path);
  return path;
}
async function setup(extra: Partial<Parameters<typeof core.createSessionJobStorage>[0]> = {}) {
  const outputRoot = await root();
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    maxBytes: 10,
    prefixBytes: 3,
    ...extra,
  });
  const token = ok(await store.jobStore.reserve(launch()));
  return { store, token, sink: ok(store.output(token)), outputRoot };
}
function terminal(identity = job()): JobObservation {
  return {
    ...createUnknownJobFixture(identity),
    execution: { state: 'terminal', outcome: { kind: 'exit', exitCode: 7 } },
    delivery: { mode: 'display-only', state: 'not-required' },
  };
}
function result(identity = job()): FinalResult {
  return {
    identity: { job: identity, resultId: 'final' },
    outcome: { kind: 'exit', exitCode: 7 },
    content: 'Command exited 7.',
  };
}

it('retains exact beginning, rolling tail, offsets and per-stream loss using actual I/O', async () => {
  const { store, sink, outputRoot } = await setup();
  await sink.append({ stream: 'stdout', bytes: bytes('abcDEFG') });
  await sink.append({ stream: 'stderr', bytes: bytes('HIJKLMNO') });
  const captured = ok(await store.readCapturedOutput(job()));
  expect(text(captured.prefix!.bytes)).toBe('abc');
  expect(text(captured.tail!.bytes)).toBe('IJKLMNO');
  expect(captured.tail!.offset).toBe(8);
  expect(captured.totalBytes).toBe(15);
  expect(captured.omittedBytes).toBe(5);
  expect(captured.streamLoss).toEqual({ stdout: 4, stderr: 1, combined: 0 });
  expect(captured.complete).toBe(false);
  expect(captured.prefix!.streams).toEqual(new Uint8Array([1, 1, 1]));
  expect(captured.tail!.streams).toEqual(new Uint8Array(7).fill(2));
  expect((await readdir(outputRoot)).length).toBe(1);
  expect((await stat(join(outputRoot, captured.reference))).size).toBe(4096 + 20);
  expect(ok(await store.readOutput(job())).omittedBytes).toBe(5);
});

it('keeps complete binary output before the bound, including one-byte stream alternation', async () => {
  const { store, sink } = await setup();
  for (let i = 0; i < 10; i++)
    await sink.append({ stream: i % 2 ? 'stderr' : 'stdout', bytes: new Uint8Array([i]) });
  const captured = ok(await store.readCapturedOutput(job()));
  expect(captured.complete).toBe(true);
  expect(captured.omittedBytes).toBe(0);
  expect([...captured.prefix!.bytes, ...captured.tail!.bytes]).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);
  expect([...captured.prefix!.streams, ...captured.tail!.streams]).toEqual([
    1, 2, 1, 2, 1, 2, 1, 2, 1, 2,
  ]);
});

it('bounds fallback and keeps draining after output writes fail without changing execution', async () => {
  const outputRoot = await root();
  const io = core.createOutputArtifactIO(outputRoot);
  let writes = 0;
  const { store, sink } = await setup({
    io: {
      ...io,
      write: async (...args) => {
        if (++writes > 1) throw new Error('disk full');
        await io.write(...args);
      },
    },
  });
  await sink.append({ stream: 'combined', bytes: bytes('abcdefghijk') });
  await sink.append({ stream: 'combined', bytes: bytes('lmnopqrst') });
  const capture = ok(await store.readCapturedOutput(job()));
  expect(capture.availability).toBe('memory-only');
  expect(text(capture.prefix!.bytes)).toBe('abc');
  expect(text(capture.tail!.bytes)).toBe('nopqrst');
  expect(capture.omittedBytes).toBe(10);
  expect(capture.streamLoss).toEqual({ stdout: 0, stderr: 0, combined: 10 });
  expect(capture.diagnostics.join(' ')).toContain('disk full');
  expect(ok(await store.jobStore.read(job())).execution.state).toBe('unknown');
  expect(writes).toBe(2);
});

it('refuses admission on output or tracking setup failure before a caller launches', async () => {
  const outputRoot = await root();
  const io = core.createOutputArtifactIO(outputRoot);
  let starts = 0;
  for (const store of [
    core.createSessionJobStorage({
      sessionId: 'S',
      outputRoot,
      io: {
        ...io,
        write: async () => {
          throw new Error('setup');
        },
      },
    }),
    core.createSessionJobStorage({
      sessionId: 'S',
      outputRoot,
      session: core.createJobsSessionCapability({
        sessionId: 'S',
        persistent: true,
        isCurrent: () => true,
        appendEntry: () => {
          throw new Error('tracking');
        },
        readEntries: () => [],
      }),
    }),
  ]) {
    const reply = await store.jobStore.reserve(launch());
    if (reply.status === 'ok') starts++;
    expect(reply.status).toBe('unavailable');
  }
  expect(starts).toBe(0);
  expect(await readdir(outputRoot)).toEqual([]);
});

it('coalesces delayed writes while live reads and terminal updates keep newer evidence', async () => {
  const outputRoot = await root();
  const io = core.createOutputArtifactIO(outputRoot);
  let release!: () => void;
  let entered!: () => void;
  const entry = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let count = 0;
  const { store, sink, token } = await setup({
    io: {
      ...io,
      write: async (...args) => {
        if (++count === 2) {
          entered();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        await io.write(...args);
      },
    },
  });
  const old = sink.append({ stream: 'stdout', bytes: bytes('abcdefghij') });
  await entry;
  const newer = sink.append({ stream: 'stderr', bytes: bytes('KLMNO') });
  ok(await store.jobStore.save(token, terminal()));
  ok(await store.resultSink.save(result()));
  expect(text(ok(await store.readCapturedOutput(job())).tail!.bytes)).toBe('ijKLMNO');
  release();
  await Promise.all([old, newer]);
  ok(await store.jobStore.save(token, createUnknownJobFixture(job())));
  expect(ok(await store.jobStore.read(job())).execution).toEqual(terminal().execution);
  expect(ok(await store.resultSink.read(result().identity))).toEqual(result());
  expect(count).toBe(3);
  const image = await io.read(ok(await store.inspect(job())).outputReference, 4116);
  expect(image.byteLength).toBe(4116);
});

it('preserves actual Pi 0.99.1 setup buffering, first-user persistence and historical replay outside model context', async () => {
  const base = await root();
  const session = SessionManager.create(base, join(base, 'sessions'));
  const id = session.getSessionId();
  const outputRoot = join(base, 'output');
  const capability = core.createJobsSessionCapability({
    sessionId: id,
    persistent: true,
    isCurrent: () => session.getSessionId() === id,
    appendEntry: (kind, data) => {
      session.appendCustomEntry(kind, data);
    },
    readEntries: () => session.getEntries(),
  });
  const store = core.createSessionJobStorage({
    sessionId: id,
    outputRoot,
    session: capability,
    maxBytes: 10,
    prefixBytes: 3,
  });
  const identity = job('J', id);
  const token = ok(await store.jobStore.reserve(launch(identity)));
  await ok(store.output(token)).append({ stream: 'stdout', bytes: bytes('external log') });
  ok(await store.jobStore.save(token, terminal(identity)));
  ok(await store.resultSink.save(result(identity)));
  const file = session.getSessionFile()!;
  await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(session.buildSessionContext().messages).toEqual([]);
  session.appendMessage({ role: 'user', content: 'first prompt', timestamp: Date.now() });
  expect(await readFile(file, 'utf8')).toContain('Command exited 7.');
  expect(session.getEntries().filter((e) => e.type === 'custom')).toHaveLength(3);
  expect(session.buildSessionContext().messages).toHaveLength(1);
  expect(await readFile(file, 'utf8')).not.toContain('external log');
  const reopened = SessionManager.open(file);
  const fresh = core.createSessionJobStorage({
    sessionId: id,
    outputRoot,
    session: core.createJobsSessionCapability({
      sessionId: id,
      persistent: true,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        reopened.appendCustomEntry(kind, data);
      },
      readEntries: () => reopened.getEntries(),
    }),
  });
  const saved = ok(await fresh.replay());
  expect(saved).toHaveLength(1);
  expect(saved[0].historical).toBe(true);
  expect(saved[0].observation.capabilities.stop).toBe(false);
  expect(ok(await fresh.resultSink.read(result(identity).identity))).toEqual(result(identity));
  expect(ok(await fresh.readCapturedOutput(identity)).omittedBytes).toBe(2);
  expect((await readdir(outputRoot)).every((name) => name.endsWith('.output'))).toBe(true);
});

it('ignores delayed replay over newer admission and never calls invalidated origin callbacks', async () => {
  let release!: (entries: unknown[]) => void;
  let current = 'S';
  const appended: unknown[] = [];
  const capability = core.createJobsSessionCapability({
    sessionId: 'S',
    persistent: true,
    isCurrent: () => current === 'S',
    appendEntry: (_kind, data) => {
      appended.push(data);
    },
    readEntries: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot: await root(),
    session: capability,
    maxBytes: 10,
    prefixBytes: 3,
  });
  const replay = store.replay();
  const token = ok(await store.jobStore.reserve(launch()));
  await ok(store.output(token)).append({ stream: 'stdout', bytes: bytes('abc') });
  release([]);
  expect(ok(await replay)).toHaveLength(1);
  expect(ok(await store.readCapturedOutput(job())).totalBytes).toBe(3);
  capability.invalidate();
  current = 'B';
  const before = appended.length;
  expect((await store.jobStore.save(token, terminal())).status).toBe('unavailable');
  expect(appended).toHaveLength(before);
  expect(ok(await store.jobStore.read(job())).execution.state).toBe('terminal');
  expect(
    store.replaceSessionCapability(
      core.createJobsSessionCapability({
        sessionId: 'B',
        persistent: true,
        isCurrent: () => true,
        appendEntry: () => undefined,
        readEntries: () => [],
      }),
    ).status,
  ).toBe('invalid');
  const fresh = core.createJobsSessionCapability({
    sessionId: 'S',
    persistent: true,
    isCurrent: () => true,
    appendEntry: (_kind, data) => {
      appended.push(data);
    },
    readEntries: () => [],
  });
  ok(store.replaceSessionCapability(fresh));
  ok(await store.jobStore.save(token, terminal()));
  expect(appended.length).toBeGreaterThan(before);
});

it('expires only eligible terminal output, keeps compact results, and cleans no-session artifacts', async () => {
  let now = 100;
  const { store, token, outputRoot } = await setup({ now: () => now, retentionMs: 7 });
  now = 1000;
  expect(ok(await store.expireEligibleOutputs()).expired).toEqual([]);
  const pending = { ...terminal(), delivery: { mode: 'automatic', state: 'pending' } as const };
  ok(await store.jobStore.save(token, pending));
  now = 2000;
  expect(ok(await store.expireEligibleOutputs()).expired).toEqual([]);
  ok(await store.resultSink.save(result()));
  ok(await store.jobStore.save(token, terminal()));
  now += 8;
  expect(ok(await store.readCapturedOutput(job())).availability).toBe('expired');
  expect(await readdir(outputRoot)).toEqual([]);
  expect(ok(await store.resultSink.read(result().identity))).toEqual(result());
  const temporary = await setup();
  await temporary.store.dispose();
  expect(await readdir(temporary.outputRoot)).toEqual([]);
  const memory = SessionManager.inMemory();
  expect(memory.isPersisted()).toBe(false);
});

it('reports missing/corrupt logs separately from saved results', async () => {
  const entries: unknown[] = [];
  const outputRoot = await root();
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId: 'S',
      persistent: true,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        entries.push({ type: 'custom', customType: kind, data });
      },
      readEntries: () => entries,
    });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
  });
  const token = ok(await store.jobStore.reserve(launch()));
  await ok(store.output(token)).append({ stream: 'stdout', bytes: bytes('abc') });
  ok(await store.resultSink.save(result()));
  const ref = ok(await store.inspect(job())).outputReference;
  const fresh = core.createSessionJobStorage({ sessionId: 'S', outputRoot, session: capability() });
  ok(await fresh.replay());
  await writeFile(join(outputRoot, ref), new Uint8Array(4116));
  expect(ok(await fresh.readCapturedOutput(job())).availability).toBe('corrupt');
  await rm(join(outputRoot, ref));
  expect(ok(await fresh.readCapturedOutput(job())).availability).toBe('missing');
  expect(ok(await fresh.resultSink.read(result().identity))).toEqual(result());
});

it('rejects oversized entries/output snapshots and inconsistent result identities before accepting them', async () => {
  const { store, token } = await setup();
  expect((await store.resultSink.save({ ...result(), content: 'x'.repeat(65536) })).status).toBe(
    'invalid',
  );
  expect(
    (
      await store.resultSink.save({
        ...result(),
        output: { text: 'abc', reference: 'log', complete: true, omittedBytes: 0 },
      })
    ).status,
  ).toBe('invalid');
  expect((await store.resultSink.read(result().identity)).status).toBe('unknown');
  ok(await store.jobStore.save(token, terminal()));
  expect(
    (await store.resultSink.save({ ...result(), outcome: { kind: 'exit', exitCode: 0 } })).status,
  ).toBe('invalid');
});

it('allows independent jobs/producers/stores/sessions to exceed the per-job ceiling in aggregate', async () => {
  const outputRoot = await root();
  const first = core.createSessionJobStorage({ sessionId: 'S', outputRoot });
  const second = core.createSessionJobStorage({ sessionId: 'T', outputRoot });
  const identities = [job('one'), job('two', 'S', 'another producer'), job('one', 'T')];
  let total = 0;
  for (const identity of identities) {
    const store = identity.sessionId === 'S' ? first : second;
    const token = ok(await store.jobStore.reserve(launch(identity)));
    await ok(store.output(token)).append({
      stream: 'combined',
      bytes: new Uint8Array(4_000_000).fill(65),
    });
    total += ok(await store.readCapturedOutput(identity)).totalBytes!;
  }
  expect(total).toBe(12_000_000);
  expect(await readdir(outputRoot)).toHaveLength(3);
  await first.dispose();
  await second.dispose();
});

it('decodes contiguous complete UTF-8 output across the prefix/tail seam', async () => {
  const { store, sink } = await setup({ maxBytes: 16, prefixBytes: 3 });
  await sink.append({ stream: 'stdout', bytes: bytes('ab😀c') });
  expect(ok(await store.readOutput(job())).text).toBe('ab😀c');
  expect(ok(await store.readOutput(job())).complete).toBe(true);
});

it('does not describe newer capture as saved while an older disk replacement is delayed', async () => {
  const outputRoot = await root(),
    io = core.createOutputArtifactIO(outputRoot);
  let writes = 0,
    release!: () => void,
    entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const { store, sink } = await setup({
    io: {
      ...io,
      write: async (...args) => {
        if (++writes === 2) {
          entered();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        await io.write(...args);
      },
    },
  });
  const writing = sink.append({ stream: 'stdout', bytes: bytes('abc') });
  await started;
  expect(ok(await store.readCapturedOutput(job())).availability).toBe('memory-only');
  release();
  await writing;
  expect(ok(await store.readCapturedOutput(job())).availability).toBe('saved');
});

it('runs a real child, continues draining through actual filesystem write failure, and preserves its nonzero exit', async () => {
  const outputRoot = await root();
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    maxBytes: 100,
    prefixBytes: 10,
  });
  const token = ok(await store.jobStore.reserve(launch())),
    sink = ok(store.output(token)),
    ref = ok(await store.inspect(job())).outputReference;
  await mkdir(join(outputRoot, `${ref}.tmp`)); // Actual exclusive replacement failure, not a fake disk reply.
  const child = spawn(
    process.execPath,
    [
      '-e',
      "process.stdout.write('A'.repeat(10000));process.stdout.write('Z'.repeat(1000));process.exitCode=7",
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const exit = new Promise<number | null>((resolve) => child.once('close', resolve));
  for await (const chunk of child.stdout)
    await sink.append({ stream: 'stdout', bytes: new Uint8Array(chunk) });
  expect(await exit).toBe(7);
  ok(await store.resultSink.save(result()));
  const captured = ok(await store.readCapturedOutput(job()));
  expect(captured.availability).toBe('memory-only');
  expect(captured.totalBytes).toBe(11000);
  expect(captured.omittedBytes).toBe(10900);
  expect(text(captured.prefix!.bytes)).toBe('A'.repeat(10));
  expect(text(captured.tail!.bytes)).toBe('Z'.repeat(90));
  expect(ok(await store.resultSink.read(result().identity)).outcome).toEqual({
    kind: 'exit',
    exitCode: 7,
  });
});

it('does not launch a real side-effecting child when actual output setup is blocked', async () => {
  const base = await root(),
    blocked = join(base, 'blocked'),
    marker = join(base, 'started');
  await writeFile(blocked, 'not a directory');
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot: blocked,
    maxBytes: 10,
    prefixBytes: 3,
  });
  const admitted = await store.jobStore.reserve(launch());
  if (admitted.status === 'ok')
    spawnSync(process.execPath, [
      '-e',
      "require('node:fs').writeFileSync(process.argv[1],'started')",
      marker,
    ]);
  expect(admitted.status).toBe('unavailable');
  await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('uses actual Pi in-memory custom entries and keeps bounded metadata/results after an after-launch append failure', async () => {
  const manager = SessionManager.inMemory(),
    sessionId = manager.getSessionId(),
    outputRoot = await root();
  let broken = false;
  const capability = core.createJobsSessionCapability({
    sessionId,
    persistent: false,
    isCurrent: () => manager.getSessionId() === sessionId,
    appendEntry: (kind, data) => {
      if (broken) throw new Error('append lost');
      manager.appendCustomEntry(kind, data);
    },
    readEntries: () => manager.getEntries(),
  });
  const identity = job('J', sessionId),
    store = core.createSessionJobStorage({
      sessionId,
      outputRoot,
      session: capability,
      maxBytes: 10,
      prefixBytes: 3,
    });
  const token = ok(await store.jobStore.reserve(launch(identity)));
  await ok(store.output(token)).append({ stream: 'stderr', bytes: bytes('abcdefghijk') });
  broken = true;
  expect((await store.resultSink.save(result(identity))).status).toBe('unavailable');
  expect(ok(await store.inspect(identity)).resumability).toBe('memory-only');
  expect(ok(await store.resultSink.read(result(identity).identity))).toEqual(result(identity));
  expect(manager.getSessionFile()).toBeUndefined();
  expect(manager.buildSessionContext().messages).toEqual([]);
  broken = false;
  ok(await store.resultSink.save(result(identity)));
  const replayed = core.createSessionJobStorage({ sessionId, outputRoot, session: capability });
  expect(ok(await replayed.replay())[0].historical).toBe(true);
  expect(ok(await replayed.resultSink.read(result(identity).identity))).toEqual(result(identity));
  await store.dispose();
  expect(await readdir(outputRoot)).toEqual([]);
  expect(manager.getEntries().filter((entry) => entry.type === 'custom')).toHaveLength(2);
});

it('rejects stale/malformed/forked replay and preserves saved terminal and delivery evidence', async () => {
  const entries: unknown[] = [];
  let now = 100;
  const capability = core.createJobsSessionCapability({
    sessionId: 'S',
    persistent: true,
    isCurrent: () => true,
    appendEntry: (kind, data) => {
      entries.push({ type: 'custom', customType: kind, data });
    },
    readEntries: () => entries,
  });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot: await root(),
    session: capability,
    maxBytes: 10,
    prefixBytes: 3,
    now: () => now,
    retentionMs: 1,
  });
  const token = ok(await store.jobStore.reserve(launch()));
  ok(await store.recordIntent(token, { kind: 'stop-unconfirmed', reason: 'No terminal evidence' }));
  const historical = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot: await root(),
    session: capability,
    now: () => now,
    retentionMs: 1,
  });
  expect(ok(await historical.replay())[0].observation.execution.state).toBe('unknown');
  now += 100;
  expect(ok(await historical.expireEligibleOutputs()).expired).toEqual([]);
  ok(await store.resultSink.save(result()));
  ok(await store.jobStore.save(token, terminal()));
  const final = structuredClone(entries.at(-1)) as { data: Record<string, unknown> };
  entries.push({
    ...final,
    data: { ...final.data, revision: 100, observation: createUnknownJobFixture(job()) },
  });
  entries.push({
    ...final,
    data: {
      ...final.data,
      revision: 101,
      result: { ...result(), outcome: { kind: 'exit', exitCode: new Number(0) } },
    },
  });
  entries.push({
    ...final,
    data: { ...final.data, revision: 102, identity: { ...job(), sessionId: 'fork' } },
  });
  const saved = ok(await historical.replay())[0];
  expect(saved.observation.execution.state).toBe('terminal');
  expect(saved.result).toEqual(result());
  saved.result!.content = 'tampered';
  expect(ok(await historical.resultSink.read(result().identity))).toEqual(result());
});

it('does not inherit acceptance for an identical result reentered before its outer append fails', async () => {
  const manager = SessionManager.inMemory(),
    sessionId = manager.getSessionId(),
    identity = job('J', sessionId),
    outputRoot = await root();
  let store!: core.SessionJobStorage,
    nested: Promise<JobReply<void>> | undefined,
    entered = false;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId,
      persistent: false,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        if ((data as { kind: string }).kind === 'result' && !entered) {
          entered = true;
          nested = store.resultSink.save(result(identity));
          throw new Error('outer append failed');
        }
        manager.appendCustomEntry(kind, data);
      },
      readEntries: () => manager.getEntries(),
    });
  store = core.createSessionJobStorage({
    sessionId,
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
  });
  ok(await store.jobStore.reserve(launch(identity)));
  expect((await store.resultSink.save(result(identity))).status).toBe('unavailable');
  ok(await nested!);
  const historical = core.createSessionJobStorage({ sessionId, outputRoot, session: capability() });
  ok(await historical.replay());
  expect(ok(await historical.resultSink.read(result(identity).identity))).toEqual(result(identity));
});

it('releases default-bound data/tag buffers after successful expiry and orderly disposal', async () => {
  const outputRoot = await root(),
    moduleUrl = new URL('../dist/index.js', import.meta.url).href;
  const script = `import * as core from ${JSON.stringify(moduleUrl)};import {setImmediate} from 'node:timers/promises';const base=${JSON.stringify(outputRoot)};let now=0;globalThis.holds=[];const gc=async()=>{for(let i=0;i<3;i++){await setImmediate();global.gc();}return process.memoryUsage().arrayBuffers;};
  const make=async(prefix,count)=>{const store=core.createSessionJobStorage({sessionId:'S',outputRoot:base,retentionMs:1,now:()=>now});globalThis.holds.push(store);for(let i=0;i<count;i++){const identity={runtimeId:'R',ownerId:'O',sessionId:'S',jobId:prefix+i,producerId:'P'};const launch={identity,authority:{runtimeId:'R',ownerId:'O',generation:'G'},awaiting:false,delivery:'display-only',lifetime:'managed'};const reserved=await store.jobStore.reserve(launch);if(reserved.status!=='ok')throw Error(reserved.reason);const saved=await store.resultSink.save({identity:{job:identity,resultId:'final'},outcome:{kind:'exit',exitCode:0},content:'done'});if(saved.status!=='ok')throw Error(saved.reason);}return store;};
  const expired=await make('E',3),beforeExpiry=await gc();now=2;const reply=await expired.expireEligibleOutputs();if(reply.status!=='ok'||reply.value.expired.length!==3)throw Error('expiry failed');const afterExpiry=await gc();const disposed=await make('D',2),beforeDisposal=await gc();await disposed.dispose();const afterDisposal=await gc();console.log(JSON.stringify({beforeExpiry,afterExpiry,beforeDisposal,afterDisposal,held:globalThis.holds.length}));`;
  const child = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
    encoding: 'utf8',
  });
  if (child.status !== 0) throw new Error(child.stderr || `Memory probe exited ${child.status}`);
  expect(child.status).toBe(0);
  const metrics = JSON.parse(child.stdout.trim());
  console.info('Default-buffer cleanup:', metrics);
  expect(metrics.beforeExpiry - metrics.afterExpiry).toBeGreaterThanOrEqual(59_000_000);
  expect(metrics.beforeDisposal - metrics.afterDisposal).toBeGreaterThanOrEqual(39_000_000);
});

it('never acknowledges a newer failed result from an older reentrant append receipt', async () => {
  const manager = SessionManager.inMemory(),
    sessionId = manager.getSessionId(),
    identity = job('J', sessionId),
    outputRoot = await root();
  let store!: core.SessionJobStorage,
    nested: Promise<JobReply<void>> | undefined,
    entered = false,
    broken = true;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId,
      persistent: false,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        const entry = data as { kind: string };
        if (entry.kind === 'observation' && !entered) {
          entered = true;
          nested = store.resultSink.save(result(identity));
        }
        if (entry.kind === 'result' && broken) throw new Error('newer result append failed');
        manager.appendCustomEntry(kind, data);
      },
      readEntries: () => manager.getEntries(),
    });
  store = core.createSessionJobStorage({
    sessionId,
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
  });
  const token = ok(await store.jobStore.reserve(launch(identity)));
  ok(
    await store.jobStore.save(token, {
      ...createUnknownJobFixture(identity),
      execution: { state: 'running' },
    }),
  );
  expect((await nested!).status).toBe('unavailable');
  expect(ok(await store.inspect(identity)).result).toEqual(result(identity));
  expect(ok(await store.inspect(identity)).resumability).toBe('memory-only');
  broken = false;
  ok(await store.resultSink.save(result(identity)));
  const historical = core.createSessionJobStorage({ sessionId, outputRoot, session: capability() });
  ok(await historical.replay());
  expect(ok(await historical.resultSink.read(result(identity).identity))).toEqual(result(identity));
});

it('persists intake reentered during coverage publication before settling its coalesced writer', async () => {
  const manager = SessionManager.inMemory(),
    sessionId = manager.getSessionId(),
    identity = job('J', sessionId),
    outputRoot = await root(),
    io = core.createOutputArtifactIO(outputRoot);
  let store!: core.SessionJobStorage,
    sink!: core.OutputSink,
    token!: core.StorageReservation,
    writes = 0,
    release!: () => void,
    entered!: () => void,
    reentered = false,
    nested: Promise<JobReply<void>> | undefined;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId,
      persistent: false,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        manager.appendCustomEntry(kind, data);
        const entry = data as { kind: string; outputState?: string };
        if (entry.kind === 'output-status' && entry.outputState === 'ready' && !reentered) {
          reentered = true;
          void sink.append({ stream: 'stderr', bytes: bytes('DEF') });
          nested = store.jobStore.save(token, terminal(identity));
        }
      },
      readEntries: () => manager.getEntries(),
    });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  store = core.createSessionJobStorage({
    sessionId,
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
    io: {
      ...io,
      write: async (...args) => {
        if (++writes === 2) {
          entered();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        await io.write(...args);
      },
    },
  });
  token = ok(await store.jobStore.reserve(launch(identity)));
  sink = ok(store.output(token));
  const updating = sink.append({ stream: 'stdout', bytes: bytes('abc') });
  await started;
  try {
    ok(await store.resultSink.save(result(identity)));
    release();
    await updating;
    ok(await nested!);
    const historical = core.createSessionJobStorage({
      sessionId,
      outputRoot,
      session: capability(),
    });
    ok(await historical.replay());
    expect(ok(await historical.readCapturedOutput(identity)).totalBytes).toBe(6);
  } finally {
    release();
    await updating;
  }
});

it('uses a fresh full-assertion revision when retrying a failed result after a ready delta', async () => {
  const manager = SessionManager.inMemory(),
    sessionId = manager.getSessionId(),
    outputRoot = await root(),
    io = core.createOutputArtifactIO(outputRoot);
  let writes = 0,
    release!: () => void,
    entered!: () => void;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId,
      persistent: false,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        manager.appendCustomEntry(kind, data);
      },
      readEntries: () => manager.getEntries(),
    });
  const first = capability(),
    identity = job('J', sessionId),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const store = core.createSessionJobStorage({
    sessionId,
    outputRoot,
    session: first,
    maxBytes: 10,
    prefixBytes: 3,
    io: {
      ...io,
      write: async (...args) => {
        if (++writes === 2) {
          entered();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        await io.write(...args);
      },
    },
  });
  const token = ok(await store.jobStore.reserve(launch(identity))),
    updating = ok(store.output(token)).append({ stream: 'stdout', bytes: bytes('abc') });
  await started;
  try {
    first.invalidate();
    expect((await store.resultSink.save(result(identity))).status).toBe('unavailable');
    ok(store.replaceSessionCapability(capability()));
    release();
    await updating;
    ok(await store.resultSink.save(result(identity)));
    const historical = core.createSessionJobStorage({
      sessionId,
      outputRoot,
      session: capability(),
    });
    ok(await historical.replay());
    expect(ok(await historical.resultSink.read(result(identity).identity))).toEqual(
      result(identity),
    );
    const revisions = manager
      .getEntries()
      .filter((entry) => entry.type === 'custom')
      .map((entry) => (entry.data as { revision: number }).revision);
    expect(new Set(revisions).size).toBe(revisions.length);
  } finally {
    release();
    await updating;
  }
});

it('preserves admission reference and monotonic revisions across native Pi partial-append failure and explicit retry', async () => {
  const base = await root(),
    manager = SessionManager.create(base, join(base, 'sessions'));
  manager.appendMessage({ role: 'user', content: 'start', timestamp: Date.now() });
  const sessionId = manager.getSessionId(),
    identity = job('J', sessionId),
    outputRoot = join(base, 'output'),
    sessionFile = manager.getSessionFile()!,
    mode = (await stat(sessionFile)).mode & 0o777;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId,
      persistent: true,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        manager.appendCustomEntry(kind, data);
      },
      readEntries: () => manager.getEntries(),
    });
  const store = core.createSessionJobStorage({
    sessionId,
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
  });
  await chmod(sessionFile, 0o400);
  try {
    expect((await store.jobStore.reserve(launch(identity))).status).toBe('unavailable');
  } finally {
    await chmod(sessionFile, mode);
  }
  const token = ok(await store.jobStore.reserve(launch(identity)));
  await ok(store.output(token)).append({ stream: 'stdout', bytes: bytes('abcdef') });
  ok(await store.resultSink.save(result(identity)));
  const historical = core.createSessionJobStorage({ sessionId, outputRoot, session: capability() });
  ok(await historical.replay());
  expect(ok(await historical.resultSink.read(result(identity).identity))).toEqual(result(identity));
  expect(ok(await historical.readCapturedOutput(identity)).totalBytes).toBe(6);
  const opened = SessionManager.open(sessionFile),
    fresh = core.createSessionJobStorage({
      sessionId,
      outputRoot,
      session: core.createJobsSessionCapability({
        sessionId,
        persistent: true,
        isCurrent: () => true,
        appendEntry: (kind, data) => {
          opened.appendCustomEntry(kind, data);
        },
        readEntries: () => opened.getEntries(),
      }),
    });
  ok(await fresh.replay());
  expect(ok(await fresh.resultSink.read(result(identity).identity))).toEqual(result(identity));
  const references = manager
    .getEntries()
    .filter((entry) => entry.type === 'custom')
    .map((entry) => (entry.data as { outputReference: string }).outputReference);
  expect(new Set(references).size).toBe(1);
});

it('retries a failed loss-status delta without rejecting an already-accepted near-limit result', async () => {
  const manager = SessionManager.inMemory(),
    sessionId = manager.getSessionId(),
    identity = job('J', sessionId),
    outputRoot = await root(),
    io = core.createOutputArtifactIO(outputRoot);
  let writes = 0;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId,
      persistent: false,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        manager.appendCustomEntry(kind, data);
      },
      readEntries: () => manager.getEntries(),
    });
  const first = capability(),
    store = core.createSessionJobStorage({
      sessionId,
      outputRoot,
      session: first,
      maxBytes: 10,
      prefixBytes: 3,
      io: {
        ...io,
        write: async (...args) => {
          if (++writes > 2) throw new Error('X'.repeat(1024));
          await io.write(...args);
        },
      },
    });
  const token = ok(await store.jobStore.reserve(launch(identity))),
    sink = ok(store.output(token));
  await sink.append({ stream: 'stdout', bytes: bytes('abc') });
  const final = { ...result(identity), content: 'S'.repeat(64000) };
  ok(await store.resultSink.save(final));
  first.invalidate();
  await sink.append({ stream: 'stderr', bytes: bytes('DEF') });
  ok(store.replaceSessionCapability(capability()));
  ok(await store.resultSink.save(final));
  const historical = core.createSessionJobStorage({ sessionId, outputRoot, session: capability() });
  ok(await historical.replay());
  expect(ok(await historical.resultSink.read(final.identity))).toEqual(final);
  expect(ok(await historical.readCapturedOutput(identity)).availability).toBe('corrupt');
});

it('checks due expiry even on an unchanged accepted intent retry', async () => {
  let now = 0;
  const { store, token, outputRoot } = await setup({ now: () => now, retentionMs: 1 });
  ok(await store.resultSink.save(result()));
  ok(await store.jobStore.save(token, terminal()));
  const intent = { kind: 'stop-unconfirmed' as const, reason: 'Unchanged' };
  ok(await store.recordIntent(token, intent));
  now = 10;
  ok(await store.recordIntent(token, intent));
  expect(await readdir(outputRoot)).toEqual([]);
});

it('replays known output write loss without describing an older artifact as complete', async () => {
  const base = await root(),
    manager = SessionManager.create(base, join(base, 'sessions')),
    sessionId = manager.getSessionId(),
    outputRoot = join(base, 'output');
  const capability = (session: SessionManager) =>
    core.createJobsSessionCapability({
      sessionId,
      persistent: true,
      isCurrent: () => session.getSessionId() === sessionId,
      appendEntry: (kind, data) => {
        session.appendCustomEntry(kind, data);
      },
      readEntries: () => session.getEntries(),
    });
  const identity = job('J', sessionId),
    store = core.createSessionJobStorage({
      sessionId,
      outputRoot,
      session: capability(manager),
      maxBytes: 10,
      prefixBytes: 3,
    });
  const token = ok(await store.jobStore.reserve(launch(identity))),
    sink = ok(store.output(token)),
    ref = ok(await store.inspect(identity)).outputReference;
  await sink.append({ stream: 'stdout', bytes: bytes('abc') });
  await mkdir(join(outputRoot, `${ref}.tmp`));
  await sink.append({ stream: 'stdout', bytes: bytes('DEF') });
  ok(await store.resultSink.save(result(identity)));
  manager.appendMessage({ role: 'user', content: 'persist', timestamp: Date.now() });
  const opened = SessionManager.open(manager.getSessionFile()!),
    historical = core.createSessionJobStorage({
      sessionId,
      outputRoot,
      session: capability(opened),
    });
  ok(await historical.replay());
  const captured = ok(await historical.readCapturedOutput(identity));
  expect(captured.availability).toBe('corrupt');
  expect(captured.complete).not.toBe(true);
  expect(captured.diagnostics.join(' ')).toContain('Output persistence lost');
  expect((await historical.readOutput(identity)).status).toBe('unavailable');
  expect(ok(await historical.resultSink.read(result(identity).identity))).toEqual(result(identity));
  expect(ok(await store.readCapturedOutput(identity)).totalBytes).toBe(6);
});

it('keeps output-loss deltas compact even when the saved final summary nearly fills its entry', async () => {
  const entries: unknown[] = [],
    outputRoot = await root(),
    io = core.createOutputArtifactIO(outputRoot);
  let writes = 0;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId: 'S',
      persistent: true,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        entries.push({ type: 'custom', customType: kind, data });
      },
      readEntries: () => entries,
    });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
    io: {
      ...io,
      write: async (...args) => {
        if (++writes > 2) throw new Error('X'.repeat(1024));
        await io.write(...args);
      },
    },
  });
  const token = ok(await store.jobStore.reserve(launch())),
    sink = ok(store.output(token));
  await sink.append({ stream: 'stdout', bytes: bytes('abc') });
  const final = { ...result(), content: 'S'.repeat(64000) };
  ok(await store.resultSink.save(final));
  await sink.append({ stream: 'stderr', bytes: bytes('DEF') });
  const historical = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
  });
  ok(await historical.replay());
  expect(ok(await historical.resultSink.read(final.identity))).toEqual(final);
  expect(ok(await historical.readCapturedOutput(job())).availability).toBe('corrupt');
  expect(
    entries.every(
      (entry) =>
        new TextEncoder().encode(JSON.stringify((entry as { data: unknown }).data)).length <= 65536,
    ),
  ).toBe(true);
  ok(await store.resultSink.save(final));
});

it('does not return a delayed disk read as complete after newer replay accepts output-loss evidence', async () => {
  const entries: unknown[] = [],
    outputRoot = await root(),
    io = core.createOutputArtifactIO(outputRoot);
  let release!: () => void, entered!: () => void;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId: 'S',
      persistent: true,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        entries.push({ type: 'custom', customType: kind, data });
      },
      readEntries: () => entries,
    });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
  });
  const token = ok(await store.jobStore.reserve(launch())),
    sink = ok(store.output(token)),
    ref = ok(await store.inspect(job())).outputReference;
  await sink.append({ stream: 'stdout', bytes: bytes('abc') });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const historical = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
    io: {
      ...io,
      read: async (...args) => {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return io.read(...args);
      },
    },
  });
  ok(await historical.replay());
  const reading = historical.readCapturedOutput(job());
  await started;
  await mkdir(join(outputRoot, `${ref}.tmp`));
  await sink.append({ stream: 'stderr', bytes: bytes('DEF') });
  ok(await historical.replay());
  release();
  expect(ok(await reading).availability).toBe('corrupt');
});

it('replays pending output coverage honestly until a matching ready transition is saved', async () => {
  const entries: unknown[] = [],
    outputRoot = await root(),
    io = core.createOutputArtifactIO(outputRoot);
  let writes = 0,
    release!: () => void,
    entered!: () => void;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId: 'S',
      persistent: true,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        entries.push({ type: 'custom', customType: kind, data });
      },
      readEntries: () => entries,
    });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
    io: {
      ...io,
      write: async (...args) => {
        if (++writes === 3) {
          entered();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        await io.write(...args);
      },
    },
  });
  const token = ok(await store.jobStore.reserve(launch())),
    sink = ok(store.output(token));
  await sink.append({ stream: 'stdout', bytes: bytes('abc') });
  const updating = sink.append({ stream: 'stderr', bytes: bytes('DEF') });
  await started;
  try {
    ok(await store.resultSink.save(result()));
    const historical = core.createSessionJobStorage({
      sessionId: 'S',
      outputRoot,
      session: capability(),
    });
    ok(await historical.replay());
    expect(ok(await historical.readCapturedOutput(job())).availability).toBe('corrupt');
    release();
    await updating;
    ok(await historical.replay());
    const capture = ok(await historical.readCapturedOutput(job()));
    expect(capture.totalBytes).toBe(6);
    expect(capture.complete).toBe(true);
  } finally {
    release();
    await updating;
  }
});

it('expires eligible output on accepted intent activity without promoting unknown intent to a terminal outcome', async () => {
  let now = 0;
  const { store, token, outputRoot } = await setup({ now: () => now, retentionMs: 1 });
  ok(await store.resultSink.save(result()));
  ok(await store.jobStore.save(token, terminal()));
  now = 10;
  ok(
    await store.recordIntent(token, {
      kind: 'stop-unconfirmed',
      reason: 'Late bounded cleanup status',
    }),
  );
  expect(await readdir(outputRoot)).toEqual([]);
  expect(ok(await store.resultSink.read(result().identity))).toEqual(result());
});

it('isolates each coalesced historical byte/tag/diagnostic reply from other callers', async () => {
  const entries: unknown[] = [],
    outputRoot = await root();
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId: 'S',
      persistent: true,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        entries.push({ type: 'custom', customType: kind, data });
      },
      readEntries: () => entries,
    });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
  });
  const token = ok(await store.jobStore.reserve(launch()));
  await ok(store.output(token)).append({ stream: 'stdout', bytes: bytes('abcdefghij') });
  const historical = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
  });
  ok(await historical.replay());
  const [first, second] = (
    await Promise.all([historical.readCapturedOutput(job()), historical.readCapturedOutput(job())])
  ).map(ok);
  first.prefix!.bytes[0] = 88;
  first.prefix!.streams[0] = 2;
  first.diagnostics.push('tampered');
  expect(text(second.prefix!.bytes)).toBe('abc');
  expect(second.prefix!.streams[0]).toBe(1);
  expect(second.diagnostics).not.toContain('tampered');
  expect(text(ok(await historical.readCapturedOutput(job())).prefix!.bytes)).toBe('abc');
});

it('reports every real permission-denied expiry attempt rather than only a changed diagnostic', async () => {
  let now = 0;
  const { store, token, outputRoot } = await setup({ now: () => now, retentionMs: 1 });
  ok(await store.resultSink.save(result()));
  ok(await store.jobStore.save(token, terminal()));
  now = 10;
  const ref = ok(await store.inspect(job())).outputReference;
  await chmod(outputRoot, 0o500);
  try {
    expect(ok(await store.expireEligibleOutputs()).failed).toEqual([ref]);
    expect(ok(await store.expireEligibleOutputs()).failed).toEqual([ref]);
    expect((await stat(join(outputRoot, ref))).isFile()).toBe(true);
    expect(ok(await store.resultSink.read(result().identity))).toEqual(result());
  } finally {
    await chmod(outputRoot, 0o700);
  }
  expect(ok(await store.expireEligibleOutputs()).expired).toEqual([ref]);
});

it('screens invalid admission payloads before evaluating/copying unknown getters', async () => {
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot: await root(),
    maxBytes: 10,
    prefixBytes: 3,
  });
  let copied = 0;
  const invalid = {
    ...launch(),
    get unexpected() {
      copied++;
      return new Uint8Array(1_000_000);
    },
  };
  expect((await store.jobStore.reserve(invalid)).status).toBe('invalid');
  expect(copied).toBe(0);
});

it('settles initial admission I/O before no-session disposal can return', async () => {
  const outputRoot = await root(),
    io = core.createOutputArtifactIO(outputRoot);
  let release!: () => void,
    entered!: () => void,
    done = false;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    maxBytes: 10,
    prefixBytes: 3,
    io: {
      ...io,
      write: async (...args) => {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await io.write(...args);
      },
    },
  });
  const admitting = store.jobStore.reserve(launch());
  await started;
  const disposing = store.dispose().then(() => {
    done = true;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(done).toBe(false);
  } finally {
    release();
    await disposing;
    expect((await admitting).status).toBe('unavailable');
  }
  expect(await readdir(outputRoot)).toEqual([]);
});

it('accepts semantically identical final outcomes and retries regardless of key insertion order', async () => {
  const { store, token } = await setup();
  ok(await store.jobStore.save(token, terminal()));
  const reordered = {
    content: result().content,
    outcome: { exitCode: 7, kind: 'exit' as const },
    identity: {
      resultId: 'final',
      job: {
        producerId: job().producerId,
        jobId: 'J',
        sessionId: 'S',
        ownerId: 'O',
        runtimeId: 'R',
      },
    },
  };
  ok(await store.resultSink.save(reordered));
  ok(await store.resultSink.save(result()));
  expect(ok(await store.resultSink.read(result().identity))).toEqual(result());
});

it('replays accepted delivery-mode changes while retaining saved terminal results and protecting new pending obligations', async () => {
  const entries: unknown[] = [];
  let now = 1;
  const capability = () =>
    core.createJobsSessionCapability({
      sessionId: 'S',
      persistent: true,
      isCurrent: () => true,
      appendEntry: (kind, data) => {
        entries.push({ type: 'custom', customType: kind, data });
      },
      readEntries: () => entries,
    });
  const outputRoot = await root();
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
    maxBytes: 10,
    prefixBytes: 3,
    now: () => now,
    retentionMs: 10,
  });
  const token = ok(await store.jobStore.reserve(launch()));
  ok(await store.resultSink.save(result()));
  const delivered: JobObservation = {
    ...terminal(),
    delivery: {
      mode: 'automatic',
      state: 'delivered',
      receipt: {
        result: result().identity,
        record: { sessionId: 'S', entryId: 'native-final', kind: 'custom-message' },
        contentDigest: 'digest',
      },
    },
  };
  ok(await store.jobStore.save(token, delivered));
  ok(await store.jobStore.save(token, terminal()));
  const historical = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot,
    session: capability(),
    now: () => now,
    retentionMs: 10,
  });
  expect(ok(await historical.replay())[0].observation.delivery).toEqual(terminal().delivery);
  const pending: JobObservation = {
    ...terminal(),
    delivery: { mode: 'next-natural-turn', state: 'pending' },
  };
  ok(await store.jobStore.save(token, pending));
  expect(ok(await historical.replay())[0].observation.delivery).toEqual(pending.delivery);
  now = 100;
  expect(ok(await historical.expireEligibleOutputs()).expired).toEqual([]);
  expect(ok(await historical.resultSink.read(result().identity))).toEqual(result());
});

it('uses injected actual Pi truncation for model excerpts without confusing presentation loss with captured loss', async () => {
  const { store, sink } = await setup({ maxBytes: 100, prefixBytes: 10 });
  await sink.append({ stream: 'stdout', bytes: bytes('one\ntwo\nthree\nfour\n') });
  const excerpt = ok(
    await store.readExcerpt(job(), (text) => truncateHead(text, { maxLines: 2, maxBytes: 10 })),
  );
  expect(excerpt.text).toBe('one\ntwo');
  expect(excerpt.presentationTruncated).toBe(true);
  expect(excerpt.capturedOmittedBytes).toBe(0);
  expect(excerpt.capturedComplete).toBe(true);
  expect(excerpt.reference).toMatch(/\.output$/);
});

it('rejects unbounded/unknown payloads before copying them into owner memory', async () => {
  const { store } = await setup();
  let copied = 0;
  const invalid = {
    ...result(),
    get unexpected() {
      copied++;
      return new Uint8Array(1_000_000);
    },
  };
  expect((await store.resultSink.save(invalid)).status).toBe('invalid');
  expect(copied).toBe(0);
});

it('discards an awaited replay invalidated during the read without accepting another session history', async () => {
  let release!: (entries: unknown[]) => void,
    reads = 0,
    appends = 0;
  const capability = core.createJobsSessionCapability({
    sessionId: 'S',
    persistent: true,
    isCurrent: () => true,
    appendEntry: () => {
      appends++;
    },
    readEntries: () => {
      reads++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const store = core.createSessionJobStorage({
    sessionId: 'S',
    outputRoot: await root(),
    session: capability,
    maxBytes: 10,
    prefixBytes: 3,
  });
  const reading = store.replay();
  capability.invalidate();
  release([]);
  expect((await reading).status).toBe('unavailable');
  expect(reads).toBe(1);
  expect((await store.jobStore.reserve(launch())).status).toBe('unavailable');
  expect(appends).toBe(0);
});
