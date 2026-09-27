import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';

const types = ['extensions', 'skills', 'prompts', 'themes'] as const;

/** @mara implements REQ-NXPI-SOURCE-VALIDATION */
export default async function piCheckExecutor(
  _options: object,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  const project =
    context.projectName && context.projectsConfigurations.projects[context.projectName];
  if (!project) throw new Error('nx-pi pi-check: Nx project name is required.');
  const packageRoot = resolve(context.root, project.root);
  const path = join(packageRoot, 'package.json');
  if (!existsSync(path))
    throw new Error(
      `nx-pi pi-check: ${context.projectName} requires package.json in ${project.root}.`,
    );
  const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error(`nx-pi pi-check: ${context.projectName} package.json must contain an object.`);
  }
  if (!Object.hasOwn(manifest, 'pi')) return { success: true }; // opted-in shared library: no build required
  const pi = (manifest as Record<string, unknown>).pi;
  if (typeof pi !== 'object' || pi === null || Array.isArray(pi)) {
    throw new Error(`nx-pi pi-check: ${context.projectName} package.json pi must be an object.`);
  }
  for (const type of types) {
    const entries = (pi as Record<string, unknown>)[type];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.some((value) => typeof value !== 'string')) {
      throw new Error(
        `nx-pi pi-check: ${context.projectName} pi.${type} must be an array of paths.`,
      );
    }
    for (const entry of entries as string[]) {
      const description = `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${entry}"`;
      if (
        !entry ||
        ['\\', '*', '?', '[', ']', '{', '}', '!'].some((char) => entry.includes(char))
      ) {
        throw new Error(
          `${description} uses an unsupported glob or invalid path; this first check supports literal paths only.`,
        );
      }
      const resource = resolve(packageRoot, entry);
      const within = (path: string) =>
        path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
      if (!within(relative(packageRoot, resource)))
        throw new Error(`${description} escapes the package root.`);
      if (!existsSync(resource))
        throw new Error(`${description} does not exist in ${project.root}.`);
      if (!within(relative(realpathSync(packageRoot), realpathSync(resource))))
        throw new Error(`${description} escapes the package root through a symlink.`);
    }
  }
  return { success: true };
}
