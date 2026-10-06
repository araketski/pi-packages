# Planned Herdr execution and transport

This refines the [Herdr scope](./scope.mara.md). It is an accepted runtime plan, not a
working integration, a verified transport, or a migration of legacy behavior.
The package is now a typed no-op [scaffold](./scaffold.mara.md).

Use [jobs-core](../../jobs-core/docs/contract.mara.md) for shared lifecycle, result delivery,
reconciliation, storage bounds, and producer identity. The agent/caller explicitly
selects execution mode, awaiting, and delivery; the extension does not infer these
from command names or text. Worktree and layout management remain Herdr features,
not generic job lifecycles or inferred agent assignments.

## Public JSON API, not the private UI protocol

Use the public newline-delimited JSON socket API for the long-lived local adapter.
Its lifecycle subscriptions fit ongoing pane/workspace tracking. Use CLI commands
for manual diagnostics or genuinely CLI-only operations, not an automatic fallback
after a possibly applied RPC mutation. This choice is not a latency benchmark.

The [v0.9.1 socket documentation](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.1/docs/next/website/src/content/docs/socket-api.mdx)
describes `events.subscribe`, `session.snapshot`, bootstrap ordering, reconnect
resnapshots, and unsupported-method handling. The
[matching CLI reference](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.1/docs/next/website/src/content/docs/cli-reference.mdx)
explains that CLI control wrappers use the same socket API. Earlier 0.8.2 behavior
experiments are not proof of current-release conformance.

During this planning discussion, read-only `herdr --version`, `herdr status`, CLI
help, and bundled schema inspection observed client/server 0.9.1, private protocol
22, and endpoint generation 1. No new execution experiment, RPC implementation,
subscription reliability test, or performance benchmark was run. The private
protocol number is not our JSON-adapter compatibility policy; verify the selected
public methods/capabilities against the actual supported running server.

## Verification boundary

Backend request success is not finite-command completion. Use owned structured
execution evidence and saved results; screen sentinels, agent idle/done status,
missing panes, and unavailable backends alone do not prove command outcomes.
Define and test launch/result recording, process ownership, pane moves, teardown,
and reconnect races before implementing each corresponding behavior.

## Agreed knowledge

:::mara requirement REQ-HERDR-MANAGED-COMMANDS
:mid: 01M3Q03X5B6H5E5584BB32D079
:title: Launch managed commands in dedicated panes and retain their results
:status: accepted
:kind: functional
:contributes_to: GOAL-HERDR-VISIBLE-WORKFLOW

Create a dedicated pane by default for an explicitly requested Herdr managed command rather than submitting it into a potentially busy existing pane. Initially, existing-pane operations provide explicit inspection/input controls without claiming arbitrary typed input is a reliably tracked command job. Keep completed managed-command panes for inspection by default, with configurable automatic closing; closing a pane must not erase the saved job result. Track the execution and its pi-herdr producer identity independently of presentation/pane movement. Use trustworthy command outcome evidence; pane disappearance, a screen sentinel, or agent idle/done state alone cannot establish success or release an execution wait.
:::

:::mara requirement REQ-HERDR-EXPLICIT-LIFETIME
:mid: 01M3Q0404Z02GBK5HBSF8X1HC6
:title: Let callers choose managed or persistent Herdr execution without heuristics
:status: accepted
:kind: functional
:contributes_to: GOAL-HERDR-VISIBLE-WORKFLOW

The agent or other caller explicitly selects how to run. Finite managed commands default to awaited work with automatic delivery; explicitly persistent servers or interactive agents default to not awaited with display-only delivery. Awaiting and delivery remain explicitly overridable under [[REQ-JOBS-CONFIGURATION]]. Do not classify a command as an agent, server, watcher, finite task, or persistent resource from its executable name, text, or screen state. Visibility and blocking a tool call are independent choices. Genuine session deactivation follows [[REQ-JOBS-SESSION-CONTINUITY]] and orderly exit follows [[REQ-JOBS-EXIT-CLEANUP]]: attempt bounded best-effort cancellation of owned managed commands, retain explicitly persistent terminals, and never close parent workspaces or delete worktrees. Explicit persistence is the separately selected backend lifetime, not automatic unmanaged detachment or a guarantee of inactive-session jobs tracking/result delivery.
:::

