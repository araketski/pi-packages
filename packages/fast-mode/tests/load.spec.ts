import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';

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
