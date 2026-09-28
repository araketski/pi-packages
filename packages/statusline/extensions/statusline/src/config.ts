import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StatusAppearance, StatusColor, StatusColorValue } from '@araketski/pi-statusline-protocol';

export interface StatuslineConfig {
  layout: string[][];
  separator: string;
  separatorColor: StatusColorValue;
  appearance: Record<string, StatusAppearance>;
}

export interface ConfigContext {
  agentDir: string;
  cwd: string;
  isProjectTrusted(): boolean;
}

export const DEFAULT_LAYOUT = [
  ['branch', 'changes', 'pr', 'spacer', 'project'],
  ['context', 'cache', 'cost', 'spacer', 'model', 'thinking', 'caffeinate'],
  ['title'],
  ['cwd'],
] as const;

const THEME_ROLES = new Set([
  'accent', 'border', 'borderAccent', 'borderMuted', 'success', 'error', 'warning', 'muted',
  'dim', 'text', 'thinkingText', 'userMessageText', 'customMessageText', 'customMessageLabel',
  'toolTitle', 'toolOutput', 'mdHeading', 'mdLink', 'mdLinkUrl', 'mdCode', 'mdCodeBlock',
  'mdCodeBlockBorder', 'mdQuote', 'mdQuoteBorder', 'mdHr', 'mdListBullet', 'toolDiffAdded',
  'toolDiffRemoved', 'toolDiffContext', 'syntaxComment', 'syntaxKeyword', 'syntaxFunction',
  'syntaxVariable', 'syntaxString', 'syntaxNumber', 'syntaxType', 'syntaxOperator',
  'syntaxPunctuation', 'thinkingOff', 'thinkingMinimal', 'thinkingLow', 'thinkingMedium',
  'thinkingHigh', 'thinkingXhigh', 'thinkingMax', 'bashMode',
]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validColorValue(value: unknown): value is StatusColorValue {
  return typeof value === 'number'
    ? Number.isInteger(value) && value >= 0 && value <= 255
    : typeof value === 'string' &&
        (value === '' || THEME_ROLES.has(value) || /^#[\da-fA-F]{6}$/.test(value));
}

export function mergeAppearance(base: StatusAppearance, patch?: StatusAppearance): StatusAppearance {
  if (!patch) return { ...base };
  const result: StatusAppearance = { ...base, ...patch };
  if (patch.color !== undefined && typeof patch.color === 'object') {
    const previous = base.color;
    const inherited =
      previous === undefined
        ? {}
        : typeof previous === 'object'
          ? previous
          : { default: previous, byState: {} };
    result.color = {
      ...inherited,
      ...patch.color,
      byState: { ...('byState' in inherited ? inherited.byState : {}), ...patch.color.byState },
    };
  }
  return result;
}

function colorFrom(raw: unknown, source: string, diagnostics: string[]): StatusColor | undefined {
  if (validColorValue(raw)) return raw;
  if (!record(raw) || !record(raw.byState)) {
    diagnostics.push(`${source}: invalid color`);
    return undefined;
  }
  const byState: Record<string, StatusColorValue> = {};
  for (const [state, value] of Object.entries(raw.byState)) {
    if (validColorValue(value)) byState[state] = value;
    else diagnostics.push(`${source}: invalid color state ${state}`);
  }
  if (raw.default !== undefined && !validColorValue(raw.default)) {
    diagnostics.push(`${source}: invalid default color`);
    return { byState };
  }
  return raw.default === undefined ? { byState } : { default: raw.default as StatusColorValue, byState };
}

function layoutFrom(value: unknown): string[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return [[]];
  if (value.every((token) => typeof token === 'string')) return [value];
  if (value.every((line) => Array.isArray(line) && line.every((token) => typeof token === 'string')))
    return value;
  return undefined;
}

function apply(config: StatuslineConfig, raw: unknown, source: string, diagnostics: string[]): void {
  if (!record(raw)) {
    diagnostics.push(`${source}: expected JSON object`);
    return;
  }
  for (const [key, value] of Object.entries(raw)) {
    switch (key) {
      case 'layout': {
        const layout = layoutFrom(value);
        if (layout) config.layout = layout;
        else diagnostics.push(`${source}: invalid layout`);
        break;
      }
      case 'separator':
        if (typeof value === 'string') config.separator = value;
        else diagnostics.push(`${source}: invalid separator`);
        break;
      case 'separatorColor':
        if (validColorValue(value)) config.separatorColor = value;
        else diagnostics.push(`${source}: invalid separatorColor`);
        break;
      case 'appearance':
        if (!record(value)) {
          diagnostics.push(`${source}: invalid appearance`);
          break;
        }
        for (const [statusKey, entry] of Object.entries(value)) {
          if (!record(entry) || (entry.prefix !== undefined && typeof entry.prefix !== 'string')) {
            diagnostics.push(`${source}: invalid appearance for ${statusKey}`);
            continue;
          }
          const patch: StatusAppearance = {};
          if (entry.prefix !== undefined) patch.prefix = entry.prefix;
          if (entry.color !== undefined) {
            const color = colorFrom(entry.color, `${source} ${statusKey}`, diagnostics);
            if (color !== undefined) patch.color = color;
          }
          config.appearance[statusKey] = mergeAppearance(config.appearance[statusKey] ?? {}, patch);
        }
        break;
      default:
        diagnostics.push(`${source}: unknown field ${key}`);
    }
  }
}

export function loadStatuslineConfig(context: ConfigContext): {
  config: StatuslineConfig;
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const config: StatuslineConfig = {
    layout: DEFAULT_LAYOUT.map((line) => [...line]),
    separator: ' • ',
    separatorColor: 'dim',
    appearance: {},
  };
  const read = (path: string, source: string) => {
    let json: string;
    try {
      json = readFileSync(path, 'utf8');
    } catch (error) {
      if (record(error) && error.code === 'ENOENT') return;
      diagnostics.push(`${source}: could not read config: ${String(error)}`);
      return;
    }
    try {
      apply(config, JSON.parse(json), source, diagnostics);
    } catch (error) {
      diagnostics.push(`${source}: invalid JSON: ${String(error)}`);
    }
  };
  read(join(context.agentDir, 'statusline.json'), 'user');
  if (context.isProjectTrusted()) read(join(context.cwd, '.pi', 'statusline.json'), 'project');
  return { config, diagnostics };
}
