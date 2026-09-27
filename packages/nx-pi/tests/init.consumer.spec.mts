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

function generate(root: string, args: string[]) {
  return spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/nx/dist/bin/nx.js'),
      'generate',
      `${plugin}:init`,
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
// @mara checks REQ-NXPI-PUBLIC-PLUGIN
// @mara checks REQ-NXPI-INFRASTRUCTURE-NEUTRAL
describe('packed init in independent consumers', () => {
  it.each(['npm', 'pnpm'])(
    '%s: discovers init, preserves dry-run, and reruns without authored changes',
    (manager) => {
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
    },
    300_000,
  );
});
