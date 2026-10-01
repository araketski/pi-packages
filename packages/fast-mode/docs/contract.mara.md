:::mara goal GOAL-FAST-MODE
:mid: 01M3M87H347DCC4JSMX3F5DT11
:title: Choose faster supported model service without losing session intent
:status: accepted

A Pi user can opt into fast service for eligible models, see whether it is currently active, and keep working across model and session changes without silently changing unsupported requests.
:::

:::mara requirement REQ-FAST-CONTROLS
:mid: 01M3M87HY2W0MFT0H7WEN228EC
:title: Control fast mode explicitly
:status: accepted
:kind: functional
:contributes_to: GOAL-FAST-MODE

Provide `--fast` to enable fast mode at launch. `/fast` and F3 toggle it; `/fast on` enables it, `/fast off` disables it, and `/fast status` reports the current enabled state and model applicability without changing either. Repeating an explicit on/off command is idempotent. Reject other command arguments with usage feedback and no state change. A successful state change informs the user; enabling while applicability is unsupported explains the limitation and preserves the preference. Do not promise that a selection change alone will make request mutation safe.
:::

:::mara requirement REQ-FAST-SESSION
:mid: 01M3M87JSB03QSBD15Z8ST24SY
:title: Preserve branch-sensitive fast mode intent
:status: accepted
:kind: functional
:contributes_to: GOAL-FAST-MODE

Keep the enabled boolean in Pi session custom entries so it survives reload, resume, and branch navigation. On restoration, use the latest valid fast-mode entry in the active branch; ignore unrelated or malformed entries. Without `--fast`, a branch with no valid entry starts off. With `--fast`, restoration starts on even when the branch's latest entry says off; the user can still turn it off for the current run, but a subsequent reload or branch restoration under `--fast` turns it back on. Switching to an unsupported model must not change the saved enabled state.
:::

:::mara requirement REQ-FAST-ELIGIBILITY
:mid: 01M3M87KMDF0DH606J96BKWCKK
:title: Limit fast mode to the confirmed wire APIs and model ids
:status: accepted
:kind: constraint
:contributes_to: GOAL-FAST-MODE

