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
- Start the first summary after one qualifying turn; refresh after every five
  subsequent qualifying turns by default. Make the subsequent interval
  configurable through the independent `session-activity.json` file.
- Follow the [session-name model-selection pattern](../../../packages/session-name/docs/contract.mara.md):
  default to the active session model with reporter thinking `off`; permit a
  complete provider/model override and a thinking override through Pi's model
  registry and configured authentication. Do not inherit or mutate chat thinking
  when the reporter's thinking setting is omitted. Do not share the naming
  extension's configuration or include its `setTitle` behavior.
- Summarize a compact recent digest containing tool names, bounded relevant tool
  arguments, and visible assistant text. Exclude thinking and tool-result bodies.
  The previous published phrase is additional input for semantic comparison.
- Prefer three words, permit at most five words and 60 Unicode code points,
  and publish only a safe single plain-text line without control characters.
- Ask the summarizer to retain the previous phrase when the activity has not
  meaningfully changed. Suppress normalized exact duplicates independently.
- Generation and metadata publication are asynchronous and best-effort. Permit
  at most one active summary request and coalesce overlapping due updates into
  one pending refresh that uses the latest digest rather than old queued snapshots.
- Apply a 10-second generation deadline. On timeout, unavailable model/auth,
  provider failure, or unusable output, skip that update without an immediate
  retry or heuristic replacement. Retain the existing phrase while working;
  the next normally due refresh may try again. Coalescing a separately due
  refresh is not a failure retry.
- Clear the token when the main-agent run finally stops, including normal
  completion or abort, and on session replacement or orderly shutdown. Invalidate
  obsolete asynchronous work so a late result cannot restore a cleared token.
  A short run can finish before its first phrase is ready and publish no phrase.
- Outside Herdr, do nothing, including making no reporter model requests.
  Metadata-publication failures are silent, with later normal update opportunities
  rather than immediate retries. Cleanup is best-effort too.

## Implementation review still needed

These details are deliberately **not accepted requirements** yet:

- Exact cadence-counter reset rules across idle-to-working transitions, reload,
  resume, and tree navigation; whether every new run gets its own turn-one update.
- Configuration location/layering, cadence key and allowed range, malformed-file
  behavior, reload semantics, and exact accepted thinking values. An independent
  agent-directory file matching session-name is a candidate, not an agreed scope.
- Numeric digest/input and output-token budgets, digest lookback, relevant-argument
  selection/redaction, and treatment of arguments containing code or credentials.
  A compact digest is not a guarantee that tool arguments contain no sensitive text.
- Summary response format and validation, safe shortening versus rejecting an
  overlong response, and exact word-count normalization.
- Herdr source ownership, sequencing, publication timeout, token expiration/crash
  cleanup, and the precise caller-pane selection/clear contract. Orderly cleanup
  cannot guarantee removal after a hard process kill or unavailable Herdr server.

## Integration facts to verify before implementation

The installed Herdr CLI exposes `pane report-metadata` with `--token NAME=VALUE`
and `--clear-token NAME`, separate from agent reporting and title fields. Its
help was inspected; successful token publication and clearing were **not** tested.
The exact source/caller ownership must be established before issuing mutations.

Installed Pi 0.99.2 extension documentation distinguishes actionable `turn_end`
from notification-only `agent_settled`: `agent_end` can precede retries or other
automatic work and is not by itself proof of final settlement. The implementation
must verify equivalent lifecycle boundaries against the repository's selected
Pi baseline rather than assume installed documentation proves compatibility.
Extra reporter requests may be billable; accounting integration must be checked
and documented without adding synthetic conversation messages to hide limitations.

## Planned acceptance checks

The structured verification below defines observable checks for the accepted
contract. It has not been executed. Behavioral implementation must proceed via
red–green–refactor, followed by native Pi loading/lifecycle and independent Herdr
metadata verification. No specific consumer layout is part of this contract.

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

