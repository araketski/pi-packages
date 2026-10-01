import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';

// @mara checks REQ-SESSION-ACTIVITY-ISOLATION
it('loads the source extension without commands or tools', async () => {
  const agentDir = mkdtempSync(join(tmpdir(), 'session-activity-loader-'));
  try {
    const root = resolve(import.meta.dirname, '..');
    writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [root] }));
    const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir });
    await loader.reload();
    const resources = loader.getExtensions();
    expect(resources.errors).toEqual([]);
    const extension = resources.extensions.find(
      (ext) => ext.path === join(root, 'extensions/session-activity/index.ts'),
    );
    expect(extension).toBeDefined();
    expect(extension?.commands.size).toBe(0);
    expect(extension?.tools.size).toBe(0);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

// @mara implements VER-SESSION-ACTIVITY-CONTRACT
it('reports only in the native Pi 0.99.1 TUI lifecycle with offline providers', () => {
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
    { env: { ...process.env, PI_OFFLINE: '1' }, encoding: 'utf8', timeout: 90000 },
  );
  expect(result.status, result.stdout + result.stderr || String(result.error)).toBe(0);
}, 95000);
