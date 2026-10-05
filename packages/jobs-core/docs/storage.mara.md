# Jobs persistence and bounded output

These are accepted storage policies, not an implemented store or passing
verification of the revised session-backed design. They support [session continuity](./lifecycle.mara.md) and
[delivery receipts](./delivery.mara.md), without creating another Pi session system.

## Reuse Pi state facilities

Use Pi session identities and lifecycle reasons. Store compact job records,
lifecycle/delivery history and final results through namespaced public custom
entries; these stay out of model context. Only bounded output artifacts live in
external jobs-owned storage. Do not edit Pi session JSONL or put whole logs in
custom entries. History does not rewind execution or establish liveness/control.
Genuine deactivation triggers bounded best-effort managed cancellation, not a
promise to keep recording completions while that session is inactive.

The inspected Pi session/extension APIs provide session IDs and entry/branch
access, custom entries, model-visible custom messages, in-memory sessions, and
shutdown reasons that separate quit from reload/new/resume/fork. Pi 0.99.1 creates
a new session file on the first user or assistant message; setup/custom entries
alone can remain buffered. This advances the assistant-only boundary observed in
0.87.1; see the [baseline reconciliation](../../../docs/pi-0991-reconciliation.mara.md).
An accepted append call is not an immediate filesystem-durability guarantee; do not introduce a separate gate journal or file-existence admission
check merely to strengthen Pi session resumability.

## Bounded storage, not unlimited full logs

Capture complete command output while it fits the configured bounds. On overflow,
keep a small initial excerpt and a rolling window of recent output; expose omitted
output honestly. This is rolling storage, not a floating terminal UI requirement.
Retained combined output is limited to 10 MB (10,000,000 bytes) per job. There is
no shared ceiling, aggregate accounting, completion reservation or quota-pressure
admission/eviction. Aggregate disk use can grow with retained jobs; eligible
output still expires by time. This does not bound Herdr scrollback or arbitrary
command-written files, or support multiple Pi writers to one conversation.

[[DES-JOBS-SESSION-STORE]] and [[ADR-JOBS-SESSION-BOUNDED-STORAGE]] replace the
external-record/shared-quota direction. Define compact entry and rolling-output
formats, per-job ordering, bounded write overhead, retention and honest fallback
before implementation; do not carry forward the paused quota-store machinery.
The retired quota requirement below is retained as history, not current policy.

## Agreed knowledge

:::mara requirement REQ-JOBS-PI-STATE
:mid: 01M3PZPT7GD76TYM82Z3NNJG8F
:title: Store compact job state in Pi sessions and keep only output artifacts external
:status: accepted
:kind: constraint
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME
:derives_from: REQ-JOBS-SESSION-CONTINUITY

Use Pi session identity, lifecycle events, and namespaced custom entries through supported public Pi APIs for compact job records, lifecycle/delivery history, and final results. These entries stay outside model context; model-directed delivery uses normal Pi messages or recorded tool results. Keep only bounded output artifacts in jobs-owned storage under the selected Pi user state, outside repositories/worktrees; output-format bookkeeping may accompany captured bytes but must not become a separate execution/result database. Do not edit Pi session JSONL directly, put whole logs in custom entries, or build a parallel session system. Preserve job/result and producer identity, but never treat a saved running record as current liveness or historical identity as control authority.

Follow [[REQ-JOBS-SESSION-CONTINUITY]]: genuine session deactivation triggers best-effort cancellation, with no guarantee of continued monitoring, completion capture or result delivery afterward. Record known outcomes and cancellation uncertainty through the originating session's still-valid public append boundary where possible; never use an invalidated callback or redirect a late result into another session. Reopening a session restores saved metadata/results, not execution or ownership. Follow Pi resumability: an accepted append is not immediate filesystem durability or fsync. Pi 0.99.1 creates a new persistent session file on its first user or assistant message; custom/setup entries alone may remain buffered. Do not gate launches on session-file existence. For --no-session/in-memory runs, use in-memory job state and temporary bounded output, best-effort normal-shutdown cleanup, and no post-exit recovery promise.
:::

:::mara requirement REQ-JOBS-OUTPUT-BOUNDS
:mid: 01M3PZPX6ZT4GR7050J73N4JKS
:title: Bound saved output with a retained beginning and rolling tail
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Retain at most 10 MB (10,000,000 bytes) of combined captured command output per job. This is the per-job output ceiling, not a model-context allowance or a shared-root quota. Capture complete output while it fits. At the limit, preserve a small initial excerpt plus a rolling window of the latest output and clearly report omitted bytes/data. Continue draining output with bounded memory and disk use; reaching the logging limit does not stop the command. Implementation must define bounded representation overhead and temporary-file/write behavior before coding, without introducing global quota accounting. Send only bounded excerpts to the model using applicable Pi truncation facilities, with job identity and a reference for retrieving retained output. Never claim the retained log is complete after discarding data. No floating UI panel is required.

