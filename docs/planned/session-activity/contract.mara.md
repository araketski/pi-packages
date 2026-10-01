# Planned session activity reporter

`session-activity` is a small standalone Pi extension that exposes what the
main agent is doing now through Herdr's standard custom `$activity` metadata
token. It is generally compatible with Herdr and imposes no renderer dependency.

The user selected a **specification-only first increment**. Accepted items below
record agreed intended behavior, not implementation or passing runtime tests.
No package has been scaffolded, and no model requests or metadata mutations
were made to validate this contract.

## Responsibility boundaries

| Surface | Meaning | Owner |
| --- | --- | --- |
| Pi session name | What the agent is responsible for | Existing naming behavior |
| Herdr lifecycle status | Working / blocked / done / idle | Existing lifecycle integration |
| Herdr `$activity` | What the agent is doing right now | `session-activity` |

The reporter neither renames sessions nor changes terminal titles, lifecycle
status, other metadata fields, or another agent's state. It sends no messages to
other agents. Its runtime integration requires only Pi and standard Herdr
metadata, not a particular renderer or a repository-specific Herdr extension.
Herdr consumers choose whether and how to display the token.

Example `$activity` values:

```text
Running parser tests
Investigating API schema
Refactoring request handling
```

## Agreed operating behavior

- Count completed main-agent assistant turns, including tool-calling responses.
  Do not count reporter generation, individual tool completions, nested work,
  or subagent work as separate qualifying turns.
- Reset the counter, digest and phrase-comparison state for each main-agent run.
  Start the first summary after one qualifying turn; refresh after every five
  subsequent qualifying turns by default, with a configurable subsequent interval.
  Reload, session resume/replacement and tree navigation also start fresh: cancel
  obsolete work and clear activity without reconstructing history. If work
  continues, summarize after the next qualifying turn; otherwise wait for a run.
- Follow the [session-name model-selection pattern](../../../packages/session-name/docs/contract.mara.md):
  default to the active session model with reporter thinking `off`; permit a
  complete provider/model override and a thinking override through Pi's model
  registry and configured authentication. Do not inherit or mutate chat thinking
  when the reporter's thinking setting is omitted. Do not share the naming
  extension's configuration or include its `setTitle` behavior.
  Read only `<agent-dir>/session-activity.json` at start/reload, respecting Pi's
  configured agent directory. No project layer, watcher or automatic file creation
  is included. Invalid JSON, root shape, unknown keys or invalid values produce
  one nonblocking warning for that load and use defaults.
- Summarize a rolling window of the latest five qualifying turns, independent of
  cadence. Include tool names, curated paths/search queries/command text and
  visible assistant text; omit file contents, edit replacement bodies and bulk
  payloads, as well as thinking and tool-result bodies. Cap curated argument text
  at 400 Unicode code points per entry, visible assistant text at 600 per entry,
  and the serialized activity digest at 6,000 total, prioritizing newest activity.
  Bound retained collection too. The previous phrase is separate comparison input.
  Curated arguments can still contain sensitive text; this is not a secrecy guarantee.
- Prefer three words, permit at most five words and 60 Unicode code points,
  and publish only a safe single plain-text line without control characters.
  Normalize harmless formatting/whitespace and remove controls; skip output that
  remains overlong or unusable rather than truncating it.
- Ask the summarizer to retain the previous phrase when the activity has not
  meaningfully changed. Suppress normalized exact duplicates independently.
- Generation and metadata publication are asynchronous and best-effort. Permit
  at most one active summary request and coalesce overlapping due updates into
  one pending refresh that uses the latest digest rather than old queued snapshots.
  If its run/session is still valid, a completed request may publish before the
  pending latest refresh starts. Ordinary turn progress does not invalidate it.
- Apply a 10-second generation deadline. On timeout, unavailable model/auth,
  provider failure, or unusable output, skip that update without an immediate
  retry or heuristic replacement. Retain the existing phrase while working;
  the next normally due refresh may try again. Coalescing a separately due
  refresh is not a failure retry.
- Clear the token at final settlement/abort, reload, session resume/replacement,
  tree navigation and orderly shutdown. Invalidate obsolete asynchronous work so
  late results cannot restore activity. A short run may publish no phrase.
  Use orderly cleanup only: no reporter TTL, heartbeat or repeated identical
  renewal writes. A hard kill or unavailable Herdr server can leave stale metadata,
  subject to Herdr's own cleanup.
