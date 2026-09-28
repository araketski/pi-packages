export type FastState = { enabled: boolean };

type SessionEntry = { type: string; customType?: string; data?: unknown };

export function restoreFastState(entries: Iterable<SessionEntry>, launchFast: boolean): FastState {
  let enabled = false;
  for (const entry of entries) {
    if (entry.type !== 'custom' || entry.customType !== 'fast') continue;
    if (typeof entry.data !== 'object' || entry.data === null || Array.isArray(entry.data)) continue;
    if (typeof (entry.data as { enabled?: unknown }).enabled === 'boolean') {
      enabled = (entry.data as { enabled: boolean }).enabled;
    }
  }
  return { enabled: launchFast || enabled };
}
