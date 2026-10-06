# Goal scaffold and implementation boundary

The scaffold Work `7e35d2d1b349446c8a354277649f3781` originally created a typed
no-op extension and unfinished goal-writer skill. Work
`9b5915e75a5f4d0e947841340bcb58cc` adds only the internal fresh state/ledger
seam and four public Pi state lifecycle observers. The extension is no longer
strictly no-op: startup/reload can append a paused fresh-namespace snapshot.
Legacy-only sessions remain unchanged. [The state design](./state.mara.md)
defines this bounded slice; [the Goal contract](./contract.mara.md) remains the
broader intended behavior, not full implementation or passing evidence.

No Goal controls, model tools, startup flag, classifier invocation, scheduling,
budget runtime, clock accounting, or Herdr attention behavior is implemented.
Restore-idle/resume settings retain active state but do not dispatch work yet.
There is no force-complete route: internal terminal storage enforces the
checklist and applicable-refusal guards; future completion controllers must
also establish direct inspection and confirmed-unblocked generic gates.
The generated goal-writer skill still contains explicit TODOs.

## Package and publication

The resource manifest selects `extensions/goal/index.ts` and
`skills/goal-writer`. Pi loads TypeScript source; no compiled library exports
or build step are needed. Pi is a host peer through `catalog:pi-host`, with the
workspace's pinned Pi 0.99.1 catalog used for development. There are no runtime
or internal workspace dependencies.

The explicit publication allowlist selects only `extensions/goal/index.ts`,
its required `state.ts`, the skill directory, README and MIT license. It excludes
repository-only Mara documents, historical synthetic data, tests and tooling
configuration. No original Goal branch source or dependencies were copied.
The package is not a finished Goal workflow or publication-ready artifact;
technical checks do not replace author-owned license/NOTICE and release review.

## Knowledge relocation

The scaffold relocated staged Goal items with Mara, preserving IDs, MIDs,
fields and relations. Historical classifier pilot and synthetic records remain
unchanged, not rerun or promoted into runtime evidence. This directory remains
the sole canonical copy. Workspace-wide knowledge remains in root `docs/`.

## Verification boundary

Package-owned tests exercise the internal bounded ledger, identity/revision
checks, review cache/refusal persistence, terminal audit and malformed replay.
Actual Pi 0.99.1 source loading and fresh archives installed independently with
npm and pnpm exercise persistent and in-memory state round trips, tree/fork/new/
session restoration, compaction and default startup/reload pause. Test-only
companion factories expose the internal seam and provide a controlled compaction
summary. They use public `AgentSessionRuntime`, session APIs and `pi.appendEntry`;
no source mocks, private state mutations, raw JSONL writes, classifier/provider
calls, production credentials or live user history are used. Controlled stored
assessments are not classifier accuracy or supplied-evidence verification.

Source and explicit-archive pi-checks, strict typechecking, lint, formatting,
frozen installation, Nx sync, complete Mara validation, Work diagnostics and
independent review remain separate gates. Actual revision identities, command
logs, archive hashes, installed consumer receipts and review results belong to
the owning Work body and retained evidence. Full Goal verification items remain
only partially covered, not passed by this slice.
