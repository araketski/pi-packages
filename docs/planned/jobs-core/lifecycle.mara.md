# Agreed jobs lifecycle policy

These are intended behaviors for the [jobs packages](./contract.mara.md), not an
implemented runner or passing runtime evidence. Keep this staged document with
jobs-core until scaffolding. Local and Herdr adapters must supply real execution
and ownership evidence; shared policy must not infer success from missing state.

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

## Remaining decisions and implementation work

- Abrupt crash cleanup is unresolved. Normal-exit cancellation is not a guarantee
  that shutdown handlers run after a crash or forced process termination.
- Define the Pi lifecycle event mapping, reload ownership handoff, durable record
  format/location/retention, and pre-first-message/in-memory session boundaries.
  Follow Pi's actual session resumability rather than inventing session history.
- Define foreground-to-background cancellation races, startup failure handling,
  process-tree termination, shutdown grace/escalation, and hard timeouts separately
  from the foreground wait budget. Cancellation intent is not proof of exit.
- The user favors configurable, non-interrupting completion delivery. Automatic
  follow-up after the current agent run, next-natural-turn delivery, and display-only
  delivery have been proposed; the exact mode/default/configuration contract and
  delivery acknowledgement/retry rules remain to be finalized. Gate release and
  pending-delivery handling must be defined for whichever modes are selected.
- Actual goal/caffeinate integration and isolated real-backend tests remain
  necessary. A fake executor or gate observer alone does not verify those workflows.

## Agreed knowledge

:::mara goal GOAL-JOBS-MANAGED-LIFETIME
:mid: 01M3PTSZNA34DADC14WYH20F5B
:title: Keep asynchronous work controllable without losing session results
:status: accepted

Let ordinary bash commands continue without blocking Pi indefinitely, while keeping cancellation predictable and preserving results for the originating session. Managed work should not remain running after normal Pi exit, while explicitly persistent Herdr terminals remain available to the user. Required asynchronous work and pending result delivery must not cause premature goal continuation.
:::

:::mara requirement REQ-JOBS-FOREGROUND-BUDGET
:mid: 01M3PTT2NP5GVDQF4TNPRMRQG0
:title: Background the same local command after a configurable five-second wait
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

The replacement bash tool uses a configurable foreground wait budget with a five-second default. Every ordinary bash command can use the local runner without a command-name whitelist. A command that finishes within the budget returns its foreground result. A command still running when the budget expires returns a job identity and continues as the same execution, without termination, restart, or migration into a Herdr pane. Budget expiry is not a hard execution timeout. Completion racing with the handoff must not lose the result or deliver both a foreground result and an unnecessary duplicate completion.
:::

:::mara requirement REQ-JOBS-CANCELLATION-BOUNDARY
:mid: 01M3PTT5HQ5J7JR6KBGK1PNC45
:title: Separate foreground cancellation from background job control
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Aborting a bash tool operation while its command is still foreground cancels that command rather than silently detaching it. Once handed off to background execution, aborting an unrelated agent turn does not cancel the job; use explicit job-stop control, subject also to the normal-exit lifetime policy. A requested stop is not a confirmed terminal outcome. If termination cannot be verified, retain tracking and expose uncertainty rather than claiming cancellation completed or clearing awaited work merely because a stop was requested. Exact race arbitration and termination escalation remain to be specified.
:::

:::mara requirement REQ-JOBS-SESSION-CONTINUITY
:mid: 01M3PTT8D7V676Z0YREAXP6YZJ
:title: Retain original-session jobs and results across reloads and session switches
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Extension reload, /new, and session switching must not apply application-exit cancellation to managed jobs. Keep tracking the existing execution rather than launching it again. Preserve its originating-session association and enough job, output/result, and pending-delivery state to reconcile when that session is resumed. A job completing while another session is active must not inject its result or start a turn in that other session. On return to a resumable originating session, including in a later Pi process, reconcile retained records: recover finished results and pending delivery, resume monitoring only with verified running evidence, and retain uncertainty when state cannot be established. Saved state is not proof that the job is still running or that termination succeeded; it does not authorize managed work to survive normal Pi exit.
:::

:::mara requirement REQ-JOBS-EXIT-CLEANUP
:mid: 01M3PTTBBG71B92K3GHYWFFSB9
:title: Cancel owned managed jobs on normal exit while retaining persistent Herdr terminals
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

