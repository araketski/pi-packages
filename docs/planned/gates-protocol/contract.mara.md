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

Pi custom session entries can keep a historical record of gate lifecycle events
without adding them to model context. Restoring that history is not proof that
an external job is still live; the work owner must reconcile it with its own
state. A visibility extension may render selected entries in the interactive
chat for the user, but visibility and state reconstruction are separate
concerns. Ephemeral Pi sessions have no durable history after Pi exits.

## Confirmed coordination boundaries

The live projection is scoped by session and owner, not rewound by navigation
through Pi's session tree. Historical entries are tentative until each work
owner reconciles them against its own work. Observers must distinguish an
unconfirmed projection from a confirmed empty one; a late observer requests
current state rather than relying solely on having seen past events. A missed
owner response or an elapsed diagnostic lease does not prove that work ended,
and neither silently clears a gate or starts a turn. Persisted state transitions
precede their live announcements; bounded identities make repeated delivery and
reconciliation safe. Gate entries must not contain raw job commands or output.

## Open design questions

Before implementation, define the exact owner/gate identity and branch
reconciliation interface, the readiness boundary for known owners, and what
happens when writing a session entry fails. If an owner never comes back,
consumers still need a deliberate recovery policy: warn and hold, or provide
an explicit user-controlled override. The protocol will not select either
policy by silently expiring the gate.

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

:::mara requirement REQ-GATES-SESSION-HISTORY
:mid: 01M3P41PZR8K1S9GX1GRKZKJGC
:title: Keep gate transitions in Pi session history
:status: accepted
:kind: functional
:contributes_to: GOAL-GATES-COORDINATION

For a Pi session with persistent storage, record gate acquisition, clearance, and state-changing reconciliation as append-only custom session entries, separate from model context. These entries preserve historical intent across reload or restart; they do not prove the external work is still running. Restored history must remain distinguishable from owner-confirmed current state until the work-owning extension reconciles it. Ephemeral Pi sessions provide no durability across process exit.
:::

:::mara verification VER-GATES-SESSION-HISTORY
:mid: 01M3P41SRTJ5BWMEJ39B5P2BYJ
:title: Replay gate history without treating intent as confirmed work
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-SESSION-HISTORY

In a persistent Pi session fixture, acquire and end a gate, then reopen the session and inspect custom entries on the active branch. Confirm their order and that they do not appear in model context. Simulate a restart with an acquired gate but no clearance: the history remains visible, yet current work is not reported as owner-confirmed until that owner reconciles and records its corrected state. In an in-memory session, do not claim durability after process exit.
:::

:::mara requirement REQ-GATES-SCOPED-STATE
:mid: 01M3P4FW9GCH4MNVQMDN53ZS5M
:title: Keep independent awaited work distinct across owners and sessions
:status: accepted
:kind: functional
:contributes_to: GOAL-GATES-COORDINATION

A live gate is scoped to a Pi session, a work owner, and a gate identity. Separate gates may coexist; clearing one must not erase another owner's gate or another awaited operation. Navigating the session tree must not by itself claim that an external job started, ended, or moved to a different branch; the work owner reconciles current state.
:::

:::mara verification VER-GATES-SCOPED-STATE
:mid: 01M3P4FZ2SZG8SVA1ENXG0K08Y
:title: Preserve concurrent gates across owner, session, and branch changes
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-SCOPED-STATE

Announce two gates with the same local ID from distinct owners in one session and another in a different session. Confirm each observer sees only its session and each owner affects only its own gate. Clear one, then navigate the session tree; the remaining external work must not disappear or reappear solely because the active branch changed. Confirm owner reconciliation determines the live projection.
:::

:::mara requirement REQ-GATES-RECONCILIATION
:mid: 01M3P4G1QKR1YYAG7N55G58356
:title: Distinguish unreconciled gate history from confirmed live state
:status: accepted
:kind: functional
:contributes_to: GOAL-GATES-COORDINATION

An observer joining after an acquisition or resuming a session with historical entries can request current state from each known owner. It distinguishes unreconciled state from an owner-confirmed empty set or owner-confirmed pending gates. A valid owner report replaces only that owner's state; an invalid report does not clear existing gates. Historical absence, including before known owners respond, is not a confirmed absence of awaited work.
:::

:::mara verification VER-GATES-RECONCILIATION
:mid: 01M3P4G4H0WHWSJCQ5A2SHKCNZ
:title: Recover late and restarted observers without false emptiness
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-RECONCILIATION

Start a late observer after acquisition and require owner-confirmed gates through reconciliation. Reopen a persisted session with an unterminated gate entry: verify it is unreconciled, not confirmed active or empty, until its owner reports. Confirm a valid empty owner report clears only its own gates and makes that owner confirmed; malformed reports leave prior state intact. Verify unrelated owners and sessions are unaffected.
:::

:::mara requirement REQ-GATES-HEALTH-DIAGNOSTICS
:mid: 01M3P4GZ7MZPA1SJ1V7M2FPXET
:title: Report stale or missing owners without inventing completion
:status: accepted
:kind: constraint
:contributes_to: GOAL-GATES-COORDINATION

A known owner that does not answer reconciliation within the defined observation period is reported as unresponsive; a gate whose declared diagnostic lease elapses is reported as stale. Neither condition by itself proves the awaited work ended, clears a gate, changes an unconfirmed projection into confirmed empty, or initiates a model turn. Consumer recovery policy remains separate from these diagnostics.
:::

:::mara verification VER-GATES-HEALTH-DIAGNOSTICS
:mid: 01M3P4H1YTDH1W8D17Z6H0NHCJ
:title: Keep stale and unresponsive signals diagnostic
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-HEALTH-DIAGNOSTICS

With a known gate, advance a diagnostic deadline and observe a stale warning while the gate remains pending. Request owner reconciliation without a response and observe an unresponsive warning without dropping known state or confirming an empty restored state. Neither diagnostic causes a Pi message or an agent turn. Confirm that a later owner response corrects the diagnostic and projection.
:::