There is no aggregate output/storage ceiling across jobs, sessions, producers or loaded core copies, no completion-capacity reservation, and no quota-pressure admission or eviction. Aggregate disk use can grow with the number of retained jobs; [[REQ-JOBS-RETENTION]] remains applicable. This ceiling does not bound Herdr-owned scrollback or arbitrary files commands write.
:::

:::mara requirement REQ-JOBS-STORAGE-QUOTA
:mid: 01M3PZPZZYK5G9F3QGNXT9BP8W
:title: Enforce a shared total storage ceiling and reserve completion capacity
:status: retired
:kind: constraint
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Apply a configurable user-scoped 1 GiB default total ceiling to jobs-owned records and logs across sessions sharing the storage root, not a separate allowance per job, session, producer, or library copy. Reclaim eligible oldest finished/delivered records before admitting more work when necessary. If safe cleanup cannot free sufficient capacity, reject new launches rather than starting without required tracking. Reserve capacity for admitted jobs to record completion. Existing commands continue under bounded or reduced log capture with a clear warning instead of being killed because the quota is full. Preserve running jobs, unresolved records, and pending results from whole-record quota eviction; log windows may still be bounded with explicit loss reporting. Project and per-job behavior overrides cannot silently raise the user-scoped total ceiling. No claim is made about bounding Herdr-owned scrollback or arbitrary files commands write.
:::

:::mara requirement REQ-JOBS-RETENTION
:mid: 01M3PZQ2XHXSZ43HMN2THHF2TV
:title: Expire eligible output artifacts without rewriting Pi session history
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Automatically remove bounded output artifacts for finished jobs whose selected delivery obligation is fulfilled, using configurable seven-day default retention. Retention expiry applies to external output, not physical deletion of compact job metadata or final results already appended to Pi session history. Report expired or missing output as unavailable; keep any saved final outcome distinct from the availability of its log, and never rerun a command to recreate expired output. Do not rewrite Pi session JSONL or introduce a metadata-compaction database for retention.

No quota-pressure eviction is required. While jobs are tracked, do not automatically remove running, unresolved or pending-result output merely because it is old. A cancellation request or genuine deactivation does not prove a terminal outcome or fulfilled delivery; uncertain artifacts are not promoted to cleanup-eligible state. Bounded log truncation is distinct from whole-artifact deletion. The no-session and best-effort normal-shutdown exceptions remain [[REQ-JOBS-PI-STATE]]; no inactive-session result recovery or crash-cleanup mechanism is added.
:::

:::mara requirement REQ-JOBS-STORAGE-FAILURE
:mid: 01M3PZQ5XBDAH4G74B1Z0QAG5S
:title: Refuse untracked launches and expose persistence loss for running jobs
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Refuse a new launch when required compact tracking cannot be accepted through the supported Pi session append capability or required bounded output storage cannot be established. Setup-only buffering, in-memory sessions and accepted append calls follow [[REQ-JOBS-PI-STATE]]; absence of a session file or lack of fsync acknowledgement is not an additional launch guard. There is no shared-quota admission or completion-capacity reservation.

If an append/output write fails after launch while the job is tracked, keep bounded honest in-memory tracking and report persistence/output loss and reduced resumability; do not kill the command solely because logging failed. Missing data must not fabricate successful completion, confirmed cancellation, liveness, completeness or delivery. Keep output diagnostics separate from execution outcome. A late or failed read must not erase newer captured output, a known terminal outcome or a newer admitted job, and fallback must not invent missing bytes or zero omissions. Fallback is not a duplicate authoritative execution database. Genuine deactivation ends guaranteed tracking under [[REQ-JOBS-SESSION-CONTINUITY]]; failures do not create a promise of results surviving Pi exit.
:::

:::mara verification VER-JOBS-PI-STORAGE
:mid: 01M3PZQ8WNB76EPEQX874JRXZE
:title: Exercise Pi-backed persistence, ephemeral operation, and storage failures
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-PI-STATE
:verifies: REQ-JOBS-STORAGE-FAILURE
:verifies: DES-JOBS-SESSION-STORE

