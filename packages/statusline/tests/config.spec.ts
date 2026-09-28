import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadStatuslineConfig, mergeAppearance } from '../extensions/statusline/src/config.js';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'statusline-config-'));
  roots.push(root);
  const agentDir = join(root, 'agent');
  const cwd = join(root, 'project');
  mkdirSync(agentDir);
  mkdirSync(join(cwd, '.pi'), { recursive: true });
  const userFile = join(agentDir, 'statusline.json');
  const projectFile = join(cwd, '.pi', 'statusline.json');
  const load = (trusted = false) => loadStatuslineConfig({ agentDir, cwd, isProjectTrusted: () => trusted });
  return { agentDir, cwd, userFile, projectFile, load };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('statusline JSON configuration', () => {
  it('uses in-memory defaults without writing any missing config files', () => {
    const f = fixture();
    const result = f.load();
    expect(result.diagnostics).toEqual([]);
    expect(result.config.layout).toEqual([
      ['branch', 'changes', 'pr', 'spacer', 'project'],
      ['context', 'cache', 'cost', 'spacer', 'model', 'thinking', 'caffeinate'],
      ['title'], ['cwd'],
    ]);
    expect(result.config.separator).toBe(' • ');
    expect(existsSync(f.userFile)).toBe(false);
    expect(existsSync(f.projectFile)).toBe(false);
  });

  it('ignores an untrusted project and merges trusted appearance by state', () => {
    const f = fixture();
    writeFileSync(f.userFile, JSON.stringify({ separator: '|', appearance: {
      demo: { prefix: 'u', color: { default: 'muted', byState: { active: 'success', waiting: 'warning' } } },
    } }));
    writeFileSync(f.projectFile, JSON.stringify({ separator: '/', appearance: {
      demo: { color: { byState: { active: 0 } } },
    } }));
    expect(f.load().config.separator).toBe('|');
    const trusted = f.load(true).config;
    expect(trusted.separator).toBe('/');
    expect(mergeAppearance({ prefix: 'P', color: 'dim' }, trusted.appearance.demo)).toEqual({
      prefix: 'u', color: { default: 'muted', byState: { active: 0, waiting: 'warning' } },
    });
    expect(mergeAppearance({ color: 'muted' }, { color: { byState: { active: '#aabbcc' } } })).toEqual({
      color: { default: 'muted', byState: { active: '#aabbcc' } },
    });
    expect(mergeAppearance({ color: { byState: { active: 'success' } } }, { color: '' })).toEqual({ color: '' });
    expect(mergeAppearance({ prefix: 'P', color: 'accent' }, { prefix: '', color: 0 })).toEqual({ prefix: '', color: 0 });
  });

  it('warns and falls back locally for malformed JSON, values and unknown fields', () => {
    const f = fixture();
    writeFileSync(f.userFile, JSON.stringify({ separator: '|', appearance: { demo: { color: {
      byState: { active: 'success', waiting: 'bad-theme', done: 300 },
    } } } }));
    writeFileSync(f.projectFile, '{no');
    const badProject = f.load(true);
    expect(badProject.config.separator).toBe('|');
    expect(badProject.diagnostics.some((x) => x.includes('project'))).toBe(true);
    expect(badProject.config.appearance.demo?.color).toEqual({ byState: { active: 'success' } });
    writeFileSync(f.projectFile, JSON.stringify({ separator: 22, separatorColor: '#abcd',
      layout: [1], unexpected: true, appearance: { demo: { prefix: 'ok', color: '#aabbcc' },
        another: { prefix: 42 }, future: { color: 255 } },
    }));
    const result = f.load(true);
    expect(result.config.separator).toBe('|');
    expect(result.config.separatorColor).toBe('dim');
    expect(result.config.layout[0]).toEqual(['branch', 'changes', 'pr', 'spacer', 'project']);
    expect(result.config.appearance.demo).toEqual({ prefix: 'ok', color: '#aabbcc' });
    expect(result.config.appearance.another).toBeUndefined();
    expect(result.config.appearance.future).toEqual({ color: 255 });
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(5);
    expect(readFileSync(f.userFile, 'utf8')).toContain('bad-theme');
  });

  it('rereads changed config on another load and accepts arbitrary future status keys', () => {
    const f = fixture();
    writeFileSync(f.userFile, JSON.stringify({ layout: ['not-yet-loaded'], appearance: { 'not-yet-loaded': { prefix: '◎' } } }));
    expect(f.load().config.layout).toEqual([['not-yet-loaded']]);
    writeFileSync(f.userFile, JSON.stringify({ layout: [['cwd'], ['spacer', 'cost']] }));
    expect(f.load().config.layout).toEqual([['cwd'], ['spacer', 'cost']]);
  });
});
