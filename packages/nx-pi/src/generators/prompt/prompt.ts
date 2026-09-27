import { getProjects, readJson, writeJson, type Tree } from '@nx/devkit';
import type { PromptGeneratorSchema } from './schema';

function fail(message: string): never {
  throw new Error(`nx-pi prompt: ${message}`);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @mara implements REQ-NXPI-PRESERVE
 * @mara implements REQ-NXPI-RESOURCE-SOURCE
 * @mara implements DES-NXPI-PROMPT-CONTRACT
 */
export async function promptGenerator(tree: Tree, options: PromptGeneratorSchema): Promise<void> {
  const { name, project, description } = options;
  if (typeof name !== 'string' || name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    fail('name must be lowercase kebab-case (at most 64 characters), without path separators.');
  }
  if (
    description !== undefined &&
    (typeof description !== 'string' || !description.trim() || description.length > 1024)
  ) {
    fail('--description must be nonblank and at most 1024 characters when supplied.');
  }
  if (typeof project !== 'string' || !project.trim())
    fail('--project must name an existing Pi package project.');
  const configured = getProjects(tree).get(project)?.root;
  // Nx generator Trees do not expose package.json-inferred projects through getProjects.
  // The package generator's packages/<name> layout therefore needs a manifest lookup.
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
    fail(`${manifestPath} cannot be parsed; repair its JSON before adding a prompt.`);
  }
  if (!isObject(manifest)) fail(`${manifestPath} must contain an object.`);
  if (!isObject(manifest.pi))
    fail(`${manifestPath} pi must be an object (a Pi resource package is required).`);
  const pi = manifest.pi;
  if (
    pi.prompts !== undefined &&
    (!Array.isArray(pi.prompts) || pi.prompts.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    fail(`${manifestPath} pi.prompts must be an array of paths.`);
  }
  if (
    manifest.files !== undefined &&
    (!Array.isArray(manifest.files) ||
      manifest.files.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    fail(`${manifestPath} files must be an array of paths when present.`);
  }
  const promptPath = `${root}/prompts/${name}.md`;
  if (tree.exists(promptPath) || tree.children(`${root}/prompts`).includes(`${name}.md`)) {
    fail(`${promptPath} already exists; no files were changed.`);
  }

  // Preconditions precede both writes. The actor must finish the prompt before use.
  tree.write(
    promptPath,
    `---\ndescription: ${JSON.stringify(description ?? `TODO: Describe /${name}.`)}\n---\n\nTODO: Replace this scaffold with prompt text before using or publishing /${name}.\n`,
  );
  pi.prompts = [...((pi.prompts as string[] | undefined) ?? []), `./prompts/${name}.md`];
  if (Array.isArray(manifest.files)) {
    manifest.files = [...manifest.files, `prompts/${name}.md`];
  }
  writeJson(tree, manifestPath, manifest);
}

export default promptGenerator;
