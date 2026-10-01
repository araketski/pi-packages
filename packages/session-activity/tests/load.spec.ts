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
