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
