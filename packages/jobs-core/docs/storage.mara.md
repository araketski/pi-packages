# Jobs persistence and bounded output

These are accepted minimal, best-effort storage policies. The optional store
mechanism is defined below; acceptance and actual check evidence are tracked in Work. They support [session continuity](./lifecycle.mara.md) and
[delivery receipts](./delivery.mara.md), without creating another Pi session system.

## Reuse Pi state facilities

Use Pi session identities and lifecycle reasons. Attempt compact startup/final metadata and necessary lifecycle/delivery facts
through namespaced public custom entries; these stay out of model context.
Normal successful history can be reopened; failed writes have no strict retry or
exact replay-equivalence guarantee. Only bounded output artifacts live in
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
admission/eviction. Aggregate disk use can grow with retained jobs; persistent
output may remain until explicitly cleaned up. Automatic seven-day expiry is not
promised. This does not bound Herdr scrollback or arbitrary
command-written files, or support multiple Pi writers to one conversation.

[[DES-JOBS-SESSION-STORE]] and [[ADR-JOBS-SESSION-BOUNDED-STORAGE]] replace the
external-record/shared-quota direction. Define compact entry and rolling-output
formats and ordinary serialized same-job use before implementation. Live reads
use bounded memory; best-effort snapshots occur on completion or explicit read,
not on every chunk. Per-stream accounting, checksums, arbitrary interleavings and
recovery machinery are not required; do not carry forward either stronger store
mechanism.
The retired quota requirement below is retained as history, not current policy.

## Agreed knowledge

:::mara requirement REQ-JOBS-PI-STATE
:mid: 01M3PZPT7GD76TYM82Z3NNJG8F
:title: Store compact job state in Pi sessions and keep only output artifacts external
:status: accepted
:kind: constraint
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME
:derives_from: REQ-JOBS-SESSION-CONTINUITY

Use Pi session identity and public namespaced custom entries for compact startup/final job metadata and the lifecycle/delivery facts needed by the existing shared interfaces. Keep custom entries outside model context; model-visible results still use normal Pi messages or recorded tool results. Keep bounded output artifacts external under the selected Pi user state. Do not edit session JSONL, put whole logs in custom entries, create execution/result sidecars or build another session system.

For supported trusted, serialized use, successfully saved entries can restore ordinary historical metadata/results with stable job/result/producer identity. Historical running state is not liveness or control authority. Persistence is best effort: no strict save retry, exact live/replay equivalence after failed writes, transactional recovery, corruption-repair or crash-recovery guarantee. Report unavailable/missing data rather than inventing it. A thrown append is not confirmed success, and an accepted append is not fsync. Pi 0.99.1 may buffer setup/custom entries until its first user or assistant message; absence of a session file is not an admission guard.

Live state belongs to one in-process owner per job. Read current bounded output from that owner; attempt disk snapshots on completion or an explicit output read, not on every incoming chunk. Continuous on-disk freshness is not promised. In-memory/no-session operation has no post-exit resumability and attempts orderly temporary-output cleanup without a guaranteed cleanup/recovery service.

[[REQ-JOBS-SESSION-CONTINUITY]] remains unchanged: genuine deactivation requests bounded best-effort managed cancellation through the owning integration. Never redirect late activity into a replacement session or use invalidated public callbacks. Concrete process control, receipts, delivery scheduling and gates are outside this storage simplification.
:::

:::mara requirement REQ-JOBS-OUTPUT-BOUNDS
:mid: 01M3PZPX6ZT4GR7050J73N4JKS
:title: Bound saved output with a retained beginning and rolling tail
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Retain at most 10 MB (10,000,000 bytes) of combined captured output per job. Capture complete bytes while they fit; on overflow retain a small beginning plus rolling tail and report the omitted middle. Continue draining when the limit is reached or snapshot persistence fails. Normal supported capture must report its retained bytes and omission/completeness correctly; an unavailable snapshot must not be described as a complete log.

