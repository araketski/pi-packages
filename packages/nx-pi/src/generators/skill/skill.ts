import { getProjects, readJson, writeJson, type Tree } from '@nx/devkit';
import type { SkillGeneratorSchema } from './schema';

function fail(message: string): never {
  throw new Error(`nx-pi skill: ${message}`);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @mara implements REQ-NXPI-PRESERVE
 * @mara implements REQ-NXPI-RESOURCE-SOURCE
 * @mara implements DES-NXPI-SKILL-CONTRACT
 */
export async function skillGenerator(tree: Tree, options: SkillGeneratorSchema): Promise<void> {
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
    fail(`${manifestPath} cannot be parsed; repair its JSON before adding a skill.`);
  }
  if (!isObject(manifest)) fail(`${manifestPath} must contain an object.`);
  if (!isObject(manifest.pi))
    fail(`${manifestPath} pi must be an object (a Pi resource package is required).`);
  const pi = manifest.pi;
  if (
    pi.skills !== undefined &&
    (!Array.isArray(pi.skills) || pi.skills.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    fail(`${manifestPath} pi.skills must be an array of paths.`);
  }
  if (
    manifest.files !== undefined &&
    (!Array.isArray(manifest.files) ||
      manifest.files.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    fail(`${manifestPath} files must be an array of paths when present.`);
  }
  const skillRoot = `${root}/skills/${name}`;
  if (tree.exists(skillRoot) || tree.children(`${root}/skills`).includes(name)) {
    fail(`${skillRoot} already exists; no files were changed.`);
  }

  // Preconditions precede both writes. A scaffold is intentionally not a usable skill yet.
  tree.write(
    `${skillRoot}/SKILL.md`,
    `---\nname: ${name}\ndescription: ${JSON.stringify(description ?? `TODO: Describe when to use ${name}.`)}\n---\n\n# ${name}\n\nTODO: Replace this scaffold with instructions before using or publishing this skill.\n`,
  );
  pi.skills = [...((pi.skills as string[] | undefined) ?? []), `./skills/${name}`];
  if (Array.isArray(manifest.files)) {
    manifest.files = [...manifest.files, `skills/${name}`];
  }
  writeJson(tree, manifestPath, manifest);
}

export default skillGenerator;
