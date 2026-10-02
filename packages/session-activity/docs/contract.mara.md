# Session activity reporter

`session-activity` exposes what the main Pi agent is doing now through
statusline-protocol key `activity` and, when available, Herdr's standard custom
`$activity` metadata token. It requires no particular renderer.
The structured contract below records accepted intended behavior; acceptance is
not evidence of implementation or passing runtime tests.

## Responsibility boundaries

| Surface                  | Meaning                           | Owner                          |
| ------------------------ | --------------------------------- | ------------------------------ |
| Pi session name          | What the agent is responsible for | Existing naming behavior       |
| Herdr lifecycle status   | Working / blocked / done / idle   | Existing lifecycle integration |
| Herdr `$activity`        | What the agent is doing right now | `session-activity`             |
| Pi statusline `activity` | The same current-work phrase      | `session-activity`             |

Only the activity key/token is published/cleared. The extension does not change
session names, titles, lifecycle status, unrelated statuses/metadata or other
agents, and sends no inter-agent messages. Consumers choose how to display it.
The protocol provides native footer fallback and late snapshot recovery; the
custom footer can display the key with the direct `"activity"` layout token or
include it in the `"statuses"` aggregate. Its default layout and user configuration
are not changed. No default prefix, color or state is assigned.
Example values: `Running parser tests`, `Investigating API schema`.

## Configuration and integration reference

For a development invocation, run `pi -e ./packages/session-activity` from the
workspace root in a main Pi TUI session, with or without Herdr. To persist a
repository-local installation, use
`pi install ./packages/session-activity --local` and native `/reload`; installation
is an explicit user action, not part of this implementation. The package is source
TypeScript loaded by Pi, with no extension build step. Its runtime dependency
`@araketski/pi-statusline-protocol` is a compiled library: build it through Nx
before local source consumption, and include its fresh archive in isolated packed
consumer checks. The current increment is not an npm publication.

Model selection and configuration follow the
[session-name pattern](../../session-name/docs/contract.mara.md), without its
`setTitle` behavior or heuristic fallback. The only optional file is
`<agent-dir>/session-activity.json`, normally `~/.pi/agent/session-activity.json`;
respect Pi's configured agent directory. It is read at start/reload only within
eligible root/main-TUI scope, independently of Herdr availability. No project layer, file watcher or automatic file
creation exists. Restart or `/reload` after editing it.

```json
{
  "provider": null,
  "model": null,
  "thinking": "off",
  "intervalTurns": 5
}
```

Omitted fields inherit these defaults. Provider/model must both be null/unset or
both nonempty strings, with an exact model ID resolved through Pi's registry and
authentication. The active model is selected when generation begins, independently
of chat thinking. `thinking` accepts `off`, `minimal`, `low`, `medium`, `high`,
`xhigh` or `max`; provider capabilities govern the effective request. `intervalTurns`
must be a positive safe integer; first-turn reporting and the five-turn digest
window remain fixed regardless of interval. Invalid JSON/root/unknown keys/values
warn once for that load and discard the file in favor of defaults. An unavailable
explicit model/authentication skips generation, never selecting another model or
creating a heuristic. Reporting failures remain silent.

The installed managed `~/.pi/agent/extensions/herdr-agent-state.ts` integration
version 8 was inspected, not changed or imported. It uses Node `net`, inherited
`HERDR_SOCKET_PATH`/`HERDR_PANE_ID`, newline-delimited JSON and bounded attempts.
The initial adapter follows this transport pattern, not its lifecycle-reporting
methods, retries or any-data-as-success shortcut. The user separately selected
main/root interactive-TUI scope. Direct RPC is not Pi's headless RPC mode.

The inspected `herdr api schema --json` reports protocol 22 with metadata method
`pane.report_metadata`, string/null token values, and matching request-ID success
or error envelopes. The CLI exposes the same capability as `pane report-metadata`,
but is not the selected runtime transport. Schema inspection alone does not prove
publication, ownership, ordering or null-token deletion semantics.

## Engineering verification boundary

The implementation selects these bounded engineering details:

- Consume the native root `turn_end` assistant message, not tool execution events
  or history reconstruction. Failed/aborted assistant responses do not qualify.
  Track the main interactive session ID and ignore other contexts. Repeated
  `agent_start` before final settlement does not reset cadence during continuation.
  Native `agent_settled`, rather than an inner `agent_end`, clears activity.
