# Jobs persistence and bounded output

These are accepted storage policies. The bounded Linux storage implementation is
specified in [[DES-JOBS-BOUNDED-STORE]]; it does not implement lifecycle control or
Pi result delivery. Task-specific observed checks remain in Work. These policies support [session continuity](./lifecycle.mara.md) and
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
0.87.1; see the [baseline reconciliation](../../../docs/pi-0991-reconciliation.mara.md).
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

:::mara design DES-JOBS-BOUNDED-STORE
:mid: 01M45RECVYY3PV0JXK5T833KTK
:title: Define Linux atomic storage, shared commitments and recovery boundaries
:status: accepted
:kind: data
:satisfies: REQ-JOBS-PI-STATE
:satisfies: REQ-JOBS-OUTPUT-BOUNDS
:satisfies: REQ-JOBS-STORAGE-QUOTA
:satisfies: REQ-JOBS-RETENTION
:satisfies: REQ-JOBS-STORAGE-FAILURE

## Agreed storage choices

The user approved a root-owned persisted policy; configurable 1 MiB serialized final-result and 256 KiB tracking budgets; counting serialized files, temporary copies and unspent completion commitments; and initial Linux kernel flock transactions. Oversized payloads return explicit persistence failures, not fabricated outcomes or receipts. Local Linux filesystems are the initial verification scope; other platforms/network filesystems are unverified.

## Root, identity and format

The caller supplies the public Pi agent directory (normally PI_CODING_AGENT_DIR or ~/.pi/agent); the persistent root is its jobs directory, never the repository or session JSONL. An ephemeral instance instead receives an explicitly temporary agent directory and removes only its own admitted records on normal close. No session-file existence check gates admission. Setup-only Pi appends are buffered; first user/assistant persistence and in-memory sessions follow public Pi 0.99.1 boundaries.

Versioned JSON policy and per-job records accompany binary combined output. SHA-256 of the complete ordered JobIdentity identifies a directory; JSON retains all opaque identity fields and a random reservation ID. Saved results keep their stable resultId and are immutable (identical retries succeed; contradictory replacements fail). Neither storage read nor result save creates a delivery receipt. Historical running records are recovered as unknown until the owner supplies fresh evidence; terminal observations and saved outcomes remain distinct. Missing/expired records return unavailable, never execution replay.

## Locking and transactions

Every filesystem read/mutation runs in a bounded one-shot Node helper under system flock on one persistent root lock inode, serializing independent copies and processes. The helper receives JSON through stdin and returns one reply; it does not control execution or own Pi session state. Kernel lock release follows helper exit, including crashes; no timestamp-based stealing or session leader election. Lock timeout/missing utility fails closed.

Atomic replacement writes a same-directory exclusive temporary file, fsyncs it, renames it and fsyncs its parent directory. A failed write never reports success; ambiguous post-rename errors remain diagnostics. Temporary leftovers are counted and removed only under the root lock. The policy version/byte ceilings are root authoritative; conflicting initialization refuses admission. Explicit user policy updates reject ceilings below protected commitments. Project/per-job output options may reduce/change their output allowance within this ceiling, never alter root quota.

## Byte accounting and completion reservation

The root quota counts serialized regular-file bytes, not filesystem blocks, Herdr scrollback or arbitrary command files. Each job commits twice its tracking budget plus twice its result budget (current record/result and atomic replacement workspace). Output also requires replacement headroom: charge twice retained binary bytes. Policy/lock and temporary/orphan bytes are included. Reservations remain conservative until whole-record removal, ensuring completion and tracking writes within their admitted budgets even when quota pressure prevents output growth. Admission first expires eligible state and then evicts oldest eligible terminal records with fulfilled delivery; if commitments still do not fit, refuse launch. Invalid/corrupt/unresolved records fail closed and are never treated as eligible.

Reserve persists an unknown not-yet-launched observation BEFORE execution; save requires the matching full identity/reservation. Required tracking admission failure prevents the caller from launching. Result and observation are individually atomic, not a multi-file transaction: a result does not invent terminal execution or delivery; retention requires a terminal observation with delivered receipt or display-only not-required state. Oldest/expiry time starts when that eligibility is durably established; losing eligibility clears it. Pending/unknown/running records are protected irrespective of age.

## Output and failure behavior

