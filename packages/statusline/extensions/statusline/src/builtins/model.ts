import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

// @mara implements DES-STATUSLINE-BUILTIN-VALUES
// @mara implements DES-STATUSLINE-BUILTIN-SOURCES
export function modelText(ctx: ExtensionContext): string {
  const selected = ctx.model;
  if (!selected) return 'unknown';
  const fallback = selected.id;
  if (!selected.provider || !selected.id) return fallback;

  // Both selection and dispatch are public transcript data. A response alone
  // cannot prove which virtual selection dispatched it, especially after restore.
  const branch = ctx.sessionManager.getBranch();
  const reversed = [...branch].reverse();
  const boundary = reversed.findIndex((entry) => entry.type === 'model_change');
  const selection = reversed[boundary];
  if (
    selection?.type !== 'model_change' ||
    selection.provider !== selected.provider ||
    selection.modelId !== selected.id
  )
    return fallback;

  const interval = reversed.slice(0, boundary);
  const responseIndex = interval.findIndex(
    (entry) => entry.type === 'message' && entry.message.role === 'assistant',
  );
  const latest = interval[responseIndex];
  if (latest?.type !== 'message' || latest.message.role !== 'assistant') return fallback;
  // Pi persists an assistant on completion: a model change can overtake an
  // already dispatched stream. Require a user-run boundary AFTER the selection
  // and BEFORE the response. Otherwise transcript-only attribution is ambiguous
  // (including switches during tool follow-ups or custom-message-only runs).
  const initiated = interval
    .slice(responseIndex + 1)
    .some((entry) => entry.type === 'message' && entry.message.role === 'user');
  if (!initiated) return fallback;
  const actual = latest.message;
  // Failed requests may name the selected virtual model even if routing failed.
  // Never resurrect an older identity after missing/unfinished evidence.
  if (
    !actual.provider ||
    !actual.model ||
    !['stop', 'length', 'toolUse'].includes(actual.stopReason)
  )
    return fallback;
  const visible = ctx.sessionManager
    .buildSessionProjection()
    .entries.some(
      (entry) =>
        entry.sourceEntry.id === latest.id &&
        entry.messages.some((message) => message.role === 'assistant'),
    );
  if (!visible) return fallback;

  if (actual.provider === selected.provider && actual.model === selected.id) return fallback;
  // Equal IDs on different providers must not look like an unchanged identity.
  if (actual.model === selected.id)
    return `${selected.provider}/${selected.id} → ${actual.provider}/${actual.model}`;
  return `${selected.id} → ${actual.model}`;
}
