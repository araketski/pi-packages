import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// @mara implements VER-CI-MAIN-COVERAGE
it('runs regular checks for main pushes and every pull request without publishing', () => {
  const workflow = readFileSync(
    resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
    'utf8',
  );

  expect(workflow).toMatch(/^  push:\n    branches:\n      - main$/m);
  expect(workflow).toMatch(/^  pull_request:\s*$/m);
  expect(workflow).not.toMatch(/^\s+paths(?:-ignore)?:/m);
  expect(workflow).toContain("node: ['24.19.0', '26.7.0']");
  expect(workflow).toContain('pnpm install --frozen-lockfile');
  for (const command of [
    'pnpm nx format:check --all',
    'pnpm nx sync:check',
    'pnpm nx run-many -t build test lint typecheck',
    'pnpm nx run-many -t pi-check',
  ]) {
    expect(workflow).toContain(command);
  }
  expect(workflow).toMatch(/permissions:\s*\n\s+actions: read\s*\n\s+contents: read/);
  expect(workflow).not.toMatch(
    /(?:environment: release|id-token: write|contents: write|nx release publish)/,
  );
});
