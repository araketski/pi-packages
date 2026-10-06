# Planned Herdr integration and separate jobs module

This records the agreed runtime direction, not an implemented integration or a
complete behavioral contract. The Pi factory remains a typed no-op; a bounded
internal public JSON transport seam now exists. See
[the implementation boundary and checks](./scaffold.mara.md).

## Workflow and responsibility boundary

Pi runs inside Herdr. The user and agent can create worktrees, tabs, and panes;
launch other agents or terminal commands; inspect logs; send input; and return
to visible running work. Those agents may themselves launch further agents.
Spawning terminals is sufficient initially: it does not require an additional
agent messaging or delegation service.

The separate jobs module is now planned as `pi-jobs-core`, shared by the local
`pi-jobs` bash execution path and `pi-herdr`. The
[jobs-core contract](../../jobs-core/docs/contract.mara.md) owns the three-package boundary
and distinguishes package releases from the library-reported contract version.
The [Herdr execution and transport contract](./contract.mara.md) owns dedicated-pane
behavior, explicit managed/persistent modes, and the current-local-session public
JSON RPC adapter.

| Herdr integration                                        | Shared jobs module                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Worktrees, workspaces, tabs, and panes                   | Managed execution identity and lifecycle                                  |
| Launching, inspecting, and controlling backend processes | Reconciliation of running, completed, and unknown state                   |
| Terminal screen reads, input, and navigation/attach      | Output records, bounded results, and queued/coalesced completion delivery |
| Backend-specific ownership and liveness evidence         | Timeout, explicit-wait, and gate-integration policy                       |

The jobs module tracks executions, not inferred agent assignments. A finite
command can have a verified exit result. A server or interactive Pi process can
remain open and observable without automatically creating a wait for its entire
lifetime. An agent becoming idle, a screen marker, or an unavailable backend is
not by itself proof that assigned work succeeded.

Use the existing [gates contract](../../gates-protocol/docs/contract.mara.md)
for cross-extension pending-work coordination. The job integration owns result
delivery and recovery ([[REQ-GATES-SIGNAL-ONLY]]); unreconciled work must not become
confirmed empty merely because an owner cannot inspect it
([[REQ-GATES-RECONCILIATION]]). The intended workflow avoids idle-driven `goal`
nudges while required work or its result delivery is pending. The agreed
[lifecycle policy](../../jobs-core/docs/lifecycle.mara.md) requests bounded
best-effort cancellation of owned managed commands on genuine session deactivation
or orderly Pi exit, while retaining explicitly persistent Herdr terminals.
Continued inactive-session job tracking/delivery is not guaranteed. Job cleanup must not close parent workspaces or delete
worktrees. Shared [delivery behavior](../../jobs-core/docs/delivery.mara.md) is specified
separately from consumer-owned [goal](../../goal/docs/jobs-integration.mara.md) and
[caffeinate](../../caffeinate/docs/jobs-integration.mara.md) policies. The originating-session
completion inbox ([[REQ-JOBS-COMPLETION-INBOX]]) belongs to shared jobs delivery:
results can accumulate while the owner works, with one pending wake rather than
one prompt per completion. This is not child-assignment tracking; a Herdr status
event alone does not establish an assignment result. Runner/storage details
and actual lifecycle/consumer integration still need designs and tests; this
document does not claim those integrations work.

## Scope limits and later decisions

- No initial requirement for agent messaging, delegation graphs, automatic
  parent-child wait propagation, result synthesis, or a cross-process agent
  orchestration service. A thin agent-specific layer may be added later if needed.
- The original internal-to-Herdr packaging decision is superseded: local bash
  backgrounding and Herdr executions now both need the shared `pi-jobs-core`
  implementation. Backgrounding a local command preserves its process; it does
  not require opening or migrating execution into a Herdr pane.
- The core exports the owner/observer contract for the unified jobs view. A
  separate `pi-jobs-protocol` package, generic scheduler, and agent messaging
  service remain unnecessary for the initial workflow.
- The future of the legacy tmux extension remains undecided. This direction does
  not authorize its removal or require tmux/Herdr parity before Herdr is useful.

## Agreed knowledge

:::mara goal GOAL-HERDR-VISIBLE-WORKFLOW
:mid: 01M3PF1PE836DM1XYASHQ95G2E
:title: Manage visible agent and terminal work through Herdr
:status: accepted

Support a workflow in which Pi and its user create Herdr worktrees and terminal layout, launch agents and commands there, inspect their output, and revisit or control running work. Required asynchronous work should coexist with goal and caffeinate without confusing an idle Pi with finished work. Launching other agents need not depend on an additional agent communication system.
:::

:::mara requirement REQ-HERDR-JOBS-MODULE
:mid: 01M3PF1SD6Z0V8TVZCBPQHGDQ0
:title: Keep job management separate from Herdr terminal operations
:status: accepted
:kind: constraint
:contributes_to: GOAL-HERDR-VISIBLE-WORKFLOW

The Herdr integration must use a separate jobs module for managed execution tracking, outcome reconciliation, output/result bookkeeping, completion delivery, timeouts, explicit waits, and gate integration. Herdr resource management and backend-specific launch, inspection, input, and termination remain outside that module. Job policy must be reviewable and testable without real Herdr operations. The shared module is supplied by pi-jobs-core for both the local bash and Herdr execution paths, as specified in [[DES-JOBS-PACKAGE-BOUNDARY]]. Its owner/observer contract does not require a separate jobs-protocol package or automatic agent-to-agent coordination.
:::

:::mara verification VER-HERDR-JOBS-MODULE
:mid: 01M3PF1WCD40Z697K528G225V1
:title: Inspect the separation of job policy from Herdr operations
:status: accepted
:method: inspection
:verifies: REQ-HERDR-JOBS-MODULE

When implementation exists, inspect dependencies and responsibilities: execution identity, reconciliation policy, output/result bookkeeping, delivery, waits, and gate integration reside in pi-jobs-core; local process operations and the Herdr public JSON adapter specified by [[DES-HERDR-PUBLIC-JSON-ADAPTER]] reside in their respective execution adapters; worktree/layout operations remain in pi-herdr. Confirm job policy has a test seam for execution observations without starting Herdr, the two extensions use the shared implementation, and no agent messaging service is necessary for launching and tracking a command. The in-runtime owner/observer contract is specified in [[DES-JOBS-PACKAGE-BOUNDARY]]. This defines future verification; no implementation inspection or runtime test has passed yet.
:::

:::mara decision ADR-HERDR-INTERNAL-JOBS-MODULE
:mid: 01M3PF1ZA5XKR3VWJGW6JDTPJC
:title: Start with an internal jobs module rather than a public jobs protocol
:status: retired
:justifies: REQ-HERDR-JOBS-MODULE

The original choice was a separate jobs module inside the future Herdr extension package, with extraction deferred until another extension needed the implementation. The purpose was to preserve reusable, testable job policy without mixing it into terminal-control code or requiring a generic job platform and agent communication layer. This packaging choice is superseded by [[ADR-JOBS-SHARED-CORE]] after local bash backgrounding and explicitly visible Herdr executions established two concrete consumers. The separate jobs responsibility remains required; the implementation now belongs in pi-jobs-core with its in-runtime owner/observer contract. Automatic agent-to-agent coordination remains outside the initial scope.
:::
