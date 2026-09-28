import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { StatusAppearance, StatusColorValue, StatuslineStatus } from '@araketski/pi-statusline-protocol';
import { mergeAppearance } from './config.js';

const STRING_INTRODUCERS = new Set([']', 'P', 'X', '^', '_']);
const C1_STRING_INTRODUCERS = new Set([0x90, 0x98, 0x9d, 0x9e, 0x9f]);

/** Strip terminal commands and bidi controls before adding footer-owned styling. */
export function sanitizeFooterText(value: string): string {
  const chars = Array.from(value);
  let result = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? '';
    const code = ch.codePointAt(0) ?? 0;
    const control = code === 0x1b ? chars[i + 1] : undefined;
    if ((code === 0x1b && control === '[') || code === 0x9b) {
      i += code === 0x1b ? 2 : 1;
      while (i < chars.length && !/[\x40-\x7e]/.test(chars[i] ?? '')) i++;
      continue;
    }
    if ((code === 0x1b && control && STRING_INTRODUCERS.has(control)) || C1_STRING_INTRODUCERS.has(code)) {
      i += code === 0x1b ? 2 : 1;
      while (i < chars.length) {
        if (chars[i] === '\u0007' || chars[i] === '\u009c') break;
        if (chars[i] === '\u001b' && chars[i + 1] === '\\') { i++; break; }
        i++;
      }
      continue;
    }
    if (code === 0x1b) { if (control !== undefined) i++; continue; }
    if (ch === '\n' || ch === '\r' || ch === '\t') { result += ' '; continue; }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) ||
        (code >= 0xfff9 && code <= 0xfffb) || /\p{Bidi_Control}/u.test(ch)) continue;
    result += ch;
  }
  return result;
}

export function styleText(
  text: string,
  color: StatusColorValue | undefined,
  theme: { fg(role: string, text: string): string },
): string {
  if (!text || color === undefined || color === '') return text;
  if (typeof color === 'number') return `\u001b[38;5;${color}m${text}\u001b[0m`;
  if (color.startsWith('#')) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    return `\u001b[38;2;${r};${g};${b}m${text}\u001b[0m`;
  }
  return theme.fg(color, text);
}

export function renderStatus(
  status: StatuslineStatus,
  override: StatusAppearance | undefined,
  theme: { fg(role: string, text: string): string },
): string {
  const appearance = mergeAppearance(status, override);
  const text = sanitizeFooterText(status.text);
  if (!text) return '';
  const prefix = sanitizeFooterText(appearance.prefix ?? '').trimEnd();
  const content = prefix ? `${prefix} ${text}` : text;
  const color = appearance.color;
  const selected = typeof color === 'object'
    ? status.state !== undefined && Object.hasOwn(color.byState, status.state)
      ? color.byState[status.state] : color.default
    : color;
  return styleText(content, selected, theme);
}

function segments(
  line: string[],
  itemText: (key: string) => string | undefined,
  separator: string,
): string[] {
  const result: string[] = [];
  let group: string[] = [];
  for (const token of line) {
    if (token === 'spacer') {
      result.push(group.join(separator));
      group = [];
    } else {
      const text = itemText(token);
      if (text && visibleWidth(text) > 0) group.push(text);
    }
  }
  result.push(group.join(separator));
  return result.filter((segment) => visibleWidth(segment) > 0);
}

export function renderLayoutLines(
  layout: string[][],
  itemText: (key: string) => string | undefined,
  separator: string,
  width: number,
): string[] {
  if (width <= 0) return [];
  if (layout.some((line) => segments(line, itemText, separator).reduce((sum, text) => sum + visibleWidth(text), 0) > width)) {
    return layout.flat().filter((token) => token !== 'spacer')
      .map(itemText).filter((text): text is string => !!text && visibleWidth(text) > 0)
      .map((text) => truncateToWidth(text, width));
  }
  return layout.map((line) => {
    const visible = segments(line, itemText, separator);
    const gaps = Math.max(0, visible.length - 1);
    let remaining = Math.max(0, width - visible.reduce((sum, text) => sum + visibleWidth(text), 0));
    let rendered = '';
    for (const [index, text] of visible.entries()) {
      rendered += text;
      if (index < gaps) {
        const space = Math.floor(remaining / (gaps - index));
        rendered += ' '.repeat(space);
        remaining -= space;
      }
    }
    return truncateToWidth(rendered, width);
  }).filter((line) => visibleWidth(line) > 0);
}