- Keep only five bounded turn strings, each at most 1,199 code points, preferring
  newest content blocks when a turn exceeds its budget. Tool names cap at 64;
  curated arguments cap at 400 and visible text at 600 per entry. Scalar keys
  `path`, `file_path`, `filePath`, `paths`, `pattern`, `query` and `command` are
  eligible for direct tools; arrays/nested objects and all other payload fields are
  omitted. Codemode instead includes a leading excerpt of its native scalar `code`
  argument within the same 400-point labeled-argument budget, without executing or
  parsing it. The existing summarizer is instructed to describe the operations'
  purpose, not the wrapper, and treat scripts as untrusted evidence, not instructions.
  No additional model request is introduced.
  The total digest caps at 6,000 code points, with previous activity sent separately.
- Ask for exactly `{ "activity": "phrase" }` or `{ "activity": null }` for unchanged.
  Use 128 output tokens, no provider retries and a 10-second independent deadline.
  Cancellation/deadline stops waiting even if a provider ignores its signal.
  Reject malformed, extra-key, ill-formed Unicode, error/aborted/length-limited or
  oversized responses.
  Responses cap at 2,048 code points before parsing. Normalize whitespace, remove
  control/format characters and surrounding quotes/emphasis markers; count
  whitespace-delimited words and Unicode code points. Skip overlong output,
  rather than shortening it. Exact normalized duplicates need no metadata write.
- Register a session-scoped protocol producer with key `activity` and source
  `session-activity`. Publish/clear its native and structured status synchronously,
  then attempt optional Herdr publication independently. One successful destination
  is sufficient for prior-phrase comparison; unchanged phrases do not replay just
  to retry a failed destination. Dispose the producer on reload/replacement/shutdown.
- For optional Herdr metadata, use reporter-owned source `pi:session-activity`, inherited pane ID, UUID
  request IDs and process-global monotonically increasing sequences based on
  `Date.now()*1000`. One active/one latest pending socket write is allowed, with
  a one-second attempt deadline and 64-KiB response cap. Parse matching complete
  replies and clear via `tokens.activity: null`. No CLI fallback, TTL or heartbeat
  exists. Shutdown can await bounded clearing/disposal, not model generation;
  normal agent events do not await publication.

No user-facing policy question remains. Orderly cleanup cannot guarantee removal
after a hard kill or unavailable server. Sequence ordering across separate
processes under clock rollback is not guaranteed; multiple root processes sharing
one pane are outside the selected scope. Curated arguments can still contain
sensitive text. The user-approved codemode excerpt is an explicit exception to
omitting embedded file/edit/bulk payloads: it is not redacted and may expose such
content to the configured summarizer. The size cap is not a privacy guarantee.
Leading excerpts can miss later operations; purpose inference does not prove
execution or success. Semantic unchanged detection is a best-effort model instruction.
Extra summary requests may be billable. Pi 0.99.1 lifecycle-handler stream usage is
not automatically added to session totals; this extension creates no synthetic
messages, tool results or alternate cost ledger to conceal that limitation.

## Implementation and verification state

Implemented under `extensions/session-activity/` as configuration, digest,
summary, coordinator, publisher and event-wiring modules. The replaceable
`ActivityPublisher` keeps transport details out of summarization/lifecycle logic.
Local `nx-pi` generators created the package and extension; Mara relocated all
13 structured items with stable IDs/MIDs, and obsolete staging files were removed.
An explicit publication allowlist includes runtime helpers and excludes tests and
repository specifications. License material is included, not legally certified by
technical checks. Work items: scaffold `9cea6c681f44425ebb2f1818dfbcefc2` and behavior
`9a3b2ba6eae34fc6afc5e7bfe2e02332`.

Observed on 2026-10-01: the uncached Nx test target passed 59 tests. The red phase
first demonstrated absent behavior modules and then missing event wiring before
implementation; a regression also demonstrated rejection was missing for an
unpaired-surrogate phrase before the validation fix. Behavioral cases cover
config defaults/invalid files/overrides,
digest limits and exclusions, phrase normalization/rejection, cadence/reset,
coalescing, delayed publication, deadline/cancellation, failed writes, replay
ordering, and eligibility/cleanup. Native Pi 0.99.1 Linux pseudo-terminal fixtures
passed for both source and an independently npm-installed fresh tarball, using
only offline HTTP providers. They observe activity while the main response is
still gated, provider/auth/thinking selection, no retry or model fallback,
settlement cancellation, and transcript/name/title isolation. A native print run
with inherited Herdr context makes no reporter requests or metadata writes.

