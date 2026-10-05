import { expect, it } from 'vitest';
import { createJobsParticipant } from './index.js';
import * as fixtures from './testing.js';

it('keeps replacement subscriptions alive when previous cleanup repeats', () => {
  const events = fixtures.createJobsTestBus();
  const received: unknown[] = [];
  const unsubscribe = events.on('test', () => undefined);
  unsubscribe();
  const replacementCleanup = events.on('test', (data) => received.push(data));
  unsubscribe();
  events.emit('test', 'replacement');
  expect(events.listenerCount()).toBe(1);
  expect(received).toEqual(['replacement']);
  replacementCleanup();
  replacementCleanup();
  expect(events.listenerCount()).toBe(0);
});

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
