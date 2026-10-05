# Jobs core scaffold

## Current boundary

The project at `packages/jobs-core` was generated with the local
`@araketski/nx-pi:library` generator, strict TypeScript, Oxlint, Vitest, and Oxfmt
opt-ins. It is `@araketski/pi-jobs-core` at initial manifest version `0.1.0`, a
compiled shared library tagged `nx-pi:library`, not a Pi resource package.
The user selected an empty public module rather than Nx's sample function.
This version does not stamp a jobs contract revision or indicate a release.

[[DES-JOBS-PACKAGE-BOUNDARY]] and [[REQ-JOBS-RELEASE-COMPAT]] remain intended
contracts. Jobs runtime and the shared-interface checkpoint are outside this
scaffold. No Pi SDK, gates protocol, or execution adapter is imported or declared
as a runtime dependency yet. The generator's `tslib` dependency uses the existing
workspace catalog. Future dependencies follow actual implementation needs; this
scaffold does not settle public APIs or Pi peer ranges.

## Publication selection

Build before packing. The manifest's file allowlist selects only compiled
`dist/index.js`, `dist/index.d.ts`, and its declaration map.
The package manager also includes `package.json` and the consumer-facing README.
Source, tests, test configuration, compiler state, and repository-only
`*.mara.md` plans are not selected. The root and `./package.json` exports are
standard npm entries; there are no Pi resources or resource paths.
This technical selection does not establish legal compliance or release readiness.

## Repeatable scaffold checks

Run the resolved Nx `build`, `typecheck`, strict `lint`, `test`, and source
`pi-check` targets. The uncached test target depends on the library build.
Its distribution suite packs the built package, checks that explicit archive
through `pi-check-package --tarball=<absolute-path>`, and installs it in separate
npm and pnpm consumers outside the workspace. It verifies the empty root import,
package metadata, installed artifact provenance, and declaration resolution with
the workspace-selected TypeScript version installed in each consumer.
It also inspects the actual archive members rather than trusting `files`.
Disposable consumer directories are removed after each test.

Use disk-backed isolated temporary storage for these checks. Run formatting,
Nx sync, frozen installation, and complete Mara validation after relocation.
Runtime participant/lifecycle/delivery/storage verification in the other documents
is still future work. These scaffold checks prove neither Pi loading/integration,
remote CI, other hosts or Node versions, public registry installation, future Pi
support, nor publication.
