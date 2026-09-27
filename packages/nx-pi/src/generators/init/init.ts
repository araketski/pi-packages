import { NX_VERSION, readJson, writeJson, type Tree } from '@nx/devkit';
import validatePackageName from 'validate-npm-package-name';
import type { InitGeneratorSchema } from './schema';
import { assertSupportedRuntime } from './runtime';

const plugin = '@araketski/nx-pi';
const fields = new Set(['name', 'license', 'repository', 'homepage', 'bugs']);

function fail(message: string): never {
  throw new Error(`nx-pi init: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(tree: Tree, path: string): Record<string, unknown> {
  if (!tree.exists(path)) {
    fail(`root ${path} is required; run init in an existing Nx workspace.`);
  }
  let value: unknown;
  try {
    value = readJson<object>(tree, path);
  } catch {
    fail(`root ${path} cannot be parsed; repair its JSON before running init.`);
  }
  if (!isObject(value)) {
    fail(`root ${path} must contain a JSON object.`);
  }
  return value;
}

function validateInput(field: string, value: unknown): asserts value is string {
  if (!fields.has(field)) {
    fail(`unknown option --${field}; use name, license, repository, homepage, or bugs.`);
  }
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(`--${field} must be a nonblank string without surrounding whitespace.`);
  }
  if (field === 'repository' || field === 'homepage' || field === 'bugs') {
    const protocols =
      field === 'repository'
        ? ['http:', 'https:', 'git:', 'ssh:', 'git+https:', 'git+ssh:']
        : ['http:', 'https:'];
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      fail(`--${field} must be an absolute URL with a hostname.`);
    }
    if (!url.hostname || !protocols.includes(url.protocol)) {
      fail(`--${field} must use ${protocols.join(', ')} with a hostname.`);
    }
  }
}

function prepareMetadata(manifest: Record<string, unknown>, options: InitGeneratorSchema): boolean {
  let changed = false;
  for (const [field, value] of Object.entries(options)) {
    validateInput(field, value);
    if (Object.hasOwn(manifest, field)) {
      const current = manifest[field];
      const comparable =
        (field === 'repository' || field === 'bugs') && isObject(current) ? current.url : current;
      if (comparable !== value) {
        fail(
          `root package.json ${field} conflicts with --${field}; remove the option or explicitly edit the existing field.`,
        );
      }
    } else {
      manifest[field] = value;
      changed = true;
    }
  }
  const name = manifest.name;
  if (
    typeof name !== 'string' ||
    !name.startsWith('@') ||
    !validatePackageName(name).validForNewPackages
  ) {
    fail(
      'root package.json name must be a valid scoped npm name (for example @acme/workspace); supply --name when absent, or explicitly repair the existing name.',
    );
  }
  return changed;
}

function prepareRegistration(nx: Record<string, unknown>): boolean {
  const plugins = Object.hasOwn(nx, 'plugins') ? nx.plugins : [];
  if (!Array.isArray(plugins)) {
    fail('nx.json plugins must be an array; repair it before running init.');
  }
  let ownRegistrations = 0;
  for (const entry of plugins) {
    const name: unknown = isObject(entry) ? entry.plugin : entry;
    if (typeof name !== 'string' || !name.trim()) {
      fail('nx.json plugins entries must be nonblank strings or objects with a plugin name.');
    }
    if (name === plugin) {
      ownRegistrations++;
      if (isObject(entry) && Object.hasOwn(entry, 'options') && !isObject(entry.options)) {
        fail(`nx.json plugins options for ${plugin} must be an object.`);
      }
    }
  }
  if (ownRegistrations > 1) {
    fail(`nx.json plugins contains duplicate ${plugin} registrations; keep a single registration.`);
  }
  if (ownRegistrations === 1) {
    return false;
  }
  nx.plugins = [...plugins, plugin];
  return true;
}

/**
 * @mara implements REQ-NXPI-INIT
 * @mara implements REQ-NXPI-METADATA-SOURCE
 */
export async function initGenerator(tree: Tree, options: InitGeneratorSchema = {}): Promise<void> {
  assertSupportedRuntime(NX_VERSION, process.versions.node);
  const manifest = readObject(tree, 'package.json');
  const nx = readObject(tree, 'nx.json');
  const metadataChanged = prepareMetadata(manifest, options);
  const registrationChanged = prepareRegistration(nx);

  // Validate everything before authoring either file. Nx owns dry-run/commit.
  if (metadataChanged) {
    writeJson(tree, 'package.json', manifest);
  }
  if (registrationChanged) {
    writeJson(tree, 'nx.json', nx);
  }
  // No dependency installation task or formatting callback is returned.
}

export default initGenerator;
