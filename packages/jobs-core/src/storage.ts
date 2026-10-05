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
  createdHere: boolean;
  cancelledAdmission: boolean;
  durableDigest?: string;
  reservation: StorageReservation;
  observation?: JobObservation;
  unavailableOutput?: string;
  result?: FinalResult;
  window: ByteWindow;
  outputLimit: number;
  policy: StoragePolicy;
  queue: Promise<void>;
  resultQueue: Promise<void>;
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
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      let prelude = '',
        responseLimit: number | undefined,
        received = 0;
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
      child.stdout.on('data', (piece: string) => {
        if (settled) return;
        if (responseLimit === undefined) {
          prelude += piece;
          const newline = prelude.indexOf('\n');
          if (Buffer.byteLength(newline < 0 ? prelude : prelude.slice(0, newline)) > 1024) {
            child.kill('SIGKILL');
            finish(failure('Invalid bounded storage response header.'));
            return;
          }
          if (newline < 0) return;
          try {
            const header = JSON.parse(prelude.slice(0, newline));
            if (header?.format !== 1 || !Number.isSafeInteger(header.limit) || header.limit <= 0)
              throw new Error('Invalid header.');
            responseLimit = header.limit;
            piece = prelude.slice(newline + 1);
            prelude = '';
          } catch {
            child.kill('SIGKILL');
            finish(failure('Invalid bounded storage response header.'));
            return;
          }
        }
        received += Buffer.byteLength(piece);
        if (received > responseLimit!) {
          child.kill('SIGKILL');
          finish(failure('Storage response exceeds bounded transport.'));
          return;
        }
        output += piece;
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
  let cleanupComplete = false;
  const admissions = new Set<Promise<JobReply<StorageReservation>>>();
  const confirmedRemoved = (
    reply: JobReply<unknown>,
  ): reply is { status: 'unavailable'; reason: string; removed: true } =>
    reply.status === 'unavailable' && 'removed' in reply && reply.removed === true;
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
  const reservationRejected = (
    reply: JobReply<unknown>,
  ): reply is { status: 'invalid'; reason: string; reservationRejected: true } =>
    reply.status === 'invalid' &&
    'reservationRejected' in reply &&
    reply.reservationRejected === true;
  const forgetLocal = (job: JobIdentity, local: MemoryJob | undefined) => {
    if (memory.get(key(job)) === local) forget(key(job));
  };
  const obsolete = (job: JobIdentity, local: MemoryJob | undefined, reply: JobReply<unknown>) => {
    if (!reservationRejected(reply)) return false;
    forgetLocal(job, local);
    return true;
  };
  const localFor = (reservation: StorageReservation) => {
    const local = memory.get(key(reservation.job));
    return local &&
      local.reservation.reservationId === reservation.reservationId &&
      sameJob(local.reservation.job, reservation.job)
      ? local
      : undefined;
  };
  const reserveImpl = async (
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
      createdHere: true,
      cancelledAdmission: closed,
      durableDigest: 'missing',
      reservation: clone(reply.value.reservation),
      policy: reply.value.policy,
      queue: Promise.resolve(),
      resultQueue: Promise.resolve(),
      window: empty(),
      outputLimit: Math.min(reply.value.policy.outputBytes, 64 * 1024),
      outputDegraded: false,
      degraded: false,
    });
    return closed
      ? failure('Admission raced storage closure; no launch may start.')
      : { status: 'ok', value: reply.value.reservation };
  };
  const reserve = (
    request: LaunchRequest,
    overrides?: { outputBytes?: number },
  ): Promise<JobReply<StorageReservation>> => {
    const pending = reserveImpl(request, overrides);
    admissions.add(pending);
    void pending.then(
      () => admissions.delete(pending),
      () => admissions.delete(pending),
    );
    return pending;
  };
  const jobs: JobStore = {
    reserve,
    async save(reservationInput, observationInput) {
      if (closed) return failure('Storage instance closed.');
      if (
        !validJob(reservationInput?.job) ||
        !validObservation(observationInput) ||
        !sameJob(reservationInput.job, observationInput.identity)
      )
        return invalid('Invalid reservation/observation.');
      const { runtimeId, ownerId, sessionId, jobId, producerId } = reservationInput.job;
      const job: JobIdentity = { runtimeId, ownerId, sessionId, jobId, producerId };
      const reservation: StorageReservation = {
        job,
        reservationId: reservationInput.reservationId,
      };
      let local = localFor(reservation);
      const serialized = JSON.stringify(observationInput);
      const fits =
        Buffer.byteLength(serialized) <= (local?.policy.trackingBytes ?? policy.trackingBytes);
      const observation: JobObservation | undefined = fits
        ? (JSON.parse(serialized) as JobObservation)
        : undefined;
      if (observation && !validObservation(observation))
        return invalid('Invalid observation snapshot.');
      const unknown: JobObservation = {
        identity: job,
        execution: {
          state: 'unknown',
          reason: 'Oversized tracking state was not retained; persistence/recoverability reduced.',
        },
        delivery: { mode: observationInput.delivery.mode, state: 'unknown' },
        awaiting: observationInput.awaiting,
        lifetime: observationInput.lifetime,
        capabilities: {
          stop: false,
          setAwaiting: false,
          setDelivery: false,
          readOutput: false,
          readResult: false,
        },
      };
      let reply: JobReply<StoragePolicy>;
      if (observation)
        reply = await invoke<StoragePolicy>('save', { job, reservation, observation });
      else {
        const checked = await invoke<JobObservation>('read', { job, reservation });
        reply =
          checked.status === 'ok'
            ? failure('Tracking payload exceeds reserved capacity.')
            : checked;
      }
      if (obsolete(job, local, reply))
        return invalid(reply.status === 'invalid' ? reply.reason : 'Obsolete reservation.');
      if (confirmedRemoved(reply)) {
        forgetLocal(job, local);
        return failure(reply.reason);
      }
      if (reply.status !== 'ok' && reply.status !== 'unavailable') return reply;
      if (!local && reply.status === 'ok') {
        local = {
          createdHere: false,
          cancelledAdmission: false,
          reservation,
          policy: reply.value,
          queue: Promise.resolve(),
          resultQueue: Promise.resolve(),
          window: empty(),
          outputLimit: Math.min(reply.value.outputBytes, 64 * 1024),
          outputDegraded: false,
          degraded: false,
        };
        memory.set(key(job), local);
        const output = await invoke<{ bytes: string; seen: number; head: number; digest: string }>(
          'output-read',
          { job, reservation },
        );
        if (obsolete(job, local, output))
          return invalid(output.status === 'invalid' ? output.reason : 'Obsolete reservation.');
        if (confirmedRemoved(output)) {
          forgetLocal(job, local);
          return failure(output.reason);
        }
        if (output.status === 'ok') {
          local.durableDigest = output.value.digest;
          local.window = {
            bytes: Buffer.from(output.value.bytes, 'base64'),
            seen: output.value.seen,
            head: output.value.head,
          };
          local.outputLimit = Math.max(local.outputLimit, local.window.bytes.length);
        } else {
          local.unavailableOutput = output.reason;
          warn(job, output.reason);
        }
      }
      if (!local) return reply.status === 'ok' ? { status: 'ok', value: undefined } : reply;
      if (memory.get(key(job)) === local) local.observation = observation ?? unknown;
      if (reply.status === 'unavailable') warn(job, reply.reason);
      return reply.status === 'ok' ? { status: 'ok', value: undefined } : reply;
    },
    async read(job) {
      if (!validJob(job)) return invalid('Invalid job identity.');
      let local = memory.get(key(job));
      let reply = await invoke<JobObservation>('read', { job, reservation: local?.reservation });
      if (obsolete(job, local, reply)) {
        local = undefined;
        reply = await invoke<JobObservation>('read', { job });
      }
      if (confirmedRemoved(reply)) {
        forgetLocal(job, local);
        return failure(reply.reason);
      }
      if (reply.status === 'unavailable' && local) warn(job, reply.reason);
      if (local?.observation && (reply.status === 'ok' || local.degraded))
        return { status: 'ok', value: clone(local.observation) };
      return reply;
    },
  };
  const results: ResultSink = {
    async save(result) {
      if (closed) return failure('Storage instance closed.');
      if (!validResult(result)) return invalid('Invalid final result.');
      const local = memory.get(key(result.identity.job));
      const fits = !local || Buffer.byteLength(JSON.stringify(result)) <= local.policy.resultBytes;
      const snapshot = fits && local ? clone(result) : result;
      const { runtimeId, ownerId, sessionId, jobId, producerId } = snapshot.identity.job;
      const job: JobIdentity = { runtimeId, ownerId, sessionId, jobId, producerId };
      const commit = async (): Promise<JobReply<void>> => {
        if (closed) return failure('Storage instance closed.');
        if (local && memory.get(key(job)) !== local)
          return invalid('Reservation cache is obsolete.');
        if (!fits) {
          warn(job, 'Final result exceeds reserved completion capacity.');
          return failure('Final result exceeds reserved completion capacity.');
        }
        if (local?.result && !isDeepStrictEqual(local.result, snapshot))
          return invalid('Saved result is immutable.');
        const reply = await invoke<null>('result-save', {
          job,
          result: snapshot,
          reservation: local?.reservation,
        });
        if (obsolete(job, local, reply))
          return invalid(reply.status === 'invalid' ? reply.reason : 'Obsolete reservation.');
        if (confirmedRemoved(reply)) {
          forgetLocal(job, local);
          return failure(reply.reason);
        }
        if (local && (reply.status === 'ok' || reply.status === 'unavailable')) {
          if (local.result && !isDeepStrictEqual(local.result, snapshot))
            return invalid('Saved result is immutable.');
          if (memory.get(key(job)) === local) local.result = snapshot;
        }
        if (reply.status === 'unavailable') warn(job, reply.reason);
        return reply.status === 'ok' ? { status: 'ok', value: undefined } : reply;
      };
      if (!local) return commit();
      const pending = local.resultQueue.then(commit);
      local.resultQueue = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    async read(identity: ResultIdentity) {
      if (!validJob(identity?.job)) return invalid('Invalid result identity.');
      let local = memory.get(key(identity.job));
      let reply = await invoke<FinalResult>('result-read', {
        job: identity.job,
        resultId: identity.resultId,
        reservation: local?.reservation,
      });
      if (obsolete(identity.job, local, reply)) {
        local = undefined;
        reply = await invoke<FinalResult>('result-read', {
          job: identity.job,
          resultId: identity.resultId,
        });
      }
      if (reply.status === 'ok' && local && memory.get(key(identity.job)) === local)
        local.result = clone(reply.value);
      if (confirmedRemoved(reply)) {
        forgetLocal(identity.job, local);
        return failure(reply.reason);
      }
      if (
        reply.status === 'unavailable' &&
        'absence' in reply &&
        reply.absence === 'identity-mismatch'
      )
        return failure(reply.reason);
      if (
        reply.status === 'unavailable' &&
        local &&
        (!('absence' in reply) || (reply.absence === 'not-saved' && local.result !== undefined))
      )
        warn(identity.job, reply.reason);
      if (
        reply.status !== 'ok' &&
        local?.degraded &&
        local.result?.identity.resultId === identity.resultId
      )
        return { status: 'ok', value: clone(local.result) };
      return reply.status === 'unavailable' ? failure(reply.reason) : reply;
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
              let reply =
                closed || (local.unavailableOutput && local.outputDegraded)
                  ? failure<{ bytes: string; seen: number; head: number; digest: string }>(
                      closed
                        ? 'Storage closed.'
                        : 'Earlier output history is unknown; bounded capture is not recoverable on this instance.',
                    )
                  : await invoke<{ bytes: string; seen: number; head: number; digest: string }>(
                      'append',
                      {
                        job: reservation.job,
                        reservation,
                        bytes: bytes.toString('base64'),
                        baselineDigest: local.durableDigest,
                        ...(local.outputDegraded
                          ? {
                              resumeWindow: {
                                bytes: local.window.bytes.toString('base64'),
                                seen: local.window.seen,
                                head: local.window.head,
                              },
                            }
                          : {}),
                      },
                    );
              if (
                reply.status === 'unavailable' &&
                'historyMissing' in reply &&
                reply.historyMissing === true
              ) {
                warn(reservation.job, reply.reason);
                if (
                  !local.unavailableOutput &&
                  local.durableDigest &&
                  local.durableDigest !== 'missing'
                )
                  reply = await invoke<{
                    bytes: string;
                    seen: number;
                    head: number;
                    digest: string;
                  }>('append', {
                    job: reservation.job,
                    reservation,
                    bytes: bytes.toString('base64'),
                    baselineDigest: local.durableDigest,
                    resumeWindow: {
                      bytes: local.window.bytes.toString('base64'),
                      seen: local.window.seen,
                      head: local.window.head,
                    },
                  });
                else local.unavailableOutput = reply.reason;
              }
              if (obsolete(reservation.job, local, reply)) return;
              if (confirmedRemoved(reply)) {
                forgetLocal(reservation.job, local);
                return;
              }
              if (reply.status === 'ok') {
                local.durableDigest = reply.value.digest;
                local.outputDegraded = false;
                delete local.unavailableOutput;
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
                if ('conflict' in reply && reply.conflict === true)
                  local.unavailableOutput = reply.reason;
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
      let local = memory.get(key(job));
      let reply = await invoke<{ bytes: string; seen: number; head: number; digest: string }>(
        'output-read',
        {
          job,
          reservation: local?.reservation,
        },
      );
      if (obsolete(job, local, reply)) {
        local = undefined;
        reply = await invoke<{ bytes: string; seen: number; head: number; digest: string }>(
          'output-read',
          { job },
        );
      }
      if (confirmedRemoved(reply)) {
        forgetLocal(job, local);
        return failure(reply.reason);
      }
      if (reply.status === 'ok' && local && !local.outputDegraded) {
        delete local.unavailableOutput;
        local.durableDigest = reply.value.digest;
        local.window = {
          bytes: Buffer.from(reply.value.bytes, 'base64'),
          seen: reply.value.seen,
          head: reply.value.head,
        };
        local.outputLimit = Math.max(local.outputLimit, local.window.bytes.length);
      }
      if (reply.status === 'unavailable' && local) warn(job, reply.reason);
      let w: ByteWindow;
      if (local?.unavailableOutput) return failure(local.unavailableOutput);
      if (local) w = local.window;
      else if (reply.status === 'ok')
        w = {
          bytes: Buffer.from(reply.value.bytes, 'base64'),
          seen: reply.value.seen,
          head: reply.value.head,
        };
      else return reply.status === 'unavailable' ? failure(reply.reason) : reply;
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
      if (cleanupComplete) return { status: 'ok', value: undefined };
      closed = true;
      await Promise.allSettled(admissions);
      await Promise.allSettled(
        [...memory.values()].flatMap((local) => [local.queue, local.resultQueue]),
      );
      for (const local of memory.values()) {
        if (!local.createdHere || (!options.ephemeral && !local.cancelledAdmission)) continue;
        const reply = await invoke<null>('delete', {
          job: local.reservation.job,
          reservation: local.reservation,
        });
        if (obsolete(local.reservation.job, local, reply)) continue;
        if (reply.status !== 'ok') return reply;
        local.createdHere = false;
      }
      memory.clear();
      cleanupComplete = true;
      return { status: 'ok', value: undefined };
    },
  };
}
