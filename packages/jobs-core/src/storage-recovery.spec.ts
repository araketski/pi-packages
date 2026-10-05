import { chmod, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createJobStorage } from '../dist/storage.js';
import type { JobObservation, LaunchRequest } from './index.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const launch: LaunchRequest = {
  identity: { runtimeId: 'R', ownerId: 'O', sessionId: 'S', jobId: 'J', producerId: 'opaque' },
  authority: { runtimeId: 'R', ownerId: 'O', generation: 'G' },
  awaiting: true,
  delivery: 'automatic',
  lifetime: 'managed',
};
const running: JobObservation = {
  identity: launch.identity,
  execution: { state: 'running' },
  delivery: { mode: 'automatic', state: 'pending' },
  awaiting: true,
  lifetime: 'managed',
  capabilities: {
    stop: true,
    setAwaiting: true,
    setDelivery: true,
    readOutput: true,
    readResult: true,
  },
};
async function setup(ephemeral = false, large = false) {
  const agentDirectory = await mkdtemp(join(tmpdir(), 'jobs-recovery-'));
  roots.push(agentDirectory);
  const options = {
    agentDirectory,
    ephemeral,
    policy: {
      totalBytes: large ? 2 * 1024 ** 2 : 40_000,
      outputBytes: 100,
      trackingBytes: 4096,
      resultBytes: large ? 512 * 1024 : 4096,
      retentionMs: 1000,
    },
  };
  const storage = await createJobStorage(options),
    reply = await storage.jobs.reserve(launch);
  if (reply.status !== 'ok') throw new Error(reply.reason);
  const dir = join(
    storage.root,
    (await readdir(storage.root)).find((n) => /^[a-f0-9]{64}$/.test(n))!,
  );
  return { storage, options, reservation: reply.value, dir };
}
it('finishes a committed partial deletion without treating it as live unresolved state', async () => {
  const { storage, options, reservation, dir } = await setup(true);
  const tombstone = join(
    storage.root,
    `.deleted-${dir.split('/').at(-1)}-00000000-0000-4000-8000-000000000000`,
  );
  await rename(dir, tombstone);
  await rm(join(tombstone, 'record.json'));
  const reopened = await createJobStorage({ ...options, ephemeral: false });
  expect((await reopened.jobs.read(reservation.job)).status).toBe('unavailable');
  expect((await readdir(storage.root)).some((name) => name.startsWith('.deleted-'))).toBe(false);
});
it('review seven regression: normal expiry during hydration does not poison later admission', async () => {
  const { storage, reservation, options } = await setup();
  expect((await storage.setUserPolicy({ ...options.policy, retentionMs: 1 })).status).toBe('ok');
  const reader = await createJobStorage({ ...options, policy: undefined });
  const terminal = {
    ...running,
    execution: { state: 'terminal' as const, outcome: { kind: 'exit' as const, exitCode: 0 } },
    delivery: { mode: 'display-only' as const, state: 'not-required' as const },
  };
  expect((await reader.jobs.save(reservation, terminal)).status).toBe('unavailable');
  expect(reader.diagnostics()).toEqual([]);
  expect(
    (
      await reader.jobs.reserve({
        ...launch,
        identity: { ...launch.identity, jobId: 'after-hydration-expiry' },
      })
    ).status,
  ).toBe('ok');
});
it('review seven regression: observation mutation cannot bypass a bounded accepted snapshot', async () => {
  const { storage, reservation, dir } = await setup();
  const observed = { ...running, execution: { state: 'unknown' as const, reason: 'original' } };
  const pending = storage.jobs.save(reservation, observed);
  observed.execution.reason = 'X'.repeat(100000);
  expect((await pending).status).toBe('ok');
  expect(await storage.jobs.read(reservation.job)).toMatchObject({
    status: 'ok',
    value: { execution: { state: 'unknown', reason: 'original' } },
  });
  expect(
    JSON.parse(await readFile(join(dir, 'record.json'), 'utf8')).observation.execution.reason,
  ).toBe('original');
  expect(storage.diagnostics()).toEqual([]);
});
it('review seven regression: queued result commits use the snapshotted nested identity', async () => {
  const { storage, reservation } = await setup();
  const result = {
    identity: { job: { ...reservation.job }, resultId: 'saved' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'original',
  };
  const expected = structuredClone(result),
    pending = storage.results.save(result);
  result.identity.job.jobId = 'changed';
  expect((await pending).status).toBe('ok');
  expect(await storage.results.read(expected.identity)).toMatchObject({
    status: 'ok',
    value: expected,
  });
});
async function retiredReservation(ephemeral = false) {
  const original = await setup(ephemeral);
  const { storage, reservation, options } = original;
  expect((await storage.setUserPolicy({ ...options.policy, retentionMs: 1 })).status).toBe('ok');
  expect(
    (
      await storage.jobs.save(reservation, {
        ...running,
        execution: { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } },
        delivery: { mode: 'display-only', state: 'not-required' },
      })
    ).status,
  ).toBe('ok');
  const other = await createJobStorage({ ...options, ephemeral: false, policy: undefined });
  const next = await other.jobs.reserve(launch);
  if (next.status !== 'ok') throw new Error(next.reason);
  return { ...original, other, next: next.value };
}
it('review six regression: rejected obsolete reservations cannot publish cached observations', async () => {
  const { storage, reservation } = await retiredReservation();
  expect((await storage.jobs.save(reservation, running)).status).toBe('invalid');
  expect(await storage.jobs.read(reservation.job)).toMatchObject({
    status: 'ok',
    value: { execution: { state: 'unknown' } },
  });
  expect(storage.diagnostics()).toEqual([]);
});
it('reads invalidate obsolete reservation caches without a rejected write', async () => {
  const { storage, reservation } = await retiredReservation();
  expect(await storage.jobs.read(reservation.job)).toMatchObject({
    status: 'ok',
    value: { execution: { state: 'unknown' } },
  });
});
it('ephemeral close does not retain or delete a replacement reservation', async () => {
  const { storage, other, next } = await retiredReservation(true);
  expect((await storage.close()).status).toBe('ok');
  expect((await other.jobs.read(next.job)).status).toBe('ok');
});
it('review six regression: concurrent failed saves cannot replace immutable fallback results', async () => {
  const { storage, reservation } = await setup();
  const result = {
    identity: { job: reservation.job, resultId: 'saved' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'first',
  };
  const path = join(storage.root, 'policy.json'),
    original = await readFile(path);
  await writeFile(path, 'broken');
  try {
    const replies = await Promise.all([
      storage.results.save(result),
      storage.results.save({ ...result, content: 'contradictory' }),
    ]);
    expect(replies.map((r) => r.status)).toEqual(['unavailable', 'invalid']);
    expect(await storage.results.read(result.identity)).toMatchObject({
      status: 'ok',
      value: result,
    });
  } finally {
    await writeFile(path, original);
  }
  expect((await storage.results.save(result)).status).toBe('ok');
});
it('review six regression: a verified read retains a known result for subsequent file loss', async () => {
  const { storage, reservation, options, dir } = await setup();
  const result = {
    identity: { job: reservation.job, resultId: 'saved' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'verified',
  };
  expect((await storage.results.save(result)).status).toBe('ok');
  const reader = await createJobStorage(options);
  expect((await reader.jobs.save(reservation, running)).status).toBe('ok');
  expect(await reader.results.read(result.identity)).toMatchObject({ status: 'ok', value: result });
  await rm(join(dir, 'result.json'));
  expect(await reader.results.read(result.identity)).toMatchObject({ status: 'ok', value: result });
  expect(reader.diagnostics()).toContainEqual(
    expect.objectContaining({ kind: 'persistence-loss', reducedRecoverability: true }),
  );
});
it('review six regression: wrong-ID polling still diagnoses known whole-result file loss', async () => {
  const { storage, reservation, dir } = await setup();
  const result = {
    identity: { job: reservation.job, resultId: 'saved' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'verified',
  };
  expect((await storage.results.save(result)).status).toBe('ok');
  await rm(join(dir, 'result.json'));
  expect((await storage.results.read({ job: reservation.job, resultId: 'wrong' })).status).toBe(
    'unavailable',
  );
  expect(storage.diagnostics()).toContainEqual(
    expect.objectContaining({ kind: 'persistence-loss', reducedRecoverability: true }),
  );
  expect(
    (
      await storage.jobs.reserve({
        ...launch,
        identity: { ...launch.identity, jobId: 'after-loss' },
      })
    ).status,
  ).toBe('unavailable');
});
it('review five regression: lost output cannot reset a known history', async () => {
  const { storage, reservation, dir, options } = await setup();
  const output = storage.output(reservation);
  await output.append({ stream: 'combined', bytes: Buffer.from('before') });
  await rm(join(dir, 'output.bin'));
  await output.append({ stream: 'combined', bytes: Buffer.from('after') });
  const reopened = await createJobStorage(options);
  expect(await reopened.readOutput(reservation.job)).toMatchObject({
    status: 'ok',
    value: { text: 'beforeafter', complete: true, omittedBytes: 0 },
  });
  expect(storage.diagnostics()).toContainEqual(
    expect.objectContaining({ kind: 'persistence-loss', reducedRecoverability: true }),
  );
});
it('cold recovery rejects a zeroed empty header after capture was attempted', async () => {
  const { storage, reservation, dir, options } = await setup();
  await storage.output(reservation).append({ stream: 'combined', bytes: Buffer.from('before') });
  await writeFile(join(dir, 'output.bin'), Buffer.alloc(24));
  const reopened = await createJobStorage(options);
  expect((await reopened.readOutput(reservation.job)).status).toBe('unavailable');
});
it('cold recovery does not call disappeared output empty complete history', async () => {
  const { storage, reservation, dir, options } = await setup();
  await storage.output(reservation).append({ stream: 'combined', bytes: Buffer.from('before') });
  await rm(join(dir, 'output.bin'));
  const reopened = await createJobStorage(options);
  expect((await reopened.readOutput(reservation.job)).status).toBe('unavailable');
});
it('review five regression: verified reads refresh fallback and repair does not return stale cache', async () => {
  const { storage, reservation, options } = await setup();
  const writer = await createJobStorage(options);
  expect((await writer.jobs.save(reservation, running)).status).toBe('ok');
  await writer.output(reservation).append({ stream: 'combined', bytes: Buffer.from('borrowed') });
  expect(await storage.readOutput(reservation.job)).toMatchObject({
    status: 'ok',
    value: { text: 'borrowed' },
  });
  const policy = join(storage.root, 'policy.json');
  await chmod(policy, 0);
  try {
    expect(await storage.readOutput(reservation.job)).toMatchObject({
      status: 'ok',
      value: { text: 'borrowed' },
    });
  } finally {
    await chmod(policy, 0o600);
  }
  await writer.output(reservation).append({ stream: 'combined', bytes: Buffer.from('-new') });
  expect(await storage.readOutput(reservation.job)).toMatchObject({
    status: 'ok',
    value: { text: 'borrowed-new', complete: true },
  });
});
it('review four regression: truncated zero-byte output is corrupt, not empty complete history', async () => {
  const { storage, reservation, options, dir } = await setup();
  await storage.output(reservation).append({ stream: 'combined', bytes: Buffer.from('lost') });
  await writeFile(join(dir, 'output.bin'), Buffer.alloc(0));
  const fresh = await createJobStorage(options);
  expect((await fresh.readOutput(reservation.job)).status).toBe('unavailable');
  expect((await fresh.jobs.save(reservation, running)).status).toBe('ok');
  await fresh.output(reservation).append({ stream: 'combined', bytes: Buffer.from('new') });
  expect((await fresh.readOutput(reservation.job)).status).toBe('unavailable');
  expect(await readFile(join(dir, 'output.bin'))).toHaveLength(0);
});
it('review four regression: a missing known saved result retains bounded recovery and diagnoses loss', async () => {
  const { storage, reservation, dir } = await setup();
  const result = {
    identity: { job: reservation.job, resultId: 'saved' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'known completion',
  };
  expect((await storage.results.save(result)).status).toBe('ok');
  await rm(join(dir, 'result.json'));
  expect(await storage.results.read(result.identity)).toMatchObject({
    status: 'ok',
    value: result,
  });
  expect(storage.diagnostics()).toContainEqual(
    expect.objectContaining({ kind: 'persistence-loss', reducedRecoverability: true }),
  );
  expect(
    (
      await storage.jobs.reserve({
        ...launch,
        identity: { ...launch.identity, jobId: 'after-loss' },
      })
    ).status,
  ).toBe('unavailable');
});
it.each([
  'running-delivered',
  'unknown-delivered',
  'display-delivered',
  'pending-receipt',
  'unknown-receipt',
])('review four regression: rejects participant-incompatible %s', async (kind) => {
  const { storage, reservation } = await setup();
  const receipt = {
    result: { job: reservation.job, resultId: 'saved' },
    record: { sessionId: reservation.job.sessionId, entryId: 'E', kind: 'tool-result' as const },
    contentDigest: 'digest',
  };
  const observation = {
    ...running,
    execution:
      kind === 'running-delivered'
        ? running.execution
        : kind === 'unknown-delivered'
          ? { state: 'unknown', reason: 'unknown' }
          : { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } },
    delivery: {
      mode: kind === 'display-delivered' ? 'display-only' : 'automatic',
      state:
        kind === 'pending-receipt'
          ? 'pending'
          : kind === 'unknown-receipt'
            ? 'unknown'
            : 'delivered',
      receipt,
    },
  } as JobObservation;
  expect((await storage.jobs.save(reservation, observation)).status).toBe('invalid');
  expect(storage.diagnostics()).toEqual([]);
});
it('review three regression: fitting terminal observations survive a failed rewrite', async () => {
  const { storage, reservation, dir } = await setup();
  const terminal: JobObservation = {
    ...running,
    execution: { state: 'terminal', outcome: { kind: 'launch-failed', reason: 'x'.repeat(2500) } },
  };
  expect((await storage.jobs.save(reservation, terminal)).status).toBe('ok');
  await chmod(dir, 0o500);
  try {
    expect((await storage.jobs.save(reservation, terminal)).status).toBe('unavailable');
  } finally {
    await chmod(dir, 0o700);
  }
  expect(await storage.jobs.read(reservation.job)).toMatchObject({
    status: 'ok',
    value: { execution: terminal.execution },
  });
});
it('review three regression: immutable rejection does not poison hydrated admission', async () => {
  const { storage, reservation, options } = await setup();
  const result = {
    identity: { job: reservation.job, resultId: 'saved' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'durable',
  };
  expect((await storage.results.save(result)).status).toBe('ok');
  const hydrated = await createJobStorage(options);
  expect((await hydrated.jobs.save(reservation, running)).status).toBe('ok');
  expect((await hydrated.results.save({ ...result, content: 'contradictory' })).status).toBe(
    'invalid',
  );
  expect(hydrated.diagnostics()).toEqual([]);
  expect(
    (
      await hydrated.jobs.reserve({
        ...launch,
        identity: { ...launch.identity, jobId: 'after-rejection' },
      })
    ).status,
  ).toBe('ok');
  expect(await hydrated.results.read(result.identity)).toMatchObject({
    status: 'ok',
    value: result,
  });
});
it('review three regression: existing readers follow authoritative transport after policy changes', async () => {
  const { storage, options } = await setup();
  const reader = await createJobStorage(options);
  expect(
    (
      await storage.setUserPolicy({
        ...options.policy,
        totalBytes: 3_000_000,
        outputBytes: 1_000_000,
      })
    ).status,
  ).toBe('ok');
  const admitted = await storage.jobs.reserve({
    ...launch,
    identity: { ...launch.identity, jobId: 'large-output' },
  });
  if (admitted.status !== 'ok') throw new Error(admitted.reason);
  await storage
    .output(admitted.value)
    .append({ stream: 'combined', bytes: Buffer.alloc(900_000, 97) });
  const read = await reader.readOutput(admitted.value.job);
  expect(read.status).toBe('ok');
  if (read.status !== 'ok') throw new Error(read.reason);
  expect(read.value.text).toHaveLength(900_000);
  expect(read.value.complete).toBe(true);
});
it('review three regression: expired temporary bytes are reclaimed in the same admission', async () => {
  const { storage, options, reservation, dir } = await setup();
  expect(
    (await storage.setUserPolicy({ ...options.policy, totalBytes: 20_000, retentionMs: 1 })).status,
  ).toBe('ok');
  expect(
    (
      await storage.jobs.save(reservation, {
        ...running,
        execution: { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } },
        delivery: { mode: 'display-only', state: 'not-required' },
      })
    ).status,
  ).toBe('ok');
  await writeFile(join(dir, 'record.json.tmp-interrupted'), Buffer.alloc(4096));
  expect(
    (
      await storage.jobs.reserve({
        ...launch,
        identity: { ...launch.identity, jobId: 'after-expiry' },
      })
    ).status,
  ).toBe('ok');
  expect((await readdir(storage.root)).filter((n) => /^[a-f0-9]{64}$/.test(n))).toHaveLength(1);
});
it('review two regression: normal result absence does not degrade healthy admission', async () => {
  const { storage, reservation } = await setup();
  expect((await storage.results.read({ job: reservation.job, resultId: 'not-yet' })).status).toBe(
    'unavailable',
  );
  expect(storage.diagnostics()).toEqual([]);
  expect(
    (await storage.jobs.reserve({ ...launch, identity: { ...launch.identity, jobId: 'second' } }))
      .status,
  ).toBe('ok');
  const result = {
    identity: { job: reservation.job, resultId: 'saved' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'final',
  };
  expect((await storage.results.save(result)).status).toBe('ok');
  expect((await storage.results.read({ job: reservation.job, resultId: 'wrong' })).status).toBe(
    'unavailable',
  );
  expect(storage.diagnostics()).toEqual([]);
});
it('review two regression: changed durable history cannot be overwritten by fallback', async () => {
  const { storage, options, reservation, dir } = await setup();
  const a = storage.output(reservation);
  await a.append({ stream: 'combined', bytes: Buffer.from('a') });
  const other = await createJobStorage(options);
  expect((await other.jobs.save(reservation, running)).status).toBe('ok');
  const b = other.output(reservation);
  await chmod(dir, 0o500);
  try {
    await b.append({ stream: 'combined', bytes: Buffer.from('b') });
  } finally {
    await chmod(dir, 0o700);
  }
  await a.append({ stream: 'combined', bytes: Buffer.from('c') });
  await b.append({ stream: 'combined', bytes: Buffer.from('d') });
  const fresh = await createJobStorage(options);
  expect(await fresh.readOutput(reservation.job)).toMatchObject({
    status: 'ok',
    value: { text: 'ac' },
  });
  expect((await other.readOutput(reservation.job)).status).toBe('unavailable');
});
it.each([false, true])(
  'review two regression: close settles raced admissions and cleans their records (ephemeral %s)',
  async (ephemeral) => {
    const { storage, options } = await setup(ephemeral);
    const pending = storage.jobs.reserve({
      ...launch,
      identity: { ...launch.identity, jobId: 'raced' },
    });
    expect((await storage.close()).status).toBe('ok');
    expect((await pending).status).toBe('unavailable');
    expect((await readdir(storage.root)).filter((n) => /^[a-f0-9]{64}$/.test(n))).toHaveLength(
      ephemeral ? 0 : 1,
    );
    const reopened = await createJobStorage({ ...options, ephemeral: false });
    expect((await reopened.jobs.read({ ...launch.identity, jobId: 'raced' })).status).toBe(
      'unavailable',
    );
  },
);
it('review regression: preserves multibyte final content across both process pipes', async () => {
  const { storage, options, reservation, dir } = await setup(false, true);
  const result = {
    identity: { job: reservation.job, resultId: 'result' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: '漢'.repeat(100_000),
  };
  expect((await storage.results.save(result)).status).toBe('ok');
  expect(JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'))).toEqual(result);
  const copy = await createJobStorage(options);
  expect(await copy.results.read(result.identity)).toEqual({ status: 'ok', value: result });
});
it('review regression: keeps admitted memory after a transient read failure', async () => {
  const { storage, reservation } = await setup();
  expect((await storage.jobs.save(reservation, running)).status).toBe('ok');
  const policyPath = join(storage.root, 'policy.json'),
    before = await readFile(policyPath);
  await writeFile(policyPath, '{');
  expect(await storage.jobs.read(reservation.job)).toMatchObject({
    status: 'ok',
    value: { execution: { state: 'running' } },
  });
  expect(storage.diagnostics()).toContainEqual(
    expect.objectContaining({ kind: 'persistence-loss', reducedRecoverability: true }),
  );
  await writeFile(policyPath, before);
  await storage
    .output(reservation)
    .append({ stream: 'combined', bytes: Buffer.from('still tracked') });
  expect(await storage.readOutput(reservation.job)).toMatchObject({
    status: 'ok',
    value: { text: 'still tracked' },
  });
});
it('review regression: ephemeral hydration does not acquire deletion ownership', async () => {
  const { storage, options, reservation } = await setup();
  const borrower = await createJobStorage({ ...options, ephemeral: true });
  expect((await borrower.jobs.save(reservation, running)).status).toBe('ok');
  expect((await borrower.close()).status).toBe('ok');
  expect((await storage.jobs.read(reservation.job)).status).toBe('ok');
});
it('review regression: successful output recovery clears an earlier read error', async () => {
  const { storage, options, reservation, dir } = await setup();
  await storage.output(reservation).append({ stream: 'combined', bytes: Buffer.from('before') });
  const copy = await createJobStorage(options);
  await chmod(join(dir, 'output.bin'), 0);
  try {
    expect((await copy.jobs.save(reservation, running)).status).toBe('ok');
  } finally {
    await chmod(join(dir, 'output.bin'), 0o600);
  }
  await copy.output(reservation).append({ stream: 'combined', bytes: Buffer.from('after') });
  expect(await copy.readOutput(reservation.job)).toMatchObject({
    status: 'ok',
    value: { text: 'beforeafter', complete: true },
  });
});
it('does not promote an adopted unknown-prefix fallback into complete output', async () => {
  const { storage, options, reservation, dir } = await setup();
  await storage.output(reservation).append({ stream: 'combined', bytes: Buffer.from('before') });
  const copy = await createJobStorage(options);
  await chmod(join(dir, 'output.bin'), 0);
  try {
    expect((await copy.jobs.save(reservation, running)).status).toBe('ok');
    await copy.output(reservation).append({ stream: 'combined', bytes: Buffer.from('failed') });
  } finally {
    await chmod(join(dir, 'output.bin'), 0o600);
  }
  await copy.output(reservation).append({ stream: 'combined', bytes: Buffer.from('after') });
  expect((await copy.readOutput(reservation.job)).status).toBe('unavailable');
  expect((await copy.jobs.read(reservation.job)).status).toBe('ok');
  expect(copy.diagnostics()).toContainEqual(
    expect.objectContaining({ kind: 'persistence-loss', reducedRecoverability: true }),
  );
});
it('review regression: failed ephemeral cleanup remains retryable and preserves records', async () => {
  const { storage, options, reservation, dir } = await setup(true);
  await chmod(storage.root, 0o500);
  try {
    expect((await storage.close()).status).toBe('unavailable');
    expect(JSON.parse(await readFile(join(dir, 'record.json'), 'utf8')).request.identity).toEqual(
      reservation.job,
    );
  } finally {
    await chmod(storage.root, 0o700);
  }
  expect((await storage.close()).status).toBe('ok');
  const copy = await createJobStorage({ ...options, ephemeral: false });
  expect((await copy.jobs.read(reservation.job)).status).toBe('unavailable');
});
it('review regression: confirmed expiry wins over degraded result and observation caches', async () => {
  const { storage, reservation, dir } = await setup();
  const final = {
    identity: { job: reservation.job, resultId: 'result' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'saved',
  };
  expect((await storage.results.save(final)).status).toBe('ok');
  expect(
    (
      await storage.jobs.save(reservation, {
        ...running,
        execution: { state: 'terminal', outcome: final.outcome },
        delivery: { mode: 'display-only', state: 'not-required' },
      })
    ).status,
  ).toBe('ok');
  expect((await storage.results.save({ ...final, content: 'X'.repeat(5000) })).status).toBe(
    'unavailable',
  );
  const path = join(dir, 'record.json'),
    record = JSON.parse(await readFile(path, 'utf8')) as { eligibleAt: number };
  record.eligibleAt = Date.now() - 2000;
  await writeFile(path, JSON.stringify(record));
  expect((await storage.results.read(final.identity)).status).toBe('unavailable');
  expect((await storage.jobs.read(reservation.job)).status).toBe('unavailable');
});
