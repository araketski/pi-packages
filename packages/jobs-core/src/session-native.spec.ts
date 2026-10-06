import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('exercises actual Pi session delivery composition offline', () => {
  const root = mkdtempSync(join(tmpdir(), 'session-delivery-'));
  try {
    const sdk = import.meta.resolve('@earendil-works/pi-coding-agent');
    writeFileSync(
      join(root, 'imports.json'),
      JSON.stringify({
        sdk,
        gates: new URL('../../gates-protocol/dist/index.js', import.meta.url).href,
        ai: new URL('../../pi-ai/dist/index.js', sdk).href,
        typebox: createRequire(sdk).resolve('@sinclair/typebox'),
      }),
    );
    cpSync(new URL('../dist/', import.meta.url), root, { recursive: true });
    writeFileSync(
      join(root, 'core-a.mjs'),
      readFileSync(new URL('../dist/index.js', import.meta.url)),
    );
    cpSync(new URL('../dist/', import.meta.url), join(root, 'separate-copy'), { recursive: true });
    writeFileSync(join(root, 'core-b.mjs'), "export * from './separate-copy/index.js';");
    for (const name of ['pi-harness.mjs', 'session-delivery.mjs', 'session-cases.mjs'])
      writeFileSync(join(root, name), readFileSync(new URL('../tests/' + name, import.meta.url)));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
    const run = spawnSync(
      'unshare',
      [
        '--user',
        '--map-root-user',
        '--net',
        'env',
        '-i',
        'PATH=' + process.env.PATH,
        'HOME=' + root,
        'TMPDIR=' + root,
        'PI_OFFLINE=1',
        process.execPath,
        join(root, 'session-delivery.mjs'),
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );
    if (process.env.PI_TEST_EVIDENCE_DIR) {
      writeFileSync(
        join(process.env.PI_TEST_EVIDENCE_DIR, 'session-delivery.log'),
        run.stdout + '\n' + run.stderr,
      );
      try {
        cpSync(
          join(root, 'results.json'),
          join(process.env.PI_TEST_EVIDENCE_DIR, 'session-delivery-results.json'),
        );
      } catch {
        /* log remains */
      }
    }
    if (run.status !== 0) throw Error(run.stdout + '\n' + run.stderr + String(run.error ?? ''));
    expect(run.status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 70_000);
