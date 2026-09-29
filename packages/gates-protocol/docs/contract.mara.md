# `@araketski/pi-gates-protocol`

This is the intended contract for a newly scaffolded library; gate coordination
is not implemented yet. The legacy continuation-gate package is reference
material, not its API or architecture. `pi-gates` is the separately planned,
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
and neither silently clears a gate or starts a turn. Custom session entries
are appended before their live announcements; bounded identities make repeated
delivery and reconciliation safe. Gate entries must not contain raw job commands or output.

## Open design questions

The initial interface uses session ID, owner ID, and owner-local gate ID; a
single Pi session owns its live projection across tree navigation. Reconstruct
intent from gate entries in the full session tree, then ask the work owner to
verify external reality. An owner explicitly publishes verified snapshots; an
unresponsive owner never turns an unresolved wait into confirmed empty. The
protocol supplies diagnostics, while `goal` remains paused and `caffeinate`
retains its hold with warnings. No force-clear operation is provided here.

If appending a custom session entry throws, reject that state transition and
do not broadcast an unrecorded acquisition, clearance, or reconciliation.
Owners must arrange acquisition before depending on a background job's wait
signal and handle such failures rather than treating the gate as acquired.
This is an append-call guarantee, not a promise of filesystem durability.
Gate recovery follows Pi's session lifecycle: a fresh session that has not yet
been written to disk cannot be resumed after exit, so gate coordination does
not require a separate file or reject acquisition merely because Pi has not
created one. Work owners still handle their external jobs independently.

Still to be verified through integration: readiness when a known owner is
registered but not reconciled, session replacement and tree navigation, and
publication order when a source and observer start at different times.

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

For a Pi session that Pi can resume, record gate acquisition, clearance, and state-changing reconciliation as append-only custom session entries, separate from model context. These entries preserve historical intent across reload or restart of that session; they do not prove external work is still running. Restored history must remain distinguishable from owner-confirmed current state until the work-owning extension reconciles it. A fresh session that Pi has not written to disk cannot be resumed after exit, and an ephemeral Pi session provides no durability across process exit; the protocol does not require a separate file or reject acquisition solely for these cases.
:::

:::mara verification VER-GATES-SESSION-HISTORY
:mid: 01M3P41SRTJ5BWMEJ39B5P2BYJ
:title: Replay gate history without treating intent as confirmed work
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-SESSION-HISTORY

In a Pi session that has been written to disk, acquire and end a gate, then reopen the session and inspect custom entries on the active branch. Confirm their order and that they do not appear in model context. Simulate a restart with an acquired gate but no clearance: history remains visible, yet current work is not reported as owner-confirmed until its owner reconciles and records corrected state. In a fresh session before Pi creates its file and in an in-memory session, do not claim recovery after process exit.
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

:::mara verification VER-GATES-PROJECTION-UNIT
:mid: 01M3P61DKQGKBP2ZPGCQWGWPDQ
:title: Check the isolated owner-scoped projection before Pi transport
:status: accepted
:method: test
:level: unit
:verifies: REQ-GATES-RECONCILIATION
:verifies: REQ-GATES-SCOPED-STATE

In a pure session-local state fixture, restore a gate as unconfirmed; require an owner report before it becomes confirmed, including an empty report. Check multiple owners and sessions with overlapping local IDs, malformed snapshots leaving current state unchanged, old history not replacing a confirmed report, and returned views not granting mutation rights. This is a unit check of projection logic, not evidence of session journaling, transport, or recovery integration.
:::

:::mara requirement REQ-GATES-PERSIST-BEFORE-SIGNAL
:mid: 01M3P64J6NSFZ8XAGXR72CGHVT
:title: Do not signal a gate transition whose journal append fails
:status: accepted
:kind: constraint
:contributes_to: GOAL-GATES-COORDINATION

For gate acquisition, clearance, and owner reconciliation, append a custom Pi session entry before changing published live state. If the append call fails, report the failure to the caller without announcing that transition or replacing the prior state. Ephemeral Pi sessions still keep in-process entries but cannot provide durability after exit. This does not claim filesystem fsync or exactly-once delivery.
:::

