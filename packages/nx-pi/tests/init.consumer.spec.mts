import { NX_VERSION } from '@nx/devkit';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runInTerminal } from './terminal.mjs';

const plugin = '@araketski/nx-pi';
const packageRoot = resolve(import.meta.dirname, '..');
const createNxWorkspace = join(
  dirname(createRequire(import.meta.url).resolve('create-nx-workspace/package.json')),
  'dist/bin/index.js',
);
const env = { ...process.env, NX_DAEMON: 'false', NX_INTERACTIVE: 'false', NX_NO_CLOUD: 'true' };
let temporaryRoot: string;
let tarball: string;

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function save(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function authoredFiles(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(directory: string, relative = ''): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.nx') continue;
      const path = join(directory, entry.name);
      const key = join(relative, entry.name);
      if (entry.isDirectory()) visit(path, key);
      else result[key] = readFileSync(path, 'utf8');
    }
  }
  visit(root);
  return result;
}

function generate(
  root: string,
  args: string[],
  generator = 'init',
  childEnv: NodeJS.ProcessEnv = env,
) {
  return spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/nx/dist/bin/nx.js'),
      'generate',
      `${plugin}:${generator}`,
      '--no-interactive',
      ...args,
    ],
    { cwd: root, env: childEnv, encoding: 'utf8', timeout: 60_000 },
  );
}

beforeAll(() => {
  const parent = process.env.NX_PI_TEST_TMPDIR ?? tmpdir();
  mkdirSync(parent, { recursive: true });
  const fromWorkspace = relative(realpathSync(resolve(packageRoot, '../..')), realpathSync(parent));
  if (
    !isAbsolute(fromWorkspace) &&
    fromWorkspace !== '..' &&
    !fromWorkspace.startsWith(`..${sep}`)
  ) {
    throw new Error('NX_PI_TEST_TMPDIR must be outside the development workspace.');
  }
  temporaryRoot = mkdtempSync(join(parent, 'nx-pi-consumer-'));
  const output = execFileSync('pnpm', ['pack', '--pack-destination', temporaryRoot, '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
    env,
    timeout: 60_000,
  });
  const packed = JSON.parse(output) as { filename: string; files: Array<{ path: string }> };
  tarball = packed.filename;
  const contents = packed.files.map(({ path }) => path);
  expect(contents).toContain('generators.json');
  expect(contents).toContain('dist/generators/init/init.js');
  expect(contents).toContain('dist/generators/init/schema.json');
  expect(contents).toContain('dist/generators/package/package.js');
  expect(contents).toContain('dist/generators/package/schema.json');
  expect(contents).toContain('dist/generators/library/library.js');
  expect(contents).toContain('dist/generators/library/schema.json');
  expect(contents).toContain('dist/generators/skill/skill.js');
  expect(contents).toContain('dist/generators/skill/schema.json');
  expect(contents).toContain('dist/generators/prompt/prompt.js');
  expect(contents).toContain('dist/generators/prompt/schema.json');
  expect(contents).toContain('dist/generators/theme/theme.js');
  expect(contents).toContain('dist/generators/theme/schema.json');
  expect(contents).toContain('executors.json');
  expect(contents).toContain('dist/executors/pi-check/executor.js');
  expect(contents).toContain('dist/executors/pi-check/schema.json');
  expect(
    contents.some((path) =>
      /(^src\/|^docs\/|^tests\/|\.spec\.|tsbuildinfo|\.map$|\.mara\.md$)/.test(path),
    ),
  ).toBe(false);
}, 120_000);

afterEach(() => {
  // Retain the tarball, but release each consumer and Nx's sandbox immediately.
  if (!temporaryRoot) return;
  for (const entry of readdirSync(temporaryRoot, { withFileTypes: true })) {
    if (entry.isDirectory())
      rmSync(join(temporaryRoot, entry.name), { recursive: true, force: true });
  }
});

afterAll(() => {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
});

