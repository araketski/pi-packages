import { expect, it } from 'vitest';
import * as scaffold from './index.js';

it('leaves the jobs API to the shared-interface checkpoint', () => {
  expect(Object.keys(scaffold)).toEqual([]);
});
