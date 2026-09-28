import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import {
  STATUS_CLEAR_EVENT,
  STATUS_SET_EVENT,
  STATUS_SNAPSHOT_EVENT,
  STATUS_SNAPSHOT_REQUEST_EVENT,
  registerStatus,
  type StatusAppearance,
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

// Compile against Pi 0.87.1 and use the same appearance type for footer configuration.
const footerAppearance: Record<string, StatusAppearance> = {
  example: { prefix: '◎', color: { default: 'muted', byState: { running: 'accent' } } },
};
function acceptsPi(pi: ExtensionAPI, ctx: ExtensionContext) {
  return registerStatus(pi, ctx.ui, {
    source: 'example',
    key: 'example',
    ...footerAppearance.example,
  });
}
void acceptsPi;

describe('registered statuses', () => {
  it('resolves per-state colors and preserves complete producer defaults in updates', () => {
    const { host, ui, setStatus } = fixture();
    const events: unknown[] = [];
    host.events.on(STATUS_SET_EVENT, (value) => events.push(value));
    const color = { default: 'muted', byState: { enabled: 'success', disabled: 'warning' } };
    const status = registerStatus(host, ui, {
      source: 'fast-mode',
      key: 'fast',
      prefix: 'FAST',
      color,
    });

    status.update({ text: 'on', state: 'enabled' });
    status.update({ text: 'off', state: 'disabled' });
    status.update({ text: 'other', state: 'unrecognized' });
    status.update({ text: 'idle' });
    expect(setStatus).toHaveBeenNthCalledWith(1, 'fast', '<success>FAST on</success>');
    expect(setStatus).toHaveBeenNthCalledWith(2, 'fast', '<warning>FAST off</warning>');
    expect(setStatus).toHaveBeenNthCalledWith(3, 'fast', '<muted>FAST other</muted>');
    expect(setStatus).toHaveBeenNthCalledWith(4, 'fast', '<muted>FAST idle</muted>');
    expect(events).toEqual([
      { source: 'fast-mode', key: 'fast', text: 'on', state: 'enabled', prefix: 'FAST', color },
      { source: 'fast-mode', key: 'fast', text: 'off', state: 'disabled', prefix: 'FAST', color },
      {
        source: 'fast-mode',
        key: 'fast',
        text: 'other',
        state: 'unrecognized',
        prefix: 'FAST',
        color,
      },
      { source: 'fast-mode', key: 'fast', text: 'idle', state: undefined, prefix: 'FAST', color },
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
      prefix: '\u001b[33m⚡\u001b[0m',
      color: 'accent',
    });
    status.update({ text: '\u001b[31mon\u001b[0m' });
    expect(events).toEqual([
      {
        source: 'fast-mode',
        key: 'fast',
        text: 'on',
        state: undefined,
        prefix: '⚡',
        color: 'accent',
      },
    ]);
    expect(setStatus).toHaveBeenCalledWith('fast', '<accent>⚡ on</accent>');
    status.dispose();
  });

  it('renders six-digit hex and ANSI 256 colors while retaining raw values in events and snapshots', () => {
    const { host, ui, setStatus } = fixture();
    const events: unknown[] = [];
    const snapshots: unknown[] = [];
    host.events.on(STATUS_SET_EVENT, (value) => events.push(value));
    host.events.on(STATUS_SNAPSHOT_EVENT, (value) => snapshots.push(value));
    const color = { default: 39, byState: { busy: '#8aAdF4', done: 0 } };
    const status = registerStatus(host, ui, {
      source: 'example',
      key: 'example',
      prefix: '◎',
      color,
    });
    status.update({ text: 'active', state: 'busy' });
    status.update({ text: 'finished', state: 'done' });
    status.update({ text: 'waiting', state: 'unknown' });
    expect(setStatus).toHaveBeenNthCalledWith(
      1,
      'example',
      '\u001b[38;2;138;173;244m◎ active\u001b[0m',
    );
    expect(setStatus).toHaveBeenNthCalledWith(2, 'example', '\u001b[38;5;0m◎ finished\u001b[0m');
    expect(setStatus).toHaveBeenNthCalledWith(3, 'example', '\u001b[38;5;39m◎ waiting\u001b[0m');
    expect(events).toEqual([
      { source: 'example', key: 'example', text: 'active', state: 'busy', prefix: '◎', color },
      { source: 'example', key: 'example', text: 'finished', state: 'done', prefix: '◎', color },
      { source: 'example', key: 'example', text: 'waiting', state: 'unknown', prefix: '◎', color },
    ]);
    host.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, undefined);
    expect(snapshots).toEqual([{ source: 'example', statuses: [events[2]] }]);
    status.dispose();
  });

  it('supports one 256-color index and an explicit terminal-default color', () => {
    const { host, ui, setStatus } = fixture();
    const indexed = registerStatus(host, ui, { source: 'index', key: 'index', color: 255 });
    indexed.update({ text: 'white' });
    expect(setStatus).toHaveBeenCalledWith('index', '\u001b[38;5;255mwhite\u001b[0m');
    const plain = registerStatus(host, ui, { source: 'plain', key: 'plain', color: '' });
    plain.update({ text: 'default' });
    expect(setStatus).toHaveBeenCalledWith('plain', 'default');
    indexed.dispose();
    plain.dispose();
  });

  it.each(['#abc', '#xyzxyz', '#1234567', 256, -1, 1.5])(
    'rejects invalid colors at registration: %s',
    (color) => {
      const { host, ui, setStatus } = fixture();
      expect(() => registerStatus(host, ui, { source: 'bad', key: 'bad', color })).toThrow(
        /Invalid status color/,
      );
      const snapshots: unknown[] = [];
      host.events.on(STATUS_SNAPSHOT_EVENT, (value) => snapshots.push(value));
      host.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, undefined);
      expect(snapshots).toEqual([]);
      expect(setStatus).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid state colors before registering a producer', () => {
    const { host, ui } = fixture();
    expect(() =>
      registerStatus(host, ui, {
        source: 'bad',
        key: 'bad',
        color: { default: 'muted', byState: { active: '#abc' } },
      }),
    ).toThrow(/Invalid status color/);
  });

  it('recovers every active status after late startup and omits cleared or disposed statuses', () => {
    const { host, ui } = fixture();
    const color = { default: 'muted', byState: { enabled: 'success' } };
    const fast = registerStatus(host, ui, {
      source: 'fast-mode',
      key: 'fast',
      prefix: 'FAST',
      color,
    });
    const goal = registerStatus(host, ui, {
      source: 'goal',
      key: 'goal',
      prefix: '◎',
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
            prefix: 'FAST',
            color,
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
            prefix: '◎',
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
            prefix: 'FAST',
            color,
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
