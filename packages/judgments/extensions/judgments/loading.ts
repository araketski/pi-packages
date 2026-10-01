import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { validateDefinition, type Definition } from './definitions.ts';
import type { Selection } from './native.ts';

export type Scope = { scope: 'bundled' | 'global' | 'project'; path: string };
export type Source = { scope: Scope['scope']; path: string };
export type Diagnostic = Source & { code: string; message: string; id?: string };
export type Entry = {
  id: string;
  source: Source;
  definition?: Definition;
  diagnostics: Diagnostic[];
};
export type Catalog = { entries: Map<string, Entry>; diagnostics: Diagnostic[] };
const absent = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

// Scopes are already authorized by the caller and ordered low to high. Never
// read unauthorized project data here or turn a bad override into fallback.
// @mara implements DES-JUDGMENTS-DECLARATIVE
export async function loadCatalog(scopes: readonly Scope[]): Promise<Catalog> {
  const entries = new Map<string, Entry>();
  const diagnostics: Diagnostic[] = [];
  for (const scope of scopes) {
    const directory = join(scope.path, 'scenarios');
    let names: string[];
    try {
      names = (await readdir(directory)).filter((name) => /\.json$/i.test(name)).sort();
    } catch (error) {
      if (absent(error)) continue;
      const diagnostic = {
        ...scope,
        path: directory,
        code: 'scope_unreadable',
        message: 'Cannot read scenario scope; lower-scope scenarios are blocked.',
      };
      diagnostics.push(diagnostic);
      for (const entry of entries.values()) {
        entries.set(entry.id, { ...entry, definition: undefined, diagnostics: [diagnostic] });
      }
      continue;
    }
    const ids = new Map<string, string[]>();
    for (const name of names) {
      const id = basename(name).slice(0, -5);
      ids.set(id, [...(ids.get(id) ?? []), name]);
    }
    for (const [id, files] of ids) {
      const source = { scope: scope.scope, path: join(directory, files[0]) };
      let definition: Definition | undefined;
      const problems: Diagnostic[] = [];
      if (files.length > 1)
        problems.push({
          ...source,
          id,
          code: 'duplicate_id',
          message: 'Duplicate scenario ID in one scope; no definition selected.',
        });
      else {
        try {
          if (!id.trim()) throw new Error('Scenario filename must have a nonblank stem.');
          // Parsing failures are intentionally sanitized: the file may contain secrets.
          let raw: unknown;
          try {
            raw = JSON.parse(await readFile(source.path, 'utf8'));
          } catch {
            throw new Error('Cannot read or parse scenario JSON.');
          }
          definition = validateDefinition(raw);
        } catch (error) {
          problems.push({
            ...source,
            id,
            code: 'invalid_definition',
            message: (error as Error).message,
          });
        }
      }
      diagnostics.push(...problems);
      entries.set(id, { id, source, definition, diagnostics: problems });
    }
  }
  return { entries, diagnostics };
}

export async function loadSelection(
  scopes: readonly Scope[],
  flags: { provider?: unknown; model?: unknown },
): Promise<Selection> {
  let selection: Selection = { provider: 'openrouter', model: '~typesafe/jev-latest' };
  for (const scope of scopes) {
    if (scope.scope === 'bundled') continue;
    const path = join(scope.path, 'config.json');
    let content: string;
    try {
      content = await readFile(path, 'utf8');
    } catch (error) {
      if (absent(error)) continue;
      throw new Error(`Cannot read judgment configuration: ${path}`);
    }
    let config: unknown;
    try {
      config = JSON.parse(content);
    } catch {
      throw new Error(`Invalid judgment configuration JSON: ${path}`);
    }
    if (!config || typeof config !== 'object' || Array.isArray(config))
      throw new Error(`Invalid judgment configuration: ${path}`);
    const value = config as Record<string, unknown>;
    if (
      Object.keys(value).some((key) => key !== 'provider' && key !== 'model') ||
      typeof value.provider !== 'string' ||
      !value.provider.trim() ||
      typeof value.model !== 'string' ||
      !value.model.trim()
    )
      throw new Error(
        `Invalid judgment configuration; supply a complete provider/model pair: ${path}`,
      );
    selection = { provider: value.provider, model: value.model };
  }
  for (const value of Object.values(flags)) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim()))
      throw new Error('Invalid explicit classifier flag.');
  }
  if (
    flags.provider !== undefined &&
    flags.provider !== selection.provider &&
    flags.model === undefined
  )
    throw new Error('Changing the classifier provider requires an explicit model.');
  return {
    provider: (flags.provider as string | undefined) ?? selection.provider,
    model: (flags.model as string | undefined) ?? selection.model,
  };
}