Use bounded capture memory and bounded snapshot size. Define a simple byte representation and write timing before implementation. Per-stream loss accounting, byte tags, checksums, corruption recovery, exact allocator/temporary-write accounting and continuous whole-buffer replacements are not obligations. Supported live reads use the owner buffer; external snapshots are best effort on completion or explicit read. Send only bounded model excerpts using applicable Pi truncation and include job/output identity.

There is no aggregate/shared ceiling, completion-capacity reservation, quota-driven admission or pressure eviction. Independent jobs/producers/core copies and distinct sessions can exceed one job's bound in aggregate, without concurrent mutation of the same job. This does not bound Herdr scrollback or arbitrary command-written files. [[REQ-JOBS-RETENTION]] defines the minimal cleanup policy.
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
:title: Keep output cleanup explicit and best effort
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

The minimal storage profile does not promise automatic seven-day retention, scheduled expiry, root scans or a cleanup service. Persistent output may remain until explicitly cleaned up; aggregate disk use is not bounded. Do not add retention settings merely to satisfy the superseded automatic-expiry requirement.

If explicit output cleanup is provided, limit it to known owned artifacts, keep tracked running/unknown/pending-result output protected, and leave compact Pi metadata/results intact. Report a missing/deleted output artifact separately from its saved final result; never rerun execution to recreate a log or rewrite session JSONL.

No-session orderly shutdown attempts removal of this instance's temporary output after its supported operations settle. Cleanup errors are diagnostic, not guaranteed repair or post-crash recovery. Session/process cleanup safeguards and delivery obligations remain separate and unchanged.
:::

:::mara requirement REQ-JOBS-STORAGE-FAILURE
:mid: 01M3PZQ5XBDAH4G74B1Z0QAG5S
:title: Refuse untracked launches and expose persistence loss for running jobs
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Refuse a new launch when required initial live tracking/compact startup append or basic output setup fails. This is a straightforward admission check, not a quota reservation, session-file test, transactional filesystem guarantee or fsync gate. Follow Pi's normal buffering/in-memory semantics.

After launch, metadata/snapshot failure is best effort: record a diagnostic, keep the bounded owner state available while possible and continue draining without stopping the command solely because logging failed. Actual execution outcome remains separate from logging. Missing data must not fabricate completion, confirmed cancellation, completeness or delivery. Do not invoke invalidated origin callbacks or redirect late activity into another session.

This personal-tooling profile does not guarantee repairing failed appends, exactly-once persistence, strict same-identity retry acknowledgement, replay equivalence after partial writes, or continued capture after genuine deactivation. Trusted callers serialize mutations of a job; arbitrary concurrent/reentrant mutations, hostile objects, exhaustive fault combinations and recovery services are outside the supported storage contract. Failures can be investigated and fixed when observed rather than requiring speculative hardening upfront. This does not waive existing executor ownership, cancellation, result-delivery or gate safeguards.
:::

:::mara verification VER-JOBS-PI-STORAGE
:mid: 01M3PZQ8WNB76EPEQX874JRXZE
:title: Exercise ordinary Pi session storage and basic failure reporting
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-PI-STATE
:verifies: REQ-JOBS-STORAGE-FAILURE
:verifies: DES-JOBS-SESSION-STORE

Use actual isolated Pi 0.99.1 persistent and in-memory SessionManagers with supported public APIs. Save compact startup/final metadata, reopen successful history with stable job/result/producer identity, keep custom entries outside model context and full logs external, and do not rerun execution or treat historical running state as live control.

Verify setup-only buffering and first-user-message persistence before assistant reply without requiring a pre-existing session file or claiming fsync. Live output reads use the in-process bounded capture; disk snapshots are attempted at completion/explicit read. No-session operation advertises no later resumability and attempts orderly temporary cleanup.

Cover ordinary initial tracking/output setup failure (no launch), one after-launch append or snapshot failure (diagnostic, bounded live output and unchanged actual execution outcome), missing output (not complete), and origin invalidation (no late retargeted append). Use trusted inputs and serialized same-job operations. Exhaustive delayed-reply/reentrant/interleaving matrices, strict retry acknowledgements, corruption recovery and exact replay after failed writes are not acceptance obligations. [[VER-JOBS-SESSION-AND-EXIT]] remains the separate lifetime/cancellation contract; this method neither implements nor weakens it.

