:::mara design DES-GOAL-FRESH-LEDGER
:mid: 01M487MGF4G7HYMF5P2M4GXRXK
:title: Bind a fresh bounded ledger and latest reviews to Pi branch history
:status: accepted
:kind: data
:satisfies: REQ-GOAL-EVIDENCE
:satisfies: REQ-GOAL-FRESH-STATE
:satisfies: REQ-GOAL-SESSION-STATE

## Bounded implementation slice

Use custom entry type `araketski.goal.state.v1`, schema version 1. Each entry is a complete compact snapshot containing one goal or null. Never read legacy entry types. The latest new-namespace entry on `ctx.sessionManager.getBranch()` is authoritative; a malformed latest entry yields no current goal and a diagnostic, not fallback to an older apparently valid snapshot. Pi history remains append-only audit, including complete, budget-limited and cleared goal snapshots. Creating a later goal never edits the former records.

Public mapping: `pi.appendEntry()` writes snapshots; the read-only extension session manager supplies `getBranch()` and `getSessionId()`. Register only session_start, session_tree, session_compact and session_shutdown handlers. Startup/reload default to paused for restored active goals; persist the pause. New/resume/fork/tree follow selected branch contents. Compaction reads the same branch and preserves the ledger. Settings retain restore policy (pause, restore-idle, resume) and classifier enablement. Nondefault policies preserve active state but dispatch no turn in this slice; scheduling, clocks and budgets remain unimplemented. No offline clock is introduced. Shutdown discards the bound context; mutation requires a currently bound session. No external session store or raw JSONL writer.

Goal UUID, expected monotonic snapshot revision and transient session-binding generation guard serialized mutations. Requirements have stable caller-supplied IDs, observable criterion text, pending/blocked/verified status, a concrete blocker for blocked state, and evidence items with stable IDs plus concise reference and claim. These are acceptance criteria, not tasks; references/claims are supporting assertions, not inspected artifact contents. Initialize/upsert requirements, add/remove evidence, set status and reset the ledger only for an active current goal with matching identity/revision. A changed criterion returns to pending and removes its blocker while retaining supporting claims for inspection; evidence removal returns a verified requirement to pending. Completion storage requires a nonempty all-verified evidenced checklist and no applicable refusal; the future controller must additionally establish direct inspection and confirmed-unblocked gates. Ledger JSON is bounded to 50 requirements, 20 evidence items per requirement, and 16 KiB UTF-8. Reject rather than truncate or partially apply mutations.

Each goal tracks criteria revision and evidence revision separately. Initial/new/changed criteria invalidate both latest reviews; all other ledger mutations invalidate the evidence review only. Settings changes reject in-flight results but do not erase an applicable refusal. Latest criteria/evidence assessments store only outcome (sufficient/insufficient/uncertain), bound revisions, supplied-input digest/key, configuration key and bounded diagnostic; no review context, transcript, artifact contents, provider calls or artifact crawler. Criteria review binds criteria revision; evidence review binds criteria and evidence revisions. Cache reuse additionally requires matching input and configuration keys. Refusal applicability ignores configuration disablement/unavailability and remains until relevant ledger/criteria change or a valid explicit re-review replaces it. Transport failure is not a stored positive assessment and cannot replace a refusal.

Review tickets capture session ID, binding generation, goal identity, expected snapshot revision, review kind and input/configuration keys. Results apply only while that binding and revision remain current; tickets are transient, not persisted authority. A fresh ticket supersedes an earlier ticket of the same kind. These are storage/cache seams for the next controls increment, not criteria/completion controllers or proof of classifier accuracy.

## Observable checks

Start with create → initialize criterion → add evidence → verify → save/reopen through actual Pi persistent and in-memory APIs. Cover each mutation and count/byte boundary, changed-criteria invalidation, stale/cross-goal/session results, refusal/cache persistence through disablement, malformed latest replay, ordinary branch/fork/session selection, compaction and terminal audit preservation. Source resource loading and fresh npm/pnpm-installed Pi 0.99.1 consumers must exercise this seam. No slash commands, model tools, flags, scheduling or provider enablement are registered. Full Goal verification methods remain only partially implemented by this slice.
:::
