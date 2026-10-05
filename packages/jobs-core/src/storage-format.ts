import { createHash } from 'node:crypto';
import type { FinalResult, JobIdentity, JobObservation, LaunchRequest } from './index.js';

import type { StoragePolicy } from './storage-policy.js';
export type { StoragePolicy } from './storage-policy.js';
export interface StoredJob {
  format: 1;
  reservationId: string;
  request: LaunchRequest;
  observation: JobObservation;
  policy: StoragePolicy;
  eligibleAt?: number;
}
export interface ByteWindow {
  bytes: Buffer;
  seen: number;
  head: number;
}
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function oneOf(value: unknown, choices: readonly string[]): boolean {
  return typeof value === 'string' && choices.includes(value);
}
export function validJob(value: unknown): value is JobIdentity {
  return (
    object(value) &&
    ['runtimeId', 'ownerId', 'sessionId', 'jobId', 'producerId'].every((k) => validId(value[k]))
  );
}
export function key(job: JobIdentity): string {
  return createHash('sha256')
    .update(JSON.stringify([job.runtimeId, job.ownerId, job.sessionId, job.jobId, job.producerId]))
    .digest('hex');
}
export function sameJob(a: JobIdentity, b: JobIdentity): boolean {
  return key(a) === key(b);
}
function validOutcome(value: unknown): boolean {
  return (
    object(value) &&
    ((value.kind === 'exit' && Number.isSafeInteger(value.exitCode)) ||
      (value.kind === 'terminated' && validId(value.signal)) ||
      (value.kind === 'launch-failed' &&
        typeof value.reason === 'string' &&
        value.reason.trim().length > 0))
  );
}
export function validObservation(value: unknown): value is JobObservation {
  if (
    !object(value) ||
    !validJob(value.identity) ||
    !object(value.execution) ||
    !object(value.delivery) ||
    !object(value.capabilities)
  )
    return false;
  const e = value.execution,
    d = value.delivery;
  if ('exitCode' in e || 'resultId' in e) return false;
  if (
    !(
      (e.state === 'running' && !('outcome' in e)) ||
      (e.state === 'unknown' &&
        typeof e.reason === 'string' &&
        e.reason.trim() &&
        !('outcome' in e)) ||
      (e.state === 'terminal' && validOutcome(e.outcome))
    )
  )
    return false;
  if (!oneOf(d.mode, ['automatic', 'next-natural-turn', 'display-only'])) return false;
  if (d.state === 'delivered') {
    if (e.state !== 'terminal' || d.mode === 'display-only') return false;
    const r = d.receipt;
    if (
      !object(r) ||
      !object(r.result) ||
      !validJob(r.result.job) ||
      !sameJob(r.result.job, value.identity) ||
      !validId(r.result.resultId) ||
      !object(r.record) ||
      r.record.sessionId !== value.identity.sessionId ||
      !validId(r.record.entryId) ||
      !oneOf(r.record.kind, ['tool-result', 'custom-message']) ||
      !validId(r.contentDigest)
    )
      return false;
  } else if (
    !(
      ((d.state === 'pending' || d.state === 'unknown') && !('receipt' in d)) ||
      (d.state === 'not-required' && d.mode === 'display-only')
    )
  )
    return false;
  return (
    typeof value.awaiting === 'boolean' &&
    oneOf(value.lifetime, ['managed', 'persistent']) &&
    ['stop', 'setAwaiting', 'setDelivery', 'readOutput', 'readResult'].every(
      (k) => typeof (value.capabilities as Record<string, unknown>)[k] === 'boolean',
    )
  );
}
export function validResult(value: unknown): value is FinalResult {
  if (
    !object(value) ||
    !object(value.identity) ||
    !validJob(value.identity.job) ||
    !validId(value.identity.resultId) ||
    !validOutcome(value.outcome) ||
    typeof value.content !== 'string'
  )
    return false;
  if (value.output !== undefined) {
    const o = value.output;
    if (
      !object(o) ||
      typeof o.text !== 'string' ||
      !validId(o.reference) ||
      typeof o.complete !== 'boolean' ||
      !Number.isSafeInteger(o.omittedBytes) ||
      (o.omittedBytes as number) < 0 ||
      o.complete !== (o.omittedBytes === 0)
    )
      return false;
  }
  return true;
}
export function validPolicy(value: unknown): value is StoragePolicy {
  return (
    object(value) &&
    ['totalBytes', 'outputBytes', 'trackingBytes', 'resultBytes', 'retentionMs'].every(
      (k) => Number.isSafeInteger(value[k]) && (value[k] as number) > 0,
    ) &&
    (value.outputBytes as number) <= (value.totalBytes as number)
  );
}
export function validRequest(value: unknown): value is LaunchRequest {
  return (
    object(value) &&
    validJob(value.identity) &&
    object(value.authority) &&
    value.authority.runtimeId === value.identity.runtimeId &&
    value.authority.ownerId === value.identity.ownerId &&
    validId(value.authority.generation) &&
    typeof value.awaiting === 'boolean' &&
    oneOf(value.delivery, ['automatic', 'next-natural-turn', 'display-only']) &&
    oneOf(value.lifetime, ['managed', 'persistent'])
  );
}
export function eligible(job: JobObservation): boolean {
  return (
    job.execution.state === 'terminal' &&
    (job.delivery.state === 'delivered' ||
      (job.delivery.mode === 'display-only' && job.delivery.state === 'not-required'))
  );
}
export function appendWindow(old: ByteWindow, chunk: Buffer, limit: number): ByteWindow {
  const seen = old.seen + chunk.length;
  if (!Number.isSafeInteger(seen)) throw new Error('Output byte counter exhausted.');
  const all = Buffer.concat([old.bytes, chunk]);
  if (seen === all.length && all.length <= limit) return { bytes: all, seen, head: 0 };
  const head = Math.min(
    old.seen === old.bytes.length ? Math.min(64 * 1024, Math.floor(limit / 4)) : old.head,
    Math.floor(limit / 4),
  );
  const tail = limit - head;
  return {
    bytes: Buffer.concat([
      all.subarray(0, head),
      tail ? all.subarray(Math.max(head, all.length - tail)) : Buffer.alloc(0),
    ]),
    seen,
    head,
  };
}
export function encodeWindow(w: ByteWindow): Buffer {
  const header = Buffer.alloc(24);
  header.writeBigUInt64BE(BigInt(w.seen), 0);
  header.writeBigUInt64BE(BigInt(w.head), 8);
  header.writeBigUInt64BE(BigInt(w.bytes.length), 16);
  return Buffer.concat([header, w.bytes]);
}
export function decodeWindow(bytes: Buffer): ByteWindow {
  if (bytes.length < 24) throw new Error('Corrupt output header.');
  const seen = Number(bytes.readBigUInt64BE(0)),
    head = Number(bytes.readBigUInt64BE(8)),
    length = Number(bytes.readBigUInt64BE(16));
  if (
    !Number.isSafeInteger(seen) ||
    !Number.isSafeInteger(head) ||
    length !== bytes.length - 24 ||
    seen < length ||
    head > length
  )
    throw new Error('Corrupt output accounting.');
  return { bytes: bytes.subarray(24), seen, head };
}