These are selected future checks, not passing implementation evidence. Existing stronger-store results do not prove this minimal profile.
:::

:::mara verification VER-JOBS-STORAGE-BOUNDS
:mid: 01M3PZQBVH6SQ557TE0G3T2XG5
:title: Verify bounded combined output and best-effort snapshots
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-OUTPUT-BOUNDS
:verifies: REQ-JOBS-RETENTION

With small test bounds, emit recognizable beginning/middle/tail bytes. Verify complete capture while it fits; after overflow retain the beginning and newest tail, report omitted bytes, keep draining, and keep live capture/snapshot sizes bounded. Verify ordinary UTF-8 output and model excerpts through native Pi truncation. One default-bound smoke verifies the 10,000,000-byte policy without a full fault/performance campaign.

Verify incoming chunks do not trigger continuous full-capacity disk replacements: live reads use memory and snapshots occur on completion or explicit read. Use a basic successful snapshot/read and a failed snapshot diagnostic without changing the command outcome or claiming unavailable bytes are complete. Independent jobs/producers/copies/sessions can exceed the single-job bound in aggregate; same-job mutation remains serialized and no quota/reservation/eviction layer exists.

Check missing/deleted output separately from saved results and best-effort no-session orderly cleanup. If explicit persistent cleanup exists, limit it to eligible owned artifacts and protect tracked running/unknown/pending output. Automatic seven-day expiry, per-stream accounting, checksums, exact temporary-write accounting, arbitrary concurrency/reentrancy and crash recovery are not required. This method records intended acceptance, not a passing result.
:::

:::mara design DES-JOBS-SESSION-STORE
:mid: 01M46H96EH71C9168T3V70FVY0
:title: Use minimal best-effort session metadata and bounded output
:status: accepted
:kind: data
:satisfies: REQ-JOBS-PI-STATE
:satisfies: REQ-JOBS-OUTPUT-BOUNDS
:satisfies: REQ-JOBS-RETENTION
:satisfies: REQ-JOBS-STORAGE-FAILURE
:depends_on: DES-JOBS-INTERFACE-CHECKPOINT
:depends_on: REQ-JOBS-SESSION-CONTINUITY

## Selected boundary

This is personal developer tooling, not a production-grade storage system. Keep one live in-process owner per job, compact startup/final metadata through injected public Pi append/read capabilities, and bounded output outside session history. Include the lifecycle/delivery facts required by the existing interfaces at meaningful boundaries, not every chunk. Core remains consumer-neutral. No Pi singleton, raw JSONL edits, execution/result sidecars, aggregate quota, completion reservations, helper processes, journals or new services.

Normal successful history restores metadata/results by stable job/result/producer identity. It does not restore execution/control. Model delivery, receipts, gates and concrete process/session lifecycle integration remain separate.

## Ordering and loss

Assume trusted callers and serialized mutations for each job. The integration owns that simple calling discipline; do not add a general queue, shared locks or arbitrary recursive/concurrent-mutation support. Reads of a live job use its current owner, not a disk snapshot that can become a second authority. Different jobs/producers/sessions remain independent.

Retain at most 10,000,000 combined bytes in a beginning-plus-rolling-tail buffer. Report normal retained/omitted bytes and completeness. No per-stream byte tags/loss ledger, checksum/corruption-repair layer or exact allocator/temporary-file accounting is required. Use a simple bounded representation and attempt an output snapshot on completion or an explicit read. Do not continuously hash/rewrite the full configured capacity for each chunk. On ordinary write failure retain bounded live capture where possible, keep draining and report loss without changing the actual execution result.

Strict persistence retries, exactly-once append acknowledgements, exact live/replay equivalence after failed writes, duplicated acknowledgement/revision state machines and exhaustive interleaving guarantees are not required. A partial/failed operation is diagnostic, not proof of durable success; no recovery promise is inferred from it. If reentrant mutation occurs outside the supported calling discipline, do not promise that every nested update is accepted or repaired.

## Lifecycle, replay and retention

