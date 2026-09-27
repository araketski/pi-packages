import { readFileSync, existsSync, realpathSync, globSync, statSync, lstatSync } from 'node:fs';
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
  const packageRealPath = realpathSync(packageRoot);
  const within = (path: string) =>
    path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  for (const type of types) {
    const entries = (pi as Record<string, unknown>)[type];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.some((value) => typeof value !== 'string')) {
      throw new Error(
        `nx-pi pi-check: ${context.projectName} pi.${type} must be an array of paths.`,
      );
    }
    const positives: string[] = [];
    const negatives: string[] = [];
    for (const entry of entries as string[]) {
      const description = `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${entry}"`;
      const pattern = entry.startsWith('!') ? entry.slice(1) : entry;
      if (
        !pattern ||
        pattern.includes('\\') ||
        isAbsolute(pattern) ||
        pattern.split('/').some((part) => part === '..' || /(^|[({,])\.\.(?=$|[)},])/.test(part))
      ) {
        throw new Error(`${description} has an empty, absolute, or parent-traversing path.`);
      }
      if (entry.startsWith('!')) negatives.push(pattern);
      else positives.push(pattern);
    }
    if (negatives.length && positives.length === 0) {
      throw new Error(
        `nx-pi pi-check: ${context.projectName} pi.${type} has exclusions but no positive declarations; use [] to select none.`,
      );
    }
    const match = (pattern: string, exclusion = false) => {
      // Node's glob follows symlinked directories through **. Pi expects
      // symlinked resource roots to be named explicitly in a declaration.
      const literalParts: string[] = [];
      for (const part of pattern.replace(/^\.\//, '').split('/')) {
        if (['*', '?', '[', ']', '{', '}'].some((char) => part.includes(char))) break;
        literalParts.push(part);
        const literalPath = resolve(packageRoot, ...literalParts);
        if (existsSync(literalPath) && lstatSync(literalPath).isSymbolicLink()) {
          if (
            !within(relative(packageRealPath, realpathSync(literalPath))) &&
            (!exclusion || statSync(literalPath).isDirectory())
          ) {
            throw new Error(
              `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${pattern}" escapes the package root through a symlink.`,
            );
          }
        }
      }
      const matches = (() => {
        try {
          return globSync(pattern, {
            cwd: packageRoot,
            withFileTypes: true,
            exclude: (entry) => {
              if (!entry.isSymbolicLink()) return false;
              const path = join(entry.parentPath, entry.name);
              let directory: boolean;
              try {
                directory = statSync(path).isDirectory();
              } catch {
                throw new Error(
                  `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${pattern}" contains an unreadable or broken symlink "${relative(packageRoot, path)}".`,
                );
              }
              if (!directory) return false;
              const parts = relative(packageRoot, path).split(sep);
              return parts.some(
                (part, index) => index >= literalParts.length || part !== literalParts[index],
              );
            },
          });
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('nx-pi pi-check:')) throw error;
          throw new Error(
            `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${pattern}" could not be expanded: ${String(error)}`,
          );
        }
      })();
      return matches.map((entry) => {
        const candidate = relative(packageRoot, join(entry.parentPath, entry.name));
        if (!within(relative(packageRoot, resolve(packageRoot, candidate)))) {
          throw new Error(
            `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${pattern}" escapes the package root.`,
          );
        }
        return candidate;
      });
    };
    const selected = new Set<string>();
    for (const pattern of positives) {
      const found = match(pattern);
      if (found.length === 0) {
        throw new Error(
          `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${pattern}" does not match any path in ${project.root}.`,
        );
      }
      for (const candidate of found) selected.add(candidate);
    }
    for (const pattern of negatives) {
      for (const candidate of match(pattern, true)) selected.delete(candidate);
    }
    for (const candidate of selected) {
      const resource = resolve(packageRoot, candidate);
      let realPath: string;
      try {
        realPath = realpathSync(resource);
      } catch {
        throw new Error(
          `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${candidate}" is unreadable or contains a broken symlink.`,
        );
      }
      if (
        !within(relative(packageRoot, resource)) ||
        !within(relative(packageRealPath, realPath))
      ) {
        throw new Error(
          `nx-pi pi-check: ${context.projectName} pi.${type} declaration "${candidate}" escapes the package root through a symlink.`,
        );
      }
    }
  }
  return { success: true };
}