Match on the verified model serving the actual request and its wire API using supported public Pi information, not the selected virtual model or a provider display name. Support configured native virtual models without adding a routing extension. If actual request identity, applicable authentication, or fast-service support cannot be established safely, report unsupported and leave the request untouched. For `anthropic-messages`, recognize only `claude-opus-4-6`, `claude-opus-4-8`, `claude-opus-5`, and `claude-opus-5-5`. For both `openai-responses` and `openai-codex-responses`, recognize only `gpt-5.4`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-sol`, and `gpt-6-luna`. Strip at most one leading `anthropic/` or `openai/` model-id prefix for eligibility, retaining the original id for request matching. Codex Responses additionally requires `modelRegistry.isUsingOAuth(model)` for the actual request model; OpenAI Responses does not. Absent, unrecognized, or ineligible models are unsupported.

The explicit allowlist is not automatically expanded by Pi catalog updates or campaign model selection. Sol 6.1 support remains a separate verification question; no live fast-service request or newly confirmed support is asserted here.

Current host scope: the inspected Pi 0.99.1 pre-dispatch extension hooks do not expose verified request provider/API/authentication. `ctx.model` is the live selection, not an immutable physical request identity; a payload model string and headers alone are insufficient. Report unsupported and omit both mutations on this surface, including previously working-looking direct physical selections. Preserve enabled intent. This is an omission for the inspected hook shape, not a claim that every future Pi release is unsupported or a dependency on a proposed upstream API.
:::

:::mara requirement REQ-FAST-REQUEST
:mid: 01M3M87MGREZ4046EBXP2766VJ
:title: Apply only compatible fast request options without overwriting others
:status: accepted
:kind: functional
:contributes_to: GOAL-FAST-MODE

When enabled and the verified actual request model is eligible, inject `speed: "fast"` for Anthropic Messages or `service_tier: "priority"` for either OpenAI Responses API. Do not replace an existing injection field, inject into a non-record payload, or inject if the outgoing payload's `model` does not exactly equal the verified actual request model's original id. For eligible Claude requests, add `fast-mode-2026-02-01` to the outgoing `anthropic-beta` header. For Claude OAuth also include `claude-code-20250219` and `oauth-2025-04-20`. Preserve existing beta tokens, avoid duplicates, and retain an existing header key's casing. Change only outgoing headers, not stored model headers. If disabled or unsupported, leave headers and payload untouched, including any pre-existing fast option.
:::

:::mara requirement REQ-FAST-STATUS
:mid: 01M3M87NCSEA435RZEQ77JVMVZ
:title: Display short, truthful fast-mode status
:status: accepted
:kind: functional
:contributes_to: GOAL-FAST-MODE

Publish a visible status even when disabled: `fast off` (muted) when off; `fast on` (accent) when enabled and the current model is eligible; `fast n/a` (warning) when enabled but the current model is unsupported. Refresh the status after restoration, toggle, model selection, or a change in publicly established request-model applicability. Unknown routed applicability is unsupported, not a guess from the selected model or an unrelated earlier request. Publish through [[DES-STATUSLINE-PROTOCOL]] so the native Pi footer displays it and a late custom footer can recover the structured state. The display reports eligibility, not proof that any particular outgoing request was modified.
:::

:::mara design DES-FAST-SESSION
:mid: 01M3M87P8C46SZWZAGKTDVP4XG
:title: Restore intent from branch history and honor the launch override
:status: accepted
:kind: behavior
:satisfies: REQ-FAST-CONTROLS
:satisfies: REQ-FAST-SESSION

Register the flag, command, and shortcut at extension load. Persist `{ enabled: boolean }` as a Pi custom entry with custom type `fast` after each actual toggle or explicit state change; no entry is needed for status queries or an idempotent on/off. Restore the last valid entry from `sessionManager.getBranch()` on session start and tree changes. Apply the launch flag after branch restoration; do not rewrite the branch merely because the flag was supplied. Keep live state scoped to the current session manager. Reconstruct state on reload rather than relying on extension-process memory. If an explicit on/off happens with `--fast`, its value governs until the next restoration. A no-op explicit command should not change state or append an entry; it can still report the current state.

Implementation state: command/shortcut/flag, branch restoration and the launch override are implemented and tested with a Pi API fixture. A packed npm consumer has loaded the extension with Pi 0.87.1 and executed `/fast on` without a model call, confirming an enabled custom entry. Real Pi resume, reload, and branch navigation have not been exercised.

The conservative repair retains controls, entries, restoration and launch precedence without rewriting preferences or settings. Source and fresh packed Pi 0.99.1 SDK loopback checks also execute `/fast on` and observe its enabled custom entry despite unsupported applicability. The earlier Pi 0.87.1 result above is historical, not current SDK evidence.
:::

:::mara design DES-FAST-REQUEST
:mid: 01M3M87Q3H76PTZ02DPTMW10H8
:title: Determine eligibility per event and modify only outgoing data
:status: accepted
:kind: behavior
:satisfies: REQ-FAST-ELIGIBILITY
:satisfies: REQ-FAST-REQUEST

Evaluate eligibility for both `before_provider_headers` and `before_provider_request` using public facts about the actual request model/API/authentication, not a cached selection or an assumed virtual-model route. Establish the usable public hook fields before implementing routed support; if a hook cannot safely identify the actual request, make no fast-mode mutation there. Do not inspect private routing state or add a router. The header hook adds the Claude beta tokens only when enabled and eligible; comma-separated existing beta tokens are trimmed and deduplicated in their original order, followed by required OAuth and fast-mode tokens. Find an existing `anthropic-beta` header case-insensitively; otherwise create the lowercase key. The request hook returns a shallow copy with the new field only when enabled, eligible, payload is a non-array object, its model matches exactly, and the field is absent. Otherwise return no replacement. Do not mutate stored model headers. Preserving existing fields and stored headers follows the reference safety behavior; the newly agreed routed-model rule is separate. Other extensions may independently set conflicting headers or fields.

Implementation state after the conservative repair: pure transformations consume explicitly verified `FastRequestFacts` (actual model/API/provider and known OAuth boolean), not an extension context or registry lookup on a selected model. Missing identity or authentication is unsupported. Their tests preserve allowlist, exact ID matching, field preservation and beta merging, but do not prove host integration or live fast-service support.

The Pi adapter intentionally supplies no request facts at either wire hook. Pi 0.99.1 declares only `{ type, headers }` and `{ type, payload }`; `ctx.model` is live selection and can change during an in-flight physical request. No registry search by bare ID, stored headers, route cache, assistant/stream history, private state, or provider display name establishes the missing facts. Both hooks leave data untouched for physical and virtual selections, and unsupported applicability is reported. Other extensions remain free to manage their own fields.

Observed verification: the source SDK and a fresh installed npm artifact replay a credential-free loopback Completions request, changing selection to a same-ID Responses model at the header boundary. The original extension added `service_tier: priority` to the wrong wire API; the repaired extension leaves it absent. This verifies no-mutation safety, not provider fast-service acceptance. The installed CLI is Pi 0.99.2; repository and packed consumer SDK checks use 0.99.1. No CLI fast request or live service experiment was run.
:::

:::mara design DES-FAST-STATUS
:mid: 01M3M87QZN03H2FTT0R11KCD7Z
:title: Register a session-scoped status producer
:status: accepted
:kind: interface
:satisfies: REQ-FAST-STATUS

Use the current `@araketski/pi-statusline-protocol` `registerStatus` API, not main's older `publishStatus`/`registerStatusProvider` API. Register once per session with stable source `fast-mode` and key `fast`, and register the semantic appearance `{ default: 'muted', byState: { on: 'accent', unsupported: 'warning' } }`. Publish the three agreed texts and semantic states `off`, `on`, `unsupported` through the handle's `update`; dispose on session shutdown. The protocol resolves the current state's color for native `setStatus` fallback and carries the full appearance mapping in updates and snapshots so a late custom footer can recover it. No protocol change or producer re-registration is needed. Do not infer actual request success from eligibility. See [[DES-STATUSLINE-PROTOCOL]] for the library contract.

Implementation state: native fallback, state-color transitions, structured snapshot recovery, and shutdown disposal are implemented and verified in a mocked Pi API fixture. Packed Pi 0.87.1 consumer loading and command execution succeeded; interactive footer rendering has not been directly observed.

On the inspected 0.99.1 hook surface, enabled always publishes `fast n/a`, even for an allowlisted physical selection; off still publishes `fast off`. Command notifications explain that public request identity/API/authentication is unavailable rather than promising support after a model switch. No post-response or other-branch observation promotes applicability. Current fixture coverage checks off/unsupported, restoration, selection changes, late snapshots and disposal. The `on` state/color remains the contract for safely established eligibility, not an observed current host capability.
:::

:::mara decision ADR-FAST-FLAG-PRECEDENCE
:mid: 01M3M87RTHVYKZ46WV5VC1M9WX
:title: Make --fast a restoration override, not an unchangeable lock
:status: accepted
:justifies: REQ-FAST-SESSION

A saved off entry must not defeat an explicit `--fast` invocation. Apply the flag whenever branch state is restored, but let the user turn fast mode off within the running session. This preserves a useful startup override while retaining an immediate escape hatch; reload or branch restoration under the same flag intentionally enables fast mode again. This differs from main, where a saved entry overrides `--fast`.
:::

:::mara verification VER-FAST-CONTROLS
:mid: 01M3M87SQ1303PDJK8YMTRKVFB
:title: Exercise command, flag, branch, and model transitions
:status: accepted
:method: test
:level: integration
:verifies: REQ-FAST-CONTROLS
:verifies: REQ-FAST-SESSION
:verifies: DES-FAST-SESSION

With a Pi extension fixture, exercise `/fast`, F3, explicit `on`, `off`, and `status`, invalid arguments, no-op explicit commands, and their notifications and recorded custom entries. Restore after reload/resume and branch switches with valid and malformed entries, with and without `--fast`. Verify the flag wins on restoration but `/fast off` takes effect until the next restoration. Switch supported to unsupported and back and check that enabled state remains unchanged. A defined method is not an assertion that tests have been run.
:::

:::mara verification VER-FAST-REQUEST
:mid: 01M3M87TKYGX941S9PZ7MQ20FG
:title: Exercise eligibility and request transformations
:status: accepted
:method: test
:level: integration
:verifies: REQ-FAST-ELIGIBILITY
:verifies: REQ-FAST-REQUEST
:verifies: DES-FAST-REQUEST

Cover every allowed model id on each applicable wire API, prefixed proxy ids, unknown ids/APIs, no model, and the Codex OAuth/API-key distinction. Check exact payload model matching, non-record payloads, and existing speed/tier fields. Check Claude headers with absent, mixed-case, user-provided, duplicate, OAuth and non-OAuth beta tokens; disabled and unsupported events leave headers untouched and model configuration unmodified. Exercise the actual Pi event hooks, not just pure helpers, when the package is implemented.

Add regressions for selected virtual versus actual request identity, supported and unsupported routes, changed routes without selection changes, unavailable identity/auth/capability information, and safe no-mutation behavior. Verify the public Pi hook boundary with isolated fixtures before relying on it; unrelated classifier/image requests must not be modified based on the selected chat model. Source/catalog model availability alone does not establish fast-service support, including Sol 6.1. Use fixture no-mutation assertions for native virtual selections with changing payload IDs, including allowlisted/unknown/Sol 6.1 IDs, and identity-free header events. Do not fabricate successful routed integration from those fixtures.

Replay `tests/runtime-smoke.mjs` against source and the fresh installed package through the public Pi 0.99.1 SDK and real loopback transport. Assert a same-ID in-flight selection switch never adds Responses priority to a Completions payload; confirm a finalized response and preserved enabled custom entry, not just archive contents or resource discovery. Run the complete resolved Nx test/typecheck/lint/pi-check targets; freshly pack and run explicit-tarball pi-check-package. Pure helper tests require verified request facts and remain separate from native unsupported/no-op checks. Real fast-service capability, Codex OAuth transport, classifier/image transport and exhaustive routing interleavings are not claimed by this bounded replay.
:::

:::mara verification VER-FAST-STATUS
:mid: 01M3M87VFEA2WM5CKN7H4JHG1X
:title: Check status fallback and late subscriber recovery
:status: accepted
:method: test
:level: integration
:verifies: REQ-FAST-STATUS
:verifies: DES-FAST-STATUS

Exercise off/on/unsupported transitions and updates after model selection, toggle, and restoration. Verify native `setStatus` displays each short text with muted/accent/warning theme colors, and that a late snapshot subscriber receives the current key, source, text, semantic state and the complete state-color mapping; shutdown clears and disposes the producer. Check disabled status remains visible and status queries do not change state. This exercises the existing state-color feature of [[DES-STATUSLINE-PROTOCOL]], not a proposed protocol change.

Exercise routed applicability updates and unavailable actual-model information without reporting eligibility from stale selection/other-branch context. Keep enabled intent distinct from supported applicability. For the current identity-free surface, assert enabled is always unsupported for both physical and virtual selections. Verify `/fast status` explains the hook limitation without appending entries, restoration preserves enabled intent, and switching back to an allowlisted selection does not publish `fast on`. A hypothetical safe on transition is not current native integration coverage.
:::
