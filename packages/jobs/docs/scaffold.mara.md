# Jobs extension scaffold

## Current boundary

`packages/jobs` was generated with the local `@araketski/nx-pi:package` and
`@araketski/nx-pi:extension` generators. Its initial manifest version is `0.1.0`,
not a release or jobs contract stamp. The generated `extensions/jobs/index.ts`
is a typed no-op factory with an explicit implementation TODO.

The resource-internal local executor now implements the backend/handoff design
[[DES-JOBS-LOCAL-EXECUTOR]], with caller-supplied authority and output sinks.
[Controls](./controls.mara.md) and complete extension integration remain intended
contracts, not implemented behavior. In particular,
[[REQ-JOBS-CONTROL-SURFACE]] and [[REQ-JOBS-NATIVE-USER-BASH]] remain unimplemented:
there are no jobs tools, `/jobs`, model bash replacement, or user-bash handlers.
The native `!`/`!!` policy is preserved, not implemented by the scaffold.
[[DES-JOBS-PACKAGE-BOUNDARY]] still governs later implementation; this package
has a type-only workspace development dependency on the committed jobs-core ports,
not a bundled shared runtime or speculative sibling implementation.

## Publication selection

The `files` allowlist explicitly selects the no-op factory, foreground latch,
local executor, Linux evidence implementation/declaration, supervisor and LICENSE;
pnpm also includes the manifest and consumer README. Source TypeScript is loaded by Pi,
so there is no compiled-resource build target or stale dist to reuse. The only
npm export is `./package.json`; no root library API is promised. Tests, tooling
configuration and repository-only `*.mara.md` knowledge are excluded.
The host peer uses the existing `pi-host` catalog (`*`), while the development
SDK uses the existing `0.99.1` catalog. No host SDK is bundled or declared as a
runtime dependency. Technical archive selection does not establish legal
compliance or publication readiness.

## Repeatable scaffold checks

Inspect resolved Nx configuration, then run `typecheck`, strict `lint`, `test`
and source `pi-check`. The distribution tests pack current extension source,
check the actual archive through explicit `pi-check-package --tarball`, and
install it outside the checkout in independent npm and pnpm consumers with
Pi 0.99.1. They verify actual archive members, metadata-only exports, installed
source provenance, package-sourced resource discovery and no registrations from
the scaffold. Fixture-local project approval allows only that isolated package
configuration. An alternate version in a disposable source fixture checks that
release preparation is not pinned to the initial scaffold version; repository
versions are not changed. The fresh installed npm/pnpm resource modules also run
real Linux execution through Pi 0.99.1 direct/nested/codemode calls, cancellation
and handoff in network-isolated SDK fixtures. A synthetic provider supplies tool
calls; no shared credentials, MCP server or live model inference is used.

Run formatting, frozen installation, Nx sync and complete Mara validation after
relocation. These checks establish resource/artifact loading and the bounded local
backend/handoff behavior, not concrete native bash replacement, UI, scheduling,
full application-lifetime cleanup, persistence/recovery or final-result delivery.
Routine execution/review/artifact receipts and tested identities belong in Work.
