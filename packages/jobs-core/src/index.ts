export {
  createCompletionCoordinator,
  jobsFinalResultText,
  jobsFinalResultDigest,
  findJobsFinalReceipts,
  JOBS_RESULTS_MESSAGE_TYPE,
} from './delivery.js';
export type { JobsRecordedProjection } from './delivery.js';
export { createJobsSessionRuntime, bindJobsSessionRuntime } from './session.js';
export type {
  JobsSessionRuntime,
  JobsPiContext,
  JobsPiCallbacks,
  JobsPiEvents,
  JobsOwnedExecution,
  JobsGateBinding,
  JobsBoundaryEvent,
  JobsBoundaryDraft,
} from './session.js';

export {
  createJobLifecycle,
  createJobsLifecycleRouter,
  resolveJobsLifecycleSettings,
  waitForJobs,
  systemJobsClock,
} from './lifecycle.js';
export type {
  JobLifecycle,
  JobsLifecycleRouter,
  JobsClock,
  JobsLifecycleSettings,
  JobsLifecycleSettingsInput,
  JobsWaitResult,
  SelectedJobStatus,
  StopIntent,
  StopReason,
  StopStatus,
} from './lifecycle.js';

export {
  createSessionJobStore,
  JOBS_STORAGE_ENTRY_TYPE,
  JOBS_STORAGE_ENTRY_BYTES,
  JOBS_OUTPUT_BYTES,
} from './storage.js';
export { createJobsFileOutput } from './storage-files.js';
export type {
  JobsSessionPort,
  JobsOutputSnapshot,
  JobsOutputArtifacts,
  JobsCapturedOutput,
  SessionJobStore,
} from './storage.js';

/** First contract shipping stamp, selected explicitly; not the current package version. */
export const JOBS_CONTRACT_VERSION = '0.1.0';
/** Stable discovery channel, deliberately not partitioned by contract version. */
export const JOBS_PARTICIPANT_CHANNEL = 'araketski.pi-jobs/participants';

export interface JobIdentity {
  runtimeId: string;
  ownerId: string;
  sessionId: string;
  jobId: string;
  /** Opaque presentation/correlation metadata, never authority or backend policy. */
  producerId: string;
}
export interface ResultIdentity {
  job: JobIdentity;
  resultId: string;
}
export type ExecutionOutcome =
  | { kind: 'exit'; exitCode: number }
  | { kind: 'terminated'; signal: string }
  | { kind: 'launch-failed'; reason: string };
export type ExecutionState =
  | { state: 'running' }
  | { state: 'unknown'; reason: string }
  | { state: 'terminal'; outcome: ExecutionOutcome };
export type DeliveryMode = 'automatic' | 'next-natural-turn' | 'display-only';
/** Produced only by the trusted host integration after checking a recorded final result. */
export interface FinalResultReceipt {
  result: ResultIdentity;
  record: { sessionId: string; entryId: string; kind: 'tool-result' | 'custom-message' };
  /** Digest of the exact final-result content in that record, not arbitrary job-id text. */
  contentDigest: string;
}
export type DeliveryState = { mode: DeliveryMode } & (
  | { state: 'pending' | 'unknown' }
  | { state: 'delivered'; receipt: FinalResultReceipt }
  | { state: 'not-required' }
);
export interface JobCapabilities {
  stop: boolean;
  setAwaiting: boolean;
  setDelivery: boolean;
  readOutput: boolean;
  readResult: boolean;
}
export interface JobObservation {
  identity: JobIdentity;
  execution: ExecutionState;
  delivery: DeliveryState;
  awaiting: boolean;
  lifetime: 'managed' | 'persistent';
  capabilities: JobCapabilities;
}
export interface OutputWindow {
  text: string;
  /** Opaque storage reference; not a path to be guessed by a consumer. */
  reference: string;
  complete: boolean;
  omittedBytes: number;
}
export interface FinalResult {
  identity: ResultIdentity;
  outcome: ExecutionOutcome;
  content: string;
  output?: OutputWindow;
}
/** Held by the owner; an observer snapshot never creates this authority. */
export interface ControlAuthority {
  runtimeId: string;
  ownerId: string;
  generation: string;
}
export interface ControlRequest {
  requestId: string;
  job: JobIdentity;
  authority: ControlAuthority;
}
export type JobReply<T> =
  | { status: 'ok'; value: T }
  | { status: 'unknown' | 'unavailable' | 'denied' | 'unsupported' | 'invalid'; reason: string };