- Report only the root/main interactive TUI with complete Herdr caller context.
  Outside that scope, including inherited-context headless RPC/JSON/print or
  nested/subagent sessions, make no reporter model requests or metadata operations.
  Metadata failures remain silent, with later normal opportunities rather than
  immediate retries. Invalid-configuration warnings are the separate exception.
  Cleanup is best-effort too.
- Use direct Herdr socket RPC for the initial transport, not a CLI subprocess.
  Keep it behind a replaceable activity publisher as defined by
  [[DES-SESSION-ACTIVITY-PUBLISHER]]. Do not import or modify the managed Herdr
  integration; it is a transport-pattern reference, not a runtime dependency.

## Engineering details and verification still needed

The documentation review resolved the remaining user-facing choices. These
technical details must be finalized, documented and tested before their behavior
is implemented; they are not additional product-policy questions:

- Configuration cadence-key spelling and valid numeric range; use the agreed
  strict validation/default policy and Pi-supported thinking values matching
  session-name, without `setTitle`.
- Tool-specific curated-field selection/redaction, bounded collection strategy,
  provider output-token cap, unchanged-response encoding, and exact safe
  normalization/word counting. Preserve the accepted digest and phrase limits.
- Herdr metadata source ownership, sequence initialization/order across reloads,
  RPC timeout/response-size cap, inherited caller-pane routing and null-token
  deletion semantics. Verify these in isolated fixtures; schema inspection alone
  is not evidence of successful publication or cleanup.
- Native main/root-session and final-settlement event mapping against the chosen
  Pi baseline, plus model-call billing/accounting behavior.

No reporter TTL or heartbeat is planned. Crash cleanup is explicitly outside the
reporter's guarantee, rather than an unresolved expiry policy.

## Integration facts to verify before implementation

The installed managed Pi integration at
`~/.pi/agent/extensions/herdr-agent-state.ts` (integration version 8) uses Node's
`net` API, `HERDR_SOCKET_PATH`, `HERDR_PANE_ID`, newline-delimited JSON requests,
and bounded socket attempts. It sends lifecycle methods; this extension will
use only the metadata method and a distinct source. Its main-interactive-TUI
scope was separately selected by the user; its retries and any-data-as-success
shortcut are not inherited requirements. The managed file was read, not changed.

`herdr api schema --json` reports protocol 22 and exposes `pane.report_metadata`
with `pane_id`, `source`, optional `agent`/`seq`, and `tokens` mapping names to
strings or null. Success and error envelopes carry an `id` with `result` or
`error` respectively. The CLI exposes the same capability as
`pane report-metadata`. Direct RPC is the selected initial adapter; the CLI is
not the runtime transport. Schema/example inspection does **not** verify live
publication or null-token deletion semantics. The exact source/caller ownership
must be established before issuing mutations.

Installed Pi 0.99.2 extension documentation distinguishes actionable `turn_end`
from notification-only `agent_settled`: `agent_end` can precede retries or other
automatic work and is not by itself proof of final settlement. The implementation
must verify equivalent lifecycle boundaries against the repository's selected
Pi baseline rather than assume installed documentation proves compatibility.
Extra reporter requests may be billable; accounting integration must be checked
and documented without adding synthetic conversation messages to hide limitations.

## Planned acceptance checks

The structured verifications below define observable checks for the accepted
contract and replaceable RPC adapter. They have not been executed. Behavioral
implementation must proceed via red–green–refactor, followed by native Pi
loading/lifecycle and independent Herdr metadata verification. No specific
consumer layout is part of this contract.

:::mara goal GOAL-SESSION-ACTIVITY
:mid: 01M3W093BNSK3RXJNTWKRFSV61
:title: Expose current Pi work as standard Herdr display metadata
:status: accepted

Let Herdr consumers observe what the main Pi agent is doing now without conflating current activity with its stable responsibility or lifecycle status. The standalone session-activity extension publishes the standard custom $activity token; no particular renderer or layout is required.
:::

:::mara requirement REQ-SESSION-ACTIVITY-ISOLATION
:mid: 01M3W09FSGMT90QTP9VDHR5MF0
:title: Publish only activity through standard Herdr metadata
:status: accepted
:kind: constraint
:contributes_to: GOAL-SESSION-ACTIVITY

