import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';

// @mara implements VER-QUESTIONS-LOADING
it('loads the source entrypoint in an isolated agent directory', async () => {
  const agentDir = mkdtempSync(join(tmpdir(), 'questions-load-'));
  try {
    const root = resolve(import.meta.dirname, '..');
    writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [root] }));
    const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir });
    await loader.reload();
    const resources = loader.getExtensions();
    expect(resources.errors).toEqual([]);
    expect(resources.extensions.map((extension) => extension.path)).toEqual([
      join(root, 'extensions/ask-questions/index.ts'),
    ]);
    const tools = [...resources.extensions[0].tools.values()].map((tool) => tool.definition);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: 'ask_questions',
      exposure: 'model-only',
      executionMode: 'sequential',
    });
    expect(tools[0].parameters).toBeTruthy();
    expect(tools[0].outputSchema).toBeTruthy();
    expect(tools[0].promptSnippet).toBeTruthy();
    expect(tools[0].promptGuidelines?.join(' ')).toContain('recommendedOption');
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});