export type WaitSelection =
  | { mode: 'one'; jobs: readonly [JobIdentity] }
  | { mode: 'any' | 'all'; jobs: readonly JobIdentity[] };
export interface WaitRequest {
  requestId: string;
  selection: WaitSelection;
  timeoutMs?: number;
  /** Cancels this wait, not already managed execution. */
  signal?: AbortSignal;
}
/** Separate methods are contracts for atomic operations, not one model-facing dispatcher. */
export interface JobOwnerPort {
  inspect(job: JobIdentity): Promise<JobReply<JobObservation>>;
  readOutput(job: JobIdentity): Promise<JobReply<OutputWindow>>;
  /** Returning a result is not yet a model-visible receipt. */
  readResult(job: JobIdentity): Promise<JobReply<FinalResult>>;
  wait(request: WaitRequest): Promise<JobReply<readonly JobObservation[]>>;
  stop(request: ControlRequest): Promise<JobReply<{ requested: true }>>;
  setAwaiting(request: ControlRequest & { awaiting: boolean }): Promise<JobReply<JobObservation>>;
  setDelivery(request: ControlRequest & { mode: DeliveryMode }): Promise<JobReply<JobObservation>>;
}
export interface LaunchRequest {
  identity: JobIdentity;
  authority: ControlAuthority;
  awaiting: boolean;
  delivery: DeliveryMode;
  lifetime: 'managed' | 'persistent';
  hardTimeoutMs?: number;
}
export interface OutputSink {
  append(chunk: { stream: 'stdout' | 'stderr' | 'combined'; bytes: Uint8Array }): Promise<void>;
}
/** Backend handles/evidence remain opaque; consumers operate on standardized observations. */
export interface ExecutionAdapter<Handle, Input> {
  launch(
    request: LaunchRequest,
    input: Input,
    output: OutputSink,
    foregroundSignal?: AbortSignal,
  ): Promise<JobReply<Handle>>;
  observe(handle: Handle): Promise<ExecutionState>;
  stop(
    handle: Handle,
    authority: ControlAuthority,
    graceMs: number,
  ): Promise<JobReply<{ requested: true }>>;
}
export interface StorageReservation {
  job: JobIdentity;
  reservationId: string;
}
/** Optional admission/save seam; concrete storage defines its best-effort semantics. */
export interface JobStore {
  reserve(request: LaunchRequest): Promise<JobReply<StorageReservation>>;
  save(reservation: StorageReservation, observation: JobObservation): Promise<JobReply<void>>;
  read(job: JobIdentity): Promise<JobReply<JobObservation>>;
}
export interface ResultSink {
  save(result: FinalResult): Promise<JobReply<void>>;
  read(identity: ResultIdentity): Promise<JobReply<FinalResult>>;
}

export interface SessionScope {
  runtimeId: string;
  sessionId: string;
}
export interface WakeReservation {
  scope: SessionScope;
  wakeId: string;
  participantId: string;
}
export type WakeEligibility =
  | 'automatic-idle'
  | 'working'
  | 'inactive'
  | 'resume-deferred'
  | 'unknown';
export type WakeReply =
  | { state: 'reserved'; reservation: WakeReservation }
  | { state: 'already-pending' | 'ineligible' | 'unknown' };
/**
 * Explicitly supplied ONE runtime service shared across independent core copies.
 * Methods must be linearizable per SessionScope. No default/global singleton is supplied.
 * Enqueue/capture/wake admission never consumes a result. Only verified receipts do.
 */
