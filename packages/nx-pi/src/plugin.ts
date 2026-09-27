import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { CreateNodes } from '@nx/devkit';

type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function read(path: string): JsonObject | undefined {
  if (!existsSync(path)) return undefined;
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!object(value)) throw new Error(`nx-pi: ${path} must contain a JSON object.`);
  return value;
}

function targetName(options: { sourceTargetName?: string } | undefined): string {
  if (
    options &&
    (!object(options) || Object.keys(options).some((key) => key !== 'sourceTargetName'))
  ) {
    throw new Error('nx-pi: plugin options must contain only sourceTargetName in this increment.');
  }
  const name = options?.sourceTargetName ?? 'pi-check';
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() || /[\s/:]/.test(name)) {
    throw new Error(
      'nx-pi: options.sourceTargetName must be a nonblank target name without whitespace, /, or :.',
    );
  }
  return name;
}

function ownsTarget(
  project: JsonObject | undefined,
  pkg: JsonObject | undefined,
  name: string,
): string | undefined {
  if (object(project?.targets) && Object.hasOwn(project.targets, name)) return 'project.json';
  if (object(pkg?.nx) && object(pkg.nx.targets) && Object.hasOwn(pkg.nx.targets, name))
    return 'package.json nx.targets';
  if (object(pkg?.scripts) && Object.hasOwn(pkg.scripts, name)) return 'package.json scripts';
  return undefined;
}

/** @mara implements DES-NXPI-VALIDATION-TARGETS */
export const createNodes: CreateNodes<{ sourceTargetName?: string }> = [
  '**/{package,project}.json',
  (paths, options, context) => {
    const name = targetName(options);
    const roots = new Set(paths.map((path) => dirname(path)));
    const results: Array<
      readonly [
        string,
        { projects: Record<string, { targets: Record<string, { executor: string }> }> },
      ]
    > = [];
    for (const root of roots) {
      const pkg = read(join(context.workspaceRoot, root, 'package.json'));
      const project = read(join(context.workspaceRoot, root, 'project.json'));
      const tags = [project?.tags, object(pkg?.nx) ? pkg.nx.tags : undefined];
      const eligible =
        (pkg && Object.hasOwn(pkg, 'pi')) ||
        tags.some((value) => Array.isArray(value) && value.includes('nx-pi:library'));
      if (!eligible) continue;
      const collision = ownsTarget(project, pkg, name);
      if (collision) {
        throw new Error(
          `nx-pi: ${root} already defines target "${name}" in ${collision}; choose a different options.sourceTargetName or remove that authored target.`,
        );
      }
      const config =
        paths.find((path) => dirname(path) === root && basename(path) === 'package.json') ??
        paths.find((path) => dirname(path) === root)!;
      results.push([
        config,
        {
          projects: { [root]: { targets: { [name]: { executor: '@araketski/nx-pi:pi-check' } } } },
        },
      ]);
    }
    return results;
  },
];
