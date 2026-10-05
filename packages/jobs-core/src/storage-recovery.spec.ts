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
