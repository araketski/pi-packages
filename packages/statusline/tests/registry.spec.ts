import { describe, expect, it, vi } from 'vitest';
import {
  STATUS_CLEAR_EVENT,
  STATUS_SET_EVENT,
  STATUS_SNAPSHOT_EVENT,
  registerStatus,
  type StatuslineHost,
  type StatuslineUI,
} from '@araketski/pi-statusline-protocol';
import { createStatusRegistry } from '../extensions/statusline/src/registry.js';

function fixture() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const host: StatuslineHost = {
    events: {
      on(event, callback) {
        const listeners = handlers.get(event) ?? new Set();
        listeners.add(callback);
        handlers.set(event, listeners);
        return () => listeners.delete(callback);
      },
      emit(event, value) {
        for (const callback of handlers.get(event) ?? []) callback(value);
      },
    },
  };
  const ui: StatuslineUI = {
    setStatus: vi.fn(),
    theme: { fg: (color, text) => `<${color}>${text}</${color}>` },
  };
  const count = () => [...handlers.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  return { host, ui, count };
}

describe('status subscriber', () => {
  it('recovers independent producers sharing a source, then follows updates and clears', () => {
    const { host, ui, count } = fixture();
    const a = registerStatus(host, ui, { source: 'same', key: 'a', prefix: 'A', color: 'accent' });
    const b = registerStatus(host, ui, {
      source: 'same',
      key: 'b',
      color: { byState: { busy: 0 } },
    });
    a.update({ text: 'one' });
    b.update({ text: 'two', state: 'busy' });
    const changed = vi.fn();
    const registry = createStatusRegistry(host, changed);
    expect(registry.statuses.size).toBe(0);
    registry.requestSnapshot();
    expect([...registry.statuses.values()]).toEqual([
      { source: 'same', key: 'a', text: 'one', state: undefined, prefix: 'A', color: 'accent' },
      {
        source: 'same',
        key: 'b',
        text: 'two',
        state: 'busy',
        prefix: undefined,
        color: { byState: { busy: 0 } },
      },
    ]);
    b.update({ text: 'three', state: 'busy' });
    expect(registry.statuses.get('b')?.text).toBe('three');
    a.clear();
    expect([...registry.statuses.keys()]).toEqual(['b']);
    b.dispose();
    expect(registry.statuses.size).toBe(0);
    expect(changed).toHaveBeenCalled();
    const active = count();
    registry.dispose();
    expect(count()).toBe(active - 3);
    expect(() => registry.dispose()).not.toThrow();
    a.dispose();
  });

  it('does not roll back a newer set or resurrect a clear from a delayed snapshot', () => {
    const { host } = fixture();
    const registry = createStatusRegistry(host, vi.fn());
    registry.requestSnapshot();
    host.events.emit(STATUS_SET_EVENT, { source: 's', key: 'a', text: 'new' });
    host.events.emit(STATUS_SNAPSHOT_EVENT, {
      source: 's',
      statuses: [{ source: 's', key: 'a', text: 'old' }],
    });
    expect(registry.statuses.get('a')?.text).toBe('new');
    host.events.emit(STATUS_CLEAR_EVENT, { source: 's', key: 'a' });
    host.events.emit(STATUS_SNAPSHOT_EVENT, {
      source: 's',
      statuses: [{ source: 's', key: 'a', text: 'old' }],
    });
    expect(registry.statuses.has('a')).toBe(false);
    registry.dispose();
  });

  it('ignores malformed payloads and empty snapshots without removing another producer', () => {
    const { host } = fixture();
    const registry = createStatusRegistry(host, vi.fn());
    host.events.emit(STATUS_SET_EVENT, { source: 's', key: 'a', text: 'valid' });
    host.events.emit(STATUS_SET_EVENT, { source: 's', key: 'a', text: 42 });
    host.events.emit(STATUS_SET_EVENT, {
      source: 's',
      key: 'a',
      text: 'bad color',
      color: 'notAThemeRole',
    });
    host.events.emit(STATUS_SET_EVENT, {
      source: 's',
      key: 'a',
      text: 'bad state color',
      color: { byState: { busy: '#123' } },
    });
    host.events.emit(STATUS_CLEAR_EVENT, { source: 42, key: 'a' });
    host.events.emit(STATUS_SNAPSHOT_EVENT, { source: 's', statuses: [] });
    host.events.emit(STATUS_SNAPSHOT_EVENT, {
      source: 's',
      statuses: [{ source: 'elsewhere', key: 'a', text: 'bad' }],
    });
    expect(registry.statuses.get('a')?.text).toBe('valid');
    registry.dispose();
    host.events.emit(STATUS_SET_EVENT, { source: 's', key: 'a', text: 'after dispose' });
    expect(registry.statuses.size).toBe(0);
  });
});