Required initial tracking/startup append and basic output setup precede successful admission, without a session-file or fsync gate. Save compact final metadata and an output reference through ordinary public operations. Successfully reopened historical records remain distinguishable from live execution; missing logs remain distinguishable from known final outcomes. Never rerun a command to recreate output.

No guaranteed automatic seven-day retention or cleanup service is selected. Persistent logs may remain until explicit cleanup. Any explicit cleanup is limited to owned eligible artifacts and protects tracked running/unknown/pending output. No-session operation uses memory/temporary output and attempts orderly cleanup; no crash/forced-kill recovery or guaranteed inactive-session capture exists. Existing origin invalidation and genuine-deactivation best-effort cancellation boundaries stay intact.

## Checkpoint and implementation state

Keep the existing JobStore/ResultSink envelopes as reference and reconcile their optional concrete use before implementation; reservation-shaped names do not require reserved space or an atomic filesystem transaction. Keep the previously approved 65,536-byte UTF-8 JSON entry limit as a simple compact-summary boundary: reject oversized submissions without truncating final content or building a near-limit-result retry protocol. Keep the existing optional FinalResult.output text-snapshot meaning intact; the compact session sink may reject it explicitly and provide captured output separately. Define only the entry fields, output representation, ordinary ordering and basic failure replies needed by this profile; the stronger unaccepted store format/APIs are not an implicit specification.

The minimal implementation adds optional compiled exports without changing checkpoint types, dependencies, package versions or JOBS_CONTRACT_VERSION. Any later incompatible public-contract choice still follows the version/release policy and requires agreement rather than silently retaining an old marker. The mechanism below is implemented in storage.ts and storage-files.ts; accepted guidance is not by itself passing verification. Neither previous storage implementation is accepted by this decision.

## Minimal implementation format and ports

The additive createSessionJobStore API receives a fixed originating sessionId, a persistent flag, injected public appendEntry(customType, data)/getEntries() capabilities, and an output-artifact port. It supplies JobStore and ResultSink adapters plus capture, readOutput, invalidateOrigin and dispose methods. Callers own launch/control, serialize same-job calls and ensure one live owner per job. Distinct jobs need no shared arbiter. Public Pi adapters use appendCustomEntry (or ExtensionAPI.appendEntry) and getEntries; no Pi import or singleton is required by the core.

The namespaced custom type araketski.pi-jobs/storage carries JSON data with formatVersion:1, contractVersion:0.1.0, kind:startup|state|final, observation (complete JobObservation), outputReference and optional result (FinalResult without output). Startup saves identity, running execution, awaiting, lifetime and initial delivery pending/not-required; no authority or backend handle is persisted. State boundaries save supplied lifecycle/delivery facts. Final saves stable result identity, actual outcome and untruncated content together with terminal observation. Reject data whose UTF-8 JSON exceeds 65,536 bytes. Replies use JobReply: invalid for oversized/inconsistent submissions, unsupported for embedded FinalResult.output, unavailable for ordinary I/O or invalidated origin, unknown for absent identities; no save acknowledgement/retry state machine. Logging diagnostics retain only the latest eight messages per live job. Append failure may leave live state newer than history.

reserve performs basic artifact creation and startup append before returning a reservation-shaped instance token; it reserves no capacity. save accepts lifecycle/delivery observation for that token; ResultSink.save snapshots captured output then appends compact final metadata. FinalResult.output retains its existing text-snapshot meaning and is explicitly unsupported by this compact sink; use readOutput separately. Existing contract/version stamps and checkpoint types are unchanged.

Combined capture defaults to 10,000,000 bytes: retain the first 65,536 bytes and use remaining capacity as a rolling tail. Smaller explicit bounds (at least two bytes) are supported for tests/consumers, never above the policy ceiling. The default beginning is min(65,536, floor(maxBytes/4)), with a one-byte minimum; an explicit beginning must leave at least one tail byte. Grow owned storage with actual retained bytes, not full-capacity tagged images; copy retained input suffixes rather than keeping caller Buffer views. Count total received and retained bytes; omission is their difference. Output text decodes beginning/tail independently and labels an omitted middle. A complete window requires completed capture with no omission; running and missing output are not complete. Per-stream labels on input are ignored for retention accounting.

