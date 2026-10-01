import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import statusline from '../extensions/statusline/index.js';

// @mara checks DES-STATUSLINE-BUILTIN-VALUES
it('refreshes observed models across footer selection, tree, compaction and session lifecycle', () => {
  const root = mkdtempSync(join(tmpdir(), 'statusline-model-footer-'));
  const old = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  try {
    mkdirSync(join(root, 'workspace'));
    writeFileSync(join(root, 'statusline.json'), JSON.stringify({ layout: [['model']] }));
    const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
    const pi = {
      on: (name: string, fn: (event: unknown, ctx: unknown) => void) => handlers.set(name, fn),
      events: { on: () => () => {}, emit: () => {} },
    };
    const manager = SessionManager.inMemory(root);
    const selection = manager.appendModelChange('router', 'auto');
    manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    const response = manager.appendMessage({
      role: 'assistant',
      content: [],
      api: 'openai-responses',
      provider: 'host',
      model: 'physical',
      stopReason: 'stop',
      timestamp: 1,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    const ui = { setFooter: vi.fn(), notify: vi.fn() };
    const ctx = {
      mode: 'tui',
      hasUI: true,
      cwd: join(root, 'workspace'),
      ui,
      isProjectTrusted: () => false,
      model: { provider: 'router', id: 'auto' },
      sessionManager: manager,
    };
    const tui = { requestRender: vi.fn() };
    const theme = { fg: (_color: string, text: string) => text };
    const data = { getExtensionStatuses: () => new Map(), onBranchChange: () => () => {} };
    const event = (name: string) => handlers.get(name)?.({}, ctx);
    const mount = () => ui.setFooter.mock.lastCall?.[0](tui, theme, data);
    statusline(pi as never);
    event('session_start');
    const footer = mount();
    expect(footer.render(100)).toEqual(['◉ auto → physical']);
    manager.branch(selection);
    tui.requestRender.mockClear();
    event('session_tree');
    expect(tui.requestRender).toHaveBeenCalledOnce();
    expect(footer.render(100)).toEqual(['◉ auto']);
    manager.branch(response);
    event('session_tree');
    expect(footer.render(100)).toEqual(['◉ auto → physical']);
    manager.appendCompaction('summary', null, 100);
    event('session_compact');
    expect(footer.render(100)).toEqual(['◉ auto']);
    manager.branch(response);
    event('session_start'); // Reload/resume/fork reconstruct from the replacement context.
    const restored = mount();
    expect(restored.render(100)).toEqual(['◉ auto → physical']);
    manager.appendModelChange('router', 'other');
    ctx.model = { provider: 'router', id: 'other' };
    event('model_select');
    expect(restored.render(100)).toEqual(['◉ other']);
    ctx.sessionManager = SessionManager.inMemory(root);
    event('session_start');
    const fresh = mount();
    expect(fresh.render(100)).toEqual(['◉ other']);
    // Disposing the already replaced footer must not detach the fresh one.
    restored.dispose();
    tui.requestRender.mockClear();
    event('message_end');
    expect(tui.requestRender).toHaveBeenCalledOnce();
    event('session_shutdown');
    expect(ui.setFooter).toHaveBeenLastCalledWith(undefined);
  } finally {
    if (old === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = old;
    rmSync(root, { recursive: true, force: true });
  }
});
