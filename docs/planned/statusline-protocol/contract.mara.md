:::mara goal GOAL-STATUSLINE-COMPAT
:mid: 01M3KZKY5HKS8CQJP8TVZ7HBZS
:title: Status producers work with standard and custom Pi footers
:status: accepted

Pi status producers publish once through a shared interface. Their statuses remain useful in the standard footer and retain their full structured meaning in the custom footer, including when that footer starts later.
:::

:::mara requirement REQ-STATUSLINE-NATIVE
:mid: 01M3KZM0CT1NKN1SXHVQMTE62S
:title: Show producer statuses without the custom footer
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

A producer can register its status defaults once, then update text and state or clear its status through a single library interface. Each active status is shown through Pi’s native ctx.ui.setStatus even if the custom statusline is absent. The native text includes the producer’s default icon when provided and is cleared when the status is cleared or the producer is disposed. Publishing does not require a separate bridge extension.
:::

:::mara requirement REQ-STATUSLINE-RECOVERY
:mid: 01M3KZM2KE10ZS9FJMQJ0HCDE2
:title: Recover complete producer state after custom footer starts
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

A custom statusline starting after producers have published shall recover every active producer status with its source identity, key, current text and state, default icon and semantic color. Subsequent updates and clears keep its view current; disposed producers no longer appear. Recovery must not depend on native setStatus text or on a prior event subscription. Structured values must remain free of pre-rendered ANSI styling.
:::

:::mara requirement REQ-STATUSLINE-OVERRIDES
:mid: 01M3KZM4VJ895WKPMRMK7N9MH3
:title: Permit central presentation overrides
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

The custom footer shall use producer-supplied icon and semantic color defaults unless its own configuration overrides them for a status key or state. Changing footer configuration or theme must be able to re-render the current structured status without asking producers to publish again. Native fallback uses producer defaults, not custom-footer configuration. The exact configuration-file syntax belongs to the later statusline extension contract, not this shared library.
:::

:::mara design DES-STATUSLINE-PROTOCOL
:mid: 01M3KZNSR3N25VFSS1V79JWX13
:title: Registered status publishers with dual output and recovery
:status: accepted
:kind: interface
:satisfies: REQ-STATUSLINE-NATIVE
:satisfies: REQ-STATUSLINE-RECOVERY
:satisfies: REQ-STATUSLINE-OVERRIDES

The compiled npm library exports a producer registration interface. A producer registers its stable key, source identity, optional default icon and semantic color, and a way to read its current status once per session. Its handle accepts changing text and state, supports clear, and disposes its snapshot participation. Calls derive native setStatus text (icon plus text with producer default color) and emit unstyled structured updates/clears. Structured updates carry enough current fields to be interpreted without a previously observed registration; the producer does not repeat defaults on each call. The custom footer subscribes to updates, requests snapshots when it starts, and renders the returned complete status values with its own optional key/state overrides. Snapshot requests return each currently active registered producer status; they do not infer missing fields from native footer text. A separate always-loaded fallback bridge and conditional detection of the custom footer are not required. The custom footer owns override file syntax, layout and render precedence; those are not library concerns. For the initial slice, test distinct producer keys; shared-key arbitration is not specified by this contract.
:::

:::mara verification VER-STATUSLINE-PROTOCOL
:mid: 01M3KZNVV3S54XDJB0KA0VGCZ8
:title: Exercise fallback and late structured recovery
:status: accepted
:method: test
:level: integration
:verifies: REQ-STATUSLINE-NATIVE
:verifies: REQ-STATUSLINE-RECOVERY
:verifies: REQ-STATUSLINE-OVERRIDES
:verifies: DES-STATUSLINE-PROTOCOL

Use an event bus and Pi UI fixture on Pi 0.87.1. Register a producer once with default icon and semantic color, then publish changing text/state without resupplying defaults. Without a custom subscriber, observe native setStatus text with icon and default styling and a clear on removal/disposal. With a custom subscriber, observe unstyled complete structured values, an update and clear; no duplicate display of native and structured copies. Start the custom subscriber after updates from two distinct producers, request a snapshot and assert recovery of both current texts, states, source identities, icons and semantic colors, excluding cleared/disposed statuses. Check that a change to central rendering overrides or theme re-renders recovered values without a producer event and leaves native fallback unaffected; the custom-footer integration portion remains pending until that package exists. Build and pack the library and resolve runtime exports and declarations from an isolated consumer, without workspace links. Record actual test execution separately; this definition alone is not a passing result.
:::
