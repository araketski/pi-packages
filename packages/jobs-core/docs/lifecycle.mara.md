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

Ordinary idle, agent/script completion, background handoff, /tree navigation and
reload of the same active session do not deactivate it. Preserve execution across
those boundaries without rerunning commands, with fresh callbacks after reload.
/new, replacement by another session, and a fork replacing the active session
instead trigger bounded best-effort cancellation of owned managed jobs. This is
not automatic detachment or a guarantee of tracking/result capture after leaving.
Saved metadata/results may be read on return; saved running state is not liveness.

## Implementation and verification boundary

The [delivery policy](./delivery.mara.md) defines shared modes and receipt/retry
semantics. Consumer decisions live in the [goal plan](../../goal/docs/jobs-integration.mara.md)
and [caffeinate plan](../../caffeinate/docs/jobs-integration.mara.md); replacement-bash
behavior lives in the [pi-jobs plan](../../jobs/docs/execution.mara.md). Orderly
shutdown cancellation is best-effort. Crash/forced-kill cleanup and survivor
recovery are outside scope; do not infer cleanup from historical state.

Before implementing each slice, define and test its Pi lifecycle mapping, reload
handoff, concrete ownership/liveness evidence, foreground cancellation races,
startup failure handling, bounded deactivation cleanup and Pi session appends. Reuse Pi facilities where
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

Aborting a bash tool operation while its command is still foreground cancels that command rather than silently detaching it. Once handed off to background execution, aborting an unrelated agent turn or finishing a tool/codemode call does not cancel the job. Explicit job-stop control and genuine session deactivation/orderly application shutdown remain separate stop triggers under [[REQ-JOBS-SESSION-CONTINUITY]] and [[REQ-JOBS-EXIT-CLEANUP]]. Request graceful termination of the command and its owned children, use the configurable five-second default grace period, then force termination where supported, without touching unrelated processes. Observed completion wins a racing late cancellation and keeps its actual outcome.

A requested/admitted stop is not a confirmed terminal outcome. While the owning session remains active, retain tracking and expose uncertainty rather than claiming cancellation completed or clearing awaited work merely from a stop request. Genuine deactivation uses a bounded best-effort cleanup attempt, not indefinite monitoring or a requirement to prove every child stopped before switching; persist/report known outcome or uncertainty where possible. No new automatic unmanaged-detach feature is implied. Define and test concrete ownership evidence, handoff arbitration and bounded deactivation handling before implementation.
:::

:::mara requirement REQ-JOBS-SESSION-CONTINUITY
:mid: 01M3PTT8D7V676Z0YREAXP6YZJ
:title: Preserve jobs in an active session and cancel best-effort on genuine deactivation
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Distinguish an active but idle session from one genuinely deactivated by replacement or orderly closure. Managed foreground/background jobs continue while their owning session is active, including ordinary idle, agent/script completion, unrelated-turn abort after handoff, and /tree navigation within that same session. Reloading extensions for the same native session preserves the existing executions and association, without rerunning commands; rebind through supported fresh public Pi capabilities, never stale captured contexts. Define the concrete reload handoff before implementation.

Starting /new, switching to another session, or a fork that replaces the active session genuinely deactivates the original session. Request best-effort cancellation of its owned managed jobs through [[REQ-JOBS-CANCELLATION-BOUNDARY]], regardless of foreground/background or awaiting choice. Bound the cleanup attempt and do not block replacement indefinitely on stop, observation, output or persistence. Record known outcome and unconfirmed stop intent through the original still-valid session append boundary where possible. Failed/unconfirmed cancellation is honest uncertainty, not a cancelled/terminal result or proof of cleanup. There is no automatic unmanaged detachment and no guarantee of continued tracking, completion capture or delivery once genuinely inactive. Explicitly persistent Herdr terminals remain the separately selected lifetime exception under [[REQ-JOBS-EXIT-CLEANUP]], without a promise of inactive-session jobs delivery.

Do not inject old-session results or wakes into the replacement session. On reopening, restore saved compact metadata/results under [[REQ-JOBS-PI-STATE]]; already-saved pending results wait for the next user message under [[REQ-JOBS-DELIVERY-MODES]]. Never infer current liveness/control authority from saved running state, automatically restart execution, adopt historical survivors or add crash-recovery scans. Crash and forced-kill cleanup/recovery are outside scope. Saved results remain distinguishable from missing output and uncertain execution.

