import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it('loads the extension and its helpers through the Pi 0.87.1 resource loader', async () => {
  const agentDir = mkdtempSync(join(tmpdir(), 'statusline-loader-'));
  roots.push(agentDir);
  const packageRoot = resolve(import.meta.dirname, '..');
  writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [packageRoot] }));
  const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir });
  await loader.reload();
  const { errors, extensions } = loader.getExtensions();
  expect(errors).toEqual([]);
  expect(extensions.some((extension) => extension.path.endsWith('/extensions/statusline/index.ts'))).toBe(true);
});
