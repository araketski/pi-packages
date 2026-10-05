# Agreed jobs lifecycle policy

These are intended behaviors for the [jobs packages](./contract.mara.md), not a
complete runner or passing native-workflow evidence. The shared library now supplies
generic lifecycle/control/wait policy under [[DES-JOBS-GENERIC-LIFECYCLE]]. Local and
Herdr adapters still must supply real execution and ownership evidence; fake tests
must not infer successful process cleanup or native integration.

## Lifetime is not waiting

A managed command's foreground/background state describes whether its tool call
is still waiting, not whether the command may outlive Pi. Explicitly persistent
Herdr terminals are a different lifetime choice. A server can opt out of being
awaited without thereby gaining permission to survive normal Pi exit. Neither
choice is inferred from a command-name whitelist.

Reloading extensions, starting a new Pi session, or switching sessions is not an
application exit. Preserve jobs and their original-session association across
those transitions. Persisting output/results makes them recoverable when the
user returns; it does not require managed commands to keep running after Pi exits.

## Implementation and verification boundary

The [delivery policy](./delivery.mara.md) defines shared modes and receipt/retry
semantics. Consumer decisions live in the [goal plan](../../../docs/planned/goal/jobs-integration.mara.md)
and [caffeinate plan](../../../docs/planned/caffeinate/jobs-integration.mara.md); replacement-bash
behavior lives in the [pi-jobs plan](../../jobs/docs/execution.mara.md). Crash cleanup is
best-effort; it does not promise that shutdown handlers run after forced exit.

Before implementing each slice, define and test its Pi lifecycle mapping, reload
handoff, concrete ownership/liveness evidence, foreground cancellation races,
startup failure handling, and durable record operations. Reuse Pi facilities where
they fit rather than inventing a parallel session or turn scheduler. A cancellation
request is not proof of termination, and history alone is not liveness evidence.

Actual goal/caffeinate integration and isolated real-backend tests remain
necessary. A fake executor or gate observer alone does not verify those workflows.

## Agreed knowledge

:::mara requirement REQ-JOBS-CANCELLATION-BOUNDARY
:mid: 01M3PTT5HQ5J7JR6KBGK1PNC45
:title: Separate foreground cancellation from background job control
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Aborting a bash tool operation while its command is still foreground cancels that command rather than silently detaching it. Once handed off to background execution, aborting an unrelated agent turn does not cancel the job; use explicit job-stop control, subject also to the normal-exit lifetime policy. Request graceful termination of the command and its owned child processes, wait up to a configurable five-second default grace period, then force termination if necessary, without touching unrelated processes. If a command has already completed when cancellation arrives, its actual exit result wins rather than being relabelled cancelled. A requested stop is not a confirmed terminal outcome. If termination cannot be verified, retain tracking and expose uncertainty rather than claiming cancellation completed or clearing awaited work merely because a stop was requested. Detailed process ownership evidence and handoff race arbitration must be defined and tested before implementation.
:::

:::mara requirement REQ-JOBS-SESSION-CONTINUITY
:mid: 01M3PTT8D7V676Z0YREAXP6YZJ
:title: Retain original-session jobs and results across reloads and session switches
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Extension reload, /new, and session switching must not apply application-exit cancellation to managed jobs. Keep tracking the existing execution rather than launching it again. Preserve its originating-session association and enough job, output/result, and pending-delivery state to reconcile when that session is resumed. A job completing while another session is active must not inject its result or start a turn in that other session. On return to a resumable originating session, including in a later Pi process, reconcile retained records and recover saved results; already-pending completions wait for the next user message as specified by [[REQ-JOBS-DELIVERY-MODES]]. Resume monitoring with verified running evidence for work allowed to continue; managed survivors of a confirmed-dead Pi owner follow [[REQ-JOBS-EXIT-CLEANUP]]. Retain uncertainty when state cannot be established. Saved state is not proof of liveness or successful termination.

Navigating /tree within the same session does not rewind live job state; pending results belong on the currently active branch rather than restarting or forgetting the execution. A session fork does not inherit ownership, waits, or pending delivery from original-session jobs, although copied history may retain references. Session navigation and historical visibility must not imply new control authority.
:::

:::mara requirement REQ-JOBS-EXIT-CLEANUP
:mid: 01M3PTTBBG71B92K3GHYWFFSB9
:title: Cancel owned managed jobs on normal exit while retaining persistent Herdr terminals
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

