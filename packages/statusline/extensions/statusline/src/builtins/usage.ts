import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { StatuslineStatus } from '@araketski/pi-statusline-protocol';
import { addStatus, compact } from './shared.js';

export function collectUsage(
  items: Map<string, StatuslineStatus>,
  keys: Set<string>,
  ctx: ExtensionContext,
): void {
  if (!['tokens', 'cache', 'cost'].some((key) => keys.has(key))) return;
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== 'message' || entry.message.role !== 'assistant') continue;
    const usage = entry.message.usage;
    totals.input += usage.input ?? 0;
    totals.output += usage.output ?? 0;
    totals.cacheRead += usage.cacheRead ?? 0;
    totals.cacheWrite += usage.cacheWrite ?? 0;
    totals.cost += usage.cost?.total ?? 0;
  }
  addStatus(items, keys, 'tokens', `${compact(totals.input)}↑ ${compact(totals.output)}↓`);
  const allCache = totals.cacheRead + totals.cacheWrite;
  addStatus(
    items,
    keys,
    'cache',
    `${compact(totals.cacheRead)}/${compact(totals.cacheWrite)} ${allCache ? Math.round((totals.cacheRead / allCache) * 100) : 0}%`,
  );
  addStatus(items, keys, 'cost', `$${totals.cost.toFixed(2)}`);
}
