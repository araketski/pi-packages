import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';
import goal, { bindGoalState } from '../extensions/goal/index.ts';

it('registers only the four state lifecycle observers, not controls or scheduling', () => {
  const handlers = new Map<string, (event: { reason?: string }, ctx: ExtensionContext) => void>();
  const accessed: PropertyKey[] = [];
  const pi = new Proxy({} as ExtensionAPI, {
    get(_target, key) {
      accessed.push(key);
      if (key === 'on')
        return (
          name: string,
          handler: (event: { reason?: string }, ctx: ExtensionContext) => void,
        ) => handlers.set(name, handler);
      throw new Error(`Unexpected Pi API: ${String(key)}`);
    },
  });
  expect(goal(pi)).toBeUndefined();
  expect([...handlers.keys()]).toEqual([
    'session_start',
    'session_tree',
    'session_compact',
    'session_shutdown',
  ]);
  expect(accessed).toEqual(['on', 'on', 'on', 'on']);
});

it('binds fresh event contexts and discards authority on shutdown', () => {
  const session = SessionManager.inMemory();
  const handlers = new Map<string, (event: { reason?: string }, ctx: ExtensionContext) => void>();
  const pi = {
    on: (name: string, handler: (event: { reason?: string }, ctx: ExtensionContext) => void) =>
      handlers.set(name, handler),
    appendEntry: (type: string, data: unknown) => session.appendCustomEntry(type, data),
  } as unknown as ExtensionAPI;
  const state = bindGoalState(pi);
  const ctx = { sessionManager: session } as unknown as ExtensionContext;
  handlers.get('session_start')!({ reason: 'new' }, ctx);
  state.create('Outcome');
  handlers.get('session_shutdown')!({}, ctx);
  expect(state.inspect().goal).toBeNull();
  expect(() => state.create('Stale')).toThrow(/session/);
  handlers.get('session_start')!({ reason: 'reload' }, ctx);
  expect(state.inspect().goal?.status).toBe('paused');
});
