import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, expect, it } from 'vitest';
import type { JobIdentity, JobObservation, LaunchRequest } from './index.js';
import { createJobStorage, DEFAULT_STORAGE_POLICY } from '../dist/storage.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const agentDirectory = await mkdtemp(join(tmpdir(), 'jobs-store-'));
  roots.push(agentDirectory);
  const options = {
    agentDirectory,
    policy: {
      totalBytes: 40_000,
      outputBytes: 100,
      trackingBytes: 4096,
      resultBytes: 4096,
      retentionMs: 1000,
    },
  };
  return { options, storage: await createJobStorage(options) };
}
function launch(jobId = 'J', sessionId = 'S'): LaunchRequest {
  return {
    identity: { runtimeId: 'R', ownerId: 'O', sessionId, jobId, producerId: 'external/opaque' },
    authority: { runtimeId: 'R', ownerId: 'O', generation: 'G' },
    awaiting: true,
    delivery: 'automatic',
    lifetime: 'managed',
  };
}
function observed(identity: JobIdentity, terminal = false): JobObservation {
  return {
    identity,
    execution: terminal
      ? { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } }
      : { state: 'running' },
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
}

async function processReply(script: string): Promise<unknown> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (b) => (stdout += String(b)));
  child.stderr.on('data', (b) => (stderr += String(b)));
  const [code] = await once(child, 'close');
  expect({ code, stderr }).toMatchObject({ code: 0 });
  return JSON.parse(stdout) as unknown;
}
it('shares one ceiling across independent Node consumers with concurrent distinct sessions', async () => {
  const { options } = await setup();
  const moduleUrl = new URL('../dist/storage.js', import.meta.url).href;
  const replies = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      processReply(`
    import {createJobStorage} from '${moduleUrl}';
    const storage=await createJobStorage(${JSON.stringify(options)});
    const reply=await storage.jobs.reserve(${JSON.stringify(launch('J' + i, 'S' + i))});
    console.log(JSON.stringify(reply));
  `),
    ),
  );
  expect(replies.filter((r) => (r as { status: string }).status === 'ok')).toHaveLength(2);
  expect(replies.filter((r) => (r as { status: string }).status === 'unavailable')).toHaveLength(3);
});
it('releases the actual kernel lock after a holder is killed, without stale lock stealing', async () => {
  const { storage, options } = await setup();
  const child = spawn(
    'flock',
    [
      '--no-fork',
      '--exclusive',
      join(storage.root, 'quota.lock'),
      process.execPath,
      '-e',
      "process.stdout.write('locked');setInterval(()=>{},1000)",
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    await once(child.stdout, 'data');
    const blocked = await createJobStorage({ ...options, lockTimeoutMs: 25 }).then(
      () => false,
      () => true,
    );
    expect(blocked).toBe(true);
  } finally {
    child.kill('SIGKILL');
    await once(child, 'close');
  }
  expect((await storage.jobs.reserve(launch())).status).toBe('ok');
});
it('refuses real read-only admission before a fake launcher starts and preserves post-launch state', async () => {
  const { storage } = await setup();
  let launches = 0;
  await chmod(storage.root, 0o500);
  try {
    const r = await storage.jobs.reserve(launch());
    if (r.status === 'ok') launches++;
    expect(r.status).toBe('unavailable');
    expect(launches).toBe(0);
  } finally {
    await chmod(storage.root, 0o700);
  }
  const r = await storage.jobs.reserve(launch());
  if (r.status !== 'ok') throw new Error('reserve');
  launches++;
  const directory = (await readdir(storage.root)).find((n) => /^[a-f0-9]{64}$/.test(n))!;
  await chmod(join(storage.root, directory), 0o500);
  try {
    expect((await storage.jobs.save(r.value, observed(r.value.job))).status).toBe('unavailable');
    await storage
      .output(r.value)
      .append({ stream: 'combined', bytes: Buffer.from('A'.repeat(200)) });
    expect(launches).toBe(1);
    expect(storage.diagnostics()).toHaveLength(1);
  } finally {
    await chmod(join(storage.root, directory), 0o700);
  }
});
it('rejects oversized completion without inventing a saved result or delivery', async () => {
  const { storage } = await setup();
  const r = await storage.jobs.reserve(launch());
  if (r.status !== 'ok') throw new Error('reserve');
  expect(
    await storage.results.save({
      identity: { job: r.value.job, resultId: 'result' },
      outcome: { kind: 'exit', exitCode: 0 },
      content: 'X'.repeat(4096),
    }),
  ).toMatchObject({ status: 'unavailable' });
  expect(await storage.results.read({ job: r.value.job, resultId: 'result' })).toMatchObject({
    status: 'unavailable',
  });
  expect(await storage.jobs.read(r.value.job)).toMatchObject({
    status: 'ok',
    value: { execution: { state: 'unknown' }, delivery: { state: 'pending' } },
  });
});
it('evicts the oldest eligible record under pressure, never unknown or pending state', async () => {
  const { storage } = await setup();
  const a = await storage.jobs.reserve(launch('A')),
    b = await storage.jobs.reserve(launch('B'));
  if (a.status !== 'ok' || b.status !== 'ok') throw new Error('reserve');
  const done = observed(a.value.job, true);
  done.delivery = { mode: 'display-only', state: 'not-required' };
  expect((await storage.jobs.save(a.value, done)).status).toBe('ok');
  expect((await storage.jobs.reserve(launch('C'))).status).toBe('ok');
  expect((await storage.jobs.read(a.value.job)).status).toBe('unavailable');
  expect((await storage.jobs.read(b.value.job)).status).toBe('ok');
});
it('cleans only its own ephemeral records on normal close', async () => {
  const { storage, options } = await setup();
  const ephemeral = await createJobStorage({ ...options, ephemeral: true });
  const a = await storage.jobs.reserve(launch('persistent')),
    b = await ephemeral.jobs.reserve(launch('temporary'));
  if (a.status !== 'ok' || b.status !== 'ok') throw new Error('reserve');
  expect(await ephemeral.close()).toEqual({ status: 'ok', value: undefined });
  expect((await storage.jobs.read(a.value.job)).status).toBe('ok');
  expect((await storage.jobs.read(b.value.job)).status).toBe('unavailable');
  expect((await readdir(storage.root)).filter((n) => /^[a-f0-9]{64}$/.test(n))).toHaveLength(1);
});
it('resumes persistence after failed output without falsely claiming a complete prefix', async () => {
  const { storage } = await setup();
  const r = await storage.jobs.reserve(launch());
  if (r.status !== 'ok') throw new Error('reserve');
  const policyPath = join(storage.root, 'policy.json'),
    policyBytes = await readFile(policyPath);
  const sink = storage.output(r.value);
  await sink.append({ stream: 'combined', bytes: Buffer.from('B'.repeat(25)) });
  await writeFile(policyPath, '{');
  await sink.append({ stream: 'combined', bytes: Buffer.from('M'.repeat(100)) });
  await writeFile(policyPath, policyBytes);
  await sink.append({ stream: 'combined', bytes: Buffer.from('T'.repeat(100)) });
  const recovered = await createJobStorage({ agentDirectory: storage.agentDirectory });
  expect(await recovered.readOutput(r.value.job)).toMatchObject({
    status: 'ok',
    value: { complete: false, omittedBytes: 125, text: 'B'.repeat(25) + 'T'.repeat(75) },
  });
});
it('treats reordered identical policies/results as the same contract data', async () => {
  const { storage, options } = await setup();
  const reordered = {
    retentionMs: 1000,
    resultBytes: 4096,
    trackingBytes: 4096,
    outputBytes: 100,
    totalBytes: 40_000,
  };
  expect((await storage.setUserPolicy(reordered)).status).toBe('ok');
  await expect(createJobStorage(options)).resolves.toBeDefined();
  const r = await storage.jobs.reserve(launch());
  if (r.status !== 'ok') throw new Error('reserve');
  const result = {
    identity: { job: r.value.job, resultId: 'stable' },
    outcome: { kind: 'exit' as const, exitCode: 0 },
    content: 'final',
  };
  expect((await storage.results.save(result)).status).toBe('ok');
  expect(
    (
      await storage.results.save({
        content: result.content,
        outcome: result.outcome,
        identity: result.identity,
      })
    ).status,
  ).toBe('ok');
});
it('reports output loss separately without blocking admissions that still fit', async () => {
  const { storage } = await setup();
  const r = await storage.jobs.reserve(launch());
  if (r.status !== 'ok') throw new Error('reserve');
  await storage
    .output(r.value)
    .append({ stream: 'combined', bytes: Buffer.from('X'.repeat(1000)) });
  expect(storage.diagnostics()).toContainEqual(
    expect.objectContaining({ kind: 'output-loss', omittedBytes: 900 }),
  );
  expect((await storage.jobs.reserve(launch('next'))).status).toBe('ok');
});
it('bounds physical files plus completion commitments and clamps project/job output overrides', async () => {
  const { storage } = await setup();
  const a = await storage.reserve(launch('A'), { outputBytes: 40_001 });
  expect(a.status).toBe('invalid');
  const b = await storage.reserve(launch('B'), { outputBytes: 10_000 }),
    c = await storage.jobs.reserve(launch('C'));
  if (b.status !== 'ok' || c.status !== 'ok') throw new Error('reserve');
  await storage
    .output(b.value)
    .append({ stream: 'combined', bytes: Buffer.from('X'.repeat(10_000)) });
  expect(await storage.readOutput(b.value.job)).toMatchObject({
    status: 'ok',
    value: { complete: false },
  });
  const accounting = await storage.cleanup();
  if (accounting.status !== 'ok') throw new Error('accounting');
  expect(accounting.value.committedBytes).toBeLessThanOrEqual(40_000);
  let physical = 0;
  for (const name of await readdir(storage.root)) {
    const path = join(storage.root, name),
      stat = await lstat(path);
    if (stat.isFile()) physical += stat.size;
    else
      for (const member of await readdir(path)) physical += (await lstat(join(path, member))).size;
  }
  expect(physical).toBeLessThanOrEqual(accounting.value.committedBytes);
  expect(
    (
      await storage.results.save({
        identity: { job: b.value.job, resultId: 'end' },
        outcome: { kind: 'exit', exitCode: 0 },
        content: 'completion preserved',
      })
    ).status,
  ).toBe('ok');
  expect((await storage.jobs.save(c.value, observed(c.value.job))).status).toBe('ok');
  const pending = observed(b.value.job, true);
  expect((await storage.jobs.save(b.value, pending)).status).toBe('ok');
  expect(await storage.cleanup(Date.now() + 100_000)).toMatchObject({
    status: 'ok',
    value: { removed: 0 },
  });
  expect((await storage.jobs.reserve(launch('new'))).status).toBe('unavailable');
});
it('coordinates independent physically loaded core copies over the same root', async () => {
  const { storage, options } = await setup();
  const copyRoot = join(options.agentDirectory, 'separate-module-copy');
  await mkdir(copyRoot);
  for (const name of ['storage', 'storage-format', 'storage-policy', 'storage-worker'])
    await copyFile(new URL(`../dist/${name}.js`, import.meta.url), join(copyRoot, `${name}.js`));
  await writeFile(join(copyRoot, 'package.json'), '{"type":"module"}');
  const copy = (await import(pathToFileURL(join(copyRoot, 'storage.js')).href)) as {
    createJobStorage: typeof createJobStorage;
  };
  expect(copy.createJobStorage).not.toBe(createJobStorage);
  const other = await copy.createJobStorage(options);
  const replies = await Promise.all([
    storage.jobs.reserve(launch('A', 'S1')),
    other.jobs.reserve(launch('B', 'S2')),
    other.jobs.reserve(launch('C', 'S3')),
  ]);
  expect(replies.filter((r) => r.status === 'ok')).toHaveLength(2);
  expect(replies.filter((r) => r.status === 'unavailable')).toHaveLength(1);
});
it('defines defaults without changing the jobs contract stamp', () => {
  expect(DEFAULT_STORAGE_POLICY).toEqual({
    totalBytes: 1024 ** 3,
    outputBytes: 100 * 1024 ** 2,
    trackingBytes: 256 * 1024,
    resultBytes: 1024 ** 2,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
  });
});
it('persists admission before launch and retains beginning plus rolling tail with exact byte loss', async () => {
  const { storage } = await setup();
  const request = launch();
  const admission = await storage.jobs.reserve(request);
  expect(admission.status).toBe('ok');
  if (admission.status !== 'ok') throw new Error(admission.reason);
  expect(await storage.jobs.read(request.identity)).toMatchObject({
    status: 'ok',
    value: { execution: { state: 'unknown' } },
  });
  expect(await storage.jobs.save(admission.value, observed(request.identity))).toEqual({
    status: 'ok',
    value: undefined,
  });
  const sink = storage.output(admission.value);
  await sink.append({ stream: 'stdout', bytes: Buffer.from('B'.repeat(25) + 'M'.repeat(50)) });
  expect(await storage.readOutput(request.identity)).toMatchObject({
    status: 'ok',
    value: { complete: true, omittedBytes: 0, text: 'B'.repeat(25) + 'M'.repeat(50) },
  });
  await sink.append({ stream: 'stderr', bytes: Buffer.from('T'.repeat(100)) });
  expect(await storage.readOutput(request.identity)).toMatchObject({
    status: 'ok',
    value: { complete: false, omittedBytes: 75, text: 'B'.repeat(25) + 'T'.repeat(75) },
  });
  const reopened = await createJobStorage({ agentDirectory: storage.agentDirectory });
  expect(await reopened.jobs.read(request.identity)).toMatchObject({
    status: 'ok',
    value: { execution: { state: 'unknown' } },
  });
  expect(await reopened.readOutput(request.identity)).toMatchObject({
    status: 'ok',
    value: { omittedBytes: 75 },
  });
});
it('shares commitments across copies and sessions, refuses a third job and still saves completion', async () => {
  const { storage, options } = await setup();
  const copy = await createJobStorage(options);
  const replies = await Promise.all([
    storage.jobs.reserve(launch('A', 'S1')),
    copy.jobs.reserve(launch('B', 'S2')),
    storage.jobs.reserve(launch('C', 'S3')),
  ]);
  expect(replies.filter((r) => r.status === 'ok')).toHaveLength(2);
  expect(replies.filter((r) => r.status === 'unavailable')).toHaveLength(1);
  for (let i = 0; i < replies.length; i++) {
    const r = replies[i];
    if (r.status !== 'ok') continue;
    const job = r.value.job;
    expect(await storage.jobs.save(r.value, observed(job, true))).toEqual({
      status: 'ok',
      value: undefined,
    });
    const result = {
      identity: { job, resultId: 'result' },
      outcome: { kind: 'exit' as const, exitCode: 0 },
      content: 'saved completion',
    };
    expect(await storage.results.save(result)).toEqual({ status: 'ok', value: undefined });
    expect(await copy.results.read(result.identity)).toEqual({ status: 'ok', value: result });
    expect(await copy.results.save({ ...result, content: 'contradictory' })).toMatchObject({
      status: 'invalid',
    });
  }
});
it('expires only fulfilled terminal records and rejects policy escalation/conflicts', async () => {
  const { storage, options } = await setup();
  const a = await storage.jobs.reserve(launch('A'));
  const b = await storage.jobs.reserve(launch('B'));
  if (a.status !== 'ok' || b.status !== 'ok') throw new Error('admission');
  const eligible = observed(a.value.job, true);
  eligible.delivery = { mode: 'display-only', state: 'not-required' };
  expect(await storage.jobs.save(a.value, eligible)).toMatchObject({ status: 'ok' });
  expect(await storage.cleanup(Date.now() + 2000)).toMatchObject({
    status: 'ok',
    value: { removed: 1 },
  });
  expect(await storage.jobs.read(a.value.job)).toMatchObject({ status: 'unavailable' });
  expect(await storage.jobs.read(b.value.job)).toMatchObject({ status: 'ok' });
  await expect(
    createJobStorage({ ...options, policy: { ...options.policy, totalBytes: 80_000 } }),
  ).rejects.toThrow(/policy/i);
  expect(await storage.setUserPolicy({ ...options.policy, totalBytes: 1000 })).toMatchObject({
    status: 'unavailable',
  });
});
it('keeps bounded honest fallback after persistence loss, with no successful durable reply', async () => {
  const { storage } = await setup();
  const r = await storage.jobs.reserve(launch());
  if (r.status !== 'ok') throw new Error('reserve');
  // Replace the root policy with corrupt bytes to simulate an unavailable store after admission.
  await writeFile(join(storage.root, 'policy.json'), '{');
  expect(await storage.jobs.save(r.value, observed(r.value.job))).toMatchObject({
    status: 'unavailable',
  });
  await storage
    .output(r.value)
    .append({ stream: 'combined', bytes: Buffer.from('X'.repeat(1000)) });
  expect(await storage.readOutput(r.value.job)).toMatchObject({
    status: 'ok',
    value: { complete: false, omittedBytes: 900 },
  });
  expect(storage.diagnostics().some((d) => d.reducedRecoverability)).toBe(true);
  expect(await storage.jobs.reserve(launch('new'))).toMatchObject({ status: 'unavailable' });
  expect(await storage.jobs.read(r.value.job)).toMatchObject({
    status: 'ok',
    value: { execution: { state: 'running' } },
  });
});
it('uses real atomic files and never stores session JSONL or whole logs in JSON records', async () => {
  const { storage } = await setup();
  const r = await storage.jobs.reserve(launch());
  if (r.status !== 'ok') throw new Error('reserve');
  await storage.output(r.value).append({ stream: 'combined', bytes: Buffer.from('full output') });
  const dirs = (await readdir(storage.root)).filter((n) => /^[a-f0-9]{64}$/.test(n));
  expect(dirs).toHaveLength(1);
  expect((await readFile(join(storage.root, dirs[0], 'output.bin'))).subarray(24).toString()).toBe(
    'full output',
  );
  expect(await readFile(join(storage.root, dirs[0], 'record.json'), 'utf8')).not.toContain(
    'full output',
  );
  expect(await readdir(storage.root)).not.toContain('sessions');
});
