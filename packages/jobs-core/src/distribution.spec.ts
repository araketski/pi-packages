import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};
const typescriptVersion = (
  JSON.parse(readFileSync(join(workspaceRoot, 'node_modules/typescript/package.json'), 'utf8')) as {
    version: string;
  }
).version;

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, NX_DAEMON: 'false' },
  });
  expect(
    result.status,
    `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}\n${String(result.error ?? '')}`,
  ).toBe(0);
  return result.stdout;
}

it.each(['npm', 'pnpm'] as const)(
  'imports and typechecks the actual archive in an independent %s consumer',
  (manager) => {
    const root = mkdtempSync(join(tmpdir(), 'jobs-core-consumer-'));
    try {
      const pack = JSON.parse(
        run('pnpm', ['pack', '--pack-destination', root, '--json'], packageRoot),
      ) as { filename: string };
      const tarball = resolve(root, pack.filename);
      const members = run('tar', ['-tzf', tarball], root).trim().split('\n').sort();
      expect(members).toEqual([
        'package/README.md',
        'package/dist/index.d.ts',
        'package/dist/index.d.ts.map',
        'package/dist/index.js',
        ...['storage', 'storage-format', 'storage-policy', 'storage-worker']
          .flatMap((name) => ['js', 'd.ts', 'd.ts.map'].map((ext) => `package/dist/${name}.${ext}`))
          .sort(),
        'package/dist/testing.d.ts',
        'package/dist/testing.d.ts.map',
        'package/dist/testing.js',
        'package/package.json',
      ]);
      const packed = JSON.parse(run('tar', ['-xOf', tarball, 'package/package.json'], root)) as {
        dependencies: Record<string, string>;
        pi?: unknown;
        name: string;
        version: string;
      };
      expect(packed.name).toBe(manifest.name);
      expect(packed.version).toBe(manifest.version);
      expect(packed).not.toHaveProperty('pi');
      expect(packed.dependencies.tslib).not.toMatch(/^(catalog|workspace):/);
      run(
        'pnpm',
        ['nx', 'run', `${manifest.name}:pi-check-package`, `--tarball=${tarball}`],
        workspaceRoot,
      );

      const consumer = join(root, manager);
      mkdirSync(consumer);
      writeFileSync(
        join(consumer, 'package.json'),
        JSON.stringify({
          name: 'jobs-core-interface-consumer',
          private: true,
          type: 'module',
          dependencies: { [manifest.name]: `file:${tarball}` },
          devDependencies: { typescript: typescriptVersion },
        }),
      );
      run(
        manager,
        manager === 'npm'
          ? [
              'install',
              '--ignore-scripts',
              '--no-audit',
              '--no-fund',
              '--cache',
              join(process.env.PI_TEST_PACKAGE_CACHE ?? root, 'npm-cache'),
            ]
          : [
              'install',
              '--ignore-scripts',
              '--no-frozen-lockfile',
              '--store-dir',
              join(process.env.PI_TEST_PACKAGE_CACHE ?? root, 'pnpm-store'),
            ],
        consumer,
      );
      writeFileSync(
        join(consumer, 'smoke.mjs'),
        `
        import assert from 'node:assert/strict';
        import { realpathSync } from 'node:fs';
        import { relative, isAbsolute } from 'node:path';
        import { fileURLToPath } from 'node:url';
        import { JOBS_CONTRACT_VERSION, createJobsParticipant } from '${manifest.name}';
        import { createJobsTestBus, createUnknownJobFixture } from '${manifest.name}/testing';
        import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
        import { resolve } from 'node:path';
        import { createJobStorage } from '${manifest.name}/storage';
        import metadata from '${manifest.name}/package.json' with { type: 'json' };
        const entry = realpathSync(fileURLToPath(import.meta.resolve('${manifest.name}')));
        const local = relative(realpathSync(process.cwd()), entry);
        assert(!isAbsolute(local) && !local.startsWith('../'));
        assert(entry.endsWith('/dist/index.js'));
        assert.equal(JOBS_CONTRACT_VERSION, '0.1.0');
        copyFileSync(entry, './separate-copy.mjs');
        const copy = await import('./separate-copy.mjs');
        assert.notEqual(copy.createJobsParticipant, createJobsParticipant);
        const events = createJobsTestBus();
        const owner = createJobsParticipant({events}, {runtimeId:'R', participantId:'O', role:'owner'});
        const observer = copy.createJobsParticipant({events}, {runtimeId:'R', participantId:'V', role:'observer'});
        owner.start(); observer.start();
        const job = createUnknownJobFixture({runtimeId:'R', ownerId:'O', sessionId:'S', jobId:'J', producerId:'external/opaque'});
        owner.publish('S', [job]);
        assert.deepEqual(observer.view().snapshots[0].jobs, [job]);
        owner.close(); observer.close();
        assert.equal(events.listenerCount(), 0);
        const store = await createJobStorage({agentDirectory:resolve('./fake-agent'),policy:{totalBytes:40000,outputBytes:100,trackingBytes:4096,resultBytes:4096}});
        const launch = {identity:job.identity,authority:{runtimeId:'R',ownerId:'O',generation:'G'},awaiting:true,delivery:'automatic',lifetime:'managed'};
        const reserved=await store.jobs.reserve(launch);
        assert.equal(reserved.status,'ok');
        await store.output(reserved.value).append({stream:'combined',bytes:Buffer.from('beginning '+ 'X'.repeat(200)+' ending')});
        const retained=await store.readOutput(job.identity);
        assert.equal(retained.status,'ok');assert.equal(retained.value.complete,false);
        assert(retained.value.text.startsWith('beginning '));assert(retained.value.text.endsWith(' ending'));
        const final={identity:{job:job.identity,resultId:'stable'},outcome:{kind:'exit',exitCode:0},content:'saved result, not delivered'};
        assert.equal((await store.results.save(final)).status,'ok');
        const reloaded=await createJobStorage({agentDirectory:resolve('./fake-agent')});
        assert.deepEqual((await reloaded.results.read(final.identity)).value,final);
        assert.equal((await reloaded.jobs.read(job.identity)).value.delivery.state,'pending');
        assert.throws(() => import.meta.resolve('${manifest.name}/storage-worker'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
        const metadataPath = fileURLToPath(import.meta.resolve('${manifest.name}/package.json'));
        const before = readFileSync(entry, 'utf8');
        const metadataBefore = readFileSync(metadataPath, 'utf8');
        // Never modify installed files: pnpm may hardlink them into its content store.
        mkdirSync('./version-bump');
        copyFileSync(entry, './version-bump/index.js');
        writeFileSync('./version-bump/package.json', JSON.stringify({...metadata, version:'0.4.11'}));
        const afterVersionBump = await import('./version-bump/index.js');
        assert.equal(afterVersionBump.JOBS_CONTRACT_VERSION, '0.1.0');
        assert.equal(readFileSync(entry, 'utf8'), before);
        assert.equal(readFileSync(metadataPath, 'utf8'), metadataBefore);
        assert.equal(metadata.name, '${manifest.name}');
        assert.equal(metadata.version, '${manifest.version}');
        assert(!Object.hasOwn(metadata, 'pi'));
        assert.throws(() => import.meta.resolve('${manifest.name}/src/index.ts'),
          { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
        console.log('installed artifact:', local);
      `,
      );
      const smoke = run(process.execPath, ['smoke.mjs'], consumer);
      writeFileSync(
        join(consumer, 'consumer.ts'),
        `
        import { createJobsParticipant, type CompletionCoordinator, type ExecutionAdapter,
          type JobStore, type ResultSink, type FinalResultReceipt, type JobOwnerPort,
          type JobsPiHost, type JobObservation } from '${manifest.name}';
        import { createJobsTestBus, createUnknownJobFixture } from '${manifest.name}/testing';
        import { createJobStorage, type JobStorage, type StoragePolicy } from '${manifest.name}/storage';
        export const storageFactory: (options: {agentDirectory:string;policy?:Partial<StoragePolicy>})=>Promise<JobStorage> = createJobStorage;
        const events = createJobsTestBus();
        const owner = createJobsParticipant({events}, {runtimeId:'R', participantId:'O', role:'owner'});
        export const job: JobObservation = createUnknownJobFixture({runtimeId:'R', ownerId:'O', sessionId:'S', jobId:'J', producerId:'unknown'});
        owner.publish('S', [job]);
        export type Ports = [CompletionCoordinator, ExecutionAdapter<unknown, unknown>, JobStore,
          ResultSink, FinalResultReceipt, JobOwnerPort, JobsPiHost];
      `,
      );
      run(
        process.execPath,
        [
          'node_modules/typescript/bin/tsc',
          'consumer.ts',
          '--strict',
          '--noEmit',
          '--module',
          'nodenext',
          '--moduleResolution',
          'nodenext',
          '--target',
          'es2022',
        ],
        consumer,
      );
      console.log(
        `${manager} consumer passed: ${smoke.trim()}; TypeScript ${typescriptVersion}; archive sha256 ${createHash('sha256').update(readFileSync(tarball)).digest('hex')}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  300_000,
);
