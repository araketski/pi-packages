import { createHash } from 'node:crypto';
import type {
  CompletionCoordinator,
  FinalResult,
  JobIdentity,
  JobObservation,
  JobReply,
  FinalResultReceipt,
  LaunchRequest,
  SessionScope,
  StorageReservation,
  WakeReservation,
} from './index.js';
import {
  createSessionJobStore,
  type JobsOutputArtifacts,
  type SessionJobStore,
} from './storage.js';
import {
  findJobsFinalReceipts,
  JOBS_RESULTS_MESSAGE_TYPE,
  jobsFinalResultText,
  jobsFinalResultDigest,
  jobsResultKey,
  type JobsRecordedProjection,
} from './delivery.js';

/** Only supported public capabilities; the compiled library imports no Pi SDK. */
export interface JobsPiContext {
  mode: 'tui' | 'print' | 'json' | 'rpc';
  signal?: AbortSignal;
  isIdle(): boolean;
  hasPendingMessages(): boolean;
  abort(): void;
  sessionManager: {
    getSessionId(): string;
    getSessionFile(): string | undefined;
    getEntries(): readonly { type: string; customType?: string; data?: unknown }[];
    buildSessionProjection(): JobsRecordedProjection;
  };
}
export interface JobsPiCallbacks {
  appendEntry(customType: string, data: unknown): void;
  sendMessage(
    message: { customType: string; content: { type: 'text'; text: string }[]; display: boolean },
    options: { triggerTurn: boolean; deliverAs: 'followUp' | 'nextTurn' },
  ): void;
}
export interface JobsBoundaryDraft {
  type: 'custom_message';
  customType: string;
  content: { type: 'text'; text: string }[];
  display: boolean;
}
export interface JobsBoundaryEvent {
  outcome: 'completed' | 'aborted' | 'error';
  context: { canContinue: boolean; pendingMessages: readonly unknown[] };
  /** Preserve preceding handlers' native drafts verbatim. */
  entries?: readonly unknown[];
}
export interface JobsOwnedExecution {
  /** Already ownership-checked cancellation using the unchanged executor policy. */
  cancel(): Promise<unknown>;
  /** End this owner integration's monitoring; does not invent termination. */
  dispose(): void;
}
export interface JobsGateBinding {
  /** Reconcile this owner's verified obligations through the public generic gate owner. */
  reconcile(ids: readonly string[]): void;
  close(): void;
}
interface Tracked {
  observation: JobObservation;
  reservation?: StorageReservation;
  execution?: JobsOwnedExecution;
  result?: FinalResult;
  arrivalEpoch?: number;
  receipt?: FinalResultReceipt;
  deferred?: boolean;
  ordering?: Promise<void>;
}
interface Active {
  id: string;
  scope: SessionScope;
  store: SessionJobStore;
  jobs: Map<string, Tracked>;
  binding?: Binding;
  deferred: boolean;
  inputEpoch: number;
  startedEpoch: number;
  acceptedInputs: number[];
  wake?: WakeReservation;
  submitting: boolean;
  starting: boolean;
  closing: boolean;
}
interface Binding {
  ctx: JobsPiContext;
  pi: JobsPiCallbacks;
  gates?: JobsGateBinding;
}
const key = (job: JobIdentity) =>
  JSON.stringify([job.runtimeId, job.sessionId, job.ownerId, job.producerId, job.jobId]);
const gateId = (job: JobIdentity) => 'job-' + createHash('sha256').update(key(job)).digest('hex');
const ok = <T>(value: T): JobReply<T> => ({ status: 'ok', value });
const unavailable = (): JobReply<never> => ({
  status: 'unavailable',
  reason: 'Origin is not active/bound.',
});
const outstanding = (job: Tracked) =>
  job.observation.awaiting &&
  (job.observation.execution.state !== 'terminal' ||
    !['delivered', 'not-required'].includes(job.observation.delivery.state));

