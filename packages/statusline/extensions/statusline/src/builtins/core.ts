import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { StatuslineStatus } from '@araketski/pi-statusline-protocol';
import { addStatus, compact } from './shared.js';

function projectName(cwd: string): string {
  const path = join(cwd, 'package.json');
  if (existsSync(path)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (parsed && typeof parsed === 'object' && 'name' in parsed &&
        typeof parsed.name === 'string' && parsed.name) return parsed.name;
    } catch { /* unreadable project metadata falls back to directory name */ }
  }
  return basename(cwd);
}

export function collectCore(items: Map<string, StatuslineStatus>, keys: Set<string>, ctx: ExtensionContext, pi: ExtensionAPI): void {
  if (keys.has('cwd')) {
    const home = homedir();
    const value = ctx.cwd === home ? '~' : ctx.cwd.startsWith(home + sep)
      ? `~/${relative(home, ctx.cwd).split(sep).join('/')}` : basename(ctx.cwd);
    addStatus(items, keys, 'cwd', value);
  }
  if (keys.has('project')) addStatus(items, keys, 'project', projectName(ctx.cwd));
  if (keys.has('title')) addStatus(items, keys, 'title', ctx.sessionManager.getSessionName());
  if (keys.has('model')) addStatus(items, keys, 'model', ctx.model?.id ?? 'unknown');
  if (keys.has('thinking')) {
    const level = pi.getThinkingLevel();
    addStatus(items, keys, 'thinking', level, level);
  }
  if (keys.has('context')) {
    const usage = ctx.getContextUsage();
    if (usage && usage.tokens !== null && usage.percent !== null) {
      const percent = usage.percent;
      const text = `${percent.toFixed(1).replace(/\.0$/, '')}%/${compact(usage.contextWindow, true)}`;
      const state = percent >= 90 ? 'full' : percent >= 70 ? 'warning' : 'normal';
      addStatus(items, keys, 'context', text, state);
    }
  }
}
