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

For each package that supplies model tools, inspect registration and exercise single-purpose namespaced operations individually and composed through native Pi facilities. Reject an action-dispatch catch-all replacing the atomic surface; preserve explicit multi-job selections and user command families. Check schemas, structured success/error results, namespace/name collisions, direct calls and nested calls, and the same ownership/cancellation/delivery rules across both paths. Load the package tools together and assert globally unique `jobs_*`, `goal_*` and `herdr_*` registration names plus namespace metadata, even when operation suffixes match. No operation may silently shadow another because only its namespace differs. Excluding an exact prefixed tool name must block both direct and nested execution.

Verify managed bash retains native replacement behavior and direct availability, with namespacing that actually works through the public host contract. Test native discovery enabled, absent, and explicitly disabled; other operations remain directly usable where appropriate without re-enabling explicitly disabled tools or mutating user settings. Include SDK sessions with explicit native-extension setup and configurations without built-ins, plus interactive/print/JSON/RPC entry points. Native tool inactivity/exposure must not be mistaken for an authorization boundary; document and test the actual disablement semantics. Prove these mechanisms before freezing public registration schemas. These are future integration checks, not evidence from the classifier pilot or earlier package-loading fixtures.
:::