/tree does not rewind execution; eligible results belong on the active branch. Forked/copied history does not transfer original-session ownership, waits or pending delivery. Deactivation and loss of monitoring do not fabricate successful completion, confirmed empty gates or fulfilled delivery. Existing generic owner reconciliation and explicit user abandonment policies remain applicable; session navigation/history grants no new control authority.
:::

:::mara requirement REQ-JOBS-EXIT-CLEANUP
:mid: 01M3PTTBBG71B92K3GHYWFFSB9
:title: Attempt ownership-safe cancellation on orderly shutdown without crash-recovery machinery
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

On orderly Pi application shutdown, request best-effort cancellation of outstanding managed command jobs still owned by that Pi instance, using the graceful-stop/escalation policy for both local and Herdr managed commands. Genuine session deactivation already follows [[REQ-JOBS-SESSION-CONTINUITY]]; shutdown does not require reconstructing an inactive-session execution registry. Bound cleanup and do not keep Pi alive indefinitely to obtain termination, output-drain or persistence proof. Record known outcomes or cancellation uncertainty through still-valid session APIs where possible. A requested stop or expired cleanup bound never fabricates terminal state, successful cancellation, delivery or confirmed-empty awaited work.

Retain explicitly persistent Herdr terminals, including servers or interactive agents launched with that lifetime choice; non-awaiting/background/visible execution alone does not confer persistence. Do not automatically detach managed work. Never close a parent Herdr workspace, delete a worktree, stop/restart a user server or terminate work merely observed but not owned. Missing/reused numeric identifiers are not ownership or liveness proof.

Pi crashes and forced kills, their cleanup and survivor recovery are outside scope. No watchdog, survivor-adoption/reaping service, post-crash scan or post-exit result-capture guarantee is required. On reopening, saved running/stop-requested state remains historical/unconfirmed unless fresh supported evidence independently establishes otherwise; history alone must not claim cleanup or execution. No survival guarantee applies across Herdr-server restart or machine reboot.
:::

:::mara verification VER-JOBS-SESSION-AND-EXIT
:mid: 01M3PTTM109CGS3B8DXJ4BK1BZ
:title: Exercise idle/reload continuity and bounded best-effort session-deactivation cleanup
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-SESSION-CONTINUITY
:verifies: REQ-JOBS-EXIT-CLEANUP

Start a real managed command in session A. Verify ordinary idle, foreground-to-background handoff, agent/script completion and unrelated-turn abort after handoff do not stop it. Reload extensions for A without rerunning the command and rebind fresh public callbacks. Navigate /tree without rewinding execution or acquiring new authority; route eligible results to the active branch.

Independently exercise /new, switch A to B and a fork replacing A. Each genuinely deactivates A and triggers an owned best-effort graceful/forced stop attempt; both foreground/background and non-awaited managed work follow the same lifetime rule. Use cooperative and escalation-requiring commands plus stalled/unavailable observation/stop/output/append fixtures. Cleanup is bounded: unconfirmed termination does not indefinitely prevent replacement, and reported/saved status is uncertain rather than a fabricated cancellation or exit. A real completion racing cancellation retains its actual outcome. No late output/result/append/wake targets B or an invalidated A context, and no continued inactive monitoring/result-capture promise is advertised. Reopen A to read already-saved results and historical uncertainty without reruns, adopting old handles or treating saved running state as liveness; saved pending results wait for the next user message.

Forked history transfers references, not controls, waits or delivery. Generic gate replay/reconciliation must not create inherited waits in the new fork or silently clear unresolved original obligations; use existing owner reconciliation/user-abandonment policies instead of inventing terminal outcomes.

Exercise orderly Pi shutdown with actual Linux managed work and isolated real Herdr managed/persistent terminals. Attempt owned managed cleanup while preserving explicitly persistent terminals, unrelated processes, parent workspaces/worktrees and user servers. Inject stale/reused identifiers and missing evidence: no unsafe signals or fabricated terminal state. Crash/forced-kill cleanup, survivor adoption/reaping and recovery scans are out of scope; replaying a saved running record must still remain honest historical uncertainty. Real lifecycle/backend evidence is required; fake adapters alone and older preserve-across-switch/recovery tests do not verify this revised policy.
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