:::mara requirement REQ-HERDR-LOCAL-SCOPE
:mid: 01M3Q0433PRT5PKFTFQVXP0A1T
:title: Target only the current local Herdr session and fail visibly when unavailable
:status: accepted
:kind: constraint
:contributes_to: GOAL-HERDR-VISIBLE-WORKFLOW

Initially support the current local Herdr session from a Herdr-managed Pi context, with Linux as the supported verification target. macOS and Windows remain unverified; remote machines, SSH forwarding, and cross-server orchestration are outside initial scope. Resolve the inherited local endpoint/caller context and explicit resource IDs rather than whichever pane another client has focused. If Herdr or a required capability is unavailable, fail the requested Herdr operation clearly; do not silently execute locally, retarget another server, or stop/update/restart a user server to make it work. Missing backend state leaves job outcomes honest and unconfirmed. Shared normal-exit and non-interactive job semantics still apply; this extension does not secretly keep Pi alive indefinitely or add a separate job-count scheduler.
:::

:::mara design DES-HERDR-PUBLIC-JSON-ADAPTER
:mid: 01M3Q04628M7HDRYJETJA69A3D
:title: Use a thin public JSON socket adapter with event and snapshot reconciliation
:status: accepted
:kind: interface
:satisfies: REQ-HERDR-JOBS-MODULE
:satisfies: REQ-HERDR-MANAGED-COMMANDS
:satisfies: REQ-HERDR-LOCAL-SCOPE

Implement the local Herdr adapter through the public newline-delimited JSON socket API, not the private binary/TUI protocol. Use explicit IDs and inherited endpoint context, validate structured responses/events, and surface unsupported methods as normal errors. Subscribe to relevant lifecycle events, wait for subscription acknowledgement, buffer events while obtaining the bootstrap snapshot, then reconcile the snapshot and buffered stream. After disconnect or suspected stale state, reconnect and resnapshot rather than assuming lost events will replay. Preserve stable job/producer identity while updating backend pane references after movement. Use bounded request handling and explicit failure states. Do not blindly retry mutating requests after an ambiguous failure or automatically fall back to CLI/local execution: a missing reply does not prove a command or pane creation was not applied. CLI remains available for diagnostics or genuinely CLI-only operations. Keep job lifecycle/delivery policy in the core; transport events are evidence inputs, not authoritative command exit results.

### Thin transport increment

The source-only internal seam is `extensions/herdr/transport.ts`; the package still exports only metadata and its Pi factory registers nothing. It supplies `resolveLocalContext(env)`, `HerdrTransport(context, options?)`, `connect()`/explicit `reconnect()`, `close()`, `view()`, `currentPane()`, `getPane(paneId)`, `renamePane(paneId, label|null)` and `movePane(paneId, destination)`. Move destinations are a new workspace, a new tab with an explicit workspace ID, or an existing tab with an explicit target pane and split direction. Moves always send `focus:false`. No general arbitrary-method API, execution, job identity assignment or model-tool registration is introduced.

`resolveLocalContext` requires `HERDR_ENV=1`, an absolute inherited `HERDR_SOCKET_PATH`, and nonempty inherited workspace/tab/pane IDs. It does not derive a default socket from config or select a machine/session. The captured endpoint never changes. `currentPane` sends `caller_pane_id` from that context to `pane.current`, allowing Herdr to resolve a moved process's inherited caller alias. Other pane requests require a nonempty explicit ID; an old moved public ID is not treated as a general target alias.

Connect opens a dedicated `events.subscribe` socket for `pane.created`, `pane.updated`, `pane.moved`, `pane.closed` and `pane.exited`. Require the matching request ID and `result.type=subscription_started` before calling `session.snapshot` on a separate connection. Buffer validated lifecycle events until the snapshot's pane projection is installed, then apply them in arrival order. The view contains version/protocol diagnostics, state (`disconnected`, `connecting`, `ready` or `stale`) and panes keyed by server-owned stable `terminal_id`; pane/workspace/tab IDs change with movement. Snapshot replacement on explicit reconnect preserves those stable terminal keys without assuming event replay. This is a pane topology/label projection, not a full workspace/layout cache or continuous agent-state tracker. `pane.exited` is only an observation, not a command exit result.