An isolated actual Herdr 0.9.1/protocol-22 server confirms token publication,
null-token deletion, preservation of unrelated tokens/title and working lifecycle
state, and rejection of a stale lower-sequence update after clearing. Disposable
socket fixtures cover fragmented/malformed/error/unmatched/oversized responses,
timeout, cancellation, replacement sequencing and bounded latest-write queuing.
The production managed integration and live user pane were not modified.

Nx lint, typecheck, source `pi-check`, explicit fresh-tarball `pi-check-package`
(within the distribution test), changed-package formatting, workspace sync check
and frozen pnpm installation passed. No dependency versions changed. The
structured verification items define repeatable methods rather than standing
execution assertions; routine observations are recorded here.

Codemode-purpose increment: ten new regression cases cover native code-input
retention for test/documentation batches, Unicode and rolling-window bounds,
missing/non-string inputs, the embedded-content exception, and a single existing
summary request with purpose/untrusted-data instructions. The red phase reproduced
omitted script evidence, then absent prompt guidance. The full uncached Nx suite
passed 69 tests, including the existing source/packed native offline fixtures and
fresh-tarball `pi-check-package`. Nx lint, typecheck, source `pi-check`, changed-file
formatting and complete Mara project validation also passed. These checks verify
input delivery and prompt policy, not paid-model semantic accuracy or a live
managed-pane codemode session.

Statusline-output increment: the root/main TUI now reports through the protocol
whether or not Herdr context is present; headless and nested contexts remain
excluded. Red-phase fixtures reproduced missing local output and the former
Herdr-only gate. The full uncached Nx package suite passed 73 tests, including
native Pi 0.99.1 Linux pseudo-terminal checks for source and independently installed
activity/protocol archives. They observe native footer text, structured publication,
late snapshots and final clearing with and without Herdr, while the main chat is
still gated; cancelled late summaries and print mode publish no local status.
Fixtures also cover independent destination failures, immediate local output during
gated Herdr work, duplicate suppression, unrelated-key preservation, reload/tree
cleanup and snapshot unsubscription. Nx lint, typecheck and source `pi-check`
passed, and the distribution suite runs fresh-tarball `pi-check-package`. The
protocol dependency was explicitly built uncached; its 13 tests, lint, typecheck
and source `pi-check` also passed. Frozen pnpm installation, changed-file formatting
and complete Mara project validation passed. No existing dependency versions changed.

TypeScript-sync follow-up: the statusline-output checks initially used `--skipSync`
while the missing dependency reference was investigated. The installed Nx 23.2.1
generator's root diagnostics mention non-composite Pi packages before filtering
them out; the reviewed dry run changed only session-activity's `tsconfig.json`.
Applying `pnpm nx sync` added its reference to `../statusline-protocol`, preserving
`composite: false`, `noEmit: true` and the unchanged root configuration. The live
`pnpm nx sync:check` now passes. Uncached activity/protocol tests (73 and 13), lint,
typecheck and source `pi-check`, plus the protocol build, passed without
`--skipSync`; the activity suite again ran native source/packed consumers and
fresh-tarball `pi-check-package`. This resolves the sync verification limitation.
Paid-model semantic accuracy and a live user custom-footer layout remain untested
and were not configured by the implementation checks.

No paid model calls, npm publication or persistent user installation were
performed. This is not a blanket compatibility claim for other Pi/Herdr versions
or platforms. Windows endpoint mapping is implemented but not exercised by the
Linux fixtures. Multi-turn policy/reset cases are deterministic fixtures, not
an end-to-end session inside a real Herdr-managed Pi pane.

:::mara goal GOAL-SESSION-ACTIVITY
:mid: 01M3W093BNSK3RXJNTWKRFSV61
:title: Expose current Pi work through statusline and optional Herdr metadata
:status: accepted

Let Pi statusline and Herdr consumers observe what the main Pi agent is doing now without conflating current activity with its stable responsibility or lifecycle status. The standalone session-activity extension publishes statusline-protocol key activity in root/main interactive TUI sessions and the standard custom Herdr $activity token when caller context is available; no particular renderer or layout is required.
:::

:::mara requirement REQ-SESSION-ACTIVITY-ISOLATION
:mid: 01M3W09FSGMT90QTP9VDHR5MF0
:title: Publish only activity in main TUI sessions through supported outputs
:status: accepted
:kind: constraint
:contributes_to: GOAL-SESSION-ACTIVITY

