import { expect, it } from 'vitest';
import { createJobsParticipant } from './index.js';
import * as fixtures from './testing.js';

it('supplies isolated explicit buses and honest unknown jobs for consumer contract tests', () => {
  const first = fixtures.createJobsTestBus();
  const second = fixtures.createJobsTestBus();
  const identity = { runtimeId: 'runtime', participantId: 'owner', role: 'owner' as const };
  const owner = createJobsParticipant({ events: first }, identity);
  const observer = createJobsParticipant(
    { events: second },
    { ...identity, participantId: 'view', role: 'observer' },
  );
  owner.start();
  observer.start();
  const job = fixtures.createUnknownJobFixture({
    runtimeId: 'runtime',
    ownerId: 'owner',
    sessionId: 'session',
    jobId: 'job',
    producerId: 'opaque',
  });
  owner.publish('session', [job]);
  expect(observer.view().snapshots).toEqual([]);
  expect(job.execution).toEqual({ state: 'unknown', reason: 'fixture: no execution evidence' });
  expect(job.delivery.state).toBe('unknown');
  expect(job.capabilities.stop).toBe(false);
  expect(first.listenerCount()).toBe(1);
  owner.close();
  observer.close();
  expect(first.listenerCount()).toBe(0);
  expect(second.listenerCount()).toBe(0);
});
