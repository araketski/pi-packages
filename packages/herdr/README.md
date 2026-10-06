# @araketski/pi-herdr

Pi resource package with a thin current-local Herdr JSON transport seam.
The Pi extension factory remains a typed **no-op**: it registers no tools,
commands, hooks, or UI and does not connect automatically. Installing it does
not yet provide Pi-facing terminal controls or managed jobs.

Pi loads the declared TypeScript entry point from `extensions/herdr/index.ts`;
no package compilation is required. Pi supplies the host API. The package exposes
only `./package.json`, not a root library API.

The repository's [scaffold boundary and checks](docs/scaffold.mara.md),
[workflow scope](docs/scope.mara.md), and
[execution/transport contract](docs/contract.mara.md) are canonical repository-only
knowledge, excluded from the npm archive. The internal transport source supports the bounded pane-view slice described
there; other runtime contracts remain future work. Loading the empty factory
does not verify Herdr runtime behavior or other platforms. No release or publication
readiness is claimed.