On normal Pi application exit, cancel outstanding managed command jobs owned by that Pi instance, including its jobs associated with sessions no longer active. Apply this lifetime policy to both local and Herdr managed commands using the graceful-stop/escalation policy. Explicitly persistent Herdr terminals, including servers or interactive agents launched with that lifetime choice, remain running; do not infer persistence solely from opting out of a wait. Never close a parent Herdr workspace or delete a worktree as part of job cleanup, or terminate work merely observed but not owned. Preserve known results and honest termination status for later reconciliation.

Crash and forced-kill cleanup is best-effort, not a guarantee that shutdown handlers run. Reconcile survivors or unconfirmed jobs on resume rather than reporting them stopped from history alone. When the original Pi process is confirmed gone and its managed command is verified still running, stop that survivor rather than adopting it to continue; explicitly persistent Herdr terminals remain exempt. Missing or reused process identifiers are not sufficient ownership/liveness evidence. No survival guarantee applies across a Herdr-server restart or machine reboot.
:::

:::mara verification VER-JOBS-SESSION-AND-EXIT
:mid: 01M3PTTM109CGS3B8DXJ4BK1BZ
:title: Exercise reload, original-session recovery, and ownership-safe exit cleanup
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-SESSION-CONTINUITY
:verifies: REQ-JOBS-EXIT-CLEANUP

Start managed work in session A, reload extensions, and switch to session B, checking that no replacement execution starts and transitions do not cancel the job. Complete it while B is active: B receives neither its result nor a model wake. Resume A and recover the saved result, but wait for the next user message before delivering already-pending completion. Navigate /tree without rewinding execution; route pending results to the active branch. Fork A and verify that copied references do not transfer jobs, waits, ownership or delivery. Include generic gate-history replay and owner reconciliation: copied original-session entries must not leave an orphaned inherited wait in the fork. Require confirmed-empty fork eligibility once discovery/reconciliation completes without new work, while original-session gates remain intact; do not solve this by claiming the original job completed.

With jobs from active and inactive sessions still running, exit Pi normally and verify that its owned managed jobs stop. In isolated Herdr tests, retain explicitly persistent terminals, unrelated work, and parent workspaces/worktrees. Reopen the original resumable session and reconcile outcomes. Simulate a confirmed-dead Pi owner with a verified managed survivor: request cleanup instead of continued adoption. Missing backend state, stale/reused identifiers, and unconfirmed stops must not fabricate success or cancellation; crash cleanup is best-effort. These checks require actual Pi lifecycle and real local/Herdr integration evidence; fake-adapter tests alone are insufficient. None has run.
:::

:::mara requirement REQ-JOBS-HARD-TIMEOUT
:mid: 01M3PZ6NT597T6PD3QSJDG2HH4
:title: Keep execution deadlines separate from foreground wait budgets
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Commands have no hard execution deadline by default. Allow an explicit per-job hard timeout that requests termination through the normal stop/escalation policy rather than merely backgrounding the command. Foreground budget expiry alone preserves the execution. A hard-timeout or cancellation request is not verified termination; retain an honest outcome if stopping cannot be confirmed. A command already completed when the request arrives keeps its actual exit result.
:::

:::mara requirement REQ-JOBS-WAIT-SELECTION
:mid: 01M3PZWWVCNGPRK9BD9YQJ4CEJ
:title: Wait for one, any, or all selected jobs without changing their lifetime
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Support explicit waiting for one job, any selected job, or all selected jobs. A wait timeout returns current status; it does not stop the jobs or cancel their eventual delivery. Do not satisfy a completion wait from unconfirmed execution state. Explicit final-result retrieval through a wait result follows the normal delivery-receipt contract; merely checking status does not consume a final result. These wait operations do not add an implicit execution queue or process-count scheduler.
:::

:::mara design DES-JOBS-GENERIC-LIFECYCLE
:mid: 01M45RBPKQWYTVDD60VEE84BXT
:title: Define generic execution observation, current-authority control and selected waits
:status: accepted
:kind: behavior
:satisfies: REQ-JOBS-CANCELLATION-BOUNDARY
:satisfies: REQ-JOBS-HARD-TIMEOUT
:satisfies: REQ-JOBS-WAIT-SELECTION
:satisfies: REQ-JOBS-CONFIGURATION
:satisfies: REQ-JOBS-CONTROL-SCOPE
:depends_on: DES-JOBS-INTERFACE-CHECKPOINT

## Approved boundary and inputs

This slice implements generic policy for an already launched opaque adapter handle. It does not launch processes, load configuration files, map Pi events, maintain gates, save results or confirm receipts. The user explicitly selected preservation of ExecutionAdapter.stop(handle, authority, graceMs): adapters own graceful termination and force escalation after grace; shared policy passes the resolved grace and never interprets admission as termination. Fake escalation evidence is not Linux cleanup proof.

