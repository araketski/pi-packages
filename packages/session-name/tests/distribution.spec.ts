import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

// @mara implements VER-SESSION-NAME-CONFORMANCE
it('checks and loads an independently installed packed extension with its local helpers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-name-consumer-'));
  const workspace = resolve(import.meta.dirname, '../../..');
  try {
    const pack = JSON.parse(
      execFileSync(
        'pnpm',
        ['-C', resolve(import.meta.dirname, '..'), 'pack', '--pack-destination', dir, '--json'],
        { cwd: workspace, encoding: 'utf8', timeout: 60_000 },
      ),
    ) as { filename: string; files: { path: string }[] };
    const paths = pack.files.map(({ path }) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'LICENSE',
        'README.md',
        'extensions/session-name/index.ts',
        'extensions/session-name/config.ts',
        'extensions/session-name/naming.ts',
      ]),
    );
    expect(
      paths.some(
        (path) =>
          path.includes('tests/') ||
          path.endsWith('.mara.md') ||
          path.includes('tsconfig') ||
          path.includes('vitest'),
      ),
    ).toBe(false);
    const check = spawnSync(
      'pnpm',
      ['nx', 'run', '@araketski/pi-session-name:pi-check-package', `--tarball=${pack.filename}`],
      {
        cwd: workspace,
        env: { ...process.env, NX_DAEMON: 'false', NX_PREFER_NODE_STRIP_TYPES: 'false' },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    expect(check.status, check.stdout + check.stderr || String(check.error)).toBe(0);
    const consumer = join(dir, 'consumer');
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'session-name-test-consumer', private: true }),
    );
    const install = spawnSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        pack.filename,
        '@earendil-works/pi-coding-agent@0.99.1',
      ],
      { cwd: consumer, encoding: 'utf8', timeout: 120_000 },
    );
    expect(install.status, install.stdout + install.stderr || String(install.error)).toBe(0);
    const smoke = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, 'runtime-smoke.mjs'),
        join(consumer, 'node_modules/@earendil-works/pi-coding-agent/dist/index.js'),
        join(consumer, 'node_modules/@araketski/pi-session-name'),
      ],
      {
        cwd: consumer,
        env: { ...process.env, PI_OFFLINE: '1' },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    expect(smoke.status, smoke.stdout + smoke.stderr || String(smoke.error)).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 180_000);
