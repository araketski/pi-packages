import { randomUUID } from 'node:crypto';
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

export const JOBS_STORAGE_ENTRY_TYPE = 'araketski.pi-jobs/storage';
export const JOBS_STORAGE_ENTRY_BYTES = 65_536;
export const JOBS_OUTPUT_BYTES = 10_000_000;

/** Bind these public capabilities to ONE originating session. No session-file/fsync gate. */
export interface JobsSessionPort {
  sessionId: string;
  persistent: boolean;
  appendEntry(customType: string, data: unknown): void | Promise<void>;
  getEntries(): readonly { type: string; customType?: string; data?: unknown }[];
}
export interface JobsOutputSnapshot {
  bytes: Uint8Array;
  totalBytes: number;
  headBytes: number;
  finished: boolean;
}
/** Only output artifacts, never execution/result sidecars. */
export interface JobsOutputArtifacts {
  create(): Promise<string>;
  write(reference: string, snapshot: JobsOutputSnapshot): Promise<void>;
  read(reference: string): Promise<JobsOutputSnapshot>;
  remove(reference: string): Promise<void>;
}
export interface JobsCapturedOutput {
  window: OutputWindow;
  retainedBytes: number;
  totalBytes: number;
  source: 'live' | 'snapshot';
  diagnostics: string[];
}
export interface SessionJobStore {
  jobs: JobStore;
  results: ResultSink;
  capture(job: JobIdentity, chunk: Parameters<OutputSink['append']>[0]): Promise<JobReply<void>>;
  readOutput(job: JobIdentity): Promise<JobReply<JobsCapturedOutput>>;
  /** Call before the integration's origin callbacks become invalid. Not cancellation. */
  invalidateOrigin(): void;
  /** Caller first settles supported operations; no-session output cleanup is best effort. */
  dispose(): Promise<string[]>;
}
interface Entry {
  formatVersion: 1;
  contractVersion: '0.1.0';
  kind: 'startup' | 'state' | 'final';
  observation: JobObservation;
  outputReference: string;
  result?: FinalResult;
}
interface Live {
  observation: JobObservation;
  reference: string;
  token: string;
  capture: Capture;
  result?: FinalResult;
  diagnostics: string[];
}
const copy = <T>(value: T): T => structuredClone(value);
const key = (job: JobIdentity) =>
  JSON.stringify([job.runtimeId, job.ownerId, job.sessionId, job.jobId, job.producerId]);
const ok = <T>(value: T): JobReply<T> => ({ status: 'ok', value });
const failure = (
  status: 'unknown' | 'unavailable' | 'invalid' | 'unsupported',
  reason: string,
): JobReply<never> => ({ status, reason });
const detail = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const historical = (observation: JobObservation): JobObservation => ({
  ...copy(observation),
  execution:
    observation.execution.state === 'running'
      ? { state: 'unknown', reason: 'Historical running metadata is not liveness.' }
      : copy(observation.execution),
  capabilities: {
    stop: false,
    setAwaiting: false,
    setDelivery: false,
    readOutput: true,
    readResult: observation.execution.state === 'terminal',
  },
});

/** Grow with retained bytes; a small beginning plus a byte ring, without stream tags. */
class Capture {
  private head = new Uint8Array(0);
  private tail = new Uint8Array(0);
  private size = 0;
  private cursor = 0;
  private total = 0;
  finished = false;
  constructor(
    private max: number,
    private beginning: number,
  ) {}
  append(bytes: Uint8Array) {
    this.total += bytes.length;
    const taken = Math.min(bytes.length, this.beginning - this.head.length);
    if (taken) {
      const head = new Uint8Array(this.head.length + taken);
      head.set(this.head);
      head.set(bytes.subarray(0, taken), this.head.length);
      this.head = head;
    }
    const rest = bytes.subarray(taken),
      capacity = this.max - this.beginning;
    if (!rest.length || !capacity) return;
    if (rest.length >= capacity) {
      this.tail = rest.slice(-capacity);
      this.size = capacity;
      this.cursor = 0;
      return;
    }
    const needed = Math.min(capacity, this.size + rest.length);
    if (needed > this.tail.length) {
      const grown = new Uint8Array(
        Math.min(capacity, Math.max(needed, this.tail.length * 2, 1024)),
      );
      grown.set(this.tailBytes());
      this.tail = grown;
      this.cursor = this.size;
    }
    const first = Math.min(rest.length, this.tail.length - this.cursor);
    this.tail.set(rest.subarray(0, first), this.cursor);
    this.tail.set(rest.subarray(first), 0);
    this.cursor = (this.cursor + rest.length) % this.tail.length;
    this.size = Math.min(capacity, this.size + rest.length);
  }
  private tailBytes() {
    if (this.size < this.tail.length) return this.tail.slice(0, this.size);
    const bytes = new Uint8Array(this.size);
    bytes.set(this.tail.subarray(this.cursor));
    bytes.set(this.tail.subarray(0, this.cursor), this.size - this.cursor);
    return bytes;
  }
  snapshot(): JobsOutputSnapshot {
    const bytes = new Uint8Array(this.head.length + this.size);
    bytes.set(this.head);
    bytes.set(this.tailBytes(), this.head.length);
    return { bytes, totalBytes: this.total, headBytes: this.head.length, finished: this.finished };
  }
}
function window(reference: string, snapshot: JobsOutputSnapshot): OutputWindow {
  const omittedBytes = snapshot.totalBytes - snapshot.bytes.length;
  const decoder = new TextDecoder();
  const text = omittedBytes
    ? decoder.decode(snapshot.bytes.subarray(0, snapshot.headBytes)) +
      `\n[... ${omittedBytes} bytes omitted ...]\n` +
      decoder.decode(snapshot.bytes.subarray(snapshot.headBytes))
    : decoder.decode(snapshot.bytes);
  return { text, reference, omittedBytes, complete: snapshot.finished && omittedBytes === 0 };
}

