import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const nxCli = join(workspaceRoot, 'node_modules/nx/dist/bin/nx.js');

// @mara implements VER-RELEASE-FIXED-GROUP
it('selects every repository package in one fixed Nx Release group', () => {
  const result = spawnSync(process.execPath, [nxCli, 'release', '--printConfig=debug'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      NX_DAEMON: 'false',
      NX_NO_CLOUD: 'true',
      NX_PREFER_NODE_STRIP_TYPES: 'false',
    },
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const internalConfig = result.stdout.match(
    /START FINAL INTERNAL CONFIG\s*([\s\S]*?)\s*=+ END FINAL INTERNAL CONFIG/,
  );
  expect(internalConfig, result.stdout).not.toBeNull();
  const release = JSON.parse(internalConfig![1]) as {
    projectsRelationship: string;
    releaseTag: { pattern: string };
    groups: { __default__: { projects: string[] } };
  };

  const expectedProjects = readdirSync(join(workspaceRoot, 'packages'))
    .filter((directory) => existsSync(join(workspaceRoot, 'packages', directory, 'package.json')))
    .map((directory) => {
      if (directory === 'nx-pi') return 'nx-pi';
      const manifest = JSON.parse(
        readFileSync(join(workspaceRoot, 'packages', directory, 'package.json'), 'utf8'),
      ) as { name: string };
      return manifest.name;
    })
    .sort();
  expect(release.projectsRelationship).toBe('fixed');
  expect(release.releaseTag.pattern).toBe('v{version}');
  expect(release.groups.__default__.projects.sort()).toEqual(expectedProjects);
  const authored = JSON.parse(readFileSync(join(workspaceRoot, 'nx.json'), 'utf8')) as {
    release?: { projects?: string[] };
  };
  expect(authored.release?.projects).toEqual(['packages/*']);
});