On normal Pi application exit, cancel outstanding managed command jobs owned by that Pi instance, including its jobs associated with sessions no longer active. Apply this lifetime policy to both local and Herdr managed commands. Explicitly persistent Herdr terminals, including servers or interactive agents launched with that lifetime choice, remain running; do not infer persistence solely from opting out of a wait. Never close a parent Herdr workspace or delete a worktree as part of job cleanup, or terminate work merely observed but not owned. Preserve known results and honest termination status for later reconciliation. This normal-exit policy does not establish an abrupt-crash cleanup guarantee or promise survival across a Herdr-server restart or machine reboot.
:::

:::mara requirement REQ-JOBS-AWAITED-COMPLETION
:mid: 01M3PTTE89F590Y3FPC5T1WBS7
:title: Await automatically backgrounded work through its required result delivery
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME
:derives_from: REQ-GATES-SIGNAL-ONLY

Automatically backgrounded commands are awaited by default: goal must not repeatedly nudge or treat work as complete while required execution or result delivery is pending. Provide an explicit opt-out from awaiting persistent servers/watchers instead of waiting for their entire lifetime. Waiting and execution lifetime are separate choices. The job owner maintains the appropriate gate signal and owns delivery; clearing a gate alone does not deliver output or start another turn. Unverified job state or requested-but-unconfirmed cancellation must not become confirmed empty work. This is an intended consumer integration, not evidence that goal or caffeinate already implements it.
:::

:::mara verification VER-JOBS-FOREGROUND-HANDOFF
:mid: 01M3PTTH3X0D4R2HK88DXYXGN2
:title: Exercise quick completion, background handoff, and cancellation boundaries
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-FOREGROUND-BUDGET
:verifies: REQ-JOBS-CANCELLATION-BOUNDARY

With controlled clocks and a fake executor, verify the five-second default, a configured alternative, completion on either side of budget expiry, and no lost or unnecessarily duplicated result at the boundary. Repeat the basic flow with a real local command whose process identity and single execution can be checked: no rerun and no Herdr dependency. Foreground abort stops its command; after background handoff, abort an unrelated agent turn and confirm the job continues, then explicitly stop it. Failed or unconfirmed termination must remain uncertain and tracked. Include success, nonzero exit, and launch failure. These are future checks, not observed passing results; finalize race arbitration before implementing its assertions.
:::

:::mara verification VER-JOBS-SESSION-AND-EXIT
:mid: 01M3PTTM109CGS3B8DXJ4BK1BZ
:title: Exercise reload, original-session recovery, and ownership-safe exit cleanup
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-SESSION-CONTINUITY
:verifies: REQ-JOBS-EXIT-CLEANUP

Start managed work in session A, reload extensions, and switch to session B, checking that no replacement execution starts and the job is not cancelled by those transitions. Complete it while B is active: B receives neither its result nor a model wake. Resume A and recover the saved result and pending delivery without treating historical state alone as liveness evidence. With jobs from both active and inactive sessions still running, exit Pi normally and verify that its owned managed jobs stop. In an isolated Herdr environment, include a managed command, an explicitly persistent terminal, unrelated work, and a parent workspace/worktree: retain the persistent and unrelated executions and parent resources. Reopen the original resumable session in a new Pi process and reconcile saved outcomes. Exercise unavailable-backend and unconfirmed-stop observations without false success or cancellation claims. These checks require actual Pi lifecycle and real local/Herdr integration evidence; fake-adapter tests alone are insufficient. Abrupt-crash cleanup has no agreed acceptance guarantee yet. None of these checks has run.
:::

:::mara verification VER-JOBS-AWAITED-WORKFLOW
:mid: 01M3PTTQ0D12D951MGSAY1C9KQ
:title: Verify goal respects pending execution and delivery without gate-driven duplicate wakes
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-AWAITED-COMPLETION

With the actual jobs owner and goal consumer, automatically background a finite command and check that goal does not issue premature continuation nudges while execution or required result delivery is pending. Keep delivery pending after completion and confirm execution exit alone does not release the wait. An explicitly non-awaited server/watcher must not create an indefinite wait for its exit; that opt-out must not change normal-exit cleanup ownership. Unconfirmed termination must not clear required work. Confirm clearing the gate does not independently deliver the result or create an extra model wake. Complete the delivery and acknowledgement contract before finalizing those assertions. Gate fixtures alone do not establish this integration, and this item records future checks rather than passing runtime evidence.
:::
