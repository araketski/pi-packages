import { readFileSync } from 'node:fs';
import { isAbsolute, join, matchesGlob, posix, resolve } from 'node:path';
import type { ExecutorContext } from '@nx/devkit';
import { list } from 'tar';
import ts from 'typescript';

const types = ['extensions', 'skills', 'prompts', 'themes'] as const;
const script = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const maxEntry = 8 * 1024 * 1024;
const maxArchive = 64 * 1024 * 1024;
function fail(message: string): never {
  throw new Error(`nx-pi pi-check-package: ${message}`);
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

async function archive(file: string): Promise<Map<string, Buffer>> {
  const members = new Map<string, Buffer>();
  const seen = new Set<string>();
  let total = 0;
  let invalid: string | undefined;
  try {
    await list({
      file,
      strict: true,
      onReadEntry(entry) {
        if (entry.path === 'package/' && entry.type === 'Directory') return;
        const name = entry.path;
        const clean = name.replace(/\/$/, '');
        const valid =
          !name.includes('\\') &&
          !name.includes('\0') &&
          !name.startsWith('/') &&
          clean.startsWith('package/') &&
          clean.split('/').every((part) => part !== '.' && part !== '..' && part !== '') &&
          posix.normalize(clean) === clean;
        if (!valid || seen.has(clean) || !['File', 'Directory'].includes(entry.type)) {
          invalid ??= `unsafe, duplicate, or unsupported archive member "${name}" (${entry.type}).`;
        }
        seen.add(clean);
        if (seen.size > 10_000) invalid ??= 'tarball contains too many members (limit 10000).';
        if (entry.size > maxEntry || (total += entry.size) > maxArchive) {
          invalid ??= `archive member "${name}" exceeds the size limit.`;
        }
        const chunks: Buffer[] = [];
        entry.on('data', (chunk: Buffer) => {
          if (!invalid) chunks.push(chunk);
        });
        entry.on('end', () => {
          if (!invalid && entry.type === 'File')
            members.set(clean.slice('package/'.length), Buffer.concat(chunks));
        });
      },
    });
  } catch (error) {
    fail(`could not read tarball "${file}": ${String(error)}`);
  }
  if (invalid) fail(invalid);
  for (const path of members.keys()) {
    for (let parent = posix.dirname(path); parent !== '.'; parent = posix.dirname(parent)) {
      if (members.has(parent))
        fail(`archive member "${path}" is nested inside packed file "${parent}".`);
    }
  }
  if (!members.has('package.json')) fail('tarball is missing package/package.json.');
  return members;
}

function manifest(data: Buffer, description: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(data.toString('utf8'));
    if (record(value)) return value;
  } catch {
    // Report the same actionable error for JSON syntax and non-object values.
  }
  return fail(`${description} must be a JSON object.`);
}

