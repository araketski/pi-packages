import { readJson, writeJson, type Tree } from '@nx/devkit';
import validatePackageName = require('validate-npm-package-name');
import type { PackageGeneratorSchema } from './schema';

function fail(message: string): never {
  throw new Error(`nx-pi package: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkUrl(value: unknown, field: string, protocols: string[]): void {
  let url: URL;
  try {
    if (typeof value !== 'string' || !value || value.trim() !== value) throw new Error();
    url = new URL(value);
  } catch {
    fail(`root package.json ${field} must be an absolute URL with a hostname.`);
  }
  if (!url.hostname || !protocols.includes(url.protocol)) {
    fail(`root package.json ${field} must use ${protocols.join(', ')} with a hostname.`);
  }
}

const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * @mara implements REQ-NXPI-IDENTITY
 * @mara implements REQ-NXPI-PRESERVE
 * @mara implements REQ-NXPI-METADATA-SOURCE
 * @mara implements DES-NXPI-GENERATOR-INTERFACE
 * @mara implements DES-NXPI-PACKAGE-CONTRACT
 */
export function preparePackage(
  tree: Tree,
  options: PackageGeneratorSchema,
): {
  root: string;
  manifest: Record<string, unknown>;
} {
  const { name, packageVersion } = options;
  if (typeof name !== 'string' || !identifier.test(name) || name.startsWith('pi-')) {
    fail(
      'name must be an unprefixed lowercase kebab-case name, such as example; do not include pi-.',
    );
  }
  if (typeof packageVersion !== 'string' || !semver.test(packageVersion)) {
    fail('--packageVersion must be an explicit valid semantic version (for example 1.0.0).');
  }

  const root = `packages/${name}`;
  if (tree.exists(root) || tree.children('packages').includes(name)) {
    fail(`${root} already exists; choose an unused package name. No files were changed.`);
  }
  if (!tree.exists('package.json')) {
    fail('root package.json is required; initialize the workspace first.');
  }
  let manifest: unknown;
  try {
    manifest = readJson(tree, 'package.json');
  } catch {
    fail('root package.json cannot be parsed; repair its JSON before creating a package.');
  }
  if (!isObject(manifest)) {
    fail('root package.json must contain a JSON object.');
  }
  const rootName = manifest.name;
  if (
    typeof rootName !== 'string' ||
    !rootName.startsWith('@') ||
    !validatePackageName(rootName).validForNewPackages
  ) {
    fail('root package.json name must be a valid scoped npm name, such as @acme/workspace.');
  }
  if (
    typeof manifest.license !== 'string' ||
    !manifest.license ||
    manifest.license.trim() !== manifest.license
  ) {
    fail(
      'root package.json license must be a nonblank license declaration before creating a package.',
    );
  }
  const packageName = `${rootName.slice(0, rootName.indexOf('/'))}/pi-${name}`;
  if (!validatePackageName(packageName).validForNewPackages) {
    fail(
      `derived package name ${packageName} is invalid; use a shorter package name or repair root package.json name.`,
    );
  }
  const generated: Record<string, unknown> = {
    name: packageName,
    version: packageVersion,
    license: manifest.license,
  };
  for (const field of ['repository', 'homepage', 'bugs']) {
    if (!Object.hasOwn(manifest, field)) continue;
    const value = manifest[field];
    if (field === 'repository' || field === 'bugs') {
      if (typeof value !== 'string' && !isObject(value)) {
        fail(`root package.json ${field} must be a URL or an object with a url property.`);
      }
    }
    checkUrl(
      isObject(value) ? value.url : value,
      field,
      field === 'repository'
        ? ['http:', 'https:', 'git:', 'ssh:', 'git+https:', 'git+ssh:']
        : ['http:', 'https:'],
    );
    generated[field] = value;
  }
  return { root, manifest: generated };
}

/** @mara implements DES-NXPI-PACKAGE-CONTRACT */
export async function packageGenerator(tree: Tree, options: PackageGeneratorSchema): Promise<void> {
  const { root, manifest } = preparePackage(tree, options);
  // All preconditions are checked before the first write; Nx owns dry-run/commit.
  writeJson(tree, `${root}/package.json`, { ...manifest, pi: {} });
}

export default packageGenerator;
