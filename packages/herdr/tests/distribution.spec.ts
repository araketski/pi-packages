import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const workspace = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(import.meta.dirname, '..');

const sourceManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  version: string;
};

for (const { manager, version } of [
  { manager: 'npm', version: sourceManifest.version },
  { manager: 'pnpm', version: sourceManifest.version },
  { manager: 'npm', version: '9.9.9-scaffold-verification' },
  { manager: 'pnpm', version: '9.9.9-scaffold-verification' },
]) {
  it(`loads the fresh ${version} no-op artifact in an independent ${manager} Pi 0.99.1 consumer`, () => {
    const fixture = mkdtempSync(join(tmpdir(), `pi-herdr-${manager}-`));
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
        writeFileSync(join(packRoot, 'package.json'), JSON.stringify({ ...manifest, version }));
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
        'extensions/herdr/index.ts',
        'extensions/herdr/transport.ts',
        'package.json',
      ]);
      execFileSync(
        'pnpm',
        ['nx', 'run', '@araketski/pi-herdr:pi-check-package', `--tarball=${pack.filename}`],
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
          name: 'pi-herdr-isolated-consumer',
          private: true,
          type: 'module',
          dependencies: {
            '@araketski/pi-herdr': `file:${pack.filename}`,
            '@earendil-works/pi-coding-agent': '0.99.1',
            '@types/node': '24.19.0',
            typescript: '6.0.3',
          },
        }),
      );
      writeFileSync(
        join(consumer, '.pi/settings.json'),
        JSON.stringify({ packages: ['../node_modules/@araketski/pi-herdr'] }),
      );
      const env = {
        ...process.env,
        XDG_CONFIG_HOME: join(fixture, 'config'),
        XDG_CACHE_HOME: join(fixture, 'cache'),
        XDG_STATE_HOME: join(fixture, 'state'),
        XDG_DATA_HOME: join(fixture, 'data'),
        HOME: join(fixture, 'home'),
        PI_CODING_AGENT_DIR: agentDir,
        PI_OFFLINE: '1',
        npm_config_cache: join(process.env.PI_TEST_PACKAGE_CACHE ?? fixture, 'npm-cache'),
      };
      // Do not leak worker context, credentials, or absolute Nx state into the consumer.
      for (const key of Object.keys(env)) {
        if (
          key.startsWith('HERDR_') ||
          key.startsWith('PI_SESSION_') ||
          key.startsWith('NX_') ||
          /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN)$/.test(key)
        )
          delete env[key as keyof typeof env];
      }
      execFileSync(
        manager,
        manager === 'npm'
          ? ['install', '--ignore-scripts', '--no-audit', '--no-fund']
          : [
              'install',
              '--ignore-scripts',
              `--store-dir=${join(process.env.PI_TEST_PACKAGE_CACHE ?? fixture, 'pnpm-store')}`,
            ],
        { cwd: consumer, env, encoding: 'utf8', timeout: 180_000 },
      );
      // Run from the installed consumer, not the checkout's dependency tree.
      const smoke = join(consumer, 'smoke.mjs');
      writeFileSync(smoke, readFileSync(join(import.meta.dirname, 'installed-smoke.mjs')));
      const digest = createHash('sha256')
        .update(readFileSync(join(packageRoot, 'extensions/herdr/index.ts')))
        .digest('hex');
      const transportDigest = createHash('sha256')
        .update(readFileSync(join(packageRoot, 'extensions/herdr/transport.ts')))
        .digest('hex');
      const declarationConsumer = join(consumer, 'types.mts');
      writeFileSync(
        declarationConsumer,
        `import { HerdrTransport, resolveLocalContext, type PaneInfo, type MoveDestination } from './node_modules/@araketski/pi-herdr/extensions/herdr/transport.ts';
const context = resolveLocalContext({});
const transport = new HerdrTransport(context);
const destination: MoveDestination = { type: 'new_tab', workspace_id: 'w1' };
const pane: Promise<PaneInfo> = transport.getPane('w1:p1');
void pane; void transport.movePane('w1:p1', destination);\n`,
      );
      execFileSync(
        process.execPath,
        [
          join(consumer, 'node_modules/typescript/bin/tsc'),
          '--noEmit',
          '--strict',
          '--skipLibCheck',
          '--target',
          'es2022',
          '--module',
          'nodenext',
          '--allowImportingTsExtensions',
          '--types',
          'node',
          declarationConsumer,
        ],
        { cwd: consumer, env, encoding: 'utf8', timeout: 60_000, stdio: 'inherit' },
      );
      // Emit declarations from the fresh installed runtime source into owned fixture storage,
      // then independently consume those declarations. Never write into installed packages.
      const declarations = join(consumer, 'declarations');
      const compiler = join(consumer, 'node_modules/typescript/bin/tsc');
      execFileSync(
        process.execPath,
        [
          compiler,
          '--declaration',
          '--emitDeclarationOnly',
          '--strict',
          '--skipLibCheck',
          '--target',
          'es2022',
          '--module',
          'nodenext',
          '--types',
          'node',
          '--outDir',
          declarations,
          join(consumer, 'node_modules/@araketski/pi-herdr/extensions/herdr/transport.ts'),
        ],
        { cwd: consumer, env, encoding: 'utf8', timeout: 60_000, stdio: 'inherit' },
      );
      const declaredConsumer = join(consumer, 'declarations.mts');
      writeFileSync(
        declaredConsumer,
        readFileSync(declarationConsumer, 'utf8').replace(
          './node_modules/@araketski/pi-herdr/extensions/herdr/transport.ts',
          './declarations/transport.js',
        ),
      );
      execFileSync(
        process.execPath,
        [
          compiler,
          '--noEmit',
          '--strict',
          '--skipLibCheck',
          '--target',
          'es2022',
          '--module',
          'nodenext',
          '--types',
          'node',
          declaredConsumer,
        ],
        { cwd: consumer, env, encoding: 'utf8', timeout: 60_000, stdio: 'inherit' },
      );
      const output = execFileSync(process.execPath, [smoke, digest, version, transportDigest], {
        cwd: consumer,
        env,
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(JSON.parse(output)).toMatchObject({ sdk: '0.99.1', digest, registrations: 0 });
      const receipt = {
        manager,
        version,
        archiveMembers: pack.files.map(({ path }) => path).sort(),
        archiveSha256: createHash('sha256').update(readFileSync(pack.filename)).digest('hex'),
        transportDigest,
        installedSourceTypes: 'passed',
        installedDeclarations: 'passed',
        ...JSON.parse(output),
      };
      if (process.env.PI_TEST_EVIDENCE_DIR) {
        mkdirSync(process.env.PI_TEST_EVIDENCE_DIR, { recursive: true });
        cpSync(pack.filename, join(process.env.PI_TEST_EVIDENCE_DIR, `${manager}-${version}.tgz`));
        writeFileSync(
          join(process.env.PI_TEST_EVIDENCE_DIR, `${manager}-${version}.json`),
          JSON.stringify(receipt, null, 2) + '\n',
        );
      }
      console.info(JSON.stringify(receipt));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 300_000);
}
