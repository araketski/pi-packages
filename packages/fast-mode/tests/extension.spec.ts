import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import {
  STATUS_SNAPSHOT_EVENT,
  STATUS_SNAPSHOT_REQUEST_EVENT,
} from '@araketski/pi-statusline-protocol';
import fastMode from '../extensions/fast-mode/index.ts';

type EventHandler = (event: any, ctx: ExtensionContext) => any;
type SessionEntry = { type: string; customType?: string; data?: unknown };

function fixture(flag = false) {
  const handlers = new Map<string, EventHandler>();
  const commands = new Map<string, (args: string, ctx: ExtensionCommandContext) => Promise<void>>();
  const shortcuts = new Map<string, (ctx: ExtensionContext) => Promise<void> | void>();
  let branch: SessionEntry[] = [];
  let selected: { provider: string; api: string; id: string } | undefined = {
    provider: 'anthropic',
    api: 'anthropic-messages',
    id: 'claude-opus-5',
  };
  let oauth = false;
  const notify = vi.fn();
  const setStatus = vi.fn();
  const appendEntry = vi.fn((customType: string, data: unknown) =>
    branch.push({ type: 'custom', customType, data }),
  );
  const registerFlag = vi.fn();
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const emit = vi.fn((name: string, value: unknown) => {
    for (const handler of listeners.get(name) ?? []) handler(value);
  });
  const on = vi.fn((name: string, handler: (value: unknown) => void) => {
    const set = listeners.get(name) ?? new Set();
    set.add(handler);
    listeners.set(name, set);
    return () => set.delete(handler);
  });
  const sessionManager = { getBranch: () => branch };
  const ctx = {
    sessionManager,
    get model() {
      return selected;
    },
    modelRegistry: { isUsingOAuth: () => oauth },
    hasUI: true,
    ui: {
      notify,
      setStatus,
      theme: { fg: (color: string, value: string) => `<${color}>${value}</${color}>` },
    },
  } as unknown as ExtensionCommandContext;
  const pi = {
    on: (name: string, handler: EventHandler) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    registerCommand: (
      name: string,
      options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> },
    ) => commands.set(name, options.handler),
    registerShortcut: (
      key: string,
      options: { handler: (ctx: ExtensionContext) => Promise<void> | void },
    ) => shortcuts.set(key, options.handler),
    registerFlag,
    getFlag: () => flag,
    appendEntry,
    events: { on, emit },
  } as unknown as ExtensionAPI;
  fastMode(pi);
  async function event(name: string, detail: object = {}) {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`Missing ${name} handler`);
    return handler({ type: name, ...detail }, ctx);
  }
  return {
    ctx,
    pi,
    handlers,
    commands,
    shortcuts,
    event,
    notify,
    setStatus,
    appendEntry,
    registerFlag,
    emit,
    setBranch: (value: SessionEntry[]) => {
      branch = value;
    },
    setModel: (model: typeof selected) => {
      selected = model;
    },
    setOAuth: (value: boolean) => {
      oauth = value;
    },
    command: async (args = '') => {
      const handler = commands.get('fast');
      if (!handler) throw new Error('Missing /fast');
      await handler(args, ctx);
    },
    shortcut: async () => {
      const handler = shortcuts.get('f3');
      if (!handler) throw new Error('Missing F3');
      await handler(ctx);
    },
  };
}

