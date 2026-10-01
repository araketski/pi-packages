import type { ExtensionContext, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { StatuslineStatus } from '@araketski/pi-statusline-protocol';
import { addStatus, compact } from './shared.js';

type Counter = { total: number; known: boolean; missing: boolean };
const counter = (): Counter => ({ total: 0, known: false, missing: false });
const validAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function add(counter: Counter, value: unknown): void {
  if (validAmount(value) && Number.isFinite(counter.total + value)) {
    counter.total += value;
    counter.known = true;
  } else {
    counter.missing = true;
  }
}

function format(counter: Counter, formatter = compact): string {
  if (!counter.missing) return formatter(counter.total);
  return counter.known ? `${formatter(counter.total)}+?` : '?';
}

function state(...counters: Counter[]): string | undefined {
  if (!counters.some((counter) => counter.missing)) return undefined;
  return counters.some((counter) => counter.known) ? 'partial' : 'unknown';
}

// null means no public model-usage attribution; undefined means known model activity
// with unreported usage. Never mine arbitrary tool details, text or custom entries.
function attributedUsage(
  entry: SessionEntry,
): Extract<SessionEntry, { type: 'usage' }>['usage'] | undefined | null {
  if (entry.type === 'usage') return entry.usage;
  if (entry.type === 'compaction' || entry.type === 'branch_summary') {
    return entry.usage ?? (entry.fromHook ? null : undefined);
  }
  if (entry.type === 'message') {
    if (entry.message.role === 'assistant') return entry.message.usage;
    // Pi has already added nested usage to this outer transcript result.
    if (entry.message.role === 'toolResult') return entry.message.usage ?? null;
  }
  return null;
}

// @mara implements REQ-STATUSLINE-BUILTINS
// @mara implements DES-STATUSLINE-BUILTIN-VALUES
export function collectUsage(
  items: Map<string, StatuslineStatus>,
  keys: Set<string>,
  ctx: ExtensionContext,
): void {
  if (!['tokens', 'cache', 'cost'].some((key) => keys.has(key))) return;
  const totals = {
    input: counter(),
    output: counter(),
    cacheRead: counter(),
    cacheWrite: counter(),
    cost: counter(),
  };
  const seen = new Set<string>();
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.id && seen.has(entry.id)) continue;
    if (entry.id) seen.add(entry.id);
    const usage = attributedUsage(entry);
    if (usage === null) continue;
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
      add(totals[key], usage?.[key]);
    }
    // Pi can report zero catalog cost when pricing is absent. The public usage
    // record cannot distinguish that from a free model: be conservative unless
    // every consumption counter explicitly establishes no usage.
    const noConsumption =
      usage &&
      [usage.input, usage.output, usage.cacheRead, usage.cacheWrite].every((value) => value === 0);
    add(totals.cost, usage?.cost?.total === 0 && !noConsumption ? undefined : usage?.cost?.total);
  }
  addStatus(
    items,
    keys,
    'tokens',
    `${format(totals.input)}↑ ${format(totals.output)}↓`,
    state(totals.input, totals.output),
  );
  const allCache = totals.cacheRead.total + totals.cacheWrite.total;
  const hitRate =
    totals.cacheRead.missing || totals.cacheWrite.missing
      ? '?'
      : allCache
        ? `${Math.round((totals.cacheRead.total / allCache) * 100)}`
        : '0';
  addStatus(
    items,
    keys,
    'cache',
    `${format(totals.cacheRead)}/${format(totals.cacheWrite)} ${hitRate}%`,
    state(totals.cacheRead, totals.cacheWrite),
  );
  addStatus(
    items,
    keys,
    'cost',
    `$${format(totals.cost, (value) => value.toFixed(2))}`,
    state(totals.cost),
  );
}