Report only the root/main interactive Pi TUI session, whether or not Herdr caller context is present. Publish the statusline activity key as specified by [[REQ-SESSION-ACTIVITY-STATUSLINE]]. With complete Herdr caller context, also publish the custom activity token through Herdr's standard pane.report_metadata RPC method for the calling Pi agent's pane (exposed by the CLI as pane report-metadata). Headless RPC/JSON/print invocations and nested/subagent sessions must not report or register a status producer even if they inherit pane environment variables. Do not require a particular renderer or repository-specific Herdr extension. Do not change Pi session names, terminal titles, Herdr lifecycle status, unrelated metadata or statuses, or other agents. Do not send messages to other agents or add reporter content to the chat transcript. Outside the supported reporting scope, perform no reporter model requests, status registration or metadata operations.
:::

:::mara requirement REQ-SESSION-ACTIVITY-CADENCE
:mid: 01M3W09W2M6TYTPRK6TAVYQ78N
:title: Refresh from completed main-agent turns on a configurable cadence
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Start with fresh reporting state for each main-agent run: discard the prior run's digest and reset its qualifying-turn counter. Schedule the first background summary after one completed qualifying main-agent assistant turn, then after every five subsequent qualifying turns by default; make the subsequent interval configurable. Tool-calling assistant responses qualify; individual tool completions, nested/subagent work and the reporter's own model calls do not count independently. Reload, session resume/replacement and tree navigation also reset reporting state. If working continues after such a reset, schedule the first summary after the next qualifying turn; otherwise wait for the next run. Do not reconstruct historical activity or immediately summarize on reset.
:::

:::mara requirement REQ-SESSION-ACTIVITY-MODEL
:mid: 01M3W0A8P29G18B05WZB262EBY
:title: Configure reporter model and thinking independently of chat
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Use only the optional session-activity.json in Pi's configured agent directory, normally ~/.pi/agent; respect Pi's agent-directory override rather than hardcoding a home path. Read it at session start/reload in supported reporting scope. Do not add project configuration layering, a file watcher or automatic file creation. Match the model/configuration policy of [[REQ-SESSION-NAME-MODEL]], without its setTitle behavior or heuristic fallback: the only keys are provider, model, thinking and intervalTurns, defaulting to null, null, off and 5. Permit a complete nonempty provider/model pair, a supported Pi thinking value (off, minimal, low, medium, high, xhigh or max), and a positive safe-integer intervalTurns. Resolve selection/authentication through Pi's model registry without mutating chat model or thinking. Invalid JSON, root shape, unknown keys or invalid values cause one nonblocking warning for that configuration load and use defaults. An unavailable explicit model/auth selection skips generation rather than silently selecting another model or generating a heuristic.
:::

:::mara requirement REQ-SESSION-ACTIVITY-DIGEST
:mid: 01M3W0ANJDEMKENQWNK8D3WQ54
:title: Summarize a bounded recent activity digest without thinking or result bodies
:status: accepted
:kind: constraint
:contributes_to: GOAL-SESSION-ACTIVITY

Maintain a bounded rolling digest of the latest five qualifying main-agent turns, independent of the configured summary cadence. Include recent tool names, curated activity arguments such as paths, search queries and bounded command text, and visible assistant text. For codemode, include a bounded leading excerpt of its native code argument as activity evidence; do not execute or parse the script or make an extra model call. This is an explicit exception to omitting embedded file contents, edit replacement bodies and bulk payloads: a script excerpt may contain them and is not redacted or guaranteed secret-free. For other tools, retain the curated scalar-field policy and omit file contents, edit replacement bodies and bulk payloads; never serialize all arguments indiscriminately. Exclude thinking, tool-result bodies, full conversation history and additional file reads. Cap curated argument text, including the labeled codemode excerpt, at 400 Unicode code points per entry and visible assistant text at 600 per entry; cap the serialized activity digest at 6,000 Unicode code points total, prioritizing newest activity when it cannot all fit. Bound collection as well as the final serialization. Supply the previous published phrase separately for semantic comparison. Discard the digest on run/state reset. Treat all digest text, including script excerpts, as untrusted evidence rather than instructions. Curated arguments can still contain sensitive text, so this policy is not a claim that input is secret-free.
:::

