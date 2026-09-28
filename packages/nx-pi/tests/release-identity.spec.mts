import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const script = resolve(import.meta.dirname, '../../../tools/release/identity.mjs');
const fixtures: string[] = [];

function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function fixture(): { root: string; sha: string; version: string } {
  const root = mkdtempSync(join(tmpdir(), 'release-identity-'));
  fixtures.push(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Release Test');
  git(root, 'config', 'user.email', 'release-test@example.invalid');
  const version = '9.7.3';
  for (const directory of ['fast-mode', 'statusline', 'statusline-protocol', 'nx-pi']) {
    const packageRoot = join(root, 'packages', directory);
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: `@example/${directory}`, version }),
    );
  }
  writeFileSync(join(root, 'CHANGELOG.md'), `## ${version} (2026-01-01)\n\nChanges.\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'release candidate');
  return { root, sha: git(root, 'rev-parse', 'HEAD'), version };
}

function validate(root: string, sha: string) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_SHA: sha },
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

// @mara implements VER-RELEASE-IDENTITY
it('accepts the captured commit and shared changelog version without writing a tag', () => {
  const { root, sha, version } = fixture();
  const result = validate(root, sha);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(`version=${version}`);
  expect(result.stdout).toContain(`sha=${sha}`);
  expect(result.stdout).toContain(`tag=v${version}`);
  expect(git(root, 'tag', '--list')).toBe('');
  expect(git(root, 'status', '--porcelain')).toBe('');
});

it('accepts an existing version tag on the captured commit', () => {
  const { root, sha, version } = fixture();
  git(root, 'tag', `v${version}`, sha);
  const result = validate(root, sha);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(`tag=v${version}`);
});

it('rejects a mismatched package version', () => {
  const { root, sha } = fixture();
  const manifest = join(root, 'packages/fast-mode/package.json');
  const contents = JSON.parse(readFileSync(manifest, 'utf8')) as { name: string };
  writeFileSync(manifest, JSON.stringify({ ...contents, version: '9.7.4' }));
  const result = validate(root, sha);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/version/i);
});

it('rejects an invalid semantic version', () => {
  const { root, sha } = fixture();
  for (const directory of ['fast-mode', 'statusline', 'statusline-protocol', 'nx-pi']) {
    const manifest = join(root, 'packages', directory, 'package.json');
    const contents = JSON.parse(readFileSync(manifest, 'utf8')) as { name: string };
    writeFileSync(manifest, JSON.stringify({ ...contents, version: '9.7.3-01' }));
  }
  const result = validate(root, sha);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/version/i);
});

it('rejects a missing changelog entry', () => {
  const { root, sha } = fixture();
  writeFileSync(join(root, 'CHANGELOG.md'), '## 9.7.2 (2026-01-01)\n');
  const result = validate(root, sha);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/changelog/i);
});

it('rejects a different captured commit', () => {
  const { root } = fixture();
  const result = validate(root, '0'.repeat(40));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/commit/i);
});

it('rejects an existing version tag on a different commit without moving it', () => {
  const { root, sha, version } = fixture();
  git(root, 'commit', '--allow-empty', '-qm', 'next commit');
  const nextSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'tag', `v${version}`, sha);
  const result = validate(root, nextSha);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/tag/i);
  expect(git(root, 'rev-list', '-n', '1', `v${version}`)).toBe(sha);
});
