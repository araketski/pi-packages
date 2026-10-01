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

Restore useful fast service for directly selected physical models through supported public Pi hooks. Eligibility uses the selected model's wire API and ID and the configured authentication reported by Pi. This is the explicitly restored selection-based compatibility path, not proof of immutable physical request identity. Native virtual selections (`pi-virtual`) remain unsupported; do not infer their route from payload IDs, earlier responses, or a registry search.

For `anthropic-messages`, recognize only `claude-opus-4-6`, `claude-opus-4-8`, `claude-opus-5`, and `claude-opus-5-5`. For both `openai-responses` and `openai-codex-responses`, recognize only `gpt-5.4`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-sol`, and `gpt-6-luna`. Strip at most one leading `anthropic/` or `openai/` model-id prefix for eligibility, retaining the original id for request matching. Codex Responses additionally requires `modelRegistry.isUsingOAuth(model)` for the selected model; OpenAI Responses does not. Absent, unrecognized, or ineligible models are unsupported.

The explicit allowlist is not automatically expanded by Pi catalog updates or campaign model selection. Sol 6.1 support remains a separate verification question; no live fast-service request or newly confirmed support is asserted here.

The user's restoration request supersedes the blanket omission that disabled all direct models. Keep payload ID/API-shape guards and existing-value preservation, but do not require an unavailable request-identity API before allowing ordinary direct use. The live selection is mutable: identical-ID provider/auth changes, request overrides, and unrelated nested calls are not comprehensively isolated by these hooks. In particular the header hook carries no payload/model. Document this compatibility limitation rather than presenting selected metadata as verified request facts or claiming routing-aware safety.
:::

:::mara requirement REQ-FAST-REQUEST
:mid: 01M3M87MGREZ4046EBXP2766VJ
:title: Apply only compatible fast request options without overwriting others
:status: accepted
:kind: functional
:contributes_to: GOAL-FAST-MODE

When enabled and the selected direct model is eligible, inject `speed: "fast"` for Anthropic Messages or `service_tier: "priority"` for either OpenAI Responses API. Do not replace an existing injection field, inject into a non-record payload, or inject if the outgoing payload's `model` does not exactly equal the selected direct model's original id. For eligible Claude requests, add `fast-mode-2026-02-01` to the outgoing `anthropic-beta` header. For Claude OAuth also include `claude-code-20250219` and `oauth-2025-04-20`. Preserve existing beta tokens, avoid duplicates, and retain an existing header key's casing. Change only outgoing headers, not stored model headers. If disabled or unsupported, leave headers and payload untouched, including any pre-existing fast option.

For a payload mutation, require an array `messages` and no `input` for Anthropic, or an array `input` and no `messages` for Responses. Reject missing, incompatible and ambiguous envelopes. These are wire compatibility guards, not authoritative provider/auth identification. The header-only hook uses the eligible direct selection; the cross-request limitation in [[REQ-FAST-ELIGIBILITY]] applies.
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

The earlier conservative repair retained controls, entries, restoration and launch precedence without rewriting preferences or settings. Source and fresh packed Pi 0.99.1 SDK loopback checks also execute `/fast on` and observe its enabled custom entry despite unsupported applicability. The earlier Pi 0.87.1 result above is historical, not current SDK evidence.

The subsequent direct-model restoration leaves persistence and launch precedence unchanged. Positive SDK wire replays verify enabled custom entries as well as actual request mutation; an enabled entry alone is not evidence that fast service was requested.
:::

:::mara design DES-FAST-REQUEST
:mid: 01M3M87Q3H76PTZ02DPTMW10H8
:title: Determine eligibility per event and modify only outgoing data
:status: accepted
:kind: behavior
:satisfies: REQ-FAST-ELIGIBILITY
:satisfies: REQ-FAST-REQUEST

The user explicitly requested usable fast mode after the conservative repair turned all native hooks into no-ops. Restore the existing direct-selection API/model allowlist and configured OAuth check rather than pretending an unavailable request identity has been established. Derive a synchronous `FastSelection` from public `ctx.model` and, for Claude/Codex, `ctx.modelRegistry.isUsingOAuth(model)`. Unknown and virtual APIs are ineligible. No host upgrade, private API, route cache, replacement router, or new provider implementation is involved.

At `before_provider_request`, pass that selection to the transform. When enabled and eligible, require a non-array object, exact original model ID, and the matching Messages/Responses envelope from [[REQ-FAST-REQUEST]]. Return a shallow copy with `speed: "fast"` or `service_tier: "priority"` only if the injection field is absent. Preserve authored values even if null/undefined, and leave mismatched, malformed, disabled, unsupported, or ambiguous payloads untouched. The Messages/Responses guard preserves the same-ID in-flight Completions-to-Responses regression without disabling valid direct Responses requests.

At `before_provider_headers`, apply Claude beta tokens only for an enabled eligible direct Claude selection. Find an existing `anthropic-beta` header case-insensitively; preserve its casing, trim/deduplicate existing comma-separated tokens in order, then append missing OAuth/fast tokens. Change only the outgoing header object, not stored model headers.

This is bounded compatibility, not a routing/identity guarantee. The header hook cannot distinguish unrelated nested requests; same-ID/provider/auth races and per-request overrides are not fully covered. Later hooks may change the request. Status reports selected-model applicability, not actual acceleration or server entitlement. The earlier no-mutation repair remains historical evidence of a real mismatch defect but is no longer the product behavior.

Observed restoration checks use actual SDK 0.99.1 loopback HTTP/SSE for Claude API key/OAuth, OpenAI Responses, and Codex OAuth. They assert positive fast options, completed responses, off mode, authored-field preservation, Codex API-key rejection, and the retained incompatible-API regression. Optional installed Pi 0.99.2 print-mode replay verifies positive Claude/OpenAI/Codex wire mutations using synthetic local credentials. No paid/live service acceptance, latency improvement, arbitrary routing, or interactive TUI conformance is claimed.
:::

:::mara design DES-FAST-STATUS
:mid: 01M3M87QZN03H2FTT0R11KCD7Z
:title: Register a session-scoped status producer
:status: accepted
:kind: interface
:satisfies: REQ-FAST-STATUS

Use the current `@araketski/pi-statusline-protocol` `registerStatus` API, not main's older `publishStatus`/`registerStatusProvider` API. Register once per session with stable source `fast-mode` and key `fast`, and register the semantic appearance `{ default: 'muted', byState: { on: 'accent', unsupported: 'warning' } }`. Publish the three agreed texts and semantic states `off`, `on`, `unsupported` through the handle's `update`; dispose on session shutdown. The protocol resolves the current state's color for native `setStatus` fallback and carries the full appearance mapping in updates and snapshots so a late custom footer can recover it. No protocol change or producer re-registration is needed. Do not infer actual request success from eligibility. See [[DES-STATUSLINE-PROTOCOL]] for the library contract.

Implementation state: native fallback, state-color transitions, structured snapshot recovery, and shutdown disposal are implemented and verified in a mocked Pi API fixture. Packed Pi 0.87.1 consumer loading and command execution succeeded; interactive footer rendering has not been directly observed.

After the user-requested restoration, enabled eligible direct selections publish `fast on`; unsupported models, missing Codex OAuth and virtual selections publish `fast n/a`. Off remains `fast off`. Commands explain the actual model/auth limitation rather than an unconditional public-hook warning. Selection changes refresh applicability without erasing intent. Fixtures cover supported/unsupported/back, restoration, late snapshots and disposal. The status indicates selected-model eligibility, not proof of a particular wire mutation or server-side acceleration.

Workspace implementation prerequisite: the source-distributed extension imports the compiled statusline-protocol library and its declarations. The package's Nx `typecheck` target declares `dependsOn: ["^build"]`, so the resolved project graph builds workspace dependencies before invoking `tsc --noEmit`. It needs no manual protocol prebuild and does not introduce a fast-mode build target, dependency/version change, or runtime behavior change. Packing still uses freshly generated protocol output; the static Pi archive check does not build dependencies implicitly.
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

Native hook tests must include positive direct Claude/OpenAI/OAuth Codex mutations and `fast on` status, not only no-op assertions. Also cover unsupported/virtual selections, unknown models, missing OAuth, disabled state, malformed/missing/ambiguous request envelopes, exact ID mismatches, and authored speed/tier fields. Ensure Messages-shaped requests never receive Responses priority even after an in-flight selection changes to the same model ID. Keep all existing control/branch/status regressions.

Replay `tests/runtime-smoke.mjs` through the source extension and the freshly installed npm package with SDK 0.99.1. Its local HTTP/SSE server records actual outgoing payloads and headers and supplies completed responses. Assert Claude API-key/OAuth speed and beta tokens, OpenAI/Codex priority, off behavior, preservation of authored fields, unsupported Codex API-key behavior and the incompatible-API case. Decode Codex's native zstd request body in the fixture instead of mistaking compression for an extension failure. All credentials are synthetic and endpoints loopback-only.

Optionally set `FAST_MODE_CLI=/absolute/path/to/pi` while running the source load target through Nx to replay direct Claude/OpenAI/Codex `--fast` requests on an installed CLI too. Use a disposable agent directory, no discovered resources/tools/context files, offline mode, closed child stdin, and `--` before the positional prompt so Pi does not consume it as an extension-flag value. SDK/package verification remains pinned independently of this optional CLI check.

Run resolved test/typecheck/lint/source Pi targets, freshly pack and run explicit-tarball pi-check-package, and validate Mara. Positive loopback wire evidence establishes request mutation and completed native transport, not paid service acceptance or latency improvement. No universal same-ID auth/provider race, unrelated nested-header isolation, or routed fast-service safety claim is permitted.

Fresh-output configuration regression: in an isolated checkout, first identify `packages/statusline-protocol/dist/` as only generated, ignored compiler output (including its incremental build-info file), with no tracked/authored files or symlinks. Remove only those disposable outputs, then run standalone `CI=1 pnpm nx run @araketski/pi-fast-mode:typecheck --skip-nx-cache --outputStyle=static` without another target or manual prebuild. Require Nx to run the dependency protocol's build before fast-mode typecheck, recreate its declarations, and exit successfully. Inspect the resolved configuration with `pnpm nx show project @araketski/pi-fast-mode --json`; success after an unrelated prebuild or concurrent multi-target run does not establish this prerequisite.

Observed follow-up: with protocol output absent, the original standalone target failed with two TS2307 errors for `@araketski/pi-statusline-protocol`. After declaring `^build`, the same command passed from that unchanged absent-output state and Nx scheduled the protocol build first. This is configuration red/green evidence, not a claim of additional native fast-service capability. The regression method above is repeatable without a new test framework or destructive cleanup of authored files.
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

Check positive `fast on` status for supported direct selections as well as unsupported virtual/unknown selections and Codex without OAuth. Switch supported to unsupported and back without changing saved intent. `/fast status` must be read-only, and enabling an eligible direct selection must not emit the old blanket no-op warning. Do not interpret status as physical request identity, service entitlement, or evidence of speedup.
:::
