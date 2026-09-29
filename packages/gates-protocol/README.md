# @araketski/pi-gates-protocol

Work in progress: owners can journal verified state and communicate it to late
observers over Pi's extension event bus. Observers can request fresh state and
report stale leases or owners that have not answered; they never silently clear
a wait. Pi lifecycle and consumer integration are not yet verified. **Do not
use this library yet to decide whether `goal` resumes or `caffeinate` releases
its hold.** An owner must verify external jobs before calling `reconcile`;
replayed session entries alone are not proof of running work. The intended behavior and open
questions are in [the Mara contract](docs/contract.mara.md).

This library is not a Pi extension. The planned `pi-gates` visibility extension
is specified separately in [its staged contract](../../docs/planned/gates/contract.mara.md).
