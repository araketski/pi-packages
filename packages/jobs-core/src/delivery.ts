import { createHash, randomUUID } from 'node:crypto';
import type {
  CompletionCoordinator,
  DeliveryMode,
  FinalResult,
  FinalResultReceipt,
  JobReply,
  ResultIdentity,
  SessionScope,
  WakeReservation,
} from './index.js';

export const JOBS_RESULTS_MESSAGE_TYPE = 'araketski.pi-jobs/results';
const prefix = 'Pi jobs final result v1\n';
const copy = <T>(value: T): T => structuredClone(value);
export const jobsResultKey = (identity: ResultIdentity): string =>
  JSON.stringify([
    identity.job.runtimeId,
    identity.job.sessionId,
    identity.job.ownerId,
    identity.job.producerId,
    identity.job.jobId,
    identity.resultId,
  ]);
const scopeKey = (scope: SessionScope) => JSON.stringify([scope.runtimeId, scope.sessionId]);
const ok = <T>(value: T): JobReply<T> => ({ status: 'ok', value });

/** Forward this complete text block, not just details/structuredContent or a job ID. */
export function jobsFinalResultText(result: FinalResult): string {
  return (
    prefix +
    JSON.stringify({
      identity: result.identity,
      outcome: result.outcome,
      content: result.content,
      ...(result.output === undefined ? {} : { output: result.output }),
    })
  );
}
export function jobsFinalResultDigest(result: FinalResult): string {
  return createHash('sha256').update(jobsFinalResultText(result)).digest('hex');
}

/** One explicitly shared service. State changes happen synchronously before promises resolve. */
// @mara implements REQ-JOBS-COMPLETION-INBOX
export function createCompletionCoordinator(): CompletionCoordinator {
  const results = new Map<string, { result: FinalResult; mode: DeliveryMode }>();
  const confirmed = new Set<string>();
  const wakes = new Map<string, WakeReservation>();
  const matches = (reservation: WakeReservation) => {
    const current = wakes.get(scopeKey(reservation.scope));
    return (
      current &&
      current.wakeId === reservation.wakeId &&
      current.participantId === reservation.participantId
    );
  };
  const denied = (): JobReply<never> => ({
    status: 'denied',
    reason: 'No matching wake reservation.',
  });
  return {
    async enqueue(result, mode) {
      const key = jobsResultKey(result.identity);
      if (mode === 'display-only') {
        results.delete(key);
        return ok(undefined);
      }
      if (confirmed.has(key)) return ok(undefined);
      const prior = results.get(key);
      if (prior && jobsFinalResultText(prior.result) !== jobsFinalResultText(result))
        return { status: 'invalid', reason: 'Stable result identity has different final content.' };
      results.set(key, { result: copy(result), mode });
      return ok(undefined);
    },
    async inspect(scope) {
      return ok(
        [...results.values()]
          .filter(({ result }) => scopeKey(result.identity.job) === scopeKey(scope))
          .map(({ result }) => copy(result)),
      );
    },
    async reserveWake(scope, participantId, eligibility) {
      if (eligibility === 'unknown') return { state: 'unknown' };
      if (eligibility !== 'automatic-idle') return { state: 'ineligible' };
      if (wakes.has(scopeKey(scope))) return { state: 'already-pending' };
      if (
        ![...results.values()].some(
          ({ result, mode }) =>
            mode === 'automatic' && scopeKey(result.identity.job) === scopeKey(scope),
        )
      )
        return { state: 'ineligible' };
      const reservation = { scope: copy(scope), participantId, wakeId: randomUUID() };
      wakes.set(scopeKey(scope), reservation);
      return { state: 'reserved', reservation: copy(reservation) };
    },
    async reportWake(reservation, disposition) {
      if (!matches(reservation)) return denied();
      if (disposition === 'failed') wakes.delete(scopeKey(reservation.scope));
      return ok(undefined);
    },
    async capture(scope, selected) {
      const keys = new Set(selected.map(jobsResultKey));
      return ok(
        [...results.entries()]
          .filter(
            ([key, { result }]) =>
              keys.has(key) && scopeKey(result.identity.job) === scopeKey(scope),
          )
          .map(([, { result }]) => copy(result)),
      );
    },
    async confirm(receipts) {
      for (const receipt of receipts) {
        const key = jobsResultKey(receipt.result);
        if (receipt.record.sessionId !== receipt.result.job.sessionId)
          return { status: 'invalid', reason: 'Receipt origin differs from result origin.' };
        confirmed.add(key);
        results.delete(key);
      }
      return ok(undefined);
    },
    async finishWake(reservation) {
      if (!matches(reservation)) return denied();
      wakes.delete(scopeKey(reservation.scope));
      return ok(undefined);
    },
  };
}

/** Finalized public projection, not raw tool events or nestedCalls. */
export interface JobsRecordedProjection {
  entries: readonly {
    sourceEntry: { id: string };
    messages: readonly unknown[];
  }[];
}
// @mara implements REQ-JOBS-DELIVERY-RECEIPTS
export function findJobsFinalReceipts(
  sessionId: string,
  results: readonly FinalResult[],
  projection: JobsRecordedProjection,
): FinalResultReceipt[] {
  const receipts: FinalResultReceipt[] = [];
  for (const result of results) {
    if (result.identity.job.sessionId !== sessionId) continue;
    const exact = jobsFinalResultText(result);
    for (const entry of projection.entries) {
      const message = entry.messages.find((raw) => {
        const m = raw as { role?: string; customType?: string; content?: unknown };
        if (
          !m ||
          (m.role !== 'toolResult' &&
            !(m.role === 'custom' && m.customType === JOBS_RESULTS_MESSAGE_TYPE))
        )
          return false;
        return (
          m.content === exact ||
          (Array.isArray(m.content) &&
            m.content.some((block) => block?.type === 'text' && block.text === exact))
        );
      }) as { role: string } | undefined;
      if (message) {
        receipts.push({
          result: copy(result.identity),
          record: {
            sessionId,
            entryId: entry.sourceEntry.id,
            kind: message.role === 'toolResult' ? 'tool-result' : 'custom-message',
          },
          contentDigest: jobsFinalResultDigest(result),
        });
        break;
      }
    }
  }
  return receipts;
}
