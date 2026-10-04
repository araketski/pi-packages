# Planned goal integration with jobs

The [goal contract](./contract.mara.md) owns continuation and explicit pauses.
Required work and result delivery keep an active goal waiting through gates;
this is not an explicit pause of its wall clock. Goal does not own job execution,
result delivery, or cleanup.
Use the [shared jobs lifecycle](../../../packages/jobs-core/docs/lifecycle.mara.md),
[delivery receipts](../../../packages/jobs-core/docs/delivery.mara.md), and
[gates contract](../../../packages/gates-protocol/docs/contract.mara.md).

This defines intended behavior, not a migrated goal extension or verified
integration. Keep it under `docs/planned/goal/` until goal is scaffolded.

## Agreed knowledge

:::mara requirement REQ-JOBS-AWAITED-COMPLETION
:mid: 01M3PTTE89F590Y3FPC5T1WBS7
:title: Await automatically backgrounded work through its required result delivery
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME
:derives_from: REQ-GATES-SIGNAL-ONLY

Automatically backgrounded commands are awaited by default: goal must not repeatedly nudge or treat work as complete while required execution or result delivery is pending. Allow explicit per-job awaiting overrides, including opting out for persistent servers/watchers. Waiting and execution lifetime are separate choices selected by the caller, not inferred from command text. The job owner maintains the appropriate gate signal and owns delivery; clearing a gate alone does not deliver output or start another turn.

In next-turn mode, where awaited selection is permitted by [[REQ-PI-NONUI-AWAIT]] (not in one-shot print/JSON), goal remains gated (active but waiting, not explicitly paused) until the final result is delivered according to [[REQ-JOBS-DELIVERY-RECEIPTS]]. In display-only mode, no model delivery is required: end the wait when execution finishes and its result is saved/displayed. Unverified execution or requested-but-unconfirmed cancellation must not silently become confirmed empty work. Allow explicit stop-awaiting to release the wait without claiming success or confirmed termination; retain the unresolved job visibly. Separately, confirmed user abandonment under [[REQ-GATES-USER-ABANDONMENT]] ends only the selected effective gate obligation, including when its owner is absent. It does not change job awaiting/delivery settings, invent an outcome, consume a result or suppress independent delivery; normal gate reconciliation must respect the recorded abandonment for that obligation. Caffeinate consumes the same effective owner-managed/user-abandoned gates under [[REQ-JOBS-SLEEP-POLICY]], without a job-phase or gate-purpose distinction. These are intended consumer integrations, not evidence that goal or caffeinate already implements them.

These job lifecycle and delivery policies are enforced by job owners through their gates. Goal consumes generic gate state under [[REQ-WORKFLOW-PRODUCER-INDEPENDENCE]]; it does not inspect job phases, delivery modes, or which extension supplied a gate. An explicitly abandoned obligation is not a remaining effective await requirement, but independent execution/result delivery and other non-abandoned obligations retain their normal contract.
:::

:::mara verification VER-JOBS-AWAITED-WORKFLOW
:mid: 01M3PTTQ0D12D951MGSAY1C9KQ
:title: Verify goal respects pending execution and delivery without gate-driven duplicate wakes
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-AWAITED-COMPLETION

With the actual jobs owner and goal consumer, automatically background a finite command and check that goal does not issue premature continuation nudges while execution or required delivery is pending. With next-turn delivery selected in a mode that permits awaiting it, retain the wait after exit until a final result is recorded in Pi model-visible context; no assistant reply is required. In one-shot print/JSON, verify the selection is rejected under [[VER-PI-NONUI-AWAIT]] instead of creating that wait. In display-only mode, verified exit plus the saved/displayed result releases the wait without model delivery. An explicitly non-awaited server/watcher must not create an indefinite wait; that choice must not change its execution lifetime. Unconfirmed termination remains pending unless explicitly opted out of awaiting, which leaves its uncertain job visible. Confirm gate clearance does not independently deliver a result or create an extra model wake. Gate fixtures alone do not establish this integration. This defines future checks, not passing runtime evidence.
:::