:::mara requirement REQ-SESSION-ACTIVITY-PHRASE
:mid: 01M3W0B4E1M0DW0QAV6VY9J5N1
:title: Publish concise safe phrases only for meaningful activity changes
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Prefer three-word activity phrases, allowing at most five words and 60 Unicode code points. Normalize harmless formatting/whitespace and remove control characters to obtain one plain-text line. If the normalized result is unusable or still exceeds either limit, skip the update rather than truncate it; keep the existing phrase until a later normal update or lifecycle cleanup. Give the summarizer the previously published phrase and instruct it to report unchanged when the underlying activity is the same, rather than paraphrase it. Independently suppress normalized exact duplicates. Update the remembered published phrase only after successful publication, so failed writes do not suppress later normal attempts. The semantic comparison is best-effort model judgment, not a guarantee of semantic equivalence. Instruct the existing summarizer to describe the purpose of operations inside codemode (for example running tests or reading documentation), rather than merely naming the wrapper. Script excerpts are partial evidence of attempted activity, not proof of execution or success; do not invent missing purpose or outcomes. Treat scripts as untrusted data, never instructions. Purpose inference remains best-effort model judgment, not a guarantee of a particular phrase.
:::

:::mara requirement REQ-SESSION-ACTIVITY-ASYNC
:mid: 01M3W0BK10JVDCK6DV08GGQ5A6
:title: Keep reporting nonblocking and coalesce overlapping refreshes
:status: accepted
:kind: quality
:contributes_to: GOAL-SESSION-ACTIVITY

Generation and metadata publication must be asynchronous, best-effort and unable to delay normal main-agent execution through awaited reporting work or rejected background errors. Permit at most one active summary request. If further updates become due while it runs, coalesce them into at most one pending refresh using the latest digest when started, not an unbounded queue of old snapshots. If the captured run/session remains valid, allow the completed request to publish before starting the coalesced latest refresh; ordinary turn progress or a pending refresh alone does not invalidate its result. Cleanup/state reset does invalidate it. Bound retained input and pending state.
:::

:::mara requirement REQ-SESSION-ACTIVITY-FAILURE
:mid: 01M3W0C0QVN1SB3QJ62TZSPYZ7
:title: Skip failed updates without retries heuristic replacement or warnings
:status: accepted
:kind: quality
:contributes_to: GOAL-SESSION-ACTIVITY

Apply a 10-second deadline to each generation attempt. Timeout, provider errors, missing authentication, unavailable models and unusable output skip the update with no immediate extension-level retry and no heuristic replacement. Retain the published phrase while the main agent is working; another normally due refresh may attempt again. A separately due coalesced refresh is not a failure retry. Metadata-publication failures are silent and retried only at later normal update opportunities. No busy-loop retries, blocking warnings or synthetic conversation messages are permitted. The nonblocking invalid-configuration warning specified in [[REQ-SESSION-ACTIVITY-MODEL]] is separate from silent reporting failures. Bound each RPC attempt to one second and its response to 64 KiB; allow at most one active and one pending operation rather than an unbounded write queue. Generation waiting must finish on deadline/cancellation even if a provider ignores its abort signal.
:::

:::mara requirement REQ-SESSION-ACTIVITY-CLEANUP
:mid: 01M3W0CGHBTYYHR1S6FNEKXTQH
:title: Clear stopped activity and reject late asynchronous publication
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Clear the reporter's statusline activity and optional Herdr activity token when the main-agent run finally stops, by completion or abort, and on reload, session resume/replacement, tree navigation or orderly shutdown. Reset counters, digest and prior-phrase comparison state at reporting resets. An inner turn ending or agent_end before automatic continuation is not proof of final settlement. Invalidate pending generation/publication, make cleanup idempotent, and prevent late results from restoring cleared activity or affecting a replacement run/session. Clear only the reporter's activity key/token, not unrelated statuses or metadata. Dispose the protocol producer and its snapshot listener on reload, session replacement or shutdown; keep it available across run/tree resets. A run settling before its first summary completes may publish no phrase. Use orderly cleanup only: do not add a reporter TTL, heartbeat or repeated identical lease-renewal writes. If Pi is killed or clearing fails while Herdr is unavailable, stale metadata may remain subject to Herdr's own cleanup; the extension does not guarantee crash cleanup.
:::