:::mara verification VER-GATES-PERSIST-BEFORE-SIGNAL
:mid: 01M3P64MZSNJ3NKKZ5M1YZ56ZN
:title: Reject unrecorded state transitions
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-PERSIST-BEFORE-SIGNAL

With a Pi-compatible host, assert a successful acquisition, release, and verified owner snapshot append a custom entry before any bus announcement. Make appendEntry throw on each transition and verify the caller receives failure, the old projection remains, and no new bus event is emitted. Confirm in-memory sessions keep entries during the process but promise no recovery after exit.
:::

:::mara verification VER-GATES-OWNER-OBSERVER
:mid: 01M3P6A6Q736WGBDRYYW0SZXCP
:title: Exercise owner and late observer through the Pi event and entry interfaces
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-PENDING-STATE
:verifies: REQ-GATES-RECONCILIATION
:verifies: REQ-GATES-PERSIST-BEFORE-SIGNAL

Using independent owner and observer instances with a shared Pi-compatible event bus, assert a late observer recovers current gates, a restarted observer treats journal replay as unconfirmed until the work owner reconciles, and owner registration alone does not erase historical intent. Acquire and release append before live publication. If appending an acquire, release, or reconciliation fails, no new state is published. Session tree reads use full session history while session replacement does not leak old gates. This fixture does not yet verify a real Pi process or owner timeout behavior.
:::

:::mara risk RISK-GATES-EARLY-SESSION-NOT-DURABLE
:mid: 01M3P6N24V310FBANYYSCQAN37
:title: Pi can accept a gate entry before its session file exists
:status: retired
:impact: high
:treatment: tolerated
:affects: REQ-GATES-SESSION-HISTORY
:affects: REQ-GATES-PERSIST-BEFORE-SIGNAL

Pi 0.87.1 buffers custom entries in a fresh session until it has an assistant message. This observation is normal Pi lifecycle behavior, not a reason to reject early gate acquisition: no session file means Pi cannot resume that session after interruption. The gate protocol follows Pi resumability rather than imposing another journal or file-existence check. Work owners retain independent responsibility for external jobs that survive Pi. This former risk was closed by ADR-GATES-PI-RESUMABILITY-BOUNDARY; append-call failures remain separately covered by REQ-GATES-PERSIST-BEFORE-SIGNAL.
:::

:::mara decision ADR-GATES-PI-RESUMABILITY-BOUNDARY
:mid: 01M3P7EH45AT9MECP3FJ7RQVXQ
:title: Follow Pi session resumability instead of requiring a pre-first-message file
:status: accepted
:justifies: REQ-GATES-SESSION-HISTORY
:justifies: RISK-GATES-EARLY-SESSION-NOT-DURABLE

Pi may accept custom entries in memory before it creates a new session file. If the process exits before Pi records an assistant message, that Pi session cannot be resumed either. Gate history therefore promises restart reconstruction only within a Pi session that Pi can actually resume; do not reject an acquisition just because a new session file does not yet exist, and do not add protocol-owned durable storage for this case. This does not change the work-owning extension's obligation to manage and recover external jobs, nor the rule that a thrown appendEntry call must not publish an unrecorded state change.
:::

:::mara verification VER-GATES-REAL-PI-SESSION
:mid: 01M3P7J5EH3PJDTG08J445H8CH
:title: Restore gate intent from a resumable Pi session after branch navigation
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-SESSION-HISTORY
:verifies: REQ-GATES-SCOPED-STATE

Use the actual Pi 0.87.1 SessionManager and EventBus in a temporary file-backed session. After Pi creates a resumable file, reconcile and acquire a gate; verify custom entries exist without becoming model-context messages. Move to another branch without the gate entry, reopen the session from disk, and confirm a late observer still sees unconfirmed historical intent. Only an owner-verified reconciliation changes it to confirmed empty. This local SDK test does not prove extension loading, remote Pi versions, or a consumer response.
:::
