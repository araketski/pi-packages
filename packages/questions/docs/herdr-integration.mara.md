# Questions attention reporting through Herdr

## Finding and authority

A questionnaire waiting for a person uses the same
status-only Herdr Pi event used by [[REQ-GOAL-PRESENTATION]]. Questions owns a
short invocation-scoped wait, whereas Goal can own a longer needs-input state.
They must remain independent producers, not clear each other's state or require
one another to be installed.

The user requested investigation of this integration and accepted the documented
design after confirming the remaining Questions choices. The requirement, design
and verification below are **accepted intended behavior**, not implementation or
passing evidence. The original specification increment changed documentation only;
it did not modify hooks or manipulate a live Herdr session. The subsequently
authorized implementation balances invocation-owned events; see the
[verification progress observations](./verification.mara.md#progress-observations)
for observed deterministic checks and still-pending host/hook verification.

## Inspected integration

Read the existing Goal requirement and its verification, and the installed
Herdr-managed `~/.pi/agent/extensions/herdr-agent-state.ts` (integration ID pi,
integration version 8). The installed hook is reference material for the event,
not source to copy or a repository dependency:

- It is enabled only inside Herdr with its socket and pane environment available.
  Event handling starts after its root TUI session_start; RPC's hasUI=true does
  not activate it.
- Each `herdr:blocked` payload with active=true increments a counter; active=false
  decrements it, bounded at zero. This is a counted acquire/release signal, not an
  idempotent assignment of global blocked state. Payloads have no producer IDs.
- A positive count overrides working/idle reporting. agent_start and
  agent_settled update ordinary activity but do not clear the counter.
- The hook accepts a label for its shared blocked message, but the agreed Goal
  convention sends only active. Questions should follow that convention, with
  no label, message, reason, prompt text or answer content.
- Pi's public event bus has no subscriber-discovery or delivery acknowledgement
  in this API. The hook handles socket reporting itself; its queued reports and
  delivery attempts do not make an emitted event proof of server receipt.

This is source inspection of the selected hook, not proof of compatibility with
other integration versions or actual server-visible questionnaire behavior.
Verify the selected host/hook again when implementing. Do not edit the
Herdr-managed hook or install a replacement reporter.

## Integration boundary

The [core contract](./contract.mara.md),
[invocation lifecycle](./design.mara.md) and
[verification plan](./verification.mara.md) remain authoritative for Questions.
This optional presentation signal does not acquire generic gates, pause/resume
Goal, start an agent turn, answer questions, or make Questions a Herdr execution
adapter. No pi-herdr package dependency, CLI command, backend-state query, socket
client, timer, retry loop or persistence is introduced.

Concrete questions and required input stay in the questionnaire itself.
Herdr receives only aggregate needs-attention state through its existing hook.
Absent hooks and non-Herdr use retain normal questionnaire behavior; all
non-TUI calls retain the existing unavailable behavior.

## Structured integration

:::mara requirement REQ-QUESTIONS-HERDR-ATTENTION
:mid: 01M3VE7RXEE7255GGXR3WFZ4ZY
:title: Optionally report a live questionnaire as awaiting human input in Herdr
:status: accepted
:kind: functional
:contributes_to: GOAL-QUESTIONS-USER-INPUT

When interactive Pi runs inside Herdr with its existing Pi integration, report
one live questionnaire's needs-input interval through herdr:blocked with only
active=true on entry and a matching active=false on exit. Keep the interval
active throughout choosing options, custom editing and final review; navigation,
rendering, validation feedback and repeated observations do not reacquire it.
Submission, dismissal, abort, setup/runtime failure after acquisition, session
invalidation and reload/shutdown release only Questions' own activation exactly
once. Never release an activation that this invocation did not acquire.

Follow the boolean-only presentation convention in [[REQ-GOAL-PRESENTATION]]
without making Goal or pi-herdr a dependency. Another producer's remaining
activation must keep Herdr blocked when Questions completes, and ordinary
assistant lifecycle progress cannot implicitly end a still-live questionnaire's
activation. Releasing Questions does not resume Goal, accept a recommendation,
clear generic gates or start a turn.

An absent hook, non-Herdr session, invalid input, unavailable non-TUI call or
already-aborted call must not require backend operations or change the core
questionnaire outcome. No label/message/reason, question text, answer content,
extra notification integration, direct socket reporter or persistent attention
state is added. The signal reports waiting for input, not task failure or a
verified server-delivery result. This is the accepted contract; the verification progress observations distinguish implemented behavior, observed subsets and unverified runtime integration.
:::

:::mara design DES-QUESTIONS-HERDR-ATTENTION
:mid: 01M3VE7W9N88XKHXME85YRXR2E
:title: Balance a single event activation through invocation-owned completion
:status: accepted
:kind: behavior
:satisfies: REQ-QUESTIONS-HERDR-ATTENTION

## Eligibility and acquisition

Extend the invocation controller in [[DES-QUESTIONS-LIFECYCLE]] with one local
attentionOwned flag bound to its session/runtime ownership token. A fresh
invocation starts with false. No attention emission occurs from the factory,
renderers, restored history or draft reconstruction.

After full input validation, mode/abort checks and successful ownership of the
invocation, enter the needs-input interval as the custom UI is opened and awaited.
Emit only for ctx.mode=tui with usable UI and HERDR_ENV=1. Use the
public Pi event bus, not listener discovery, a pi-herdr tool or environment-based
socket probing. Tool execution must occur after root session_start; verify hook
startup ordering so an acquire ignored before root initialization cannot be
followed by a release against another producer's count.

Emit exactly:

```typescript
pi.events.emit('herdr:blocked', { active: true });
```

Record the invocation's ownership of this emission, not a claim that a hook
received it or the server displayed it. Guard acquisition so reentrant callbacks
cannot acquire twice. If the UI subsequently fails to construct/open, balance the
activation in the same completion/cleanup path; propagate the original failure.

Absent hooks simply consume nothing on the event bus; Questions still works.
Do not wait for acknowledgement, force reporting by installing a listener, poll
Herdr or retry activations when transport delivery is uncertain. The installed
hook owns transport, activity reconciliation and final pane-state reporting.

## One wait across the flow

One invocation holds at most one activation, independent of question count.
Question-options, custom-editor and review are all waiting for a person.
Changing screens, preserving drafts, retrying blank text or moving focus leaves
the activation untouched. Initial focus on a recommended option never ends the
wait; only explicit submission can produce answered.

Do not emit on every render, keypress, tool update, agent_start or agent_settled.
Do not listen to another producer's blocked events to infer Questions ownership.
A slow render is not a second activation; a short successfully answered prompt
may produce a brief activation that the hook's state queue coalesces.

## Release and races

Add attention release to the existing idempotent terminal-outcome path for
answered, dismissed, aborted, invalidated and failed invocations. Release before
the ordinary tool result returns and before session/runtime handoff completes.
If attentionOwned is false, emit nothing. Otherwise consume/clear the local flag
before emitting once:

```typescript
pi.events.emit('herdr:blocked', { active: false });
```

Use the captured invocation/runtime emitter and liveness token for this release;
a late callback from an old invocation must not decrement a fresh invocation's
activation, a replacement hook's counter or Goal's activation. Cleanup/disposal
calls may repeat but releases may not. Never send false from generic shutdown
without a matching owned true, and never loop false to make the global state idle.

An abort during custom-component setup must still balance a successful acquisition.
On reload/session changes, verify actual host event ordering and the lifetime of
the event bus/hook: finish the old invocation before its listeners are discarded,
and do not replay acquisition/restoration for a prompt the core lifecycle cancels.
This is a required integration check, not a claim that declarations alone prove
the handoff safe. A new invocation starts its own interval; historical results
never reacquire it.

If event reporting is unavailable or a listener fails, preserve the questionnaire
outcome and owned UI cleanup rather than hanging or failing submission solely
for optional attention. There is no delivery acknowledgement and no safe blind
retry of this anonymous counted protocol. Do not claim a server-visible release
after transport failure; verify/report the limitation separately. Abrupt process
loss may prevent release; do not invent durable recovery or a global counter reset
in Questions.

## Producer composition

Goal and Questions can each acquire once: the hook's count becomes two. When
Questions submits/cancels, its one release leaves count one and Goal remains
blocked until its own explicit needs-input policy releases. The reverse release
order must also preserve Questions' live prompt. Neither producer observes or
controls the other's internals. Keep payloads boolean-only, with the concrete
blocker retained in each producer's own UI/diagnostics.

Do not directly report working/idle after release. The hook selects the appropriate
state from its remaining blocked count and ordinary agent activity. Finishing a
questionnaire is not proof that the task or current Goal is complete.
:::

:::mara verification VER-QUESTIONS-HERDR-ATTENTION
:mid: 01M3VE7ZR5DPKJCRP4KX7E19F5
:title: Verify balanced questionnaire attention and independent Goal blockers
:status: accepted
:method: test
:level: integration
:verifies: REQ-QUESTIONS-HERDR-ATTENTION
:verifies: DES-QUESTIONS-HERDR-ATTENTION

Derive fresh red–green tests from the accepted event contract and controller
lifecycle. Record exact boolean-only payloads through a
controlled public event-bus fixture. One valid Herdr/TUI questionnaire emits true
once and false once. Multiple questions, arrows, number shortcuts, backtracking,
custom editing, blank editor retry and review must not reacquire/release until a
terminal event. Test answered, dismissed, aborted, setup failure after acquisition,
UI failure, session changes, reload and shutdown, including double cleanup,
submit-versus-abort races and stale callbacks after a fresh prompt starts.

Invalid input, unavailable RPC/JSON/print (including hasUI=true RPC), non-Herdr
operation, already-aborted input, factory loading and historical rendering emit
no activation/release. With HERDR_ENV=1 but no hook listener, the questionnaire
still completes normally and does not inspect capabilities or hang. Event
listener/reporting errors cannot change a successful answer or prevent UI cleanup;
do not assert delivered/server-visible state merely from an emit call.

Verify the selected installed hook in an isolated actual Herdr/Pi TUI fixture,
without modifying the user's live server or managed hook. Confirm visible blocked
state while choosing/editing/reviewing, and post-release state determined by
ordinary activity. Verify root-session initialization, hook startup ordering,
transport behavior and old-versus-new hook/event-bus ordering during actual reload;
an ignored early true or late false must not consume another activation. Socket
coalescing can hide a very brief prompt; keep the user-input wait observable in
the test rather than demanding one server report for every event emission.

Use both an independent synthetic producer and actual Goal once implemented.
Acquire Goal's needs-input activation and Questions' activation, then release in
both orders. The remaining producer must keep Herdr blocked. agent_start,
agent_settled and normal chat progress do not implicitly release either live
activation. Questions completion must not resume/clear Goal, mutate generic gates,
alter recommendations/answers, send extra model messages/turns or install a
backend reporter. Until Goal exists, a synthetic two-producer counter test is
partial evidence only, not actual Goal integration.

Source inspection and the earlier Goal demo are not execution evidence for these
checks. Observed deterministic event/ownership checks and remaining actual host/hook checks are recorded in the verification progress observations. Validate and record the selected host/hook and limitations before claiming runtime composition.
:::
