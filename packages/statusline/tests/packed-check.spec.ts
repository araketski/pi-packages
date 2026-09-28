import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('validates the packed statusline through the workspace nx-pi executor', () => {
  const destination = mkdtempSync(join(tmpdir(), 'statusline-packed-'));
  roots.push(destination);
  const packageRoot = resolve(import.meta.dirname, '..');
  const workspaceRoot = resolve(packageRoot, '../..');
  const pack = spawnSync(
    'pnpm',
    ['--dir', packageRoot, 'pack', '--pack-destination', destination],
    { encoding: 'utf8', timeout: 60_000 },
  );
  expect(pack.status, pack.stdout + pack.stderr).toBe(0);
  const tarball = join(destination, 'araketski-pi-statusline-0.1.0.tgz');
  const check = spawnSync(
    'pnpm',
    ['nx', 'run', '@araketski/pi-statusline:pi-check-package', `--tarball=${tarball}`],
    { cwd: workspaceRoot, encoding: 'utf8', timeout: 60_000 },
  );
  expect(check.status, check.stdout + check.stderr).toBe(0);
});
