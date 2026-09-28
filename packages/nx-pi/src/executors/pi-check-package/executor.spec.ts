import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { create } from 'tar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import piCheckPackageExecutor from './executor';

let root: string;
const manifest = {
  name: '@fixture/pi-resource',
  pi: {
    skills: ['./skills/review'],
    prompts: ['./prompts/review.md'],
    themes: ['./themes/soft.json'],
    extensions: ['./extensions/entry.ts'],
  },
};
function save(path: string, content: unknown) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, typeof content === 'string' ? content : JSON.stringify(content));
}
function packaged(path: string, content: unknown) {
  save(`payload/package/${path}`, content);
}
async function pack() {
  const tarball = join(root, 'resource.tgz');
  await create({ file: tarball, gzip: true, cwd: join(root, 'payload') }, ['package']);
  return tarball;
}
function context() {
  return {
    root,
    projectName: 'resource',
    projectsConfigurations: { projects: { resource: { root: 'packages/resource' } } },
  } as unknown as ExecutorContext;
}
async function check(tarball: string) {
  return piCheckPackageExecutor({ tarball }, context());
}

beforeEach(() => {
  root = mkdtempSync(join(process.env.NX_PI_TEST_TMPDIR ?? tmpdir(), 'nx-pi-packed-'));
  save('packages/resource/package.json', manifest);
  packaged('package.json', manifest);
  packaged(
    'skills/review/SKILL.md',
    '---\nname: review\ndescription: Review changes.\n---\nReview carefully.',
  );
  packaged('prompts/review.md', 'Review changes.');
  packaged('themes/soft.json', { name: 'soft', colors: {} });
  packaged(
    'extensions/entry.ts',
    "import { label } from './helpers/label.ts';\nexport default () => label;",
  );
  packaged('extensions/helpers/label.ts', "export { label } from './nested.ts';");
  packaged('extensions/helpers/nested.ts', "export const label = 'ok';");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// @mara implements VER-NXPI-PACKED-STATIC
describe('explicit packed resource check', () => {
  it('reads a complete packed fixture without modifying authored source', async () => {
    const tarball = await pack();
    const source = readFileSync(join(root, 'packages/resource/package.json'), 'utf8');
    expect(await check(tarball)).toEqual({ success: true });
    expect(readFileSync(join(root, 'packages/resource/package.json'), 'utf8')).toBe(source);
  });

  it.each([
    ['declared prompt', 'prompts/review.md', /pi\.prompts.*prompts\/review\.md/],
    ['declared extension', 'extensions/entry.ts', /pi\.extensions.*extensions\/entry\.ts/],
    ['skill entrypoint', 'skills/review/SKILL.md', /pi\.skills.*SKILL\.md/],
    [
      'nested static helper',
      'extensions/helpers/nested.ts',
      /extensions\/entry\.ts.*nested\.ts|label\.ts.*nested\.ts/,
    ],
  ])('fails on packed missing %s even while source is present', async (_kind, member, message) => {
    rmSync(join(root, 'payload/package', member));
    await expect(check(await pack())).rejects.toThrow(message);
    expect(readFileSync(join(root, 'packages/resource/package.json'), 'utf8')).toContain(
      'pi-resource',
    );
  });

  it('ignores external imports, type-only imports, and excluded extension entries', async () => {
    const value = {
      ...manifest,
      pi: {
        ...manifest.pi,
        extensions: ['./extensions/*.ts', '!./extensions/unused.ts'],
      },
    };
    save('packages/resource/package.json', value);
    packaged('package.json', value);
    packaged(
      'extensions/entry.ts',
      "import type { API } from './unpacked-types.ts'; import { type Other } from './unpacked-named.ts'; export { type Unused } from './unpacked-export.ts'; import { label } from './helpers/label.ts'; import 'runtime-peer'; export default () => label;",
    );
    packaged('extensions/unused.ts', "import './not-packed.ts';");
    expect(await check(await pack())).toEqual({ success: true });
  });

  it('resolves a packed helper at the package root', async () => {
    packaged('extensions/entry.ts', "export { label } from '../helper';");
    packaged('helper.ts', "export const label = 'ok';");
    expect(await check(await pack())).toEqual({ success: true });
  });

  it('does not mistake declarations for a runtime helper', async () => {
    packaged('extensions/helpers/label.ts', "export { label } from './nested';");
    rmSync(join(root, 'payload/package/extensions/helpers/nested.ts'));
    packaged('extensions/helpers/nested.d.ts', 'export declare const label: string;');
    await expect(check(await pack())).rejects.toThrow(/missing packed helper.*nested/);
  });

  it('rejects traversal paths inside the archive without unpacking them', async () => {
    save('outside', 'not part of the npm package');
    const tarball = join(root, 'traversal.tgz');
    await create({ file: tarball, gzip: true, preservePaths: true, cwd: join(root, 'payload') }, [
      'package',
      '../outside',
    ]);
    await expect(check(tarball)).rejects.toThrow(/unsafe.*outside/);
  });

  it('rejects unsafe link entries and duplicate archive members', async () => {
    symlinkSync('./helpers/label.ts', join(root, 'payload/package/extensions/shortcut.ts'));
    await expect(check(await pack())).rejects.toThrow(/unsafe.*shortcut\.ts/);
    rmSync(join(root, 'payload/package/extensions/shortcut.ts'));
    const tarball = join(root, 'duplicate.tgz');
    await create({ file: tarball, gzip: true, cwd: join(root, 'payload') }, [
      'package',
      'package/package.json',
    ]);
    await expect(check(tarball)).rejects.toThrow(/duplicate.*package\.json/);
  });

  it.each([
    [{ extensions: ['../elsewhere.ts'] }, /pi\.extensions.*unsafe/],
    [{ extensions: ['!./extensions/*.ts'] }, /pi\.extensions.*exclusions/],
    [{ prompts: ['./missing/*.md'] }, /pi\.prompts.*missing/],
    [{ themes: [''] }, /pi\.themes.*invalid/],
  ])('rejects invalid packed pi declarations %j', async (pi, message) => {
    packaged('package.json', { ...manifest, pi });
    await expect(check(await pack())).rejects.toThrow(message);
  });

  it('rejects invalid archives, absent input, and a mismatched packed identity', async () => {
    save('broken.tgz', 'not an archive');
    await expect(check(join(root, 'broken.tgz'))).rejects.toThrow(/tarball|package\.json/);
    await expect(piCheckPackageExecutor({}, context())).rejects.toThrow(/tarball/);
    await expect(check('missing.tgz')).rejects.toThrow(/tarball|missing\.tgz/);
    packaged('package.json', { ...manifest, name: '@fixture/another' });
    await expect(check(await pack())).rejects.toThrow(/name|identity/);
  });
});
