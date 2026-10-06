# Pi packages workspace

This repository develops `@araketski/nx-pi`, a reusable Nx plugin for Pi package
scaffolding and validation. It is not yet published. The plugin is development
tooling, not a Pi resource package; generated resource packages and shared
libraries can be checked here and in independent npm/pnpm consumer fixtures.

- [Plugin usage and current limitations](packages/nx-pi/README.md)
- [Statusline protocol library and current limitations](packages/statusline-protocol/README.md)
- [Custom statusline](packages/statusline/README.md) and [contract](packages/statusline/docs/contract.mara.md)
- [Plugin scope](packages/nx-pi/docs/scope.mara.md) and [structured contract](packages/nx-pi/docs/contract.mara.md)
- [Workspace layout](docs/workspace-layout.mara.md)
- [Testing and consumer fixtures](docs/testing.mara.md)
- [Repository linting](docs/tooling.mara.md)
- [Release preparation and protected publication](docs/release.mara.md)
- [Pi release compatibility policy](docs/pi-compatibility.mara.md)
- [Workflow package delivery items](.work/items/836650d231e94caa851d8ca082aa32ad.md) and [Pi 0.99.1 capability reconciliation](docs/pi-0991-reconciliation.mara.md)
- [Herdr scaffold](packages/herdr/README.md), [intended workflow](packages/herdr/docs/scope.mara.md) and [execution/RPC contract](packages/herdr/docs/contract.mara.md)
- [Jobs-core package boundary and contract compatibility](packages/jobs-core/docs/contract.mara.md)
- [Local jobs execution](packages/jobs/docs/execution.mara.md) and [controls](packages/jobs/docs/controls.mara.md)
- [Goal scaffold](packages/goal/README.md), [intended contract](packages/goal/docs/contract.mara.md) and [jobs integration](packages/goal/docs/jobs-integration.mara.md)
- [Caffeinate scaffold](packages/caffeinate/README.md), [intended contract](packages/caffeinate/docs/contract.mara.md) and [jobs integration](packages/caffeinate/docs/jobs-integration.mara.md)
- [Planned gates inspection and visibility](docs/planned/gates/contract.mara.md)
- [Questions extension](packages/questions/docs/contract.mara.md), [interaction/lifecycle design](packages/questions/docs/design.mara.md) and [verification plan](packages/questions/docs/verification.mara.md)
- [On-demand judgment tools](packages/judgments/README.md) and [advisory contract](packages/judgments/docs/contract.mara.md)
- [Session auto-naming](packages/session-name/README.md) and [terminal-title contract](packages/session-name/docs/contract.mara.md)

## Development

This workspace uses pnpm. With dependencies installed, run the Nx project checks:

```sh
pnpm install --frozen-lockfile
pnpm nx run-many -t build test lint typecheck
pnpm nx run-many -t pi-check
pnpm nx format:check --all
pnpm nx sync:check
```

The `nx-pi` test target builds the plugin and exercises its packed artifact in disposable
npm and pnpm workspaces. Extension packages also run source and packed Pi load checks
under their own test targets. Installation in those fixtures may use the registry or
package-manager cache. Interactive fixtures need Linux `script`, `stty`, and
`/bin/sh`; on systems with a small `/tmp`, see [testing](docs/testing.mara.md)
for temporary-directory settings. Neither local checks nor Nx Release dry-runs
constitute actual registry publication.

Specifications and verification definitions are maintained in Git-tracked
`*.mara.md` files. Validate them with Mara and require `valid: true` and
`evaluation_complete: true`:

```sh
mara --project "$PWD" --format json project validate
```
