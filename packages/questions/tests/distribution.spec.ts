import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

// @mara implements VER-QUESTIONS-LOADING
it('packs, checks and loads Questions independently with declared host peers and all helpers', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const dir = mkdtempSync(join(tmpdir(), 'questions-consumer-'));
  try {
    const pack = JSON.parse(
      execFileSync(
        'pnpm',
        ['-C', resolve(import.meta.dirname, '..'), 'pack', '--pack-destination', dir, '--json'],
        { cwd: root, encoding: 'utf8', timeout: 60_000 },
      ),
    ) as { filename: string; files: { path: string }[] };
    expect(pack.files.map((file) => file.path).sort()).toEqual(
      [
        'LICENSE',
        'README.md',
        'extensions/ask-questions/flow.ts',
        'extensions/ask-questions/index.ts',
        'extensions/ask-questions/schema.ts',
        'extensions/ask-questions/screen.ts',
        'package.json',
      ].sort(),
    );
    const check = spawnSync(
      'pnpm',
      ['nx', 'run', '@araketski/pi-questions:pi-check-package', `--tarball=${pack.filename}`],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, NX_DAEMON: 'false', NX_PREFER_NODE_STRIP_TYPES: 'false' },
      },
    );
    expect(check.status, check.stdout + check.stderr || String(check.error)).toBe(0);
    const consumer = join(dir, 'consumer');
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'questions-isolated-consumer', private: true, type: 'module' }),
    );
    console.info(
      `Questions consumer: Node ${process.version}; npm ${execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()}; pnpm ${execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim()}; Pi 0.99.1`,
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
        '@earendil-works/pi-coding-agent@0.99.1',
        '@earendil-works/pi-tui@0.99.1',
        'typebox@1.3.27',
      ],
      { cwd: consumer, encoding: 'utf8', timeout: 120_000 },
    );
    expect(install.status, install.stdout + install.stderr || String(install.error)).toBe(0);
    const installed = join(consumer, 'node_modules/@araketski/pi-questions');
    expect(realpathSync(installed)).toBe(installed);
    const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) as {
      peerDependencies: Record<string, string>;
      pi: { extensions: string[] };
      license: string;
      dependencies?: unknown;
    };
    expect(manifest.peerDependencies).toEqual({
      '@earendil-works/pi-coding-agent': '*',
      '@earendil-works/pi-tui': '*',
      typebox: '*',
    });
    expect(manifest.pi.extensions).toEqual(['./extensions/ask-questions/index.ts']);
    expect(manifest.license).toBe('MIT');
    expect(manifest.dependencies).toBeUndefined();
    // This script lives inside the independent consumer: bare SDK imports and
    // JIT helper resolution cannot fall back to repository node_modules.
    const script = join(consumer, 'load.mjs');
    writeFileSync(
      script,
      `
      import assert from 'node:assert/strict';
      import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
      const cwd = process.cwd();
      const agentDir = join(cwd, 'agent');
      mkdirSync(agentDir);
      const packageRoot = join(cwd, 'node_modules/@araketski/pi-questions');
      writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [packageRoot] }));
      const loader = new DefaultResourceLoader({ cwd, agentDir });
      await loader.reload();
      const { errors, extensions } = loader.getExtensions();
      assert.deepEqual(errors, []);
      assert.equal(extensions.length, 1);
      assert.equal(realpathSync(extensions[0].path), join(packageRoot, 'extensions/ask-questions/index.ts'));
      assert.equal(extensions[0].commands.size, 0);
      const tools = [...extensions[0].tools.values()].map(tool => tool.definition);
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, 'ask_questions');
      assert.equal(tools[0].exposure, 'model-only');
      assert.equal(tools[0].executionMode, 'sequential');
      assert.ok(tools[0].parameters && tools[0].outputSchema && tools[0].promptSnippet);
      assert.match(tools[0].promptGuidelines.join(' '), /recommendedOption/);
      const result = await tools[0].execute('packed-call', { questions: [{ question: 'Choose?', options: [{ label: 'A' }, { label: 'B' }], recommendedOption: 2 }] }, new AbortController().signal, undefined, { mode: 'rpc', hasUI: true, ui: { custom() { throw new Error('Packed RPC must not open UI'); } } });
      assert.equal(result.structuredContent.status, 'unavailable');
      assert.equal(result.structuredContent.reason, 'non_tui');
      assert.deepEqual(result.structuredContent.answers, []);
      assert.deepEqual(result.details, result.structuredContent);
      console.log('packed Questions loaded and unavailable RPC returned without UI');
    `,
    );
    const smoke = spawnSync(process.execPath, [script], {
      cwd: consumer,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        PI_OFFLINE: '1',
        PI_CODING_AGENT_DIR: join(consumer, 'agent'),
        NODE_PATH: '',
      },
    });
    expect(smoke.status, smoke.stdout + smoke.stderr || String(smoke.error)).toBe(0);
    expect(smoke.stdout).toContain('packed Questions loaded');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 180_000);
