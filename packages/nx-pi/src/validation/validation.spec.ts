import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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
  it('targets only manifested resources and tagged libraries without a packed placeholder', async () => {
    const nodes = await createNodes[1](files, undefined, context());
    const projects: Record<string, { targets?: Record<string, unknown> }> = Object.assign(
      {},
      ...nodes.map(([, result]) => result.projects),
    );
    expect(Object.keys(projects)).toEqual(['packages/resource', 'packages/library']);
    for (const project of Object.values(projects)) {
      expect(project.targets).toEqual({ 'pi-check': { executor: '@araketski/nx-pi:pi-check' } });
    }
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

  it('uses a configured source name without inferring a packed target', async () => {
    const nodes = await createNodes[1](files, { sourceTargetName: 'validate-pi' }, context());
    const projects = Object.assign({}, ...nodes.map(([, result]) => result.projects));
    expect(projects['packages/resource'].targets).toHaveProperty('validate-pi');
    expect(projects['packages/resource'].targets).not.toHaveProperty('pi-check-package');
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

  it('rejects unsupported globs and unsafe paths without accessing them', async () => {
    save('packages/resource/package.json', {
      name: '@fixture/pi-resource',
      pi: { extensions: ['../escape.ts'] },
    });
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*escape\.ts/);
    save('packages/resource/package.json', {
      name: '@fixture/pi-resource',
      pi: { extensions: ['./src/*.ts'] },
    });
    await expect(exec('resource')).rejects.toThrow(/resource.*extensions.*glob/i);
  });
});