The supported wire methods are exactly `events.subscribe`, `session.snapshot`, `pane.current`, `pane.get`, `pane.rename` and `pane.move`. Requests use unique string IDs and one JSON line. Responses must match their request ID and have exactly one structured result or error. Expected result tags are `subscription_started`, `session_snapshot`, `pane_info`, `ok` and `pane_move`; validate the fields consumed by this projection and preserve unknown server fields. Structured server errors retain `code`/`message`, including unsupported-method errors. No private protocol-number equality gate is imposed.

Default connect/request deadline is 5 seconds, maximum incoming JSON line is 1 MiB and bootstrap buffer is 256 events. Invalid frames/replies/events, disconnect, timeout or buffer overflow fail visibly and leave a stale view; an explicit reconnect makes a new subscription and snapshot at the same captured endpoint. Each query/mutation uses a separate short-lived socket, without retries. A mutation written to the socket with no valid reply reports `ambiguous:true`; this means it may have applied, including after malformed replies. A valid server rejection is not ambiguous. A rename acknowledgement is followed by an explicit pane query to refresh the view; failure of that query does not undo the acknowledged mutation. No CLI/local fallback, server restart, polling recovery loop, replay guarantee or completion synthesis exists. A snapshot is not transactional with the stream; if the projection may be stale, explicitly resnapshot rather than promising total ordering across independent server connections.

Observable acceptance is normal connect/query/rename/move/reconnect against isolated Linux Herdr 0.9.1 plus controlled fixtures for acknowledgement ordering, bootstrap arrivals, stable terminal identity, unsupported methods, malformed replies and an applied mutation with a lost reply. Other resource controls and execution contracts remain future increments.
:::

:::mara decision ADR-HERDR-PUBLIC-JSON-RPC
:mid: 01M3Q0491S7BCHFNCHG5CKQYP7
:title: Prefer public JSON RPC for the long-lived local integration
:status: accepted
:justifies: DES-HERDR-PUBLIC-JSON-ADAPTER

Choose direct public JSON socket RPC over spawning a CLI wrapper for every control query because this extension needs long-lived lifecycle subscriptions and snapshot reconciliation, not just isolated shell automation. Both expose the same Herdr control surface; direct access avoids per-operation subprocess launches and CLI argument/output adaptation, but no measured latency advantage is claimed. Do not use the private binary UI protocol or build a generic RPC framework. Limit initial integration to the current local session; remote artifact storage, cancellation, and recovery require a separate agreed contract. The installed 0.9.1 schema and matching documentation are design inputs, not evidence that our adapter works.
:::

:::mara verification VER-HERDR-EXECUTION-POLICY
:mid: 01M3Q04C1RD805SPEGEY819Z0K
:title: Exercise explicit managed and persistent execution in isolated Herdr sessions
:status: accepted
:method: test
:level: integration
:verifies: REQ-HERDR-MANAGED-COMMANDS
:verifies: REQ-HERDR-EXPLICIT-LIFETIME
:verifies: REQ-HERDR-LOCAL-SCOPE

In an isolated local Herdr session on Linux, create a managed command while an existing pane is busy: use a dedicated pane and do not inject execution into the busy one. Verify success/nonzero structured results, pane retention by default, configurable closing without loss of saved results, and stable producer/job identity through pane movement. Explicit existing-pane input must not masquerade as a tracked command result. Use identical command text with different explicit lifetime/await/delivery choices and verify no heuristic classification; managed defaults are awaited/automatic and persistent defaults non-awaited/display-only. Exercise genuine session deactivation and orderly Pi exit, including non-interactive operation: attempt owned managed cancellation while preserving explicitly persistent terminals, unrelated work and parent resources. Include unconfirmed/stalled cleanup and require bounded transition handling with honest uncertainty, not fabricated cancellation or guaranteed inactive result capture. Crash/forced-kill survivor cleanup/recovery is outside scope. Simulate missing panes, fake screen markers, unknown agent state, and unavailable Herdr without invented outcomes, local fallback, server restart, or remote targeting. Repeat required backend observations against the selected current release instead of treating old 0.8.2 experiments as coverage. These are future checks, not passing evidence.
:::

