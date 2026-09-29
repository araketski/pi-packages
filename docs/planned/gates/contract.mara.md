# Planned `pi-gates` visibility extension

This planned Pi extension shows the protocol's gate history and current state;
it is included in the agreed implementation scope but is not yet implemented. Its coordination dependency is
specified in [the protocol contract](../../../packages/gates-protocol/docs/contract.mara.md).
Pi custom session entries can appear in the interactive chat through an entry
renderer without becoming model-visible messages. The extension does not need
to generate model turns merely to announce gate transitions. Protocol entries
with `suppressNotice: true` are still journalled but do not get a generic
lifecycle notice; live health warnings are independent of that preference.

The read-only command reference is `packages/continuation-gate-inspector/` at Git
revision `d9b1b8c72bf261be74d3229e766adb685b940aa4`. Its command source and registration
tests were inspected, not executed. Port the user-facing inspection behavior, not
the obsolete protocol implementation or its domain/wake-claim machinery.

:::mara requirement REQ-GATES-USER-VISIBILITY
:mid: 01M3P42KSQ751ZF67NFS9DQAN3
:title: Show gate history to users without duplicating owner notices
:status: accepted
:kind: functional
:contributes_to: GOAL-GATES-COORDINATION

When the `pi-gates` extension is enabled in interactive Pi, it renders eligible persisted gate lifecycle entries as user-visible chat notices by default, without sending them to the model. It also shows currently reported stale-gate and unresponsive-owner diagnostics as user-visible warnings, without claiming the job is dead. An integrating owner that already shows its own equivalent user-facing lifecycle notices, such as `tmux-bash`, can suppress generic notices for its own gate events. Suppression affects presentation only: it must not remove the historical session entry, hide unrelated diagnostics, or change the current gate state observed by other extensions.
:::

:::mara verification VER-GATES-USER-VISIBILITY
:mid: 01M3P42PHJM5KP45098DTR7HCE
:title: Verify optional gate notices preserve state and model context
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-USER-VISIBILITY

With a Pi session fixture, render an acquired and a cleared gate as user-visible custom entries and confirm no corresponding model-context messages or model turns are created. Repeat with an owner that opts out because it provides its own notice: generic lifecycle notices are absent but custom session entries and the observer projection are unchanged. Inject a stale-gate or unresponsive-owner report and verify a warning is user-visible without clearing the gate, hiding the report through notice suppression, or creating a model turn. Check interactive rendering separately from non-interactive modes.
:::

:::mara requirement REQ-GATES-READONLY-CONTROLS
:mid: 01M3Q61BR52PNC77C22ZCM7JYR
:title: Provide read-only gate inspection without producer-specific control
:status: accepted
:kind: functional
:contributes_to: GOAL-GATES-COORDINATION

Retain the reference inspector user commands /gates, /gates refresh, /gates stale, and /gates diagnostics using the current gates protocol. Show current-session owner/gate state, confirmation/discovery status, and available health diagnostics without interpreting which extension produced a gate. A refresh requests reconciliation; it does not prove an immediate response or confirmed empty state. Distinguish unconfirmed or unavailable state from no gates, bound diagnostic presentation, and do not invent unavailable metadata from the old protocol. Inspection never acquires/releases gates belonging to other owners, delivers results, starts a model turn, or exposes a force-clear control. Apply [[REQ-WORKFLOW-PRODUCER-INDEPENDENCE]]; no jobs-core or Herdr dependency is needed.
:::

:::mara verification VER-GATES-READONLY-CONTROLS
:mid: 01M3Q61EJBTZR4Z10X29PJQT37
:title: Verify current-protocol gate inspection and non-mutating refresh
:status: accepted
:method: test
:level: integration
:verifies: REQ-GATES-READONLY-CONTROLS

With actual Pi command registration and generic owners, exercise all four inspection routes, unsupported input, delayed/no owner responses, stale leases, session changes, and confirmed-empty versus unconfirmed state. Refresh must request current state without pretending a pending response has arrived. Bound diagnostic output and verify no owner mutation, force clearing, job inspection, model-context insertion, or model turn. Combine with the separately required lifecycle-history rendering and notice suppression checks. These are future checks, not passing evidence.
:::
