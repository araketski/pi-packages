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
- [Planned Herdr workflow and separate jobs module](docs/planned/herdr/scope.mara.md)

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
