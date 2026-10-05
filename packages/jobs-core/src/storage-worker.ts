import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { FinalResult, JobIdentity, JobObservation, StorageReservation } from './index.js';
import {
  appendWindow,
  decodeWindow,
  eligible,
  encodeWindow,
  key,
  object,
  sameJob,
  validJob,
  validObservation,
  validPolicy,
  validRequest,
  validResult,
  type ByteWindow,
  type StoragePolicy,
  type StoredJob,
} from './storage-format.js';

interface Request {
  root: string;
  operation: string;
  policy?: StoragePolicy;
  job?: JobIdentity;
  reservation?: StorageReservation;
  observation?: JobObservation;
  result?: FinalResult;
  resultId?: string;
  bytes?: string;
  resumeWindow?: { bytes: string; seen: number; head: number };
  baselineDigest?: string;
  outputBytes?: number;
  now?: number;
}
const ok = (value: unknown = null) => ({ status: 'ok', value });
const unavailable = (reason: string) => ({ status: 'unavailable', reason });
const invalid = (reason: string) => ({ status: 'invalid', reason });
async function regular(path: string): Promise<number> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unexpected storage file: ${path}`);
  return stat.size;
}
async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
async function atomic(path: string, bytes: string | Buffer): Promise<void> {
  const temp = `${path}.tmp-${randomUUID()}`;
  const file = await open(temp, 'wx', 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, path);
  await syncDirectory(join(path, '..'));
}
async function json(path: string, bound: number): Promise<unknown> {
  if ((await regular(path)) > bound) throw new Error('Stored JSON exceeds its budget.');
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}
let responseLimit = 1024 * 1024;
async function transaction(request: Request): Promise<unknown> {
  const { root } = request;
  const policyPath = join(root, 'policy.json');
  if (request.operation === 'init') {
    try {
      await lstat(policyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!validPolicy(request.policy)) return invalid('Invalid storage policy.');
      // Initialization must not adopt existing job/orphan data without its authoritative policy.
      if ((await readdir(root)).some((n) => n !== 'quota.lock'))
        throw new Error('Missing policy with existing storage.');
      if (
        2 * Buffer.byteLength(JSON.stringify({ format: 1, policy: request.policy })) >
        request.policy.totalBytes
      )
        return unavailable('Policy cannot fit user quota.');
      await atomic(policyPath, JSON.stringify({ format: 1, policy: request.policy }));
    }
  }
  const envelope = await json(policyPath, 64 * 1024);
  if (!object(envelope) || envelope.format !== 1 || !validPolicy(envelope.policy))
    throw new Error('Corrupt root policy.');
  const policy = envelope.policy;
  responseLimit = Math.min(Number.MAX_SAFE_INTEGER, 2 * policy.totalBytes + 1024 * 1024);
  if (request.operation === 'init' && request.policy && !isDeepStrictEqual(request.policy, policy))
    return invalid('Conflicting root policy. Use the explicit user-policy operation.');
  const jobs: {
    path: string;
    data: StoredJob;
    outputSize: number;
    outputPresent: boolean;
    temporaryBytes: number;
  }[] = [];
  let extra = 2 * (await regular(policyPath)) + (await regular(join(root, 'quota.lock')));
  for (const name of await readdir(root)) {
    if (name === 'policy.json' || name === 'quota.lock') continue;
    const path = join(root, name),
      stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('Symlinks are not storage records.');
    if (
      /^\.deleted-[a-f0-9]{64}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(
        name,
      ) &&
      stat.isDirectory()
    ) {
      await rm(path, { recursive: true });
      await syncDirectory(root);
      continue;
    }
    if (name.startsWith('policy.json.tmp-') && stat.isFile()) {
      extra += stat.size;
      continue;
    }
    if (!/^[a-f0-9]{64}$/u.test(name) || !stat.isDirectory())
      throw new Error('Unknown storage root entry.');
    // A partial admission has no launch permission and is unresolved, not an eviction candidate.
    const raw = await json(join(path, 'record.json'), policy.totalBytes);
    if (
      !object(raw) ||
      raw.format !== 1 ||
      typeof raw.reservationId !== 'string' ||
      !validRequest(raw.request) ||
      !validObservation(raw.observation) ||
      !sameJob(raw.request.identity, raw.observation.identity) ||
      key(raw.request.identity) !== name ||
      !validPolicy(raw.policy) ||
      (raw.outputExpected !== undefined && typeof raw.outputExpected !== 'boolean')
    )
      throw new Error('Corrupt/unresolved job record.');
    const data = raw as unknown as StoredJob;
    if ((await regular(join(path, 'record.json'))) > data.policy.trackingBytes)
      throw new Error('Corrupt tracking budget.');
    if (
      data.eligibleAt !== undefined &&
      (!Number.isSafeInteger(data.eligibleAt) || !eligible(data.observation))
    )
      throw new Error('Corrupt retention timestamp.');
    let outputSize = 0,
      outputPresent = false,
      temporaryBytes = 0;
    for (const member of await readdir(path)) {
      const size = await regular(join(path, member));
      if (member === 'record.json') continue;
      if (member === 'output.bin') {
        outputPresent = true;
        outputSize = size;
        continue;
      }
      if (member === 'result.json') {
        if (size > data.policy.resultBytes) throw new Error('Corrupt result budget.');
        continue;
      }
      if (/^(record.json|result.json|output.bin)\.tmp-/u.test(member)) {
        extra += size;
        temporaryBytes += size;
        continue;
      }
      throw new Error('Unknown job storage entry.');
    }
    jobs.push({ path, data, outputSize, outputPresent, temporaryBytes });
  }
  const charge = () =>
    extra +
    jobs.reduce(
      (sum, j) =>
        sum + 2 * (j.data.policy.trackingBytes + j.data.policy.resultBytes + j.outputSize),
      0,
    );
  const now = request.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) return invalid('Invalid retention time.');
  let removed = 0;
  const removedKeys: string[] = [];
  const remove = async (job: (typeof jobs)[number]) => {
    const tombstone = join(root, `.deleted-${key(job.data.request.identity)}-${randomUUID()}`);
    await rename(job.path, tombstone);
    await syncDirectory(root);
    await rm(tombstone, { recursive: true });
    await syncDirectory(root);
    extra -= job.temporaryBytes;
    jobs.splice(jobs.indexOf(job), 1);
    removed++;
    removedKeys.push(key(job.data.request.identity));
  };
  const candidates = () =>
    jobs
      .filter((j) => eligible(j.data.observation) && j.data.eligibleAt !== undefined)
      .sort((a, b) => a.data.eligibleAt! - b.data.eligibleAt! || a.path.localeCompare(b.path));
  if (request.operation !== 'delete') {
    for (const j of candidates())
      if (now - j.data.eligibleAt! >= policy.retentionMs) await remove(j);
  }
  // Leftovers are safe only under this kernel lock. Do not turn unknown files into cleanup authority.
  for (const name of await readdir(root))
    if (name.startsWith('policy.json.tmp-')) {
      extra -= await regular(join(root, name));
      await unlink(join(root, name));
    }
  for (const j of jobs)
    for (const name of await readdir(j.path))
      if (/^(record.json|result.json|output.bin)\.tmp-/u.test(name)) {
        const size = await regular(join(j.path, name));
        await unlink(join(j.path, name));
        extra -= size;
        j.temporaryBytes -= size;
      }
  if (request.operation === 'init') return ok(policy);
  if (request.operation === 'cleanup')
    return ok({ removed, removedKeys, committedBytes: charge() });
  if (request.operation === 'policy') {
    if (!validPolicy(request.policy)) return invalid('Invalid user policy.');
    const replacement =
      2 * Buffer.byteLength(JSON.stringify({ format: 1, policy: request.policy }));
    if (charge() - 2 * (await regular(policyPath)) + replacement > request.policy.totalBytes)
      return unavailable('User ceiling is below existing commitments.');
    await atomic(policyPath, JSON.stringify({ format: 1, policy: request.policy }));
    return ok(request.policy);
  }
  if (request.operation === 'reserve') {
    const input = request as unknown as { launch: unknown };
    if (!validRequest(input.launch)) return invalid('Invalid launch identity/settings.');
    const launch = input.launch;
    if (jobs.some((j) => sameJob(j.data.request.identity, launch.identity)))
      return invalid('Job identity is already reserved.');
    const outputBytes = request.outputBytes ?? policy.outputBytes;
    if (!Number.isSafeInteger(outputBytes) || outputBytes <= 0 || outputBytes > policy.totalBytes)
      return invalid('Output override exceeds user ceiling.');
    const storedPolicy = { ...policy, outputBytes };
    const data: StoredJob = {
      format: 1,
      reservationId: randomUUID(),
      request: launch,
      policy: storedPolicy,
      outputExpected: false,
      observation: {
        identity: launch.identity,
        execution: { state: 'unknown', reason: 'Storage reserved; execution not observed.' },
        delivery: {
          mode: launch.delivery,
          state: launch.delivery === 'display-only' ? 'not-required' : 'pending',
        },
        awaiting: launch.awaiting,
        lifetime: launch.lifetime,
        capabilities: {
          stop: false,
          setAwaiting: false,
          setDelivery: false,
          readOutput: false,
          readResult: false,
        },
      },
    };
    const bytes = JSON.stringify(data);
    if (Buffer.byteLength(bytes) > policy.trackingBytes)
      return unavailable('Required tracking exceeds admitted budget.');
    const needed = 2 * (policy.trackingBytes + policy.resultBytes);
    for (const j of candidates()) {
      if (charge() + needed <= policy.totalBytes) break;
      await remove(j);
    }
    if (charge() + needed > policy.totalBytes)
      return unavailable('Shared storage quota cannot reserve tracking/completion.');
    const path = join(root, key(launch.identity));
    await mkdir(path, { mode: 0o700 });
    await atomic(join(path, 'record.json'), bytes);
    return ok({
      reservation: { job: launch.identity, reservationId: data.reservationId },
      policy: storedPolicy,
      presentKeys: [...jobs.map((j) => key(j.data.request.identity)), key(launch.identity)],
    });
  }
  if (!validJob(request.job)) return invalid('Invalid job identity.');
  const job = jobs.find((j) => sameJob(j.data.request.identity, request.job!));
  if (!job)
    return request.operation === 'delete'
      ? ok()
      : { ...unavailable('Job/result expired, evicted or unavailable.'), removed: true };
  const { data, path } = job;
  if (
    (request.reservation || ['save', 'append', 'delete'].includes(request.operation)) &&
    (!request.reservation ||
      request.reservation.reservationId !== data.reservationId ||
      !sameJob(request.reservation.job, data.request.identity))
  )
    return { ...invalid('Reservation does not match.'), reservationRejected: true };
  if (request.operation === 'reservation-policy') return ok(data.policy);
  if (request.operation === 'read')
    return ok(
      data.observation.execution.state === 'running'
        ? {
            ...data.observation,
            execution: {
              state: 'unknown',
              reason: 'Stored running state requires owner reconciliation.',
            },
          }
        : data.observation,
    );
  if (request.operation === 'delete') {
    await remove(job);
    return ok();
  }
  if (request.operation === 'save') {
    const observation = request.observation;
    if (!validObservation(observation) || !sameJob(observation.identity, data.request.identity))
      return invalid('Observation does not match reservation.');
    const updated: StoredJob = { ...data, observation };
    if (eligible(observation)) updated.eligibleAt = data.eligibleAt ?? now;
    else delete updated.eligibleAt;
    const bytes = JSON.stringify(updated);
    if (Buffer.byteLength(bytes) > data.policy.trackingBytes)
      return unavailable('Tracking payload exceeds reserved capacity.');
    await atomic(join(path, 'record.json'), bytes);
    return ok(data.policy);
  }
  if (request.operation === 'result-save') {
    const result = request.result;
    if (!validResult(result) || !sameJob(result.identity.job, data.request.identity))
      return invalid('Invalid result identity/outcome.');
    const bytes = JSON.stringify(result);
    if (Buffer.byteLength(bytes) > data.policy.resultBytes)
      return unavailable('Final result exceeds reserved completion capacity.');
    try {
      const previous = await json(join(path, 'result.json'), data.policy.resultBytes);
      if (!isDeepStrictEqual(previous, result)) return invalid('Saved result is immutable.');
      return ok();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await atomic(join(path, 'result.json'), bytes);
    return ok();
  }
  if (request.operation === 'result-read') {
    try {
      const result = await json(join(path, 'result.json'), data.policy.resultBytes);
      if (!validResult(result) || !sameJob(result.identity.job, data.request.identity))
        throw new Error('Corrupt result.');
      return result.identity.resultId === request.resultId
        ? ok(result)
        : { ...unavailable('Result identity unavailable.'), absence: 'identity-mismatch' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { ...unavailable('No saved final result.'), absence: 'not-saved' };
      throw error;
    }
  }
  if (request.operation === 'append' || request.operation === 'output-read') {
    let window: ByteWindow = { bytes: Buffer.alloc(0), seen: 0, head: 0 };
    if (job.outputPresent) {
      if (job.outputSize > data.policy.outputBytes + 24) throw new Error('Corrupt output size.');
      window = decodeWindow(await readFile(join(path, 'output.bin')));
      if (data.outputExpected === true && window.seen === 0)
        throw new Error('Expected captured output has an empty/reset history.');
    }
    if (!job.outputPresent && data.outputExpected !== false && !request.resumeWindow)
      return {
        ...unavailable(
          'Expected or legacy output history is missing; no empty history can be certified.',
        ),
        historyMissing: true,
      };
    const digest = (w: ByteWindow) => createHash('sha256').update(encodeWindow(w)).digest('hex');
    const diskDigest = job.outputPresent ? digest(window) : 'missing';
    if (request.operation === 'output-read')
      return ok({
        bytes: window.bytes.toString('base64'),
        seen: window.seen,
        head: window.head,
        digest: diskDigest,
      });
    if (request.resumeWindow) {
      const restored = {
        bytes: Buffer.from(request.resumeWindow.bytes, 'base64'),
        seen: request.resumeWindow.seen,
        head: request.resumeWindow.head,
      };
      if (
        typeof request.baselineDigest !== 'string' ||
        (job.outputPresent &&
          diskDigest !== request.baselineDigest &&
          diskDigest !== digest(restored))
      )
        return {
          ...unavailable('Output history conflicts with the verified recovery baseline.'),
          conflict: true,
        };
      if (
        !Number.isSafeInteger(restored.seen) ||
        restored.seen < window.seen ||
        restored.bytes.length > data.policy.outputBytes ||
        restored.seen < restored.bytes.length ||
        !Number.isSafeInteger(restored.head) ||
        restored.head < 0 ||
        restored.head > restored.bytes.length
      )
        return invalid('Invalid recovered output window.');
      window = restored;
    }
    const chunk = Buffer.from(request.bytes ?? '', 'base64');
    if (chunk.length === 0 || chunk.length > 64 * 1024)
      return invalid('Append is empty or exceeds transport bound.');
    if (data.outputExpected !== true) {
      const updated = { ...data, outputExpected: true };
      const bytes = JSON.stringify(updated);
      if (Buffer.byteLength(bytes) > data.policy.trackingBytes)
        return unavailable('Capture intent exceeds tracking capacity.');
      await atomic(join(path, 'record.json'), bytes);
      job.data = updated;
    }
    const allowance = Math.max(
      0,
      Math.min(
        data.policy.outputBytes,
        Math.floor((policy.totalBytes - charge() + 2 * job.outputSize) / 2) - 24,
      ),
    );
    // A header itself needs headroom. If unavailable, caller keeps explicitly lossy bounded memory.
    if (allowance === 0 && policy.totalBytes - charge() + 2 * job.outputSize < 48)
      return unavailable('Quota has no output header capacity.');
    window = appendWindow(window, chunk, allowance);
    await atomic(join(path, 'output.bin'), encodeWindow(window));
    return ok({
      bytes: window.bytes.toString('base64'),
      seen: window.seen,
      head: window.head,
      digest: digest(window),
    });
  }
  return invalid('Unknown storage operation.');
}

// Private one-shot helper; storage.ts is the supported API, not this executable module.
const send = (reply: unknown) => {
  const body = JSON.stringify(reply);
  process.stdout.write(JSON.stringify({ format: 1, limit: responseLimit }) + '\n' + body);
};
let input = '';
process.stdin.setEncoding('utf8');
try {
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (Buffer.byteLength(input) > 2 ** 31)
      throw new Error('Storage request exceeds transport bound.');
  }
  const request = JSON.parse(input) as Request;
  const reply = await transaction(request);
  send(reply);
} catch (error) {
  send(
    unavailable(
      `Persistence unavailable: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
}
