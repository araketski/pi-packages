import { addProjectConfiguration, readJson, writeJson, type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { skillGenerator } from './skill';

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
// @mara checks DES-NXPI-SKILL-CONTRACT
describe('skill generator', () => {
  it('scaffolds a visibly unfinished skill and registers just its path without adding tooling', async () => {
    const tree = workspace({
      name: '@acme/pi-demo',
      pi: { prompts: ['./prompts/help.md'] },
      files: ['README.md'],
    });
    const original = snapshot(tree);
    await skillGenerator(tree, options);
    expect(tree.read('packages/demo/skills/code-review/SKILL.md', 'utf8')).toBe(
      '---\nname: code-review\ndescription: "TODO: Describe when to use code-review."\n---\n\n# code-review\n\nTODO: Replace this scaffold with instructions before using or publishing this skill.\n',
    );
    expect(readJson(tree, 'packages/demo/package.json')).toEqual({
      name: '@acme/pi-demo',
      pi: { prompts: ['./prompts/help.md'], skills: ['./skills/code-review'] },
      files: ['README.md', 'skills/code-review'],
    });
    expect(tree.read('packages/demo/README.md', 'utf8')).toBe('authored\n');
    expect(
      snapshot(tree)
        .filter(({ path }) => !original.some((entry) => entry.path === path))
        .map(({ path }) => path),
    ).toEqual(['packages/demo/skills/code-review/SKILL.md']);
  });

  it('quotes an optional description and preserves unrelated resources without adding a files allowlist', async () => {
    const tree = workspace();
    await skillGenerator(tree, { ...options, description: 'Review: "changes"' });
    await skillGenerator(tree, { ...options, name: 'release-notes' });
    expect(tree.read('packages/demo/skills/code-review/SKILL.md', 'utf8')).toContain(
      'description: "Review: \\"changes\\""',
    );
    expect(readJson(tree, 'packages/demo/package.json')).toEqual({
      name: '@acme/pi-demo',
      pi: { skills: ['./skills/code-review', './skills/release-notes'] },
    });
  });

  it('rejects an existing destination (including authored files without SKILL.md) unchanged', async () => {
    const tree = workspace();
    await skillGenerator(tree, options);
    let before = snapshot(tree);
    await expect(skillGenerator(tree, options)).rejects.toThrow(/already exists/);
    expect(snapshot(tree)).toEqual(before);
    tree.write('packages/demo/skills/another/notes.txt', 'retain');
    before = snapshot(tree);
    await expect(skillGenerator(tree, { ...options, name: 'another' })).rejects.toThrow(
      /already exists/,
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['', 'Review', '../escape', 'bad name', 'bad--name', 'pi/skill', 'x'.repeat(65)])(
    'rejects invalid skill name %j unchanged',
    async (name) => {
      const tree = workspace();
      const before = snapshot(tree);
      await expect(skillGenerator(tree, { ...options, name })).rejects.toThrow(/name/);
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
    await expect(skillGenerator(tree, { ...options, description })).rejects.toThrow(error);
    expect(snapshot(tree)).toEqual(before);
  });

  it.each([
    [{ name: '@acme/pi-demo' }, /pi must be an object/],
    [{ name: '@acme/pi-demo', pi: null }, /pi must be an object/],
    [{ name: '@acme/pi-demo', pi: { skills: 'skills' } }, /pi.skills must be an array/],
    [{ name: '@acme/pi-demo', pi: { skills: [42] } }, /pi.skills must be an array/],
    [{ name: '@acme/pi-demo', pi: {}, files: 'skills' }, /files must be an array/],
    [{ name: '@acme/pi-demo', pi: {}, files: [42] }, /files must be an array/],
  ])('rejects an ineligible or malformed package unchanged', async (manifest, error) => {
    const tree = workspace(manifest);
    const before = snapshot(tree);
    await expect(skillGenerator(tree, options)).rejects.toThrow(error);
    expect(snapshot(tree)).toEqual(before);
  });

  it('supports an explicitly configured Pi project outside the package-generator layout', async () => {
    const tree = workspace();
    addProjectConfiguration(tree, 'custom-resource', { root: 'custom/resource', targets: {} });
    writeJson(tree, 'custom/resource/package.json', { name: '@acme/custom', pi: {} });
    await skillGenerator(tree, { name: 'workflows', project: 'custom-resource' });
    expect(tree.exists('custom/resource/skills/workflows/SKILL.md')).toBe(true);
    expect(readJson(tree, 'custom/resource/package.json').pi).toEqual({
      skills: ['./skills/workflows'],
    });
  });

  it('rejects a missing or non-Pi project without changing other packages', async () => {
    const tree = workspace();
    writeJson(tree, 'packages/other/package.json', { name: '@acme/other' });
    const before = snapshot(tree);
    await expect(skillGenerator(tree, { ...options, project: '@acme/other' })).rejects.toThrow(
      /pi must be an object/,
    );
    await expect(skillGenerator(tree, { ...options, project: 'missing' })).rejects.toThrow(
      /project/,
    );
    expect(snapshot(tree)).toEqual(before);
  });
});
