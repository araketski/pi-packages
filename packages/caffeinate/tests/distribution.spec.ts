import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';

const workspace = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(import.meta.dirname, '..');

it('checks a fresh archive and loads its no-op resources in independent npm and pnpm consumers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caffeinate-packed-'));
  try {
    const pack = JSON.parse(
      execFileSync(
        'pnpm',
        [
          '-C',
          packageRoot,
          'pack',
          '--pack-destination',
          process.env.CAFFEINATE_TEST_PACK_DIR ?? dir,
          '--json',
        ],
        { cwd: workspace, encoding: 'utf8', timeout: 60_000 },
      ),
    ) as {
      filename: string;
      files: { path: string }[];
    };
    const archiveSha256 = createHash('sha256').update(readFileSync(pack.filename)).digest('hex');
    console.log(JSON.stringify({ archive: pack.filename, archiveSha256 }));
    expect(pack.files.map(({ path }) => path).sort()).toEqual([
      'LICENSE',
      'README.md',
      'extensions/caffeinate/index.ts',
      'package.json',
    ]);
    const packed = spawnSync(
      'pnpm',
      ['nx', 'run', '@araketski/pi-caffeinate:pi-check-package', `--tarball=${pack.filename}`],
      { cwd: workspace, env: process.env, encoding: 'utf8', timeout: 60_000 },
    );
    expect(packed.status, packed.stdout + packed.stderr || String(packed.error)).toBe(0);

    const consumers: unknown[] = [];
    for (const manager of ['npm', 'pnpm'] as const) {
      const consumer = join(dir, manager);
      const home = join(consumer, 'home');
      mkdirSync(home, { recursive: true });
      writeFileSync(
        join(consumer, 'package.json'),
        JSON.stringify({
          name: `caffeinate-${manager}-consumer`,
          private: true,
          type: 'module',
          dependencies: {
            '@araketski/pi-caffeinate': `file:${pack.filename}`,
            '@earendil-works/pi-coding-agent': '0.99.1',
          },
        }),
      );
      const env = {
        PATH: process.env.PATH,
        HOME: home,
        TMPDIR: process.env.TMPDIR,
        PI_OFFLINE: '1',
        PI_SESSION_ID: process.env.PI_SESSION_ID,
        npm_config_cache: join(process.env.PI_TEST_PACKAGE_CACHE ?? dir, 'npm-cache'),
        npm_config_store_dir: join(process.env.PI_TEST_PACKAGE_CACHE ?? dir, 'pnpm-store'),
      };
      const install = spawnSync(
        manager,
        manager === 'npm'
          ? ['install', '--ignore-scripts', '--no-audit', '--no-fund']
          : ['install', '--ignore-scripts'],
        {
          cwd: consumer,
          env,
          encoding: 'utf8',
          timeout: 180_000,
        },
      );
      expect(install.status, install.stdout + install.stderr || String(install.error)).toBe(0);
      const installed = realpathSync(join(consumer, 'node_modules/@araketski/pi-caffeinate'));
      const sdk = realpathSync(
        join(consumer, 'node_modules/@earendil-works/pi-coding-agent/dist/index.js'),
      );
      expect(installed.startsWith(consumer + sep)).toBe(true);
      expect(sdk.startsWith(consumer + sep)).toBe(true);
      const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
      expect(manifest.peerDependencies['@earendil-works/pi-coding-agent']).toBe('*');
      expect(manifest.dependencies).toBeUndefined();
      expect(manifest.exports).toEqual({ './package.json': './package.json' });
      const resolver = createRequire(join(consumer, 'package.json'));
      expect(realpathSync(resolver.resolve('@araketski/pi-caffeinate/package.json'))).toBe(
        join(installed, 'package.json'),
      );
      expect(() => resolver.resolve('@araketski/pi-caffeinate')).toThrow();
      expect(readFileSync(join(installed, 'extensions/caffeinate/index.ts'), 'utf8')).toBe(
        readFileSync(join(packageRoot, 'extensions/caffeinate/index.ts'), 'utf8'),
      );
      const smoke = spawnSync(
        process.execPath,
        [join(import.meta.dirname, 'runtime-smoke.mjs'), sdk, installed],
        { cwd: consumer, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(smoke.status, smoke.stdout + smoke.stderr || String(smoke.error)).toBe(0);
      const result = JSON.parse(smoke.stdout.trim());
      expect(result.piVersion).toBe('0.99.1');
      expect(result.packageRoot).toBe(installed);
      consumers.push({ manager, ...result });
      console.log(`${manager}: ${smoke.stdout.trim()}`);
    }
    if (process.env.CAFFEINATE_TEST_PACK_DIR) {
      writeFileSync(
        join(process.env.CAFFEINATE_TEST_PACK_DIR, 'consumer-receipts.json'),
        JSON.stringify({ archive: pack.filename, archiveSha256, consumers }, null, 2),
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 480_000);