export interface JobsSessionRuntime {
  start(
    pi: JobsPiCallbacks,
    ctx: JobsPiContext,
    reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork',
    gates?: JobsGateBinding,
  ): Promise<void>;
  refresh(ctx: JobsPiContext): void;
  userInput(ctx: JobsPiContext): void;
  naturalTurn(ctx: JobsPiContext): Promise<void>;
  userTurnStarted(ctx: JobsPiContext): void;
  idle(ctx: JobsPiContext): Promise<void>;
  admit(
    request: LaunchRequest,
    execution: JobsOwnedExecution,
  ): Promise<JobReply<StorageReservation>>;
  update(observation: JobObservation): Promise<JobReply<void>>;
  capture(job: JobIdentity, bytes: Uint8Array): Promise<JobReply<void>>;
  complete(result: FinalResult): Promise<JobReply<void>>;
  inspect(): readonly JobObservation[];
  readResult(job: JobIdentity): JobReply<FinalResult>;
  boundary(
    event: JobsBoundaryEvent,
    ctx: JobsPiContext,
    wait?: boolean,
  ): Promise<{ entries?: JobsBoundaryDraft[]; continue?: boolean }>;
  shutdown(reason: 'reload' | 'quit' | 'new' | 'resume' | 'fork'): Promise<void>;
}

