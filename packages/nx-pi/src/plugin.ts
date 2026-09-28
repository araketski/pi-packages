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

type Options = { sourceTargetName?: string; packageTargetName?: string };

function targetNames(options: Options | undefined): { source: string; packed: string } {
  if (
    options &&
    (!object(options) ||
      Object.keys(options).some((key) => !['sourceTargetName', 'packageTargetName'].includes(key)))
  ) {
    throw new Error(
      'nx-pi: plugin options may contain only sourceTargetName and packageTargetName.',
    );
  }
  const source = options?.sourceTargetName ?? 'pi-check';
  const packed = options?.packageTargetName ?? 'pi-check-package';
  for (const [key, name] of [
    ['sourceTargetName', source],
    ['packageTargetName', packed],
  ] as const) {
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || /[\s/:]/.test(name)) {
      throw new Error(
        `nx-pi: options.${key} must be a nonblank target name without whitespace, /, or :.`,
      );
    }
  }
  if (source === packed)
    throw new Error('nx-pi: options.packageTargetName must be distinct from sourceTargetName.');
  return { source, packed };
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
export const createNodes: CreateNodes<Options> = [
  '**/{package,project}.json',
  (paths, options, context) => {
    const names = targetNames(options);
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
      for (const [name, option] of [
        [names.source, 'sourceTargetName'],
        [names.packed, 'packageTargetName'],
      ]) {
        const collision = ownsTarget(project, pkg, name);
        if (collision) {
          throw new Error(
            `nx-pi: ${root} already defines target "${name}" in ${collision}; choose a different options.${option} or remove that authored target.`,
          );
        }
      }
      const config =
        paths.find((path) => dirname(path) === root && basename(path) === 'package.json') ??
        paths.find((path) => dirname(path) === root)!;
      results.push([
        config,
        {
          projects: {
            [root]: {
              targets: {
                [names.source]: { executor: '@araketski/nx-pi:pi-check' },
                [names.packed]: { executor: '@araketski/nx-pi:pi-check-package' },
              },
            },
          },
        },
      ]);
    }
    return results;
  },
];
