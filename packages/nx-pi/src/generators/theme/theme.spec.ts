import { addProjectConfiguration, readJson, type Tree, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { themeGenerator } from './theme';

// Required colors from Pi 0.99.1 theme-schema.json; the optional five have fallbacks.
const requiredColors =
  `accent border borderAccent borderMuted success error warning muted dim text thinkingText selectedBg userMessageBg userMessageText customMessageBg customMessageText customMessageLabel toolPendingBg toolSuccessBg toolErrorBg toolTitle toolOutput mdHeading mdLink mdLinkUrl mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr mdListBullet toolDiffAdded toolDiffRemoved toolDiffContext syntaxComment syntaxKeyword syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType syntaxOperator syntaxPunctuation thinkingOff thinkingMinimal thinkingLow thinkingMedium thinkingHigh thinkingXhigh bashMode`.split(
    ' ',
  );

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
const options = { name: 'soft-dark', project: '@acme/pi-demo' };

// @mara checks REQ-NXPI-PRESERVE
// @mara checks REQ-NXPI-RESOURCE-SOURCE
// @mara checks DES-NXPI-THEME-CONTRACT
describe('theme generator', () => {
  it('scaffolds a structurally valid terminal-default theme without inventing a palette', async () => {
    const tree = workspace({
      name: '@acme/pi-demo',
      pi: { skills: ['./skills/helper'], prompts: ['./prompts/review.md'] },
      files: ['README.md', 'prompts/review.md'],
      arbitrary: { retained: true },
    });
    const before = snapshot(tree);
    await themeGenerator(tree, options);
    const theme = readJson(tree, 'packages/demo/themes/soft-dark.json');
    expect(Object.keys(theme)).toEqual(['name', 'colors']);
    expect(theme.name).toBe('soft-dark');
    expect(Object.keys(theme.colors).sort()).toEqual([...requiredColors].sort());
    expect(Object.values(theme.colors)).toEqual(Array(requiredColors.length).fill(''));
    expect(requiredColors).toHaveLength(51);
    expect(readJson(tree, 'packages/demo/package.json')).toEqual({
      name: '@acme/pi-demo',
      pi: {
        skills: ['./skills/helper'],
        prompts: ['./prompts/review.md'],
        themes: ['./themes/soft-dark.json'],
      },
      files: ['README.md', 'prompts/review.md', 'themes/soft-dark.json'],
      arbitrary: { retained: true },
    });
    expect(tree.read('packages/demo/README.md', 'utf8')).toBe('authored\n');
    expect(
      snapshot(tree)
        .filter(({ path }) => !before.some((entry) => entry.path === path))
        .map(({ path }) => path),
    ).toEqual(['packages/demo/themes/soft-dark.json']);
  });

  it('adds another theme without creating an absent publication allowlist', async () => {
    const tree = workspace();
    await themeGenerator(tree, options);
    await themeGenerator(tree, { ...options, name: 'soft-light' });
    expect(readJson(tree, 'packages/demo/package.json')).toEqual({
      name: '@acme/pi-demo',
      pi: { themes: ['./themes/soft-dark.json', './themes/soft-light.json'] },
    });
    expect(readJson(tree, 'packages/demo/themes/soft-light.json').name).toBe('soft-light');
  });

  it('rejects the reserved system theme name before any writes', async () => {
    const tree = workspace({
      name: '@acme/pi-demo',
      pi: { themes: ['./themes/authored.json'] },
      files: ['README.md', 'themes/authored.json'],
    });
    tree.write('packages/demo/themes/authored.json', 'authored theme\n');
    const before = snapshot(tree);
    await expect(themeGenerator(tree, { ...options, name: 'system' })).rejects.toThrow(
      /system.*reserved.*Pi/,
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it('allows a non-reserved name containing system', async () => {
    const tree = workspace();
    await themeGenerator(tree, { ...options, name: 'system-dark' });
    expect(readJson(tree, 'packages/demo/themes/system-dark.json').name).toBe('system-dark');
    expect(readJson(tree, 'packages/demo/package.json').pi.themes).toEqual([
      './themes/system-dark.json',
    ]);
  });

  it('rejects existing theme files and authored directories unchanged', async () => {
    const tree = workspace();
    await themeGenerator(tree, options);
    let before = snapshot(tree);
    await expect(themeGenerator(tree, options)).rejects.toThrow(/already exists/);
    expect(snapshot(tree)).toEqual(before);
    tree.write('packages/demo/themes/another.json/notes.txt', 'retain');
    before = snapshot(tree);
    await expect(themeGenerator(tree, { ...options, name: 'another' })).rejects.toThrow(
      /already exists/,
    );
    expect(snapshot(tree)).toEqual(before);
  });

  it.each(['', 'Dark', '../escape', 'bad name', 'bad--name', 'pi/theme', 'x'.repeat(65)])(
    'rejects unsafe name %j before writes',
    async (name) => {
      const tree = workspace();
      const before = snapshot(tree);
      await expect(themeGenerator(tree, { ...options, name })).rejects.toThrow(/name/);
      expect(snapshot(tree)).toEqual(before);
    },
  );

  it.each([
    [{ name: '@acme/pi-demo' }, /pi must be an object/],
    [{ name: '@acme/pi-demo', pi: null }, /pi must be an object/],
    [{ name: '@acme/pi-demo', pi: { themes: 'themes' } }, /pi.themes must be an array/],
    [{ name: '@acme/pi-demo', pi: { themes: [42] } }, /pi.themes must be an array/],
    [{ name: '@acme/pi-demo', pi: {}, files: 'themes' }, /files must be an array/],
    [{ name: '@acme/pi-demo', pi: {}, files: [42] }, /files must be an array/],
  ])('rejects malformed package manifests unchanged', async (manifest, error) => {
    const tree = workspace(manifest);
    const before = snapshot(tree);
    await expect(themeGenerator(tree, options)).rejects.toThrow(error);
    expect(snapshot(tree)).toEqual(before);
  });

  it('supports configured Pi projects outside packages/*', async () => {
    const tree = workspace();
    addProjectConfiguration(tree, 'custom-resource', { root: 'custom/resource', targets: {} });
    writeJson(tree, 'custom/resource/package.json', { name: '@acme/custom', pi: {} });
    await themeGenerator(tree, { name: 'custom-dark', project: 'custom-resource' });
    expect(readJson(tree, 'custom/resource/themes/custom-dark.json').name).toBe('custom-dark');
    expect(readJson(tree, 'custom/resource/package.json').pi).toEqual({
      themes: ['./themes/custom-dark.json'],
    });
  });

  it('rejects a missing or non-Pi project unchanged', async () => {
    const tree = workspace();
    writeJson(tree, 'packages/other/package.json', { name: '@acme/other' });
    const before = snapshot(tree);
    await expect(themeGenerator(tree, { ...options, project: '@acme/other' })).rejects.toThrow(
      /pi must be an object/,
    );
    await expect(themeGenerator(tree, { ...options, project: 'missing' })).rejects.toThrow(
      /project/,
    );
    expect(snapshot(tree)).toEqual(before);
  });
});
