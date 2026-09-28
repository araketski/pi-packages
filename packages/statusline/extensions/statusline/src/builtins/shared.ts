import type { StatusAppearance, StatuslineStatus } from '@araketski/pi-statusline-protocol';

const defaults: Record<string, StatusAppearance> = {
  cwd: { prefix: '⌂', color: 'muted' },
  branch: { prefix: '↳', color: { default: 'accent', byState: { clean: 'success', dirty: 'muted' } } },
  project: { prefix: '◯' },
  title: { prefix: '✎', color: 'muted' },
  model: { prefix: '◉', color: 'toolTitle' },
  thinking: { prefix: '◐', color: { default: 'accent', byState: {
    off: 'thinkingOff', minimal: 'thinkingMinimal', low: 'thinkingLow', medium: 'thinkingMedium',
    high: 'thinkingHigh', xhigh: 'thinkingXhigh', max: 'thinkingMax',
  } } },
  changes: { color: 'dim' }, pr: { color: 'muted' },
  context: { prefix: '◔', color: { default: 'muted', byState: { normal: 'muted', warning: 'warning', full: 'error' } } },
  tokens: { prefix: '◈', color: 'muted' }, cache: { prefix: '↻', color: 'muted' },
  cost: { color: 'muted' },
};

export function addStatus(items: Map<string, StatuslineStatus>, keys: Set<string>, key: string, text: string | undefined, state?: string): void {
  if (!keys.has(key) || !text) return;
  items.set(key, { source: 'statusline', key, text, state, ...defaults[key] });
}

export function compact(value: number, trim = false): string {
  const scaled = value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
  return trim ? scaled.replace(/\.0([kM])$/, '$1') : scaled;
}
