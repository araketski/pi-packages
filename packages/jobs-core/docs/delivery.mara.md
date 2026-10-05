# Jobs completion delivery and consumer decisions

This defines intended behavior alongside the [lifecycle policy](./lifecycle.mara.md).
It is not an implemented API, a promise of exactly-once delivery, or evidence of
working goal/caffeinate integration. The owner delivers results; observers and
[gates](../../gates-protocol/docs/contract.mara.md) do not independently
start turns or redeliver them.

## Consumer-owned decisions

Job owners project their awaited execution and required result delivery into the
same generic gates consumed by [goal](../../../docs/planned/goal/jobs-integration.mara.md) and
[caffeinate](../../../docs/planned/caffeinate/jobs-integration.mara.md). Neither consumer inspects job
phases through a jobs API or requires gate-purpose distinctions. Their canonical
requirements and verification live in their own planned folders.

## Pi scheduling and receipt boundaries

Use Pi's normal follow-up and session-message facilities rather than an extra
Escape-specific pause state or a separate turn scheduler. Automatic delivery is
non-steering: it follows the current run's pending work. The originating-session
completion inbox in [[REQ-JOBS-COMPLETION-INBOX]] separates incoming results from
one coalesced owner wake and confirmed delivery. It coordinates delivery across
job producers without adding a competing agent scheduler or child-assignment
service. The owner may retrieve selected results while working; arrivals alone do
not interrupt it. Returning to a session with already-pending completions does
not itself start a model turn.

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

Support automatic follow-up, next-natural-turn, and display-only result delivery. Finite managed commands default to automatic delivery. The caller, including the agent, may explicitly override delivery and awaiting per job, subject to the one-shot print/JSON rejection of awaited plus next-natural-turn selections in [[REQ-PI-NONUI-AWAIT]]; do not classify command text to choose a mode. Automatic delivery follows the current agent run without steering or interrupting it, using normal Pi scheduling. Do not introduce Escape-specific pause state or distinguish ordinary idle from abort-induced idle beyond Pi behavior. Next-turn delivery includes the result when another turn naturally starts without starting a turn itself; display-only saves and shows the result without sending it to the model. Completions pending when the originating session is resumed wait for the next user message rather than waking the model merely because the session was opened. Batch results already pending for delivery into a common follow-up while preserving each job identity and outcome. Coordinate the completion inbox and a single pending owner wake per originating session under [[REQ-JOBS-COMPLETION-INBOX]]. Do not deliver into another session.

These delivery guarantees apply while the originating session is active and to results already saved through Pi resumability. Genuine deactivation requests best-effort managed cancellation under [[REQ-JOBS-SESSION-CONTINUITY]]; it does not guarantee continued monitoring, completion capture or delivery afterward. Reopening can expose already-saved pending results under the next-user-message rule, never recover a nonexistent result or wake a replacement session. A cancellation request is not a receipt or a fulfilled gate obligation.
:::

:::mara requirement REQ-JOBS-DELIVERY-RECEIPTS
:mid: 01M3PZ6A85V1SPQHMV8RACCCBJ
:title: Confirm delivery through Pi records and retry ambiguous receipts without rerunning work
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

For model-directed modes, count delivery when Pi has recorded the final result as a model-visible message or tool result, not merely when it was queued and not after waiting for an assistant acknowledgement or action. Explicit retrieval of a completed final result through a tool counts as delivery only when that final result is recorded as model-visible, and then suppresses its pending automatic notification; reading incremental logs alone does not. A nested tool call, its tool_result event, or Pi's bounded nestedCalls metadata is not by itself a model-visible receipt. If an outer tool discards or filters away the final result, delivery remains pending. Arbitrate normal foreground, explicit retrieval, and automatic-delivery paths to avoid unnecessary duplicate results. If recovery cannot establish whether delivery was recorded, retry the saved result with stable job/result identity even though it may repeat a previous delivery. Do not promise exactly-once delivery across failures. Uncertain delivery is distinct from uncertain execution: never rerun a command, invent an exit result, or mark it failed solely to resolve a missing delivery receipt.

Recovery/redelivery here reads final results and receipts already saved through Pi session resumability. It is not a requirement to capture completions while the originating session is genuinely inactive, replay execution or build crash/forced-kill recovery. Apply [[REQ-JOBS-SESSION-CONTINUITY]] without calling stale public session capabilities or retargeting a receipt/result into another session.
:::

:::mara requirement REQ-JOBS-COMPLETION-INBOX
:mid: 01M444X3VF03Q1SMJ46KDMZ4PX
:title: Queue completions with one non-interrupting owner wake per session
:status: accepted
:kind: functional
:refines: REQ-JOBS-DELIVERY-MODES
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Keep completed results awaiting model delivery in an originating-session completion inbox, preserving each job/result identity and outcome. Separate result arrival, wake scheduling, and confirmed delivery. Coordinate all participating job owners/producers and independently loaded core copies in that Pi runtime so the session has at most one outstanding jobs-delivery wake, not one wake per job or producer. This is result-delivery arbitration using Pi's normal scheduling, not an execution queue, process-count scheduler, or second agent runtime.

When the originating session is idle and automatic delivery is eligible under [[REQ-JOBS-DELIVERY-MODES]], enqueue the result and request one owner wake. Concurrent arrivals must not each request a wake: reserve the pending wake before submitting it to Pi. While a wake is queued or starting, or the owner is working, add incoming completions to the inbox without requesting another wake, steering, or interrupting the active turn. At delivery, batch eligible pending results into a common follow-up; results arriving after that batch is captured remain pending. At the next actionable idle boundary, recheck eligibility and the inbox and request one wake if automatic results remain. Arrivals racing wake submission, turn startup, or idle-boundary reconciliation must not be lost or create competing wakes. Failed or unconfirmed wake submission must leave results pending and recoverable under normal Pi scheduling rather than silently consuming them.

