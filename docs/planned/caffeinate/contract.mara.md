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

Default to display plus system-sleep inhibition, with explicit system-sleep-only mode. Verify the selected Linux backend rather than equating a live helper process with every requested desktop effect. Surface unsupported or degraded capabilities honestly. Bound failed candidate attempts and avoid a continuous respawn loop after unavailability; explicit rearming or changed conditions may retry. Preserve ownership-safe normal shutdown, including helpers that finish starting or stopping during shutdown, and best-effort cleanup after process loss. Do not stop unrelated inhibitors or application processes. Other-platform reference code or simulated process tests alone do not establish native support.
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

Use actual Pi lifecycle and generic gate producers without loading jobs-core. Test activity, queued messages, pending and unconfirmed gates, multiple reasons, inactive tracked sessions, switching/reload, and final owner clearance. Keep an A-session gate pending while B is current and idle; inhibition remains. Exercise temporary stop even with gates present, rearming only for new activity/acquisition or start, persistent disable, idle start without a false actively-awake claim, and mode/quiet/status controls. Unknown producers receive identical behavior. Verify footer/structured status, warnings, and no gate mutations or model turns. These checks have not run.
:::

:::mara verification VER-CAFFEINATE-INHIBITORS
:mid: 01M3Q5Y6Y67BWFBX9QWRH4EKVZ
:title: Verify real Linux inhibition and owned helper cleanup
:status: accepted
:method: test
:level: integration
:verifies: REQ-CAFFEINATE-MODES-AND-LIFETIME

First use fake helpers for failed candidates, unexpected exits, rearming, mode changes, shutdown during startup/stop, bounded retries, and unrelated-process preservation. Then use an isolated test harness with a supported real Linux backend to establish requested inhibition and release, including relevant process-loss cleanup. Do not infer display behavior on every compositor from command arguments or process liveness; record the verified backend and remaining limitations. Do not suspend the user machine or change desktop configuration as an automated test. These are future tests, not executed native verification.
:::

:::mara verification VER-CAFFEINATE-FRESH-SETTINGS
:mid: 01M3Q5Y9XPH99H4147WFSNG6NH
:title: Verify new settings persistence and untouched legacy preferences
:status: accepted
:method: test
:level: integration
:verifies: REQ-CAFFEINATE-SETTINGS

Seed the legacy settings file with nondefault valid preferences and separately malformed data: neither may be loaded, rewritten, or deleted. With no new-format settings, require the agreed fresh defaults. Exercise valid new preferences, unknown fields, ordered concurrent updates, atomic-save failures, and protection of unreadable/malformed new files. Verify no project-local preference is loaded and no successful-save claim occurs on failure. These checks have not run.
:::
