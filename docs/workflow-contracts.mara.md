# Self-contained workflow contracts

Shared workflow abstractions standardize interaction regardless of who supplied
a gate or job. This is a boundary rule, not a request for an additional protocol
package or a claim that all planned APIs exist.

Producer identity may be preserved and displayed for the user, the agent, and
diagnostics. It remains opaque to consumer behavior. Generic correlation and
routing by contract-defined identity are not producer-specific policy; inspecting
another extension's internals or branching on its package/name is.

Owners decide what they publish through their abstraction. For example, job owners
decide when work is gated; goal and caffeinate consume that same gates contract
without inspecting job phases, executors, or delivery modes. When no gates remain,
each consumer applies its own normal behavior.

## Agreed knowledge

:::mara requirement REQ-WORKFLOW-PRODUCER-INDEPENDENCE
:mid: 01M3Q32QH7Y3ZNPZZ17X4V86WC
:title: Standardize gate and job interaction independently of their producers
:status: accepted
:kind: constraint
:derives_from: REQ-GATES-SIGNAL-ONLY
:derives_from: REQ-JOBS-PRODUCER-IDENTITY

Gate and job consumers must interact solely through the corresponding public contract. Equivalent contract state and capabilities must produce equivalent consumer decisions regardless of the supplying extension. Consumers must not inspect producer-specific internals, infer private state, require known producer names, or special-case behavior by producer identity. Contract-defined identity remains usable for generic correlation and request routing, and producer metadata may be preserved and displayed for users, agents, and diagnostics without becoming consumer policy.

Owners map their own work into the abstraction and remain responsible for their implementation. Goal and caffeinate consume the same generic gates, not the jobs contract or backend state. Job consumers use the common jobs contract, not local-process or Herdr-specific inspection. No additional protocol package or gate-purpose distinction is required.
:::

:::mara verification VER-WORKFLOW-PRODUCER-INDEPENDENCE
:mid: 01M3Q32TGWV07PV2G9PK4ZMBMJ
:title: Verify interchangeable producers at the gate and job consumer boundaries
:status: accepted
:method: test
:level: integration
:verifies: REQ-WORKFLOW-PRODUCER-INDEPENDENCE

Feed actual gate consumers equivalent contract states from repository and previously unknown conforming producers; assert identical continuation and inhibition decisions without importing jobs-core or inspecting backend state. Feed actual job consumers equivalent states and declared capabilities from local, Herdr, and external owner fixtures; assert identical observation and control behavior without producer-name branches. Preserve distinct opaque identities for routing and presentation without treating labels as authority. Review consumer dependencies and adapters for private-state inspection or hardcoded producer assumptions. Actual producer/consumer integration tests remain necessary in addition to interchangeable fixtures. These are future checks, not executed verification.
:::

:::mara requirement REQ-PI-ATOMIC-TOOLS
:mid: 01M3RX8G4J61ABD7YE0N0DV68S
:title: Expose composable namespaced operations through native Pi tooling
:status: accepted
:kind: constraint
:derives_from: REQ-JOBS-CONTROL-SURFACE
:derives_from: REQ-GOAL-CONTROLS
:derives_from: REQ-HERDR-RESOURCE-CONTROLS

Every model-facing tool supplied by a repository package must be a namespaced, single-purpose operation with its own argument/result contract, rather than a giant action-dispatch tool. Atomic here means a coherent composable operation; it does not invent transaction guarantees beyond that operation's contract. Preserve useful set-valued operations such as an explicit wait selection without combining unrelated actions. This rule does not require adding model tools to packages that provide only user commands or libraries. User command families such as /jobs and /goal may remain convenient grouped interfaces.

Use globally unique tool registration names within the combined package surface, with a package prefix and operation suffix: `jobs_*`, `goal_*`, and `herdr_*` for the corresponding tools. Retain native namespace metadata alongside those names; namespace metadata groups tools but does not qualify their registration keys or prevent collisions. The intentional native bash replacement keeps the exact name `bash` rather than a prefixed alias. Per-operation suffixes and argument/result schemas remain public API design work.