Publish the custom activity token through Herdr pane.report-metadata for the calling Pi agent's pane. Require only Pi and standard Herdr metadata, not a particular renderer or a repository-specific Herdr extension. Do not change Pi session names, terminal titles, Herdr lifecycle status, unrelated metadata, or other agents. Do not send messages to other agents or add reporter content to the chat transcript. Outside Herdr, perform no reporter model requests or metadata operations.
:::

:::mara requirement REQ-SESSION-ACTIVITY-CADENCE
:mid: 01M3W09W2M6TYTPRK6TAVYQ78N
:title: Refresh from completed main-agent turns on a configurable cadence
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Schedule the first background summary after one completed qualifying main-agent assistant turn, then after every five subsequent qualifying turns by default. Make the subsequent interval configurable. Tool-calling assistant responses qualify; individual tool completions, nested/subagent work and the reporter's own model calls do not count independently. This requirement does not resolve cadence-counter reset rules across runs or navigation; those require implementation review as described in the narrative.
:::

:::mara requirement REQ-SESSION-ACTIVITY-MODEL
:mid: 01M3W0A8P29G18B05WZB262EBY
:title: Configure reporter model and thinking independently of chat
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Use independent session-activity.json configuration, with a configurable cadence and the model-selection pattern of [[REQ-SESSION-NAME-MODEL]]: default to the active session model and reporter thinking off; allow a complete provider/model override and a thinking override resolved through Pi's model registry and configured authentication. Do not mutate chat model or thinking, share session-name configuration, or expose its setTitle behavior. An unavailable explicit selection skips the update rather than silently selecting another model or generating a heuristic. Exact configuration layering, validation and reload details remain subject to implementation review.
:::

:::mara requirement REQ-SESSION-ACTIVITY-DIGEST
:mid: 01M3W0ANJDEMKENQWNK8D3WQ54
:title: Summarize a bounded recent activity digest without thinking or result bodies
:status: accepted
:kind: constraint
:contributes_to: GOAL-SESSION-ACTIVITY

Supply recent main-agent tool names, bounded relevant arguments and visible assistant text in a compact digest, plus the previous published phrase for comparison. Exclude thinking and tool-result bodies. Do not use a full conversation window or additional file reads as summary input. Establish explicit input/lookback bounds before implementation; the chosen bound values and argument selection/redaction policy are not yet agreed. Tool arguments can contain sensitive content, so compact input must not be described as inherently secret-free.
:::

:::mara requirement REQ-SESSION-ACTIVITY-PHRASE
:mid: 01M3W0B4E1M0DW0QAV6VY9J5N1
:title: Publish concise safe phrases only for meaningful activity changes
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Prefer three-word activity phrases, allowing at most five words and 60 Unicode code points. Publish a single plain-text line without control characters. Give the summarizer the previously published phrase and instruct it to report unchanged when the underlying activity is the same, rather than paraphrase it. Independently suppress normalized exact duplicates. Update the remembered published phrase only after successful publication, so failed writes do not suppress later normal attempts. The semantic comparison is best-effort model judgment, not a guarantee of semantic equivalence.
:::

:::mara requirement REQ-SESSION-ACTIVITY-ASYNC
:mid: 01M3W0BK10JVDCK6DV08GGQ5A6
:title: Keep reporting nonblocking and coalesce overlapping refreshes
:status: accepted
:kind: quality
:contributes_to: GOAL-SESSION-ACTIVITY

Generation and metadata publication must be asynchronous, best-effort and unable to delay normal main-agent execution through awaited reporting work or rejected background errors. Permit at most one active summary request. If further updates become due while it runs, coalesce them into at most one pending refresh that uses the latest digest when started, not an unbounded queue of captured old snapshots. Obsolete work must not publish after cleanup or session replacement. Bound retained activity input and pending state.
:::

:::mara requirement REQ-SESSION-ACTIVITY-FAILURE
:mid: 01M3W0C0QVN1SB3QJ62TZSPYZ7
:title: Skip failed updates without retries heuristic replacement or warnings
:status: accepted
:kind: quality
:contributes_to: GOAL-SESSION-ACTIVITY

