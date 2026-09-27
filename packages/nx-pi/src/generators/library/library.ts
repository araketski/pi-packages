import { readJson, writeJson, type Tree } from '@nx/devkit';
import { libraryGenerator as nxLibraryGenerator } from '@nx/js';
import { preparePackage } from '../package/package';
import type { LibraryGeneratorSchema } from './schema';

/**
 * @mara implements REQ-NXPI-IDENTITY
 * @mara implements REQ-NXPI-PRESERVE
 * @mara implements REQ-NXPI-LIBRARY-EXPORTS
 * @mara implements DES-NXPI-GENERATOR-INTERFACE
 * @mara implements DES-NXPI-VALIDATION-TARGETS
 * @mara implements DES-NXPI-LIBRARY-CONTRACT
 */
export async function libraryGenerator(tree: Tree, options: LibraryGeneratorSchema) {
  const { root, manifest } = preparePackage(tree, options);
  if (!tree.exists('nx.json')) {
    throw new Error('nx-pi library: root nx.json is required; run in an existing Nx workspace.');
  }
  const allowed = {
    linter: ['none', 'eslint', 'oxlint'],
    formatter: ['none', 'prettier', 'oxfmt'],
    unitTestRunner: ['none', 'jest', 'vitest'],
  } as const;
  for (const field of ['linter', 'formatter', 'unitTestRunner'] as const) {
    if (
      options[field] !== undefined &&
      !(allowed[field] as readonly unknown[]).includes(options[field])
    ) {
      throw new Error(`nx-pi library: --${field} is not a supported Nx JS option.`);
    }
  }
  if (options.strict !== undefined && typeof options.strict !== 'boolean') {
    throw new Error('nx-pi library: --strict must be boolean.');
  }
  const opts = {
    directory: root,
    importPath: manifest.name as string,
    bundler: 'tsc' as const,
    tags: 'nx-pi:library',
    publishable: false,
    useProjectJson: true,
    minimal: true,
    skipFormat: true,
    strict: options.strict ?? true,
    linter: options.linter ?? 'none',
    unitTestRunner: options.unitTestRunner ?? 'none',
    formatter: options.formatter ?? 'none',
    skipPackageJson: false,
  };
  const task = await nxLibraryGenerator(tree, opts);
  const projectPath = `${root}/project.json`;
  const project = readJson<{
    targets?: { build?: { executor?: string; options?: Record<string, unknown> } };
  }>(tree, projectPath);
  const build = project.targets?.build;
  if (build?.executor === '@nx/js:tsc' && build.options) {
    // Nx's classic setup builds outside the package by default. Keep its
    // executor/config but place the compilation in the published package.
    build.options.outputPath = `${root}/dist`;
    build.options.rootDir = `${root}/src`;
    build.options.generatePackageJson = false;
    writeJson(tree, projectPath, project);
  }
  const path = `${root}/package.json`;
  const nxManifest = readJson<Record<string, unknown>>(tree, path);
  delete nxManifest.private;
  writeJson(tree, path, {
    ...nxManifest,
    ...manifest,
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: nxManifest.exports ?? {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './package.json': './package.json',
    },
    files: ['dist', '!**/*.tsbuildinfo'],
  });
  // Compiler and selected integrations are Nx-owned; run its install task so
  // the generated build does not point at undeclared compiler dependencies.
  return task;
}

export default libraryGenerator;