:::mara verification VER-SESSION-ACTIVITY-CONTRACT
:mid: 01M3W0DC9AJWYKNK7VBTV7ZD3Z
:title: Verify cadence isolation asynchronous reporting and Herdr cleanup
:status: accepted
:method: test
:level: integration
:verifies: REQ-SESSION-ACTIVITY-ISOLATION
:verifies: REQ-SESSION-ACTIVITY-CADENCE
:verifies: REQ-SESSION-ACTIVITY-MODEL
:verifies: REQ-SESSION-ACTIVITY-DIGEST
:verifies: REQ-SESSION-ACTIVITY-PHRASE
:verifies: REQ-SESSION-ACTIVITY-ASYNC
:verifies: REQ-SESSION-ACTIVITY-FAILURE
:verifies: REQ-SESSION-ACTIVITY-CLEANUP
:verifies: REQ-SESSION-ACTIVITY-STATUSLINE

Repeat deterministic behavioral fixtures and native Pi/Herdr integration checks. This item defines a verification method, not a standing passing execution result; observed executions and limits are recorded in the document's implementation state.

| Case                    | Observable expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadence/reset           | Fresh state per run; interval five triggers at turns 1, 6 and 11 and a nondefault interval changes spacing. Tool-calling responses qualify, not tool-result multiplicity, nested/subagent work or reporter requests. Failed/aborted assistant responses do not qualify. Reload, resume/replacement and navigation cancel/clear/reset without reconstructing history, then wait for the next qualifying turn if working.                                                                                                                               |
| Eligibility             | Only the root main TUI reports. Without Herdr context, statusline still works and no socket requests occur. Headless RPC/JSON/print and nested/subagent contexts make no model/status/metadata requests.                                                                                                                                                                                                                                                                                                                                              |
| Configuration/model     | Agent-directory-only session-activity.json is read at start/reload. Validate exact supported keys and positive safe-integer intervalTurns; invalid files warn once for the load and use defaults. Default active model/thinking off and explicit provider/model/thinking overrides do not alter chat settings. Missing model/auth skips without fallback.                                                                                                                                                                                             |
| Digest                  | Latest five turns independent of cadence, curated arguments at most 400 code points per entry, visible text at most 600 and serialized digest at most 6,000, with retained collection bounded. No thinking, result bodies, full history or additional reads enter provider input. Direct tools omit file contents, edit replacements and bulk payloads; codemode retains only a labeled leading code excerpt within the same 400-point argument cap, with embedded payload exposure explicitly allowed. Previous phrase is separate comparison input. |
| Phrase                  | Target three words, at most five words/60 code points after normalization. Reject overlong/unusable output rather than truncate. Explicit unchanged and normalized exact duplicates cause no write. Failed writes are not recorded as published. Semantic fixtures do not guarantee universal equivalence judgment.                                                                                                                                                                                                                                   |
| Concurrency/failure     | Gated generation/transport does not block main work or settlement. One request and one latest pending refresh remain bounded. Valid earlier results may publish before the latest refresh; resets forbid old results. Ten-second generation deadline/cancellation ends waiting even for an uncooperative provider. No immediate retry, heuristic or unhandled background rejection; later normal opportunities can recover.                                                                                                                           |
| Cleanup                 | Final settlement/abort/reset/shutdown clears only activity and rejects late work. Inner turn/agent end alone does not clear. Disposal/cleanup is idempotent and bounded. No TTL or heartbeat exists; hard-kill removal is not guaranteed.                                                                                                                                                                                                                                                                                                             |
| Native consumption      | Native Pi 0.99.1 TUI source and independently installed packed extensions publish while chat remains gated, respect provider/auth/thinking selection, leave transcript/name/title unchanged and cancel at settlement. A headless inherited-context run reports nothing.                                                                                                                                                                                                                                                                               |
| Standard Herdr metadata | Independently verify token publication/clear and unrelated token/title/lifecycle preservation in an isolated actual Herdr pane/session. No renderer-specific installation or inter-agent messages are required.                                                                                                                                                                                                                                                                                                                                       |

Use offline gated providers and disposable Herdr fixtures. Never mutate another contributor's pane or contact a paid provider merely to run the suite. Native checks use the selected repository Pi baseline. Record actual results separately; deterministic fixtures and independent native layers do not prove an unrun combined managed-pane end-to-end session.

Codemode regression fixtures use the native { code: string } argument shape with batched test commands and documentation reads. Assert that those cues reach the existing summary request, that the prompt asks for enclosed purpose instead of the wrapper name and treats scripts as untrusted evidence, and that only one model request is made. Check Unicode truncation, invalid/missing code arguments, direct-tool exclusions, rolling-window reset and total digest bounds. Offline model fixtures verify evidence and instructions, not live semantic accuracy.

