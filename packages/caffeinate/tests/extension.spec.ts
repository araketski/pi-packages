import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';
import caffeinate from '../extensions/caffeinate/index.ts';

it('leaves every Pi API untouched as a no-op scaffold', () => {
  const accessed: PropertyKey[] = [];
  const pi = new Proxy({} as ExtensionAPI, {
    get(_target, key) {
      accessed.push(key);
      throw new Error(`The scaffold must not access pi.${String(key)}`);
    },
  });
  expect(caffeinate(pi)).toBeUndefined();
  expect(accessed).toEqual([]);
});
