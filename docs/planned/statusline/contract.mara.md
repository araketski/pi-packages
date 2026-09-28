:::mara requirement REQ-STATUSLINE-OVERRIDES
:mid: 01M3KZM4VJ895WKPMRMK7N9MH3
:title: Permit central presentation overrides
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

The custom footer shall use producer-supplied prefix and color definition unless its own configuration overrides them for a status key or state. Per-key appearance overrides use the same exported prefix/color type as producer registration, including theme roles, six-digit hex, 256-color indices, and terminal-default values. Changing footer configuration and reloading Pi, or changing the theme, must re-render the current structured status without asking producers to publish again. Native fallback uses producer defaults, not custom-footer configuration. The footer shall load user overrides from <agent-dir>/statusline.json (Pi's configured agent directory, normally ~/.pi/agent), then project overrides from <cwd>/.pi/statusline.json only when the project is trusted. It reads configuration at session startup or Pi reload, not on every render or through a file watcher. The exact JSON schema and color-override precedence belong to the future statusline extension contract.
:::

:::mara requirement REQ-STATUSLINE-FOOTER
:mid: 01M3M208ZB518PNDNJQ9FJP6FQ
:title: Consume current structured statuses without duplicate native fallback
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

When the custom footer starts, it shall subscribe to structured status updates and clears before requesting producer snapshots, merge each active producer’s snapshot with subsequent events, and display the current statuses including late-started producers. For a key present in both structured and native Pi status data, render the structured version once; native-only statuses remain visible. A cleared or disposed producer no longer appears. This is a custom-footer responsibility; the protocol library does not render or install a subscriber.
:::

:::mara verification VER-STATUSLINE-FOOTER
:mid: 01M3M20B5XY1SG3ADQVHRDKGPB
:title: Exercise late footer startup, duplicate suppression, and overrides
:status: accepted
:method: test
:level: integration
:verifies: REQ-STATUSLINE-OVERRIDES
:verifies: REQ-STATUSLINE-FOOTER

In a real Pi 0.87.1 session, start two producers with different active statuses before the custom footer. Load the footer, request snapshots, and confirm complete current text, state, source, prefix and resolved state color appear without duplicating their native fallback while unrelated native-only statuses remain visible. Update and clear producers and observe one correct entry per key. Override a prefix or state color in <agent-dir>/statusline.json; verify current structured statuses re-render after Pi reload or theme change without another producer event, while native fallback retains producer defaults. Check that <cwd>/.pi/statusline.json overrides the user file only for a trusted project, and that an alternate configured agent directory is used. Exercise footer unload/reload and producer disposal. This verification is planned; the footer package has not been scaffolded.
:::
