# @araketski/pi-statusline-protocol

A compiled library for Pi status producers. The first implementation slice publishes each status to Pi's native footer and emits a structured update for a future custom statusline. It can answer late snapshot requests with the current status of each registered producer. This package is **not** the custom footer extension; centralized rendering overrides are not implemented yet.

Register per session with a stable, distinct key and source. A handle holds producer defaults so updates only need changing text and state:

```ts
import { registerStatus } from '@araketski/pi-statusline-protocol';

const status = registerStatus(pi, ctx.ui, {
  source: 'example',
  key: 'example',
  prefix: '◎',
  color: { default: 'muted', byState: { running: 'accent' } },
});
status.update({ text: 'active', state: 'running' });
// When the status expires:
status.clear();
// At session shutdown:
status.dispose();
```

The native fallback displays the producer's prefix, text, and color for the current state. `color` accepts either one value for every state or `{ default, byState }`, using `default` when the state has no mapping. Each value can be a Pi theme role (`'accent'`), six-digit hex (`'#8aadf4'`), an ANSI 256-color index (`0`–`255`), or `''` for terminal-default text. Invalid hex (including `#RGB`) and out-of-range indices are rejected at registration. The exported `StatusAppearance` type (`prefix` and `color`) is shared by producer registration and future per-key custom-footer configuration. Structured updates and snapshots retain source, key, text, state, prefix, and the complete color definition without ANSI styling. A custom footer can subscribe to `STATUS_SET_EVENT`, `STATUS_CLEAR_EVENT`, and `STATUS_SNAPSHOT_EVENT`, and emit `STATUS_SNAPSHOT_REQUEST_EVENT` after subscribing to recover statuses published before it started. Each active producer responds with its own snapshot; the footer must merge them. The library does not install a bridge extension or detect which footer is active.

Support for Pi 0.87.1 is the current target; a real Pi custom-footer integration and shared-key conflict handling have not yet been verified. The repository-only canonical contract is at `packages/statusline-protocol/docs/contract.mara.md`; it is excluded from the published artifact.
