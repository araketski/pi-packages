import type {
  ControlAuthority,
  ExecutionAdapter,
  ExecutionState,
  JobIdentity,
  JobObservation,
  JobsEventBus,
} from './index.js';
import type { JobsClock } from './lifecycle.js';

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
/** Controlled execution fixture only. Its force-stop outcome is synthetic, not process evidence. */
export function createJobsTestAdapter(clock: JobsClock): {
  handle: object;
  adapter: Pick<ExecutionAdapter<object, unknown>, 'observe' | 'stop'>;
  setExecution(state: ExecutionState): void;
  stopCalls: { authority: ControlAuthority; graceMs: number }[];
  forcedStops(): number;
  dispose(): void;
} {
  const handle = {};
  let execution: ExecutionState = { state: 'unknown', reason: 'fixture: no execution evidence' };
  const stopCalls: { authority: ControlAuthority; graceMs: number }[] = [];
  let forced = 0;
  let cancel: (() => void) | undefined;
  let disposed = false;
  return {
    handle,
    stopCalls,
    adapter: {
      async observe(value) {
        if (value !== handle || disposed)
          return { state: 'unknown', reason: 'fixture: unrecognized/disposed handle' };
        return structuredClone(execution);
      },
      async stop(value, authority, graceMs) {
        if (value !== handle || disposed)
          return { status: 'denied', reason: 'fixture: unrecognized/disposed handle' };
        stopCalls.push({ authority: structuredClone(authority), graceMs });
        if (execution.state !== 'terminal' && !cancel)
          cancel = clock.schedule(() => {
            cancel = undefined;
            if (execution.state !== 'terminal' && !disposed) {
              forced++;
              execution = {
                state: 'terminal',
                outcome: { kind: 'terminated', signal: 'fixture-force' },
              };
            }
          }, graceMs);
        return { status: 'ok', value: { requested: true } };
      },
    },
    setExecution(state) {
      execution = structuredClone(state);
      if (state.state === 'terminal') {
        cancel?.();
        cancel = undefined;
      }
    },
    forcedStops: () => forced,
    dispose() {
      disposed = true;
      cancel?.();
      cancel = undefined;
    },
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
