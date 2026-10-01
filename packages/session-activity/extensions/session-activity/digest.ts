import type { TurnEndEvent } from '@earendil-works/pi-coding-agent';

/** Bounded iteration: do not allocate all code points of an arbitrarily large input. */
export function limitText(text: string, max: number): string {
  let result = '';
  let count = 0;
  for (const point of text) {
    if (count++ >= max) break;
    result += point;
  }
  return result;
}
export function safeText(text: string): string {
  return text
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();
}
const fields = ['path', 'file_path', 'filePath', 'paths', 'pattern', 'query', 'command'] as const;
function curatedArguments(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const args = raw as Record<string, unknown>;
  const entries: string[] = [];
  let remaining = 400;
  for (const field of fields) {
    const value = args[field];
    // Only scalar text fields: never traverse nested payloads or serialize arbitrary arguments.
    if (typeof value !== 'string') continue;
    const entry = limitText(`${field}=${safeText(limitText(value, 400))}`, remaining);
    entries.push(entry);
    remaining -= Array.from(entry).length + 1;
    if (remaining <= 0) break;
  }
  return limitText(entries.join(' '), 400);
}

// @mara implements REQ-SESSION-ACTIVITY-DIGEST
export class ActivityDigest {
  private turns: string[] = [];
  reset(): void {
    this.turns = [];
  }
  add(message: TurnEndEvent['message']): void {
    if (message.role !== 'assistant') return;
    const entries: string[] = [];
    let remaining = 1199;
    // Prefer newest content when a turn has an unusually large tool batch.
    for (let i = message.content.length - 1; i >= 0 && remaining > 0; i--) {
      const block = message.content[i]!;
      let entry = '';
      if (block.type === 'text') entry = `assistant: ${safeText(limitText(block.text, 600))}`;
      if (block.type === 'toolCall')
        entry = `tool ${safeText(limitText(block.name, 64))}: ${curatedArguments(block.arguments)}`;
      if (!entry) continue;
      entry = limitText(entry, remaining);
      entries.unshift(entry);
      remaining -= Array.from(entry).length + 1;
    }
    this.turns.push(entries.join('\n'));
    if (this.turns.length > 5) this.turns.shift();
  }
  snapshot(): string {
    return limitText(this.turns.filter(Boolean).join('\n'), 6000);
  }
}
