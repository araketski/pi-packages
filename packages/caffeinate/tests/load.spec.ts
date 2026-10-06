import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('loads package-sourced no-op extension through Pi 0.99.1', () => {
  const home = mkdtempSync(join(tmpdir(), 'caffeinate-source-home-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, 'runtime-smoke.mjs'),
        resolve(
          import.meta.dirname,
          '../../../node_modules/@earendil-works/pi-coding-agent/dist/index.js',
        ),
        resolve(import.meta.dirname, '..'),
      ],
      {
        cwd: home,
        env: {
          PATH: process.env.PATH,
          HOME: home,
          TMPDIR: process.env.TMPDIR,
          PI_OFFLINE: '1',
          PI_SESSION_ID: process.env.PI_SESSION_ID,
        },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    expect(result.status, result.stdout + result.stderr || String(result.error)).toBe(0);
    expect(JSON.parse(result.stdout.trim()).piVersion).toBe('0.99.1');
    console.log(`source: ${result.stdout.trim()}`);
    if (process.env.PI_TEST_EVIDENCE_DIR) {
      writeFileSync(
        join(process.env.PI_TEST_EVIDENCE_DIR, 'source-receipt.json'),
        result.stdout.trim() + '\n',
      );
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}, 65_000);
