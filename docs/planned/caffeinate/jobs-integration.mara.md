# Planned caffeinate integration with jobs

Caffeinate owns the sleep-inhibition decision, independently of
[goal continuation](../goal/jobs-integration.mara.md). Job owners supply execution
and pending-delivery state; caffeinate does not run jobs or deliver results.

An awaited command still executing needs the machine awake. A completed result
intentionally waiting for the user's next turn still blocks goal, but need not
keep the computer awake. Unknown awaited execution remains conservative, with a
visible warning. Other reasons for keeping the machine awake remain independent.

This defines intended behavior, not a migrated caffeinate extension or verified
integration. Keep it under `docs/planned/caffeinate/` until that package is scaffolded.

## Agreed knowledge

:::mara requirement REQ-JOBS-SLEEP-POLICY
:mid: 01M3PZ6D3KC14SZEMSEAYTF3PX
:title: Separate awaited execution wakefulness from intentionally deferred results
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME
:derives_from: REQ-JOBS-AWAITED-COMPLETION

The jobs integration with caffeinate keeps the computer awake for running awaited work. If awaited execution becomes unconfirmed, conservatively retain that sleep-inhibition reason until reconciliation or an explicit stop-awaiting action, and expose a visible warning. Once verified execution has finished and only intentionally deferred next-turn delivery remains, release this job reason for sleep inhibition even while goal remains paused for delivery. Do not release other independent reasons for keeping the machine awake. Releasing sleep inhibition does not cancel execution, discard a result, deliver it, or start a model turn. Actual caffeinate and goal integrations must verify these distinct decisions; gate presence alone must not erase the distinction.
:::

:::mara verification VER-JOBS-POWER-WORKFLOW
:mid: 01M3PZ6JWXCFZ6XYCS82QFRHXP
:title: Verify real consumer decisions for active, deferred, and uncertain jobs
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-SLEEP-POLICY
:verifies: REQ-JOBS-AWAITED-COMPLETION

With actual goal and caffeinate consumers, keep an awaited command running while Pi is idle: goal does not nudge and the jobs wakefulness reason remains active. Complete it in next-turn mode: goal still waits for model delivery, but the job no longer prevents computer sleep. Retain a separate active reason and confirm it is not released by this job transition. Make awaited execution unconfirmed: retain conservative sleep inhibition and goal waiting with a visible diagnostic, until reconciliation or explicit stop-awaiting. Stopping the wait must not fabricate successful execution. Gate fixtures alone cannot establish this workflow. These checks have not run.
:::