/** Keep this explicit runtime across same-session reload and share its inbox across producers. */
// @mara implements DES-JOBS-PI-COMPOSITION
export function createJobsSessionRuntime(options: {
  runtimeId: string;
  participantId: string;
  inbox: CompletionCoordinator;
  output: JobsOutputArtifacts;
  cleanupMs?: number;
  reconciliationMs?: number;
  diagnose(message: string): void;
}): JobsSessionRuntime {
  const cleanupMs = options.cleanupMs ?? 1000;
  const reconciliationMs = options.reconciliationMs ?? 5000;
  if (
    ![cleanupMs, reconciliationMs].every(
      (ms) => Number.isSafeInteger(ms) && ms > 0 && ms <= 2 ** 31 - 1,
    )
  )
    throw Error('Invalid cleanup/reconciliation bound.');
  let active: Active | undefined;
  const heldWakes = new Map<string, WakeReservation>();
  const listeners = new Set<() => void>();
  const inputNotifications = new Set<ReturnType<typeof setTimeout>>();
  const changed = () => {
    for (const resolve of listeners) resolve();
  };
  const writable = (a: Active) =>
    active === a && !!a.binding && a.binding.ctx.sessionManager.getSessionId() === a.id;
  const valid = (a: Active) => writable(a) && !a.closing;
  const gates = (a: Active) => {
    if (!valid(a)) return;
    try {
      a.binding!.gates?.reconcile(
        [...a.jobs.values()].filter(outstanding).map((j) => gateId(j.observation.identity)),
      );
    } catch (error) {
      options.diagnose(`Gate reconciliation failed: ${String(error)}`);
      throw error;
    }
  };
  const current = (job: JobIdentity) => {
    const a = active;
    return a && a.id === job.sessionId ? { a, job: a.jobs.get(key(job)) } : undefined;
  };
  async function bound(a: Active) {
    while (active === a && !a.closing && !a.binding) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          listeners.delete(finish);
          resolve();
        };
        listeners.add(finish);
      });
    }
    if (!writable(a)) throw Error('Origin callback unavailable.');
    return a.binding!;
  }
  async function ordered<T>(job: Tracked, action: () => Promise<T>): Promise<T> {
    const preceding = job.ordering;
    let release!: () => void;
    job.ordering = new Promise<void>((resolve) => {
      release = resolve;
    });
    await preceding;
    try {
      return await action();
    } finally {
      release();
    }
  }
  const results = (a: Active) => [...a.jobs.values()].flatMap((j) => (j.result ? [j.result] : []));
  async function reconcile(a: Active) {
    if (!valid(a)) return;
    const receipts = findJobsFinalReceipts(
      a.id,
      results(a).filter(
        (result) =>
          a.jobs.get(key(result.identity.job))?.observation.delivery.mode !== 'display-only',
      ),
      a.binding!.ctx.sessionManager.buildSessionProjection(),
    );
    if (!receipts.length) return;
    const confirmed = await options.inbox.confirm(receipts);
    if (confirmed.status !== 'ok') {
      options.diagnose(confirmed.reason);
      return;
    }
    if (!valid(a)) return;
    for (const receipt of receipts) {
      const j = a.jobs.get(key(receipt.result.job));
      if (!j) continue;
      await ordered(j, async () => {
        if (!valid(a) || j.observation.delivery.state === 'delivered') return;
        j.receipt = receipt;
        if (j.observation.delivery.mode !== 'display-only')
          j.observation.delivery = {
            mode: j.observation.delivery.mode,
            state: 'delivered',
            receipt,
          };
        if (j.reservation) {
          const saved = await a.store.jobs.save(j.reservation, j.observation);
          if (saved.status !== 'ok') options.diagnose(saved.reason);
        }
        if (!j.reservation || j.observation.delivery.mode === 'display-only') {
          try {
            a.binding!.pi.appendEntry('araketski.pi-jobs/receipt', receipt);
          } catch (error) {
            options.diagnose(`Receipt append unavailable: ${String(error)}`);
          }
        }
      });
    }
    gates(a);
    changed();
  }
  function eligible(a: Active, result: FinalResult, natural: boolean) {
    const job = a.jobs.get(key(result.identity.job));
    return (
      !!job &&
      !job.deferred &&
      job.observation.delivery.state !== 'delivered' &&
      (job.observation.delivery.mode === 'automatic' ||
        (natural &&
          job.observation.delivery.mode === 'next-natural-turn' &&
          a.inputEpoch > (job.arrivalEpoch ?? -1)))
    );
  }
  async function selected(a: Active, natural: boolean) {
    const scopes = new Map<string, SessionScope>();
    scopes.set(a.scope.runtimeId, a.scope);
    for (const result of results(a))
      scopes.set(result.identity.job.runtimeId, {
        runtimeId: result.identity.job.runtimeId,
        sessionId: a.id,
      });
    const pending: FinalResult[] = [];
    for (const scope of scopes.values()) {
      const reply = await options.inbox.inspect(scope);
      if (reply.status === 'ok') pending.push(...reply.value);
      else options.diagnose(reply.reason);
    }
    const candidates = pending.filter((result) => eligible(a, result, natural));
    const batch: FinalResult[] = [];
    for (const scope of scopes.values()) {
      const captured = await options.inbox.capture(
        scope,
        candidates.map((r) => r.identity),
      );
      if (captured.status === 'ok') batch.push(...captured.value);
    }
    return valid(a) ? batch.filter((result) => eligible(a, result, natural)) : [];
  }
  async function idleWake(a: Active) {
    if (
      !valid(a) ||
      a.deferred ||
      a.starting ||
      a.submitting ||
      !a.binding!.ctx.isIdle() ||
      a.binding!.ctx.hasPendingMessages()
    )
      return;
    a.submitting = true;
    try {
      await reconcile(a);
      if (!valid(a)) return;
      const wake = await options.inbox.reserveWake(
        a.scope,
        options.participantId,
        'automatic-idle',
      );
      if (wake.state !== 'reserved') return;
      a.wake = wake.reservation;
      heldWakes.set(a.id, wake.reservation);
      const batch = (await selected(a, false)).filter((result) => eligible(a, result, false));
      if (
        !valid(a) ||
        a.starting ||
        !a.binding!.ctx.isIdle() ||
        a.binding!.ctx.hasPendingMessages() ||
        !batch.length
      ) {
        await options.inbox.reportWake(wake.reservation, 'failed');
        a.wake = undefined;
        heldWakes.delete(a.id);
        return;
      }
      try {
        // ExtensionAPI admission is void, not a delivery receipt or completion acknowledgement.
        a.binding!.pi.sendMessage(
          {
            customType: JOBS_RESULTS_MESSAGE_TYPE,
            content: batch.map((r) => ({ type: 'text', text: jobsFinalResultText(r) })),
            display: true,
          },
          { triggerTurn: true, deliverAs: 'followUp' },
        );
        await options.inbox.reportWake(wake.reservation, 'queued');
      } catch (error) {
        await options.inbox.reportWake(wake.reservation, 'unconfirmed');
        options.diagnose(`Wake submission unconfirmed: ${String(error)}`);
      }
    } finally {
      a.submitting = false;
    }
  }
  const runtime: JobsSessionRuntime = {
    async start(pi, ctx, reason, gateBinding) {
      const id = ctx.sessionManager.getSessionId();
      if (active && active.id === id && reason === 'reload' && !active.closing) {
        active.binding = { pi, ctx, gates: gateBinding };
        gates(active);
        changed();
        return;
      }
      if (active) await runtime.shutdown('resume');
      const a: Active = {
        id,
        scope: { runtimeId: options.runtimeId, sessionId: id },
        jobs: new Map(),
        deferred: true,
        inputEpoch: 0,
        startedEpoch: 0,
        acceptedInputs: [],
        wake: heldWakes.get(id),
        submitting: false,
        starting: false,
        closing: false,
        binding: { pi, ctx, gates: gateBinding },
        store: undefined!,
      };
      active = a;
      a.store = createSessionJobStore({
        session: {
          sessionId: id,
          persistent: !!ctx.sessionManager.getSessionFile(),
          async appendEntry(type, data) {
            const binding = await bound(a);
            if (a.binding !== binding || !writable(a)) throw Error('Origin callback unavailable.');
            binding.pi.appendEntry(type, data);
          },
          getEntries: () => (valid(a) ? a.binding!.ctx.sessionManager.getEntries() : []),
        },
        output: options.output,
      });
      // Read only matching already-saved records. Fork copies retain another origin and are ignored.
      for (const raw of ctx.sessionManager.getEntries()) {
        if (raw.type !== 'custom' || raw.customType !== 'araketski.pi-jobs/storage') continue;
        const data = raw.data as { observation?: JobObservation; result?: FinalResult } | undefined;
        const identity = data?.observation?.identity;
        if (!identity || identity.sessionId !== id) continue;
        const observed = await a.store.jobs.read(identity);
        if (observed.status !== 'ok') continue;
        const j: Tracked = { observation: observed.value, deferred: true };
        if (data?.observation?.delivery.state === 'delivered')
          j.receipt = data.observation.delivery.receipt;
        if (data?.result) {
          const result = await a.store.results.read(data.result.identity);
          if (result.status === 'ok') j.result = result.value;
        }
        const prior = a.jobs.get(key(identity));
        if (prior?.result && !j.result) j.result = prior.result;
        j.receipt ??= prior?.receipt;
        a.jobs.set(key(identity), j);
      }
      for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type !== 'custom' || entry.customType !== 'araketski.pi-jobs/receipt') continue;
        const receipt = entry.data as FinalResultReceipt;
        const j = receipt?.result?.job && a.jobs.get(key(receipt.result.job));
        if (
          j?.result &&
          receipt.record?.sessionId === id &&
          jobsResultKey(j.result.identity) === jobsResultKey(receipt.result) &&
          jobsFinalResultDigest(j.result) === receipt.contentDigest
        ) {
          j.receipt = receipt;
          if (j.observation.delivery.mode !== 'display-only')
            j.observation.delivery = { ...j.observation.delivery, state: 'delivered', receipt };
          await options.inbox.confirm([receipt]);
        }
      }
      for (const j of a.jobs.values())
        if (j.result && ['pending', 'unknown'].includes(j.observation.delivery.state)) {
          // Historical runtime identity is correlation, not ownership. Inbox scope follows the saved result.
          await options.inbox.enqueue(j.result, j.observation.delivery.mode);
        }
      gates(a);
    },
    refresh(ctx) {
      if (active?.binding && ctx.sessionManager.getSessionId() === active.id)
        active.binding.ctx = ctx;
    },
    userInput(ctx) {
      runtime.refresh(ctx);
      if (active && valid(active)) {
        active.deferred = false;
        active.inputEpoch++;
        active.acceptedInputs.push(active.inputEpoch);
        active.starting = true;
        for (const job of active.jobs.values()) job.deferred = false;
        changed();
        // Native input handlers run before Pi admits the transformed input to its queue.
        // One post-dispatch notification observes admission, without polling or submitting work.
        const timer = setTimeout(() => {
          inputNotifications.delete(timer);
          changed();
        }, 0);
        inputNotifications.add(timer);
      }
    },
    userTurnStarted(ctx) {
      runtime.refresh(ctx);
      if (active && valid(active)) {
        active.startedEpoch = active.acceptedInputs.shift() ?? active.startedEpoch;
        active.starting = false;
      }
    },
    async idle(ctx) {
      runtime.refresh(ctx);
      const a = active;
      if (!a || !valid(a)) return;
      a.starting = false;
      if (a.deferred) return;
      await reconcile(a);
      if (a.wake && valid(a) && !ctx.hasPendingMessages()) {
        await options.inbox.finishWake(a.wake);
        a.wake = undefined;
        heldWakes.delete(a.id);
      }
      await idleWake(a);
    },
    async naturalTurn(ctx) {
      runtime.refresh(ctx);
      const a = active;
      if (!a || !valid(a) || a.deferred) return;
      a.starting = true;
      await reconcile(a);
      const batch = (await selected(a, true)).filter((result) => eligible(a, result, true));
      if (valid(a) && batch.length)
        a.binding!.pi.sendMessage(
          {
            customType: JOBS_RESULTS_MESSAGE_TYPE,
            content: batch.map((r) => ({ type: 'text', text: jobsFinalResultText(r) })),
            display: true,
          },
          { triggerTurn: false, deliverAs: 'nextTurn' },
        );
    },
    async admit(request, execution) {
      const a = active;
      if (
        !a ||
        !valid(a) ||
        request.identity.sessionId !== a.id ||
        request.identity.runtimeId !== options.runtimeId
      )
        return unavailable();
      if (
        ['print', 'json'].includes(a.binding!.ctx.mode) &&
        request.awaiting &&
        request.delivery === 'next-natural-turn'
      )
        return {
          status: 'invalid',
          reason: 'One-shot awaited next-natural-turn delivery is incompatible.',
        };
      if (a.jobs.has(key(request.identity)))
        return { status: 'invalid', reason: 'Job identity already tracked.' };
      const reserved = await a.store.jobs.reserve(request);
      if (reserved.status !== 'ok' || !valid(a))
        return reserved.status === 'ok' ? unavailable() : reserved;
      const observed = await a.store.jobs.read(request.identity);
      if (observed.status !== 'ok') return observed;
      a.jobs.set(key(request.identity), {
        observation: observed.value,
        reservation: reserved.value,
        execution,
      });
      try {
        gates(a);
      } catch {
        a.jobs.delete(key(request.identity));
        return {
          status: 'unavailable',
          reason: 'Required initial gate tracking failed; do not launch.',
        };
      }
      a.deferred = false;
      changed();
      return reserved;
    },
    async update(observation) {
      const entry = current(observation.identity);
      if (!entry?.job?.reservation || entry.a.closing) return unavailable();
      if (
        observation.delivery.state === 'delivered' &&
        (entry.job.observation.delivery.state !== 'delivered' ||
          JSON.stringify(observation.delivery.receipt) !==
            JSON.stringify(entry.job.observation.delivery.receipt))
      )
        return {
          status: 'denied',
          reason: 'Only finalized native receipt reconciliation may establish delivery.',
        };
      if (
        ['print', 'json'].includes((await bound(entry.a)).ctx.mode) &&
        observation.awaiting &&
        observation.delivery.mode === 'next-natural-turn'
      )
        return {
          status: 'invalid',
          reason: 'One-shot awaited next-natural-turn delivery is incompatible.',
        };
      const saved = await ordered(entry.job, async () => {
        const job = entry.job!;
        if (!valid(entry.a)) return unavailable();
        const next = structuredClone(observation);
        next.delivery =
          next.delivery.mode === 'display-only'
            ? { mode: 'display-only', state: 'not-required' }
            : job.receipt
              ? { mode: next.delivery.mode, state: 'delivered', receipt: job.receipt }
              : {
                  mode: next.delivery.mode,
                  state: next.delivery.state === 'unknown' ? 'unknown' : 'pending',
                };
        const saved = await entry.a.store.jobs.save(job.reservation!, next);
        if (!valid(entry.a)) return unavailable();
        job.observation = next;
        if (job.result) await options.inbox.enqueue(job.result, next.delivery.mode);
        return saved;
      });
      gates(entry.a);
      changed();
      await idleWake(entry.a);
      return saved;
    },
    async capture(job, bytes) {
      const entry = current(job);
      return entry?.job
        ? ordered(entry.job, () => entry.a.store.capture(job, { stream: 'combined', bytes }))
        : unavailable();
    },
    async complete(result) {
      const entry = current(result.identity.job);
      if (!entry?.job) return unavailable();
      const enqueued = await ordered(entry.job, async () => {
        const job = entry.job!;
        if (active !== entry.a) return unavailable();
        // The captured store's append port waits for a same-origin reload binding.
        const saved = await entry.a.store.results.save(result);
        if (!writable(entry.a)) return unavailable();
        const observed = await entry.a.store.jobs.read(result.identity.job);
        if (observed.status === 'ok') job.observation = observed.value;
        // A failed best-effort append is diagnostic; live capture/result still carries its actual outcome.
        if (saved.status !== 'ok') {
          options.diagnose(saved.reason);
          const retained = await entry.a.store.results.read(result.identity);
          if (retained.status !== 'ok') return saved;
        }
        job.result = structuredClone(result);
        job.arrivalEpoch = entry.a.startedEpoch;
        if (entry.a.closing) return saved;
        return await options.inbox.enqueue(result, job.observation.delivery.mode);
      });
      gates(entry.a);
      changed();
      await idleWake(entry.a);
      return enqueued;
    },
    inspect: () =>
      active ? [...active.jobs.values()].map((j) => structuredClone(j.observation)) : [],
    readResult(job) {
      const entry = current(job);
      return entry?.job?.result
        ? ok(structuredClone(entry.job.result))
        : { status: 'unknown', reason: 'No saved final result.' };
    },
    async boundary(event, ctx, wait = false) {
      runtime.refresh(ctx);
      const a = active;
      if (!a || !valid(a) || a.deferred) return {};
      const binding = a.binding;
      const signal = ctx.signal;
      const usable = () => valid(a) && a.binding === binding;
      await reconcile(a);
      if (!usable() || event.outcome !== 'completed' || signal?.aborted) return {};
      if (a.wake && !ctx.hasPendingMessages() && !event.context.pendingMessages.length) {
        await options.inbox.finishWake(a.wake);
        heldWakes.delete(a.id);
        a.wake = undefined;
      }
      if (wait && ctx.mode !== 'tui') {
        let unknownSince: number | undefined;
        while (
          usable() &&
          !signal?.aborted &&
          [...a.jobs.values()].some(
            (j) =>
              outstanding(j) &&
              (j.observation.execution.state !== 'terminal' ||
                (j.observation.delivery.mode === 'next-natural-turn' &&
                  !(ctx.hasPendingMessages() && a.inputEpoch > (j.arrivalEpoch ?? -1)))),
          )
        ) {
          const unknown = [...a.jobs.values()].some(
            (j) => outstanding(j) && (!j.execution || j.observation.execution.state === 'unknown'),
          );
          unknownSince = unknown ? (unknownSince ?? performance.now()) : undefined;
          const deadline = (unknownSince ?? performance.now()) + reconciliationMs;
          if (unknown && performance.now() >= deadline) {
            options.diagnose(
              'needs-attention: awaited owner remains historical/unconfirmed; gates retained.',
            );
            ctx.abort();
            return {};
          }
          await new Promise<void>((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const finish = () => {
              if (timer) clearTimeout(timer);
              listeners.delete(finish);
              signal?.removeEventListener('abort', finish);
              resolve();
            };
            listeners.add(finish);
            signal?.addEventListener('abort', finish, { once: true });
            if (unknown) timer = setTimeout(finish, Math.max(1, deadline - performance.now()));
          });
        }
      }
      if (!usable() || signal?.aborted) return {};
      if (
        [...a.jobs.values()].some(
          (j) => outstanding(j) && j.observation.execution.state === 'terminal' && !j.result,
        )
      ) {
        options.diagnose(
          'needs-attention: terminal awaited work has no available final result; gates retained.',
        );
        if (ctx.mode !== 'tui') ctx.abort();
        return {};
      }
      const naturalPending = ctx.hasPendingMessages() && a.inputEpoch > a.startedEpoch;
      const batch = (await selected(a, naturalPending)).filter((result) =>
        eligible(a, result, naturalPending),
      );
      if (
        !batch.length ||
        (!naturalPending && (ctx.hasPendingMessages() || event.context.pendingMessages.length))
      )
        return {};
      return {
        entries: [
          ...((event.entries ?? []) as JobsBoundaryDraft[]),
          {
            type: 'custom_message',
            customType: JOBS_RESULTS_MESSAGE_TYPE,
            content: batch.map((r) => ({ type: 'text', text: jobsFinalResultText(r) })),
            display: true,
          },
        ],
        continue: true,
      };
    },
    async shutdown(reason) {
      const a = active;
      if (!a || a.closing) return;
      if (reason === 'reload') {
        a.binding?.gates?.close();
        a.binding = undefined;
        changed();
        return;
      }
      if (a.binding) {
        for (const j of a.jobs.values())
          if (
            j.execution &&
            j.observation.lifetime === 'managed' &&
            j.observation.execution.state !== 'terminal'
          ) {
            try {
              a.binding.pi.appendEntry('araketski.pi-jobs/cleanup', {
                identity: j.observation.identity,
                stop: 'requested-unconfirmed',
                reason,
              });
            } catch (error) {
              options.diagnose(`Cleanup intent append unavailable: ${String(error)}`);
            }
          }
      }
      a.closing = true;
      for (const timer of inputNotifications) clearTimeout(timer);
      inputNotifications.clear();
      changed();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cancellation = Promise.allSettled(
        [...a.jobs.values()]
          .filter(
            (j) =>
              j.execution &&
              j.observation.lifetime === 'managed' &&
              j.observation.execution.state !== 'terminal',
          )
          .map(async (j) => {
            options.diagnose(
              `Managed cleanup requested for ${j.observation.identity.jobId}; termination unconfirmed.`,
            );
            await j.execution!.cancel();
          }),
      );
      await Promise.race([
        cancellation,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, cleanupMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      a.store.invalidateOrigin();
      a.binding?.gates?.close();
      a.binding = undefined;
      for (const j of a.jobs.values()) j.execution?.dispose();
      active = undefined;
      // Disposal can itself wait on output; do not extend the replacement bound.
      void a.store.dispose().then(
        (diagnostics) => diagnostics.forEach((message) => options.diagnose(message)),
        (error) => options.diagnose(String(error)),
      );
    },
  };
  return runtime;
}

