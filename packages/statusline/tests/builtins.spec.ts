import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectBuiltins } from '../extensions/statusline/src/builtins.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(keys: string[], options: { cwd?: string; percent?: number | null; branch?: string; name?: string } = {}) {
  const cwd = options.cwd ?? mkdtempSync(join(tmpdir(), 'statusline-builtins-'));
  if (!options.cwd) dirs.push(cwd);
  const ctx = {
    cwd, model: { id: 'model-id' },
    getContextUsage: () => options.percent === undefined ? undefined : { tokens: 100, percent: options.percent, contextWindow: 128000 },
    sessionManager: {
      getSessionName: () => options.name,
      getBranch: () => [{ type: 'message', message: { role: 'assistant', usage: {
        input: 1234, output: 56, cacheRead: 90, cacheWrite: 10, cost: { total: 0.253 },
      } } }],
    },
  } as never;
  const pi = { getThinkingLevel: () => 'high' } as never;
  const footerData = { getGitBranch: () => options.branch } as never;
  return collectBuiltins(ctx, pi, footerData, new Set(keys), {});
}

describe('modular built-in statuses', () => {
  it('collects requested core values in the shared structured shape', () => {
    const dir = mkdtempSync(join(tmpdir(), 'statusline-builtins-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@scope/project' }));
    const items = fixture(['project', 'title', 'model', 'thinking', 'context'], { cwd: dir, name: 'session', percent: 70 });
    expect(items.get('project')).toMatchObject({ source: 'statusline', key: 'project', text: '@scope/project', prefix: '◯' });
    expect(items.get('title')?.text).toBe('session');
    expect(items.get('model')?.text).toBe('model-id');
    expect(items.get('thinking')).toMatchObject({ text: 'high', state: 'high', prefix: '◐', color: { byState: expect.objectContaining({ high: 'thinkingHigh' }) } });
    expect(items.get('context')).toMatchObject({ text: '70%/128k', state: 'warning' });
    expect(items.has('cost')).toBe(false);
    expect(fixture(['title', 'context'], { percent: null }).size).toBe(0);
  });

  it('formats branch-scoped usage and only nonzero git/PR data', () => {
    const ctx = { cwd: '/tmp/demo', model: undefined, getContextUsage: () => ({ tokens: 4, percent: 90, contextWindow: 200000 }),
      sessionManager: { getSessionName: () => undefined, getBranch: () => [
        { type: 'message', message: { role: 'assistant', usage: { input: 1250, output: 42, cacheRead: 9, cacheWrite: 1, cost: { total: 2.345 } } } },
        { type: 'message', message: { role: 'user' } },
      ] },
    } as never;
    const items = collectBuiltins(ctx, { getThinkingLevel: () => 'off' } as never,
      { getGitBranch: () => 'topic' } as never,
      new Set(['branch', 'changes', 'pr', 'context', 'tokens', 'cache', 'cost', 'model']),
      { git: { branch: 'topic', conflict: 1, staged: 2, unstaged: 0, untracked: 3, ahead: 1, behind: 0 }, pr: 18 });
    expect(items.get('branch')).toMatchObject({ text: 'topic', state: 'dirty' });
    expect(items.get('changes')?.text).toBe('!1 +2 ?3 ↑1');
    expect(items.get('pr')?.text).toBe('PR #18');
    expect(items.get('context')).toMatchObject({ text: '90%/200k', state: 'full' });
    expect(items.get('tokens')?.text).toBe('1.3k↑ 42↓');
    expect(items.get('cache')?.text).toBe('9/1 90%');
    expect(items.get('cost')?.text).toBe('$2.35');
    expect(items.get('model')?.text).toBe('unknown');
  });

  it('omits unavailable git, PR and context items without blocking other tokens', () => {
    const items = fixture(['branch', 'changes', 'pr', 'context', 'model']);
    expect([...items.keys()]).toEqual(['model']);
    expect(items.get('model')?.text).toBe('model-id');
  });
});
