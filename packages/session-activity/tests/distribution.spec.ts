import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

// @mara implements VER-SESSION-ACTIVITY-CONTRACT
// @mara implements VER-SESSION-ACTIVITY-PUBLISHER
it('packs only consumer resources and runs the independently installed extension in native Pi', () => {
  const dir = mkdtempSync(join(tmpdir(), 'activity-packed-consumer-'));
  const workspace = resolve(import.meta.dirname, '../../..');
  try {
    const pack = JSON.parse(
      execFileSync(
        'pnpm',
        ['-C', resolve(import.meta.dirname, '..'), 'pack', '--pack-destination', dir, '--json'],
        { cwd: workspace, encoding: 'utf8', timeout: 60000 },
      ),
    ) as { filename: string; files: { path: string }[] };
    const paths = pack.files.map(({ path }) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'LICENSE',
        'README.md',
        'extensions/session-activity/index.ts',
        'extensions/session-activity/publisher.ts',
        'extensions/session-activity/coordinator.ts',
        'extensions/session-activity/config.ts',
        'extensions/session-activity/digest.ts',
        'extensions/session-activity/summary.ts',
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
      [
        'nx',
        'run',
        '@araketski/pi-session-activity:pi-check-package',
        `--tarball=${pack.filename}`,
      ],
      {
        cwd: workspace,
        env: { ...process.env, NX_DAEMON: 'false', NX_PREFER_NODE_STRIP_TYPES: 'false' },
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    expect(check.status, check.stdout + check.stderr || String(check.error)).toBe(0);
    const consumer = join(dir, 'consumer');
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'session-activity-consumer', private: true }),
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
      { cwd: consumer, encoding: 'utf8', timeout: 120000 },
    );
    expect(install.status, install.stdout + install.stderr || String(install.error)).toBe(0);
    const smoke = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, 'runtime-smoke.mjs'),
        join(consumer, 'node_modules/@earendil-works/pi-coding-agent/dist/index.js'),
        join(consumer, 'node_modules/@araketski/pi-session-activity'),
      ],
      { cwd: consumer, env: { ...process.env, PI_OFFLINE: '1' }, encoding: 'utf8', timeout: 90000 },
    );
    expect(smoke.status, smoke.stdout + smoke.stderr || String(smoke.error)).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 240000);