Publish the custom activity token through Herdr's standard pane.report_metadata RPC method for the calling Pi agent's pane (exposed by the CLI as pane report-metadata). Report only the root/main interactive Pi TUI session with complete Herdr caller context; headless RPC/JSON/print invocations and nested/subagent sessions must not report even if they inherit pane environment variables. Require only Pi and standard Herdr metadata, not a particular renderer or a repository-specific Herdr extension. Do not change Pi session names, terminal titles, Herdr lifecycle status, unrelated metadata, or other agents. Do not send messages to other agents or add reporter content to the chat transcript. Outside the supported reporting scope, perform no reporter model requests or metadata operations.
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

Use only the optional session-activity.json in Pi's configured agent directory, normally ~/.pi/agent; respect Pi's agent-directory override rather than hardcoding a home path. Read it at session start/reload. Do not add project configuration layering, a file watcher or automatic file creation. Match the model/configuration policy of [[REQ-SESSION-NAME-MODEL]], without its setTitle behavior or heuristic fallback: default provider/model to null and reporter thinking to off; permit a complete nonempty provider/model pair and a supported Pi thinking value. Resolve selection/authentication through Pi's model registry without mutating chat model or thinking. Include a configurable subsequent-turn interval defaulting to five. Invalid JSON, root shape, unknown keys or invalid values cause one nonblocking warning for that configuration load and use defaults. An unavailable explicit model/auth selection skips generation rather than silently selecting another model or generating a heuristic. Configuration key spelling and numeric interval validation are engineering interface details to finalize and test before implementation.
:::

:::mara requirement REQ-SESSION-ACTIVITY-DIGEST
:mid: 01M3W0ANJDEMKENQWNK8D3WQ54
:title: Summarize a bounded recent activity digest without thinking or result bodies
:status: accepted
:kind: constraint
:contributes_to: GOAL-SESSION-ACTIVITY

Maintain a bounded rolling digest of the latest five qualifying main-agent turns, independent of the configured summary cadence. Include recent tool names, curated activity arguments such as paths, search queries and bounded command text, and visible assistant text. Omit file contents, edit replacement bodies and bulk payloads; never serialize all arguments indiscriminately. Exclude thinking, tool-result bodies, full conversation history and additional file reads. Cap curated argument text at 400 Unicode code points per entry and visible assistant text at 600 per entry; cap the serialized activity digest at 6,000 Unicode code points total, prioritizing newest activity when it cannot all fit. Bound collection as well as the final serialization. Supply the previous published phrase separately for semantic comparison. Discard the digest on run/state reset. Curated arguments can still contain sensitive text, so this policy is not a claim that input is secret-free; tool-specific field selection/redaction must be reviewed during implementation.
:::

:::mara requirement REQ-SESSION-ACTIVITY-PHRASE
:mid: 01M3W0B4E1M0DW0QAV6VY9J5N1
:title: Publish concise safe phrases only for meaningful activity changes
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Prefer three-word activity phrases, allowing at most five words and 60 Unicode code points. Normalize harmless formatting/whitespace and remove control characters to obtain one plain-text line. If the normalized result is unusable or still exceeds either limit, skip the update rather than truncate it; keep the existing phrase until a later normal update or lifecycle cleanup. Give the summarizer the previously published phrase and instruct it to report unchanged when the underlying activity is the same, rather than paraphrase it. Independently suppress normalized exact duplicates. Update the remembered published phrase only after successful publication, so failed writes do not suppress later normal attempts. The semantic comparison is best-effort model judgment, not a guarantee of semantic equivalence.
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

Apply a 10-second deadline to each generation attempt. Timeout, provider errors, missing authentication, unavailable models and unusable output skip the update with no immediate extension-level retry and no heuristic replacement. Retain the published phrase while the main agent is working; another normally due refresh may attempt again. A separately due coalesced refresh is not a failure retry. Metadata-publication failures are silent and retried only at later normal update opportunities. No busy-loop retries, blocking warnings or synthetic conversation messages are permitted. The nonblocking invalid-configuration warning specified in [[REQ-SESSION-ACTIVITY-MODEL]] is separate from silent reporting failures. Publication itself must also be bounded; finalize and test its timeout as an engineering detail before implementation.
:::

:::mara requirement REQ-SESSION-ACTIVITY-CLEANUP
:mid: 01M3W0CGHBTYYHR1S6FNEKXTQH
:title: Clear stopped activity and reject late asynchronous publication
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Clear the reporter's activity token when the main-agent run finally stops, by completion or abort, and on reload, session resume/replacement, tree navigation or orderly shutdown. Reset counters, digest and prior-phrase comparison state at reporting resets. An inner turn ending or agent_end before automatic continuation is not proof of final settlement. Invalidate pending generation/publication, make cleanup idempotent, and prevent late results from restoring cleared activity or affecting a replacement run/session. Clear only the reporter's activity token, not unrelated metadata. A run settling before its first summary completes may publish no phrase. Use orderly cleanup only: do not add a reporter TTL, heartbeat or repeated identical lease-renewal writes. If Pi is killed or clearing fails while Herdr is unavailable, stale metadata may remain subject to Herdr's own cleanup; the extension does not guarantee crash cleanup.
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