Use native Pi namespaces, structured results/errors, discovery and composition rather than a new tool broker. Keep managed bash directly available as the native bash replacement, unless explicitly disabled. Use native on-demand discovery for other tools when enabled and available; otherwise provide direct exposure, without overriding explicit tool disabling. Do not automatically enable codemode/tool search, rewrite user settings, or treat built-in availability as guaranteed in SDK or --no-extensions configurations. Demonstrate the concrete prefixed registration surface, bash replacement identity, direct/deferred exposure and explicit disabling through public Pi APIs before implementation. The limited host observations in [[EVD-PI-0991-NATIVE-PROBES]] inform that design but do not prove package conformance.

Direct and nested calls share each operation's validation, ownership, cancellation, waiting and delivery obligations. Native annotations are hints, not authorization, and nested invocation is not proof of model-visible delivery. Preserve [[REQ-JOBS-DELIVERY-RECEIPTS]], [[REQ-JOBS-CANCELLATION-BOUNDARY]], and [[REQ-WORKFLOW-PRODUCER-INDEPENDENCE]].
:::

:::mara verification VER-PI-ATOMIC-TOOLS
:mid: 01M3RX8K64ZEGGR8XAB99R8HEW
:title: Verify atomic tool namespaces discovery fallback and native composition
:status: accepted
:method: test
:level: integration
:verifies: REQ-PI-ATOMIC-TOOLS

For each supplied tool package, inspect actual prefixed registration names, native namespace metadata, schemas and structured results/errors. Load the packages together to check unique `jobs_*`, `goal_*` and `herdr_*` names, the exact bash replacement and absence of a multiplexed action tool. Show normal direct use, enabled native discovery/composition and direct fallback without re-enabling explicitly disabled resources.

Check a representative explicit tool exclusion and invalid argument through both direct and nested paths: neither may execute the operation. Preserve ownership/cancellation/receipt obligations under composition; an outer successful script does not turn an inner error into success or discarded output into delivery.

Use actual supported Pi setup, including explicit SDK built-in configuration, and a normal path in each claimed supported mode. Under [[ADR-WORKFLOW-MINIMAL-PROFILE]], do not require every operation × mode × discovery × producer combination or freeze the whole tool surface before an independently useful slice. No settings mutation or private broker is required. These are future checks, not host-probe evidence of package conformance.
:::

:::mara requirement REQ-PI-NONUI-AWAIT
:mid: 01M3S4BTB7PPCBVXPPZKBDAEJG
:title: Keep non-UI runs pending for awaited work and required result delivery
:status: accepted
:kind: functional
:derives_from: REQ-JOBS-RUNTIME-SCOPE
:derives_from: REQ-GOAL-CONTINUATION

Non-UI runs must not finish merely because the assistant says it is waiting while current-session work is still awaited. Apply this to print, JSON, RPC and SDK integrations, including ordinary review/task runs without an active goal or --goal flag. Awaiting selected by the operation contract, including managed-command defaults, is sufficient; correctness must not depend on the model remembering a separate wait call or on another CLI waiting flag.

Keep the native run pending until the relevant awaited work reaches an established outcome and its required model-directed final result is delivered, allowing the model to consume it and finish the task. Waiting must not require repeated model polling, claim completion from queued delivery, or rerun the work. Preserve [[REQ-JOBS-DELIVERY-RECEIPTS]] and [[REQ-WORKFLOW-PRODUCER-INDEPENDENCE]]. Reuse public native scheduling/lifecycle boundaries, not a new scheduler or consumer dependency on producer internals. Do not let unrelated inactive-session work or explicitly persistent non-awaited/display-only services keep every invocation alive.

