# Planned caffeinate extension

This is accepted intended behavior, not an implemented extension or verified
power-management integration. Keep it here until package scaffolding and relocate
its items with Mara without changing identity.

## Reference and agreed changes

The reference is `packages/caffeinate/` at Git revision
`d9b1b8c72bf261be74d3229e766adb685b940aa4`. Its runtime, command/settings handling,
inhibitor candidates and process supervisor, and selected tests were inspected;
no reference test or real power-management experiment was executed.

Retain automatic holding for active Pi, queued messages, or generic gates, with
explicit manual overrides. Unlike the reference's current-session-only gate view,
retain gate-derived holds for all sessions still tracked by this Pi process.
This does not authorize inspecting jobs or producer internals, scanning unrelated
historical sessions, or building cross-process orchestration.

The default remains display plus system-sleep inhibition. The reference's Linux
`systemd-inhibit --what=idle:sleep` invocation is not proof of display behavior on
every compositor. Verify the selected Linux backend and report actual limitations.
Initial native verification is Linux; do not claim other-platform conformance from
reference adapters or fake-process tests alone.

The user selected fresh settings rather than legacy compatibility. Do not load or
overwrite the reference `pi-caffeinate.json`; choose a distinct new settings
location and specify its schema before implementation. The
[jobs integration](./jobs-integration.mara.md) remains a generic-gates consumer case.

## Agreed knowledge

:::mara goal GOAL-PI-WAKEFULNESS
:mid: 01M3Q5XJGTJ502J85CJ789ECEM
:title: Keep the machine awake for Pi activity and pending gates under user control
:status: accepted

Keep appropriate power inhibition active while Pi has activity, queued messages, or pending generic gates, with explicit user overrides and honest availability diagnostics. Caffeinate observes coordination; it does not own executions or advance model work.
:::

:::mara requirement REQ-CAFFEINATE-AUTO-HOLD
:mid: 01M3Q5XNF5DT835PWNR902SGRF
:title: Hold for Pi activity messages and gates across tracked sessions
:status: accepted
:kind: functional
:contributes_to: GOAL-PI-WAKEFULNESS

When enabled and not manually stopped or shutting down, retain an inhibition reason while Pi is active, messages are queued, or any session still tracked by this Pi process has pending generic gates. A session switch must not discard an existing gate-derived hold; reload must not silently forget outstanding tracked reasons. Unconfirmed gate state remains conservative with diagnostics, not confirmed empty. Observe only public gate state, regardless of producer, under [[REQ-WORKFLOW-PRODUCER-INDEPENDENCE]]. Do not inspect jobs-core, Herdr, job phases, or producer-specific internals. Do not scan unrelated historical sessions or invent a cross-process gate system. Removing one reason does not remove others; caffeinate never clears producer gates, delivers results, starts turns, or terminates jobs.

Active classifier calls are work that must retain inhibition under this same enabled/manual-override policy, including manual reviews outside an assistant turn. Expose that activity through applicable public Pi activity or ordinary generic gates, not a classifier/goal-specific consumer branch or private-state inspection. Finished calls alone do not retain a hold; other activity/gate obligations still do. The concrete public activity mapping requires integration verification.
:::

:::mara requirement REQ-CAFFEINATE-MANUAL-CONTROLS
:mid: 01M3Q5XRC5KDKS8ET0ZHH7RFZ7
:title: Retain explicit temporary and persistent user overrides
:status: accepted
:kind: functional
:contributes_to: GOAL-PI-WAKEFULNESS

Provide /caffeinate status, start, stop, enable, disable, display, sleep, quiet on/off, help, and an optional interactive menu. stop temporarily overrides inhibition even with activity or gates present; next Pi activity, a newly acquired gate, or start rearms automatic holding. Repeated snapshots of existing gates are not new acquisitions. start rearms automatic policy rather than forcing an otherwise idle machine awake or overriding persistent disable. disable persists until explicitly enabled. Commands and feedback must distinguish enabled, rearmed, actively inhibiting, manually stopped, and unavailable states; do not announce an active inhibitor merely because start was requested. These controls never mutate gates or jobs.
:::

:::mara requirement REQ-CAFFEINATE-MODES-AND-LIFETIME
:mid: 01M3Q5XVB8HERRZG3PVJDAKN9E
:title: Own bounded inhibitor lifetimes and report real power capabilities
:status: accepted
:kind: functional
:contributes_to: GOAL-PI-WAKEFULNESS

Default to display plus system-sleep inhibition, with explicit system-sleep-only mode. Verify the selected Linux backend and report unsupported/degraded capabilities rather than equating a live helper with every requested desktop effect. Bound failed attempts; do not continuously respawn an unavailable backend. Explicit rearming or changed conditions may retry.

Own the inhibitor helper and release it on ordinary stop, mode change and shutdown, including a helper still starting when shutdown begins. Never stop unrelated inhibitors or application processes. Follow [[ADR-WORKFLOW-MINIMAL-PROFILE]]: one selected working Linux backend, ordinary acquisition/release and a basic failure/shutdown safety check are enough for initial delivery. Crash/process-loss cleanup campaigns, automatic supervisor recovery and cross-platform/compositor matrices are deferred. Native backend release on process loss may be used where available without promising a recovery service. Reference adapters/fakes alone do not establish other-platform support.
:::

