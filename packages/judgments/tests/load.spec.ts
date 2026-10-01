import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// @mara implements VER-JUDGMENTS-CONTRACT
it('loads the source tools and skill and runs native Pi classification against an offline provider', () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, 'runtime-smoke.mjs'),
      resolve(
        import.meta.dirname,
        '../../../node_modules/@earendil-works/pi-coding-agent/dist/index.js',
      ),
      resolve(import.meta.dirname, '..'),
    ],
    { env: { ...process.env, PI_OFFLINE: '1' }, encoding: 'utf8', timeout: 60_000 },
  );
  expect(result.status, result.stdout + result.stderr || String(result.error)).toBe(0);
}, 65_000);