resolveJobsLifecycleSettings accepts explicit user, project and job objects, in that precedence, over defaults: graceMs 5000, foregroundBudgetMs 5000, pollIntervalMs 100, awaiting true, lifetime managed, delivery automatic, and no hardTimeoutMs. Durations are finite integers within the native timer range; polling is positive. hardTimeoutMs:null explicitly removes an inherited deadline. Unknown keys (including quota settings) are rejected. No command text is accepted. Consumers must specify their configuration file locations/schemas separately before loading. foregroundBudgetMs configures waiting only, never execution termination.

## Identity and current authority

createJobLifecycle receives LaunchRequest, opaque handle, existing adapter observe/stop methods, injected clock and a synchronous owner-supplied authorize(ControlRequest) predicate. The predicate must validate actual current authority possession/generation and backend ownership, not just equality of snapshot fields; the adapter independently enforces backend ownership. There is no default authorization, registry singleton or observer grant. Validate complete runtime/owner/session/job/producer identity and request identity before control. Invoke authorization before observing and again immediately before mutation, including after asynchronous observation. Serializable request/settings values and returned observations are isolated copies. Capture construction-time opaque handle, adapter method, authorization predicate and clock method bindings rather than reading mutable constructor options later. Opaque handle/backend state remains adapter-owned, not cloned; the authority reference passed to the predicate preserves caller-defined owner-held possession checks. Coalescing operations must not share mutable reply/observation objects between callers. Denial or unsupported control has no stop/awaiting side effect. setAwaiting(false) changes only awaiting; it does not stop, consume, mark terminal or remove the visible job.

## Stop and execution races

The initial execution is unknown until observed. Observe calls are coalesced per controller to avoid out-of-order samples; publish observation and stop promises before invoking adapter callbacks, including synchronous reentrant inspection/stop requests. Running and unknown can replace each other, but confirmed terminal is absorbing; a late sample cannot erase accepted terminal evidence. Invalid adapter state and thrown observation become unknown with diagnostics, never terminal. Stop requests first attempt to refresh execution, bounded by pollIntervalMs on the injected clock. If observation is stalled, retain unknown execution with a diagnostic, revalidate current authority and attempt adapter stop anyway; stalled observation must not defeat explicit stop or a hard deadline. A stop being admitted exposes pending/unconfirmed intent. The pre-stop bound timer is removed on observation, expiry or disposal; late samples still preserve actual execution evidence, never relabel it. Stop requests arbitrate observed completion: terminal completion wins a late request, retaining the actual exit/termination/launch failure. If completion is only learned after stop admission, retain that actual observed outcome too; no synthetic cancelled outcome exists. Backend stop must itself arbitrate completion racing its action.

Stop intent is separate from observation and records reason (explicit, foreground-cancel or hard-timeout), request identity and requested versus unconfirmed reply. Concurrent requests share the current stop operation, after independently checking authority; successful admission is not repeated, whereas failed/unconfirmed requests permit an explicit retry. A stop rejection/throw does not discard execution or change delivery/awaiting. Requests completing after disposal do not reactivate timers; disposal cancels policy-owned timers only and makes future operations unavailable, not terminated.

An explicit hard timeout is measured from caller-supplied startedAtMs on the injected monotonic clock, not from a wait or controller reload. At expiry it uses the same stop path and owner-supplied authority from launch. Retain its denied/unconfirmed diagnostic. No deadline timer exists by default. Observed terminal clears the deadline. Disposal is not application-exit cleanup, and consumers must hand off monitoring/deadline responsibility before disposing live controllers.

## Selected waits and cleanup

waitForJobs accepts the checkpoint WaitRequest, an explicitly supplied inspect port and clock/poll interval. Resolve each full selected identity through that port; a returned mismatched identity or malformed observation is unknown, not a result for another job. Reject empty, duplicate, sparse or invalid selections. Return selected identity plus its latest accepted JobReply observation and completed/timed-out/cancelled disposition. one and all require every selected execution terminal; any requires at least one terminal and retains all selected statuses in input order. Unknown/unavailable state cannot satisfy completion.