Use actual persistent and in-memory Pi 0.99.1 session managers with isolated user-state/output roots. Append compact job records, final outcomes and lifecycle/delivery metadata through public APIs; replay them with stable job/result/producer identity. Verify custom entries stay outside model context, model-directed results use Pi messages, full logs remain external, and no raw JSONL edits or separate execution/result files/database are required. Exercise setup-only buffering without requiring an existing session file or claiming fsync; verify the first user message persists preceding custom entries before an assistant reply. In --no-session mode, run jobs with in-memory state and temporary output, exercise best-effort orderly cleanup, and advertise no later resumability.

Apply [[VER-JOBS-SESSION-AND-EXIT]] for deactivation: record known outcome or unconfirmed cancellation where the originating append capability is still valid, do not call stale session APIs, and do not deliver a late result into another session. Reopen saved metadata/results without rerunning work or treating saved running state as live. Continued completion capture/delivery after deactivation and crash/forced-kill recovery are not acceptance obligations.

Fail required tracking/output setup before launch and assert no command starts. Fail writes after launch and require bounded in-memory fallback, visible diagnostics and continued draining without fabricated outcomes or completeness. Exercise overlapping append/read/observation operations with delayed replies: older replies must not erase newer admission/output/terminal evidence. Preserve byte-loss accounting through fallback. These are future checks, not passing evidence; normal metadata/format operations still require concrete tests.
:::

:::mara verification VER-JOBS-STORAGE-BOUNDS
:mid: 01M3PZQBVH6SQ557TE0G3T2XG5
:title: Verify ten-megabyte output windows and protected time-based retention
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-OUTPUT-BOUNDS
:verifies: REQ-JOBS-RETENTION

Check the fixed per-job ceiling of 10,000,000 captured bytes and configurable seven-day eligible-output retention. Use injected smaller test bounds and controlled time to exercise overflow. Emit identifiable beginning/middle/tail data: retain the initial excerpt and newest rolling tail, report exact omissions, continue draining without stopping the command, and bound memory, output artifacts and representation/write overhead. Verify model excerpts use Pi truncation and reference the remaining output.

Exercise independent jobs/producers/core copies and distinct sessions sharing the output root. Their combined retained output may exceed 10,000,000 bytes without a root quota, completion reservation, pressure eviction or quota-based launch rejection. Concurrent operations must not corrupt another job or apply stale replies over newer state. With writes/reads failing, fallback preserves known bytes and honest omission/completeness information.

Verify timed cleanup of finished/delivered output, protection of tracked running/unresolved/pending output, and no promotion of unconfirmed cancellation to terminal/cleanup eligibility. Expired output is unavailable without re-execution; saved Pi metadata/final outcomes remain in session history, without raw JSONL deletion. These are future checks; no existing quota-store tests establish acceptance of this revised policy.
:::

:::mara design DES-JOBS-SESSION-STORE
:mid: 01M46H96EH71C9168T3V70FVY0
:title: Use Pi session metadata and one bounded output owner per job
:status: accepted
:kind: data
:satisfies: REQ-JOBS-PI-STATE
:satisfies: REQ-JOBS-OUTPUT-BOUNDS
:satisfies: REQ-JOBS-RETENTION
:satisfies: REQ-JOBS-STORAGE-FAILURE
:depends_on: DES-JOBS-INTERFACE-CHECKPOINT
:depends_on: REQ-JOBS-SESSION-CONTINUITY

## Selected boundary

Store compact job identity/producer/origin, lifecycle intent/outcome, output reference and delivery/final-result metadata as namespaced Pi custom entries. Use supported public append/read capabilities supplied by the owning integration; keep the compiled core consumer-neutral rather than importing a Pi session singleton. Entries are append-only meaningful lifecycle/result transitions, not output chunks or a second session database. Reconstruct saved metadata with stable job/result identity; historical state grants neither liveness nor current control. Execution adapters provide live evidence while the session is active. Model-visible delivery and receipt arbitration remain the separate delivery integration.

Only bounded output artifacts and bounded format bookkeeping live under the selected Pi agent/user-state jobs root. There are no per-job execution-record/result sidecars, root policy/quota files, completion-space reservations, quota-driven admission/eviction, root-global accounting locks or one-shot locked helper per storage operation. This replaces the earlier external-record/shared-quota implementation direction; do not import that machinery merely because the paused storage branch contains it.

## Ordering and loss

