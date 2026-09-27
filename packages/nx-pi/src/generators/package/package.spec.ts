import { readJson, writeJson, type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { packageGenerator } from './package';

function workspace(
  manifest: Record<string, unknown> = { name: '@acme/workspace', license: 'MIT' },
): Tree {
  const tree = createTreeWithEmptyWorkspace();
  writeJson(tree, 'package.json', { private: true, ...manifest });
  writeJson(tree, 'nx.json', { plugins: ['@araketski/nx-pi'] });
  tree.write('README.md', 'consumer content\n');
  tree.write('pnpm-lock.yaml', 'consumer lock\n');
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

const options = { name: 'example', packageVersion: '1.2.3' };

// @mara checks REQ-NXPI-IDENTITY
// @mara checks REQ-NXPI-METADATA-SOURCE
// @mara checks REQ-NXPI-PRESERVE
// @mara checks DES-NXPI-GENERATOR-INTERFACE
// @mara checks DES-NXPI-PACKAGE-CONTRACT
describe('package generator', () => {
  it('creates only a discoverable Pi manifest from consumer metadata without installing or configuring tools', async () => {
    const tree = workspace({
      name: '@acme/workspace',
      license: 'Apache-2.0',
      repository: { type: 'git', url: 'https://example.com/acme/repo.git', directory: 'workspace' },
      homepage: 'https://example.com',
      bugs: { url: 'https://example.com/issues' },
      devDependencies: { nx: '23.2.1' },
    });
    const before = snapshot(tree);
    expect(await packageGenerator(tree, options)).toBeUndefined();
    expect(readJson(tree, 'packages/example/package.json')).toEqual({
      name: '@acme/pi-example',
      version: '1.2.3',
      license: 'Apache-2.0',
      repository: { type: 'git', url: 'https://example.com/acme/repo.git', directory: 'workspace' },
      homepage: 'https://example.com',
      bugs: { url: 'https://example.com/issues' },
      pi: {},
    });
    expect(snapshot(tree).filter(({ path }) => !before.some((item) => item.path === path))).toEqual(
      [
        {
          path: 'packages/example/package.json',
          type: 'CREATE',
          content: tree.read('packages/example/package.json')?.toString(),
        },
      ],
    );
    expect(snapshot(tree).filter(({ path }) => before.some((item) => item.path === path))).toEqual(
      before,
    );
  });

  it('omits absent optional metadata, including repository and gallery fields', async () => {
    const tree = workspace();
    await packageGenerator(tree, options);
    expect(readJson(tree, 'packages/example/package.json')).toEqual({
      name: '@acme/pi-example',
      version: '1.2.3',
      license: 'MIT',
      pi: {},
    });
  });

  it.each(['example', 'fast-mode', 'a1-b2'])(
    'derives the npm name and destination for %s',
    async (name) => {
      const tree = workspace();
      await packageGenerator(tree, { name, packageVersion: '2.0.0-beta.1' });
      expect(readJson(tree, `packages/${name}/package.json`).name).toBe(`@acme/pi-${name}`);
    },
  );

  it.each([
    '',
    'pi-example',
    '@acme/example',
    'Example',
    'bad name',
    '../escape',
    'a/b',
    'a\\b',
    'bad--name',
  ])('rejects invalid name %j before writing', async (name) => {
    const tree = workspace();
    const before = snapshot(tree);
    await expect(packageGenerator(tree, { name, packageVersion: '1.0.0' })).rejects.toThrow(
      /name|package/i,
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it.each([
    { manifest: { license: 'MIT' }, message: /root package\.json name.*scoped/i },
    { manifest: { name: 'unscoped', license: 'MIT' }, message: /root package\.json name.*scoped/i },
    { manifest: { name: '@acme/workspace' }, message: /root package\.json license/i },
    { manifest: { name: '@acme/workspace', license: '' }, message: /root package\.json license/i },
    {
      manifest: { name: '@acme/workspace', license: null },
      message: /root package\.json license/i,
    },
  ])(
    'rejects missing or invalid root configuration without changes: %j',
    async ({ manifest, message }) => {
      const tree = workspace(manifest);
      const before = snapshot(tree);
      await expect(packageGenerator(tree, options)).rejects.toThrow(message);
      expect(snapshot(tree)).toEqual(before);
    },
  );

  it.each([
    ['repository', null],
    ['repository', { type: 'git' }],
    ['homepage', 'relative/path'],
    ['bugs', { url: 'javascript:alert(1)' }],
  ])('rejects malformed present optional %s before writing', async (field, value) => {
    const tree = workspace({ name: '@acme/workspace', license: 'MIT', [field]: value });
    const before = snapshot(tree);
    await expect(packageGenerator(tree, options)).rejects.toThrow(
      new RegExp(`package\\.json.*${field}`),
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['', '1', 'v1.0.0', '1.0.0 ', '01.0.0'])(
    'rejects missing or invalid package version %j',
    async (version) => {
      const tree = workspace();
      const before = snapshot(tree);
      await expect(
        packageGenerator(tree, { name: 'example', packageVersion: version }),
      ).rejects.toThrow(/--packageVersion/i);
      expect(snapshot(tree)).toEqual(before);
    },
  );

  it('rejects an existing destination even if it contains only an unrelated file', async () => {
    const tree = workspace();
    tree.write('packages/example/note.txt', 'keep me\n');
    const before = snapshot(tree);
    await expect(packageGenerator(tree, options)).rejects.toThrow(/packages\/example.*exist/i);
    expect(snapshot(tree)).toEqual(before);
  });

  it('rejects a repeated creation without changes', async () => {
    const tree = workspace();
    await packageGenerator(tree, options);
    const after = snapshot(tree);
    await expect(packageGenerator(tree, options)).rejects.toThrow(/exist/i);
    expect(snapshot(tree)).toEqual(after);
  });
});