Apply a 10-second deadline to each generation attempt. Timeout, provider errors, missing authentication, unavailable models and unusable output skip the update with no immediate extension-level retry and no heuristic replacement. Retain the published phrase while the main agent is working; another normally due refresh may attempt again. A separately due coalesced refresh is not a failure retry. Metadata-publication failures are silent and retried only at later normal update opportunities. No busy-loop retries, blocking warnings or synthetic conversation messages are permitted. Publication itself must also be bounded; its exact timeout remains an implementation-review detail.
:::

:::mara requirement REQ-SESSION-ACTIVITY-CLEANUP
:mid: 01M3W0CGHBTYYHR1S6FNEKXTQH
:title: Clear stopped activity and reject late asynchronous publication
:status: accepted
:kind: functional
:contributes_to: GOAL-SESSION-ACTIVITY

Clear the reporter's activity token when the main-agent run finally stops, whether by completion or abort, and on session replacement or orderly shutdown. An inner turn ending or agent_end before automatic continuation is not proof of final settlement. Invalidate pending generation and publication, make cleanup idempotent, and prevent late results from restoring the cleared token or affecting a replacement session. Clear only the reporter's activity token, not unrelated metadata. A run that settles before its first summary completes may publish no phrase. Cleanup remains best-effort when Herdr is unavailable; hard-kill expiration behavior is not yet specified.
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

Define deterministic behavioral fixtures and native Pi/Herdr integration checks before implementation. This item is a planned repeatable verification method, not a passing result.

| Case | Observable expectation |
| --- | --- |
| Uninterrupted qualifying turns | With interval five, generation becomes due at turns 1, 6 and 11; tool-calling assistant responses count, but tool-result multiplicity, nested/subagent work and reporter calls do not. A supported nondefault interval changes subsequent trigger spacing. |
| Model configuration | Default generation selects the active chat model with reporter thinking off. Explicit provider/model/thinking overrides use Pi authentication without changing chat settings. Unavailable selections skip rather than switch models. Configuration edge checks follow the interface agreed during implementation review. |
| Captured provider input | The bounded digest contains only allowed recent tool names/relevant arguments and visible assistant text, plus the previous phrase. Thinking, tool-result bodies and full conversation history are absent. Numeric bound tests use the subsequently agreed budgets. |
| Phrase safety and stability | Published output is one control-free line, at most five words and 60 Unicode code points. Explicit unchanged results and normalized exact duplicates cause no metadata write; a distinct useful activity does. Semantic paraphrase fixtures check the comparison instruction without claiming a universal equivalence detector. |
| Delayed provider and metadata transport | Main-agent work continues and settles while reporter responses or writes are gated. One request runs at a time and many due updates produce at most one pending refresh using the latest digest. Unhandled rejection monitoring stays clean. |
| Failure and recovery | A request exceeding ten seconds, permanent/transient failure, missing authentication or unusable output leaves the current phrase unchanged and causes no immediate retry or heuristic. A later normal opportunity can recover. Failed publication does not incorrectly mark a phrase as successfully published or warn the user. |
| Settlement, abort and replacement | Clear the token at final settlement/abort, orderly shutdown and replacement. Release a provider after cancellation and verify it cannot restore cleared activity or modify a replacement session. Do not clear merely because an inner turn or pre-settlement agent run ended. Repeated cleanup is harmless. |
| Independent standard Herdr metadata | In an isolated test pane/session, observe activity via standard pane.report-metadata and verify clear removes that token. Stable session name, terminal title, lifecycle status and unrelated metadata remain unchanged. No messages go to other agents and no particular renderer is installed or required. |
| Outside Herdr | Without Herdr caller context, neither model requests nor metadata operations occur. |

Use offline gated providers and isolated Herdr fixtures where available; do not mutate another contributor's pane or contact a paid provider merely to run the suite. Native source/packed loading and lifecycle checks must use the selected repository Pi baseline. Record actual execution separately when implementation exists.
:::
