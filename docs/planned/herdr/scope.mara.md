# Planned Herdr integration and separate jobs module

This records the agreed direction, not an implemented extension or a complete
behavioral contract. Keep it here until the Herdr project is scaffolded, then
relocate it into that project's `docs/` with Mara while preserving item identities.

## Workflow and responsibility boundary

Pi runs inside Herdr. The user and agent can create worktrees, tabs, and panes;
launch other agents or terminal commands; inspect logs; send input; and return
to visible running work. Those agents may themselves launch further agents.
Spawning terminals is sufficient initially: it does not require an additional
agent messaging or delegation service.

| Herdr integration | Separate jobs module |
| --- | --- |
| Worktrees, workspaces, tabs, and panes | Managed execution identity and lifecycle |
| Launching, inspecting, and controlling backend processes | Reconciliation of running, completed, and unknown state |
| Terminal screen reads, input, and navigation/attach | Output records, bounded results, and completion delivery |
| Backend-specific ownership and liveness evidence | Timeout, explicit-wait, and gate-integration policy |

The jobs module tracks executions, not inferred agent assignments. A finite
command can have a verified exit result. A server or interactive Pi process can
remain open and observable without automatically creating a wait for its entire
lifetime. An agent becoming idle, a screen marker, or an unavailable backend is
not by itself proof that assigned work succeeded.

Use the existing [gates contract](../../../packages/gates-protocol/docs/contract.mara.md)
for cross-extension pending-work coordination. The job integration owns result
delivery and recovery ([[REQ-GATES-SIGNAL-ONLY]]); unreconciled work must not become
confirmed empty merely because an owner cannot inspect it
([[REQ-GATES-RECONCILIATION]]). The intended workflow avoids idle-driven `goal`
nudges while required work or its result delivery is pending. Exact delivery,
wait, shutdown, and session-replacement policies still need specifications and
consumer tests; this document does not claim those integrations work.

## Scope limits and later decisions

- No initial requirement for agent messaging, delegation graphs, automatic
  parent-child wait propagation, result synthesis, or a cross-process agent
  orchestration service. A thin agent-specific layer may be added later if needed.
- Do not require a new public jobs protocol, scheduler, or separately published
  jobs package just to implement this workflow. Separate module means a code and
  responsibility boundary inside the future Herdr package initially.
- Consider a reusable library when another extension needs the implementation;
  consider a public jobs protocol when independent extensions need to exchange
  job records. Neither is a prerequisite now.
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

The Herdr integration must have a separate jobs module for managed execution tracking, outcome reconciliation, output/result bookkeeping, completion delivery, timeouts, explicit waits, and gate integration. Herdr resource management and backend-specific launch, inspection, input, and termination remain outside that module. Job policy must be reviewable and testable without real Herdr operations. This requires a module boundary, not a standalone package or public jobs event protocol, and does not require automatic agent-to-agent coordination.
:::

:::mara verification VER-HERDR-JOBS-MODULE
:mid: 01M3PF1WCD40Z697K528G225V1
:title: Inspect the separation of job policy from Herdr operations
:status: accepted
:method: inspection
:verifies: REQ-HERDR-JOBS-MODULE

When implementation exists, inspect the module dependencies and responsibilities: execution identity, reconciliation policy, output/result bookkeeping, delivery, waits, and gate integration reside in the jobs module; Herdr CLI/API calls and worktree/layout operations reside outside it. Confirm job policy has a test seam for supplying execution observations without starting Herdr, and no public jobs protocol or agent messaging service is necessary for launching and tracking a command. This defines future verification; no implementation inspection or runtime test has passed yet.
:::

:::mara decision ADR-HERDR-INTERNAL-JOBS-MODULE
:mid: 01M3PF1ZA5XKR3VWJGW6JDTPJC
:title: Start with an internal jobs module rather than a public jobs protocol
:status: accepted
:justifies: REQ-HERDR-JOBS-MODULE

Keep a separate jobs module inside the future Herdr extension package. This preserves reusable, testable job policy without mixing it into terminal-control code, while avoiding a generic job platform or agent communication layer that the initial workflow does not need. Treat other interactive agents as launched processes initially, not automatically coordinated delegated tasks. Extract a shared library if another extension needs the implementation; introduce a public jobs protocol only if independent extensions need to exchange job records. The earlier standalone pi-jobs-protocol proposal is not a prerequisite for this work.
:::