The optional Node file artifact port uses randomly named jobs-owned .output files beneath an explicitly supplied root. Each snapshot is a four-byte big-endian header length, bounded UTF-8 JSON header {formatVersion:1,totalBytes,headBytes,finished}, then raw retained beginning followed by chronological tail. Only output lives here. Initial creation is empty; snapshots replace it only on completion or explicit read, with no fsync/atomic-recovery promise. Live reads always use owner memory even when the snapshot fails. Historical reads use the referenced snapshot and report missing/unreadable output as unavailable independently of saved final results. No continuous disk freshness is promised.

Historical replay reads matching successful custom entries for the fixed session, restoring stable identities/results without execution. Saved running observations become unknown historical execution with no control capabilities. Origin invalidation prevents subsequent public session callbacks, including after artifact awaits; no replacement-session retargeting is supported. Same-session reload must preserve the owner and provide valid origin-bound capability routing through its integration; concrete callback rebinding/events remain downstream. Orderly dispose invalidates callbacks/output operations and attempts removal of only this instance's eligible no-session artifacts after supported operations settle. Eligibility requires known terminal execution and delivered/not-required delivery; running/unknown execution and pending/unknown results remain protected with diagnostics. Subsequent operations do not recreate removed artifacts. Persistent cleanup is not provided; persistent artifacts remain until explicit external cleanup under REQ-JOBS-RETENTION. Focused behavioral tests cover capture, ordinary failures and data-only replay; native/installed fixtures exercise actual Pi 0.99.1 and command draining. Their execution identities and check results belong in Work, not this mechanism decision.
:::

:::mara decision ADR-JOBS-SESSION-BOUNDED-STORAGE
:mid: 01M46H9CVCDD3ARYHA4HC30FYD
:title: Choose minimal best-effort storage for personal tooling
:status: accepted
:justifies: DES-JOBS-SESSION-STORE
:justifies: REQ-JOBS-PI-STATE
:justifies: REQ-JOBS-OUTPUT-BOUNDS
:justifies: REQ-JOBS-RETENTION
:justifies: REQ-JOBS-SESSION-CONTINUITY
:justifies: REQ-JOBS-EXIT-CLEANUP

The user selected the smallest storage profile that preserves normal jobs functionality, accepting ordinary persistence/cleanup failure as a diagnostic to investigate and fix rather than demanding production-grade recovery upfront. This narrows the earlier session-backed direction in [[DES-JOBS-SESSION-STORE]] rather than starting another general storage framework.

Keep one live owner per job, compact public Pi startup/final metadata, ordinary successful historical replay, the 10,000,000-byte combined beginning-plus-tail output bound, live memory reads, best-effort completion/explicit-read snapshots and honest failure/missing-output reporting. Initial required tracking/output setup still gates admission; post-launch logging failure does not stop execution.

Drop strict persistence retries and exact failed-write replay equivalence, arbitrary reentrant/concurrent same-job mutation support, per-stream byte accounting, checksums, continuous full-buffer disk writes, exact allocator/temporary-write accounting and guaranteed automatic seven-day retention. Trusted serialized callers, best-effort persistence and no crash recovery are explicit assumptions. Persistent output can accumulate until explicitly removed; no aggregate bound is promised. [[REQ-JOBS-STORAGE-QUOTA]] remains retired; do not restore quota/reservation/pressure-eviction or a duplicate execution/result authority.

Existing process ownership, managed cancellation on genuine deactivation, original-session routing, known versus unknown outcomes, stable result delivery/receipt identity and gate protections remain unchanged. Persistent Herdr lifetime is separate. Compact entries are not immediate fsync durability; use native Pi 0.99.1 buffering without raw JSONL edits or another session system. Missing logs do not erase saved outcomes or trigger execution replay.

Neither earlier storage implementation is accepted or integrated by this choice. Preserve historical source/evidence; only applicable regressions remain relevant to future minimal-profile acceptance. This documentation-only approval does not implement storage or alter contract/package stamps.
:::