Exercise protocol key activity/source session-activity in root TUI sessions with and without Herdr. Verify native fallback, late snapshot recovery, identical phrase across outputs with one generation request, unchanged suppression, status clearing on settlement/tree/reload/shutdown, snapshot listener disposal and stale-result rejection. Gate/fail Herdr publication and clearing: local status must appear/clear immediately and unrelated status keys remain untouched. Gate/fail local protocol updates: Herdr must still be attempted. Native source and independent packed-consumer fixtures observe protocol events and clear with no Herdr context as well as dual output; pack the explicitly built protocol dependency and verify frozen-lockfile workspace installation.
:::

:::mara requirement REQ-SESSION-ACTIVITY-TRANSPORT
:mid: 01M3W0NS3QHGB5945Y5GYSVMES
:title: Use direct Herdr RPC behind a replaceable activity publisher
:status: accepted
:kind: constraint
:contributes_to: GOAL-SESSION-ACTIVITY

Use direct Herdr socket RPC for the initial metadata transport, following the transport pattern inspected in the installed managed Pi integration. Isolate it behind a small replaceable activity-publisher interface so generation, cadence, semantic deduplication and Pi lifecycle handling do not depend on Herdr socket framing, request fields or endpoint discovery. A replacement adapter must support the same availability, publish, clear, cancellation and bounded best-effort completion contract without changing activity behavior. Do not import or modify Herdr's managed integration, reuse its lifecycle source, or introduce a transport plugin registry or user-facing transport selector merely to enable later replacement.
:::

:::mara design DES-SESSION-ACTIVITY-PUBLISHER
:mid: 01M3W0PMQDT9NJQ27R2DT3B3YZ
:title: Separate activity behavior from statusline and optional Herdr publication
:status: accepted
:kind: interface
:satisfies: REQ-SESSION-ACTIVITY-TRANSPORT
:satisfies: REQ-SESSION-ACTIVITY-ISOLATION
:satisfies: REQ-SESSION-ACTIVITY-ASYNC
:satisfies: REQ-SESSION-ACTIVITY-FAILURE
:satisfies: REQ-SESSION-ACTIVITY-CLEANUP
:satisfies: REQ-SESSION-ACTIVITY-STATUSLINE

Keep one local adapter boundary, not a generic RPC framework. ActivityCoordinator receives an ActivityPublisher at construction; registerSessionActivity registers a statusline-protocol producer and wraps its handle plus the optional HerdrPublisher in one DualActivityPublisher; the Herdr factory remains replaceable in tests. The coordinator owns root-TUI eligibility, cadence, bounded digest, generation, deduplication and run/session invalidation. The adapter owns endpoint discovery, pane/source binding, wire encoding, validation, ordering and socket cleanup.

ActivityPublisher exposes readonly available, publish(activity, signal) and clear(signal) returning Promise<boolean>, and idempotent dispose(). Expose no Herdr wire objects or socket fields to summary logic. Keep at most one active and one latest pending write; superseded pending writes resolve false. Bound each socket attempt to 1,000 ms and its response to 65,536 bytes. Contain background failures with no immediate retries. Ordered clear, cancellation and sequence numbers prevent older publication from winning after cleanup. Remember a phrase after successful publication to either destination. DualActivityPublisher updates/clears the protocol handle synchronously before awaiting any optional Herdr operation, catches each destination's failure independently, and returns whether at least one destination succeeded. It never requires Herdr availability, never retries a duplicate solely for a failed destination, and owns protocol disposal as well as Herdr disposal. Honor cancellation/disposal before publication; a late Herdr completion cannot republish statusline data. Register key activity and source session-activity without default prefix/color/state, following [[DES-STATUSLINE-PROTOCOL]].

Use Node net and inherited HERDR_ENV=1, HERDR_SOCKET_PATH and HERDR_PANE_ID. Missing Herdr caller context means no socket requests; the statusline producer remains available and root-TUI summarization still runs. Use the inspected integration's Unix socket / Windows named-pipe endpoint pattern, with newline-delimited JSON. This is Herdr RPC, not Pi's headless RPC mode or a JSON-RPC 2.0 envelope. No CLI fallback, plugin registry, generic RPC framework or transport selector is required.

Use pane.report_metadata, reporter source pi:session-activity distinct from herdr:pi, agent pi and unique UUID-based request IDs. Bind the inherited caller pane; publish only tokens.activity and clear it with null. Leave lifecycle/title/session-reference fields untouched. Allocate seq before enqueueing, monotonically advancing a process-global counter seeded/refreshed from Date.now()*1000, so adapter replacement/reload preserves ordering. Do not add TTL or heartbeat. This scheme does not promise clock-rollback-safe ordering across separate processes; concurrent root agents sharing one pane are outside the selected scope.

