import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('exercises public Pi 0.99.1 setup buffering, first-user persistence, external logs and ephemeral cleanup', () => {
  const root = mkdtempSync(join(tmpdir(), 'jobs-storage-pi-'));
  try {
    const sdk = import.meta.resolve('@earendil-works/pi-coding-agent');
    writeFileSync(
      join(root, 'imports.json'),
      JSON.stringify({
        sdk,
        ai: new URL('../../pi-ai/dist/index.js', sdk).href,
        typebox: createRequire(sdk).resolve('@sinclair/typebox'),
        storage: new URL('../dist/storage.js', import.meta.url).href,
      }),
    );
    for (const name of ['pi-harness.mjs', 'pi-storage.mjs'])
      writeFileSync(join(root, name), readFileSync(new URL(`../tests/${name}`, import.meta.url)));
    mkdirSync(join(root, 'home'));
    mkdirSync(join(root, 'tmp'));
    const result = spawnSync(
      'unshare',
      [
        '--user',
        '--map-root-user',
        '--net',
        'env',
        '-i',
        `PATH=${process.env.PATH}`,
        `HOME=${root}/home`,
        `TMPDIR=${root}/tmp`,
        `PI_CODING_AGENT_DIR=${root}/home/agent`,
        'PI_OFFLINE=1',
        process.execPath,
        join(root, 'pi-storage.mjs'),
      ],
      { encoding: 'utf8', timeout: 90_000 },
    );
    if (process.env.PI_TEST_EVIDENCE_DIR) {
      writeFileSync(
        join(process.env.PI_TEST_EVIDENCE_DIR, 'storage-pi.log'),
        `${result.stdout}\n${result.stderr}`,
      );
      try {
        writeFileSync(
          join(process.env.PI_TEST_EVIDENCE_DIR, 'storage-pi-results.json'),
          readFileSync(join(root, 'storage-results.json')),
        );
      } catch {
        /* retain partial log */
      }
    }
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'storage-results.json'), 'utf8'))).toMatchObject({
      setupOnlyBuffered: true,
      firstUserBeforeAssistant: true,
      externalLogs: true,
      savedResultNotReceipt: true,
      ephemeralCleanup: true,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 100_000);
