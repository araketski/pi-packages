import { writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CreateNodesContext, ExecutorContext } from '@nx/devkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodes } from '../index';
import piCheckExecutor from '../executors/pi-check/executor';

let root: string;
function save(path: string, data: unknown): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), JSON.stringify(data));
}
function resource(path: string): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), 'throw new Error("this source must not be executed")');
}
const context = () => ({ workspaceRoot: root, nxJsonConfiguration: {} }) as CreateNodesContext;
const files = [
  'packages/resource/package.json',
  'packages/resource/project.json',
  'packages/library/package.json',
  'packages/library/project.json',
  'packages/other/package.json',
  'packages/other/project.json',
  'packages/pi-named/package.json',
];

beforeEach(() => {
  root = mkdtempSync(join(process.env.NX_PI_TEST_TMPDIR ?? tmpdir(), 'nx-pi-validation-'));
  save('packages/resource/package.json', {
    name: '@fixture/pi-resource',
    pi: { extensions: ['./src/entry.ts'] },
  });
  save('packages/resource/project.json', { name: 'resource' });
  resource('packages/resource/src/entry.ts');
  save('packages/library/package.json', { name: '@fixture/lib' });
  save('packages/library/project.json', { name: 'library', tags: ['nx-pi:library'] });
  save('packages/other/package.json', { name: '@fixture/other' });
  save('packages/other/project.json', { name: 'other' });
  save('packages/pi-named/package.json', { name: '@fixture/pi-named' });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

// @mara checks REQ-NXPI-VALIDATION-ELIGIBILITY
// @mara checks REQ-NXPI-VALIDATION-TARGET-NAMES
// @mara checks DES-NXPI-VALIDATION-TARGETS
describe('source target inference', () => {
  it('targets manifested resources and tagged libraries with functional packed validation', async () => {
    const nodes = await createNodes[1](files, undefined, context());
    const projects: Record<string, { targets?: Record<string, unknown> }> = Object.assign(
      {},
      ...nodes.map(([, result]) => result.projects),
    );
    expect(Object.keys(projects)).toEqual(['packages/resource', 'packages/library']);
    expect(projects['packages/resource'].targets).toEqual({
      'pi-check': { executor: '@araketski/nx-pi:pi-check' },
      'pi-check-package': { executor: '@araketski/nx-pi:pi-check-package' },
    });
    expect(projects['packages/library'].targets).toEqual({
      'pi-check': { executor: '@araketski/nx-pi:pi-check' },
      'pi-check-package': { executor: '@araketski/nx-pi:pi-check-package' },
    });
  });

  it('recognizes a library tag authored in package.json nx.tags alongside project tags', async () => {
    save('packages/library/package.json', {
      name: '@fixture/lib',
      nx: { tags: ['nx-pi:library'] },
    });
    save('packages/library/project.json', { name: 'library', tags: ['team:shared'] });
    const nodes = await createNodes[1](files, undefined, context());
    const projects = Object.assign({}, ...nodes.map(([, result]) => result.projects));
    expect(projects).toHaveProperty('packages/library');
  });

  it('uses configured source and packed names only for eligible project kinds', async () => {
    const nodes = await createNodes[1](
      files,
      { sourceTargetName: 'validate-pi', packageTargetName: 'inspect-tarball' },
      context(),
    );
    const projects = Object.assign({}, ...nodes.map(([, result]) => result.projects));
    expect(projects['packages/resource'].targets).toHaveProperty('validate-pi');
    expect(projects['packages/resource'].targets).toHaveProperty('inspect-tarball');
    expect(projects['packages/library'].targets).toHaveProperty('inspect-tarball');
  });

  it.each(['project', 'nx', 'script'])(
    'fails before merging an authored %s target',
    async (source) => {
      const name = 'pi-check';
      if (source === 'project')
        save('packages/resource/project.json', {
          name: 'resource',
          targets: { [name]: { command: 'echo mine' } },
        });
      if (source === 'nx')
        save('packages/resource/package.json', {
          name: '@fixture/pi-resource',
          pi: {},
          nx: { targets: { [name]: { command: 'echo mine' } } },
        });
      if (source === 'script')
        save('packages/resource/package.json', {
          name: '@fixture/pi-resource',
          pi: {},
          scripts: { [name]: 'echo mine' },
        });
      expect(() => createNodes[1](files, undefined, context())).toThrow(
        /resource.*already.*pi-check.*(project|package)\.json/i,
      );
    },
  );

  it('ignores an unrelated project with a colliding target', async () => {
    save('packages/other/project.json', {
      name: 'other',
      targets: { 'pi-check': { command: 'echo mine' } },
    });
    expect(createNodes[1](files, undefined, context())).toHaveLength(2);
  });

  it.each([
    { sourceTargetName: '' },
    { sourceTargetName: 5 },
    { sourceTargetName: 'bad name' },
    { sourceTargetName: 'pi-check', other: true },
  ])('rejects invalid plugin options %j', async (options) => {
    expect(() => createNodes[1](files, options as never, context())).toThrow(
      /options|sourceTargetName/,
    );
  });

  it('retains malformed pi packages for diagnosis by the source check', async () => {
    save('packages/resource/package.json', { name: '@fixture/pi-resource', pi: null });
    const nodes = await createNodes[1](files, undefined, context());
    expect(nodes[0][1].projects?.['packages/resource']?.targets).toHaveProperty('pi-check');
  });
});

// @mara checks DES-NXPI-PACKED-INPUT-CONTRACT
// @mara checks DES-NXPI-PACKED-LIBRARY
describe('packed target inference', () => {
  it('infers an explicit-input executor for manifested resources', async () => {
    const nodes = await createNodes[1](files, undefined, context());
    const projects = Object.assign({}, ...nodes.map(([, result]) => result.projects));
    expect(projects['packages/resource'].targets['pi-check-package']).toEqual({
      executor: '@araketski/nx-pi:pi-check-package',
    });
    expect(projects['packages/library'].targets).toHaveProperty('pi-check-package');
  });

  it('infers the same packed checker for tagged libraries without a pi manifest', async () => {
    const nodes = await createNodes[1](files, undefined, context());
    const projects = Object.assign({}, ...nodes.map(([, result]) => result.projects));
    expect(projects['packages/library'].targets['pi-check-package']).toEqual({
      executor: '@araketski/nx-pi:pi-check-package',
    });
    expect(projects['packages/other']).toBeUndefined();
  });

  it.each(['project.json', 'package.json nx.targets', 'package.json scripts'])(
    'rejects an authored packed-target collision in %s',
    (source) => {
      if (source === 'project.json')
        save('packages/resource/project.json', {
          name: 'resource',
          targets: { 'pi-check-package': { command: 'echo mine' } },
        });
      if (source === 'package.json nx.targets')
        save('packages/resource/package.json', {
          name: '@fixture/pi-resource',
          pi: {},
          nx: { targets: { 'pi-check-package': { command: 'echo mine' } } },
        });
      if (source === 'package.json scripts')
        save('packages/resource/package.json', {
          name: '@fixture/pi-resource',
          pi: {},
          scripts: { 'pi-check-package': 'echo mine' },
        });
      expect(() => createNodes[1](files, undefined, context())).toThrow(
        /resource.*pi-check-package.*(project|package)\.json/,
      );
    },
  );

  it('rejects authored library packed-target collisions too', () => {
    save('packages/library/project.json', {
      name: 'library',
      tags: ['nx-pi:library'],
      targets: { 'pi-check-package': { command: 'echo mine' } },
    });
    expect(() => createNodes[1](files, undefined, context())).toThrow(
      /library.*pi-check-package.*project\.json/,
    );
  });

  it('requires distinct source and packed target names', () => {
    expect(() => createNodes[1](files, { packageTargetName: 'pi-check' }, context())).toThrow(
      /packageTargetName|distinct/,
    );
  });
});

// @mara checks REQ-NXPI-SOURCE-VALIDATION
// @mara checks DES-NXPI-VALIDATION-TARGETS
describe('source check execution', () => {
  const exec = (projectName: string) =>
    piCheckExecutor({}, {
      root,
      projectName,
      projectsConfigurations: {
        projects: {
          resource: { root: 'packages/resource' },
          library: { root: 'packages/library' },
        },
      },
    } as unknown as ExecutorContext);

  it('accepts a declared resource and a library without compiled output', async () => {
    expect(await exec('resource')).toEqual({ success: true });
    expect(await exec('library')).toEqual({ success: true });
  });

  it('rejects a missing declared resource with the project and path', async () => {
    save('packages/resource/package.json', {
      name: '@fixture/pi-resource',
      pi: { extensions: ['./src/missing.ts'] },
    });
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*src\/missing\.ts/);
  });

  it('rejects malformed pi metadata rather than letting it pass', async () => {
    save('packages/resource/package.json', { name: '@fixture/pi-resource', pi: null });
    await expect(exec('resource')).rejects.toThrow(/resource.*pi.*object/);
  });

  const declared = (type: string, entries: string[]) =>
    save('packages/resource/package.json', {
      name: '@fixture/pi-resource',
      pi: { [type]: entries },
    });

  it('accepts wildcard, recursive, brace and direct hidden-root patterns without executing contents', async () => {
    resource('packages/resource/src/nested/second.ts');
    resource('packages/resource/.hidden/secret.ts');
    declared('extensions', ['./src/**/*.ts', './.hidden/*.ts']);
    expect(await exec('resource')).toEqual({ success: true });
    declared('extensions', ['./src/{entry,nested/second}.ts']);
    expect(await exec('resource')).toEqual({ success: true });
  });

  it('does not traverse hidden or symlinked directories via wildcard recursion', async () => {
    resource('outside.ts');
    mkdirSync(join(root, 'packages/resource/src/.hidden'), { recursive: true });
    symlinkSync(join(root, 'outside.ts'), join(root, 'packages/resource/src/.hidden/escape.ts'));
    mkdirSync(join(root, 'outside'), { recursive: true });
    resource('outside/escape.ts');
    symlinkSync(join(root, 'outside'), join(root, 'packages/resource/src/linked'));
    declared('extensions', ['./src/**/*.ts']);
    expect(await exec('resource')).toEqual({ success: true });
  });

  it('accepts matching directories for skill roots', async () => {
    resource('packages/resource/skills/pdf/SKILL.md');
    declared('skills', ['./skills/*']);
    expect(await exec('resource')).toEqual({ success: true });
  });

  it.each([
    ['!./src/nested/*.ts', './src/**/*.ts'],
    ['./src/**/*.ts', '!./src/nested/*.ts'],
    ['./src/*.ts', '!./src/*.ts'],
  ])('supports order-independent exclusions %j', async (...entries) => {
    resource('packages/resource/src/nested/second.ts');
    declared('extensions', entries);
    expect(await exec('resource')).toEqual({ success: true });
  });

  it('accepts legitimate filenames containing two consecutive dots', async () => {
    resource('packages/resource/src/archive..ts');
    declared('extensions', ['./src/archive..ts']);
    expect(await exec('resource')).toEqual({ success: true });
  });

  it('allows unmatched exclusions but rejects unmatched positive patterns', async () => {
    declared('extensions', ['./src/*.ts', '!./src/nothing*.ts']);
    expect(await exec('resource')).toEqual({ success: true });
    declared('extensions', ['./src/nothing*.ts']);
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*nothing.*match|exist/i);
  });

  it('fails an exclusion-only declaration and a blank entry', async () => {
    declared('extensions', ['!./src/*.ts']);
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*positive|exclusion/i);
    declared('extensions', ['']);
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*invalid|empty/i);
  });

  it.each(['../escape.ts', '/tmp/escape.ts', './src/../*.ts', '!../*.ts'])(
    'rejects paths escaping the package root: %s',
    async (entry) => {
      declared('extensions', ['./src/entry.ts', entry]);
      await expect(exec('resource')).rejects.toThrow(
        /resource.*extensions.*escape|outside|parent|absolute/i,
      );
    },
  );

  it('rejects selected symlinks that escape the package root', async () => {
    resource('outside.ts');
    symlinkSync(join(root, 'outside.ts'), join(root, 'packages/resource/src/link.ts'));
    declared('extensions', ['./src/*.ts']);
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*symlink|escapes/i);
  });

  it.each(['./src/**/*.ts', './src/broken.ts'])(
    'reports a broken selected symlink for %s with project and declaration',
    async (pattern) => {
      symlinkSync(join(root, 'outside-missing.ts'), join(root, 'packages/resource/src/broken.ts'));
      declared('extensions', [pattern]);
      await expect(exec('resource')).rejects.toThrow(
        /resource.*extensions.*broken|src\/\*\*\/\*\.ts/i,
      );
    },
  );

  it('validates only selected matches after exclusions', async () => {
    resource('outside.ts');
    symlinkSync(join(root, 'outside.ts'), join(root, 'packages/resource/src/link.ts'));
    declared('extensions', ['./src/*.ts', '!./src/link.ts']);
    expect(await exec('resource')).toEqual({ success: true });
    declared('extensions', ['./src/*.ts']);
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*symlink|escapes/i);
  });

  it('rejects directly named symlinked roots resolving outside the package', async () => {
    mkdirSync(join(root, 'outside'), { recursive: true });
    resource('outside/escape.ts');
    symlinkSync(join(root, 'outside'), join(root, 'packages/resource/shortcut'));
    declared('extensions', ['./shortcut/*.ts']);
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*shortcut.*escapes/i);
  });

  it('permits directly named symlinked roots that resolve inside the package', async () => {
    mkdirSync(join(root, 'packages/resource/linked'), { recursive: true });
    resource('packages/resource/linked/a.ts');
    symlinkSync(join(root, 'packages/resource/linked'), join(root, 'packages/resource/shortcut'));
    declared('extensions', ['./shortcut/*.ts']);
    expect(await exec('resource')).toEqual({ success: true });
  });
});
