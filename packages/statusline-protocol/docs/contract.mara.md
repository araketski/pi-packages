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

A producer can register its status defaults once, then update text and state or clear its status through a single library interface. Each active status is shown through Pi’s native ctx.ui.setStatus even if the custom statusline is absent. The native text includes the producer’s default prefix when provided and is cleared when the status is cleared or the producer is disposed. Producer colors support Pi theme roles, six-digit `#RRGGBB`, ANSI 256-color indices from 0 through 255, and `''` for terminal-default text; `#RGB` and invalid indices are rejected at registration. A producer with only state-specific colors renders an unmatched or absent state unstyled; an explicit default color remains the fallback for those states. Publishing does not require a separate bridge extension.
:::

:::mara requirement REQ-STATUSLINE-RECOVERY
:mid: 01M3KZM2KE10ZS9FJMQJ0HCDE2
:title: Recover complete producer state after custom footer starts
:status: accepted
:kind: functional
:contributes_to: GOAL-STATUSLINE-COMPAT

On a snapshot request from a late-starting custom footer, each active producer shall supply its current status with source identity, key, text, state, default prefix and complete color definition, including when the color definition omits a default value. Structured updates and clears shall carry enough data for a subscriber to track current state; disposed producers no longer appear in responses. Recovery must not depend on native setStatus text or on a prior event subscription. Structured values must remain free of pre-rendered ANSI styling.
:::

:::mara design DES-STATUSLINE-PROTOCOL
:mid: 01M3KZNSR3N25VFSS1V79JWX13
:title: Registered status publishers with dual output and recovery
:status: accepted
:kind: interface
:satisfies: REQ-STATUSLINE-NATIVE
:satisfies: REQ-STATUSLINE-RECOVERY

The compiled npm library exports a producer registration interface and one shared appearance type for producer defaults and footer configuration: optional `prefix` plus optional `color`, either one `StatusColorValue` or `{ default?: StatusColorValue, byState: Record<string, StatusColorValue> }`. `byState` remains required on the object form. A color value is a Pi theme role, six-digit `#RRGGBB`, integer ANSI 256-color index from 0 through 255, or `''` for terminal-default text; `#RGB` is not supported. Resolve a known state from `byState`, otherwise use `default` if supplied; without it, native fallback remains unstyled. The single-value form applies to every state. Native fallback styles theme roles through Pi, hex with truecolor foreground escapes, and palette indices with ANSI 256-color foreground escapes; terminal default adds no styling. The structured update and snapshot retain the unstyled prefix, complete color definition (including an omitted default) and current state, while native fallback uses the resolved color. The custom footer may override producer appearance by key using the same type; merging overrides by state belongs to its own contract, not the library. A producer registers its stable key, source identity, optional default prefix and color definition, and a way to read its current status once per session. Its handle accepts changing text and state, supports clear, and disposes its snapshot participation. Calls derive native setStatus text (prefix plus text, styled with the producer color resolved from current state) and emit unstyled structured updates/clears. Structured updates carry enough current fields to be interpreted without a previously observed registration; the producer does not repeat defaults on each call. A consumer can subscribe to updates and request snapshots when it starts; footer rendering and overrides belong to [[REQ-STATUSLINE-FOOTER]] and [[REQ-STATUSLINE-OVERRIDES]]. Snapshot requests return each currently active registered producer status; they do not infer missing fields from native footer text. A separate always-loaded fallback bridge and conditional detection of the custom footer are not required. The library does not own footer layout or rendering. For the initial slice, test distinct producer keys; shared-key arbitration is not specified by this contract.

Implementation state: `registerStatus` currently provides session-scoped updates, native fallback, clear/dispose, and per-producer snapshot responses for distinct keys. Real Pi 0.87.1 producer integration remains to be verified; shared-key arbitration is not specified. The custom subscriber and overrides are planned separately in [statusline](../../../docs/planned/statusline/contract.mara.md). Status text and prefix are normalized with Node’s stripVTControlCharacters before native publication and structured events.
:::

:::mara verification VER-STATUSLINE-PROTOCOL
:mid: 01M3KZNVV3S54XDJB0KA0VGCZ8
:title: Exercise fallback and late structured recovery
:status: accepted
:method: test
:level: integration
:verifies: REQ-STATUSLINE-NATIVE
:verifies: REQ-STATUSLINE-RECOVERY
:verifies: DES-STATUSLINE-PROTOCOL

Use an event bus and Pi UI fixture on Pi 0.87.1. Register a producer once with default prefix and single semantic color, then publish changing text/state without resupplying defaults. Without a custom subscriber, observe native setStatus text with prefix and default styling and a clear on removal/disposal. With a test subscriber, observe unstyled complete structured updates and clears. Check per-state color selection, unmatched or absent states using the explicit default color, and the single-color form on the native fallback. With `{ byState: { active: 'accent' } }` and no default, check native active styling and unstyled unmatched/absent states without calling Pi’s theme function with undefined. Structured updates and late snapshots must retain that color object without inserting a default; `byState` remains required in the type. Check six-digit hex, boundary ANSI 256-color indices (including zero), and `''` in both single and state-selected forms; reject `#RGB`, malformed hex, and out-of-range indices at registration. Structured updates and late snapshots retain the raw color definition without ANSI styling. Start a test subscriber after updates from two distinct producers, request a snapshot and assert recovery of both current texts, states, source identities, prefixes and complete color definitions, excluding cleared/disposed statuses. Footer merge, deduplication and centralized overrides are checked separately under [[VER-STATUSLINE-FOOTER]]. Build and pack the library and resolve runtime exports and declarations from an isolated consumer, without workspace links. Record actual test execution separately; this definition alone is not a passing result.
:::
