import type { JobIdentity, JobObservation, JobsEventBus } from './index.js';

/** Synchronous in-process fixture. Never a production coordinator or native Pi proof. */
export function createJobsTestBus(): JobsEventBus & { listenerCount(): number } {
  const channels = new Map<string, Set<(data: unknown) => void>>();
  return {
    emit(channel, data) {
      // Dispatch against a snapshot: subscription changes apply only to the next emission.
      const handlers = Array.from(channels.get(channel) ?? []);
      for (const handler of handlers) handler(data);
    },
    on(channel, handler) {
      const handlers = channels.get(channel) ?? new Set();
      channels.set(channel, handlers);
      handlers.add(handler);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        handlers.delete(handler);
        if (!handlers.size) channels.delete(channel);
      };
    },
    listenerCount: () =>
      [...channels.values()].reduce((count, handlers) => count + handlers.size, 0),
  };
}
/** No executor, saved result, ownership grant or fabricated successful outcome. */
export function createUnknownJobFixture(identity: JobIdentity): JobObservation {
  return {
    identity: { ...identity },
    execution: { state: 'unknown', reason: 'fixture: no execution evidence' },
    delivery: { mode: 'automatic', state: 'unknown' },
    awaiting: true,
    lifetime: 'managed',
    capabilities: {
      stop: false,
      setAwaiting: false,
      setDelivery: false,
      readOutput: false,
      readResult: false,
    },
  };
}
