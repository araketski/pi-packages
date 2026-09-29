# Planned `pi-gates` visibility extension

This is a proposed Pi extension for showing the protocol's gate history and
current state; it is not yet implemented. Its coordination dependency is
specified in [the protocol contract](../../../packages/gates-protocol/docs/contract.mara.md).
Pi custom session entries can appear in the interactive chat through an entry
renderer without becoming model-visible messages. The extension does not need
to generate model turns merely to announce gate transitions.

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