// @mara checks REQ-NXPI-INIT
// @mara checks DES-NXPI-INIT-CONTRACT
// @mara checks REQ-NXPI-PUBLIC-PLUGIN
// @mara checks REQ-NXPI-INFRASTRUCTURE-NEUTRAL
// @mara checks REQ-NXPI-SOURCE-VALIDATION
// @mara checks REQ-NXPI-VALIDATION-ELIGIBILITY
// @mara checks REQ-NXPI-VALIDATION-TARGET-NAMES
// @mara checks REQ-NXPI-LIBRARY-EXPORTS
// @mara checks DES-NXPI-LIBRARY-CONTRACT
// @mara checks DES-NXPI-SKILL-CONTRACT
// @mara checks DES-NXPI-PROMPT-CONTRACT
// @mara checks DES-NXPI-THEME-CONTRACT
describe('packed nx-pi in independent consumers', () => {
  it.each(['npm', 'pnpm'])(
    '%s: minimal fixture covers init, generators, source checks, and release dry-runs',
    async (manager) => {
      const root = join(temporaryRoot, manager);
      mkdirSync(root);
      const version = execFileSync(manager, ['--version'], { env, encoding: 'utf8' }).trim();
      console.info(
        `Consumer fixture: Node ${process.versions.node}, Nx ${NX_VERSION}, ${manager} ${version}`,
      );
      save(join(root, 'package.json'), {
        name: '@fixture/workspace',
        private: true,
        scripts: { test: 'echo consumer' },
        devDependencies: { nx: NX_VERSION, typescript: '6.0.3', [plugin]: `file:${tarball}` },
      });
      save(join(root, 'nx.json'), { defaultBase: 'trunk', custom: { retained: true } });
      writeFileSync(join(root, '.gitignore'), 'node_modules\n.nx\n');
      writeFileSync(join(root, 'README.md'), 'consumer content\n');
      execFileSync(
        manager,
        manager === 'npm'
          ? ['install', '--ignore-scripts', '--no-audit', '--no-fund']
          : ['install', '--ignore-scripts'],
        { cwd: root, env, encoding: 'utf8', timeout: 120_000 },
      );
      const installed = json(join(root, 'node_modules/@araketski/nx-pi/package.json'));
      expect(JSON.stringify(installed.dependencies)).not.toMatch(/catalog:|workspace:/);

      const manifest = json(join(root, 'package.json'));
      delete manifest.name;
      save(join(root, 'package.json'), manifest);
      const before = authoredFiles(root);
      const missingName = generate(root, []);
      expect(missingName.status, missingName.stdout + missingName.stderr).not.toBe(0);
      expect(missingName.stdout + missingName.stderr).toMatch(/package\.json name.*scoped/);
      expect(authoredFiles(root)).toEqual(before);

      const args = [
        '--name=@fixture/workspace',
        '--license=MIT',
        '--homepage=https://example.com/fixture',
      ];
      const preview = generate(root, [...args, '--dry-run']);
      expect(preview.status, preview.stdout + preview.stderr).toBe(0);
      expect(preview.stdout).toContain('package.json');
      expect(preview.stdout).toContain('nx.json');
      expect(authoredFiles(root)).toEqual(before);

      const applied = generate(root, args);
      expect(applied.status, applied.stdout + applied.stderr).toBe(0);
      expect(json(join(root, 'package.json'))).toEqual({
        ...manifest,
        name: '@fixture/workspace',
        license: 'MIT',
        homepage: 'https://example.com/fixture',
      });
      expect(json(join(root, 'nx.json'))).toEqual({
        defaultBase: 'trunk',
        custom: { retained: true },
        plugins: [plugin],
      });
      const after = authoredFiles(root);
      expect(Object.keys(after)).toEqual(Object.keys(before));
      for (const path of Object.keys(before)) {
        if (path !== 'package.json' && path !== 'nx.json') expect(after[path]).toBe(before[path]);
      }

      const repeated = generate(root, args);
      expect(repeated.status, repeated.stdout + repeated.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(after);
      const conflict = generate(root, [
        '--license=Apache-2.0',
        '--bugs=https://example.com/issues',
      ]);
      expect(conflict.status, conflict.stdout + conflict.stderr).not.toBe(0);
      expect(conflict.stdout + conflict.stderr).toMatch(/license.*conflict/);
      expect(authoredFiles(root)).toEqual(after);

      // The minimal fixture deliberately lacks the required name/registration
      // so the real terminal can exercise prompt completion and cancellation.
      const promptManifest = json(join(root, 'package.json'));
      delete promptManifest.name;
      save(join(root, 'package.json'), promptManifest);
      const promptNx = { analytics: false, defaultBase: 'trunk', custom: { retained: true } };
      save(join(root, 'nx.json'), promptNx);
      const beforePrompt = authoredFiles(root);
      const cli = [join(root, 'node_modules/nx/dist/bin/nx.js'), 'generate', `${plugin}:init`];
      const promptArgs = [...cli, '--interactive', '--bugs=https://example.com/prompt-issues'];
      const unchanged = () => expect(authoredFiles(root)).toEqual(beforePrompt);
      const title = 'Scoped root package name';

      const disabled = await runInTerminal(root, [...cli, '--no-interactive'], env, []);
      expect(disabled.status, disabled.output).not.toBe(0);
      expect(disabled.output).not.toContain(title);
      unchanged();

      const canceled = await runInTerminal(root, promptArgs, env, [
        { waitFor: title, input: '\u0003', check: unchanged },
      ]);
      expect(canceled.status, canceled.output).not.toBe(0);
      expect(canceled.output).toMatch(/canceled/i);
      unchanged();

      const interactivePreview = await runInTerminal(root, [...promptArgs, '--dry-run'], env, [
        { waitFor: title, input: '@terminal/workspace\r', check: unchanged },
      ]);
      expect(interactivePreview.status, interactivePreview.output).toBe(0);
      expect(interactivePreview.output).toContain('package.json');
      expect(interactivePreview.output).toContain('nx.json');
      unchanged();

      const answered = await runInTerminal(root, promptArgs, env, [
        { waitFor: title, input: 'unscoped\r', check: unchanged },
        {
          waitFor: 'Enter a valid scoped npm name',
          input: '\u007f'.repeat(8) + '@terminal/workspace\r',
          check: unchanged,
        },
      ]);
      expect(answered.status, answered.output).toBe(0);
      expect(json(join(root, 'package.json'))).toEqual({
        ...promptManifest,
        name: '@terminal/workspace',
        bugs: 'https://example.com/prompt-issues',
      });
      expect(json(join(root, 'nx.json'))).toEqual({ ...promptNx, plugins: [plugin] });
      const afterPrompt = authoredFiles(root);
      expect(Object.keys(afterPrompt)).toEqual(Object.keys(beforePrompt));
      for (const path of Object.keys(beforePrompt)) {
        if (path !== 'package.json' && path !== 'nx.json')
          expect(afterPrompt[path]).toBe(beforePrompt[path]);
      }
      const noPrompt = await runInTerminal(root, promptArgs, env, []);
      expect(noPrompt.status, noPrompt.output).toBe(0);
      expect(noPrompt.output).not.toContain(title);
      expect(authoredFiles(root)).toEqual(afterPrompt);

      // Creation uses the packed plugin through the real Nx CLI, after init.
      const beforePackage = authoredFiles(root);
      const packageArgs = ['example', '--packageVersion=1.2.3'];
      const previewPackage = generate(root, [...packageArgs, '--dry-run'], 'package');
      expect(previewPackage.status, previewPackage.stdout + previewPackage.stderr).toBe(0);
      expect(previewPackage.stdout).toContain('packages/example/package.json');
      expect(authoredFiles(root)).toEqual(beforePackage);
      for (const invalidArgs of [
        ['example'],
        ['pi-example', '--packageVersion=1.2.3'],
        ['example', '--packageVersion=bad'],
      ]) {
        const invalid = generate(root, invalidArgs, 'package');
        expect(invalid.status, invalid.stdout + invalid.stderr).not.toBe(0);
        expect(authoredFiles(root)).toEqual(beforePackage);
      }
      const createdPackage = generate(root, packageArgs, 'package');
      expect(createdPackage.status, createdPackage.stdout + createdPackage.stderr).toBe(0);
      expect(json(join(root, 'packages/example/package.json'))).toEqual({
        name: '@terminal/pi-example',
        version: '1.2.3',
        license: 'MIT',
        homepage: 'https://example.com/fixture',
        bugs: 'https://example.com/prompt-issues',
        pi: {},
      });
      const createdSnapshot = authoredFiles(root);
      expect(Object.keys(createdSnapshot).filter((path) => !(path in beforePackage))).toEqual([
        'packages/example/package.json',
      ]);
      const generatedCheck = spawnSync(
        process.execPath,
        [cli[0], 'run', '@terminal/pi-example:pi-check'],
        { cwd: root, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(generatedCheck.status, generatedCheck.stdout + generatedCheck.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(createdSnapshot);
      const repeatedPackage = generate(root, packageArgs, 'package');
      expect(repeatedPackage.status, repeatedPackage.stdout + repeatedPackage.stderr).not.toBe(0);
      expect(repeatedPackage.stdout + repeatedPackage.stderr).toMatch(/packages\/example.*exist/i);
      expect(authoredFiles(root)).toEqual(createdSnapshot);
      mkdirSync(join(root, 'packages/empty'));
      const beforeEmpty = authoredFiles(root);
      const emptyCollision = generate(root, ['empty', '--packageVersion=1.2.3'], 'package');
      expect(emptyCollision.status, emptyCollision.stdout + emptyCollision.stderr).not.toBe(0);
      expect(emptyCollision.stdout + emptyCollision.stderr).toMatch(/packages\/empty.*exist/i);
      expect(authoredFiles(root)).toEqual(beforeEmpty);

      // Register an unfinished scaffold in a package with a consumer-owned files allowlist.
      const skillManifest = json(join(root, 'packages/example/package.json'));
      skillManifest.files = ['README.md'];
      save(join(root, 'packages/example/package.json'), skillManifest);
      writeFileSync(join(root, 'packages/example/README.md'), 'authored package docs\n');
      const skillBefore = authoredFiles(root);
      const skillArgs = ['code-review', '--project=@terminal/pi-example'];
      const previewSkill = generate(root, [...skillArgs, '--dry-run'], 'skill');
      expect(previewSkill.status, previewSkill.stdout + previewSkill.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(skillBefore);
      const createdSkill = generate(root, skillArgs, 'skill');
      expect(createdSkill.status, createdSkill.stdout + createdSkill.stderr).toBe(0);
      expect(json(join(root, 'packages/example/package.json'))).toMatchObject({
        pi: { skills: ['./skills/code-review'] },
        files: ['README.md', 'skills/code-review'],
      });
      expect(
        readFileSync(join(root, 'packages/example/skills/code-review/SKILL.md'), 'utf8'),
      ).toContain('TODO: Replace this scaffold with instructions');
      const skillAfter = authoredFiles(root);
      const skillCheck = spawnSync(
        process.execPath,
        [cli[0], 'run', '@terminal/pi-example:pi-check'],
        {
          cwd: root,
          env,
          encoding: 'utf8',
          timeout: 60_000,
        },
      );
      expect(skillCheck.status, skillCheck.stdout + skillCheck.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(skillAfter);
      const repeatedSkill = generate(root, skillArgs, 'skill');
      expect(repeatedSkill.status, repeatedSkill.stdout + repeatedSkill.stderr).not.toBe(0);
      expect(authoredFiles(root)).toEqual(skillAfter);
      const secondSkill = generate(
        root,
        ['release-notes', '--project=@terminal/pi-example'],
        'skill',
      );
      expect(secondSkill.status, secondSkill.stdout + secondSkill.stderr).toBe(0);
      expect(json(join(root, 'packages/example/package.json'))).toMatchObject({
        pi: { skills: ['./skills/code-review', './skills/release-notes'] },
        files: ['README.md', 'skills/code-review', 'skills/release-notes'],
      });
      // A prompt may coexist with skills. Its file is an explicit, unfinished / command.
      const promptCreationArgs = ['code-review', '--project=@terminal/pi-example'];
      const promptBefore = authoredFiles(root);
      const promptPreview = generate(root, [...promptCreationArgs, '--dry-run'], 'prompt');
      expect(promptPreview.status, promptPreview.stdout + promptPreview.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(promptBefore);
      const createdPrompt = generate(root, promptCreationArgs, 'prompt');
      expect(createdPrompt.status, createdPrompt.stdout + createdPrompt.stderr).toBe(0);
      expect(readFileSync(join(root, 'packages/example/prompts/code-review.md'), 'utf8')).toContain(
        'TODO: Replace this scaffold with prompt text',
      );
      expect(json(join(root, 'packages/example/package.json'))).toMatchObject({
        pi: {
          skills: ['./skills/code-review', './skills/release-notes'],
          prompts: ['./prompts/code-review.md'],
        },
        files: [
          'README.md',
          'skills/code-review',
          'skills/release-notes',
          'prompts/code-review.md',
        ],
      });
      const promptAfter = authoredFiles(root);
      const repeatedPrompt = generate(root, promptCreationArgs, 'prompt');
      expect(repeatedPrompt.status, repeatedPrompt.stdout + repeatedPrompt.stderr).not.toBe(0);
      expect(authoredFiles(root)).toEqual(promptAfter);
      const secondPrompt = generate(
        root,
        ['release-notes', '--project=@terminal/pi-example'],
        'prompt',
      );
      expect(secondPrompt.status, secondPrompt.stdout + secondPrompt.stderr).toBe(0);
      const promptFinal = authoredFiles(root);
      const promptCheck = spawnSync(
        process.execPath,
        [cli[0], 'run', '@terminal/pi-example:pi-check'],
        {
          cwd: root,
          env,
          encoding: 'utf8',
          timeout: 60_000,
        },
      );
      expect(promptCheck.status, promptCheck.stdout + promptCheck.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(promptFinal);
      expect(json(join(root, 'packages/example/package.json'))).toMatchObject({
        pi: { prompts: ['./prompts/code-review.md', './prompts/release-notes.md'] },
        files: [
          'README.md',
          'skills/code-review',
          'skills/release-notes',
          'prompts/code-review.md',
          'prompts/release-notes.md',
        ],
      });
      // A minimal valid theme may be added to the same multi-resource package.
      const themeArgs = ['soft-dark', '--project=@terminal/pi-example'];
      const themeBefore = authoredFiles(root);
      const themePreview = generate(root, [...themeArgs, '--dry-run'], 'theme');
      expect(themePreview.status, themePreview.stdout + themePreview.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(themeBefore);
      const createdTheme = generate(root, themeArgs, 'theme');
      expect(createdTheme.status, createdTheme.stdout + createdTheme.stderr).toBe(0);
      const theme = json(join(root, 'packages/example/themes/soft-dark.json'));
      expect(theme.name).toBe('soft-dark');
      expect(Object.keys(theme.colors as Record<string, string>)).toHaveLength(51);
      expect(Object.values(theme.colors as Record<string, string>)).toEqual(Array(51).fill(''));
      expect(json(join(root, 'packages/example/package.json'))).toMatchObject({
        pi: {
          skills: ['./skills/code-review', './skills/release-notes'],
          prompts: ['./prompts/code-review.md', './prompts/release-notes.md'],
          themes: ['./themes/soft-dark.json'],
        },
        files: [
          'README.md',
          'skills/code-review',
          'skills/release-notes',
          'prompts/code-review.md',
          'prompts/release-notes.md',
          'themes/soft-dark.json',
        ],
      });
      const themeAfter = authoredFiles(root);
      const repeatedTheme = generate(root, themeArgs, 'theme');
      expect(repeatedTheme.status, repeatedTheme.stdout + repeatedTheme.stderr).not.toBe(0);
      expect(authoredFiles(root)).toEqual(themeAfter);
      const secondTheme = generate(root, ['soft-light', '--project=@terminal/pi-example'], 'theme');
      expect(secondTheme.status, secondTheme.stdout + secondTheme.stderr).toBe(0);
      const themeFinal = authoredFiles(root);
      const themeCheck = spawnSync(
        process.execPath,
        [cli[0], 'run', '@terminal/pi-example:pi-check'],
        {
          cwd: root,
          env,
          encoding: 'utf8',
          timeout: 60_000,
        },
      );
      expect(themeCheck.status, themeCheck.stdout + themeCheck.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(themeFinal);
      expect(json(join(root, 'packages/example/package.json'))).toMatchObject({
        pi: { themes: ['./themes/soft-dark.json', './themes/soft-light.json'] },
        files: [
          'README.md',
          'skills/code-review',
          'skills/release-notes',
          'prompts/code-review.md',
          'prompts/release-notes.md',
          'themes/soft-dark.json',
          'themes/soft-light.json',
        ],
      });
      mkdirSync(join(root, 'packages/example/skills/code-review/scripts'));
      writeFileSync(
        join(root, 'packages/example/skills/code-review/scripts/helper.mjs'),
        'export const ready = true;\n',
      );
      const resourcePackOutput = JSON.parse(
        execFileSync(manager, ['pack', '--pack-destination', temporaryRoot, '--json'], {
          cwd: join(root, 'packages/example'),
          env,
          encoding: 'utf8',
          timeout: 60_000,
        }),
      ) as Array<{ files: Array<{ path: string }> }> | { files: Array<{ path: string }> };
      const resourceFiles = (
        Array.isArray(resourcePackOutput) ? resourcePackOutput[0] : resourcePackOutput
      ).files.map(({ path }) => path);
      expect(resourceFiles).toContain('skills/code-review/SKILL.md');
      expect(resourceFiles).toContain('skills/release-notes/SKILL.md');
      expect(resourceFiles).toContain('skills/code-review/scripts/helper.mjs');
      expect(resourceFiles).toContain('prompts/code-review.md');
      expect(resourceFiles).toContain('prompts/release-notes.md');
      expect(resourceFiles).toContain('themes/soft-dark.json');
      expect(resourceFiles).toContain('themes/soft-light.json');
      expect(resourceFiles).toContain('README.md');

      // Nx owns the library's TypeScript project/build setup; nx-pi owns its
      // package identity and explicit source-validation opt-in marker.
      const libraryBefore = authoredFiles(root);
      const libraryArgs = ['shared', '--packageVersion=1.2.3'];
      const libraryPreview = generate(root, [...libraryArgs, '--dry-run'], 'library');
      expect(libraryPreview.status, libraryPreview.stdout + libraryPreview.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(libraryBefore);
      const libraryCreated = generate(root, libraryArgs, 'library', {
        ...env,
        pnpm_config_ignore_scripts: 'true',
      });
      expect(libraryCreated.status, libraryCreated.stdout + libraryCreated.stderr).toBe(0);
      const libraryManifest = json(join(root, 'packages/shared/package.json'));
      expect(libraryManifest).toMatchObject({
        name: '@terminal/pi-shared',
        version: '1.2.3',
        license: 'MIT',
      });
      expect(libraryManifest).not.toHaveProperty('pi');
      expect(json(join(root, 'packages/shared/project.json')).tags).toContain('nx-pi:library');
      const showLibrary = spawnSync(
        process.execPath,
        [cli[0], 'show', 'project', 'shared', '--json'],
        { cwd: root, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(showLibrary.status, showLibrary.stdout + showLibrary.stderr).toBe(0);
      const targets = (JSON.parse(showLibrary.stdout) as { targets: Record<string, unknown> })
        .targets;
      expect(targets).toHaveProperty('build');
      expect(targets).toHaveProperty('pi-check');
      expect(targets).toHaveProperty('nx-release-publish');
      const libraryBuilt = spawnSync(process.execPath, [cli[0], 'run', 'shared:build'], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(libraryBuilt.status, libraryBuilt.stdout + libraryBuilt.stderr).toBe(0);
      const libraryPackOutput = JSON.parse(
        execFileSync(manager, ['pack', '--pack-destination', temporaryRoot, '--json'], {
          cwd: join(root, 'packages/shared'),
          env,
          encoding: 'utf8',
          timeout: 60_000,
        }),
      ) as
        | Array<{ filename: string; files: Array<{ path: string }> }>
        | { filename: string; files: Array<{ path: string }> };
      const libraryTarball = Array.isArray(libraryPackOutput)
        ? libraryPackOutput[0]
        : libraryPackOutput;
      expect(libraryTarball.files.map(({ path }) => path)).toContain('dist/index.js');
      expect(libraryTarball.files.map(({ path }) => path)).toContain('dist/index.d.ts');
      const isolated = join(temporaryRoot, `isolated-${manager}`);
      mkdirSync(isolated);
      save(join(isolated, 'package.json'), {
        name: 'isolated-lib-consumer',
        private: true,
        dependencies: {
          '@terminal/pi-shared': `file:${isAbsolute(libraryTarball.filename) ? libraryTarball.filename : join(temporaryRoot, libraryTarball.filename)}`,
        },
        devDependencies: { typescript: '6.0.3' },
      });
      execFileSync(
        manager,
        manager === 'npm'
          ? ['install', '--ignore-scripts', '--no-audit', '--no-fund']
          : ['install', '--ignore-scripts'],
        { cwd: isolated, env, encoding: 'utf8', timeout: 120_000 },
      );
      const imported = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import { shared } from '@terminal/pi-shared'; if (shared() !== 'shared') process.exit(1);",
        ],
        { cwd: isolated, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(imported.status, imported.stdout + imported.stderr).toBe(0);
      writeFileSync(
        join(isolated, 'consumer.mts'),
        "import { shared } from '@terminal/pi-shared';\nexport const result: string = shared();\n",
      );
      const typed = spawnSync(
        process.execPath,
        [
          join(isolated, 'node_modules/typescript/bin/tsc'),
          '--noEmit',
          '--module',
          'nodenext',
          '--moduleResolution',
          'nodenext',
          '--target',
          'es2022',
          'consumer.mts',
        ],
        { cwd: isolated, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(typed.status, typed.stdout + typed.stderr).toBe(0);
      expect(authoredFiles(root)).not.toEqual(libraryBefore); // generated project and build output
      const libraryAfter = authoredFiles(root);
      const releaseVersion = spawnSync(
        process.execPath,
        [
          cli[0],
          'release',
          'version',
          '1.2.4',
          '--projects=shared',
          '--dry-run',
          '--first-release',
          '--no-git-commit',
          '--no-git-tag',
          '--no-stage-changes',
        ],
        { cwd: root, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(releaseVersion.status, releaseVersion.stdout + releaseVersion.stderr).toBe(0);
      expect(releaseVersion.stdout + releaseVersion.stderr).toMatch(/pi-shared|shared/);
      const releasePublish = spawnSync(
        process.execPath,
        [cli[0], 'release', 'publish', '--projects=shared', '--dry-run', '--first-release'],
        { cwd: root, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(releasePublish.status, releasePublish.stdout + releasePublish.stderr).toBe(0);
      expect(releasePublish.stdout + releasePublish.stderr).toMatch(/pi-shared|shared/);
      expect(authoredFiles(root)).toEqual(libraryAfter);
      const repeatedLibrary = generate(root, libraryArgs, 'library');
      expect(repeatedLibrary.status, repeatedLibrary.stdout + repeatedLibrary.stderr).not.toBe(0);
      expect(authoredFiles(root)).toEqual(libraryAfter);
      const optedLint = generate(
        root,
        ['linted', '--packageVersion=1.0.0', '--linter=oxlint', '--strict=false'],
        'library',
        { ...env, pnpm_config_ignore_scripts: 'true' },
      );
      expect(optedLint.status, optedLint.stdout + optedLint.stderr).toBe(0);
      const lintResult = spawnSync(process.execPath, [cli[0], 'run', 'linted:lint'], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(lintResult.status, lintResult.stdout + lintResult.stderr).toBe(0);
      const optedTests = generate(
        root,
        ['tested', '--packageVersion=1.0.0', '--unitTestRunner=vitest', '--formatter=oxfmt'],
        'library',
        { ...env, pnpm_config_ignore_scripts: 'true' },
      );
      expect(optedTests.status, optedTests.stdout + optedTests.stderr).toBe(0);
      const testResult = spawnSync(process.execPath, [cli[0], 'run', 'tested:test'], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 90_000,
      });
      expect(testResult.status, testResult.stdout + testResult.stderr).toBe(0);
      expect(json(join(root, 'package.json')).devDependencies).toHaveProperty('oxfmt');

      // Exercise the packed plugin's Nx inference and executor, not only its
      // source functions. All authored fixture state is captured after setup.
      for (const name of ['resource', 'library', 'other', 'pi-named']) {
        mkdirSync(join(root, 'packages', name, 'src'), { recursive: true });
        save(join(root, 'packages', name, 'package.json'), {
          name: `@terminal/${name}`,
          ...(name === 'resource' ? { pi: { extensions: ['./src/entry.ts'] } } : {}),
        });
        save(join(root, 'packages', name, 'project.json'), {
          name,
          ...(name === 'library' ? { tags: ['nx-pi:library'] } : {}),
        });
      }
      writeFileSync(
        join(root, 'packages/resource/src/entry.ts'),
        'throw new Error("not executed");\n',
      );
      const runNx = (...args: string[]) =>
        spawnSync(process.execPath, [cli[0], ...args], {
          cwd: root,
          env,
          encoding: 'utf8',
          timeout: 60_000,
        });
      const show = (name: string) => {
        const result = runNx('show', 'project', name, '--json');
        expect(result.status, result.stdout + result.stderr).toBe(0);
        return JSON.parse(result.stdout) as { targets: Record<string, unknown> };
      };
      const beforeChecks = authoredFiles(root);
      for (const name of ['resource', 'library']) {
        expect(show(name).targets).toHaveProperty('pi-check');
        expect(show(name).targets).not.toHaveProperty('pi-check-package');
        const check = runNx('run', `${name}:pi-check`);
        expect(check.status, check.stdout + check.stderr).toBe(0);
      }
      for (const name of ['other', 'pi-named'])
        expect(show(name).targets).not.toHaveProperty('pi-check');
      expect(authoredFiles(root)).toEqual(beforeChecks);

      const missingManifest = {
        name: '@terminal/resource',
        pi: { extensions: ['./src/missing.ts'] },
      };
      save(join(root, 'packages/resource/package.json'), missingManifest);
      const missingSnapshot = authoredFiles(root);
      const missing = runNx('run', 'resource:pi-check');
      expect(missing.status, missing.stdout + missing.stderr).not.toBe(0);
      expect(missing.stdout + missing.stderr).toMatch(/resource.*extensions.*src\/missing\.ts/);
      expect(authoredFiles(root)).toEqual(missingSnapshot);

      save(join(root, 'packages/resource/project.json'), {
        name: 'resource',
        targets: { 'pi-check': { command: 'echo existing' } },
      });
      const beforeCollision = authoredFiles(root);
      const targetCollision = runNx('show', 'project', 'resource', '--json');
      expect(targetCollision.status, targetCollision.stdout + targetCollision.stderr).not.toBe(0);
      expect(targetCollision.stdout + targetCollision.stderr).toMatch(
        /resource.*already defines target.*pi-check.*project\.json/,
      );
      expect(authoredFiles(root)).toEqual(beforeCollision);
      save(join(root, 'packages/resource/project.json'), { name: 'resource' });

      const configuredNx = json(join(root, 'nx.json'));
      configuredNx.plugins = [{ plugin, options: { sourceTargetName: 'validate-pi' } }];
      save(join(root, 'nx.json'), configuredNx);
      const beforeConfiguredCheck = authoredFiles(root);
      expect(show('resource').targets).toHaveProperty('validate-pi');
      expect(show('resource').targets).not.toHaveProperty('pi-check');
      const configuredFailure = runNx('run', 'resource:validate-pi');
      expect(
        configuredFailure.status,
        configuredFailure.stdout + configuredFailure.stderr,
      ).not.toBe(0);
      expect(configuredFailure.stdout + configuredFailure.stderr).toMatch(
        /resource.*extensions.*src\/missing\.ts/,
      );
      expect(authoredFiles(root)).toEqual(beforeConfiguredCheck);
      save(join(root, 'packages/resource/package.json'), { name: '@terminal/resource', pi: null });
      expect(show('resource').targets).toHaveProperty('validate-pi');
      const malformed = runNx('run', 'resource:validate-pi');
      expect(malformed.status, malformed.stdout + malformed.stderr).not.toBe(0);
      expect(malformed.stdout + malformed.stderr).toMatch(/resource.*pi.*object/);
      save(join(root, 'packages/resource/package.json'), missingManifest);
      writeFileSync(join(root, 'packages/resource/src/missing.ts'), 'export {};\n');
      const restored = runNx('run', 'resource:validate-pi');
      expect(restored.status, restored.stdout + restored.stderr).toBe(0);

      mkdirSync(join(root, 'packages/resource/src/nested'), { recursive: true });
      writeFileSync(
        join(root, 'packages/resource/src/nested/skipped.ts'),
        'throw new Error("not executed");\n',
      );
      save(join(root, 'packages/resource/package.json'), {
        name: '@terminal/resource',
        pi: { extensions: ['!./src/nested/*.ts', './src/**/*.ts'] },
      });
      const beforeGlob = authoredFiles(root);
      const globbed = runNx('run', 'resource:validate-pi');
      expect(globbed.status, globbed.stdout + globbed.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(beforeGlob);

      save(join(root, 'packages/resource/package.json'), {
        name: '@terminal/resource',
        pi: { extensions: ['./src/absent-*.ts'] },
      });
      const beforeMissingGlob = authoredFiles(root);
      const noMatch = runNx('run', 'resource:validate-pi');
      expect(noMatch.status, noMatch.stdout + noMatch.stderr).not.toBe(0);
      expect(noMatch.stdout + noMatch.stderr).toMatch(/resource.*extensions.*absent-\*\.ts.*match/);
      expect(authoredFiles(root)).toEqual(beforeMissingGlob);
    },
    180_000,
  );

  it.each(['npm', 'pnpm'])(
    '%s: initializes a real create-nx-workspace fixture through nx add',
    (manager) => {
      const name = `generated-${manager}`;
      const root = join(temporaryRoot, name);
      const scratch = join(temporaryRoot, 'generator-tmp');
      mkdirSync(scratch);
      const creationEnv = {
        ...env,
        TMPDIR: scratch,
        TMP: scratch,
        TEMP: scratch,
        npm_config_ignore_scripts: 'true',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
      };
      const created = spawnSync(
        process.execPath,
        [
          createNxWorkspace,
          name,
          '--preset=apps',
          `--packageManager=${manager}`,
          '--interactive=false',
          '--nxCloud=skip',
          '--analytics=false',
          '--aiAgents=none',
          '--formatter=none',
          '--linter=none',
          '--skipGit',
          '--skipGitHubPush',
        ],
        { cwd: temporaryRoot, env: creationEnv, encoding: 'utf8', timeout: 180_000 },
      );
      expect(created.status, created.stdout + created.stderr).toBe(0);
      expect(json(join(root, 'node_modules/nx/package.json')).version).toBe(NX_VERSION);
      const originalManifest = json(join(root, 'package.json'));
      expect(originalManifest.name).toMatch(/^@[^/]+\/[^/]+$/);
      const originalNx = json(join(root, 'nx.json'));
      const originalPlugins = Array.isArray(originalNx.plugins) ? originalNx.plugins : [];

      // nx add is intentionally an installation plus initialization operation.
      // Its manifest/lockfile changes must not be attributed to init alone.
      const added = spawnSync(
        process.execPath,
        [join(root, 'node_modules/nx/dist/bin/nx.js'), 'add', `${plugin}@file:${tarball}`],
        { cwd: root, env: creationEnv, encoding: 'utf8', timeout: 120_000 },
      );
      expect(added.status, added.stdout + added.stderr).toBe(0);
      expect(json(join(root, 'nx.json'))).toEqual({
        ...originalNx,
        plugins: [...originalPlugins, plugin],
      });
      const installedManifest = json(join(root, 'package.json'));
      // The package manager may prune empty dependency maps during nx add.
      // Assert metadata/required dependencies here; exact preservation is tested
      // below for init alone, with installation already complete.
      for (const field of ['name', 'version', 'license', 'private']) {
        expect(installedManifest[field]).toEqual(originalManifest[field]);
      }
      expect(installedManifest.devDependencies).toMatchObject(
        originalManifest.devDependencies as Record<string, unknown>,
      );
      expect(installedManifest.devDependencies).toHaveProperty(plugin);

      const before = authoredFiles(root);
      const repeated = generate(root, []);
      expect(repeated.status, repeated.stdout + repeated.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(before);

      expect(installedManifest).not.toHaveProperty('homepage');
      const args = ['--homepage=https://example.com/generated-workspace'];
      const preview = generate(root, [...args, '--dry-run']);
      expect(preview.status, preview.stdout + preview.stderr).toBe(0);
      expect(authoredFiles(root)).toEqual(before);
      const applied = generate(root, args);
      expect(applied.status, applied.stdout + applied.stderr).toBe(0);
      expect(json(join(root, 'package.json'))).toEqual({
        ...installedManifest,
        homepage: 'https://example.com/generated-workspace',
      });
      const after = authoredFiles(root);
      expect(Object.keys(after)).toEqual(Object.keys(before));
      for (const path of Object.keys(before)) {
        if (path !== 'package.json') expect(after[path]).toBe(before[path]);
      }
      const conflict = generate(root, [
        '--name=@different/workspace',
        '--bugs=https://example.com/issues',
      ]);
      expect(conflict.status, conflict.stdout + conflict.stderr).not.toBe(0);
      expect(conflict.stdout + conflict.stderr).toMatch(/name.*conflict/);
      expect(authoredFiles(root)).toEqual(after);

      // Exercise package creation in the actual create-nx-workspace fixture too.
      // Supply missing license through init, not by editing the fixture metadata.
      if (!installedManifest.license) {
        const licensed = generate(root, ['--license=MIT']);
        expect(licensed.status, licensed.stdout + licensed.stderr).toBe(0);
      }
      const beforePackage = authoredFiles(root);
      const createdPackage = generate(root, ['example', '--packageVersion=1.0.0'], 'package');
      expect(createdPackage.status, createdPackage.stdout + createdPackage.stderr).toBe(0);
      const scope = (installedManifest.name as string).split('/')[0];
      expect(json(join(root, 'packages/example/package.json'))).toMatchObject({
        name: `${scope}/pi-example`,
        version: '1.0.0',
        pi: {},
      });
      expect(Object.keys(authoredFiles(root)).filter((path) => !(path in beforePackage))).toEqual([
        'packages/example/package.json',
      ]);
      const generatedSkill = generate(
        root,
        ['code-review', `--project=${scope}/pi-example`],
        'skill',
      );
      expect(generatedSkill.status, generatedSkill.stdout + generatedSkill.stderr).toBe(0);
      expect(
        readFileSync(join(root, 'packages/example/skills/code-review/SKILL.md'), 'utf8'),
      ).toContain('TODO: Replace this scaffold with instructions');
      expect(json(join(root, 'packages/example/package.json')).pi).toEqual({
        skills: ['./skills/code-review'],
      });
      const generatedPrompt = generate(
        root,
        ['code-review', `--project=${scope}/pi-example`],
        'prompt',
      );
      expect(generatedPrompt.status, generatedPrompt.stdout + generatedPrompt.stderr).toBe(0);
      expect(readFileSync(join(root, 'packages/example/prompts/code-review.md'), 'utf8')).toContain(
        'TODO: Replace this scaffold with prompt text',
      );
      expect(json(join(root, 'packages/example/package.json')).pi).toEqual({
        skills: ['./skills/code-review'],
        prompts: ['./prompts/code-review.md'],
      });
      const generatedTheme = generate(
        root,
        ['soft-dark', `--project=${scope}/pi-example`],
        'theme',
      );
      expect(generatedTheme.status, generatedTheme.stdout + generatedTheme.stderr).toBe(0);
      expect(json(join(root, 'packages/example/themes/soft-dark.json')).name).toBe('soft-dark');
      expect(json(join(root, 'packages/example/package.json')).pi).toEqual({
        skills: ['./skills/code-review'],
        prompts: ['./prompts/code-review.md'],
        themes: ['./themes/soft-dark.json'],
      });

      // The real apps preset may use a different TypeScript layout from the
      // minimal fixture; let Nx JS integrate with the existing workspace.
      const beforeLibrary = authoredFiles(root);
      const library = generate(root, ['shared', '--packageVersion=1.0.0'], 'library', {
        ...creationEnv,
        pnpm_config_ignore_scripts: 'true',
      });
      expect(library.status, library.stdout + library.stderr).toBe(0);
      expect(json(join(root, 'packages/shared/package.json'))).toMatchObject({
        name: `${scope}/pi-shared`,
        version: '1.0.0',
      });
      expect(json(join(root, 'packages/shared/project.json')).tags).toContain('nx-pi:library');
      const afterLibrary = authoredFiles(root);
      for (const path of Object.keys(beforeLibrary)) {
        if (
          ![
            'package.json',
            'package-lock.json',
            'pnpm-lock.yaml',
            'nx.json',
            'tsconfig.json',
            'tsconfig.base.json',
          ].includes(path)
        ) {
          expect(afterLibrary[path]).toBe(beforeLibrary[path]);
        }
      }
      const built = spawnSync(
        process.execPath,
        [join(root, 'node_modules/nx/dist/bin/nx.js'), 'run', 'shared:build'],
        { cwd: root, env: creationEnv, encoding: 'utf8', timeout: 90_000 },
      );
      expect(built.status, built.stdout + built.stderr).toBe(0);
    },
    300_000,
  );
});
