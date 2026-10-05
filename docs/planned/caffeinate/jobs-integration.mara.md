# Planned caffeinate integration with jobs

Caffeinate and [goal](../goal/jobs-integration.mara.md) consume the same generic
[gates protocol](../../../packages/gates-protocol/docs/contract.mara.md). Job owners
decide what remains gated; neither consumer needs the jobs API or job-phase filters.
The [caffeinate contract](./contract.mara.md) defines automatic holding across tracked
sessions and the user's explicit temporary/persistent overrides.

While gates remain pending, goal does not nudge and the gate-derived inhibition
reason remains active. This also applies when a job has finished but its result
is still gated for next-turn delivery. With no gates, each consumer applies its
normal behavior; gate clearance does not override other awake reasons. Unconfirmed
gate state remains conservative rather than being treated as confirmed empty.

This defines intended behavior, not a migrated caffeinate extension or verified
integration. Keep it under `docs/planned/caffeinate/` until that package is scaffolded.

## Agreed knowledge

:::mara requirement REQ-JOBS-SLEEP-POLICY
:mid: 01M3PZ6D3KC14SZEMSEAYTF3PX
:title: Keep sleep inhibition active while the shared gates remain pending
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME
:derives_from: REQ-JOBS-AWAITED-COMPLETION

Caffeinate consumes the same generic gates as goal through the gates protocol, not job execution or delivery phases through a jobs API. Job owners decide when to acquire and release their gates. While effective gates remain pending, caffeinate must not release their inhibition reason merely because Pi is idle or a command has exited. This includes a completed result awaiting next-turn delivery when its owner keeps the gate pending. Do not add gate-purpose distinctions, separate consumer-specific gate sets, or job-stage filters to choose different behavior for goal and caffeinate.

Unconfirmed gate state is not confirmed empty state; retain conservative inhibition with the protocol diagnostics until reconciliation, owner clearance including clearance after explicit stop-awaiting, or recorded user abandonment of the selected wait under [[REQ-GATES-USER-ABANDONMENT]]. Abandonment is an explicit public-contract recovery state, not a consumer inference from timeout or a claim of successful work. When no effective gates remain, remove only the gate-derived reason and let normal caffeinate activity/settings policy apply; other independent reasons are unaffected. Caffeinate does not own or clear gates belonging to other producers, deliver results, or start model turns.

This gate-derived reason is subject to the explicit user overrides in [[REQ-CAFFEINATE-MANUAL-CONTROLS]]. Caffeinate retains generic gate reasons across all sessions tracked by this Pi process under [[REQ-CAFFEINATE-AUTO-HOLD]], not only the currently selected conversation.
:::

:::mara verification VER-JOBS-POWER-WORKFLOW
:mid: 01M3PZ6JWXCFZ6XYCS82QFRHXP
:title: Verify goal and caffeinate consume the same owner-managed gates
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-SLEEP-POLICY
:verifies: REQ-JOBS-AWAITED-COMPLETION

Exercise actual goal and caffeinate consumers with a generic gate owner and without loading jobs-core: pending gates prevent goal nudges and keep the gate-derived inhibition reason active. Require no job-stage information or consumer-specific gate classification. Unconfirmed owner state retains conservative handling and diagnostics rather than being treated as empty. Once the owner confirms no gates, both consumers return to their normal behavior; an independent awake reason remains effective.

Then integrate actual job owners: keep an awaited command running while Pi is idle, complete it in next-turn mode, and verify that both consumers remain gated while delivery is pending. Normal owner clearance after delivery or explicit stop-awaiting removes that gate reason; stopping a wait must not fabricate execution success or termination. Separately exercise user-confirmed abandonment through [[VER-GATES-USER-ABANDONMENT]], including an absent owner: both consumers observe removal of only the abandoned effective obligation while other waits/reasons and the unknown external outcome remain intact. Neither clearance nor abandonment itself delivers results or starts a model turn. Generic fixtures establish decoupling, but actual job/consumer tests are also required for end-to-end coverage. These checks have not run.

Run the automatic-holding assertions with caffeinate enabled and not manually stopped; test the explicit override cases separately under [[VER-CAFFEINATE-GATES-AND-CONTROLS]]. Include a job whose originating session genuinely deactivates: request best-effort managed cancellation. An unconfirmed stop or undelivered saved result must not silently drop its effective generic gate reason or claim successful work; existing owner reconciliation and explicit user abandonment remain the resolution paths. No continued inactive-session execution/result monitoring or crash recovery is required.
:::
