# Goal scaffold boundary

Work `7e35d2d1b349446c8a354277649f3781` creates only the package, typed no-op
Goal extension, and unfinished goal-writer skill using the local nx-pi generators.
The [Goal contract](./contract.mara.md) remains intended behavior. No Goal control,
startup flag, ledger, persistence, classifier, scheduling, budget, or Herdr
attention behavior is implemented. Generated skill discovery is not a completed
writing workflow.

## Package and publication

The resource manifest selects `extensions/goal/index.ts` and
`skills/goal-writer`. Pi loads the TypeScript source; no compiled library exports
or build step are needed. Pi is a host peer through `catalog:pi-host`, with the
workspace's pinned Pi 0.99.1 catalog used for development. There are no runtime
or internal workspace dependencies.

The explicit publication allowlist includes the extension directory, skill
directory, README and MIT license. It excludes repository-only Mara documents,
the retained synthetic dataset, tests and tooling configuration. No original
branch source or dependencies were copied. The generated extension and skill
retain honest implementation TODOs. They are not ready for use or publication;
technical checks do not replace author-owned license/NOTICE and release review.

## Knowledge relocation

The staged Goal items are moved with Mara into this directory with their IDs,
MIDs, fields and relations intact. The historical classifier pilot and retained
synthetic records are preserved, not rerun or promoted into runtime evidence.
Relative links and incoming document links are repaired; this is the sole
canonical copy. Workspace-wide knowledge remains under root `docs/`.

## Verification boundary

Package-owned Nx tests check a factory that does not access the Pi API, actual
source resource loading, and fresh archives installed independently with npm
and pnpm using Pi 0.99.1. They check package provenance, discoverable TODO skill
content, empty extension registrations, no backend/classifier/network activity,
and unchanged isolated session history after binding and reload. No model
inference is required. These are scaffold checks, not passing evidence for any
future Goal verification item.

Source and explicit-archive pi-checks, strict typechecking, lint, changed-file
formatting, frozen installation, Nx sync, complete Mara validation, Work
diagnostics and independent local review are separate delivery gates. Actual
commands, revision identities, archive hashes and results belong to the owning
Work item and retained verification evidence, not fabricated product evidence.
