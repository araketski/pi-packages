import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';

it('does not borrow an in-flight same-ID selection in the native Pi 0.99.1 pipeline', () => {
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

it('loads the source extension through the Pi 0.99.1 resource loader', async () => {
  const agentDir = mkdtempSync(join(tmpdir(), 'fast-mode-loader-'));
  try {
    const packageRoot = resolve(import.meta.dirname, '..');
    writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [packageRoot] }));
    const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir });
    await loader.reload();
    const { errors, extensions } = loader.getExtensions();
    expect(errors).toEqual([]);
    expect(
      extensions.some(
        (extension) =>
          extension.path.endsWith('/extensions/fast-mode/index.ts') &&
          extension.commands.has('fast'),
      ),
    ).toBe(true);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});
