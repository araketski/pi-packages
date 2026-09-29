# @araketski/pi-gates-protocol

Coordination library for awaited work in Pi extensions. A work owner journals
acquisitions, releases, and verified snapshots through Pi custom session
entries; observers request current state over `pi.events`. This library neither
runs jobs nor starts model turns. It does not deliver job results.

After `createGateOwner(pi, ownerId).start(ctx)`, the owning extension must check
its external jobs and call `reconcile(ctx, verifiedGates)` before acquiring or
releasing gates. `createGateObserver(pi).start(ctx)` replays historical intent as
unconfirmed. Its integration calls `finishDiscovery()` **after** Pi owners have
registered (not from an early `session_start` handler), then checks `view()`:
only `readiness: 'confirmed'` with no gates represents a confirmed empty wait.
Call `refresh()` to request fresh snapshots; stale leases and an owner that
does not reply are diagnostics, not permission to clear a gate. Close both
objects on session shutdown; restart and reconcile on session or tree changes.

Local tests cover Pi SDK extension startup and persistent and in-memory session
behavior. Full SDK session replacement and actual `goal`/`caffeinate` integration
have **not** been verified; those consumers must not rely on this package for
automatic continuation or sleep decisions until their own integrations are
tested. The intended behavior and verification scope are in
[the Mara contract](docs/contract.mara.md).

This library is not a Pi extension. The planned `pi-gates` visibility extension
is specified separately in [its staged contract](../../docs/planned/gates/contract.mara.md).
