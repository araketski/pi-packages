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

function generate(root: string, args: string[], generator = 'init') {
  return spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/nx/dist/bin/nx.js'),
      'generate',
      `${plugin}:${generator}`,
      '--no-interactive',
      ...args,
    ],
    { cwd: root, env, encoding: 'utf8', timeout: 60_000 },
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
describe('packed init in independent consumers', () => {
  it.each(['npm', 'pnpm'])(
    '%s: explicit and interactive init preserve dry-run, cancellation, and reruns',
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
        devDependencies: { nx: NX_VERSION, [plugin]: `file:${tarball}` },
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
    },
    300_000,
  );
});
