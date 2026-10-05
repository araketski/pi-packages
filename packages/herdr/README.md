# @araketski/pi-herdr

Pi resource package scaffold. The Herdr extension is intentionally a typed
**no-op**: it registers no tools, commands, hooks, or UI and does not connect to
Herdr. Installing it does not provide terminal controls or managed jobs.

Pi loads the declared TypeScript entry point from `extensions/herdr/index.ts`;
no package compilation is required. Pi supplies the host API. The package exposes
only `./package.json`, not a root library API.

The repository's [scaffold boundary and checks](docs/scaffold.mara.md),
[workflow scope](docs/scope.mara.md), and
[execution/transport contract](docs/contract.mara.md) are canonical repository-only
knowledge, excluded from the npm archive. Runtime contracts describe future work,
including Linux/current-local-session scope; loading this empty factory does not
verify Herdr runtime behavior or other platforms. No release or publication
readiness is claimed.
