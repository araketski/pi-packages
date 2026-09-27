import { addProjectConfiguration, readJson, type Tree, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { extensionGenerator } from './extension';

const piPeer = '@earendil-works/pi-coding-agent';
const options = { name: 'status-line', project: '@acme/pi-demo' };
function workspace(manifest: Record<string, unknown> = { name: '@acme/pi-demo', pi: {} }): Tree {
  const tree = createTreeWithEmptyWorkspace();
  writeJson(tree, 'package.json', { name: '@acme/workspace', private: true });
  writeJson(tree, 'nx.json', { plugins: ['@araketski/nx-pi'] });
  writeJson(tree, 'packages/demo/package.json', manifest);
  tree.write('packages/demo/README.md', 'authored\n');
  return tree;
}
function snapshot(tree: Tree) {
  return tree
    .listChanges()
    .map(({ path, type, content }) => ({ path, type, content: content?.toString() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// @mara checks REQ-NXPI-PRESERVE
// @mara checks REQ-NXPI-RESOURCE-SOURCE
// @mara checks DES-NXPI-EXTENSION-CONTRACT
describe('extension generator', () => {
  it('scaffolds a typed no-op extension, declares the Pi peer, and preserves other resources', async () => {
    const tree = workspace({
      name: '@acme/pi-demo',
      pi: { skills: ['./skills/helper'], prompts: ['./prompts/review.md'] },
      files: ['README.md', 'prompts/review.md'],
      peerDependencies: { 'existing-peer': '^1.0.0' },
      dependencies: { 'user-owned': '^2.0.0' },
      arbitrary: { retained: true },
    });
    const before = snapshot(tree);
    await extensionGenerator(tree, options);
    expect(tree.read('packages/demo/extensions/status-line/index.ts', 'utf8')).toBe(
      `import type { ExtensionAPI } from '${piPeer}';\n\nexport default function (pi: ExtensionAPI): void {\n  // TODO: Register this extension's tools, commands, or event handlers.\n  void pi;\n}\n`,
    );
    expect(readJson(tree, 'packages/demo/package.json')).toEqual({
      name: '@acme/pi-demo',
      pi: {
        skills: ['./skills/helper'],
        prompts: ['./prompts/review.md'],
        extensions: ['./extensions/status-line/index.ts'],
      },
      files: ['README.md', 'prompts/review.md', 'extensions/status-line'],
      peerDependencies: { 'existing-peer': '^1.0.0', [piPeer]: '*' },
      dependencies: { 'user-owned': '^2.0.0' },
      arbitrary: { retained: true },
    });
    expect(tree.read('packages/demo/README.md', 'utf8')).toBe('authored\n');
    expect(
      snapshot(tree)
        .filter(({ path }) => !before.some((entry) => entry.path === path))
        .map(({ path }) => path),
    ).toEqual(['packages/demo/extensions/status-line/index.ts']);
  });

  it('preserves an existing Pi peer range and does not create an absent files allowlist', async () => {
    const tree = workspace({
      name: '@acme/pi-demo',
      pi: {},
      peerDependencies: { [piPeer]: '>=0.87.0' },
    });
    await extensionGenerator(tree, options);
    await extensionGenerator(tree, { ...options, name: 'session-helper' });
    expect(readJson(tree, 'packages/demo/package.json')).toEqual({
      name: '@acme/pi-demo',
      pi: {
        extensions: ['./extensions/status-line/index.ts', './extensions/session-helper/index.ts'],
      },
      peerDependencies: { [piPeer]: '>=0.87.0' },
    });
  });

  it('rejects a repeated creation and an authored directory without changes', async () => {
    const tree = workspace();
    await extensionGenerator(tree, options);
    let before = snapshot(tree);
    await expect(extensionGenerator(tree, options)).rejects.toThrow(/already exists/);
    expect(snapshot(tree)).toEqual(before);
    tree.write('packages/demo/extensions/another/notes.txt', 'keep');
    before = snapshot(tree);
    await expect(extensionGenerator(tree, { ...options, name: 'another' })).rejects.toThrow(
      /already exists/,
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['', 'Status', '../escape', 'bad name', 'bad--name', 'pi/extension', 'x'.repeat(65)])(
    'rejects invalid name %j before writing',
    async (name) => {
      const tree = workspace();
      const before = snapshot(tree);
      await expect(extensionGenerator(tree, { ...options, name })).rejects.toThrow(/name/);
      expect(snapshot(tree)).toEqual(before);
    },
  );

  it.each([
    [{ name: '@acme/pi-demo' }, /pi must be an object/],
    [{ name: '@acme/pi-demo', pi: null }, /pi must be an object/],
    [{ name: '@acme/pi-demo', pi: { extensions: 'extensions' } }, /pi.extensions must be an array/],
    [{ name: '@acme/pi-demo', pi: { extensions: [42] } }, /pi.extensions must be an array/],
    [{ name: '@acme/pi-demo', pi: {}, files: 'extensions' }, /files must be an array/],
    [{ name: '@acme/pi-demo', pi: {}, files: [42] }, /files must be an array/],
    [
      { name: '@acme/pi-demo', pi: {}, peerDependencies: 'pi' },
      /peerDependencies must be an object/,
    ],
    [
      { name: '@acme/pi-demo', pi: {}, peerDependencies: { [piPeer]: '' } },
      /peerDependencies.*nonblank/,
    ],
    [
      { name: '@acme/pi-demo', pi: {}, peerDependencies: { [piPeer]: null } },
      /peerDependencies.*nonblank/,
    ],
  ])('rejects malformed target manifests unchanged', async (manifest, error) => {
    const tree = workspace(manifest);
    const before = snapshot(tree);
    await expect(extensionGenerator(tree, options)).rejects.toThrow(error);
    expect(snapshot(tree)).toEqual(before);
  });

  it('supports an explicitly configured Pi package outside packages/*', async () => {
    const tree = workspace();
    addProjectConfiguration(tree, 'custom-resource', { root: 'custom/resource', targets: {} });
    writeJson(tree, 'custom/resource/package.json', { name: '@acme/custom', pi: {} });
    await extensionGenerator(tree, { name: 'custom', project: 'custom-resource' });
    expect(tree.exists('custom/resource/extensions/custom/index.ts')).toBe(true);
    expect(readJson(tree, 'custom/resource/package.json')).toMatchObject({
      pi: { extensions: ['./extensions/custom/index.ts'] },
      peerDependencies: { [piPeer]: '*' },
    });
  });

  it('rejects missing or non-Pi projects unchanged', async () => {
    const tree = workspace();
    writeJson(tree, 'packages/other/package.json', { name: '@acme/other' });
    const before = snapshot(tree);
    await expect(extensionGenerator(tree, { ...options, project: '@acme/other' })).rejects.toThrow(
      /pi must be an object/,
    );
    await expect(extensionGenerator(tree, { ...options, project: 'missing' })).rejects.toThrow(
      /project/,
    );
    expect(snapshot(tree)).toEqual(before);
  });
});
