import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';

// @mara implements VER-SESSION-NAME-CONFORMANCE
it('loads the source extension without any added commands or tools', async () => {
  const agentDir = mkdtempSync(join(tmpdir(), 'session-name-loader-'));
  try {
    const root = resolve(import.meta.dirname, '..');
    writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [root] }));
    const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir });
    await loader.reload();
    const resources = loader.getExtensions();
    expect(resources.errors).toEqual([]);
    const extension = resources.extensions.find(
      (ext) => ext.path === join(root, 'extensions/session-name/index.ts'),
    );
    expect(extension).toBeDefined();
    expect(extension?.commands.size).toBe(0);
    expect(extension?.tools.size).toBe(0);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

it('names sessions in the native Pi 0.99.1 lifecycle with offline HTTP providers', () => {
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