Remain cancellable and honor errors and configured limits. An aborted, paused, budget-limited, or failed operation is not successful completion; preserve honest unresolved state and apply normal lifetime cleanup when the host actually exits. RPC/SDK hosts still own their process lifetime; reporting a run finished must not overlook its awaited obligations. This policy revises the earlier non-UI requirement for callers to explicitly invoke a wait. Exact cancellation integration, supported native outcome reporting, the explicit-resume integration after needs-attention, and remaining delivery-mode interactions still require design and verification; this is not permission to invent completion, promote next-turn/display-only results to automatic delivery, or claim an implemented keepalive.

In one-shot print/JSON runs, reject the requested combination of awaited work and next-natural-turn delivery. Validate before launching new work or applying an awaiting/delivery change to existing work; rejection leaves existing work and its settings intact. Automatic delivery remains the finite-command default. Do not silently switch delivery modes, turn awaiting off, or schedule a turn to make an incompatible selection appear valid. This restriction does not remove next-turn support in interactive/RPC/SDK use or ban display-only delivery.

For non-UI runs, if an owner relevant to current-session awaited obligations remains unknown/unconfirmed after normal discovery/reconciliation times out, report an explicit needs-attention diagnostic and stop further autonomous progression rather than keep waiting indefinitely for that unknown owner. Preserve its unresolved gates and honest work state. Reconciliation timeout is neither an execution deadline nor proof of owner death, process termination, successful completion or delivery. Do not force-clear gates, automatically stop awaiting, cancel work solely because of this timeout, or let unrelated inactive-session owners determine the current run's outcome. Known, responsive owners with ongoing awaited work still follow the normal waiting policy. Normal owned-work cleanup applies if Pi actually exits; RPC/SDK hosts retain process-lifetime control. For an active goal, this needs-attention stop pauses goal autonomy until explicit /goal resume under [[REQ-GOAL-PAUSE-RECOVERY]], even if the owner subsequently recovers. Independent execution and result delivery remain unaffected by the goal pause.

Report truthful terminal reasons for completed versus paused, blocked/needs-input, budget-limited, aborted and errored runs through supported native output. The user dropped extension-controlled exit-code mapping where Pi does not expose it: on the inspected 0.99.1 surface, no custom unfinished/error exit mapping is required. Preserve native exit behavior rather than forcing termination, forging provider errors, changing process-global policy, adding a wrapper/host fork, or waiting for a new SDK API. Structured terminal reporting is likewise limited to current public capabilities; use honest diagnostics where no dedicated native outcome surface exists. SDK/RPC hosts retain lifecycle control. A completed review may contain findings; native exit success is not a clean-review verdict or proof that every test passed. This omission does not authorize false completion or weaken result-receipt and awaited-work checks in supported execution modes.
:::

:::mara verification VER-PI-NONUI-AWAIT
:mid: 01M3S4BXJCQY7NJ4WF3D54S2C2
:title: Verify non-UI awaited work result consumption and cancellable settlement
:status: accepted
:method: test
:level: integration
:verifies: REQ-PI-NONUI-AWAIT

Reproduce a reviewer-shaped run with a controlled provider and actual public Pi lifecycle: launch delayed awaited work, return its running identity, and let the assistant say it is waiting without a separate wait call or active goal. For each claimed supported print/JSON/RPC/SDK path, require final-result delivery into provider context and the model's final response before successful settlement. No repeated model polling, execution rerun or hidden hold for persistent non-awaited/display-only services is allowed.

Check one explicit abort/shutdown while work is pending, with an external fixture deadline, truthful unfinished reporting, owned best-effort cleanup and preserved native protocol framing/host lifetime. A representative stale callback cannot settle another session. Use controlled generic owners for one unresponsive-owner reconciliation timeout: report needs-attention, retain unresolved gates/outcomes and pause an active goal until explicit resume. Known pending work remains a normal wait, not a forced timeout cancellation.

In one-shot print/JSON, reject awaited plus next-natural-turn before launching or changing existing settings; no silent delivery promotion, awaiting opt-out or workaround turn. Confirm the normal automatic path still works. Other modes retain their explicitly selected next-turn behavior.

