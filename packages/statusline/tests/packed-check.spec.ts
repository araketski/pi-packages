import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('validates and loads the packed statusline in an isolated Pi 0.99.1 consumer', () => {
  const destination = mkdtempSync(join(tmpdir(), 'statusline-packed-'));
  roots.push(destination);
  const packageRoot = resolve(import.meta.dirname, '..');
  const workspaceRoot = resolve(packageRoot, '../..');
  const pack = spawnSync(
    'pnpm',
    ['--dir', packageRoot, 'pack', '--pack-destination', destination],
    { encoding: 'utf8', timeout: 60_000 },
  );
  expect(pack.status, pack.stdout + pack.stderr).toBe(0);
  const tarball = join(destination, 'araketski-pi-statusline-0.1.0.tgz');
  const check = spawnSync(
    'pnpm',
    ['nx', 'run', '@araketski/pi-statusline:pi-check-package', `--tarball=${tarball}`],
    { cwd: workspaceRoot, encoding: 'utf8', timeout: 60_000 },
  );
  expect(check.status, check.stdout + check.stderr).toBe(0);

  const protocolPack = spawnSync(
    'pnpm',
    [
      '--dir',
      join(workspaceRoot, 'packages/statusline-protocol'),
      'pack',
      '--pack-destination',
      destination,
      '--json',
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  expect(protocolPack.status, protocolPack.stdout + protocolPack.stderr).toBe(0);
  const protocolTarball = (JSON.parse(protocolPack.stdout) as { filename: string }).filename;
  const consumer = join(destination, 'consumer');
  const agentDir = join(consumer, 'agent');
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'pi-statusline-consumer', private: true }),
  );
  writeFileSync(
    join(agentDir, 'settings.json'),
    JSON.stringify({ packages: ['../node_modules/@araketski/pi-statusline'] }),
  );
  const install = spawnSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      tarball,
      protocolTarball,
      '@earendil-works/pi-coding-agent@0.99.1',
      '@earendil-works/pi-tui@0.99.1',
    ],
    { cwd: consumer, encoding: 'utf8', timeout: 120_000 },
  );
  expect(install.status, install.stdout + install.stderr || String(install.error)).toBe(0);

  const smoke = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import { join } from 'node:path';
      import { pathToFileURL } from 'node:url';
      const root = process.cwd();
      const sdk = await import(pathToFileURL(join(root, 'node_modules/@earendil-works/pi-coding-agent/dist/index.js')).href);
      const loader = new sdk.DefaultResourceLoader({ cwd: root, agentDir: join(root, 'agent') });
      await loader.reload();
      const { errors, extensions } = loader.getExtensions();
      const installedRoot = join(root, 'node_modules/@araketski/pi-statusline');
      if (errors.length || !extensions.some(ext => ext.path.startsWith(installedRoot + '/') && ext.path.endsWith('/extensions/statusline/index.ts'))) {
        throw new Error('Packed statusline extension did not load from isolated consumer: ' + JSON.stringify(errors));
      }
    `,
    ],
    {
      cwd: consumer,
      env: { ...process.env, PI_OFFLINE: '1', PI_CODING_AGENT_DIR: agentDir },
      encoding: 'utf8',
      timeout: 60_000,
    },
  );
  expect(smoke.status, smoke.stdout + smoke.stderr || String(smoke.error)).toBe(0);
});
