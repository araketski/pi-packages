import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const nxCli = join(workspaceRoot, 'node_modules/nx/dist/bin/nx.js');

// @mara implements VER-NXPI-LOCAL-USAGE
describe('local nx-pi generator execution', () => {
  it.each([
    { generator: 'init', args: [], expected: 'nx.json' },
    {
      generator: 'package',
      args: ['local-smoke', '--packageVersion=0.0.1'],
      expected: 'packages/local-smoke/package.json',
    },
  ])(
    'previews $generator from source without changing authored configuration',
    ({ generator, args, expected }) => {
      const authored = ['package.json', 'nx.json'].map((path) =>
        readFileSync(join(workspaceRoot, path), 'utf8'),
      );
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NX_DAEMON: 'false',
        NX_INTERACTIVE: 'false',
        NX_NO_CLOUD: 'true',
      };
      delete env.NX_PREFER_NODE_STRIP_TYPES;
      delete env.NX_PREFER_TS_NODE;

      const result = spawnSync(
        process.execPath,
        [
          nxCli,
          'generate',
          `@araketski/nx-pi:${generator}`,
          ...args,
          '--dry-run',
          '--no-interactive',
        ],
        { cwd: workspaceRoot, env, encoding: 'utf8', timeout: 60_000 },
      );
      expect(result.status, result.stdout + result.stderr || String(result.error)).toBe(0);
      expect(result.stdout).toContain(expected);
      expect(
        ['package.json', 'nx.json'].map((path) => readFileSync(join(workspaceRoot, path), 'utf8')),
      ).toEqual(authored);
      expect(existsSync(join(workspaceRoot, 'packages/local-smoke'))).toBe(false);
    },
  );
});