Follow [[ADR-WORKFLOW-MINIMAL-PROFILE]]: representative native positive/error/safety paths are required, not every producer/directness/discovery/mode/timeout race combination. Preserve native exit behavior and honest diagnostics; no extension-controlled exit mapping, forged provider error, forced termination, private API or host fork is required. These are future integration checks, not passing host-probe conformance.
:::

:::mara decision ADR-WORKFLOW-MINIMAL-PROFILE
:mid: 01M481RFW1BHG5KJA9Z71RHB73
:title: Deliver normal personal-tooling workflows before speculative hardening
:status: accepted
:justifies: REQ-WORKFLOW-PRODUCER-INDEPENDENCE
:justifies: REQ-GOAL-CLASSIFIERS
:justifies: REQ-CAFFEINATE-MODES-AND-LIFETIME
:justifies: REQ-JOBS-COMPLETION-INBOX
:justifies: DES-HERDR-PUBLIC-JSON-ADAPTER

The user selected a minimal, practical implementation profile for the whole remaining workflow plan, not only storage. First make normal developer use work end to end. Investigate and fix additional edge cases when observed; do not turn hypothetical failures into mandatory infrastructure or exhaustive acceptance campaigns.

Keep the agreed useful features: one local command across foreground/background handoff; saved results and ordinary delivery batching; explicit local Herdr resources and managed/persistent execution; branch-local goals with an evidenced checklist, guarded continuation, native classifier/fallback and optional budgets; generic gate inspection/recovery; and Linux inhibition under manual control. Preserve independent package boundaries and public native Pi/Herdr integration. Do not add schedulers, agent orchestration, crash recovery, continuous monitoring of inactive jobs, transactional persistence, or cross-process coordination to make this first workflow possible.

Use simple component-local state and ordinary serialized updates where appropriate. The completion inbox still supports overlapping jobs and one shared pending wake; storage still assumes serialized same-job mutations. No generic locks, durable acknowledgement/retry framework, or adversarial object/interleaving support is implied. Existing concrete public interfaces and compatible-version obligations remain intact.

Acceptance requires positive real workflows, representative basic errors, and focused safety checks. Keep truthful outcomes and missing-output diagnostics, bounded output/context, required initial admission checks, original-session routing, fresh callbacks, confirmed model-visible receipts, owned cancellation, and protection of unrelated processes/worktrees/user data. Do not retry ambiguously applied mutations, rerun execution to repair delivery, mistake a saved record for liveness, or clear another owner's wait. Preserve regressions for observed defects and existing executor/process-control safeguards; simplification is not permission to remove them.

Future verification lists are bounded acceptance examples, not a Cartesian product of every mode, producer, lifecycle transition and injected failure. Demonstrate each claimed supported mode with a normal path; concentrate integration on the actual local/Herdr/Goal/Caffeinate workflow and use focused fixtures for basic errors and safety boundaries. Do not require randomized stress, exhaustive fault/reentrancy matrices, new model-calibration campaigns, every provider's retry/cancellation behavior, or recovery after partial writes as first-delivery gates. Unsupported public-host combinations are reported honestly, not implemented through private APIs or a host fork.

Goal retains the explicitly selected applicable-refusal veto, explicit resume after a blocked/user-aborted pause, evaluated model-specific provisional profile, and no force-complete bypass. Implement one bounded assessment with relevant supplied evidence and a simple latest-review/revision check; multi-batch review and automatic artifact-crawling machinery are deferred. Missing assessment context is not approval. Native unavailability/failure fallback remains visible and does not fabricate a positive review. No classifier cost-management subsystem or new provider setup is required.

This choice revises intended implementation and future acceptance scope only. It neither implements the remaining packages nor retroactively verifies revised intent using old tests, synthetic classifier evidence, or accepted scaffold increments. Runtime changes, launches, integration, publication and cleanup require their separate authorization.
:::
