# Jobs completion delivery and consumer decisions

This defines intended behavior alongside the [lifecycle policy](./lifecycle.mara.md).
It is not an implemented API, a promise of exactly-once delivery, or evidence of
working goal/caffeinate integration. The owner delivers results; observers and
[gates](../../../packages/gates-protocol/docs/contract.mara.md) do not independently
start turns or redeliver them.

## Consumer-owned decisions

Job owners project their awaited execution and required result delivery into the
same generic gates consumed by [goal](../goal/jobs-integration.mara.md) and
[caffeinate](../caffeinate/jobs-integration.mara.md). Neither consumer inspects job
phases through a jobs API or requires gate-purpose distinctions. Their canonical
requirements and verification live in their own planned folders.

## Pi scheduling and receipt boundaries

Use Pi's normal follow-up and session-message facilities rather than an extra
Escape-specific pause state or a separate turn scheduler. Automatic delivery is
non-steering: it follows the current run's pending work. Returning to a session
with already-pending completions does not itself start a model turn.

A delivery receipt means Pi recorded model-visible content, not that an LLM
understood it, acted on it, or replied. Queue admission alone is not that receipt.
If recovery cannot establish whether delivery happened, redeliver the saved result
with stable identity rather than risk losing it. This uncertainty never authorizes
rerunning the command or converting an unknown execution into success.

## Agreed knowledge

:::mara requirement REQ-JOBS-DELIVERY-MODES
:mid: 01M3PZ67BH84B63J0AMEK1ZRD9
:title: Deliver results through explicit non-interrupting modes
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Support automatic follow-up, next-natural-turn, and display-only result delivery. Finite managed commands default to automatic delivery. The caller, including the agent, may explicitly override delivery and awaiting per job, subject to the one-shot print/JSON rejection of awaited plus next-natural-turn selections in [[REQ-PI-NONUI-AWAIT]]; do not classify command text to choose a mode. Automatic delivery follows the current agent run without steering or interrupting it, using normal Pi scheduling. Do not introduce Escape-specific pause state or distinguish ordinary idle from abort-induced idle beyond Pi behavior. Next-turn delivery includes the result when another turn naturally starts without starting a turn itself; display-only saves and shows the result without sending it to the model. Completions pending when the originating session is resumed wait for the next user message rather than waking the model merely because the session was opened. Batch results already pending for delivery into a common follow-up while preserving each job identity and outcome. Do not deliver into another session.
:::

:::mara requirement REQ-JOBS-DELIVERY-RECEIPTS
:mid: 01M3PZ6A85V1SPQHMV8RACCCBJ
:title: Confirm delivery through Pi records and retry ambiguous receipts without rerunning work
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

For model-directed modes, count delivery when Pi has recorded the final result as a model-visible message or tool result, not merely when it was queued and not after waiting for an assistant acknowledgement or action. Explicit retrieval of a completed final result through a tool counts as delivery only when that final result is recorded as model-visible, and then suppresses its pending automatic notification; reading incremental logs alone does not. A nested tool call, its tool_result event, or Pi's bounded nestedCalls metadata is not by itself a model-visible receipt. If an outer tool discards or filters away the final result, delivery remains pending. Arbitrate normal foreground, explicit retrieval, and automatic-delivery paths to avoid unnecessary duplicate results. If recovery cannot establish whether delivery was recorded, retry the saved result with stable job/result identity even though it may repeat a previous delivery. Do not promise exactly-once delivery across failures. Uncertain delivery is distinct from uncertain execution: never rerun a command, invent an exit result, or mark it failed solely to resolve a missing delivery receipt.
:::

:::mara verification VER-JOBS-DELIVERY
:mid: 01M3PZ6G2PTNSNXDP1K8CWX8YX
:title: Exercise delivery scheduling, batching, final-result retrieval, and ambiguous recovery
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-DELIVERY-MODES
:verifies: REQ-JOBS-DELIVERY-RECEIPTS

Use real Pi session/message scheduling plus controlled completion fixtures. Finish jobs during an active run and confirm automatic results follow without steering; test normal idle and aborted-run idle without extension-specific Escape state. Exercise next-turn and display-only modes and explicit per-job overrides where permitted; use [[VER-PI-NONUI-AWAIT]] for one-shot print/JSON rejection of awaited plus next-turn selections at launch and on awaiting/delivery changes, without silent mode changes or execution side effects. Resume a session with saved completions: no turn starts until the next user message. Batch simultaneous pending results with distinct identities/outcomes. Race foreground completion, explicit final-result retrieval, and automatic delivery; require one normal delivery path, but do not treat incremental log reads as consumption. Exercise direct and native nested tool retrieval, including codemode discarding or filtering results and explicitly forwarding a final result. Nested tool events and call metadata alone must not clear delivery obligations; require an identifiable recorded model-visible final result. Confirm a queued-only result is still pending, a recorded model-visible result is delivered without an assistant reply, and a confirmed receipt suppresses recovery redelivery. Inject an ambiguous receipt failure and allow identifiable redelivery of the saved result, never re-execution. An unknown execution must remain unknown. These are future checks, not passing evidence.
:::
