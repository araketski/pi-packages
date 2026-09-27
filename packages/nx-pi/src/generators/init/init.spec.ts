import { readJson, writeJson, type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { initGenerator } from './init';
import type { InitGeneratorSchema } from './schema';

const plugin = '@araketski/nx-pi';

function workspace(manifest: Record<string, unknown> = { name: '@acme/workspace' }): Tree {
  const tree = createTreeWithEmptyWorkspace();
  writeJson(tree, 'package.json', manifest);
  writeJson(tree, 'nx.json', { defaultBase: 'trunk' });
  tree.write('README.md', 'consumer content\n');
  tree.write('pnpm-lock.yaml', 'consumer lockfile\n');
  return tree;
}

function snapshot(tree: Tree) {
  return tree
    .listChanges()
    .map(({ path, type, content }) => ({
      path,
      type,
      content: content?.toString(),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// @mara checks REQ-NXPI-INIT
// @mara checks REQ-NXPI-METADATA-SOURCE
describe('init explicit metadata and registration', () => {
  it('registers only the plugin, preserving unrelated files and optional metadata absence', async () => {
    const manifest = {
      name: '@acme/workspace',
      private: true,
      packageManager: 'npm@11.13.0',
      scripts: { test: 'consumer-tests' },
      devDependencies: { nx: '23.2.1' },
      author: 'Consumer',
      custom: { retained: true },
    };
    const tree = workspace(manifest);
    const before = snapshot(tree);
    expect(await initGenerator(tree)).toBeUndefined(); // no installation callback
    expect(readJson(tree, 'nx.json')).toEqual({ defaultBase: 'trunk', plugins: [plugin] });
    expect(readJson(tree, 'package.json')).toEqual(manifest);
    expect(snapshot(tree).filter((file) => file.path !== 'nx.json')).toEqual(
      before.filter((file) => file.path !== 'nx.json'),
    );
  });

  it('fills all supplied missing fields and is byte-for-byte unchanged on rerun', async () => {
    const tree = workspace({ private: true });
    const options = {
      name: '@acme/workspace',
      license: 'MIT',
      repository: 'git+https://example.com/acme/repo.git',
      homepage: 'https://example.com/acme',
      bugs: 'https://example.com/acme/issues',
    };
    await initGenerator(tree, options);
    expect(readJson(tree, 'package.json')).toEqual({ private: true, ...options });
    expect(readJson(tree, 'nx.json').plugins).toEqual([plugin]);
    const after = snapshot(tree);
    expect(await initGenerator(tree, options)).toBeUndefined();
    expect(snapshot(tree)).toEqual(after);
  });

  it.each([
    plugin,
    {
      plugin,
      options: { consumerOption: 'kept' },
      include: ['packages/**'],
      exclude: ['private/**'],
      custom: true,
    },
  ])('preserves a compatible registration and root manifest exactly: %j', async (registration) => {
    const tree = workspace();
    tree.write('package.json', '{ "name": "@acme/workspace", "license": "MIT" }\n');
    tree.write(
      'nx.json',
      `// consumer comment\n${JSON.stringify({ plugins: ['other-plugin', registration], custom: 42 })}\n`,
    );
    const before = snapshot(tree);
    await initGenerator(tree, { name: '@acme/workspace', license: 'MIT' });
    expect(snapshot(tree)).toEqual(before);
  });

  it('still fills missing metadata when already registered', async () => {
    const tree = workspace();
    tree.write('nx.json', `{ "plugins": ["${plugin}"] }\n`);
    const nxBefore = tree.read('nx.json', 'utf-8');
    await initGenerator(tree, { license: 'UNLICENSED' });
    expect(readJson(tree, 'package.json').license).toBe('UNLICENSED');
    expect(tree.read('nx.json', 'utf-8')).toBe(nxBefore);
  });

  it('retains repository and bugs object metadata when the explicit URLs match', async () => {
    const tree = workspace({
      name: '@acme/workspace',
      repository: {
        type: 'git',
        url: 'ssh://git@example.com/acme/repo.git',
        directory: 'workspace',
      },
      bugs: { url: 'https://example.com/issues', email: 'bugs@example.com' },
    });
    const before = tree.read('package.json', 'utf-8');
    await initGenerator(tree, {
      repository: 'ssh://git@example.com/acme/repo.git',
      bugs: 'https://example.com/issues',
    });
    expect(tree.read('package.json', 'utf-8')).toBe(before);
  });

  it('leaves unsupplied optional metadata untouched for later publication validation', async () => {
    const tree = workspace({
      name: '@acme/workspace',
      license: null,
      repository: 'github:acme/repo',
    });
    const before = tree.read('package.json', 'utf-8');
    await initGenerator(tree);
    expect(tree.read('package.json', 'utf-8')).toBe(before);
  });

  it('appends after unrelated registrations without changing their options', async () => {
    const tree = workspace();
    const other = { plugin: 'other-plugin', options: { custom: ['preserved'] } };
    writeJson(tree, 'nx.json', { plugins: [other], targetDefaults: { build: { cache: false } } });
    await initGenerator(tree);
    expect(readJson(tree, 'nx.json')).toEqual({
      plugins: [other, plugin],
      targetDefaults: { build: { cache: false } },
    });
  });
});

// @mara checks REQ-NXPI-INIT
// @mara checks REQ-NXPI-METADATA-SOURCE
describe('init errors leave all authored state unchanged', () => {
  it.each([
    undefined,
    'workspace',
    '@acme',
    '@/workspace',
    '@acme/has space',
    '@Acme/Workspace',
    '',
    null,
  ])('rejects missing or invalid root name %j without renaming or prompting', async (name) => {
    const tree = workspace(name === undefined ? {} : { name });
    const before = snapshot(tree);
    await expect(initGenerator(tree, { license: 'MIT' })).rejects.toThrow(
      /package\.json.*name.*scoped/i,
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['name', 'license', 'repository', 'homepage', 'bugs'] as const)(
    'rejects a conflicting %s option without applying other pending additions',
    async (field) => {
      const original: Record<string, unknown> = {
        name: '@acme/workspace',
        [field]: field === 'name' ? '@acme/workspace' : 'existing',
      };
      const tree = workspace(original);
      const before = snapshot(tree);
      const value =
        field === 'name'
          ? '@other/workspace'
          : field === 'license'
            ? 'MIT'
            : 'https://example.com/new';
      await expect(
        initGenerator(tree, { name: '@acme/workspace', license: 'MIT', [field]: value }),
      ).rejects.toThrow(new RegExp(`package\\.json.*${field}.*conflict`, 'i'));
      expect(snapshot(tree)).toEqual(before);
    },
  );

  it.each([
    { name: 'unscoped' },
    { name: '@acme/has space' },
    { name: '@acme/workspace ' },
    { license: '' },
    { license: ' MIT' },
    { homepage: 'relative/path' },
    { homepage: 'javascript:alert(1)' },
    { bugs: 'mailto:bugs@example.com' },
    { repository: 'github:acme/repo' },
    { repository: 'https://' },
    { license: 42 },
    { name: null },
    { unknown: 'not supported' },
  ])('rejects invalid explicit inputs: %j', async (options) => {
    const tree = workspace({});
    const before = snapshot(tree);
    await expect(initGenerator(tree, options as unknown as InitGeneratorSchema)).rejects.toThrow(
      /init:/,
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it('does not treat an existing null as a missing value to replace', async () => {
    const tree = workspace({ name: '@acme/workspace', license: null });
    const before = snapshot(tree);
    await expect(initGenerator(tree, { license: 'MIT' })).rejects.toThrow(/license.*conflict/);
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['package.json', 'nx.json'])('requires existing %s', async (file) => {
    const tree = workspace();
    tree.delete(file);
    const before = snapshot(tree);
    await expect(initGenerator(tree, { name: '@acme/workspace' })).rejects.toThrow(file);
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['package.json', 'nx.json'])('rejects malformed or non-object %s', async (file) => {
    for (const value of ['{ invalid JSON', '[]', 'null', '42']) {
      const tree = workspace();
      tree.write(file, value);
      const before = snapshot(tree);
      await expect(initGenerator(tree)).rejects.toThrow(file);
      expect(snapshot(tree)).toEqual(before);
    }
  });

  it.each([
    { plugins: null },
    { plugins: {} },
    { plugins: [42] },
    { plugins: [{ plugin: '' }] },
    { plugins: [plugin, plugin] },
    { plugins: [plugin, { plugin }] },
    { plugins: [{ plugin, options: false }] },
    { plugins: [{ plugin, options: [] }] },
    { plugins: [{ plugin, options: null }] },
  ])('rejects malformed/duplicate registrations before writing metadata: %j', async (nx) => {
    const tree = workspace({});
    writeJson(tree, 'nx.json', nx);
    const before = snapshot(tree);
    await expect(initGenerator(tree, { name: '@acme/workspace' })).rejects.toThrow(
      /nx\.json.*plugins/i,
    );
    expect(snapshot(tree)).toEqual(before);
  });
});