The initial execution is unknown until observed. Observe calls are coalesced per controller to avoid out-of-order samples; publish observation and stop promises before invoking adapter callbacks, including synchronous reentrant inspection/stop requests. Running and unknown can replace each other, but confirmed terminal is absorbing; a late sample cannot erase accepted terminal evidence. Validate detached adapter execution and inspect reply records before storing them; prototype getters/fields lost during cloning must not create malformed ok or terminal records. Detached launch/selection/routing identities must still contain every required identity field. Invalid adapter state and thrown observation become unknown with diagnostics, never terminal. Diagnostic conversion must not throw for arbitrary adapter, inspection or lookup rejection values, including absent coercion, throwing coercion and malformed Error messages. Use a stable nonempty string fallback when formatting cannot produce a safe string; failed formatting never corrupts observation/control state or creates an unhandled sampling rejection. Stop requests first attempt to refresh execution, bounded by pollIntervalMs on the injected clock. If observation is stalled, retain unknown execution with a diagnostic, revalidate current authority and attempt adapter stop anyway; stalled observation must not defeat explicit stop or a hard deadline. A stop being admitted exposes pending/unconfirmed intent. The pre-stop bound timer is removed on observation, expiry or disposal; late samples still preserve actual execution evidence, never relabel it. Stop requests arbitrate observed completion: terminal completion wins a late request, retaining the actual exit/termination/launch failure. If completion is only learned after stop admission, retain that actual observed outcome too; no synthetic cancelled outcome exists. Backend stop must itself arbitrate completion racing its action.

Stop intent is separate from observation and records reason (explicit, foreground-cancel or hard-timeout), request identity and requested versus unconfirmed reply. Concurrent requests share the current stop operation, after independently checking authority; successful admission is not repeated, whereas failed/unconfirmed requests permit an explicit retry. A stop rejection/throw does not discard execution or change delivery/awaiting. Requests completing after disposal do not reactivate timers; disposal cancels policy-owned timers only and makes future operations unavailable, not terminated.

An explicit hard timeout is measured from caller-supplied startedAtMs on the injected monotonic clock, not from a wait or controller reload. At expiry it uses the same stop path and owner-supplied authority from launch. Retain its denied/unconfirmed diagnostic. No deadline timer exists by default. Observed terminal clears the deadline. Disposal is not session-deactivation or application-exit cleanup. Consumers that keep the same session active, including reload, must hand off monitoring/deadline responsibility before disposing live controllers. Genuine deactivation/orderly shutdown instead requests bounded best-effort owned cancellation under [[REQ-JOBS-SESSION-CONTINUITY]] and [[REQ-JOBS-EXIT-CLEANUP]]; it does not require indefinite monitoring after disposal or imply termination merely from disposing a controller.

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

Wait for one/any/all with running, terminal and unknown selections, including a different hung owner, terminal evidence across rounds, mismatched identity, sparse/empty/duplicate selections and inspection errors. Exercise non-stringifiable rejection values through observation, stop admission, owner lookup and selected inspections; require unknown/nonterminal outcomes, diagnostic strings and timer cleanup. Include an ordinary Node consumer rejecting a null-prototype value: the handled wait must settle unknown/timed-out without an unhandled rejection terminating the process. Observe timeout/abort settling despite hung inspection, no stop or receipt side effect, immutable results after late callbacks, and timer/abort-listener cleanup. Include synchronous cancellation inside an inspection callback and synchronous controller disposal inside adapter observation: no further selected inspection or policy-owned timer may be started after settlement/disposal. Validate compiled exports in independently installed npm/pnpm consumers using a fresh archive, strict declaration resolution and actual timer-driven fake completion. Include all required emitted modules/declarations in the explicit publication allowlist; exclude tests/specifications.

These checks cover generic library policy only. The real foreground/native workflows, session/exit reconciliation, backend owned-child proof, stores, gates and native completion coordinator/receipt integration remain their existing separate verification obligations. Existing credential-free Pi 0.99.1 checkpoint probes may run as compatibility regressions but do not establish new lifecycle-to-host integration.
:::
