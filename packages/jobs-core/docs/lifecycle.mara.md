# Agreed jobs lifecycle policy

These are intended behaviors for the [jobs packages](./contract.mara.md), not an
implemented runner or passing runtime evidence. The project is scaffolded; its runtime remains unimplemented. Local and Herdr adapters must supply real execution
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

## Implementation and verification boundary

The [delivery policy](./delivery.mara.md) defines shared modes and receipt/retry
semantics. Consumer decisions live in the [goal plan](../../../docs/planned/goal/jobs-integration.mara.md)
and [caffeinate plan](../../../docs/planned/caffeinate/jobs-integration.mara.md); replacement-bash
behavior lives in the [pi-jobs plan](../../../docs/planned/jobs/execution.mara.md). Crash cleanup is
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