describe('fast mode Pi extension', () => {
  it('does not treat selected Claude identity as proof for identity-free header hooks', async () => {
    const f = fixture(true);
    await f.event('session_start');
    const headers = { 'Anthropic-Beta': 'user', Authorization: 'unrelated-request' };
    await f.event('before_provider_headers', { headers });
    expect(headers).toEqual({ 'Anthropic-Beta': 'user', Authorization: 'unrelated-request' });
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<warning>fast n/a</warning>');
  });

  it('does not borrow selected Codex OAuth for an identity-free same-ID payload', async () => {
    const f = fixture(true);
    f.setModel({ provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.4' });
    f.setOAuth(true);
    await f.event('session_start');
    const payload = { model: 'gpt-5.4', service_tier: undefined };
    expect(
      await f.event('before_provider_request', { payload: { model: 'gpt-5.4' } }),
    ).toBeUndefined();
    expect(await f.event('before_provider_request', { payload })).toBeUndefined();
    expect(payload).toEqual({ model: 'gpt-5.4', service_tier: undefined });
    await f.command('status');
    expect(f.notify).toHaveBeenLastCalledWith(expect.stringContaining('unavailable'), 'info');
  });

  it.each([
    ['anthropic-messages', 'claude-opus-5'],
    ['openai-responses', 'gpt-5.4'],
    ['openai-codex-responses', 'gpt-5.4'],
    ['pi-virtual', 'gpt-5.4'],
    ['openai-responses', 'gpt-6.1-sol'],
  ])(
    'preserves authored data and preference for %s/%s without consulting selected auth',
    async (api, id) => {
      const f = fixture(true);
      f.setModel({ provider: 'proxy', api, id });
      const selectedAuth = vi.fn(() => {
        throw new Error('Selected auth is not request auth');
      });
      f.ctx.modelRegistry.isUsingOAuth = selectedAuth;
      await f.event('session_start');
      for (const payload of [
        { model: id },
        { model: id, speed: 'user', service_tier: 'default' },
        null,
        [],
      ]) {
        const before = structuredClone(payload);
        expect(await f.event('before_provider_request', { payload })).toBeUndefined();
        expect(payload).toEqual(before);
      }
      const headers = { 'Anthropic-Beta': 'user,fast-mode-2026-02-01', 'X-User': null };
      await f.event('before_provider_headers', { headers });
      expect(headers).toEqual({ 'Anthropic-Beta': 'user,fast-mode-2026-02-01', 'X-User': null });
      expect(selectedAuth).not.toHaveBeenCalled();
      expect(f.appendEntry).not.toHaveBeenCalled();
      await f.command('off');
      expect(f.appendEntry).toHaveBeenCalledWith('fast', { enabled: false });
    },
  );

  it('never promotes virtual routes from payload IDs, including supported and unsupported changed routes', async () => {
    const f = fixture(true);
    f.setModel({ provider: 'openai-codex', api: 'pi-virtual', id: 'auto' });
    await f.event('session_start');
    for (const id of ['gpt-5.4', 'unsupported', 'gpt-6.1-sol', 'gpt-5.4']) {
      expect(await f.event('before_provider_request', { payload: { model: id } })).toBeUndefined();
      expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<warning>fast n/a</warning>');
    }
    expect(f.appendEntry).not.toHaveBeenCalled();
  });
  it('registers flag and controls, toggles with /fast and F3, and keeps explicit commands idempotent', async () => {
    const f = fixture();
    expect(f.registerFlag).toHaveBeenCalledWith(
      'fast',
      expect.objectContaining({ type: 'boolean', default: false }),
    );
    await f.event('session_start');
    await f.command('status');
    expect(f.appendEntry).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenLastCalledWith(expect.stringContaining('off'), 'info');
    await f.command(' on ');
    expect(f.appendEntry).toHaveBeenCalledWith('fast', { enabled: true });
    await f.command('on');
    expect(f.appendEntry).toHaveBeenCalledTimes(1);
    await f.command('status');
    expect(f.notify).toHaveBeenLastCalledWith(expect.stringContaining('on'), 'info');
    await f.command('off');
    await f.command('');
    await f.shortcut();
    expect(f.appendEntry.mock.calls.map(([, value]) => value)).toEqual([
      { enabled: true },
      { enabled: false },
      { enabled: true },
      { enabled: false },
    ]);
    await f.command('invalid');
    expect(f.appendEntry).toHaveBeenCalledTimes(4);
    expect(f.notify).toHaveBeenLastCalledWith('Usage: /fast [on|off|status]', 'warning');
  });

  it('restores last valid branch entry, while --fast overrides an off entry until the next restoration', async () => {
    const f = fixture(true);
    f.setBranch([
      { type: 'custom', customType: 'fast', data: { enabled: true } },
      { type: 'custom', customType: 'fast', data: { enabled: false } },
      { type: 'custom', customType: 'fast', data: { enabled: 'invalid' } },
    ]);
    await f.event('session_start');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<warning>fast n/a</warning>');
    expect(f.appendEntry).not.toHaveBeenCalled();
    await f.command('off');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<muted>fast off</muted>');
    await f.event('session_tree');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<warning>fast n/a</warning>');
  });

  it('uses branch state without --fast, ignores malformed entries, and follows a different branch', async () => {
    const f = fixture();
    f.setBranch([
      { type: 'custom', customType: 'fast', data: { enabled: true } },
      { type: 'custom', customType: 'other', data: { enabled: false } },
    ]);
    await f.event('session_start');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<warning>fast n/a</warning>');
    f.setBranch([{ type: 'custom', customType: 'fast', data: { enabled: null } }]);
    await f.event('session_tree');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<muted>fast off</muted>');
  });

  it('publishes state-aware status in the native footer and late snapshots, and disposes on shutdown', async () => {
    const f = fixture();
    await f.event('session_start');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<muted>fast off</muted>');
    await f.command('on');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<warning>fast n/a</warning>');
    f.setModel({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-sonnet-5' });
    await f.event('model_select');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<warning>fast n/a</warning>');
    const snapshot = vi.fn();
    f.pi.events.on(STATUS_SNAPSHOT_EVENT, snapshot);
    f.emit(STATUS_SNAPSHOT_REQUEST_EVENT, undefined);
    expect(snapshot).toHaveBeenCalledWith({
      source: 'fast-mode',
      statuses: [
        {
          source: 'fast-mode',
          key: 'fast',
          text: 'fast n/a',
          state: 'unsupported',
          prefix: undefined,
          color: { default: 'muted', byState: { on: 'accent', unsupported: 'warning' } },
        },
      ],
    });
    f.setModel({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5' });
    await f.event('model_select');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', '<warning>fast n/a</warning>');
    await f.event('session_shutdown');
    expect(f.setStatus).toHaveBeenLastCalledWith('fast', undefined);
    snapshot.mockClear();
    f.emit(STATUS_SNAPSHOT_REQUEST_EVENT, undefined);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('keeps all identity-free hooks untouched, even previously working-looking direct paths', async () => {
    const f = fixture();
    await f.event('session_start');
    await f.command('on');
    const headers: Record<string, string | null> = {};
    await f.event('before_provider_headers', { headers });
    expect(headers).toEqual({});
    f.setModel({ provider: 'openai', api: 'openai-codex-responses', id: 'gpt-5.4' });
    expect(
      await f.event('before_provider_request', { payload: { model: 'gpt-5.4' } }),
    ).toBeUndefined();
    f.setOAuth(true);
    expect(
      await f.event('before_provider_request', { payload: { model: 'gpt-5.4' } }),
    ).toBeUndefined();
    f.setModel({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5' });
    expect(
      await f.event('before_provider_request', { payload: { model: 'claude-opus-5' } }),
    ).toBeUndefined();
    expect(f.appendEntry).toHaveBeenCalledTimes(1);
  });
});
