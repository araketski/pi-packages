import { getProjects, readJson, writeJson, type Tree } from '@nx/devkit';
import type { ThemeGeneratorSchema } from './schema';

// Required roles in Pi 0.99.1 theme-schema.json. Optional roles have Pi fallbacks.
const requiredColors =
  `accent border borderAccent borderMuted success error warning muted dim text thinkingText selectedBg userMessageBg userMessageText customMessageBg customMessageText customMessageLabel toolPendingBg toolSuccessBg toolErrorBg toolTitle toolOutput mdHeading mdLink mdLinkUrl mdCode mdCodeBlock mdCodeBlockBorder mdQuote mdQuoteBorder mdHr mdListBullet toolDiffAdded toolDiffRemoved toolDiffContext syntaxComment syntaxKeyword syntaxFunction syntaxVariable syntaxString syntaxNumber syntaxType syntaxOperator syntaxPunctuation thinkingOff thinkingMinimal thinkingLow thinkingMedium thinkingHigh thinkingXhigh bashMode`.split(
    ' ',
  );

function fail(message: string): never {
  throw new Error(`nx-pi theme: ${message}`);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @mara implements REQ-NXPI-PRESERVE
 * @mara implements REQ-NXPI-RESOURCE-SOURCE
 * @mara implements DES-NXPI-THEME-CONTRACT
 */
export async function themeGenerator(tree: Tree, options: ThemeGeneratorSchema): Promise<void> {
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
    fail(`${manifestPath} cannot be parsed; repair its JSON before adding a theme.`);
  }
  if (!isObject(manifest)) fail(`${manifestPath} must contain an object.`);
  if (!isObject(manifest.pi))
    fail(`${manifestPath} pi must be an object (a Pi resource package is required).`);
  const pi = manifest.pi;
  if (
    pi.themes !== undefined &&
    (!Array.isArray(pi.themes) || pi.themes.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    fail(`${manifestPath} pi.themes must be an array of paths.`);
  }
  if (
    manifest.files !== undefined &&
    (!Array.isArray(manifest.files) ||
      manifest.files.some((entry: unknown) => typeof entry !== 'string'))
  ) {
    fail(`${manifestPath} files must be an array of paths when present.`);
  }
  const themePath = `${root}/themes/${name}.json`;
  if (tree.exists(themePath) || tree.children(`${root}/themes`).includes(`${name}.json`)) {
    fail(`${themePath} already exists; no files were changed.`);
  }

  // The documented terminal-default color is valid but intentionally plain.
  // The actor can customize this palette without repairing an invalid JSON stub.
  writeJson(tree, themePath, {
    name,
    colors: Object.fromEntries(requiredColors.map((color) => [color, ''])),
  });
  pi.themes = [...((pi.themes as string[] | undefined) ?? []), `./themes/${name}.json`];
  if (Array.isArray(manifest.files)) {
    manifest.files = [...manifest.files, `themes/${name}.json`];
  }
  writeJson(tree, manifestPath, manifest);
}

export default themeGenerator;
