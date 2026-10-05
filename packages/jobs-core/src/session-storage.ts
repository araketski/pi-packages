import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { JOBS_CONTRACT_VERSION } from './index.js';
import type {
  FinalResult,
  JobIdentity,
  JobObservation,
  JobReply,
  JobStore,
  LaunchRequest,
  OutputSink,
  OutputWindow,
  ResultSink,
  StorageReservation,
} from './index.js';
import {
  createOutputArtifactIO,
  decodeOutputImage,
  JOBS_OUTPUT_HEADER_BYTES,
  JOBS_OUTPUT_MAX_BYTES,
  OutputCapture,
  validOutputReference,
} from './output-artifact.js';
import type { CapturedBytes, OutputArtifactIO } from './output-artifact.js';

export const JOBS_SESSION_ENTRY_TYPE = 'araketski.pi-jobs/session-store.v1';
export const JOBS_SESSION_ENTRY_MAX_BYTES = 65_536;
export const JOBS_OUTPUT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export interface JobsSessionEntry {
  type?: string;
  customType?: string;
  data?: unknown;
}
export interface JobsSessionCapability {
  readonly sessionId: string;
  readonly persistent: boolean;
  valid(): boolean;
  invalidate(): void;
  append(data: unknown): JobReply<void>;
  read(): Promise<JobReply<readonly unknown[]>>;
}
function ok<T>(value: T): JobReply<T> {
  return { status: 'ok', value };
}
function fail<T>(
  status: 'invalid' | 'unknown' | 'unavailable' | 'denied',
  reason: string,
): JobReply<T> {
  return { status, reason };
}
function reason(error: unknown): string {
  try {
    const value = error instanceof Error ? error.message : String(error);
    return typeof value === 'string' && value.trim()
      ? value.slice(0, 1024)
      : 'Unprintable storage failure.';
  } catch {
    return 'Unprintable storage failure.';
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((name) => allowed.includes(name));
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function identity(value: unknown): value is JobIdentity {
  return (
    record(value) &&
    keys(value, ['runtimeId', 'ownerId', 'sessionId', 'jobId', 'producerId']) &&
    ['runtimeId', 'ownerId', 'sessionId', 'jobId', 'producerId'].every((name) => id(value[name]))
  );
}
function key(job: JobIdentity): string {
  return JSON.stringify([job.runtimeId, job.ownerId, job.sessionId, job.jobId, job.producerId]);
}
function same(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(a, b);
}
function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= JOBS_SESSION_ENTRY_MAX_BYTES &&
    value.trim().length > 0
  );
}
function mode(value: unknown): boolean {
  return value === 'automatic' || value === 'next-natural-turn' || value === 'display-only';
}
function outcome(value: unknown): boolean {
  return (
    record(value) &&
    ((value.kind === 'exit' &&
      keys(value, ['kind', 'exitCode']) &&
      Number.isSafeInteger(value.exitCode)) ||
      (value.kind === 'terminated' && keys(value, ['kind', 'signal']) && id(value.signal)) ||
      (value.kind === 'launch-failed' && keys(value, ['kind', 'reason']) && text(value.reason)))
  );
}
function observation(value: unknown): value is JobObservation {
  if (
    !record(value) ||
    !keys(value, ['identity', 'execution', 'delivery', 'awaiting', 'lifetime', 'capabilities']) ||
    !identity(value.identity) ||
    typeof value.awaiting !== 'boolean' ||
    !['managed', 'persistent'].includes(value.lifetime as string) ||
    !record(value.capabilities) ||
    !keys(value.capabilities, ['stop', 'setAwaiting', 'setDelivery', 'readOutput', 'readResult']) ||
    !['stop', 'setAwaiting', 'setDelivery', 'readOutput', 'readResult'].every(
      (name) => typeof (value.capabilities as Record<string, unknown>)[name] === 'boolean',
    )
  )
    return false;
  const execution = value.execution,
    delivery = value.delivery;
  if (
    !record(execution) ||
    !(
      (execution.state === 'running' && keys(execution, ['state'])) ||
      (execution.state === 'unknown' &&
        keys(execution, ['state', 'reason']) &&
        text(execution.reason)) ||
      (execution.state === 'terminal' &&
        keys(execution, ['state', 'outcome']) &&
        outcome(execution.outcome))
    ) ||
    !record(delivery) ||
    !mode(delivery.mode)
  )
    return false;
  if (delivery.state === 'pending' || delivery.state === 'unknown')
    return keys(delivery, ['mode', 'state']);
  if (delivery.state === 'not-required')
    return delivery.mode === 'display-only' && keys(delivery, ['mode', 'state']);
  const receipt = delivery.receipt;
  return (
    delivery.state === 'delivered' &&
    execution.state === 'terminal' &&
    delivery.mode !== 'display-only' &&
    keys(delivery, ['mode', 'state', 'receipt']) &&
    record(receipt) &&
    keys(receipt, ['result', 'record', 'contentDigest']) &&
    record(receipt.result) &&
    keys(receipt.result, ['job', 'resultId']) &&
    identity(receipt.result.job) &&
    key(receipt.result.job) === key(value.identity) &&
    id(receipt.result.resultId) &&
    record(receipt.record) &&
    keys(receipt.record, ['sessionId', 'entryId', 'kind']) &&
    receipt.record.sessionId === value.identity.sessionId &&
    id(receipt.record.entryId) &&
    ['tool-result', 'custom-message'].includes(receipt.record.kind as string) &&
    id(receipt.contentDigest)
  );
}
function finalResult(value: unknown): value is FinalResult {
  return (
    record(value) &&
    keys(value, ['identity', 'outcome', 'content']) &&
    record(value.identity) &&
    keys(value.identity, ['job', 'resultId']) &&
    identity(value.identity.job) &&
    id(value.identity.resultId) &&
    outcome(value.outcome) &&
    typeof value.content === 'string' &&
    value.content.length <= JOBS_SESSION_ENTRY_MAX_BYTES
  );
}
/** Integration supplies synchronous public append, bound to this origin, not a deferred retargeting callback. */
// @mara implements REQ-JOBS-PI-STATE
export function createJobsSessionCapability(options: {
  sessionId: string;
  persistent: boolean;
  isCurrent(): boolean;
  appendEntry(customType: string, data: unknown): undefined;
  readEntries(): readonly unknown[] | Promise<readonly unknown[]>;
}): JobsSessionCapability {
  const { sessionId, persistent } = options;
  if (!id(sessionId) || typeof persistent !== 'boolean')
    throw new Error('Invalid session capability origin.');
  const isCurrent = options.isCurrent.bind(options),
    append = options.appendEntry.bind(options),
    read = options.readEntries.bind(options);
  let active = true;
  const valid = () => {
    try {
      return active && isCurrent() === true;
    } catch {
      return false;
    }
  };
  return Object.freeze<JobsSessionCapability>({
    sessionId,
    persistent,
    valid,
    invalidate() {
      active = false;
    },
    append(data) {
      if (!valid()) return fail('unavailable', 'Origin session capability is invalid.');
      try {
        append(JOBS_SESSION_ENTRY_TYPE, structuredClone(data));
        return valid() ? ok(undefined) : fail('unavailable', 'Origin invalidated during append.');
      } catch (error) {
        return fail('unavailable', reason(error));
      }
    },
    async read() {
      if (!valid()) return fail('unavailable', 'Origin session capability is invalid.');
      try {
        const entries = await read();
        if (!valid()) return fail('unavailable', 'Origin invalidated during read.');
        if (!Array.isArray(entries)) return fail('invalid', 'Invalid session entry list.');
        return ok(entries);
      } catch (error) {
        return fail('unavailable', reason(error));
      }
    },
  });
}

