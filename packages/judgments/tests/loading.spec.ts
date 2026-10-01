import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCatalog, loadSelection, type Scope } from '../extensions/judgments/loading.ts';

const definition = {
  formatVersion: 1,
  mode: 'fixed',
  purpose: 'Fixture',
  useWhen: ['Decision'],
  avoidWhen: [],
  inputSchema: { type: 'object' },
  questions: {
    x: { type: 'bool', instructions: 'Assess', criteria: { true: 'Yes', false: 'No' } },
  },
  interpretation: 'Advisory',
};
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'judgments-loading-'));
  dirs.push(root);
  const scopes: Scope[] = ['bundled', 'global', 'project'].map((scope) => ({
    scope: scope as Scope['scope'],
    path: join(root, scope),
  }));
  const save = (index: number, name: string, content: unknown) => {
    mkdirSync(join(scopes[index].path, 'scenarios'), { recursive: true });
    writeFileSync(
      join(scopes[index].path, 'scenarios', name),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  };
  const config = (index: number, value: unknown) => {
    mkdirSync(scopes[index].path, { recursive: true });
    writeFileSync(
      join(scopes[index].path, 'config.json'),
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  };
  return { scopes, save, config };
}

// @mara checks REQ-JUDGMENTS-DECLARATIVE
// @mara implements VER-JUDGMENTS-DECLARATIVE
describe('scoped loading', () => {
  it('resolves project over global over bundled and refreshes on explicit calls', async () => {
    const { scopes, save } = fixture();
    for (let i = 0; i < 3; i++) save(i, 'same.json', { ...definition, purpose: scopes[i].scope });
    let catalog = await loadCatalog(scopes);
    expect(catalog.entries.get('same')?.definition?.purpose).toBe('project');
    expect(catalog.entries.get('same')?.source.scope).toBe('project');
    save(2, 'same.json', { ...definition, purpose: 'Changed' });
    catalog = await loadCatalog(scopes);
    expect(catalog.entries.get('same')?.definition?.purpose).toBe('Changed');
    expect((await loadCatalog(scopes.slice(0, 2))).entries.get('same')?.definition?.purpose).toBe(
      'global',
    );
  });
  it('blocks invalid higher overrides while unrelated scenarios remain usable', async () => {
    const { scopes, save } = fixture();
    save(0, 'same.json', definition);
    save(2, 'same.json', '{private-invalid-json');
    save(2, 'other.json', definition);
    const catalog = await loadCatalog(scopes);
    expect(catalog.entries.get('same')?.definition).toBeUndefined();
    expect(catalog.entries.get('other')?.definition).toBeDefined();
    expect(catalog.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'same', code: 'invalid_definition', scope: 'project' }),
      ]),
    );
    expect(JSON.stringify(catalog.diagnostics)).not.toContain('private-invalid-json');
  });
  it('reports same-scope duplicate stems instead of choosing an arbitrary winner', async () => {
    const { scopes, save } = fixture();
    save(0, 'same.json', definition);
    save(1, 'same.json', definition);
    save(1, 'same.JSON', definition);
    const catalog = await loadCatalog(scopes);
    expect(catalog.entries.get('same')?.definition).toBeUndefined();
    expect(catalog.diagnostics.some((d) => d.code === 'duplicate_id')).toBe(true);
  });
  it('ignores non-JSON definitions and does not discover configuration as a scenario', async () => {
    const { scopes, save, config } = fixture();
    save(1, 'unsupported.yaml', 'not JSON');
    config(1, { provider: 'p', model: 'm' });
    expect((await loadCatalog(scopes)).entries.size).toBe(0);
    expect(readdirSync(scopes[1].path)).toEqual(['config.json', 'scenarios']);
  });
  it('does not create missing directories or configuration', async () => {
    const { scopes } = fixture();
    expect((await loadCatalog(scopes)).entries.size).toBe(0);
    expect(await loadSelection(scopes, {})).toEqual({
      provider: 'openrouter',
      model: '~typesafe/jev-latest',
    });
    expect(readdirSync(join(scopes[0].path, '..'))).toEqual([]);
  });
  it('reports an unreadable scope without allowing lower-scope fallback', async () => {
    const { scopes, save } = fixture();
    save(0, 'same.json', definition);
    mkdirSync(scopes[2].path, { recursive: true });
    writeFileSync(join(scopes[2].path, 'scenarios'), 'not a directory');
    const catalog = await loadCatalog(scopes);
    expect(catalog.entries.get('same')?.definition).toBeUndefined();
    expect(catalog.diagnostics.some((d) => d.code === 'scope_unreadable')).toBe(true);
  });
});

describe('scoped classifier selection', () => {
  it('keeps provider-specific model pairs intact and honors explicit flags', async () => {
    const { scopes, config } = fixture();
    config(1, { provider: 'typesafe', model: 'jev-latest' });
    config(2, { provider: 'openrouter', model: '~typesafe/jev-latest' });
    expect(await loadSelection(scopes, {})).toEqual({
      provider: 'openrouter',
      model: '~typesafe/jev-latest',
    });
    expect(await loadSelection(scopes.slice(0, 2), {})).toEqual({
      provider: 'typesafe',
      model: 'jev-latest',
    });
    expect(await loadSelection(scopes, { model: 'other-model' })).toEqual({
      provider: 'openrouter',
      model: 'other-model',
    });
    expect(await loadSelection(scopes, { provider: 'local', model: 'small' })).toEqual({
      provider: 'local',
      model: 'small',
    });
    await expect(loadSelection(scopes, { provider: 'local' })).rejects.toThrow(/explicit model/);
  });
  it.each([
    { provider: 'p' },
    { model: 'm' },
    { provider: ' ', model: 'm' },
    { provider: 'p', model: 1 },
    { provider: 'p', model: 'm', router: true },
    '{private-invalid-config',
  ])('fails explicitly on invalid config without falling back', async (value) => {
    const { scopes, config } = fixture();
    config(1, { provider: 'p', model: 'm' });
    config(2, value);
    await expect(loadSelection(scopes, {})).rejects.toThrow(/configuration/);
  });
  it('rejects invalid global config too, including with explicit flags', async () => {
    const { scopes, config } = fixture();
    config(1, {});
    config(2, { provider: 'p', model: 'm' });
    await expect(loadSelection(scopes, { provider: 'local', model: 'small' })).rejects.toThrow(
      /configuration/,
    );
  });
});
