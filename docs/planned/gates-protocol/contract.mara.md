# Planned `pi-gates-protocol`

This is specification work for a future library, not an implemented package. The
legacy continuation-gate package is reference material; this rework may change
its API, events, and architecture. `pi-gates` is the separately planned,
optional visibility extension. The protocol is not itself a Pi resource.

## Motivation and boundary

When an extension awaits asynchronous work, Pi can be idle without the work
being finished. `goal` must be able to distinguish that wait from an opportunity
to continue indefinitely or declare completion; `caffeinate` must be able to
recognize the same wait instead of releasing its awake hold merely because Pi
became idle. The extension that owns the work remains responsible for its
completion, result delivery, and any offline recovery. A gate is coordination
state, not an instruction to continue or a substitute for a result message.

## Open design questions

Before implementation, decide how concurrent gates are identified and scoped,
how a late observer learns current state, and how owners' unclosed gates are
handled after shutdown or restart. Neither automatic expiry nor indefinite
blocking is implied by the legacy implementation. Specify and test the chosen
policy before relying on it in `goal` or `caffeinate`.

:::mara goal GOAL-GATES-COORDINATION
:mid: 01M3P1VQ7C1W8PV36ZXWJ6BD6B
:title: Coordinate awaited work without confusing idle with done
:status: accepted

Extensions that await work can communicate pending state so other extensions can distinguish a temporarily idle agent from completed work, without assuming control of the job or its result.
:::

:::mara requirement REQ-GATES-PENDING-STATE
:mid: 01M3P1VT3RCXMKFSNHAJQAQRYT
:title: Make awaited work observable until its owner ends the wait
:status: accepted
:kind: functional
:contributes_to: GOAL-GATES-COORDINATION

A work-owning extension can announce that awaited work is pending. An independent observer can determine that it remains pending while the owner waits and that it is no longer pending after the owner ends the wait. This state enables consumers such as `goal` to defer autonomous continuation or completion and `caffeinate` to retain an awake hold while work is awaited; each consumer owns its own response.
:::

:::mara verification VER-GATES-PENDING-STATE
:mid: 01M3P1VXDWK03SYH871PFYTNMM
:title: Observe a pending gate and its clearance independently of job output
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-PENDING-STATE

With an owner and an independent observer, assert that announcing awaited work is observable while Pi is idle, and ending the wait removes it from current pending state. An opting-in autonomous consumer does not continue or mark work complete merely because Pi is idle while pending work remains; an awake-hold consumer does not release solely because Pi is idle. Result delivery is tested by the integrating package, not inferred from gate clearance. This defines a test, not evidence that the protocol or consumers exist yet.
:::

:::mara requirement REQ-GATES-SIGNAL-ONLY
:mid: 01M3P1W07JR4TFN5SZM8ZVYPW8
:title: Keep gate coordination separate from work and model turns
:status: accepted
:kind: constraint
:contributes_to: GOAL-GATES-COORDINATION

Announcing, observing, or clearing a gate does not run a job, deliver its result, enqueue a model message, or start an agent turn. The extension integrating with the gate protocol owns those actions and any offline recovery. Gate clearance alone is not an instruction to resume Pi.
:::

:::mara verification VER-GATES-SIGNAL-ONLY
:mid: 01M3P1W3115BM7D05XK5YFF01N
:title: Reject implicit result delivery or continuation from gate operations
:status: accepted
:method: test
:level: unit
:verifies: REQ-GATES-SIGNAL-ONLY

Acquire, observe, and clear a gate with a host that records model-message and continuation calls. Assert no job execution, message queueing, or continuation is initiated by gate operations. In an integration fixture, confirm gate clearance creates no extra agent turn beyond a result that the integrating extension explicitly queues.
:::
