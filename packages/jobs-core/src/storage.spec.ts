import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
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
