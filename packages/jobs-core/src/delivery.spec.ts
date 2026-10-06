import { describe, expect, it } from 'vitest';
import { createCompletionCoordinator, jobsFinalResultText } from './delivery.js';
import type { FinalResult, FinalResultReceipt } from './index.js';

const scope = { runtimeId: 'R', sessionId: 'S' };
const final = (jobId: string, producerId = 'external'): FinalResult => ({
  identity: { job: { ...scope, ownerId: 'O', producerId, jobId }, resultId: `${jobId}-final` },
  outcome: { kind: 'exit', exitCode: 0 },
  content: `done ${jobId}`,
});
const receipt = (result: FinalResult): FinalResultReceipt => ({
  result: result.identity,
  record: { sessionId: 'S', entryId: 'entry', kind: 'tool-result' },
  contentDigest: 'verified-by-host',
});

describe('explicit shared completion inbox', () => {
  it('reserves one wake across producers, captures without consuming and confirms only selections', async () => {
    const inbox = createCompletionCoordinator();
    const a = final('a'),
      b = final('b', 'another');
    await Promise.all([inbox.enqueue(a, 'automatic'), inbox.enqueue(b, 'automatic')]);
    const wakes = await Promise.all(
      ['one', 'two'].map((id) => inbox.reserveWake(scope, id, 'automatic-idle')),
    );
    expect(wakes.map((w) => w.state).sort()).toEqual(['already-pending', 'reserved']);
    expect(await inbox.capture(scope, [a.identity])).toEqual({ status: 'ok', value: [a] });
    expect(await inbox.inspect(scope)).toEqual({ status: 'ok', value: [a, b] });
    await inbox.confirm([receipt(a)]);
    expect(await inbox.capture(scope, [a.identity, b.identity])).toEqual({
      status: 'ok',
      value: [b],
    });
    const wake = wakes.find((w) => w.state === 'reserved')!;
    if (wake.state !== 'reserved') throw Error('missing reservation');
    expect(
      (await inbox.finishWake({ ...wake.reservation, participantId: 'imposter' })).status,
    ).toBe('denied');
    await inbox.reportWake(wake.reservation, 'unconfirmed');
    expect((await inbox.reserveWake(scope, 'three', 'automatic-idle')).state).toBe(
      'already-pending',
    );
    await inbox.finishWake(wake.reservation);
    expect((await inbox.reserveWake(scope, 'three', 'automatic-idle')).state).toBe('reserved');
  });
  it('does not wake next-turn/display-only work or replay confirmed identities', async () => {
    const inbox = createCompletionCoordinator();
    const a = final('a');
    await inbox.enqueue(a, 'next-natural-turn');
    await inbox.enqueue(final('b'), 'display-only');
    expect((await inbox.reserveWake(scope, 'O', 'automatic-idle')).state).toBe('ineligible');
    await inbox.confirm([receipt(a)]);
    await inbox.enqueue(a, 'automatic');
    expect(await inbox.inspect(scope)).toEqual({ status: 'ok', value: [] });
    expect(jobsFinalResultText(a)).toContain('done a');
  });
});
