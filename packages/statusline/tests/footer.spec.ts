import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerStatus, type StatuslineHost } from '@araketski/pi-statusline-protocol';
import statusline from '../extensions/statusline/index.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'statusline-footer-'));
  dirs.push(root);
  const agentDir = join(root, 'agent');
  mkdirSync(agentDir);
  const statuses = new Map<string, string>();
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const events: StatuslineHost['events'] = {
    on(name, handler) { const set = handlers.get(name) ?? new Set(); set.add(handler); handlers.set(name, set); return () => set.delete(handler); },
    emit(name, value) { for (const handler of handlers.get(name) ?? []) handler(value); },
  };
  const theme = { fg: (color: string, text: string) => `[${color}]${text}` };
  const ui = {
    theme,
    setStatus(key: string, text: string | undefined) { if (text === undefined) statuses.delete(key); else statuses.set(key, text); },
    notify: vi.fn(),
    setFooter: vi.fn(),
  };
  const callbacks = new Map<string, (_event: unknown, ctx: unknown) => void>();
  const pi = { events, on: (name: string, callback: (_event: unknown, ctx: unknown) => void) => { callbacks.set(name, callback); },
    getThinkingLevel: () => 'off' };
  const ctx = { mode: 'tui', hasUI: true, ui, cwd: root, isProjectTrusted: () => false,
    model: undefined, sessionManager: { getSessionName: () => undefined, getBranch: () => [] }, getContextUsage: () => undefined };
  const branchChange = vi.fn();
  const footerData = { getGitBranch: () => undefined, getExtensionStatuses: () => new Map(statuses),
    onBranchChange: () => branchChange };
  const tui = { requestRender: vi.fn() };
  const config = (layout: string[][], appearance: unknown = {}) => writeFileSync(join(agentDir, 'statusline.json'), JSON.stringify({ layout, appearance }));
  const listenerCount = () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
  return { root, agentDir, ui, pi, ctx, statuses, theme, callbacks, footerData, tui, config, branchChange, listenerCount };
}

describe('Pi footer lifecycle', () => {
  it('subscribes before snapshots, prefers structured data and reloads overrides', () => {
    const f = fixture();
    f.config([['alpha', 'statuses']], { alpha: { prefix: '@', color: { byState: { running: 'warning' } } } });
    const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = f.agentDir;
    try {
    const producer = registerStatus({ events: f.pi.events }, f.ui, { source: 'producer', key: 'alpha', prefix: '●', color: 'muted' });
    producer.update({ text: 'active', state: 'running' });
    f.ui.setStatus('beta', 'native');
    statusline(f.pi as never);
    f.callbacks.get('session_start')?.({}, f.ctx);
    expect(f.ui.setFooter).toHaveBeenCalledOnce();
    const factory = f.ui.setFooter.mock.lastCall?.[0];
    const component = factory(f.tui, f.theme, f.footerData);
    const line = component.render(100).join(' ');
    expect(line).toContain('[warning]@ active');
    expect(line).toContain('alpha: active • beta: native');
    expect(line).not.toContain('● active');
    producer.update({ text: 'busy', state: 'running' });
    expect(f.tui.requestRender).toHaveBeenCalled();
    expect(component.render(100).join(' ')).toContain('alpha: busy');
    f.config([['alpha']], { alpha: { prefix: 'new' } });
    f.callbacks.get('session_start')?.({}, f.ctx);
    const reloaded = f.ui.setFooter.mock.lastCall?.[0](f.tui, f.theme, f.footerData);
    expect(reloaded.render(80).join(' ')).toContain('new busy');
    producer.dispose();
    expect(reloaded.render(80)).toEqual([]);
    f.callbacks.get('session_shutdown')?.({}, f.ctx);
    expect(f.ui.setFooter).toHaveBeenLastCalledWith(undefined);
    } finally {
      if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
    }
  });

  it('unsubscribes even if the UI never instantiates its footer factory', () => {
    const f = fixture();
    statusline(f.pi as never);
    f.callbacks.get('session_start')?.({}, f.ctx);
    expect(f.listenerCount()).toBe(3);
    f.callbacks.get('session_shutdown')?.({}, f.ctx);
    expect(f.listenerCount()).toBe(0);
  });

  it('does not install a footer in non-TUI modes', () => {
    const f = fixture();
    statusline(f.pi as never);
    f.callbacks.get('session_start')?.({}, { ...f.ctx, mode: 'rpc' });
    expect(f.ui.setFooter).not.toHaveBeenCalled();
  });
});
