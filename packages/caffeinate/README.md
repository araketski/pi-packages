# @araketski/pi-caffeinate

Scaffold only. The typed Caffeinate extension is a no-op with an implementation
TODO. It does not hold the machine awake or register commands, settings, tools,
hooks, flags or UI. No inhibitor or integration backend is loaded.

- [Scaffold and distribution boundary](./docs/scaffold.mara.md)
- [Intended Caffeinate contract](./docs/contract.mara.md)
- [Intended generic-gates/jobs integration](./docs/jobs-integration.mara.md)

Pi loads the original TypeScript resource. Local tests use Pi 0.99.1; the SDK is
host-provided, not bundled. Technical checks do not establish runtime inhibition,
license/NOTICE compliance or publication readiness. Author review is required
before release; this unfinished scaffold is not ready for use or publication.