/** Event overloads mirror the supported public Pi 0.99.1 extension seam. */
export interface JobsPiEvents extends JobsPiCallbacks {
  on(
    event: 'session_start',
    handler: (
      event: { reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork' },
      ctx: JobsPiContext,
    ) => Promise<void>,
  ): () => void;
  on(
    event: 'session_shutdown',
    handler: (
      event: { reason: 'reload' | 'quit' | 'new' | 'resume' | 'fork' },
      ctx: JobsPiContext,
    ) => Promise<void>,
  ): () => void;
  on(
    event: 'session_tree' | 'input' | 'message_start',
    handler: (event: unknown, ctx: JobsPiContext) => void,
  ): () => void;
  on(
    event: 'agent_settled',
    handler: (event: unknown, ctx: JobsPiContext) => Promise<void>,
  ): () => void;
  on(
    event: 'before_agent_start',
    handler: (event: unknown, ctx: JobsPiContext) => Promise<void>,
  ): () => void;
  on(
    event: 'turn_end' | 'agent_before_settle',
    handler: (
      event: JobsBoundaryEvent,
      ctx: JobsPiContext,
    ) => Promise<{ entries?: JobsBoundaryDraft[]; continue?: boolean }>,
  ): () => void;
}

/** Register once per fresh extension factory, passing the SAME retained runtime. No tools/UI. */
export function bindJobsSessionRuntime(
  pi: JobsPiEvents,
  runtime: JobsSessionRuntime,
  gateBinding?: (pi: JobsPiCallbacks, ctx: JobsPiContext) => JobsGateBinding,
): () => void {
  const unsubscribe = [
    pi.on('session_start', (event, ctx) =>
      runtime.start(pi, ctx, event.reason, gateBinding?.(pi, ctx)),
    ),
    pi.on('session_shutdown', (event) => runtime.shutdown(event.reason)),
    pi.on('session_tree', (_event, ctx) => runtime.refresh(ctx)),
    pi.on('input', (event, ctx) => {
      if ((event as { source?: string }).source !== 'extension') runtime.userInput(ctx);
    }),
    pi.on('before_agent_start', (_event, ctx) => runtime.naturalTurn(ctx)),
    pi.on('message_start', (event, ctx) => {
      if ((event as { message?: { role?: string } }).message?.role === 'user')
        runtime.userTurnStarted(ctx);
    }),
    pi.on('agent_settled', (_event, ctx) => runtime.idle(ctx)),
    pi.on('turn_end', (event, ctx) => runtime.boundary(event, ctx, true)),
    pi.on('agent_before_settle', (event, ctx) => runtime.boundary(event, ctx)),
  ];
  return () => unsubscribe.forEach((close) => close());
}
