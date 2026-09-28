import { describe, expect, it } from 'vitest';
import { visibleWidth } from '@earendil-works/pi-tui';
import { renderLayoutLines, renderStatus, sanitizeFooterText } from '../extensions/statusline/src/render.js';

describe('footer presentation', () => {
  it('formats prefix, color and state overrides without changing producer defaults', () => {
    const source = { source: 'x', key: 'x', text: 'working', state: 'active', prefix: '●',
      color: { default: 'muted', byState: { active: 'success', waiting: 'warning' } } };
    const theme = { fg: (role: string, text: string) => `[${role}]${text}` };
    expect(renderStatus(source, { color: { byState: { active: 0 } } }, theme)).toBe('\u001b[38;5;0m● working\u001b[0m');
    expect(renderStatus({ ...source, state: 'waiting' }, { color: { byState: { active: 0 } } }, theme)).toBe('[warning]● working');
    expect(renderStatus(source, { prefix: '', color: '' }, theme)).toBe('working');
    expect(source.color.byState.active).toBe('success');
    expect(renderStatus({ ...source, text: 'done' }, { color: '#aabbcc' }, theme)).toBe('\u001b[38;2;170;187;204m● done\u001b[0m');
  });

  it('supports multiline spacing, omission and one-token-per-line narrow fallback', () => {
    const items = new Map([['a', 'alpha'], ['b', 'beta'], ['c', '測試']]);
    const lookup = (key: string) => items.get(key);
    expect(renderLayoutLines([['a', 'b', 'spacer', 'c'], ['missing']], lookup, ' • ', 35)).toEqual([
      `alpha • beta${' '.repeat(35 - visibleWidth('alpha • beta') - visibleWidth('測試'))}測試`,
    ]);
    expect(renderLayoutLines([['a', 'b', 'spacer', 'c']], lookup, ' • ', 10)).toEqual(['alpha', 'beta', '測試']);
    expect(renderLayoutLines([['missing', 'spacer', 'b'], []], lookup, ' • ', 20)).toEqual(['beta']);
    expect(renderLayoutLines([['a', 'b']], lookup, ' • ', 1).every((line) => visibleWidth(line) <= 1)).toBe(true);
  });

  it('removes terminal controls and bidi direction changes before styling', () => {
    const unsafe = 'start\u001b]52;c;c2VjcmV0\u0007\u001bPpayload\u001b\\\u009d52;c;evil\u009c\u001b[31mend\u001b[0m\u202e\u0000';
    expect(sanitizeFooterText(unsafe)).toBe('startend');
    const themed = renderStatus({ source: 'x', key: 'x', prefix: '★\n', text: unsafe, color: 'accent' }, undefined,
      { fg: (_role, text) => `<accent>${text}</accent>` });
    expect(themed).toBe('<accent>★ startend</accent>');
    expect(themed).not.toContain('payload');
    expect(themed).not.toContain('secret');
  });
});