Give each live job one in-process owner for captured output and its bookkeeping, with a single ordering rule covering accepted writes and any read/update that can affect that state. Read-only observations must not overwrite newer output/admissions/outcomes with older snapshots. Do not maintain independently authoritative disk/helper-reply and memory caches, prune all jobs from an older snapshot, or create a new general queue/service. Use bounded memory for capture and failure fallback, not an independently durable registry. Existing serialized executor output appends can feed this boundary.

Capture up to 10,000,000 combined bytes, then retain the beginning and a rolling tail with exact loss/completeness accounting. Keep draining after overflow/write failure. Define the concrete bounded byte/offset format, representation/temporary-write overhead, append/read ordering, compact custom-entry schema and failure handling before changing behavior. No full-log session entries or unbounded chunk history are permitted. Establish required tracking/output setup before spawn, respecting accepted append and in-memory Pi semantics without a session-file/fsync gate.

## Lifecycle, replay and retention

The same active session, ordinary idle and foreground handoff permit continued execution. Reloading that session requires a fresh public-capability handoff. Genuine deactivation requests bounded best-effort cancellation and records known outcome/uncertainty where the old capability remains valid; continued monitoring, late completion persistence/delivery and crash/forced-kill recovery are not obligations. Never use stale callbacks or append late data into a replacement session. Saved running state is historical; known terminal results remain terminal and are not undone by stale samples. Unknown cleanup is not success, a receipt or automatic gate clearance.

Expire eligible delivered-terminal output after configurable seven-day retention; keep tracked running/unknown/pending output protected. Compact metadata/results remain in Pi history; missing/expired output is reported separately and is never regenerated by rerunning work. No-session operation uses memory plus temporary output and best-effort orderly cleanup.

## Checkpoint and implementation state

The committed JobStore/ResultSink envelopes predate this simplification. Reconcile their reservation-shaped ports with this design before implementing storage; a port name is not an aggregate-quota requirement. Follow the public contract-version/release policy for any incompatible API change. This documentation increment changes no runtime exports, package versions, dependencies or JOBS_CONTRACT_VERSION. Concrete host lifecycle/delivery composition belongs to its existing separate work item. This is accepted design guidance, not implemented storage or passing verification.
:::

:::mara decision ADR-JOBS-SESSION-BOUNDED-STORAGE
:mid: 01M46H9CVCDD3ARYHA4HC30FYD
:title: Simplify storage by tying managed tracking to the active session
:status: accepted
:justifies: DES-JOBS-SESSION-STORE
:justifies: REQ-JOBS-PI-STATE
:justifies: REQ-JOBS-OUTPUT-BOUNDS
:justifies: REQ-JOBS-RETENTION
:justifies: REQ-JOBS-SESSION-CONTINUITY
:justifies: REQ-JOBS-EXIT-CLEANUP

The user selected compact job records/results in Pi session custom entries, only bounded output artifacts external, a 10 MB (10,000,000-byte) per-job ceiling with the existing beginning-plus-rolling-tail policy, and removal of the shared ceiling. [[REQ-JOBS-STORAGE-QUOTA]] is retired and preserved as historical knowledge, not an active obligation. Remove completion-capacity reservations, aggregate admission/eviction and the duplicate external execution/result authority instead of layering further repairs onto the old quota-store mechanism.

The user also selected bounded best-effort cancellation when a managed job's originating session genuinely deactivates, rather than maintaining a detached tracked execution. Idle and background handoff do not deactivate the session. Unconfirmed cancellation stays honest; session replacement is not blocked indefinitely and does not fabricate successful termination or clear unresolved obligations. The explicitly selected persistent Herdr terminal lifetime remains separate. Continued inactive-session monitoring/completion capture/delivery is no longer guaranteed; Pi crash/forced-kill cleanup and survivor recovery are outside scope. Saved running metadata is never proof of liveness.

Reuse Pi's existing resumability rather than strengthening append calls into filesystem-durability promises. Retention removes eligible output artifacts, not compact entries already appended to session history. Aggregate disk use is deliberately not bounded; per-job capture bounds and time-based eligible cleanup remain. Output expiry never causes execution replay. Delivery receipts, ownership protections, generic gate reconciliation/user abandonment, independent producers and the Pi 0.99.1 baseline are unchanged.

[[DES-JOBS-SESSION-STORE]] is the current implementation direction. The paused branch's `DES-JOBS-BOUNDED-STORE` and external-record/quota/reservation machinery are superseded as future implementation guidance, but its branch, item identity and historical evidence are retained rather than rewritten or integrated. Current source/checkpoint verification is not evidence that this revised storage/lifetime contract is implemented.
:::