:::mara verification VER-HERDR-JSON-TRANSPORT
:mid: 01M3Q04F0YBT3ZXMZZ8DZ6J3FN
:title: Verify subscription bootstrap, reconnects, and ambiguous mutation handling
:status: accepted
:method: test
:level: integration
:verifies: DES-HERDR-PUBLIC-JSON-ADAPTER
:verifies: REQ-HERDR-LOCAL-SCOPE

Against an isolated supported real local Herdr server, demonstrate public JSON RPC through inherited endpoint context and explicit IDs, subscription acknowledgement, bootstrap snapshot plus buffered events, a pane move and ordinary disconnect/reconnect resnapshot. Confirm UI focus does not retarget requests and unsupported capabilities fail visibly.

Use controlled socket fixtures for an invalid reply and one applied mutation whose response is lost: preserve uncertainty without blind resubmission, CLI/local fallback or fabricated command completion. Do not use the private protocol or restart the user's server. Under [[ADR-WORKFLOW-MINIMAL-PROFILE]], exhaustive event/reconnect/mutation permutations, remote support and generic RPC/recovery infrastructure are deferred. CLI/schema reads alone are not working-adapter evidence. These checks have not run.
:::

:::mara requirement REQ-HERDR-RESOURCE-CONTROLS
:mid: 01M3Q64SHX624KRP1RH6RPCM1V
:title: Expose current-local Herdr resource and terminal controls through its native capabilities
:status: accepted
:kind: functional
:contributes_to: GOAL-HERDR-VISIBLE-WORKFLOW

Provide Pi-facing controls for the agreed local workflow: create/list/inspect and explicitly navigate or manage worktrees, workspaces, tabs, and panes; launch explicit commands or agents; read terminal output; send explicit input; and revisit/control the selected running resources. Use the public supported Herdr capability surface and explicit IDs, not inferred UI focus. Preserve caller focus unless navigation/focus was explicitly requested. Existing-pane input remains terminal control, not proof of a managed job launch or outcome. Keep backend resource operations in pi-herdr and managed job policy in pi-jobs-core. Specify concrete tool arguments and supported native operations before implementing each slice; unsupported capabilities fail clearly rather than being invented or silently substituted.

Expose any model-facing resource operations as composable atomic namespaced tools under [[REQ-PI-ATOMIC-TOOLS]], not one multiplexed Herdr action tool. This does not change explicit resource authority, focus preservation, or the separation of existing-pane input from tracked execution.
:::

:::mara requirement REQ-HERDR-NO-APPROVAL-LAYER
:mid: 01M3Q64WGEZZNX9QWHKJF2XT2D
:title: Do not add an extension-specific approval policy to Herdr operations
:status: accepted
:kind: constraint
:contributes_to: GOAL-HERDR-VISIBLE-WORKFLOW

Do not invent a permission store, approval policy, or extra confirmation layer around explicit Herdr tool operations. Execute supported explicit resource requests through the native backend and surface its errors, including native destructive-operation safeguards. Do not silently turn a failed request into a forced mutation, retarget/restart a server, or retry an ambiguous mutation. Explicit backend-supported options belong to the requested operation, not a new extension authorization framework. This does not weaken the separate automatic job-cleanup contract: normal-exit cleanup still must not delete worktrees, close parent workspaces, or terminate merely observed work. Development/test agents also remain subject to their own harness instructions and isolated-test boundaries.
:::

:::mara verification VER-HERDR-RESOURCE-CONTROLS
:mid: 01M3Q64ZDR89J07THEJP6Y5X5F
:title: Verify explicit resource operations without an invented approval framework
:status: accepted
:method: test
:level: integration
:verifies: REQ-HERDR-RESOURCE-CONTROLS
:verifies: REQ-HERDR-NO-APPROVAL-LAYER

Use structured adapter fixtures and an isolated real local Herdr session for worktree/workspace/tab/pane management, explicit navigation, command/agent launch, output reads, and input controls. Verify explicit identifiers and preserved focus by default. Exercise supported explicit closing/removal requests without extension approval prompts, and native refusal/error paths without automatic force escalation or blind retries. Keep existing-pane input distinct from managed execution evidence. Separately verify that automatic job cleanup never performs these parent-resource removals. Do not mutate the live user server or unrelated worktrees. These are future checks, not executed tests.
:::
