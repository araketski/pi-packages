# Jobs persistence and bounded output

These are accepted storage policies, not an implemented store or passing recovery
and quota tests. They support [session continuity](./lifecycle.mara.md) and
[delivery receipts](./delivery.mara.md), without creating another Pi session system.

## Reuse Pi state facilities

Use Pi session identities and lifecycle reasons. Store compact references and
lifecycle/delivery history with `pi.appendEntry()`; these custom entries stay out
of model context. External job records and logs support live execution, inactive
session completions, and recovery. Do not edit Pi session JSONL directly or copy
whole logs into custom entries. Reconstruct branch-sensitive conversation data
from the branch, but do not rewind external executions when navigating history.

The inspected Pi session/extension APIs provide session IDs and entry/branch
access, custom entries, model-visible custom messages, in-memory sessions, and
shutdown reasons that separate quit from reload/new/resume/fork. Pi 0.99.1 creates
a new session file on the first user or assistant message; setup/custom entries
alone can remain buffered. This advances the assistant-only boundary observed in
0.87.1; see the [baseline reconciliation](../../pi-0991-reconciliation.mara.md).
An accepted append call is not an immediate filesystem-durability guarantee; do not introduce a separate gate journal or file-existence admission
check merely to strengthen Pi session resumability.

## Bounded storage, not unlimited full logs

Capture complete command output while it fits the configured bounds. On overflow,
keep a small initial excerpt and a rolling window of recent output; expose omitted
output honestly. This is rolling storage, not a floating terminal UI requirement.
The jobs quota covers jobs-owned records/logs, not Herdr's independent scrollback
or arbitrary files written by commands.

The total ceiling applies across sessions sharing the same jobs storage root.
Accounting must not let supported concurrent, distinct sessions each consume a
separate full allowance. This does not establish support for multiple Pi writers
to the same conversation. Define concrete accounting, reservations, atomic record
updates, rolling-log representation, retention timestamps, and failure recovery
before implementing the respective slice.

## Agreed knowledge

:::mara requirement REQ-JOBS-PI-STATE
:mid: 01M3PZPT7GD76TYM82Z3NNJG8F
:title: Reuse Pi session capabilities with external job records and logs
:status: accepted
:kind: constraint
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME
:derives_from: REQ-JOBS-SESSION-CONTINUITY

Rely on existing Pi capabilities wherever they fit: session identity and lifecycle events, custom entries for compact non-context job references and lifecycle/delivery history, and normal model-visible messages for results. Keep execution records, logs, and results in jobs-owned storage under Pi user state, outside repositories/worktrees, including records of completion while the originating session is inactive. Do not edit Pi session JSONL directly, put whole logs in custom entries, or build a parallel Pi session system. Reconcile external execution rather than treating replayed entries as current liveness. Follow Pi resumability and its append-call boundary; no immediate disk-durability or setup-only session-file guarantee is implied. Pi 0.99.1 creates a new persistent session file on its first user or assistant message; custom/setup entries alone may remain buffered. For --no-session/in-memory runs, jobs still function with temporary records/logs, normal-shutdown cleanup, and no promise of recovery after Pi exit.
:::

:::mara requirement REQ-JOBS-OUTPUT-BOUNDS
:mid: 01M3PZPX6ZT4GR7050J73N4JKS
:title: Bound saved output with a retained beginning and rolling tail
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Capture complete output while it fits the configured storage bounds. Default retained output to at most 100 MiB per job, configurable within the total storage ceiling. At the limit, keep a small initial excerpt plus a rolling window of latest output and clearly report omitted data. Continue draining command output without unbounded memory or disk growth; reaching a logging bound does not kill the command. Send bounded excerpts to the model using applicable Pi truncation facilities, with the job identity and a reference for retrieving available saved output. Do not claim the retained log is complete once output has been discarded. This rolling-storage requirement does not request a floating UI panel.
:::

