import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const workspace = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(import.meta.dirname, '..');

it('passes the packed extension source checker from the local nx-pi executor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pi-fast-packed-'));
  try {
    const pack = JSON.parse(
      execFileSync('pnpm', ['-C', packageRoot, 'pack', '--pack-destination', dir, '--json'], {
        cwd: workspace,
        encoding: 'utf8',
        timeout: 60_000,
      }),
    ) as { filename: string; files: { path: string }[] };
    const paths = pack.files.map(({ path }) => path);
    expect(paths).not.toContain('docs/contract.mara.md');
    expect(paths).toContain('LICENSE');
    expect(paths).toContain('README.md');
    const result = spawnSync(
      'pnpm',
      ['nx', 'run', '@araketski/pi-fast-mode:pi-check-package', `--tarball=${pack.filename}`],
      {
        cwd: workspace,
        env: { ...process.env, NX_DAEMON: 'false', NX_PREFER_NODE_STRIP_TYPES: 'false' },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    expect(result.status, result.stdout + result.stderr || String(result.error)).toBe(0);

    const protocol = JSON.parse(
      execFileSync(
        'pnpm',
        [
          '-C',
          join(workspace, 'packages/statusline-protocol'),
          'pack',
          '--pack-destination',
          dir,
          '--json',
        ],
        {
          cwd: workspace,
          encoding: 'utf8',
          timeout: 60_000,
        },
      ),
    ) as { filename: string };
    const consumer = join(dir, 'consumer');
    const agentDir = join(consumer, 'agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'pi-fast-mode-consumer', private: true }),
    );
    writeFileSync(
      join(agentDir, 'settings.json'),
      JSON.stringify({ packages: ['../node_modules/@araketski/pi-fast-mode'] }),
    );
    const install = spawnSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        pack.filename,
        protocol.filename,
        '@earendil-works/pi-coding-agent@0.99.1',
      ],
      {
        cwd: consumer,
        encoding: 'utf8',
        timeout: 120_000,
      },
    );
    expect(install.status, install.stdout + install.stderr || String(install.error)).toBe(0);
    const smoke = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { join } from 'node:path';
      import { pathToFileURL } from 'node:url';
      const root = process.cwd();
      const sdk = await import(pathToFileURL(join(root, 'node_modules/@earendil-works/pi-coding-agent/dist/index.js')).href);
      const loader = new sdk.DefaultResourceLoader({ cwd: root, agentDir: join(root, 'agent') });
      await loader.reload();
      const resources = loader.getExtensions();
      if (resources.errors.length || !resources.extensions.some(ext => ext.commands.has('fast'))) {
        throw new Error('Packed fast-mode extension did not load: ' + JSON.stringify(resources.errors));
      }
      const { session } = await sdk.createAgentSession({ cwd: root, resourceLoader: loader, sessionManager: sdk.SessionManager.inMemory() });
      try {
        await session.prompt('/fast on');
        if (!session.sessionManager.getBranch().some(entry => entry.type === 'custom' && entry.customType === 'fast' && entry.data?.enabled === true)) {
          throw new Error('Packed fast-mode command did not persist enabled state');
        }
      } finally { session.dispose(); }
    `,
      ],
      {
        cwd: consumer,
        env: { ...process.env, PI_OFFLINE: '1' },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    expect(smoke.status, smoke.stdout + smoke.stderr || String(smoke.error)).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
