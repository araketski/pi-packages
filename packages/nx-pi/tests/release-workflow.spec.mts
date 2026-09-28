import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// @mara implements VER-RELEASE-PROTECTED-PUBLICATION
it('gates public Nx publication on a verified main-branch changelog commit and approval', () => {
  const workflow = readFileSync(
    resolve(import.meta.dirname, '../../../.github/workflows/release.yml'),
    'utf8',
  );
  expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
  expect(workflow).toMatch(/paths:\s*\n\s*- CHANGELOG\.md/);
  expect(workflow).toMatch(/RELEASE_SHA: \$\{\{ github\.sha \}\}/);
  expect(workflow).toMatch(/node tools\/release\/identity\.mjs/);
  expect(workflow).toMatch(/pnpm nx run-many -t build test lint typecheck/);
  expect(workflow).toMatch(/pnpm nx run-many -t pi-check/);
  expect(workflow).toMatch(/pi-check-package/);
  const jobs = workflow.split(/^  [\w-]+:\s*$/m);
  const publish = jobs.find((job) => /environment: release/.test(job));
  expect(publish).toBeDefined();
  expect(publish).toMatch(/needs: \[prepare, verify\]/);
  expect(publish).toMatch(/node tools\/release\/identity\.mjs/);
  expect(publish).toMatch(/pnpm nx release publish/);
  expect(publish).toMatch(/id-token: write/);
  expect(workflow.match(/pnpm nx release publish/g)).toHaveLength(1);
});
