import { getAgentDir, type ExtensionAPI, type ExtensionContext, type ReadonlyFooterDataProvider, type Theme, type ThemeColor } from '@earendil-works/pi-coding-agent';
import type { StatuslineStatus } from '@araketski/pi-statusline-protocol';
import { collectBuiltins, type GitData } from './src/builtins.js';
import { loadStatuslineConfig, type StatuslineConfig } from './src/config.js';
import { GitCache } from './src/git-cache.js';
import { createStatusRegistry, type StatusRegistry } from './src/registry.js';
import { renderLayoutLines, renderStatus, sanitizeFooterText, styleText } from './src/render.js';

function renderFooter(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  data: ReadonlyFooterDataProvider,
  theme: Theme,
  config: StatuslineConfig,
  statuses: ReadonlyMap<string, StatuslineStatus>,
  git: GitData,
  width: number,
): string[] {
  const keys = new Set(config.layout.flat().filter((token) => token !== 'spacer'));
  const builtin = collectBuiltins(ctx, pi, data, keys, git);
  const native = new Map(data.getExtensionStatuses());
  const all = new Map<string, StatuslineStatus>(builtin);
  for (const [key, text] of native) {
    if (keys.has(key) && !all.has(key)) all.set(key, { source: 'native', key, text });
  }
  for (const [key, value] of statuses) {
    if (keys.has(key) || keys.has('statuses')) all.set(key, value);
  }
  if (keys.has('statuses')) {
    const entries: string[] = [];
    for (const [key, value] of statuses) {
      if (value.text) entries.push(`${sanitizeFooterText(key)}: ${sanitizeFooterText(value.text)}`);
    }
    for (const [key, text] of native) {
      if (!statuses.has(key) && text) entries.push(`${sanitizeFooterText(key)}: ${sanitizeFooterText(text)}`);
    }
    if (entries.length) all.set('statuses', { source: 'statusline', key: 'statuses', text: entries.join(' • ') });
  }
  const palette = { fg: (role: string, text: string) => theme.fg(role as ThemeColor, text) };
  const separator = styleText(sanitizeFooterText(config.separator), config.separatorColor, palette);
  return renderLayoutLines(config.layout, (key) => {
    const item = all.get(key);
    return item && renderStatus(item, config.appearance[key], palette);
  }, separator, width);
}

export default function statusline(pi: ExtensionAPI): void {
  let active: { dispose(): void; requestRender?: () => void } | undefined;
  pi.on('session_start', (_event, ctx) => {
    active?.dispose();
    active = undefined;
    if (!ctx.hasUI || ctx.mode !== 'tui') return;

    const { config, diagnostics } = loadStatuslineConfig({
      agentDir: getAgentDir(), cwd: ctx.cwd, isProjectTrusted: () => ctx.isProjectTrusted(),
    });
    for (const warning of diagnostics) ctx.ui.notify(`statusline: ${warning}`, 'warning');
    let state!: { dispose(): void; requestRender?: () => void };
    const registry: StatusRegistry = createStatusRegistry(pi, () => state.requestRender?.());
    let disposed = false;
    state = {
      dispose() {
        if (disposed) return;
        disposed = true;
        registry.dispose();
        state.requestRender = undefined;
        if (active === state) active = undefined;
      },
    };
    active = state;
    ctx.ui.setFooter((tui, theme, data) => {
      if (disposed) return { render: () => [], invalidate() {}, dispose() {} };
      state.requestRender = () => tui.requestRender();
      const keys = new Set(config.layout.flat());
      const cache = ['branch', 'changes', 'pr'].some((key) => keys.has(key))
        ? new GitCache({ cwd: () => ctx.cwd, pr: keys.has('pr'), onChange: () => state.requestRender?.() })
        : undefined;
      const offBranch = data.onBranchChange(() => { cache?.invalidate(); state.requestRender?.(); });
      const disposeRegistry = state.dispose.bind(state);
      state.dispose = () => {
        if (disposed) return;
        offBranch();
        cache?.dispose();
        disposeRegistry();
      };
      return {
        render: (width: number) => renderFooter(ctx, pi, data, theme, config, registry.statuses, cache?.get() ?? {}, width),
        invalidate() { /* all data is derived at render time */ },
        dispose: () => state.dispose(),
      };
    });
    registry.requestSnapshot();
  });

  const rerender = (_event: unknown, ctx: ExtensionContext) => {
    if (ctx.mode === 'tui' && ctx.hasUI) active?.requestRender?.();
  };
  pi.on('model_select', rerender);
  pi.on('thinking_level_select', rerender);
  pi.on('turn_end', rerender);
  pi.on('message_end', rerender);
  pi.on('session_tree', rerender);
  pi.on('session_compact', rerender);
  pi.on('session_shutdown', (_event, ctx) => {
    active?.dispose();
    active = undefined;
    if (ctx.hasUI && ctx.mode === 'tui') ctx.ui.setFooter(undefined);
  });
}