export interface CompletionCoordinator {
  enqueue(result: FinalResult, mode: DeliveryMode): Promise<JobReply<void>>;
  inspect(scope: SessionScope): Promise<JobReply<readonly FinalResult[]>>;
  /** Check eligibility and pending automatic results, then reserve BEFORE any Pi submission. */
  reserveWake(
    scope: SessionScope,
    participantId: string,
    eligibility: WakeEligibility,
  ): Promise<WakeReply>;
  /** Ambiguous submission retains its reservation; only definite failure permits retry. */
  reportWake(
    reservation: WakeReservation,
    disposition: 'queued' | 'starting' | 'unconfirmed' | 'failed',
  ): Promise<JobReply<void>>;
  /** Capture eligible results without consuming them; recheck selected receipts before sending. */
  capture(
    scope: SessionScope,
    selected: readonly ResultIdentity[],
  ): Promise<JobReply<readonly FinalResult[]>>;
  confirm(receipts: readonly FinalResultReceipt[]): Promise<JobReply<void>>;
  /** Called at an actionable idle boundary, not merely agent_end or session resume. */
  finishWake(reservation: WakeReservation): Promise<JobReply<void>>;
}
/** Pi maps these seams via public APIs; no private queue access or exit-code setter. */
export interface JobsPiHost {
  events: JobsEventBus;
  appendReference(scope: SessionScope, data: unknown): Promise<JobReply<void>>;
  eligibility(scope: SessionScope): WakeEligibility;
  submitWake(reservation: WakeReservation): Promise<'queued' | 'failed' | 'unconfirmed'>;
  recordResults(
    scope: SessionScope,
    results: readonly FinalResult[],
  ): Promise<JobReply<readonly FinalResultReceipt[]>>;
}
export interface JobsEventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}
export interface JobsParticipantIdentity {
  runtimeId: string;
  participantId: string;
  role: 'owner' | 'observer';
}
export interface JobsParticipantMetadata extends JobsParticipantIdentity {
  contractVersion: string;
}
export interface JobsSnapshot {
  participant: JobsParticipantMetadata;
  sessionId: string;
  jobs: JobObservation[];
}
export type JobsParticipantMessage =
  | { kind: 'discover'; runtimeId: string }
  | { kind: 'announce'; participant: JobsParticipantMetadata }
  | ({ kind: 'snapshot' } & JobsSnapshot);
