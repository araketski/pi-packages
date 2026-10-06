import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { expect, it } from 'vitest';
import { createSessionJobStore, createJobsFileOutput, JOBS_STORAGE_ENTRY_TYPE } from './index.js';
import type { JobReply, LaunchRequest, FinalResult } from './index.js';

function ok<T>(reply: JobReply<T>): T {
  expect(reply.status).toBe('ok');
  if (reply.status !== 'ok') throw new Error(reply.reason);
  return reply.value;
}
const request = (jobId = 'J', sessionId = 'S'): LaunchRequest => ({
  identity: { runtimeId: 'R', ownerId: 'O', sessionId, jobId, producerId: 'opaque' },
  authority: { runtimeId: 'R', ownerId: 'O', generation: 'G' },
  awaiting: true,
  delivery: 'automatic',
  lifetime: 'managed',
});
const result = (r = request()): FinalResult => ({
  identity: { job: r.identity, resultId: 'result' },
  outcome: { kind: 'exit', exitCode: 7 },
  content: 'actual exit seven',
});
async function fixture(maxBytes = 20, headBytes = 4, persistent = true) {
  const root = await mkdtemp(join(tmpdir(), 'minimal-store-'));
  const entries: { type: string; customType: string; data: unknown }[] = [];
  let failAppend = false;
  const session = {
    sessionId: 'S',
    persistent,
    appendEntry(customType: string, data: unknown) {
      if (failAppend) throw new Error('append failed');
      entries.push({ type: 'custom', customType, data: structuredClone(data) });
    },
    getEntries: () => entries,
  };
  const files = createJobsFileOutput(root);
  let writes = 0,
    failWrite = false;
  const output = {
    ...files,
    async write(...args: Parameters<typeof files.write>) {
      writes++;
      if (failWrite) throw new Error('snapshot failed');
      return files.write(...args);
    },
  };
  const options = { session, output, maxBytes, headBytes };
  return {
    root,
    entries,
    options,
    store: createSessionJobStore(options),
    writes: () => writes,
    failAppend: () => {
      failAppend = true;
    },
    failWrite: () => {
      failWrite = true;
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

// @mara checks REQ-JOBS-OUTPUT-BOUNDS
it('captures combined bytes with live reads and completion snapshots, not chunk writes', async () => {
  const f = await fixture();
  try {
    ok(await f.store.jobs.reserve(request()));
    await f.store.capture(request().identity, {
      stream: 'stdout',
      bytes: Buffer.from('HEADabcdefghijklmnop'),
    });
    expect(f.writes()).toBe(0);
    const fit = ok(await f.store.readOutput(request().identity));
    expect(fit.retainedBytes).toBe(20);
    expect(fit.window.omittedBytes).toBe(0);
    expect(fit.window.complete).toBe(false);
    await f.store.capture(request().identity, { stream: 'stderr', bytes: Buffer.from('QRSTUV') });
    expect(f.writes()).toBe(1);
    const live = ok(await f.store.readOutput(request().identity));
    expect(live.window.text).toContain('HEAD');
    expect(live.window.text).toContain('ghijklmnopQRSTUV');
    expect(live.window.omittedBytes).toBe(6);
    expect(live.retainedBytes).toBe(20);
    ok(await f.store.results.save(result()));
    expect(f.writes()).toBe(3);
    expect(f.entries.every((e) => e.customType === JOBS_STORAGE_ENTRY_TYPE)).toBe(true);
    expect(JSON.stringify(f.entries)).not.toContain('ghijklmnop');
    const replay = createSessionJobStore(f.options);
    expect(ok(await replay.results.read(result().identity))).toEqual(result());
    expect(ok(await replay.readOutput(request().identity)).window.complete).toBe(false);
    expect(ok(await replay.jobs.read(request().identity)).capabilities.stop).toBe(false);
  } finally {
    await f.cleanup();
  }
});

it('owns a bounded copy of Buffer tails even when callers reuse their input', async () => {
  const f = await fixture(8, 2);
  try {
    ok(await f.store.jobs.reserve(request()));
    const bytes = Buffer.alloc(1_000_000, 65);
    ok(await f.store.capture(request().identity, { stream: 'combined', bytes }));
    bytes.fill(66);
    const retained = ok(await f.store.readOutput(request().identity));
    expect(retained.retainedBytes).toBe(8);
    expect(retained.window.omittedBytes).toBe(999_992);
    expect(retained.window.text).toBe('AA\n[... 999992 bytes omitted ...]\nAAAAAA');
  } finally {
    await f.cleanup();
  }
});

it('defaults smaller bounds to a beginning plus rolling tail, never an all-head buffer', async () => {
  const f = await fixture(8, 2);
  try {
    const store = createSessionJobStore({ ...f.options, headBytes: undefined });
    ok(await store.jobs.reserve(request()));
    ok(
      await store.capture(request().identity, {
        stream: 'combined',
        bytes: Buffer.from('BEGINxxx'),
      }),
    );
    ok(
      await store.capture(request().identity, { stream: 'combined', bytes: Buffer.from('LATEST') }),
    );
    const retained = ok(await store.readOutput(request().identity));
    expect(retained.window.text).toBe('BE\n[... 6 bytes omitted ...]\nLATEST');
    expect(retained.retainedBytes).toBe(8);
    expect(() => createSessionJobStore({ ...f.options, headBytes: 8 })).toThrow('bounds');
  } finally {
    await f.cleanup();
  }
});

it('keeps ordinary UTF-8 complete and missing output separate from saved nonzero results', async () => {
  const f = await fixture(100, 64);
  try {
    ok(await f.store.jobs.reserve(request()));
    await f.store.capture(request().identity, {
      stream: 'combined',
      bytes: Buffer.from('héllo 世界'),
    });
    ok(await f.store.results.save(result()));
    const reopened = createSessionJobStore(f.options);
    const saved = ok(await reopened.readOutput(request().identity));
    expect(saved.window.text).toBe('héllo 世界');
    expect(saved.window.complete).toBe(true);
    await f.options.output.remove(saved.window.reference);
    expect((await reopened.readOutput(request().identity)).status).toBe('unavailable');
    expect(ok(await reopened.results.read(result().identity)).outcome).toEqual({
      kind: 'exit',
      exitCode: 7,
    });
  } finally {
    await f.cleanup();
  }
});

// @mara checks REQ-JOBS-STORAGE-FAILURE
it('refuses initial setup failure and keeps live outcome after ordinary logging failures', async () => {
  const f = await fixture();
  try {
    f.failAppend();
    expect((await f.store.jobs.reserve(request())).status).toBe('unavailable');
    expect(await readdir(f.root)).toEqual([]);
    const broken = createSessionJobStore({
      ...f.options,
      output: {
        ...f.options.output,
        create: async () => {
          throw new Error('setup');
        },
      },
    });
    expect((await broken.jobs.reserve(request())).status).toBe('unavailable');
    const g = await fixture();
    try {
      ok(await g.store.jobs.reserve(request()));
      g.failAppend();
      g.failWrite();
      await g.store.capture(request().identity, {
        stream: 'combined',
        bytes: Buffer.from('HEAD'.repeat(100)),
      });
      expect((await g.store.results.save(result())).status).toBe('unavailable');
      expect(ok(await g.store.results.read(result().identity))).toEqual(result());
      const live = ok(await g.store.readOutput(request().identity));
      expect(live.retainedBytes).toBe(20);
      expect(live.diagnostics.join(' ')).toContain('snapshot failed');
      expect(live.diagnostics.join(' ')).toContain('append failed');
    } finally {
      await g.cleanup();
    }
  } finally {
    await f.cleanup();
  }
});

it('rejects embedded output and oversized final entries without truncating content', async () => {
  const f = await fixture();
  try {
    ok(await f.store.jobs.reserve(request()));
    expect(
      (
        await f.store.results.save({
          ...result(),
          output: { text: 'snapshot', reference: 'x', complete: true, omittedBytes: 0 },
        })
      ).status,
    ).toBe('unsupported');
    expect((await f.store.results.save({ ...result(), content: '界'.repeat(65536) })).status).toBe(
      'invalid',
    );
    expect(f.entries).toHaveLength(1);
    expect(f.writes()).toBe(0);
    ok(await f.store.results.save(result()));
    expect(ok(await f.store.results.read(result().identity)).content).toBe(result().content);
  } finally {
    await f.cleanup();
  }
});

it('does not invoke invalidated origin callbacks or turn historical running into live authority', async () => {
  const f = await fixture();
  try {
    ok(await f.store.jobs.reserve(request()));
    const history = createSessionJobStore(f.options);
    expect(ok(await history.jobs.read(request().identity)).execution.state).toBe('unknown');
    f.store.invalidateOrigin();
    expect((await f.store.results.save(result())).status).toBe('unavailable');
    expect(f.entries).toHaveLength(1);
    expect((await f.store.jobs.reserve(request('late'))).status).toBe('unavailable');
  } finally {
    await f.cleanup();
  }
});

it('allows independent jobs beyond the default single-job ceiling and drains a real nonzero command', async () => {
  const f = await fixture(10_000_000, 65536);
  try {
    for (const id of ['A', 'B']) {
      ok(await f.store.jobs.reserve(request(id)));
      await f.store.capture(request(id).identity, {
        stream: 'combined',
        bytes: Buffer.alloc(10_000_001, 65),
      });
    }
    for (const id of ['A', 'B']) {
      const captured = ok(await f.store.readOutput(request(id).identity));
      expect(captured.retainedBytes).toBe(10_000_000);
      expect(captured.window.omittedBytes).toBe(1);
    }
    ok(await f.store.jobs.reserve(request('command')));
    const child = spawn(process.execPath, [
      '-e',
      "process.stdout.write('HEAD'+ 'x'.repeat(12000000)); process.stderr.write('TAIL'); process.exitCode=7",
    ]);
    // Single combined output owner; async iteration serializes capture and drains both pipes.
    const drain = async (stream: NodeJS.ReadableStream, kind: 'stdout' | 'stderr') => {
      for await (const bytes of stream)
        await f.store.capture(request('command').identity, {
          stream: kind,
          bytes: typeof bytes === 'string' ? Buffer.from(bytes) : bytes,
        });
    };
    const closed = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    await Promise.all([drain(child.stdout, 'stdout'), drain(child.stderr, 'stderr')]);
    const exitCode = await closed;
    expect(exitCode).toBe(7);
    ok(
      await f.store.results.save({
        ...result(request('command')),
        outcome: { kind: 'exit', exitCode: exitCode! },
      }),
    );
    const out = ok(await f.store.readOutput(request('command').identity));
    expect(out.retainedBytes).toBe(10_000_000);
    expect(out.totalBytes).toBe(12_000_008);
    expect(out.window.omittedBytes).toBe(2_000_008);
    expect((await readFile(join(f.root, out.window.reference))).length).toBeLessThan(10_001_024);
  } finally {
    await f.cleanup();
  }
}, 30000);

it('protects tracked running, unknown and pending-result output during no-session disposal', async () => {
  const f = await fixture(20, 4, false);
  try {
    for (const id of ['running', 'unknown', 'pending']) {
      const launch = request(id);
      const token = ok(await f.store.jobs.reserve(launch));
      if (id === 'unknown') {
        const observed = ok(await f.store.jobs.read(launch.identity));
        ok(
          await f.store.jobs.save(token, {
            ...observed,
            execution: { state: 'unknown', reason: 'unconfirmed' },
          }),
        );
      }
      if (id === 'pending') ok(await f.store.results.save(result(launch)));
    }
    expect(await readdir(f.root)).toHaveLength(3);
    expect(await f.store.dispose()).toHaveLength(3);
    expect(await readdir(f.root)).toHaveLength(3);
  } finally {
    await f.cleanup();
  }
});

it('attempts no-session orderly artifact cleanup, but preserves persistent artifacts', async () => {
  const f = await fixture(20, 4, false);
  try {
    const launch = { ...request(), delivery: 'display-only' as const };
    ok(await f.store.jobs.reserve(launch));
    ok(await f.store.results.save(result(launch)));
    await f.store.dispose();
    expect(await readdir(f.root)).toEqual([]);
    expect((await f.store.readOutput(launch.identity)).status).toBe('unavailable');
    expect((await f.store.results.save(result(launch))).status).toBe('unavailable');
    expect(await readdir(f.root)).toEqual([]);
  } finally {
    await f.cleanup();
  }
  const g = await fixture();
  try {
    ok(await g.store.jobs.reserve(request()));
    await g.store.dispose();
    expect(await readdir(g.root)).toHaveLength(1);
  } finally {
    await g.cleanup();
  }
});
