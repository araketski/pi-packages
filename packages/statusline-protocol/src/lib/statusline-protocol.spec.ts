import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import {
  STATUS_CLEAR_EVENT,
  STATUS_SET_EVENT,
  STATUS_SNAPSHOT_EVENT,
  STATUS_SNAPSHOT_REQUEST_EVENT,
  registerStatus,
  type StatuslineHost,
  type StatuslineUI,
} from '../index.js';

function fixture() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const host: StatuslineHost = {
    events: {
      on(name, handler) {
        const handlers = listeners.get(name) ?? new Set();
        handlers.add(handler);
        listeners.set(name, handlers);
        return () => handlers.delete(handler);
      },
      emit(name, payload) {
        for (const handler of listeners.get(name) ?? []) handler(payload);
      },
    },
  };
  const setStatus = vi.fn<StatuslineUI['setStatus']>();
  const fg = vi.fn<StatuslineUI['theme']['fg']>((color, text) => `<${color}>${text}</${color}>`);
  const ui: StatuslineUI = { setStatus, theme: { fg } };
  return { host, ui, setStatus };
}

// Compile against the actual Pi 0.87.1 extension interfaces, not only test doubles.
function acceptsPi(pi: ExtensionAPI, ctx: ExtensionContext) {
  return registerStatus(pi, ctx.ui, { source: 'example', key: 'example' });
}
void acceptsPi;

describe('registered statuses', () => {
  it('uses producer defaults for native fallback and full structured updates without a footer', () => {
    const { host, ui, setStatus } = fixture();
    const events: unknown[] = [];
    host.events.on(STATUS_SET_EVENT, (value) => events.push(value));
    const status = registerStatus(host, ui, {
      source: 'fast-mode',
      key: 'fast',
      icon: '⚡',
      color: 'accent',
    });

    status.update({ text: 'on', state: 'enabled' });
    status.update({ text: 'off', state: 'disabled' });
    expect(setStatus).toHaveBeenNthCalledWith(1, 'fast', '<accent>⚡ on</accent>');
    expect(setStatus).toHaveBeenNthCalledWith(2, 'fast', '<accent>⚡ off</accent>');
    expect(events).toEqual([
      {
        source: 'fast-mode',
        key: 'fast',
        text: 'on',
        state: 'enabled',
        icon: '⚡',
        color: 'accent',
      },
      {
        source: 'fast-mode',
        key: 'fast',
        text: 'off',
        state: 'disabled',
        icon: '⚡',
        color: 'accent',
      },
    ]);
    const cleared: unknown[] = [];
    host.events.on(STATUS_CLEAR_EVENT, (value) => cleared.push(value));
    status.clear();
    expect(setStatus).toHaveBeenLastCalledWith('fast', undefined);
    expect(cleared).toEqual([{ source: 'fast-mode', key: 'fast' }]);
    status.dispose();
  });

  it('does not leak caller ANSI formatting into structured data or native themed fallback', () => {
    const { host, ui, setStatus } = fixture();
    const events: unknown[] = [];
    host.events.on(STATUS_SET_EVENT, (value) => events.push(value));
    const status = registerStatus(host, ui, {
      source: 'fast-mode',
      key: 'fast',
      icon: '\u001b[33m⚡\u001b[0m',
      color: 'accent',
    });
    status.update({ text: '\u001b[31mon\u001b[0m', state: 'enabled' });
    expect(events).toEqual([
      {
        source: 'fast-mode',
        key: 'fast',
        text: 'on',
        state: 'enabled',
        icon: '⚡',
        color: 'accent',
      },
    ]);
    expect(setStatus).toHaveBeenCalledWith('fast', '<accent>⚡ on</accent>');
    status.dispose();
  });

  it('recovers every active status after late startup and omits cleared or disposed statuses', () => {
    const { host, ui } = fixture();
    const fast = registerStatus(host, ui, {
      source: 'fast-mode',
      key: 'fast',
      icon: '⚡',
      color: 'accent',
    });
    const goal = registerStatus(host, ui, {
      source: 'goal',
      key: 'goal',
      icon: '◎',
      color: 'success',
    });
    const gone = registerStatus(host, ui, { source: 'gone', key: 'gone' });
    fast.update({ text: 'on', state: 'enabled' });
    goal.update({ text: 'active', state: 'running' });
    gone.update({ text: 'expired' });
    gone.dispose();
    const snapshots: unknown[] = [];
    host.events.on(STATUS_SNAPSHOT_EVENT, (payload) => snapshots.push(payload));
    host.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, undefined);
    expect(snapshots).toEqual([
      {
        source: 'fast-mode',
        statuses: [
          {
            source: 'fast-mode',
            key: 'fast',
            text: 'on',
            state: 'enabled',
            icon: '⚡',
            color: 'accent',
          },
        ],
      },
      {
        source: 'goal',
        statuses: [
          {
            source: 'goal',
            key: 'goal',
            text: 'active',
            state: 'running',
            icon: '◎',
            color: 'success',
          },
        ],
      },
    ]);
    goal.clear();
    snapshots.length = 0;
    host.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, undefined);
    expect(snapshots).toEqual([
      {
        source: 'fast-mode',
        statuses: [
          {
            source: 'fast-mode',
            key: 'fast',
            text: 'on',
            state: 'enabled',
            icon: '⚡',
            color: 'accent',
          },
        ],
      },
      { source: 'goal', statuses: [] },
    ]);
    fast.dispose();
    goal.dispose();
    snapshots.length = 0;
    host.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, undefined);
    expect(snapshots).toEqual([]);
  });
});