Combined byte order follows append calls, not an invented stdout/stderr interleaving. Complete bytes are kept within the granted bound. At overflow retain min(64 KiB, one quarter of allowance) beginning plus rolling latest tail; expose exact omitted-byte count and completeness. Append input is sliced into bounded pieces; retained windows and in-memory fallback are bounded. UTF-8 display decoding can replace partial codepoints; byte accounting uses original bytes, not decoded string length.

Shared pressure can reduce an existing window with explicit loss and diagnostic, but never delete protected records or kill execution. Storage returns errors for post-launch tracking/result writes and exposes reduced recoverability; caller-owned bounded in-memory observations/results/output remain available without claiming they were durable. Previously persisted observations can be stale; recovery never treats them as liveness evidence. Diagnostics are separate from actual execution outcomes. No owner control, delivery scheduling, native tools or parallel session manager is supplied.

## Verification boundary

Use reduced configurable budgets to test real disk bytes, fsync/rename replacement, overflow, crash-released locks, independent processes/copies, protected retention, reserved completion and permission/corruption failures. Check default constants separately; reduced fixtures are not full-size stress/durability/platform proof. Installed npm/pnpm consumers must use the new storage surface. Public Pi 0.99.1 SessionManager fixtures cover buffered custom references, first-user persistence and ephemeral operation; inactive-session delivery and real command ownership remain later slices.

## Concrete implementation and limits

The public ./storage surface supplies createJobStorage, JobStorage and numeric StoragePolicy; it adapts the unchanged JobStore/ResultSink/OutputSink/StorageReservation checkpoint. System flock --no-fork executes the helper so timeout/kill targets the actual lock holder. All reads use that same lock. The root policy envelope is {format:1,policy}; a job record is {format:1,reservationId,request,observation,policy,eligibleAt?}. output.bin starts with three unsigned big-endian 64-bit values (seen bytes, retained head length, retained length), then combined retained bytes. result.json stores one immutable FinalResult. File replacement fsyncs both file and containing directory; no power-loss durability guarantee has been verified.

Cleanup is lazy on store transactions and explicitly callable, not a background session scheduler. Expiry/pressure use eligibleAt, retained across subsequent eligible updates and cleared when the record becomes protected. A newly created core instance returns stored running observations as unknown. This store does not grant control or independently validate native delivery receipts: trusted delivery integration must supply the observation/receipt asserted through JobStore.save.

Output callers await append for backpressure. Inputs are handled in 64 KiB pieces; the implementation rewrites bounded windows atomically and is not throughput-optimized. Fixture sizes below defaults establish boundaries, not 100 MiB/1 GiB stress performance. A failed append keeps bounded fallback (initially at most 64 KiB, or the previously granted window). On a later successful append it restores that window's full seen/loss counters before appending, so recovery does not relabel a truncated prefix complete. Tracking/result failures return non-ok durable replies while keeping admitted bounded memory. An instance with degraded admitted state conservatively refuses further admissions until its composition reconciles/replaces it. Persistent records can be stale when a write never succeeds; diagnostics do not promise recovery after process exit.

For ephemeral mode the caller owns an explicitly temporary agentDirectory. close removes this instance's admitted job directories only; the caller removes the private temporary parent and policy/lock files. No host-provided dependency is bundled. Separate npm/pnpm consumers exercise storage/results/output and strict declarations without requiring Node typings merely to reference the public numeric policy/types.

## Recovery corrections

Helper stdin/stdout use streaming UTF-8 decoders; pipe chunk boundaries cannot alter JSON strings. Private replies distinguish confirmed missing/expired/evicted job records from transaction failures. Confirmed removal invalidates cached observations/results/output, even if previously degraded. A transient read failure instead preserves admitted bounded memory and raises persistence-loss diagnostics; it must not erase a reservation.

Ephemeral deletion ownership is attached only to reservations created by that instance, never acquired by hydrating another instance's reservation through save. Closing stops admissions immediately, but cleanup is complete only after all owned deletions succeed; failed cleanup remains retryable. Successful verified output recovery clears obsolete read failures.

Deletion first atomically renames a previously validated job directory to a root-local .deleted-<job-key>-<UUID> tombstone and fsyncs the root BEFORE recursively removing files. Thus read-only-root failure preserves the live record instead of partially deleting it. Recognized tombstones are committed deletion intents (eligible retention/eviction or this instance's explicit ephemeral disposal), not live/pending jobs; the next kernel-locked transaction finishes their removal before admission. Unknown directories/files and symlinks remain fail-closed. Rename does not copy file bytes; no replacement allowance is released until physical removal completes. This mechanism does not authorize deleting protected persistent records or establish tested power-loss durability.
:::
