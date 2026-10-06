# Herdr extension scaffold

## Implemented versus intended

`packages/herdr` was generated with the supported local `@araketski/nx-pi:package`
and `@araketski/nx-pi:extension` generators after help/source inspection and dry
runs. Its initial manifest version remains `0.1.0`, not a release or a jobs
contract stamp. `extensions/herdr/index.ts` is the generated typed no-op factory
with its implementation TODO intact.

[Scope](./scope.mara.md) and [execution/transport](./contract.mara.md) retain their
stable item identities and intended runtime meaning. [[REQ-HERDR-JOBS-MODULE]],
[[REQ-HERDR-LOCAL-SCOPE]] and [[DES-HERDR-PUBLIC-JSON-ADAPTER]] were not implemented
by the original scaffold. The subsequent thin transport increment adds
`extensions/herdr/transport.ts` with the bounded pane-view interface specified
in that design. The factory remains no-op: no automatic connection, tool, command,
hook, UI, job tracking or agent messaging. Transport checks explicitly opt into
an isolated Linux Herdr 0.9.1 server; factory-loading checks never access a live
endpoint. Other runtime contracts remain future work.

[[DES-JOBS-PACKAGE-BOUNDARY]] and [[DES-JOBS-INTERFACE-CHECKPOINT]] govern later
consumer integration. No runtime dependency on jobs-core or sibling unintegrated
APIs is added. Managed-command authority/storage/launch and jobs integration
remain future work; transport observations do not claim command outcomes.

## Publication selection

The explicit `files` allowlist selects `extensions/herdr` (the no-op factory and
its transport runtime source only) and `LICENSE`; the
manifest and consumer README are also packed by pnpm. Pi loads source TypeScript,
so there is no resource compilation or build target. The only npm export is
`./package.json`, not a root library API. Repository-only Mara knowledge, tests,
Nx/TypeScript configuration and test tooling are excluded from the archive.
The host peer uses the existing `pi-host` catalog (`*`), and local development
uses the existing Pi `0.99.1` catalog. No host SDK is bundled or listed as a
runtime dependency. The MIT license text follows the existing repository package
material; license/attribution and publication readiness still require author
review and are not established by archive selection or static checks.

## Repeatable scaffold verification

Inspect resolved Nx targets, then run strict `lint`, `typecheck`, `test` and
source `pi-check`. Fresh-build the compiled nx-pi tooling before checking/packing;
the extension itself has no compiled resource output. Distribution tests pack
current source, assert exact archive members and pass each explicit fresh archive
to `pi-check-package --tarball`. Independent npm and pnpm consumers install the
archive alongside Pi 0.99.1 and verify metadata-only exports, factory/transport
byte provenance, fixture-project package discovery and no registrations. Each
consumer also typechecks installed transport source with TypeScript 6.0.3 and
Node types, and uses the host's Jiti loader to exercise connect/query/rename/
reconnect through a controlled socket. These are source-module checks, not a
published library API or real-server proof. Approval is
fixture-local; no global settings, credentials, model inference, MCP or Herdr
server is used. Test both the current manifest version and a copied disposable
alternate-version source fixture; never mutate pnpm-hardlinked installed files.
`PI_TEST_PACKAGE_CACHE` optionally selects an owned fixture install cache/store.

Run changed-file formatting, frozen installation, Nx sync, complete Mara
schema/project validation and Work diagnostics after relocation. These establish
scaffold distribution/loading only, not the future runtime verification methods
in the linked documents or actual publication readiness.
