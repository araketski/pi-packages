import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { runNativeFixture } from './native-fixture.ts';

const workspace = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(import.meta.dirname, '..');

const sourceManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  version: string;
};

for (const { manager, version } of [
  { manager: 'npm', version: sourceManifest.version },
  { manager: 'pnpm', version: sourceManifest.version },
  { manager: 'npm', version: '9.9.9-scaffold-verification' },
]) {
  it(`loads the fresh ${version} no-op artifact in an independent ${manager} Pi 0.99.1 consumer`, () => {
    const fixture = mkdtempSync(join(tmpdir(), `pi-jobs-${manager}-`));
    try {
      let packRoot = packageRoot;
      if (version !== sourceManifest.version) {
        // Exercise release-version independence without changing repository manifests.
        packRoot = join(fixture, 'versioned-source');
        mkdirSync(packRoot);
        cpSync(join(workspace, 'pnpm-workspace.yaml'), join(packRoot, 'pnpm-workspace.yaml'));
        for (const path of ['extensions', 'LICENSE', 'README.md']) {
          cpSync(join(packageRoot, path), join(packRoot, path), { recursive: true });
        }
        const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
        const coreManifest = JSON.parse(
          readFileSync(join(workspace, 'packages/jobs-core/package.json'), 'utf8'),
        );
        // This copied fixture is not a workspace; resolve its type-only workspace declaration.
        writeFileSync(
          join(packRoot, 'package.json'),
          JSON.stringify({
            ...manifest,
            version,
            devDependencies: {
              ...manifest.devDependencies,
              '@araketski/pi-jobs-core': coreManifest.version,
            },
          }),
        );
      }
      const pack = JSON.parse(
        execFileSync('pnpm', ['-C', packRoot, 'pack', '--pack-destination', fixture, '--json'], {
          cwd: workspace,
          encoding: 'utf8',
          timeout: 60_000,
        }),
      ) as { filename: string; files: { path: string }[] };
      expect(pack.files.map(({ path }) => path).sort()).toEqual([
        'LICENSE',
        'README.md',
        'extensions/jobs/foreground.ts',
        'extensions/jobs/index.ts',
        'extensions/jobs/linux-evidence.d.mts',
        'extensions/jobs/linux-evidence.mjs',
        'extensions/jobs/local-executor.ts',
        'extensions/jobs/supervisor.mjs',
        'package.json',
      ]);
      execFileSync(
        'pnpm',
        ['nx', 'run', '@araketski/pi-jobs:pi-check-package', `--tarball=${pack.filename}`],
        {
          cwd: workspace,
          env: { ...process.env, NX_DAEMON: 'false', NX_PREFER_NODE_STRIP_TYPES: 'false' },
          encoding: 'utf8',
          timeout: 60_000,
        },
      );
      const consumer = join(fixture, 'consumer');
      const agentDir = join(consumer, 'agent');
      mkdirSync(agentDir, { recursive: true });
      mkdirSync(join(fixture, 'home'));
      mkdirSync(join(consumer, '.pi'));
      writeFileSync(
        join(consumer, 'package.json'),
        JSON.stringify({
          name: 'pi-jobs-isolated-consumer',
          private: true,
          type: 'module',
          dependencies: {
            '@araketski/pi-jobs': `file:${pack.filename}`,
            '@earendil-works/pi-coding-agent': '0.99.1',
          },
        }),
      );
      writeFileSync(
        join(consumer, '.pi/settings.json'),
        JSON.stringify({ packages: ['../node_modules/@araketski/pi-jobs'] }),
      );
      const env = {
        ...process.env,
        HOME: join(fixture, 'home'),
        PI_CODING_AGENT_DIR: agentDir,
        PI_OFFLINE: '1',
        npm_config_cache: join(fixture, 'npm-cache'),
      };
      execFileSync(
        manager,
        manager === 'npm'
          ? ['install', '--ignore-scripts', '--no-audit', '--no-fund']
          : ['install', '--ignore-scripts', `--store-dir=${join(fixture, 'pnpm-store')}`],
        { cwd: consumer, env, encoding: 'utf8', timeout: 180_000 },
      );
      // Run from the installed consumer, not the checkout's dependency tree.
      const smoke = join(consumer, 'smoke.mjs');
      writeFileSync(smoke, readFileSync(join(import.meta.dirname, 'installed-smoke.mjs')));
      const digest = createHash('sha256')
        .update(readFileSync(join(packageRoot, 'extensions/jobs/index.ts')))
        .digest('hex');
      const output = execFileSync(process.execPath, [smoke, digest, version], {
        cwd: consumer,
        env,
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(JSON.parse(output)).toMatchObject({ sdk: '0.99.1', digest, registrations: 0 });
      const nativeRoot = join(fixture, 'native');
      mkdirSync(nativeRoot);
      const native = runNativeFixture(
        nativeRoot,
        pathToFileURL(
          realpathSync(
            join(consumer, 'node_modules/@earendil-works/pi-coding-agent/dist/index.js'),
          ),
        ).href,
        join(consumer, 'node_modules/@araketski/pi-jobs/extensions/jobs/local-executor.ts'),
        process.env.PI_TEST_EVIDENCE_DIR
          ? join(process.env.PI_TEST_EVIDENCE_DIR, `native-${manager}-${version}`)
          : undefined,
      );
      expect(native).toHaveLength(9);
      if (process.env.PI_TEST_EVIDENCE_DIR) {
        const artifactRoot = join(
          process.env.PI_TEST_EVIDENCE_DIR,
          `artifact-${manager}-${version}`,
        );
        mkdirSync(artifactRoot, { recursive: true });
        cpSync(pack.filename, join(artifactRoot, 'pi-jobs.tgz'));
        writeFileSync(
          join(artifactRoot, 'archive-members.json'),
          JSON.stringify(pack.files, null, 2),
        );
        writeFileSync(
          join(artifactRoot, 'consumer.json'),
          JSON.stringify(
            { manager, version, ...JSON.parse(output), nativeProbes: native.length },
            null,
            2,
          ),
        );
      }
      console.info(
        JSON.stringify({
          manager,
          version,
          archiveSha256: createHash('sha256').update(readFileSync(pack.filename)).digest('hex'),
          ...JSON.parse(output),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 300_000);
}