function checkImports(start: string, members: Map<string, Buffer>): void {
  const visited = new Set<string>();
  const directories = new Set<string>();
  for (const path of members.keys()) {
    for (let part = posix.dirname(path); part !== '.'; part = posix.dirname(part))
      directories.add(part);
  }
  const host: ts.ModuleResolutionHost = {
    fileExists: (path) => members.has(path.replace(/^\/package\//, '')),
    readFile: (path) => members.get(path.replace(/^\/package\//, ''))?.toString('utf8'),
    directoryExists: (path) =>
      path === '/package' || directories.has(path.replace(/^\/package\//, '')),
  };
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
  };
  const visit = (path: string): void => {
    if (visited.has(path) || !script.test(path)) return;
    visited.add(path);
    const text = members.get(path)?.toString('utf8');
    if (text === undefined) fail(`extension helper "${path}" is missing from the tarball.`);
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const dependencies: string[] = [];
    const walk = (node: ts.Node): void => {
      const runtimeImport =
        ts.isImportDeclaration(node) &&
        !node.importClause?.isTypeOnly &&
        !(
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          !node.importClause.name &&
          node.importClause.namedBindings.elements.every((element) => element.isTypeOnly)
        );
      const runtimeExport =
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        !(
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.every((element) => element.isTypeOnly)
        );
      if (
        (runtimeImport || runtimeExport) &&
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      ) {
        const specifier = node.moduleSpecifier;
        if (specifier && ts.isStringLiteral(specifier)) dependencies.push(specifier.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
    for (const dependency of dependencies.filter((value) => value.startsWith('.'))) {
      const resolvedPath = posix.normalize(posix.join(posix.dirname(path), dependency));
      if (resolvedPath === '..' || resolvedPath.startsWith('../') || dependency.includes('\\')) {
        fail(`extension "${path}" imports unsafe local helper "${dependency}".`);
      }
      const result = ts.resolveModuleName(
        dependency,
        `/package/${path}`,
        options,
        host,
      ).resolvedModule;
      const found =
        result?.resolvedFileName.replace(/^\/package\//, '') ??
        (members.has(resolvedPath) ? resolvedPath : undefined);
      if (!found || /\.d\.[cm]?ts$/.test(found) || !members.has(found)) {
        fail(
          `extension "${path}" imports missing packed helper "${dependency}" (resolved near "${resolvedPath}").`,
        );
      }
      visit(found);
    }
  };
  visit(start);
}

/** @mara implements DES-NXPI-PACKED-INPUT-CONTRACT */
export default async function piCheckPackageExecutor(
  options: { tarball?: string },
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  if (typeof options?.tarball !== 'string' || !options.tarball.trim()) {
    fail('supply --tarball=<path> explicitly.');
  }
  const project = context.projectName
    ? context.projectsConfigurations.projects[context.projectName]
    : undefined;
  if (!project) fail('Nx project name is required.');
  let sourceData: Buffer;
  try {
    sourceData = readFileSync(join(context.root, project.root, 'package.json'));
  } catch (error) {
    fail(`cannot read ${project.root}/package.json: ${String(error)}`);
  }
  const source = manifest(sourceData, `${project.root}/package.json`);
  if (!Object.hasOwn(source, 'pi')) fail(`${project.root} is not a Pi resource package.`);
  const file = isAbsolute(options.tarball)
    ? options.tarball
    : resolve(context.root, options.tarball);
  const members = await archive(file);
  const packed = manifest(members.get('package.json')!, 'packed package.json');
  if (typeof source.name !== 'string' || source.name !== packed.name) {
    fail(
      `packed package name ${JSON.stringify(packed.name)} does not match ${project.root} package name ${JSON.stringify(source.name)}.`,
    );
  }
  if (!record(packed.pi)) fail('packed package.json pi must be an object.');
  const paths = new Set<string>();
  for (const path of members.keys()) {
    paths.add(path);
    for (let part = posix.dirname(path); part !== '.'; part = posix.dirname(part)) paths.add(part);
  }
  for (const type of types) {
    const entries = packed.pi[type];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) {
      fail(`packed package.json pi.${type} must be an array of paths.`);
    }
    const selected = new Set<string>();
    let positive = 0;
    for (const entry of entries as string[]) {
      const excluded = entry.startsWith('!');
      const pattern = (excluded ? entry.slice(1) : entry).replace(/^\.\//, '');
      if (
        !pattern ||
        pattern.includes('\\') ||
        pattern.includes('\0') ||
        pattern.startsWith('/') ||
        pattern
          .split('/')
          .some((part) => part === '..' || part === '.' || /(^|[({,])\.\.(?=$|[)},])/.test(part))
      )
        fail(`pi.${type} declaration "${entry}" has an invalid or unsafe path.`);
      if (!excluded) positive++;
      const matches = [...paths].filter((path) => matchesGlob(path, pattern));
      if (!excluded && matches.length === 0) {
        fail(
          `pi.${type} declaration "${entry}" does not match any packed path${type === 'skills' ? ' (missing SKILL.md)' : ''}.`,
        );
      }
      for (const path of matches) {
        if (excluded) selected.delete(path);
        else selected.add(path);
      }
    }
    if (!positive && entries.length)
      fail(`pi.${type} has exclusions but no positive declarations.`);
    for (const path of selected) {
      if (
        type === 'skills' &&
        !members.has(`${path}/SKILL.md`) &&
        !(path.endsWith('/SKILL.md') && members.has(path))
      ) {
        fail(`pi.skills declaration "${path}" is missing packed SKILL.md.`);
      }
      if (type === 'extensions') {
        if (/\.d\.[cm]?ts$/.test(path))
          fail(
            `pi.extensions declaration "${path}" points to declarations, not a runnable entrypoint.`,
          );
        if (members.has(path)) checkImports(path, members);
        else if (members.has(`${path}/index.ts`)) checkImports(`${path}/index.ts`, members);
        else fail(`pi.extensions declaration "${path}" is missing its packed entrypoint.`);
      }
    }
  }
  return { success: true };
}