:::mara requirement REQ-JOBS-STORAGE-QUOTA
:mid: 01M3PZPZZYK5G9F3QGNXT9BP8W
:title: Enforce a shared total storage ceiling and reserve completion capacity
:status: accepted
:kind: constraint
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Apply a configurable user-scoped 1 GiB default total ceiling to jobs-owned records and logs across sessions sharing the storage root, not a separate allowance per job, session, producer, or library copy. Reclaim eligible oldest finished/delivered records before admitting more work when necessary. If safe cleanup cannot free sufficient capacity, reject new launches rather than starting without required tracking. Reserve capacity for admitted jobs to record completion. Existing commands continue under bounded or reduced log capture with a clear warning instead of being killed because the quota is full. Preserve running jobs, unresolved records, and pending results from whole-record quota eviction; log windows may still be bounded with explicit loss reporting. Project and per-job behavior overrides cannot silently raise the user-scoped total ceiling. No claim is made about bounding Herdr-owned scrollback or arbitrary files commands write.
:::

:::mara requirement REQ-JOBS-RETENTION
:mid: 01M3PZQ2XHXSZ43HMN2THHF2TV
:title: Automatically expire delivered terminal records while protecting pending work
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Automatically clean finished jobs whose selected delivery obligation is fulfilled, with configurable seven-day default retention. Under total-quota pressure, permit earlier removal of the oldest such records/logs. Do not automatically remove running jobs, unresolved records, or pending results merely because they are old or space is needed. Log truncation within the output policy is distinct from deleting a protected job record. An expired/evicted result must be reported as unavailable, not regenerated by rerunning the command.
:::

:::mara requirement REQ-JOBS-STORAGE-FAILURE
:mid: 01M3PZQ5XBDAH4G74B1Z0QAG5S
:title: Refuse untracked launches and expose persistence loss for running jobs
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Refuse a new launch when required tracking cannot be saved. If persistence fails after a job has started, continue bounded in-memory tracking and report the failure and reduced recoverability; do not kill the command solely because logging failed. Missing persistent data must not fabricate successful completion, confirmed cancellation, or delivery. Keep output-loss diagnostics separate from execution outcome. This failure policy does not promise results will survive Pi exit when persistence was unavailable.
:::

:::mara verification VER-JOBS-PI-STORAGE
:mid: 01M3PZQ8WNB76EPEQX874JRXZE
:title: Exercise Pi-backed persistence, ephemeral operation, and storage failures
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-PI-STATE
:verifies: REQ-JOBS-STORAGE-FAILURE

Use real persistent and in-memory Pi sessions with an isolated jobs state root. Verify compact custom entries stay outside model context, model-directed results use Pi messages, full logs remain external, and no raw session-JSONL edits are required. Finish work while its session is inactive, then reconcile through the proper session and delivery policy. Exercise setup-only buffering without requiring an existing session file or claiming fsync, then verify that Pi 0.99.1 persists the first user message and preceding custom entries before an assistant reply. In --no-session mode, run jobs and clean temporary artifacts on normal shutdown without advertising later resumability. Fail required persistence before launch and assert no command starts. Fail writes after launch and assert execution continues with bounded memory and visible persistence/output-loss diagnostics, not fabricated outcomes. These are future checks, not passing evidence.
:::

:::mara verification VER-JOBS-STORAGE-BOUNDS
:mid: 01M3PZQBVH6SQ557TE0G3T2XG5
:title: Verify rolling output, global quota pressure, and protected retention
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-OUTPUT-BOUNDS
:verifies: REQ-JOBS-STORAGE-QUOTA
:verifies: REQ-JOBS-RETENTION

Check the 100 MiB per-job, 1 GiB total, and seven-day retention defaults, then use small configured bounds and controlled time to exercise overflow. Emit identifiable beginning/middle/tail data: retain the small beginning and newest rolling tail, report loss, and keep the command running with bounded memory/disk consumption. Verify model excerpts use Pi truncation and reference remaining output. Exercise quota accounting across jobs, producers, separate core copies, and concurrently active distinct sessions sharing the storage root. Evict oldest eligible finished/delivered records before normal expiry under pressure, never whole running/unresolved/pending records. With only protected state remaining, refuse additional launches and preserve reserved completion capacity for existing commands while reducing capture with warnings. Verify timed cleanup, unavailable expired results without re-execution, and prevention of project/per-job quota escalation. These are future checks; concrete accounting and file-update failure cases still need executable tests.
:::
