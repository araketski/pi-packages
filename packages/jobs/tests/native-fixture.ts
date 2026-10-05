import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function runNativeFixture(root: string, sdk: string, adapter: string, evidence?: string) {
  // ESM-only exports and npm's nested shrinkwrap need the public ESM resolver,
  // not assumptions about hoisting or SDK-private dependency paths.
  const imports = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--experimental-import-meta-resolve',
        '--input-type=module',
        '-e',
        'const sdk=process.argv[1];console.log(JSON.stringify({sdk,ai:import.meta.resolve("@earendil-works/pi-ai",sdk),typebox:import.meta.resolve("typebox",sdk)}));',
        sdk,
      ],
      { encoding: 'utf8' },
    ),
  );
  writeFileSync(join(root, 'imports.json'), JSON.stringify(imports));
  const original = readFileSync(
    new URL('../../jobs-core/tests/pi-harness.mjs', import.meta.url),
    'utf8',
  );
  const needle = '  const loader = new sdk.DefaultResourceLoader({\n    cwd,';
  if (!original.includes(needle))
    throw Error('Committed Pi fixture loader changed; reconcile explicitly.');
  writeFileSync(
    join(root, 'pi-harness.mjs'),
    original.replace(
      needle,
      needle + "\n    additionalExtensionPaths: [join(root, 'adapter-bridge.ts')],",
    ),
  );
  writeFileSync(
    join(root, 'native-workflow.mjs'),
    readFileSync(new URL('./native-workflow.mjs', import.meta.url)),
  );
  // Pi's public resource loader loads actual source inside node_modules; Node's TS stripper cannot.
  writeFileSync(
    join(root, 'adapter-bridge.ts'),
    `import { createLocalExecutor } from ${JSON.stringify(adapter)};\nexport default function(pi) { pi.events.on('fixture:adapter-request', () => pi.events.emit('fixture:adapter', createLocalExecutor)); }\n`,
  );
  mkdirSync(join(root, 'home'));
  mkdirSync(join(root, 'tmp'));
  const r = spawnSync(
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
      join(root, 'native-workflow.mjs'),
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(
      join(evidence, 'output.log'),
      `${r.stdout}\n${r.stderr}\n${String(r.error ?? '')}`,
    );
    try {
      writeFileSync(join(evidence, 'results.json'), readFileSync(join(root, 'results.json')));
    } catch {
      /* Preserve failure output even before first probe. */
    }
  }
  if (r.status !== 0)
    throw Error(
      `Native fixture failed (${r.status}): ${r.stdout}\n${r.stderr}\n${String(r.error ?? '')}`,
    );
  const records = JSON.parse(readFileSync(join(root, 'results.json'), 'utf8')) as {
    status: string;
  }[];
  if (records.length !== 9 || records.some((r) => r.status !== 'observed'))
    throw Error('Native fixture did not complete every required probe.');
  return records;
}