function launchRequest(request: unknown, sessionId: string): request is LaunchRequest {
  return !(
    !record(request) ||
    !keys(request as unknown as Record<string, unknown>, [
      'identity',
      'authority',
      'awaiting',
      'delivery',
      'lifetime',
      'hardTimeoutMs',
    ]) ||
    !identity(request.identity) ||
    request.identity.sessionId !== sessionId ||
    !record(request.authority) ||
    !keys(request.authority as unknown as Record<string, unknown>, [
      'runtimeId',
      'ownerId',
      'generation',
    ]) ||
    !id(request.authority.generation) ||
    request.authority.runtimeId !== request.identity.runtimeId ||
    request.authority.ownerId !== request.identity.ownerId ||
    typeof request.awaiting !== 'boolean' ||
    !mode(request.delivery) ||
    (request.lifetime !== 'managed' && request.lifetime !== 'persistent') ||
    (request.hardTimeoutMs !== undefined &&
      (typeof request.hardTimeoutMs !== 'number' ||
        !Number.isSafeInteger(request.hardTimeoutMs) ||
        request.hardTimeoutMs < 0))
  );
}

export interface StorageIntent {
  kind: 'stop-requested' | 'stop-unconfirmed';
  reason: string;
}
export interface StoredJob {
  observation: JobObservation;
  outputReference: string;
  historical: boolean;
  result?: FinalResult;
  intent?: StorageIntent;
  diagnostics: string[];
  resumability: 'pi-session' | 'memory-only';
}
export interface CapturedOutput extends Partial<CapturedBytes> {
  reference: string;
  availability: 'saved' | 'memory-only' | 'missing' | 'expired' | 'corrupt';
  diagnostics: string[];
}
export interface ModelOutputExcerpt {
  text: string;
  reference: string;
  capturedComplete: boolean;
  capturedOmittedBytes: number;
  presentationTruncated: boolean;
}
export interface SessionJobStorage {
  jobStore: JobStore;
  resultSink: ResultSink;
  output(reservation: StorageReservation): JobReply<OutputSink>;
  inspect(job: JobIdentity): Promise<JobReply<StoredJob>>;
  readCapturedOutput(job: JobIdentity): Promise<JobReply<CapturedOutput>>;
  readOutput(job: JobIdentity): Promise<JobReply<OutputWindow>>;
  /** Inject public native Pi truncation; presentation loss is NOT captured-byte loss. */
  readExcerpt(
    job: JobIdentity,
    truncate: (text: string) => { content: string; truncated: boolean },
  ): Promise<JobReply<ModelOutputExcerpt>>;
  recordIntent(reservation: StorageReservation, intent: StorageIntent): Promise<JobReply<void>>;
  replay(): Promise<JobReply<readonly StoredJob[]>>;
  replaceSessionCapability(capability: JobsSessionCapability): JobReply<void>;
  expireEligibleOutputs(): Promise<JobReply<{ expired: string[]; failed: string[] }>>;
  /** Not execution cancellation; wait for caller-owned draining before orderly disposal. */
  dispose(): Promise<void>;
}
interface Metadata {
  formatVersion: 1;
  contractVersion: string;
  kind: 'admitted' | 'observation' | 'intent' | 'result';
  revision: number;
  identity: JobIdentity;
  outputReference: string;
  observation: JobObservation;
  result?: FinalResult;
  intent?: StorageIntent;
  eligibleAtMs?: number;
}
interface Owner {
  metadata: Metadata;
  historical: boolean;
  ready: boolean;
  token?: StorageReservation;
  capture?: OutputCapture;
  captureRevision: number;
  persistedRevision: number;
  admission?: Promise<JobReply<StorageReservation>>;
  writer?: Promise<void>;
  expiration?: Promise<boolean>;
  historicalRead?: Promise<CapturedOutput>;
  outputFailed: boolean;
  expired: boolean;
  metadataAccepted: boolean;
  metadataError?: string;
  outputError?: string;
  counterError?: string;
}
function eligible(m: Metadata): boolean {
  return (
    m.observation.execution.state === 'terminal' &&
    ['delivered', 'not-required'].includes(m.observation.delivery.state)
  );
}
function fits(value: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(value)).length <= JOBS_SESSION_ENTRY_MAX_BYTES;
}
function intent(value: unknown): value is StorageIntent {
  return (
    record(value) &&
    keys(value, ['kind', 'reason']) &&
    ['stop-requested', 'stop-unconfirmed'].includes(value.kind as string) &&
    text(value.reason)
  );
}
function metadata(value: unknown, sessionId: string): value is Metadata {
  if (
    !record(value) ||
    !keys(value, [
      'formatVersion',
      'contractVersion',
      'kind',
      'revision',
      'identity',
      'outputReference',
      'observation',
      'result',
      'intent',
      'eligibleAtMs',
    ]) ||
    value.formatVersion !== 1 ||
    value.contractVersion !== JOBS_CONTRACT_VERSION ||
    !['admitted', 'observation', 'intent', 'result'].includes(value.kind as string) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    !identity(value.identity) ||
    value.identity.sessionId !== sessionId ||
    !validOutputReference(value.outputReference) ||
    !observation(value.observation) ||
    key(value.observation.identity) !== key(value.identity) ||
    !fits(value)
  )
    return false;
  if (
    value.result !== undefined &&
    (!finalResult(value.result) ||
      key(value.result.identity.job) !== key(value.identity) ||
      value.observation.execution.state !== 'terminal' ||
      !same(value.result.outcome, value.observation.execution.outcome))
  )
    return false;
  if (value.intent !== undefined && !intent(value.intent)) return false;
  if (
    value.eligibleAtMs !== undefined &&
    (!Number.isSafeInteger(value.eligibleAtMs) ||
      (value.eligibleAtMs as number) < 0 ||
      !eligible(value as unknown as Metadata))
  )
    return false;
  return !(
    value.observation.delivery.state === 'delivered' &&
    value.result !== undefined &&
    value.observation.delivery.receipt.result.resultId !== value.result.identity.resultId
  );
}
function detached<T>(value: T): T {
  return structuredClone(value);
}
function diagnostics(owner: Owner): string[] {
  return [owner.metadataError, owner.outputError, owner.counterError].filter(
    (v): v is string => v !== undefined,
  );
}