Define deterministic behavioral fixtures and native Pi/Herdr integration checks before implementation. This is a planned repeatable verification method, not a passing result.

| Case | Observable expectation |
| --- | --- |
| Run cadence | Each run starts fresh. With interval five, summaries become due at turns 1, 6 and 11; a configured interval changes subsequent spacing. Tool-calling assistant responses qualify; tool-result multiplicity, nested/subagent work and reporter calls do not. A second run starts at its own turn 1, with no old digest. |
| Reset and navigation | Reload, resume/replacement and tree navigation cancel obsolete work, clear activity and reset digest/counter/comparison state without reconstructing history. If working continues, the next qualifying turn schedules the first summary; if idle, no generation occurs until a new run. |
| Eligibility | Only the main/root interactive TUI reports with complete Herdr caller context. Headless RPC/JSON/print, nested/subagent sessions and missing context make no reporter model requests or metadata operations despite inherited pane variables. |
| Configuration/model | Read only Pi's configured agent-directory session-activity.json at start/reload. Defaults select the active chat model, thinking off and interval five; supported overrides use Pi authentication without altering chat settings. Invalid JSON/root/keys/values cause one nonblocking warning and defaults. No project layer or watcher exists. Unavailable model/auth skips rather than switches or falls back heuristically. |
| Digest bounds/privacy | A rolling latest-five-turn window is independent of cadence. Curated arguments are capped at 400 code points per entry, visible assistant text at 600, and serialized digest at 6,000, preferring newest activity. Bound retained collection too. Captured input excludes thinking, result bodies, file contents, edit replacement bodies, bulk payloads, full conversation history and additional file reads. The previous phrase is separate comparison input. |
| Phrase safety/stability | Output targets three words and never exceeds five words/60 code points after safe normalization. Overlong/unusable normalized output is skipped, not truncated. Unchanged results and normalized exact duplicates cause no metadata write; changed useful activity does. Failed writes do not mark a phrase published. Semantic fixtures do not claim universal equivalence detection. |
| Asynchrony/coalescing | Gated provider/transport does not delay main-agent work or settlement. One request runs and at most one latest refresh is pending. Ordinary turn progress allows the completed valid phrase to publish before the pending latest refresh; reset/settlement forbids it. Unhandled rejection monitoring stays clean. |
| Failure/recovery | Ten-second generation timeout, provider failure, missing model/auth or unusable output preserves current activity while working with no immediate retry or heuristic. A later normal refresh can recover. Metadata failures are bounded and silent; configuration warnings are the explicitly allowed exception. |
| Cleanup | Final settlement/abort, reset and orderly shutdown clear only activity, invalidate late results and release resources idempotently. Inner-turn/pre-settlement agent end alone does not clear. A short run may never publish. No TTL, heartbeat or periodic identical renewal writes exist; hard-kill/failed-clear removal is not guaranteed. |
| Independent Herdr metadata | In an isolated test pane/session, publish and clear through standard metadata while stable name/title/lifecycle and unrelated fields stay unchanged. No inter-agent messages or particular renderer are required. |

Use offline gated providers and isolated Herdr fixtures where available; do not mutate another contributor's pane or contact a paid provider merely to run the suite. Native source/packed loading and lifecycle checks use the selected repository Pi baseline. Record actual execution separately when implementation exists.
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
:title: Separate activity behavior from the initial Herdr socket RPC adapter
:status: accepted
:kind: interface
:satisfies: REQ-SESSION-ACTIVITY-TRANSPORT
:satisfies: REQ-SESSION-ACTIVITY-ISOLATION
:satisfies: REQ-SESSION-ACTIVITY-ASYNC
:satisfies: REQ-SESSION-ACTIVITY-FAILURE
:satisfies: REQ-SESSION-ACTIVITY-CLEANUP

