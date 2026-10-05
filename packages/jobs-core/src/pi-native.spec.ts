import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('proves Pi 0.99.1 atomic native registrations and conservative nested-result visibility offline', () => {
  const root = mkdtempSync(join(tmpdir(), 'jobs-native-'));
  try {
    const sdk = import.meta.resolve('@earendil-works/pi-coding-agent');
    const imports = {
      sdk,
      ai: new URL('../../pi-ai/dist/index.js', sdk).href,
      typebox: createRequire(sdk).resolve('@sinclair/typebox'),
    };
    writeFileSync(join(root, 'imports.json'), JSON.stringify(imports));
    for (const name of ['pi-harness.mjs', 'pi-native.mjs', 'storage-smoke.mjs'])
      writeFileSync(join(root, name), readFileSync(new URL(`../tests/${name}`, import.meta.url)));
    for (const name of ['core-a', 'core-b'])
      writeFileSync(
        join(root, `${name}.mjs`),
        readFileSync(new URL('../dist/index.js', import.meta.url)),
      );
    for (const name of ['lifecycle.js', 'storage.js', 'storage-files.js'])
      writeFileSync(join(root, name), readFileSync(new URL(`../dist/${name}`, import.meta.url)));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
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
        'PI_OFFLINE=1',
        process.execPath,
        join(root, 'pi-native.mjs'),
      ],
      { encoding: 'utf8', timeout: 90_000 },
    );
    if (process.env.PI_TEST_EVIDENCE_DIR) {
      writeFileSync(
        join(process.env.PI_TEST_EVIDENCE_DIR, 'native-output.log'),
        `${result.stdout}\n${result.stderr}`,
      );
      try {
        writeFileSync(
          join(process.env.PI_TEST_EVIDENCE_DIR, 'native-results.json'),
          readFileSync(join(root, 'results.json')),
        );
      } catch {
        /* Preserve partial output above on fixture failure. */
      }
    }
    expect(result.status, `${result.stdout}\n${result.stderr}\n${String(result.error ?? '')}`).toBe(
      0,
    );
    const records = JSON.parse(readFileSync(join(root, 'results.json'), 'utf8')) as {
      name: string;
      status: string;
    }[];
    expect(records).toHaveLength(7);
    expect(records.every((r) => r.status === 'observed')).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 100_000);

it('proves the registration seams in real credential-free print JSON RPC and interactive CLI processes', () => {
  const root = mkdtempSync(join(tmpdir(), 'jobs-cli-'));
  try {
    const sdk = import.meta.resolve('@earendil-works/pi-coding-agent');
    writeFileSync(
      join(root, 'imports.json'),
      JSON.stringify({
        sdk,
        ai: new URL('../../pi-ai/dist/index.js', sdk).href,
        typebox: createRequire(sdk).resolve('@sinclair/typebox'),
      }),
    );
    for (const name of ['pi-cli-extension.mjs', 'pi-cli-driver.py'])
      writeFileSync(join(root, name), readFileSync(new URL(`../tests/${name}`, import.meta.url)));
    const cli = new URL('./cli.js', sdk).pathname;
    const result = spawnSync(
      'unshare',
      [
        '--user',
        '--map-root-user',
        '--net',
        'env',
        '-i',
        `PATH=${process.env.PATH}`,
        'python3',
        join(root, 'pi-cli-driver.py'),
        root,
        process.execPath,
        cli,
      ],
      { encoding: 'utf8', timeout: 180_000 },
    );
    if (process.env.PI_TEST_EVIDENCE_DIR) {
      writeFileSync(
        join(process.env.PI_TEST_EVIDENCE_DIR, 'cli-output.log'),
        `${result.stdout}\n${result.stderr}`,
      );
      for (const name of readdirSync(root)) {
        if (name === 'cli-results.json')
          writeFileSync(
            join(process.env.PI_TEST_EVIDENCE_DIR, name),
            readFileSync(join(root, name)),
          );
        if (/^(print|json|rpc|interactive)-/u.test(name))
          for (const log of ['stdout.log', 'stderr.log']) {
            try {
              writeFileSync(
                join(process.env.PI_TEST_EVIDENCE_DIR, `${name}-${log}`),
                readFileSync(join(root, name, log)),
              );
            } catch {
              /* Other cases may not have started after a fixture failure. */
            }
          }
      }
    }
    expect(result.status, `${result.stdout}\n${result.stderr}\n${String(result.error ?? '')}`).toBe(
      0,
    );
    expect(JSON.parse(readFileSync(join(root, 'cli-results.json'), 'utf8'))).toHaveLength(16);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 190_000);
