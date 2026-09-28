import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import fastMode from '../extensions/fast-mode/index.ts';

type EventHandler = (event: any, ctx: ExtensionContext) => any;
type SessionEntry = { type: string; customType?: string; data?: unknown };

function fixture(flag = false) {
  const handlers = new Map<string, EventHandler>();
  const commands = new Map<string, (args: string, ctx: ExtensionCommandContext) => Promise<void>>();
  const shortcuts = new Map<string, (ctx: ExtensionContext) => Promise<void> | void>();
  let branch: SessionEntry[] = [];
  let selected: { provider: string; api: string; id: string } | undefined = {
    provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5',
  };
  let oauth = false;
  const notify = vi.fn();
  const setStatus = vi.fn();
  const appendEntry = vi.fn((customType: string, data: unknown) => branch.push({ type: 'custom', customType, data }));
  const registerFlag = vi.fn();
  const sessionManager = { getBranch: () => branch };
  const ctx = {
    sessionManager,
    get model() { return selected; },
    modelRegistry: { isUsingOAuth: () => oauth },
    hasUI: true,
    ui: { notify, setStatus, theme: { fg: (color: string, value: string) => `<${color}>${value}</${color}>` } },
  } as unknown as ExtensionCommandContext;
  const pi = {
    on: (name: string, handler: EventHandler) => { handlers.set(name, handler); return () => handlers.delete(name); },
    registerCommand: (name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) => commands.set(name, options.handler),
    registerShortcut: (key: string, options: { handler: (ctx: ExtensionContext) => Promise<void> | void }) => shortcuts.set(key, options.handler),
    registerFlag,
    getFlag: () => flag,
    appendEntry,
    events: {
      on: vi.fn(() => () => undefined),
      emit: vi.fn(),
    },
  } as unknown as ExtensionAPI;
  fastMode(pi);
  async function event(name: string, detail: object = {}) {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`Missing ${name} handler`);
    return handler({ type: name, ...detail }, ctx);
  }
  return {
    ctx, pi, handlers, commands, shortcuts, event, notify, setStatus, appendEntry, registerFlag,
    setBranch: (value: SessionEntry[]) => { branch = value; },
    setModel: (model: typeof selected) => { selected = model; },
    setOAuth: (value: boolean) => { oauth = value; },
    command: async (args = '') => { const handler = commands.get('fast'); if (!handler) throw new Error('Missing /fast'); await handler(args, ctx); },
    shortcut: async () => { const handler = shortcuts.get('f3'); if (!handler) throw new Error('Missing F3'); await handler(ctx); },
  };
}

describe('fast mode Pi extension', () => {
  it('registers flag and controls, toggles with /fast and F3, and keeps explicit commands idempotent', async () => {
    const f = fixture();
    expect(f.registerFlag).toHaveBeenCalledWith('fast', expect.objectContaining({ type: 'boolean', default: false }));
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
      { enabled: true }, { enabled: false }, { enabled: true }, { enabled: false },
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
    expect(await f.event('before_provider_request', { payload: { model: 'claude-opus-5' } })).toEqual({ model: 'claude-opus-5', speed: 'fast' });
    expect(f.appendEntry).not.toHaveBeenCalled();
    await f.command('off');
    expect(await f.event('before_provider_request', { payload: { model: 'claude-opus-5' } })).toBeUndefined();
    await f.event('session_tree');
    expect(await f.event('before_provider_request', { payload: { model: 'claude-opus-5' } })).toEqual({ model: 'claude-opus-5', speed: 'fast' });
  });

  it('uses branch state without --fast, ignores malformed entries, and follows a different branch', async () => {
    const f = fixture();
    f.setBranch([{ type: 'custom', customType: 'fast', data: { enabled: true } }, { type: 'custom', customType: 'other', data: { enabled: false } }]);
    await f.event('session_start');
    expect(await f.event('before_provider_request', { payload: { model: 'claude-opus-5' } })).toEqual({ model: 'claude-opus-5', speed: 'fast' });
    f.setBranch([{ type: 'custom', customType: 'fast', data: { enabled: null } }]);
    await f.event('session_tree');
    expect(await f.event('before_provider_request', { payload: { model: 'claude-opus-5' } })).toBeUndefined();
  });

  it('only changes outgoing requests for an eligible current model; model switches preserve enabled state', async () => {
    const f = fixture();
    await f.event('session_start');
    await f.command('on');
    const headers: Record<string, string | null> = {};
    await f.event('before_provider_headers', { headers });
    expect(headers).toEqual({ 'anthropic-beta': 'fast-mode-2026-02-01' });
    f.setModel({ provider: 'openai', api: 'openai-codex-responses', id: 'gpt-5.4' });
    expect(await f.event('before_provider_request', { payload: { model: 'gpt-5.4' } })).toBeUndefined();
    f.setOAuth(true);
    expect(await f.event('before_provider_request', { payload: { model: 'gpt-5.4' } })).toEqual({ model: 'gpt-5.4', service_tier: 'priority' });
    f.setModel({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5' });
    expect(await f.event('before_provider_request', { payload: { model: 'claude-opus-5' } })).toEqual({ model: 'claude-opus-5', speed: 'fast' });
    expect(f.appendEntry).toHaveBeenCalledTimes(1);
  });
});
