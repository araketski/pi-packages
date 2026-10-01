# Session naming

A deliberately small extension to distinguish open Pi windows. The accepted
contract below describes intended behavior, not implementation or passing tests.
Scaffolding will relocate this document to `packages/session-name/docs/` while
preserving Mara identities. Implementation is tracked in Work item
`9b32818a224b4d359fef734b7161f0e5`.

## Scope and reference

The user approved LLM-backed automatic naming, one retry and heuristic recovery,
and an optional session-name-only terminal title. There are no extension commands,
tools, flags, widgets, pickers, success notifications, or extra runtime libraries.
Pi's native `/name` and `/resume` remain the controls.

[@nicknisi/pi-session-name 0.1.11](https://github.com/nicknisi/pi-extensions/tree/main/packages/session-name)
was reviewed only as an algorithm example. Its source, helper dependency, commands
and custom picker are not requirements or implementation inputs. This package is
an independently authored source TypeScript extension using the repository's
`nx-pi` package and extension generators.

## Operational guide

Load the source package with `pi -e ./packages/session-name`, or install its local
path with `pi install ./packages/session-name`. These are development workflows,
not evidence of npm publication. Once an unnamed session's first exchange settles,
its opening text supplies the title request. Saved names appear in native session
selection. Resuming an already named session needs no new title-model request.

The only optional configuration file is `<agent-dir>/session-name.json`, normally
`~/.pi/agent/session-name.json`. Use Pi's configured agent directory, not a
hardcoded home path. Restart or use Pi's built-in `/reload` after editing it.
There is no project layer, watcher, automatic file creation, or environment-based
extension configuration beyond Pi's agent-directory selection.

```json
{
  "provider": null,
  "model": null,
  "thinking": "off",
  "setTitle": true
}
```

Omitted fields inherit those defaults. Both provider/model absent or null use
the model selected in the active session when naming begins. An override requires
both to be nonempty strings; `model` is the exact model ID, not `provider/model`.
`thinking` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`;
provider capabilities still govern the effective request. `off` requests no
reasoning and does not inherit or change the chat session's thinking level.
`setTitle: true` means only the session name; `false` leaves native Pi title
handling alone. An unnamed/cleared session keeps Pi's native title until it has
a name. Invalid JSON, root shape, unknown keys or invalid values ignore the file
with one warning and use defaults. A valid but unresolved model override falls
back to the heuristic rather than silently using another model.

Title generation is an extra, potentially billable model request (at most two
extension-level attempts). It sends only a bounded opening prompt, no files,
tool output, system instructions or assistant history. Pi's provider implementation
may have transport behavior of its own. Pi 0.99.1 does not automatically include
lifecycle-handler nested-call usage in session totals; this extension does not
invent another cost ledger or synthetic conversation messages. The accounting
limitation is not a claim that title generation is free.

Terminal titles require a terminal that honors Pi's title escape sequences. The
custom title relies on native title/event ordering and needs a real TUI check
when the Pi baseline changes. This development increment targets the repository's
pinned Pi 0.99.1; it is not a release or a claim of support for other versions.

## Observable acceptance criteria

- One usable opening prompt produces one persisted concise LLM title; an existing
  name or name metadata (including a deliberate clear) prevents automatic naming.
- Selected-model defaults and explicit provider/model/thinking overrides are
  honored without altering the chat model, thinking, prompt or transcript.
- One retry recovers a transient failure; permanent failures, unusable responses,
  missing models/authentication or exhausted retries yield a safe heuristic name.
- Manual changes, session shutdown/replacement, reload and tree navigation prevent
  late results and cancellation-triggered fallback from writing to another state.
- Enabled title handling finishes with the name alone at startup/resume and after
  renaming; disabled handling makes no extension title API calls in any mode.
- Source and independently installed packed extensions load through Pi; published
  resources include helpers and license, but not tests or Mara specifications.

## Implementation and verification state

Not yet implemented or verified. Accepted knowledge establishes the contract only.

:::mara goal GOAL-SESSION-NAME-WINDOWS
:mid: 01M3VATF1E5EZBEYVPY886GFTF
:title: Distinguish open Pi windows by their task
:status: accepted

A user can identify an open Pi session/window by a concise task name without remembering to name each conversation or reading application and directory decorations.
:::

:::mara requirement REQ-SESSION-NAME-AUTO
:mid: 01M3VATJ7ZZHF64WCGFC6G9VZA
:title: Automatically name an unnamed session once
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-NAME-WINDOWS

After the first settled agent exchange with usable user text on the active branch, derive a concise LLM-backed name from that branch's earliest nonempty user text and persist it with Pi's session-name API. Name at most once per loaded session instance, never rename on subsequent turns, and never overwrite existing session name metadata, including an intentional clear. Extract only text blocks; image-only input without usable text does not consume the opportunity. No additional commands, tools, flags, pickers, widgets or success notifications are registered.
:::

:::mara requirement REQ-SESSION-NAME-MODEL
:mid: 01M3VATNDEHCNP2N8JXNWWEKQW
:title: Select the title model through four optional settings
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-NAME-WINDOWS

Read the optional agent-directory session-name.json at session start/reload. Its only keys are provider, model, thinking and setTitle, with defaults null, null, off and true. Require a complete provider/model pair when overriding the active session selection. Resolve the explicit model through Pi's model registry and use its configured provider/authentication; do not mutate the chat model or thinking level. Invalid files warn and use defaults; unavailable explicitly configured models fall back to a heuristic, not another model. See the operational guide for the complete accepted value set and reload behavior.
:::

:::mara requirement REQ-SESSION-NAME-RECOVERY
:mid: 01M3VATRJV7DS3CSQENC747JPS
:title: Bound generation and recover without repeated naming
:status: accepted
:kind: quality
:contributes_to: GOAL-SESSION-NAME-WINDOWS

Bound title-generation input, output, waiting and attempts. Retry at most once for a recognizable transient HTTP/network/timeout failure; missing authentication, permanent or unclassified failures, unusable output and unresolved model selection fall back to the first nonempty prompt line, safely shortened. Normalize generated names to one safe plain-text line, enforce at most six words and 60 Unicode code points, and exclude control characters. Cancellation is not a provider failure: it must neither retry nor trigger heuristic persistence. Keep the title request outside conversation history and describe its billing/accounting limitation honestly.
:::

:::mara requirement REQ-SESSION-NAME-LIFECYCLE
:mid: 01M3VATVR09RZXM05AHQF421WQ
:title: Respect user naming and reject obsolete asynchronous work
:status: accepted
:kind: quality
:contributes_to: GOAL-SESSION-NAME-WINDOWS

An existing or manually changed name wins, including a manual clear during an in-flight request. Abort and invalidate pending naming/title updates on shutdown, replacement and reload; invalidate naming on tree navigation. Recheck the captured session identity and leaf before writing. A provider that resolves after cancellation cannot change the active session, restore a cleared name, cause fallback or update a replacement window. Cleanup is idempotent. No naming state is written directly into session files.
:::

:::mara requirement REQ-SESSION-NAME-TITLE
:mid: 01M3VATYXHD8CCR997FDNWZ0PG
:title: Optionally use only the session name as terminal title
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-NAME-WINDOWS

With setTitle true, the final interactive terminal title of a named session contains only its safe plain-text session name, no application label, directory or other prefix/suffix. Apply it after startup/resume/reload and session-name changes, after native Pi title updates. Do not override unnamed/cleared native titles. With setTitle false never call the title API and let Pi's own formatting operate. Terminal-only behavior is restricted to TUI mode; naming still works without a terminal UI.
:::

:::mara design DES-SESSION-NAME-ALGORITHM
:mid: 01M3VAV21Z7CVFH7SM4D7A4FCG
:title: Use a guarded settled-event title request and native metadata
:status: accepted
:kind: behavior
:satisfies: REQ-SESSION-NAME-AUTO
:satisfies: REQ-SESSION-NAME-MODEL
:satisfies: REQ-SESSION-NAME-RECOVERY
:satisfies: REQ-SESSION-NAME-LIFECYCLE
:satisfies: REQ-SESSION-NAME-TITLE

At session_start, invalidate old work, reread the four-key configuration and detect prior session_info metadata. On agent_settled, reserve one naming opportunity and capture session ID/leaf before reading the branch's first usable user text. Use modelRegistry.streamSimple with a dedicated system prompt asking only for a short task title and at most 1000 Unicode code points of prompt text. Use request-local thinking, a 128-token output budget, a 10-second deadline per attempt and maxRetries: 0 where the provider honors it. Capture HTTP status through the public response callback; recognize 408, 429, 5xx and network/timeout failures for one immediate retry, otherwise recover heuristically. Aborted responses are discarded. Clean the first nonempty returned line, strip surrounding quotes/backticks and trailing sentence punctuation, limit to six words and 60 code points; use the same character limit for the fallback. Before applying, require the same operation/session/leaf and no name metadata change, then call setSessionName. Use session_info_changed to cancel pending work on user changes and mirror the current safe name through ui.setTitle only in TUI mode. Defer startup mirroring by one event-loop tick to run after Pi's native startup title update; cancel the timer on shutdown/start. No polling or raw escape writes. Native unnamed titles remain intact. Text extraction, normalization and config parsing are small local helpers, not shared infrastructure.
:::

:::mara scenario SCN-SESSION-NAME-RECOVERY
:mid: 01M3VAV57CR3FDEYRJ6XR9Y275
:title: A title-model outage still leaves an identifiable window
:status: accepted
:contributes_to: GOAL-SESSION-NAME-WINDOWS

An unnamed session completes its first exchange. Its title request gets a transient failure, retries once, and fails again. The extension persists a safe shortened opening line and shows it alone in the interactive terminal title. Further turns make no new naming request. With setTitle false the same persisted name is used by native Pi formatting instead.
:::

:::mara scenario SCN-SESSION-NAME-CANCEL
:mid: 01M3VAV8DHVYTRWHYH37DBA56S
:title: A manual clear or session change wins over a late title
:status: accepted
:contributes_to: GOAL-SESSION-NAME-WINDOWS

A title request is pending when the user clears the name, navigates the tree, reloads or replaces the session. The request is cancelled and its late response is ignored. No heuristic is applied to the cleared/replacement state. Existing names remain visible in the native session picker; resumed names use the selected terminal-title behavior without another title request.
:::

:::mara verification VER-SESSION-NAME-CONFORMANCE
:mid: 01M3VAVBMA73XVSEV0NV22YBDN
:title: Verify naming, recovery, cancellation, loading and terminal titles
:status: accepted
:method: test
:level: integration
:verifies: REQ-SESSION-NAME-AUTO
:verifies: REQ-SESSION-NAME-MODEL
:verifies: REQ-SESSION-NAME-RECOVERY
:verifies: REQ-SESSION-NAME-LIFECYCLE
:verifies: REQ-SESSION-NAME-TITLE
:verifies: DES-SESSION-NAME-ALGORITHM
:validates: SCN-SESSION-NAME-RECOVERY
:validates: SCN-SESSION-NAME-CANCEL

Use offline deterministic providers and lifecycle fixtures to check all observable acceptance criteria, including text blocks/image-only prompts, the complete config defaults/value checks, transient retry versus permanent failure, timeout, empty/unsafe/overlong output, no-model/auth failures, manual clear, late provider results, shutdown/reload/switch/tree change, and title API absence when disabled or non-TUI. Check prior metadata on reopening. Through the Nx test target, load source and packed artifacts with the pinned Pi SDK in isolated agent directories; install the packed artifact outside the development workspace. Run a real Pi pseudo-terminal test and inspect the final emitted OSC title after startup and native renaming, in enabled and disabled configurations. Run Nx typecheck/lint/pi-check and explicitly pack for pi-check-package; inspect published file selection and license. Run format/sync/frozen-install checks and complete Mara validation. These definitions do not claim any tests have run.
:::