Example publication (pane ID and sequence are illustrative):

```json
{
  "id": "session-activity:<uuid>",
  "method": "pane.report_metadata",
  "params": {
    "pane_id": "w1:p1",
    "source": "pi:session-activity",
    "agent": "pi",
    "seq": 1790850000000000,
    "tokens": { "activity": "Running parser tests" }
  }
}
```

Clear with tokens: { activity: null } and a newer sequence. Parse a complete bounded reply, require matching id/result, reject error envelopes, malformed/oversized replies and explicit accepted:false; arbitrary received bytes alone are not success. Release sockets/timers on success, protocol error, EOF, timeout, cancellation and disposal. Session shutdown can await bounded clearing/disposal; normal agent event handlers do not await model generation or publication.

The reference was installed managed herdr-agent-state.ts integration version 8; its file is not imported or modified. Follow its transport pattern and the separately agreed root-interactive scope, not its lifecycle calls, blocked-state handling, retries or any-data-as-success shortcut. Metadata/string-null response shapes came from protocol 22 schema inspection. Isolated actual Herdr 0.9.1 tests subsequently verify publication, deletion, unrelated metadata/lifecycle preservation and rejection of stale lower-sequence writes; exact observations and limitations are in the document's implementation state, not inferred from this design.
:::

:::mara verification VER-SESSION-ACTIVITY-PUBLISHER
:mid: 01M3W0QCEF0DZ34MGYPGSD8S8R
:title: Verify replaceable activity publishing and direct RPC framing
:status: accepted
:method: test
:level: integration
:verifies: REQ-SESSION-ACTIVITY-TRANSPORT
:verifies: DES-SESSION-ACTIVITY-PUBLISHER

Repeat the coordinator, disposable socket and isolated actual-Herdr checks below. This item is a method definition, not a passing execution assertion; results and limitations are recorded separately in the document's implementation state.

Inject a fake ActivityPublisher and assert that cadence, generation, unchanged suppression and settlement cleanup depend only on availability/publish/clear/cancellation rather than endpoint environment or Herdr request objects. Replacing the publisher must not require changes to activity behavior assertions.

Use a disposable socket server to capture newline-framed pane.report_metadata requests. Assert inherited caller pane, source pi:session-activity distinct from herdr:pi, unique IDs, monotonic sequences and activity-only string/null token updates. No lifecycle/title/session method or unrelated field may be emitted. Test fragmented matching success, explicit server error/rejection, malformed/oversized data, unrelated IDs, EOF, missing context, timeout, cancellation and repeated disposal. Bound each attempt to one second and responses to 64 KiB in production; accelerated test deadlines may be injected. Release sockets/timers and do not retry immediately.

Gate an active publication, queue many updates and a clear, and prove retained writes are at most one active/one latest pending. Superseded queued updates resolve false. Cancellation/reset and a newer clear must prevent stale activity restoration; adapter replacement preserves sequence order within the process. Verify no TTL/heartbeat fields or renewal writes exist.

In an isolated actual Herdr 0.9.1/protocol-22 pane/session, verify string publication and null deletion, preserve unrelated metadata/title/lifecycle state, and reject a lower-sequence publication after clearing. Source/schema inspection alone does not pass this check. Never modify the installed managed integration, live user server or another agent's pane.
:::

:::mara requirement REQ-SESSION-ACTIVITY-STATUSLINE
:mid: 01M3Y890CNR4R9XXHMGV39P24X
:title: Publish current activity through the statusline protocol
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

In every supported root/main Pi TUI session, publish the generated activity phrase through @araketski/pi-statusline-protocol with key activity and source session-activity. Use no producer prefix, color or state by default; footer configuration may override presentation. Use the same phrase, summarizer request, cadence and unchanged suppression as optional Herdr metadata; do not add another model request. Register one session-scoped producer that supplies native fallback and late protocol snapshots. Herdr availability or delivery failure must not prevent local status publication or cleanup. Publication to either destination is sufficient to remember the phrase; do not replay unchanged phrases solely to retry a failed destination. Clear only the activity status on final settlement and existing reset boundaries, dispose its registration on session replacement/reload/shutdown, and reject stale asynchronous publication. Headless and nested contexts must not publish or register status producers. Publishing the key does not change the custom footer's default layout or user configuration.
:::
