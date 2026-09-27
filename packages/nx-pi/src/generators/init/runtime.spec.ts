import { describe, expect, it } from 'vitest';
import { assertSupportedRuntime } from './runtime';

// @mara checks DES-NXPI-INIT-CONTRACT
describe('initial runtime boundary', () => {
  it.each(['24.15.0', '24.19.0', '26.0.0', '26.7.0'])('accepts Nx 23 with Node %s', (node) => {
    expect(() => assertSupportedRuntime('23.2.1', node)).not.toThrow();
  });
  it.each(['22.9.0', '24.0.0'])('rejects Nx %s', (nx) => {
    expect(() => assertSupportedRuntime(nx, '26.7.0')).toThrow(/Nx 23/);
  });
  it.each(['22.22.2', '24.14.0', '25.0.0', '27.0.0'])('rejects Node %s', (node) => {
    expect(() => assertSupportedRuntime('23.2.1', node)).toThrow(/Node 24\.15.*26/);
  });
});
