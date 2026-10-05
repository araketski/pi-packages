import { spawn } from 'node:child_process';
import { lstat, mkdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type {
  FinalResult,
  JobIdentity,
  JobObservation,
  JobReply,
  JobStore,
  LaunchRequest,
  OutputSink,
  OutputWindow,
  ResultIdentity,
  ResultSink,
  StorageReservation,
} from './index.js';
import {
  appendWindow,
  key,
  sameJob,
  validJob,
  validObservation,
  validPolicy,
  validRequest,
  validResult,
  type ByteWindow,
} from './storage-format.js';
import { DEFAULT_STORAGE_POLICY, type StoragePolicy } from './storage-policy.js';
export { DEFAULT_STORAGE_POLICY } from './storage-policy.js';
export type { StoragePolicy } from './storage-policy.js';

export interface StorageOptions {
  /** Public Pi user-state directory; fixtures must supply isolated temporary state. */
  agentDirectory: string;
  /** Initial root policy only. Existing conflicting policy is rejected. */
  policy?: Partial<StoragePolicy>;
  /** Explicitly temporary state; close removes only reservations made by this instance. */
  ephemeral?: boolean;
  lockTimeoutMs?: number;
}
export interface StorageDiagnostic {
  job: JobIdentity;
  reason: string;
  kind: 'persistence-loss' | 'output-loss';
  reducedRecoverability: boolean;
  omittedBytes?: number;
}
export interface JobStorage {
  readonly agentDirectory: string;
  readonly root: string;
  jobs: JobStore;
  results: ResultSink;
  /** A smaller or larger per-job output allowance, still constrained by the root ceiling. */
  reserve(
    request: LaunchRequest,
    options?: { outputBytes?: number },
  ): Promise<JobReply<StorageReservation>>;
  output(reservation: StorageReservation): OutputSink;
  readOutput(job: JobIdentity): Promise<JobReply<OutputWindow>>;
  diagnostics(): readonly StorageDiagnostic[];
  cleanup(now?: number): Promise<JobReply<{ removed: number; committedBytes: number }>>;
  /** User-authorized composition only, never a project/per-job override. */
  setUserPolicy(policy: StoragePolicy): Promise<JobReply<StoragePolicy>>;
  close(): Promise<JobReply<void>>;
}
interface MemoryJob {
  reservation: StorageReservation;
  observation?: JobObservation;
  unavailableOutput?: string;
  result?: FinalResult;
  window: ByteWindow;
  outputLimit: number;
  policy: StoragePolicy;
  queue: Promise<void>;
  outputDegraded: boolean;
  degraded: boolean;
}
const empty = (): ByteWindow => ({ bytes: Buffer.alloc(0), seen: 0, head: 0 });
const clone = <T>(value: T): T => structuredClone(value);
const failure = <T>(reason: string): JobReply<T> => ({ status: 'unavailable', reason });
const invalid = <T>(reason: string): JobReply<T> => ({ status: 'invalid', reason });

/** Linux local-filesystem store. No execution, Pi journal, session manager or delivery service. */
export async function createJobStorage(options: StorageOptions): Promise<JobStorage> {
  if (!options || !isAbsolute(options.agentDirectory))
    throw new Error('An absolute Pi agent directory is required.');
  const agentDirectory = resolve(options.agentDirectory),
    root = join(agentDirectory, 'jobs');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Storage root must be a real directory.');
  const lock = join(root, 'quota.lock');
  try {
    const st = await lstat(lock);
    if (!st.isFile() || st.isSymbolicLink()) throw new Error('Invalid storage lock.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const timeout = options.lockTimeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('Invalid lock timeout.');
  let policy: StoragePolicy = { ...DEFAULT_STORAGE_POLICY, ...options.policy };
  if (!validPolicy(policy)) throw new Error('Invalid storage policy.');
  const worker = fileURLToPath(new URL('./storage-worker.js', import.meta.url));
  const invoke = async <T>(
    operation: string,
    fields: Record<string, unknown> = {},
  ): Promise<JobReply<T>> => {
    const input = JSON.stringify({ root, operation, ...fields });
    return new Promise((resolveReply) => {
      const child = spawn(
        'flock',
        [
          '--no-fork',
          '--exclusive',
          '--timeout',
          String(timeout / 1000),
          lock,
          process.execPath,
          worker,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let output = '',
        errorText = '',
        settled = false;
      const finish = (reply: JobReply<T>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveReply(reply);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(failure('Storage transaction timed out; persistence is unconfirmed.'));
      }, timeout + 30_000);
      child.stdout.on('data', (bytes: Buffer) => {
        output += bytes.toString();
        if (output.length > 2 * policy.totalBytes + 1024 * 1024) {
          child.kill('SIGKILL');
          finish(failure('Storage response exceeds bounded transport.'));
        }
      });
      child.stderr.on('data', (bytes: Buffer) => {
        errorText = (errorText + bytes.toString()).slice(-8192);
      });
      child.on('error', (error) => finish(failure(`Storage helper unavailable: ${error.message}`)));
      child.stdin.on('error', () => {
        /* close/error handles early helper exit */
      });
      child.on('close', (code) => {
        if (code !== 0) {
          finish(failure(`Storage lock/helper failed (${code}): ${errorText}`));
          return;
        }
        try {
          const reply = JSON.parse(output) as JobReply<T>;
          if (
            !reply ||
            !['ok', 'unknown', 'unavailable', 'denied', 'unsupported', 'invalid'].includes(
              reply.status,
            )
          )
            throw new Error('Invalid helper reply.');
          finish(reply);
        } catch {
          finish(failure('Storage helper returned no valid persistence reply.'));
        }
      });
      child.stdin.end(input);
    });
  };
  const initialized = await invoke<StoragePolicy>(
    'init',
    options.policy ? { policy } : { policy: undefined },
  );
  // Fresh roots need the default policy; retry only a missing initial policy, not corrupt state.
  if (initialized.status !== 'ok') {
    const retry = options.policy ? initialized : await invoke<StoragePolicy>('init', { policy });
    if (retry.status !== 'ok')
      throw new Error(`Storage policy initialization failed: ${retry.reason}`);
    policy = retry.value;
  } else policy = initialized.value;
  const memory = new Map<string, MemoryJob>();
  const warnings = new Map<string, StorageDiagnostic>();
  let closed = false;
  const warn = (job: JobIdentity, reason: string) => {
    const k = key(job);
    const local = memory.get(k);
    if (!local) return;
    local.degraded = true;
    warnings.set(k + ':persistence', {
      kind: 'persistence-loss',
      job: clone(job),
      reason: reason.slice(0, 8192),
      reducedRecoverability: true,
    });
  };
  const forget = (k: string) => {
    memory.delete(k);
    warnings.delete(k + ':persistence');
    warnings.delete(k + ':output');
  };
  const localFor = (reservation: StorageReservation) => {
    const local = memory.get(key(reservation.job));
    return local &&
      local.reservation.reservationId === reservation.reservationId &&
      sameJob(local.reservation.job, reservation.job)
      ? local
      : undefined;
  };
  const reserve = async (
    request: LaunchRequest,
    overrides?: { outputBytes?: number },
  ): Promise<JobReply<StorageReservation>> => {
    if (closed) return failure('Storage instance closed.');
    if ([...memory.values()].some((j) => j.degraded))
      return failure(
        'Reduced recoverability must be reconciled before new admissions on this instance.',
      );
    if (!validRequest(request)) return invalid('Invalid launch request.');
    const reply = await invoke<{
      reservation: StorageReservation;
      policy: StoragePolicy;
      presentKeys: string[];
    }>('reserve', { launch: request, outputBytes: overrides?.outputBytes });
    if (reply.status !== 'ok') return reply;
    for (const k of memory.keys()) if (!reply.value.presentKeys.includes(k)) forget(k);
    memory.set(key(request.identity), {
      reservation: clone(reply.value.reservation),
      policy: reply.value.policy,
      queue: Promise.resolve(),
      window: empty(),
      outputLimit: Math.min(reply.value.policy.outputBytes, 64 * 1024),
      outputDegraded: false,
      degraded: false,
    });
    return { status: 'ok', value: reply.value.reservation };
  };
  const jobs: JobStore = {
    reserve,
    async save(reservation, observation) {
      if (closed) return failure('Storage instance closed.');
      if (
        !validJob(reservation?.job) ||
        !validObservation(observation) ||
        !sameJob(reservation.job, observation.identity)
      )
        return invalid('Invalid reservation/observation.');
      let local = localFor(reservation);
      const fits =
        Buffer.byteLength(JSON.stringify(observation)) <=
        (local?.policy.trackingBytes ?? policy.trackingBytes) / 2;
      const reply = await invoke<StoragePolicy>('save', {
        job: reservation.job,
        reservation,
        observation,
      });
      if (!local && reply.status === 'ok') {
        local = {
          reservation: clone(reservation),
          policy: reply.value,
          queue: Promise.resolve(),
          window: empty(),
          outputLimit: Math.min(reply.value.outputBytes, 64 * 1024),
          outputDegraded: false,
          degraded: false,
        };
        memory.set(key(reservation.job), local);
        const output = await invoke<{ bytes: string; seen: number; head: number }>('output-read', {
          job: reservation.job,
        });
        if (output.status === 'ok')
          local.window = {
            bytes: Buffer.from(output.value.bytes, 'base64'),
            seen: output.value.seen,
            head: output.value.head,
          };
        else {
          local.unavailableOutput = output.reason;
          warn(reservation.job, output.reason);
        }
      }
      if (!local) return reply.status === 'ok' ? { status: 'ok', value: undefined } : reply;
      if (reply.status === 'ok' || fits) local.observation = clone(observation);
      else {
        const { runtimeId, ownerId, sessionId, jobId, producerId } = observation.identity;
        local.observation = {
          identity: { runtimeId, ownerId, sessionId, jobId, producerId },
          execution: {
            state: 'unknown',
            reason:
              'Oversized tracking state was not retained; persistence/recoverability reduced.',
          },
          delivery: { mode: observation.delivery.mode, state: 'unknown' },
          awaiting: observation.awaiting,
          lifetime: observation.lifetime,
          capabilities: {
            stop: false,
            setAwaiting: false,
            setDelivery: false,
            readOutput: false,
            readResult: false,
          },
        };
      }
      if (reply.status !== 'ok') warn(reservation.job, reply.reason);
      return reply.status === 'ok' ? { status: 'ok', value: undefined } : reply;
    },
    async read(job) {
      if (!validJob(job)) return invalid('Invalid job identity.');
      const local = memory.get(key(job));
      const reply = await invoke<JobObservation>('read', { job });
      if (reply.status === 'unavailable' && local && !local.degraded) forget(key(job));
      if (local?.observation && (reply.status === 'ok' || local.degraded))
        return { status: 'ok', value: clone(local.observation) };
      return reply;
    },
  };
  const results: ResultSink = {
    async save(result) {
      if (closed) return failure('Storage instance closed.');
      if (!validResult(result)) return invalid('Invalid final result.');
      const job = result.identity.job,
        local = memory.get(key(job));
      if (local && Buffer.byteLength(JSON.stringify(result)) > local.policy.resultBytes) {
        warn(job, 'Final result exceeds reserved completion capacity.');
        return failure('Final result exceeds reserved completion capacity.');
      }
      if (local?.result && !isDeepStrictEqual(local.result, result))
        return invalid('Saved result is immutable.');
      const reply = await invoke<null>('result-save', { job, result });
      if (local && (reply.status === 'ok' || reply.status === 'unavailable'))
        local.result = clone(result);
      if (reply.status !== 'ok') warn(job, reply.reason);
      return reply.status === 'ok' ? { status: 'ok', value: undefined } : reply;
    },
    async read(identity: ResultIdentity) {
      if (!validJob(identity?.job)) return invalid('Invalid result identity.');
      const local = memory.get(key(identity.job));
      const reply = await invoke<FinalResult>('result-read', {
        job: identity.job,
        resultId: identity.resultId,
      });
      if (
        reply.status !== 'ok' &&
        local?.degraded &&
        local.result?.identity.resultId === identity.resultId
      )
        return { status: 'ok', value: clone(local.result) };
      return reply;
    },
  };
  return {
    agentDirectory,
    root,
    jobs,
    results,
    reserve,
    output(reservation) {
      if (!validJob(reservation?.job) || !localFor(reservation))
        throw new Error('Output requires a held admission reservation.');
      const local = localFor(reservation)!;
      return {
        append(chunk) {
          const next = local.queue.then(async () => {
            for (let offset = 0; offset < chunk.bytes.length; offset += 64 * 1024) {
              const bytes = Buffer.from(chunk.bytes.subarray(offset, offset + 64 * 1024));
              const reply = closed
                ? failure<{ bytes: string; seen: number; head: number }>('Storage closed.')
                : await invoke<{ bytes: string; seen: number; head: number }>('append', {
                    job: reservation.job,
                    reservation,
                    bytes: bytes.toString('base64'),
                    ...(local.outputDegraded
                      ? {
                          resumeWindow: {
                            bytes: local.window.bytes.toString('base64'),
                            seen: local.window.seen,
                            head: local.window.head,
                          },
                        }
                      : {}),
                  });
              if (reply.status === 'ok') {
                local.outputDegraded = false;
                local.window = {
                  bytes: Buffer.from(reply.value.bytes, 'base64'),
                  seen: reply.value.seen,
                  head: reply.value.head,
                };
                local.outputLimit = Math.max(local.outputLimit, local.window.bytes.length);
                const omittedBytes = local.window.seen - local.window.bytes.length;
                if (omittedBytes)
                  warnings.set(key(reservation.job) + ':output', {
                    kind: 'output-loss',
                    job: clone(reservation.job),
                    reason:
                      'Retained output is incomplete; configured/shared bounds omitted bytes.',
                    reducedRecoverability: false,
                    omittedBytes,
                  });
              } else {
                local.outputDegraded = true;
                local.window = appendWindow(local.window, bytes, local.outputLimit);
                warn(reservation.job, reply.reason);
              }
            }
          });
          local.queue = next.catch(() => {});
          return next;
        },
      };
    },
    async readOutput(job) {
      if (!validJob(job)) return invalid('Invalid job identity.');
      const local = memory.get(key(job));
      const reply = await invoke<{ bytes: string; seen: number; head: number }>('output-read', {
        job,
      });
      let w: ByteWindow;
      if (local?.unavailableOutput) return failure(local.unavailableOutput);
      if (local?.degraded) w = local.window;
      else if (reply.status === 'ok')
        w = {
          bytes: Buffer.from(reply.value.bytes, 'base64'),
          seen: reply.value.seen,
          head: reply.value.head,
        };
      else return reply;
      return {
        status: 'ok',
        value: {
          text: w.bytes.toString('utf8'),
          reference: `jobs-output:${key(job)}`,
          complete: w.seen === w.bytes.length,
          omittedBytes: w.seen - w.bytes.length,
        },
      };
    },
    diagnostics: () => clone([...warnings.values()]),
    async cleanup(now) {
      const reply = await invoke<{
        removed: number;
        committedBytes: number;
        removedKeys: string[];
      }>('cleanup', { now });
      if (reply.status !== 'ok') return reply;
      for (const k of reply.value.removedKeys) {
        forget(k);
      }
      return {
        status: 'ok',
        value: { removed: reply.value.removed, committedBytes: reply.value.committedBytes },
      };
    },
    async setUserPolicy(next) {
      if (!validPolicy(next)) return invalid('Invalid user policy.');
      const reply = await invoke<StoragePolicy>('policy', { policy: next });
      if (reply.status === 'ok') policy = reply.value;
      return reply;
    },
    async close() {
      if (closed) return { status: 'ok', value: undefined };
      closed = true;
      await Promise.allSettled([...memory.values()].map((local) => local.queue));
      if (options.ephemeral)
        for (const local of memory.values()) {
          const reply = await invoke<null>('delete', {
            job: local.reservation.job,
            reservation: local.reservation,
          });
          if (reply.status !== 'ok') return reply;
        }
      memory.clear();
      return { status: 'ok', value: undefined };
    },
  };
}
