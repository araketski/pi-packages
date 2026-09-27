/** @mara implements DES-NXPI-INIT-CONTRACT */
export function assertSupportedRuntime(nxVersion: string, nodeVersion: string): void {
  if (Number(nxVersion.split('.')[0]) !== 23) {
    throw new Error('nx-pi init: Nx 23 is required; use a compatible plugin/Nx version.');
  }
  const [major, minor] = nodeVersion.split('.').map(Number);
  if (!((major === 24 && minor >= 15) || major === 26)) {
    throw new Error('nx-pi init: Node 24.15+ or 26 is required; switch Node before initializing.');
  }
}