/** One in-process capture owner per admitted job; disk replies never become owner state. */
// @mara implements DES-JOBS-SESSION-STORE
// @mara implements REQ-JOBS-OUTPUT-BOUNDS
// @mara implements REQ-JOBS-RETENTION
// @mara implements REQ-JOBS-STORAGE-FAILURE
export function createSessionJobStorage(options: {
  sessionId: string;
  outputRoot: string;
  session?: JobsSessionCapability;
  maxBytes?: number;
  prefixBytes?: number;
  retentionMs?: number;
  now?: () => number;
  io?: OutputArtifactIO;
}): SessionJobStorage {
  const { sessionId } = options;
  const max = options.maxBytes ?? JOBS_OUTPUT_MAX_BYTES,
    prefix = options.prefixBytes ?? Math.min(65_536, Math.floor(max / 2));
  const retention = options.retentionMs ?? JOBS_OUTPUT_RETENTION_MS,
    now = options.now?.bind(options) ?? Date.now;
  if (!id(sessionId) || !Number.isSafeInteger(retention) || retention < 0)
    throw new Error('Invalid storage options.');
  // Validate bounds without allocating a ten-megabyte dummy buffer.
  if (
    !Number.isSafeInteger(max) ||
    max < 2 ||
    max > JOBS_OUTPUT_MAX_BYTES ||
    !Number.isSafeInteger(prefix) ||
    prefix < 1 ||
    prefix >= max
  )
    throw new Error('Invalid output bounds.');
  let session = options.session;
  if (session && (session.sessionId !== sessionId || !session.valid()))
    throw new Error('Invalid initial session capability.');
  const persistent = session?.persistent === true;
  const rawIO = options.io ?? createOutputArtifactIO(options.outputRoot);
  const io = {
    write: rawIO.write.bind(rawIO),
    read: rawIO.read.bind(rawIO),
    remove: rawIO.remove.bind(rawIO),
  };
  const owners = new Map<string, Owner>();
  let disposed = false;
  const time = () => {
    const t = now();
    if (!Number.isSafeInteger(t) || t < 0) throw new Error('Invalid storage wall clock.');
    return t;
  };
  const locate = (job: JobIdentity): Owner | undefined =>
    identity(job) ? owners.get(key(job)) : undefined;
  const snapshot = (owner: Owner): StoredJob => {
    const m = owner.metadata,
      observation = detached(m.observation);
    if (owner.historical) {
      if (observation.execution.state !== 'terminal')
        observation.execution = {
          state: 'unknown',
          reason: 'Saved execution is historical, not live ownership.',
        };
      observation.capabilities = {
        stop: false,
        setAwaiting: false,
        setDelivery: false,
        readOutput: true,
        readResult: m.result !== undefined,
      };
    }
    return {
      observation,
      outputReference: m.outputReference,
      historical: owner.historical,
      ...(m.result ? { result: detached(m.result) } : {}),
      ...(m.intent ? { intent: detached(m.intent) } : {}),
      diagnostics: diagnostics(owner),
      resumability: persistent && owner.metadataAccepted ? 'pi-session' : 'memory-only',
    };
  };
  const appendMetadata = (owner: Owner): JobReply<void> => {
    const reply = session ? session.append(owner.metadata) : ok(undefined);
    owner.metadataAccepted = reply.status === 'ok';
    owner.metadataError = reply.status === 'ok' ? undefined : reply.reason;
    return reply;
  };
  const tokenOwner = (token: StorageReservation): Owner | undefined => {
    const owner = record(token) && identity(token.job) ? locate(token.job) : undefined;
    return owner?.ready && !owner.historical && token.reservationId === owner.token?.reservationId
      ? owner
      : undefined;
  };
  const flush = (owner: Owner): Promise<void> => {
    if (owner.writer) return owner.writer;
    if (owner.outputFailed || owner.expired || !owner.capture) return Promise.resolve();
    // Publish the promise before invoking injected I/O, including synchronous reentrancy.
    const writer = Promise.resolve().then(async () => {
      while (
        !owner.outputFailed &&
        !owner.expired &&
        owner.persistedRevision < owner.captureRevision
      ) {
        const revision = owner.captureRevision;
        try {
          const image = owner.capture!.image(owner.metadata.outputReference);
          await io.write(owner.metadata.outputReference, image);
          owner.persistedRevision = revision;
        } catch (error) {
          owner.outputFailed = true;
          owner.outputError = `Output persistence lost: ${reason(error)}`.slice(0, 1024);
        }
      }
    });
    owner.writer = writer;
    void writer.finally(() => {
      if (owner.writer === writer) owner.writer = undefined;
    });
    return writer;
  };
  const expire = (owner: Owner): Promise<boolean> => {
    if (owner.expiration) return owner.expiration;
    if (owner.expired) return Promise.resolve(true);
    const due = () =>
      eligible(owner.metadata) &&
      owner.metadata.eligibleAtMs !== undefined &&
      time() - owner.metadata.eligibleAtMs >= retention;
    if (!due()) return Promise.resolve(false);
    const expiration = Promise.resolve().then(async () => {
      await owner.writer;
      if (!due()) return false;
      // Prevent later capture from resurrecting an artifact already selected for expiry.
      owner.expired = true;
      try {
        await io.remove(owner.metadata.outputReference);
        return true;
      } catch (error) {
        owner.expired = false;
        owner.outputError = `Output expiry failed: ${reason(error)}`.slice(0, 1024);
        return false;
      }
    });
    owner.expiration = expiration;
    void expiration.finally(() => {
      if (owner.expiration === expiration) owner.expiration = undefined;
    });
    return expiration;
  };
  const commit = (owner: Owner, next: Metadata): JobReply<void> => {
    if (!eligible(next)) delete next.eligibleAtMs;
    else next.eligibleAtMs = owner.metadata.eligibleAtMs ?? time();
    if (!fits(next)) return fail('invalid', 'Compact entry exceeds 65,536 UTF-8 JSON bytes.');
    const comparable = (m: Metadata) => ({ ...m, kind: undefined, revision: undefined });
    if (same(comparable(owner.metadata), comparable(next)))
      return owner.metadataAccepted ? ok(undefined) : appendMetadata(owner);
    if (!Number.isSafeInteger(next.revision))
      return fail('unavailable', 'Metadata revision exhausted.');
    owner.metadata = next;
    return appendMetadata(owner);
  };
  const captureOutput = async (owner: Owner): Promise<CapturedOutput> => {
    await expire(owner);
    const base = { reference: owner.metadata.outputReference, diagnostics: diagnostics(owner) };
    if (owner.expired) return { ...base, availability: 'expired' };
    if (owner.counterError) return { ...base, availability: 'memory-only' };
    if (owner.capture)
      return {
        ...base,
        ...owner.capture.view(),
        availability:
          owner.outputFailed || owner.persistedRevision !== owner.captureRevision
            ? 'memory-only'
            : 'saved',
      };
    if (owner.historicalRead) return owner.historicalRead;
    const reading = Promise.resolve().then(async (): Promise<CapturedOutput> => {
      try {
        const image = await io.read(
          base.reference,
          JOBS_OUTPUT_HEADER_BYTES + 2 * JOBS_OUTPUT_MAX_BYTES,
        );
        if (owner.expired) return { ...base, availability: 'expired' };
        return { ...base, ...decodeOutputImage(base.reference, image), availability: 'saved' };
      } catch (error) {
        return {
          ...base,
          availability: (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'missing' : 'corrupt',
          diagnostics: [...base.diagnostics, reason(error)],
        };
      }
    });
    owner.historicalRead = reading;
    void reading.finally(() => {
      if (owner.historicalRead === reading) owner.historicalRead = undefined;
    });
    return reading;
  };
  const api: SessionJobStorage = {
    jobStore: {
      async reserve(input) {
        if (disposed) return fail('unavailable', 'Storage disposed.');
        let request: LaunchRequest;
        try {
          if (!launchRequest(input, sessionId))
            return fail('invalid', 'Invalid or unbounded launch request.');
          request = detached(input);
        } catch {
          return fail('invalid', 'Invalid launch input.');
        }
        if (!launchRequest(request, sessionId))
          return fail('invalid', 'Invalid originating launch request.');
        if (disposed) return fail('unavailable', 'Storage disposed during input validation.');
        if (owners.has(key(request.identity)))
          return fail('denied', 'Job already admitted or historical; never replay execution.');
        if (session && !session.valid())
          return fail('unavailable', 'Origin session capability is invalid.');
        const token = { job: request.identity, reservationId: randomUUID() };
        const m: Metadata = {
          formatVersion: 1,
          contractVersion: JOBS_CONTRACT_VERSION,
          kind: 'admitted',
          revision: 1,
          identity: request.identity,
          outputReference: `${randomUUID()}.output`,
          observation: {
            identity: request.identity,
            execution: {
              state: 'unknown',
              reason: 'Tracking established; launch outcome not yet observed.',
            },
            delivery: {
              mode: request.delivery,
              state: request.delivery === 'display-only' ? 'not-required' : 'pending',
            },
            awaiting: request.awaiting,
            lifetime: request.lifetime,
            capabilities: {
              stop: false,
              setAwaiting: false,
              setDelivery: false,
              readOutput: true,
              readResult: false,
            },
          },
        };
        const owner: Owner = {
          metadata: m,
          historical: false,
          ready: false,
          token,
          capture: new OutputCapture(max, prefix),
          captureRevision: 0,
          persistedRevision: 0,
          outputFailed: false,
          expired: false,
          metadataAccepted: false,
        };
        owners.set(key(request.identity), owner);
        // Track the whole admission, including failed-setup cleanup, before injected I/O.
        const admission = Promise.resolve().then(
          async (): Promise<JobReply<StorageReservation>> => {
            try {
              if (!fits(m)) throw new Error('Admission entry exceeds compact bound.');
              await io.write(m.outputReference, owner.capture!.image(m.outputReference));
              if (disposed) throw new Error('Storage disposed during setup.');
              const saved = appendMetadata(owner);
              if (saved.status !== 'ok') throw new Error(saved.reason);
              owner.ready = true;
              return ok(detached(token));
            } catch (error) {
              let message = reason(error);
              try {
                await io.remove(m.outputReference);
              } catch (cleanup) {
                message += `; setup cleanup failed: ${reason(cleanup)}`;
              }
              owners.delete(key(request.identity));
              return fail('unavailable', message);
            }
          },
        );
        owner.admission = admission;
        return admission;
      },
      async save(token, input) {
        if (disposed) return fail('unavailable', 'Storage disposed.');
        const owner = tokenOwner(token);
        if (!owner) return fail('denied', 'No admitted storage token.');
        let value: JobObservation;
        try {
          if (!observation(input)) return fail('invalid', 'Invalid or unbounded observation.');
          value = detached(input);
        } catch {
          return fail('invalid', 'Invalid observation.');
        }
        if (!observation(value) || key(value.identity) !== key(owner.metadata.identity))
          return fail('invalid', 'Invalid observation identity/state.');
        const previous = owner.metadata.observation;
        if (previous.execution.state === 'terminal') value.execution = detached(previous.execution);
        if (
          previous.delivery.mode === value.delivery.mode &&
          previous.delivery.state === 'delivered' &&
          value.delivery.state !== 'delivered'
        )
          value.delivery = detached(previous.delivery);
        const next = {
          ...owner.metadata,
          kind: 'observation' as const,
          revision: owner.metadata.revision + 1,
          observation: value,
        };
        if (!metadata({ ...next, eligibleAtMs: undefined }, sessionId))
          return fail('invalid', 'Observation conflicts with saved result/receipt.');
        const reply = commit(owner, next);
        await expire(owner);
        return reply;
      },
      async read(job) {
        const owner = locate(job);
        return owner?.ready
          ? ok(snapshot(owner).observation)
          : fail('unknown', 'Job is not tracked here.');
      },
    },
    resultSink: {
      async save(input) {
        if (disposed) return fail('unavailable', 'Storage disposed.');
        let value: FinalResult;
        try {
          if (!finalResult(input))
            return fail(
              'invalid',
              'Save bounded identity/outcome/content only; no output snapshots.',
            );
          value = detached(input);
        } catch {
          return fail('invalid', 'Invalid compact result.');
        }
        if (!finalResult(value))
          return fail(
            'invalid',
            'Save compact identity/outcome/content only; output snapshots are not accepted.',
          );
        const owner = locate(value.identity.job);
        if (!owner?.ready || owner.historical)
          return fail('denied', 'No live admitted storage owner.');
        if (owner.metadata.result && !same(owner.metadata.result, value))
          return fail('invalid', 'Final result identity/content is immutable.');
        if (
          owner.metadata.observation.execution.state === 'terminal' &&
          !same(owner.metadata.observation.execution.outcome, value.outcome)
        )
          return fail('invalid', 'Result conflicts with known terminal outcome.');
        const next: Metadata = {
          ...owner.metadata,
          kind: 'result',
          revision: owner.metadata.revision + 1,
          result: value,
          observation: {
            ...owner.metadata.observation,
            execution: { state: 'terminal', outcome: value.outcome },
            capabilities: { ...owner.metadata.observation.capabilities, readResult: true },
          },
        };
        if (!metadata({ ...next, eligibleAtMs: undefined }, sessionId))
          return fail('invalid', 'Invalid or oversized compact result.');
        const reply = commit(owner, next);
        await expire(owner);
        return reply;
      },
      async read(value) {
        if (!record(value) || !identity(value.job) || !id(value.resultId))
          return fail('invalid', 'Invalid result identity.');
        const owner = locate(value.job);
        return owner?.metadata.result?.identity.resultId === value.resultId
          ? ok(detached(owner.metadata.result))
          : fail('unknown', 'No saved result for this identity.');
      },
    },
    output(token) {
      const owner = tokenOwner(token);
      if (disposed || !owner) return fail('denied', 'No live admitted storage token.');
      return ok({
        append(chunk) {
          if (disposed) return Promise.resolve();
          try {
            owner.capture!.append(chunk.stream, chunk.bytes);
            owner.captureRevision++;
          } catch (error) {
            owner.counterError = reason(error);
            return Promise.resolve();
          }
          return flush(owner);
        },
      });
    },
    async inspect(job) {
      const owner = locate(job);
      return owner?.ready ? ok(snapshot(owner)) : fail('unknown', 'Job is not tracked here.');
    },
    async readCapturedOutput(job) {
      const owner = locate(job);
      return owner?.ready
        ? ok(await captureOutput(owner))
        : fail('unknown', 'Job is not tracked here.');
    },
    async readOutput(job) {
      const reply = await api.readCapturedOutput(job);
      if (reply.status !== 'ok') return reply;
      const value = reply.value;
      if (
        !value.prefix ||
        !value.tail ||
        value.omittedBytes === undefined ||
        value.complete === undefined
      )
        return fail('unavailable', `Output ${value.availability}; saved results remain separate.`);
      const decoder = new TextDecoder();
      return ok({
        text:
          decoder.decode(value.prefix.bytes, { stream: value.omittedBytes === 0 }) +
          decoder.decode(value.tail.bytes),
        reference: value.reference,
        complete: value.complete,
        omittedBytes: value.omittedBytes,
      });
    },
    async readExcerpt(job, truncate) {
      const reply = await api.readOutput(job);
      if (reply.status !== 'ok') return reply;
      try {
        const excerpt = truncate(reply.value.text);
        if (typeof excerpt.content !== 'string' || typeof excerpt.truncated !== 'boolean')
          return fail('invalid', 'Invalid native truncation result.');
        return ok({
          text: excerpt.content,
          reference: reply.value.reference,
          capturedComplete: reply.value.complete,
          capturedOmittedBytes: reply.value.omittedBytes,
          presentationTruncated: excerpt.truncated,
        });
      } catch (error) {
        return fail('unavailable', reason(error));
      }
    },
    async recordIntent(token, input) {
      if (disposed) return fail('unavailable', 'Storage disposed.');
      const owner = tokenOwner(token);
      if (!owner) return fail('denied', 'No live admitted storage token.');
      let value: StorageIntent;
      try {
        if (!intent(input)) return fail('invalid', 'Invalid or unbounded stop intent.');
        value = detached(input);
      } catch {
        return fail('invalid', 'Invalid stop intent.');
      }
      if (!intent(value)) return fail('invalid', 'Invalid stop intent.');
      return commit(owner, {
        ...owner.metadata,
        kind: 'intent',
        revision: owner.metadata.revision + 1,
        intent: value,
      });
    },
    async replay() {
      if (disposed || !session) return fail('unavailable', 'No valid public replay capability.');
      const capability = session;
      const reply = await capability.read();
      if (reply.status !== 'ok') return reply;
      if (disposed || capability !== session || !capability.valid())
        return fail('unavailable', 'Replay capability was replaced or invalidated.');
      for (const entry of reply.value) {
        try {
          if (
            !record(entry) ||
            entry.type !== 'custom' ||
            entry.customType !== JOBS_SESSION_ENTRY_TYPE
          )
            continue;
          if (!metadata(entry.data, sessionId)) continue;
          const m = detached(entry.data);
          if (!metadata(m, sessionId)) continue;
          const existing = owners.get(key(m.identity));
          if (existing && !existing.historical) continue;
          if (
            existing &&
            (existing.metadata.outputReference !== m.outputReference ||
              existing.metadata.revision >= m.revision)
          )
            continue;
          if (existing) {
            const previous = existing.metadata;
            if (
              previous.observation.execution.state === 'terminal' &&
              (m.observation.execution.state !== 'terminal' ||
                !same(previous.observation.execution, m.observation.execution))
            )
              continue;
            if (previous.result && (!m.result || !same(previous.result, m.result))) continue;
            if (
              previous.observation.delivery.mode === m.observation.delivery.mode &&
              previous.observation.delivery.state === 'delivered' &&
              m.observation.delivery.state !== 'delivered'
            )
              continue;
            existing.metadata = m;
          } else
            owners.set(key(m.identity), {
              metadata: m,
              historical: true,
              ready: true,
              captureRevision: 0,
              persistedRevision: 0,
              outputFailed: false,
              expired: false,
              metadataAccepted: true,
            });
        } catch {
          /* Ignore invalid assertions without erasing accepted evidence. */
        }
      }
      return ok([...owners.values()].filter((owner) => owner.ready).map(snapshot));
    },
    replaceSessionCapability(capability) {
      if (
        disposed ||
        capability.sessionId !== sessionId ||
        capability.persistent !== persistent ||
        !capability.valid()
      )
        return fail('invalid', 'Replacement must be a fresh valid same-origin capability.');
      session = capability;
      return ok(undefined);
    },
    async expireEligibleOutputs() {
      const expired: string[] = [],
        failed: string[] = [];
      for (const owner of owners.values()) {
        if (!owner.ready) continue;
        const hadError = owner.outputError;
        if (await expire(owner)) expired.push(owner.metadata.outputReference);
        else if (owner.outputError !== hadError) failed.push(owner.metadata.outputReference);
      }
      return ok({ expired, failed });
    },
    async dispose() {
      disposed = true;
      for (const owner of owners.values()) {
        await owner.admission;
        await owner.writer;
        await owner.expiration;
        if (!persistent && !owner.historical) {
          try {
            await io.remove(owner.metadata.outputReference);
            owner.expired = true;
          } catch (error) {
            owner.outputError = `Temporary cleanup failed: ${reason(error)}`.slice(0, 1024);
          }
        }
      }
    },
  };
  return api;
}
