import { getProjects, readJson, writeJson, type Tree } from '@nx/devkit';
import type { ExtensionGeneratorSchema } from './schema';

const piPeer = '@earendil-works/pi-coding-agent';

function fail(message: string): never {
  throw new Error(`nx-pi extension: ${message}`);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @mara implements REQ-NXPI-PRESERVE
 * @mara implements REQ-NXPI-RESOURCE-SOURCE
 * @mara implements DES-NXPI-EXTENSION-CONTRACT
 */
export async function extensionGenerator(
  tree: Tree,
  options: ExtensionGeneratorSchema,
): Promise<void> {
  const { name, project } = options;
  if (typeof name !== 'string' || name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    fail('name must be lowercase kebab-case (at most 64 characters), without path separators.');
  }
  if (typeof project !== 'string' || !project.trim())
    fail('--project must name an existing Pi package project.');
  const configured = getProjects(tree).get(project)?.root;
  // Nx generator Trees do not expose package.json-inferred projects through getProjects.
  const generated = tree.children('packages').filter((name) => {
    const path = `packages/${name}/package.json`;
    if (!tree.exists(path)) return false;
    try {
      return readJson(tree, path).name === project;
    } catch {
      return false;
    }
  });
  if (!configured && generated.length !== 1) {
    fail(`project ${project} was not found unambiguously; choose an existing Pi package project.`);
  }
  const root = configured ?? `packages/${generated[0]}`;
  const manifestPath = `${root}/package.json`;
  if (!tree.exists(manifestPath)) fail(`project ${project} requires ${manifestPath}.`);
  let manifest: unknown;
  try {
    manifest = readJson(tree, manifestPath);
  } catch {
    fail(`${manifestPath} cannot be parsed; repair its JSON before adding an extension.`);
  }
  if (!isObject(manifest)) fail(`${manifestPath} must contain an object.`);
  if (!isObject(manifest.pi))
    fail(`${manifestPath} pi must be an object (a Pi resource package is required).`);
  const pi = manifest.pi;
  if (
    pi.extensions !== undefined &&
    (!Array.isArray(pi.extensions) ||
      pi.extensions.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    fail(`${manifestPath} pi.extensions must be an array of paths.`);
  }
  if (
    manifest.files !== undefined &&
    (!Array.isArray(manifest.files) ||
      manifest.files.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    fail(`${manifestPath} files must be an array of paths when present.`);
  }
  if (manifest.peerDependencies !== undefined && !isObject(manifest.peerDependencies)) {
    fail(`${manifestPath} peerDependencies must be an object when present.`);
  }
  const peers = manifest.peerDependencies ?? {};
  if (
    isObject(peers) &&
    Object.hasOwn(peers, piPeer) &&
    (typeof peers[piPeer] !== 'string' || !peers[piPeer].trim())
  ) {
    fail(`${manifestPath} peerDependencies.${piPeer} must be a nonblank version range.`);
  }
  const extensionRoot = `${root}/extensions/${name}`;
  if (tree.exists(extensionRoot) || tree.children(`${root}/extensions`).includes(name)) {
    fail(`${extensionRoot} already exists; no files were changed.`);
  }

  // Preconditions precede all writes. This type-only import emits no runtime dependency.
  tree.write(
    `${extensionRoot}/index.ts`,
    `import type { ExtensionAPI } from '${piPeer}';\n\nexport default function (pi: ExtensionAPI): void {\n  // TODO: Register this extension's tools, commands, or event handlers.\n  void pi;\n}\n`,
  );
  pi.extensions = [
    ...((pi.extensions as string[] | undefined) ?? []),
    `./extensions/${name}/index.ts`,
  ];
  if (Array.isArray(manifest.files)) {
    manifest.files = [...manifest.files, `extensions/${name}`];
  }
  manifest.peerDependencies = {
    ...(peers as Record<string, string>),
    [piPeer]: (peers as Record<string, string>)[piPeer] ?? '*',
  };
  writeJson(tree, manifestPath, manifest);
}

export default extensionGenerator;