/** Trusted, serialized same-job operations. No execution, quota, retry or delivery coordinator. */
// @mara implements DES-JOBS-SESSION-STORE
// @mara implements REQ-JOBS-STORAGE-FAILURE
export function createSessionJobStore(options: {
  session: JobsSessionPort;
  output: JobsOutputArtifacts;
  maxBytes?: number;
  headBytes?: number;
}): SessionJobStore {
  const max = options.maxBytes ?? JOBS_OUTPUT_BYTES;
  const head = options.headBytes ?? Math.min(65_536, max);
  if (
    !Number.isInteger(max) ||
    max < 1 ||
    max > JOBS_OUTPUT_BYTES ||
    !Number.isInteger(head) ||
    head < 1 ||
    head > max
  )
    throw new Error('Invalid combined output bounds.');
  // Capture bindings: do not consult mutable/replacement options after construction.
  const sessionId = options.session.sessionId,
    persistent = options.session.persistent;
  const append = options.session.appendEntry.bind(options.session),
    entries = options.session.getEntries.bind(options.session);
  const output = {
    create: options.output.create.bind(options.output),
    write: options.output.write.bind(options.output),
    read: options.output.read.bind(options.output),
    remove: options.output.remove.bind(options.output),
  };
  let active = true;
  const live = new Map<string, Live>();
  const saved = new Map<string, Entry>();
  // Trusted public custom entries. Unsupported versions are unavailable, not migrated.
  for (const entry of entries()) {
    if (entry.type !== 'custom' || entry.customType !== JOBS_STORAGE_ENTRY_TYPE) continue;
    const data = entry.data as Entry | undefined;
    if (
      data?.formatVersion === 1 &&
      data.contractVersion === '0.1.0' &&
      data.observation?.identity.sessionId === sessionId
    )
      saved.set(key(data.observation.identity), copy(data));
  }
  const warn = (job: Live, reason: string) => {
    job.diagnostics.push(reason);
    if (job.diagnostics.length > 8) job.diagnostics.shift();
  };
  const entryFor = (job: Live, kind: Entry['kind']): Entry => ({
    formatVersion: 1,
    contractVersion: '0.1.0',
    kind,
    observation: copy(job.observation),
    outputReference: job.reference,
    ...(job.result ? { result: copy(job.result) } : {}),
  });
  const fits = (entry: Entry) =>
    Buffer.byteLength(JSON.stringify(entry), 'utf8') <= JOBS_STORAGE_ENTRY_BYTES;
  const saveEntry = async (job: Live, entry: Entry): Promise<JobReply<void>> => {
    if (!active) return failure('unavailable', 'Origin session callbacks are invalidated.');
    if (!fits(entry)) return failure('invalid', 'Compact entry exceeds 65,536 UTF-8 JSON bytes.');
    try {
      await append(JOBS_STORAGE_ENTRY_TYPE, copy(entry));
      saved.set(key(entry.observation.identity), copy(entry));
      return ok(undefined);
    } catch (error) {
      const reason = `Session append failed: ${detail(error)}`;
      warn(job, reason);
      return failure('unavailable', reason);
    }
  };
  const snapshot = async (job: Live): Promise<void> => {
    try {
      await output.write(job.reference, job.capture.snapshot());
    } catch (error) {
      warn(job, `Output snapshot failed: ${detail(error)}`);
    }
  };
  const jobs: JobStore = {
    async reserve(request: LaunchRequest) {
      if (!active) return failure('unavailable', 'Origin session callbacks are invalidated.');
      if (request.identity.sessionId !== sessionId)
        return failure('invalid', 'Wrong originating session.');
      const id = key(request.identity);
      if (live.has(id) || saved.has(id))
        return failure('invalid', 'Job identity is already tracked.');
      const observation: JobObservation = {
        identity: copy(request.identity),
        execution: { state: 'running' },
        awaiting: request.awaiting,
        lifetime: request.lifetime,
        delivery: {
          mode: request.delivery,
          state: request.delivery === 'display-only' ? 'not-required' : 'pending',
        },
        capabilities: {
          stop: true,
          setAwaiting: true,
          setDelivery: true,
          readOutput: true,
          readResult: true,
        },
      };
      let reference: string | undefined;
      try {
        reference = await output.create();
        const job: Live = {
          observation,
          reference,
          token: randomUUID(),
          capture: new Capture(max, head),
          diagnostics: [],
        };
        const reply = await saveEntry(job, entryFor(job, 'startup'));
        if (reply.status !== 'ok') {
          await output.remove(reference);
          return reply;
        }
        live.set(id, job);
        return ok({ job: copy(request.identity), reservationId: job.token });
      } catch (error) {
        if (reference) {
          try {
            await output.remove(reference);
          } catch {
            /* Setup cleanup is best effort. */
          }
        }
        return failure('unavailable', `Initial output/tracking setup failed: ${detail(error)}`);
      }
    },
    async save(reservation: StorageReservation, observation: JobObservation) {
      const job = live.get(key(reservation.job));
      if (!job || job.token !== reservation.reservationId)
        return failure('unknown', 'No matching live reservation.');
      if (key(observation.identity) !== key(reservation.job))
        return failure('invalid', 'Observation belongs to another job.');
      const next = { ...entryFor(job, 'state'), observation: copy(observation) };
      if (!fits(next)) return failure('invalid', 'Compact entry exceeds 65,536 UTF-8 JSON bytes.');
      job.observation = copy(observation);
      return saveEntry(job, next);
    },
    async read(identity) {
      const job = live.get(key(identity));
      if (job) return ok(copy(job.observation));
      const entry = saved.get(key(identity));
      return entry ? ok(historical(entry.observation)) : failure('unknown', 'No saved job.');
    },
  };
  const results: ResultSink = {
    async save(result) {
      if (result.output !== undefined)
        return failure(
          'unsupported',
          'Compact sink rejects FinalResult.output; read captured output separately.',
        );
      const job = live.get(key(result.identity.job));
      if (!job) return failure('unknown', 'No live job for final result.');
      const observation: JobObservation = {
        ...job.observation,
        execution: { state: 'terminal', outcome: copy(result.outcome) },
      };
      const entry = { ...entryFor(job, 'final'), observation, result: copy(result) };
      if (!fits(entry)) return failure('invalid', 'Compact entry exceeds 65,536 UTF-8 JSON bytes.');
      job.result = copy(result);
      job.observation = observation;
      job.capture.finished = true;
      await snapshot(job);
      return saveEntry(job, entry);
    },
    async read(identity) {
      const result = live.get(key(identity.job))?.result ?? saved.get(key(identity.job))?.result;
      return result?.identity.resultId === identity.resultId
        ? ok(copy(result))
        : failure('unknown', 'No matching final result.');
    },
  };
  return {
    jobs,
    results,
    async capture(identity, chunk) {
      const job = live.get(key(identity));
      if (!job) return failure('unknown', 'No live output owner.');
      if (job.capture.finished) return failure('invalid', 'Capture already completed.');
      job.capture.append(chunk.bytes);
      return ok(undefined);
    },
    async readOutput(identity) {
      const job = live.get(key(identity));
      if (job) {
        await snapshot(job);
        const value = job.capture.snapshot();
        return ok({
          window: window(job.reference, value),
          retainedBytes: value.bytes.length,
          totalBytes: value.totalBytes,
          source: 'live',
          diagnostics: [...job.diagnostics],
        });
      }
      const entry = saved.get(key(identity));
      if (!entry) return failure('unknown', 'No saved output reference.');
      try {
        const value = await output.read(entry.outputReference);
        return ok({
          window: window(entry.outputReference, value),
          retainedBytes: value.bytes.length,
          totalBytes: value.totalBytes,
          source: 'snapshot',
          diagnostics: [],
        });
      } catch (error) {
        return failure('unavailable', `Output unavailable: ${detail(error)}`);
      }
    },
    invalidateOrigin() {
      active = false;
    },
    async dispose() {
      active = false;
      const diagnostics: string[] = [];
      if (!persistent)
        for (const job of live.values()) {
          try {
            await output.remove(job.reference);
          } catch (error) {
            diagnostics.push(`Temporary output cleanup failed: ${detail(error)}`);
          }
        }
      return diagnostics;
    },
  };
}