Keep one local adapter boundary, not a generic RPC framework. The activity coordinator receives an activity publisher at construction; production wiring supplies the Herdr RPC adapter and behavioral tests supply a fake. The coordinator owns TUI/root-session eligibility, cadence, bounded digest collection, generation, semantic deduplication and run/session invalidation. The adapter owns endpoint discovery, pane/source binding, request encoding, response validation, ordering and socket cleanup.

The interface expresses availability; asynchronous publish(activity, signal) and clear(signal) operations with a success/failure result; and idempotent disposal. Expose no Herdr wire objects or socket fields to summary logic. Keep retained work bounded, handle background failures, and perform no immediate retries. Ordered clear and cancellation must prevent older publication from winning after cleanup. Remember successful publication only when the adapter reports success. Exact TypeScript names are engineering details.

Initial transport: use Node's standard net API and inherited HERDR_ENV, HERDR_SOCKET_PATH and HERDR_PANE_ID. Without complete caller context, report unavailable and make no socket/model requests. Use the inspected integration's Unix-domain socket / Windows named-pipe endpoint pattern, with a newline-delimited JSON request and bounded response processing. This is Herdr RPC, not Pi's RPC mode or an assumed JSON-RPC 2.0 envelope. No CLI fallback, plugin registry or transport selector is required.

Use pane.report_metadata, an independent reporter-owned source distinct from herdr:pi, and unique request IDs. Publish only tokens.activity and clear only that token. Leave lifecycle/title/session-reference fields untouched. Ordering/sequence choices must protect cleanup and avoid replacing managed lifecycle reports. Use no reporter TTL or heartbeat. Source spelling, sequence initialization, RPC timeout and response-size cap are engineering details to finalize and verify before implementation.

Schema-compatible illustrative publication envelope (identifiers and sequence are placeholders):

```json
{
  "id": "session-activity:request-1",
  "method": "pane.report_metadata",
  "params": {
    "pane_id": "w1:p1",
    "source": "pi:session-activity",
    "agent": "pi",
    "seq": 1,
    "tokens": { "activity": "Running parser tests" }
  }
}
```

The inspected schema allows null token values, so the corresponding clear envelope uses tokens: { activity: null } with a newer sequence. Actual deletion semantics require isolated integration verification. Parse a complete bounded response, match its id and distinguish result from error; arbitrary received data alone is not success. Release sockets/timers on success, protocol error, EOF, timeout, cancellation and disposal.

The reference was the installed managed herdr-agent-state.ts integration version 8, inspected for its enabled gate, net.createConnection endpoint, newline framing, request IDs and ordering pattern. The user separately selected its main-interactive-TUI scope. Do not copy its agent-reporting calls, blocked-state handling, immediate two-attempt retry or any-data-as-success shortcut; do not import or modify the managed file. Protocol 22 metadata shapes were inspected through herdr api schema --json; inspection is not proof of live publication or other-version compatibility.
:::

:::mara verification VER-SESSION-ACTIVITY-PUBLISHER
:mid: 01M3W0QCEF0DZ34MGYPGSD8S8R
:title: Verify replaceable activity publishing and direct RPC framing
:status: accepted
:method: test
:level: integration
:verifies: REQ-SESSION-ACTIVITY-TRANSPORT
:verifies: DES-SESSION-ACTIVITY-PUBLISHER

This is a planned verification method, not an executed test or passing result.

Run coordinator behavior with an injected fake activity publisher and assert that cadence, generation, unchanged suppression and settlement cleanup depend only on availability/publish/clear/cancellation, not Herdr wire objects or endpoint environment. Swap publisher implementations without changing those assertions.

Use a disposable local socket server for the initial adapter. Capture newline-framed requests and assert pane.report_metadata, caller pane binding, independent source ownership, unique request IDs and activity-only token updates. Exercise string publication and null-token clearing; assert no agent/lifecycle/title method or unrelated field is emitted. Test fragmented responses, matching success, explicit server error, malformed/oversized data, unrelated response IDs, EOF, missing caller context, timeout, cancellation and repeated disposal. Only a complete matching successful response reports success. Failures remain silent, bounded and without immediate retries. Verify timers and sockets are released.

Gate a publication while a later clear/session invalidation occurs and prove older work cannot leave activity restored. Retained requests stay bounded; ordering and any chosen sequence scheme work across reload/session boundaries according to the final reviewed ownership contract.

Finally, in an isolated Herdr pane/session, confirm publication and null-token deletion have the expected standard metadata semantics while the managed lifecycle source and unrelated metadata remain unchanged. Source code/schema inspection alone does not pass this check. Do not modify the installed managed integration or another agent's pane.
:::
