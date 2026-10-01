import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

// @mara implements VER-JUDGMENTS-CONTRACT
it.each(['npm', 'pnpm'])(
  'loads and runs the packed tools and skill in an independent %s consumer',
  (manager) => {
    const dir = mkdtempSync(join(tmpdir(), 'judgments-consumer-'));
    const workspace = resolve(import.meta.dirname, '../../..');
    const env = {
      ...process.env,
      NX_DAEMON: 'false',
      NX_ISOLATE_PLUGINS: 'false',
      NX_PREFER_NODE_STRIP_TYPES: 'false',
      PI_OFFLINE: '1',
    };
    try {
      const pack = spawnSync(
        'pnpm',
        ['nx', 'pack', '@araketski/pi-judgments', `--packDestination=${dir}`],
        {
          cwd: workspace,
          env,
          encoding: 'utf8',
          timeout: 60_000,
        },
      );
      expect(pack.status, pack.stdout + pack.stderr || String(pack.error)).toBe(0);
      const archive = join(
        dir,
        readdirSync(dir).find((name) => name.endsWith('.tgz'))!,
      );
      const members = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n');
      expect(members).toEqual(
        expect.arrayContaining([
          'package/LICENSE',
          'package/README.md',
          'package/skills/judgments/SKILL.md',
          'package/extensions/judgments/index.ts',
          'package/extensions/judgments/native.ts',
          'package/extensions/judgments/definitions.ts',
          'package/extensions/judgments/loading.ts',
          'package/scenarios/mara-representation.json',
          'package/extensions/judgments/schemas.ts',
        ]),
      );
      expect(
        members.some(
          (path) =>
            path.includes('tests/') ||
            path.endsWith('.mara.md') ||
            path.includes('tsconfig') ||
            path.includes('vitest'),
        ),
      ).toBe(false);
      const check = spawnSync(
        'pnpm',
        ['nx', 'run', '@araketski/pi-judgments:pi-check-package', `--tarball=${archive}`],
        {
          cwd: workspace,
          env,
          encoding: 'utf8',
          timeout: 60_000,
        },
      );
      expect(check.status, check.stdout + check.stderr || String(check.error)).toBe(0);
      const consumer = join(dir, 'consumer');
      mkdirSync(consumer);
      writeFileSync(
        join(consumer, 'package.json'),
        JSON.stringify({ name: 'judgments-fixture', private: true }),
      );
      const args =
        manager === 'npm'
          ? [
              'install',
              '--ignore-scripts',
              '--no-audit',
              '--no-fund',
              '--no-package-lock',
              archive,
              '@earendil-works/pi-coding-agent@0.99.1',
            ]
          : ['add', '--ignore-scripts', archive, '@earendil-works/pi-coding-agent@0.99.1'];
      const install = spawnSync(manager, args, {
        cwd: consumer,
        env,
        encoding: 'utf8',
        timeout: 120_000,
      });
      expect(install.status, install.stdout + install.stderr || String(install.error)).toBe(0);
      const replay = spawnSync(
        process.execPath,
        [
          join(import.meta.dirname, 'runtime-smoke.mjs'),
          join(consumer, 'node_modules/@earendil-works/pi-coding-agent/dist/index.js'),
          join(consumer, 'node_modules/@araketski/pi-judgments'),
        ],
        { cwd: consumer, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(replay.status, replay.stdout + replay.stderr || String(replay.error)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  240_000,
);