Allow the owner to inspect the inbox and explicitly retrieve selected completed results during its active turn without draining unrelated results. Inspection/status/log reads do not consume final results. Only a recorded model-visible final result fulfills that result's delivery obligation under [[REQ-JOBS-DELIVERY-RECEIPTS]]; scheduling, batch capture, and queue admission alone do not. Confirmed explicit retrieval suppresses later automatic delivery for those selected results, while others remain pending. Recheck pending results before a scheduled delivery so consumption through another path does not cause duplicate notifications or an empty jobs-only wake when Pi permits its suppression; concrete native queue arbitration still needs design and verification.

A one/any/all wait under [[REQ-JOBS-WAIT-SELECTION]] does not bypass this delivery coordination or create a wake per completion. Next-natural-turn and display-only results do not authorize an automatic wake, and returning to a session with saved completions retains the next-user-message rule. Observers and gates do not independently wake the owner. An interactive Herdr agent becoming idle/done is an observation, not an assignment-result receipt or proof of successful work; this inbox does not add child-assignment tracking or automatic parent-child wait propagation.

Runtime arbitration and wake guarantees apply to active originating sessions. On genuine deactivation, stop scheduling old-session delivery, request the owned best-effort cancellation policy, and preserve known pending metadata where the original public append capability is still valid. Do not keep an inactive-session result writer, execution monitor or crash-recovery inbox solely to retain earlier guarantees. Existing saved results may be reconstructed on reopening; there is no guarantee of capturing later completions. No deactivation alone consumes a result or confirms empty/cleared gates.
:::

:::mara verification VER-JOBS-DELIVERY
:mid: 01M3PZ6G2PTNSNXDP1K8CWX8YX
:title: Exercise delivery scheduling, batching, final-result retrieval, and ambiguous recovery
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-DELIVERY-MODES
:verifies: REQ-JOBS-DELIVERY-RECEIPTS
:verifies: REQ-JOBS-COMPLETION-INBOX

Use real Pi session/message scheduling plus controlled completion fixtures. Finish jobs during an active run and confirm automatic results follow without steering; test normal idle and aborted-run idle without extension-specific Escape state. Exercise next-turn and display-only modes and explicit per-job overrides where permitted; use [[VER-PI-NONUI-AWAIT]] for one-shot print/JSON rejection of awaited plus next-turn selections at launch and on awaiting/delivery changes, without silent mode changes or execution side effects. Resume a session with saved completions: no turn starts until the next user message. Batch simultaneous pending results with distinct identities/outcomes. Race foreground completion, explicit final-result retrieval, and automatic delivery; require one normal delivery path, but do not treat incremental log reads as consumption. Exercise direct and native nested tool retrieval, including codemode discarding or filtering results and explicitly forwarding a final result. Nested tool events and call metadata alone must not clear delivery obligations; require an identifiable recorded model-visible final result. Confirm a queued-only result is still pending, a recorded model-visible result is delivered without an assistant reply, and a confirmed receipt suppresses recovery redelivery. Inject an ambiguous receipt failure and allow identifiable redelivery of the saved result, never re-execution. An unknown execution must remain unknown.

Exercise [[REQ-JOBS-COMPLETION-INBOX]] with five independently completing jobs, including multiple producers and separately loaded core copies in the same runtime:

- Complete A while the owner is idle: one wake is reserved and submitted. Complete B concurrently and C while that wake is starting: no additional wake or interruption occurs. Include all eligible results available when the delivery batch is captured; later arrivals remain pending with distinct identities/outcomes.
- Complete D and E during the active turn: neither starts another turn, steers, nor interrupts. If unconsumed at the next actionable idle boundary, they produce one batched follow-up, not one wake each. Race completion against wake submission, turn startup, and idle reconciliation: no result is lost and at most one jobs-delivery wake is outstanding.
- During an active turn, inspect the inbox and retrieve only D. Status/incremental-log reads leave it pending; a recorded model-visible final result consumes D and suppresses its automatic notification while E remains pending. Repeat with direct and nested retrieval, including an outer tool discarding/filtering the selected final result: no model-visible receipt means it remains pending.
- Consume a result through explicit retrieval while automatic delivery is scheduled. Reconcile before delivery to avoid a duplicate notification or an empty jobs-only wake where Pi supports suppression. Exercise failed/ambiguous wake submission and ambiguous delivery receipts: retain pending state and stable identity without rerunning execution. Define and verify the concrete native queue mapping; do not claim private-state or unsupported cancellation capabilities.
- Apply the same arbitration to one/any/all waits without introducing an execution scheduler. With next-natural-turn, display-only, inactive-session, or already-pending resumed-session results, inbox contents alone must not authorize an automatic wake. Observers/gates must not start competing turns. Herdr idle/done observations alone must not produce a successful assignment result.

Also deactivate the originating session with delivery queued or capture/retrieval in flight. Bound best-effort managed cancellation; late callbacks must not append through stale capabilities, wake or deliver into the replacement session, or fabricate a receipt/outcome. On reopen, restore only already-saved metadata/results and retain the next-user-message rule. Do not require completion recording while inactive or crash/forced-kill execution recovery. Unresolved effective gates retain existing owner/user-abandonment semantics.

These are future checks, not passing evidence.
:::
