import { readJson, writeJson, type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { libraryGenerator } from './library';
import type { LibraryGeneratorSchema } from './schema';

function workspace(
  manifest: Record<string, unknown> = { name: '@acme/workspace', license: 'MIT' },
): Tree {
  const tree = createTreeWithEmptyWorkspace();
  writeJson(tree, 'package.json', {
    private: true,
    ...manifest,
    devDependencies: { nx: '23.2.1', typescript: '~6.0.3' },
  });
  writeJson(tree, 'nx.json', {
    plugins: [
      {
        plugin: '@nx/js/typescript',
        options: {
          build: { targetName: 'build', configName: 'tsconfig.lib.json' },
          typecheck: { targetName: 'typecheck' },
        },
      },
      '@araketski/nx-pi',
    ],
  });
  writeJson(tree, 'tsconfig.base.json', {
    compilerOptions: {
      composite: true,
      declaration: true,
      module: 'nodenext',
      moduleResolution: 'nodenext',
      target: 'es2022',
    },
  });
  writeJson(tree, 'tsconfig.json', { extends: './tsconfig.base.json', files: [], references: [] });
  tree.write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
  tree.write('README.md', 'consumer content\n');
  return tree;
}
function snapshot(tree: Tree) {
  return tree
    .listChanges()
    .map(({ path, type, content }) => ({ path, type, content: content?.toString() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
const options = { name: 'example', packageVersion: '1.2.3' };

// @mara checks REQ-NXPI-IDENTITY
// @mara checks REQ-NXPI-PRESERVE
// @mara checks REQ-NXPI-LIBRARY-EXPORTS
// @mara checks REQ-NXPI-VALIDATION-ELIGIBILITY
// @mara checks REQ-NXPI-INFRASTRUCTURE-NEUTRAL
// @mara checks DES-NXPI-LIBRARY-CONTRACT
describe('library generator', () => {
  it('delegates build setup to Nx and authors a compiled library with metadata and the opt-in marker', async () => {
    const tree = workspace({
      name: '@acme/workspace',
      license: 'Apache-2.0',
      homepage: 'https://example.com/acme',
    });
    const before = snapshot(tree);
    const result = await libraryGenerator(tree, options);
    expect(result).toEqual(expect.any(Function)); // Nx owns compiler dependency installation
    const pkg = readJson(tree, 'packages/example/package.json');
    expect(pkg).toMatchObject({
      name: '@acme/pi-example',
      version: '1.2.3',
      license: 'Apache-2.0',
      homepage: 'https://example.com/acme',
      type: 'module',
      files: expect.arrayContaining(['dist']),
      exports: expect.objectContaining({ '.': expect.any(Object) }),
    });
    expect(pkg.exports).toHaveProperty('./package.json', './package.json');
    expect(pkg.exports['.']).toMatchObject({ types: './dist/index.d.ts' });
    expect(pkg.private).not.toBe(true);
    expect(pkg).not.toHaveProperty('pi');
    expect(readJson(tree, 'packages/example/project.json').tags).toContain('nx-pi:library');
    expect(tree.exists('packages/example/src/index.ts')).toBe(true);
    expect(tree.exists('packages/example/tsconfig.lib.json')).toBe(true);
    expect(tree.exists('.verdaccio/config.yml')).toBe(false);
    expect(readJson(tree, 'package.json')).toMatchObject({
      private: true,
      name: '@acme/workspace',
      license: 'Apache-2.0',
      homepage: 'https://example.com/acme',
      devDependencies: { nx: '23.2.1', typescript: '~6.0.3' },
    });
    expect(readJson(tree, 'package.json').devDependencies).toHaveProperty('@types/node');
    expect(snapshot(tree).find(({ path }) => path === 'README.md')).toEqual(
      before.find(({ path }) => path === 'README.md'),
    );
  });

  it('passes supported consumer options to Nx without overriding fixed identity or tag', async () => {
    const tree = workspace();
    await libraryGenerator(tree, {
      ...options,
      strict: false,
      linter: 'none',
      unitTestRunner: 'none',
      formatter: 'none',
    });
    const tsconfig = readJson(tree, 'packages/example/tsconfig.lib.json');
    expect(tsconfig.compilerOptions.strict).not.toBe(true);
    expect(readJson(tree, 'packages/example/project.json').tags).toContain('nx-pi:library');
    expect(tree.exists('packages/example/src/lib/example.spec.ts')).toBe(false);
  });

  it.each(['pi-example', '@acme/example', 'Example', '../escape', 'bad name', 'a--b'])(
    'rejects invalid name %j without changes',
    async (name) => {
      const tree = workspace();
      const before = snapshot(tree);
      await expect(libraryGenerator(tree, { ...options, name })).rejects.toThrow(/name/i);
      expect(snapshot(tree)).toEqual(before);
    },
  );

  it.each([
    { linter: 'other' },
    { unitTestRunner: 'mocha' },
    { formatter: 'other' },
    { strict: 'false' },
  ])('rejects unsupported Nx settings %j before writing', async (invalid) => {
    const tree = workspace();
    const before = snapshot(tree);
    await expect(
      libraryGenerator(tree, { ...options, ...invalid } as LibraryGeneratorSchema),
    ).rejects.toThrow(/nx-pi library/i);
    expect(snapshot(tree)).toEqual(before);
  });

  it('rejects existing destinations, including unrelated files, before invoking Nx', async () => {
    const tree = workspace();
    tree.write('packages/example/notes.txt', 'keep\n');
    const before = snapshot(tree);
    await expect(libraryGenerator(tree, options)).rejects.toThrow(/packages\/example.*exist/i);
    expect(snapshot(tree)).toEqual(before);
  });

  it.each([
    { name: '@acme/workspace' },
    { name: 'unscoped', license: 'MIT' },
    { name: '@acme/workspace', license: '' },
  ])('rejects missing root metadata without changes', async (manifest) => {
    const tree = workspace(manifest);
    const before = snapshot(tree);
    await expect(libraryGenerator(tree, options)).rejects.toThrow(/root package\.json/i);
    expect(snapshot(tree)).toEqual(before);
  });
});