export interface JobsDiagnostic {
  code: 'contract-mismatch' | 'contract-unreadable' | 'malformed';
  participantId?: string;
  expectedVersion: string;
  observedVersion?: string;
}
export interface JobsParticipantView {
  participants: (JobsParticipantIdentity & {
    contractVersion?: string;
    compatibility: 'matching' | 'mismatched' | 'unknown';
  })[];
  /** Reported assertions only. Missing snapshot/owner is unconfirmed, not empty/completed. */
  snapshots: JobsSnapshot[];
  diagnostics: JobsDiagnostic[];
}
export interface JobsParticipant {
  metadata(): JobsParticipantMetadata;
  start(): void;
  publish(sessionId: string, jobs: readonly JobObservation[]): void;
  discover(): void;
  view(): JobsParticipantView;
  close(): void;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function diagnosticText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function participantIdentity(value: unknown): value is JobsParticipantIdentity {
  return (
    record(value) &&
    id(value.runtimeId) &&
    id(value.participantId) &&
    (value.role === 'owner' || value.role === 'observer')
  );
}
function identity(value: unknown): value is JobIdentity {
  return (
    record(value) &&
    ['runtimeId', 'ownerId', 'sessionId', 'jobId', 'producerId'].every((key) => id(value[key]))
  );
}
function outcome(value: unknown): value is ExecutionOutcome {
  return (
    record(value) &&
    ((value.kind === 'exit' && Number.isSafeInteger(value.exitCode)) ||
      (value.kind === 'terminated' && id(value.signal)) ||
      (value.kind === 'launch-failed' && diagnosticText(value.reason)))
  );
}
function execution(value: unknown): value is ExecutionState {
  return (
    record(value) &&
    !('exitCode' in value) &&
    !('resultId' in value) &&
    ((value.state === 'running' && !('outcome' in value)) ||
      (value.state === 'unknown' && diagnosticText(value.reason) && !('outcome' in value)) ||
      (value.state === 'terminal' && outcome(value.outcome)))
  );
}
function sameJob(a: JobIdentity, b: JobIdentity): boolean {
  return (
    a.runtimeId === b.runtimeId &&
    a.ownerId === b.ownerId &&
    a.sessionId === b.sessionId &&
    a.jobId === b.jobId &&
    a.producerId === b.producerId
  );
}
function receipt(value: unknown, job: JobIdentity): value is FinalResultReceipt {
  return (
    record(value) &&
    record(value.result) &&
    identity(value.result.job) &&
    sameJob(value.result.job, job) &&
    id(value.result.resultId) &&
    record(value.record) &&
    value.record.sessionId === job.sessionId &&
    id(value.record.entryId) &&
    (value.record.kind === 'tool-result' || value.record.kind === 'custom-message') &&
    id(value.contentDigest)
  );
}
function observation(value: unknown): value is JobObservation {
  if (
    !record(value) ||
    !identity(value.identity) ||
    !execution(value.execution) ||
    typeof value.awaiting !== 'boolean' ||
    (value.lifetime !== 'managed' && value.lifetime !== 'persistent') ||
    !record(value.capabilities) ||
    !['stop', 'setAwaiting', 'setDelivery', 'readOutput', 'readResult'].every(
      (key) => typeof (value.capabilities as Record<string, unknown>)[key] === 'boolean',
    )
  )
    return false;
  const delivery = value.delivery;
  if (
    !record(delivery) ||
    (delivery.mode !== 'automatic' &&
      delivery.mode !== 'next-natural-turn' &&
      delivery.mode !== 'display-only')
  )
    return false;
  if (delivery.state === 'delivered')
    return (
      value.execution.state === 'terminal' &&
      delivery.mode !== 'display-only' &&
      receipt(delivery.receipt, value.identity)
    );
  if (delivery.state === 'not-required') return delivery.mode === 'display-only';
  return (delivery.state === 'pending' || delivery.state === 'unknown') && !('receipt' in delivery);
}
function snapshot(value: unknown): value is JobsSnapshot {
  if (
    !record(value) ||
    !participantIdentity(value.participant) ||
    value.participant.role !== 'owner' ||
    !id(value.sessionId) ||
    !Array.isArray(value.jobs)
  )
    return false;
  const participant = value.participant;
  const jobs = value.jobs as JobObservation[];
  // Array.every skips holes. Every position must hold an actual conforming job.
  for (let index = 0; index < jobs.length; index++) {
    if (!observation(jobs[index])) return false;
  }
  return (
    jobs.every(
      (job) =>
        job.identity.ownerId === participant.participantId &&
        job.identity.runtimeId === participant.runtimeId &&
        job.identity.sessionId === value.sessionId,
    ) && new Set(jobs.map((job) => job.identity.jobId)).size === jobs.length
  );
}

/** Minimal discovery/metadata exchange, not liveness reconciliation, control or delivery. */
// @mara implements REQ-JOBS-VERSION-DIAGNOSTICS
// @mara implements REQ-JOBS-PRODUCER-IDENTITY
export function createJobsParticipant(
  host: { events: JobsEventBus },
  identityInput: JobsParticipantIdentity,
): JobsParticipant {
  if (
    !participantIdentity(identityInput) ||
    Object.keys(identityInput).some((key) => !['runtimeId', 'participantId', 'role'].includes(key))
  )
    throw new Error('Invalid jobs participant identity; the library owns the contract marker.');
  const own: JobsParticipantMetadata = {
    ...clone(identityInput),
    contractVersion: JOBS_CONTRACT_VERSION,
  };
  const participants = new Map<string, JobsParticipantView['participants'][number]>();
  const snapshots = new Map<string, JobsSnapshot>();
  const published = new Map<string, JobsSnapshot>();
  const diagnostics: JobsDiagnostic[] = [];
  let unsubscribe: (() => void) | undefined;
  const send = (message: JobsParticipantMessage) =>
    host.events.emit(JOBS_PARTICIPANT_CHANNEL, clone(message));
  const warn = (diagnostic: JobsDiagnostic) => {
    if (!diagnostics.some((d) => JSON.stringify(d) === JSON.stringify(diagnostic)))
      diagnostics.push(diagnostic);
  };
  const receive = (data: unknown) => {
    // Treat event-bus payloads as untrusted data, including uncloneable/getter-bearing records.
    let raw: unknown;
    try {
      // Preserve scalar types until validation: JSON cloning would turn boxed values into primitives.
      raw = structuredClone(data);
      // The wire remains JSON data. Reject cycles before any participant/snapshot mutation,
      // but never replace the preserved scalar types with the JSON-normalized values.
      JSON.stringify(raw);
    } catch {
      return;
    }
    if (!record(raw)) return;
    if (raw.kind === 'discover') {
      if (raw.runtimeId === own.runtimeId) {
        send({ kind: 'announce', participant: own });
        for (const value of published.values()) send({ kind: 'snapshot', ...value });
      }
      return;
    }
    if (raw.kind !== 'announce' && raw.kind !== 'snapshot') return;
    if (!participantIdentity(raw.participant) || raw.participant.runtimeId !== own.runtimeId)
      return;
    const p = raw.participant;
    const marker = (p as unknown as Record<string, unknown>).contractVersion;
    const readable = id(marker);
    const matching = marker === JOBS_CONTRACT_VERSION;
    participants.set(p.participantId, {
      runtimeId: p.runtimeId,
      participantId: p.participantId,
      role: p.role,
      ...(readable ? { contractVersion: marker } : {}),
      compatibility: matching ? 'matching' : readable ? 'mismatched' : 'unknown',
    });
    if (!matching) {
      warn({
        code: readable ? 'contract-mismatch' : 'contract-unreadable',
        participantId: p.participantId,
        expectedVersion: JOBS_CONTRACT_VERSION,
        ...(readable ? { observedVersion: marker } : {}),
      });
      return;
    }
    if (raw.kind === 'snapshot') {
      if (!snapshot(raw)) {
        warn({
          code: 'malformed',
          participantId: p.participantId,
          expectedVersion: JOBS_CONTRACT_VERSION,
        });
        return;
      }
      snapshots.set(JSON.stringify([p.participantId, raw.sessionId]), clone(raw));
    }
  };
  const assertStarted = () => {
    if (!unsubscribe) throw new Error('Jobs participant has not started.');
  };
  return {
    metadata: () => clone(own),
    start() {
      if (unsubscribe) return;
      unsubscribe = host.events.on(JOBS_PARTICIPANT_CHANNEL, receive);
      send({ kind: 'discover', runtimeId: own.runtimeId });
      send({ kind: 'announce', participant: own });
    },
    publish(sessionId, jobs) {
      assertStarted();
      const value: JobsSnapshot = { participant: own, sessionId, jobs: clone([...jobs]) };
      // Validate before clone as well: JSON must not turn NaN/undefined into admissible data.
      if (
        own.role !== 'owner' ||
        !snapshot({ participant: own, sessionId, jobs }) ||
        !snapshot(value)
      )
        throw new Error('Invalid owner jobs snapshot.');
      published.set(sessionId, value);
      send({ kind: 'snapshot', ...value });
    },
    discover() {
      assertStarted();
      send({ kind: 'discover', runtimeId: own.runtimeId });
    },
    view: () =>
      clone({
        participants: [...participants.values()],
        snapshots: [...snapshots.values()],
        diagnostics,
      }),
    close() {
      unsubscribe?.();
      unsubscribe = undefined;
      participants.clear();
      snapshots.clear();
      published.clear();
      diagnostics.length = 0;
    },
  };
}