:::mara requirement REQ-CAFFEINATE-SETTINGS
:mid: 01M3Q5XY5VV60DJ999EM67JDNW
:title: Persist user preferences in fresh protected settings without legacy import
:status: accepted
:kind: functional
:contributes_to: GOAL-PI-WAKEFULNESS

Use user-level preferences, with reference defaults enabled=true, mode=display, quiet=false and no project-local override. Select a new settings location distinct from the legacy pi-caffeinate.json; do not read, import, overwrite, rename, or delete legacy preferences. Preserve unknown fields in valid new-format settings, serialize updates, and save atomically. An invalid or unreadable new settings file must remain protected from command writes, with diagnostics and safe in-memory defaults rather than silent replacement. Failed saves must not falsely report persistence. Specify the concrete new location/schema before implementing it; no migration or legacy compatibility layer is required.
:::

:::mara requirement REQ-CAFFEINATE-PRESENTATION
:mid: 01M3Q5Y13K2M956VQMCKW8CKYM
:title: Show truthful inhibition state without requiring the statusline extension
:status: accepted
:kind: functional
:contributes_to: GOAL-PI-WAKEFULNESS

Expose activity, queued-message, gate, manual-override, mode, and availability diagnostics through user controls. Publish structured status with a normal Pi footer fallback where UI is supported, without requiring the statusline extension. Quiet mode suppresses routine start/release notices, not warnings or explicit command feedback. Keep backend and gate handling independent of rendering and do not start model turns to report power state. Distinguish claimed backend capabilities from actual native verification.
:::

:::mara verification VER-CAFFEINATE-GATES-AND-CONTROLS
:mid: 01M3Q5Y3ZF3TRJDGB13YX1MXTY
:title: Verify generic multi-session holding and explicit manual overrides
:status: accepted
:method: test
:level: integration
:verifies: REQ-CAFFEINATE-AUTO-HOLD
:verifies: REQ-CAFFEINATE-MANUAL-CONTROLS
:verifies: REQ-CAFFEINATE-PRESENTATION

Use actual Pi lifecycle with generic producers and a controlled inhibitor driver. Demonstrate activity/queued messages holding and release after settlement. Keep an A-session gate pending while B is current and idle, then clear the gate; an independent reason still holds. Verify one unknown-owner case remains diagnostic rather than confirmed empty. Goal/classifier activity, including manual review outside a turn, uses the same public activity/gate boundary, not a producer-specific branch; actual Goal composition belongs to the combined workflow check.

Exercise status/start/stop/enable/disable/mode/quiet controls: stop overrides current reasons, new activity/acquisition or start rearms, repeated snapshots do not, and persistent disable survives reload. Idle start does not falsely claim inhibition. Check ordinary footer/structured status and no model turns/gate mutations. Under [[ADR-WORKFLOW-MINIMAL-PROFILE]], these representative paths replace a full activity × session × reason × failure matrix. These checks have not run.
:::

:::mara verification VER-CAFFEINATE-INHIBITORS
:mid: 01M3Q5Y6Y67BWFBX9QWRH4EKVZ
:title: Verify real Linux inhibition and owned helper cleanup
:status: accepted
:method: test
:level: integration
:verifies: REQ-CAFFEINATE-MODES-AND-LIFETIME

Use one selected supported real Linux backend in a scoped harness to demonstrate acquisition and release, recording actual sleep/display capabilities and limitations. Do not infer universal compositor support from helper liveness, suspend the user's machine or edit desktop configuration.

Use focused fake helpers for ordinary backend failure with bounded attempts, manual rearming, mode change and shutdown during startup. Verify cleanup targets only the owned helper, not an unrelated process. Under [[ADR-WORKFLOW-MINIMAL-PROFILE]], process-loss recovery campaigns, every candidate/compositor/platform and exhaustive startup/stop races are deferred. These are future checks, not executed inhibition evidence.
:::

:::mara verification VER-CAFFEINATE-FRESH-SETTINGS
:mid: 01M3Q5Y9XPH99H4147WFSNG6NH
:title: Verify new settings persistence and untouched legacy preferences
:status: accepted
:method: test
:level: integration
:verifies: REQ-CAFFEINATE-SETTINGS

In isolated settings fixtures, show absent new settings using the agreed defaults, one valid preference update round-tripping atomically, and preservation of an unknown valid field. Seed legacy settings and verify they remain untouched/unused. A malformed/unreadable new file stays write-protected; one ordinary failed save gives an honest diagnostic without claiming persistence. No project override is loaded.

Follow [[ADR-WORKFLOW-MINIMAL-PROFILE]]: ordinary serialized command updates are enough; concurrent-writer, partial-write recovery and exhaustive filesystem-failure campaigns are deferred. These are future checks, not passing evidence.
:::
