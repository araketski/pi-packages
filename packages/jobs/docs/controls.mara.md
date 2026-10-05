# Pi-jobs tools and user controls

The `pi-jobs` extension owns the unified model/user control surface. Producers
continue to own their executions; an observer UI does not acquire ownership or
independently redeliver results. Herdr remains usable without this UI extension.

Use the [shared core contract](../../jobs-core/docs/contract.mara.md),
[lifecycle](../../jobs-core/docs/lifecycle.mara.md), [delivery](../../jobs-core/docs/delivery.mara.md),
and [storage bounds](../../jobs-core/docs/storage.mara.md). Consumer-specific goal and
caffeinate decisions remain in their own planned folders.

The requirements below are not implemented tools or passing Pi-mode tests. Exact
argument schemas, settings keys, UI presentation, and owner-request routing must
be designed and tested within the agreed behavior rather than inferred from the
legacy tmux package.

## Agreed knowledge

:::mara requirement REQ-JOBS-CONTROL-SURFACE
:mid: 01M3PZWZV0HPGFDP1TSJQ1JQHW
:title: Expose atomic namespaced jobs tools and corresponding Pi user controls
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Alongside the replacement model bash tool, expose single-purpose namespaced operations for listing, inspecting, reading output, waiting, stopping, and changing awaiting/delivery settings under [[REQ-PI-ATOMIC-TOOLS]]. Do not funnel unrelated operations through one jobs action-dispatch tool. Provide /jobs user controls for inspecting jobs/output and performing the same control actions without asking the model, using applicable Pi UI components. Show producer identity as required by [[REQ-JOBS-PRODUCER-IDENTITY]]. Use the shared wait, termination, and delivery rules rather than duplicating them in UI code. Registering an observer/control view must not independently take execution ownership or redeliver owner results. Tool and event behavior must not require terminal rendering.
:::

:::mara requirement REQ-JOBS-CONTROL-SCOPE
:mid: 01M3PZX2T24ZAGG51R62ZZ97XH
:title: Default job views to the current session without granting historical control
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

List the current session jobs by default and provide an explicit option to inspect other sessions stored jobs. Historical visibility is not control authority: viewing a record does not restart execution, take ownership, or authorize stopping an unrelated process. Keep producer and originating-session identity visible. An explicit stop-awaiting action may release the wait without claiming successful execution or verified termination; an unresolved job stays visibly unresolved.
:::

:::mara requirement REQ-JOBS-NATIVE-USER-BASH
:mid: 01M3PZX5RCNX79NNQ47ABZ0P91
:title: Leave manually entered user bash commands under native Pi control
:status: accepted
:kind: constraint
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

Initially replace only the model bash tool. Leave user-entered ! and !! commands on native Pi user-bash execution rather than intercepting them into managed jobs. Do not unexpectedly background manually entered commands or change the context-exclusion behavior of !!.
:::

:::mara requirement REQ-JOBS-RUNTIME-SCOPE
:mid: 01M3PZX8NF2XPQ1HGE6V3JA21D
:title: Keep initial jobs support explicit and avoid extra schedulers or session-writer coordination
:status: accepted
:kind: constraint
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

The initial pi-jobs support and verification target is Linux; macOS and Windows remain unverified until tested. Use the same job semantics in interactive, print, JSON, and RPC modes without requiring a UI or silently keeping Pi alive indefinitely. Apply [[REQ-PI-NONUI-AWAIT]] in non-UI modes: selected awaited work and required result delivery prevent premature run completion, without requiring a separate wait call. This is deliberate, observable waiting under the operation contract, not a hidden indefinite keepalive for every background resource. Orderly application exit requests bounded best-effort cancellation of owned managed work; an assistant saying it is waiting must not cause that exit prematurely. Initially add no separate running-job count limit or implicit execution queue. Required tracking/output establishment under [[REQ-JOBS-STORAGE-FAILURE]] still precedes launch, but there is no aggregate quota, completion reservation or quota-pressure admission/eviction. Genuine deactivation uses bounded best-effort cancellation under [[REQ-JOBS-SESSION-CONTINUITY]]; orderly exit follows [[REQ-JOBS-EXIT-CLEANUP]]. Multiple Pi instances writing one session are unsupported and remain the user responsibility; do not add a session lock manager, leader election, or special second-instance observer mode for that case. This does not remove ordinary ownership checks or each job's 10,000,000-byte output ceiling.
:::

:::mara verification VER-JOBS-CONTROLS
:mid: 01M3PZXBJQXTQ3J133NTK2RJ8G
:title: Exercise model and user controls across producer and session boundaries
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-CONTROL-SURFACE
:verifies: REQ-JOBS-CONTROL-SCOPE
:verifies: REQ-JOBS-WAIT-SELECTION

With local, Herdr, and external-producer fixtures, exercise the namespaced atomic jobs tools individually and composed, and /jobs controls for list/inspect/output/wait/stop and await/delivery changes. Preserve producer/job/session identity through records and results. Default to current-session jobs; explicitly inspect another session without thereby gaining ownership or rerunning work. Exercise one/any/all waits, concurrent completions, unconfirmed state, and timeout returning status without stopping jobs or disabling delivery. Final-result retrieval counts as delivery only with the model-visible receipt required by [[REQ-JOBS-DELIVERY-RECEIPTS]]; incremental logs and discarded nested results do not. Explicitly stop awaiting an unknown job and retain its honest unresolved status. Confirm observer registration does not duplicate delivery or acquire execution ownership. These checks require Pi tool/UI integration, not just a shared-library fixture, and have not run.
:::

:::mara verification VER-JOBS-RUNTIME-SCOPE
:mid: 01M3PZXEHNCZQ0A64JSKEZP20T
:title: Verify native user bash and non-interactive lifetime behavior
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-NATIVE-USER-BASH
:verifies: REQ-JOBS-RUNTIME-SCOPE

On Linux, exercise model bash replacement while ! and !! retain native Pi handling and context behavior. Test interactive, print, JSON, and RPC tool/event paths independently of terminal rendering. Follow [[VER-PI-NONUI-AWAIT]]: a reviewer-shaped run with awaited delayed work must receive and consume its final result before normal successful completion, even without a separate wait call or active goal. Separately request actual host exit/cancellation with managed work pending and verify normal-exit cleanup; persistent non-awaited/display-only resources do not force a wait. Exercise several concurrent jobs without an added count scheduler or aggregate quota, while enforcing required tracking/output setup and per-job bounds. Switch/new/fork replacement triggers bounded best-effort managed cancellation even when cleanup cannot be confirmed; do not block replacement indefinitely or fabricate terminal state. Saved running records do not prove liveness, and crash/forced-kill cleanup and recovery are outside acceptance. Inspect that documentation does not claim untested platform support or same-session concurrent-writer guarantees, and no special writer-coordination layer is introduced. Ordinary process-ownership protections remain covered by shared lifecycle verification. These are future checks, not passing evidence.
:::