Start one inspection round immediately. Poll each selected identity independently at pollIntervalMs, with at most one inspection in flight per identity. A hung owner does not prevent later samples from responsive owners, and does not cause an accumulation of overlapping calls. A single policy timer drives the selected wait. Deadline/abort can settle while an inspection is unresolved, using honest latest status (initially unknown). Late callbacks cannot modify the returned snapshot or schedule another poll. Accept each selected response as it arrives, preserving terminal execution already accepted during this wait. Any can complete without waiting for a different hung owner. All can complete from terminal evidence accepted on different rounds. Inspections for the same identity do not overlap. Preserve terminal execution, but accept later valid awaiting/delivery/lifetime/capability fields rather than freezing the whole observation. An invalid/unavailable response cannot erase already accepted terminal evidence. Otherwise callbacks arbitrate in execution order: already accepted completion wins late abort/timeout; abort/timeout processed before a response is accepted returns current status rather than inventing completion. A zero timeout/pre-aborted signal returns honest initial unknown status without starting inspection. All completion/timeout/cancellation paths remove timers and abort listeners. The existing inspect/observe ports have no cancellation operation: already-started calls may still resolve afterward, but callbacks cannot mutate a settled result or rearm timers; no new calls are made after settlement. No wait calls stop, changes awaiting/delivery, retrieves a final result, confirms a receipt or cancels independent delivery. There is no execution queue, session scheduler, backend-name branch or result-delivery coordinator.

Generic inspect/wait status reads are non-consuming. Final result retrieval and native recorded receipt arbitration remain [[REQ-JOBS-DELIVERY-RECEIPTS]] and the separate delivery slice; these APIs do not pretend to implement all JobOwnerPort methods. Concrete foreground handoff/native cancellation, session recovery and normal-exit cleanup remain [[VER-JOBS-FOREGROUND-HANDOFF]] and [[VER-JOBS-SESSION-AND-EXIT]].

## Explicit routing

createJobsLifecycleRouter receives an ownerFor(full JobIdentity) lookup supplied by runtime composition, not a participant view or historical registry. Route inspect, stop and setAwaiting to the actual controller; route selected wait through those inspect methods. Lookup failure/missing owner returns unknown and grants nothing. Pass the complete identity unchanged so a wrong lookup is rejected by the receiving controller. Control authorization is always performed by that controller before acting; the router neither manufactures authority nor uses capabilities, producer/backend names or observation metadata as a grant. This focused helper does not supply output/result/delivery methods or claim to implement the entire JobOwnerPort.
:::

:::mara verification VER-JOBS-GENERIC-LIFECYCLE
:mid: 01M45RV1AQKPMHGNXR1J6KQBRT
:title: Verify generic lifecycle control, adapter obligations and non-consuming waits
:status: accepted
:method: test
:level: unit
:verifies: DES-JOBS-GENERIC-LIFECYCLE
:verifies: REQ-JOBS-CANCELLATION-BOUNDARY
:verifies: REQ-JOBS-HARD-TIMEOUT
:verifies: REQ-JOBS-WAIT-SELECTION
:verifies: REQ-JOBS-CONFIGURATION

Use reusable fake adapters and injected clocks to verify explicit settings precedence, five-second grace/foreground defaults, no implicit deadline, explicit original-start hard deadlines and configured alternatives. Verify running/unknown/exit/nonzero/termination/launch-failure observations, malformed/thrown evidence, coalesced sampling, completion winning late stop and preservation of actual outcomes after admission. Treat adapter-owned graceful/force escalation as a synthetic obligation check, never proof of OS ownership or cleanup.

Exercise complete runtime/owner/session/job/producer routing, wrong routes, copied assertion versus owner-held possession, current generation changes and revalidation after asynchronous observation. Stop admission is intent, not an outcome: uncertain replies retain execution and allow explicit retry; concurrent authorized requests coalesce. Stop-awaiting preserves honest execution/delivery/lifetime and visibility. Test normal stop, foreground-cancel intent and hard timeout through the same policy, with no backend/producer branching.

Wait for one/any/all with running, terminal and unknown selections, including a different hung owner, terminal evidence across rounds, mismatched identity, sparse/empty/duplicate selections and inspection errors. Observe timeout/abort settling despite hung inspection, no stop or receipt side effect, immutable results after late callbacks, and timer/abort-listener cleanup. Include synchronous cancellation inside an inspection callback and synchronous controller disposal inside adapter observation: no further selected inspection or policy-owned timer may be started after settlement/disposal. Validate compiled exports in independently installed npm/pnpm consumers using a fresh archive, strict declaration resolution and actual timer-driven fake completion. Include all required emitted modules/declarations in the explicit publication allowlist; exclude tests/specifications.

These checks cover generic library policy only. The real foreground/native workflows, session/exit reconciliation, backend owned-child proof, stores, gates and native completion coordinator/receipt integration remain their existing separate verification obligations. Existing credential-free Pi 0.99.1 checkpoint probes may run as compatibility regressions but do not establish new lifecycle-to-host integration.
:::
