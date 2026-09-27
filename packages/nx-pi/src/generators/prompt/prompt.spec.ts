import { addProjectConfiguration, readJson, writeJson, type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { promptGenerator } from './prompt';

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
const options = { name: 'code-review', project: '@acme/pi-demo' };

// @mara checks REQ-NXPI-PRESERVE
// @mara checks REQ-NXPI-RESOURCE-SOURCE
// @mara checks DES-NXPI-PROMPT-CONTRACT
describe('prompt generator', () => {
  it('scaffolds a TODO prompt, registers its exact path and preserves other resources', async () => {
    const tree = workspace({
      name: '@acme/pi-demo',
      pi: { skills: ['./skills/refactoring'] },
      files: ['README.md', 'skills/refactoring'],
      arbitrary: { retained: true },
    });
    const before = snapshot(tree);
    await promptGenerator(tree, options);
    expect(tree.read('packages/demo/prompts/code-review.md', 'utf8')).toBe(
      '---\ndescription: "TODO: Describe /code-review."\n---\n\nTODO: Replace this scaffold with prompt text before using or publishing /code-review.\n',
    );
    expect(readJson(tree, 'packages/demo/package.json')).toEqual({
      name: '@acme/pi-demo',
      pi: { skills: ['./skills/refactoring'], prompts: ['./prompts/code-review.md'] },
      files: ['README.md', 'skills/refactoring', 'prompts/code-review.md'],
      arbitrary: { retained: true },
    });
    expect(tree.read('packages/demo/README.md', 'utf8')).toBe('authored\n');
    expect(
      snapshot(tree)
        .filter(({ path }) => !before.some((entry) => entry.path === path))
        .map(({ path }) => path),
    ).toEqual(['packages/demo/prompts/code-review.md']);
  });

  it('quotes an optional description and allows another prompt without creating a files allowlist', async () => {
    const tree = workspace();
    await promptGenerator(tree, { ...options, description: 'Review: "changes"' });
    await promptGenerator(tree, { ...options, name: 'release-notes' });
    expect(tree.read('packages/demo/prompts/code-review.md', 'utf8')).toContain(
      'description: "Review: \\"changes\\""',
    );
    expect(readJson(tree, 'packages/demo/package.json')).toEqual({
      name: '@acme/pi-demo',
      pi: { prompts: ['./prompts/code-review.md', './prompts/release-notes.md'] },
    });
  });

  it('fails unchanged for repeated creation or an authored directory at the destination', async () => {
    const tree = workspace();
    await promptGenerator(tree, options);
    let before = snapshot(tree);
    await expect(promptGenerator(tree, options)).rejects.toThrow(/already exists/);
    expect(snapshot(tree)).toEqual(before);
    tree.write('packages/demo/prompts/another.md/notes.txt', 'keep');
    before = snapshot(tree);
    await expect(promptGenerator(tree, { ...options, name: 'another' })).rejects.toThrow(
      /already exists/,
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['', 'Review', '../escape', 'bad name', 'bad--name', 'pi/prompt', 'x'.repeat(65)])(
    'rejects invalid name %j unchanged',
    async (name) => {
      const tree = workspace();
      const before = snapshot(tree);
      await expect(promptGenerator(tree, { ...options, name })).rejects.toThrow(/name/);
      expect(snapshot(tree)).toEqual(before);
    },
  );

  it.each([
    ['', /description/],
    ['  ', /description/],
    ['x'.repeat(1025), /description/],
  ])('rejects invalid optional description unchanged', async (description, error) => {
    const tree = workspace();
    const before = snapshot(tree);
    await expect(promptGenerator(tree, { ...options, description })).rejects.toThrow(error);
    expect(snapshot(tree)).toEqual(before);
  });

  it.each([
    [{ name: '@acme/pi-demo' }, /pi must be an object/],
    [{ name: '@acme/pi-demo', pi: null }, /pi must be an object/],
    [{ name: '@acme/pi-demo', pi: { prompts: 'prompts' } }, /pi.prompts must be an array/],
    [{ name: '@acme/pi-demo', pi: { prompts: [42] } }, /pi.prompts must be an array/],
    [{ name: '@acme/pi-demo', pi: {}, files: 'prompts' }, /files must be an array/],
    [{ name: '@acme/pi-demo', pi: {}, files: [42] }, /files must be an array/],
  ])('rejects invalid manifests before changes', async (manifest, error) => {
    const tree = workspace(manifest);
    const before = snapshot(tree);
    await expect(promptGenerator(tree, options)).rejects.toThrow(error);
    expect(snapshot(tree)).toEqual(before);
  });

  it('supports a configured Pi project outside packages/*', async () => {
    const tree = workspace();
    addProjectConfiguration(tree, 'custom-resource', { root: 'custom/resource', targets: {} });
    writeJson(tree, 'custom/resource/package.json', { name: '@acme/custom', pi: {} });
    await promptGenerator(tree, { name: 'deploy', project: 'custom-resource' });
    expect(tree.exists('custom/resource/prompts/deploy.md')).toBe(true);
    expect(readJson(tree, 'custom/resource/package.json').pi).toEqual({
      prompts: ['./prompts/deploy.md'],
    });
  });

  it('rejects a missing or non-Pi project unchanged', async () => {
    const tree = workspace();
    writeJson(tree, 'packages/other/package.json', { name: '@acme/other' });
    const before = snapshot(tree);
    await expect(promptGenerator(tree, { ...options, project: '@acme/other' })).rejects.toThrow(
      /pi must be an object/,
    );
    await expect(promptGenerator(tree, { ...options, project: 'missing' })).rejects.toThrow(
      /project/,
    );
    expect(snapshot(tree)).toEqual(before);
  });
});
