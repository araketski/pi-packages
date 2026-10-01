# Questions tool and interaction design

This is a complete **proposed design**, not accepted implementation behavior.
The user-approved product obligations are in [the contract](./contract.mara.md).
Use this document, not upstream code, as the implementation blueprint once its
draft contracts have been reviewed and accepted. Keep reusable checks in
[the verification plan](./verification.mara.md).

## Review before implementation

The proposed choices are explicit so an implementer need not invent policy:

1. Recommendations reference supplied options only; a proposed free-text answer
   can be supplied as an ordinary option. The built-in custom-answer row is not
   itself recommendable.
2. Reject malformed inputs before any UI, including recommendations outside the
   current question's options. Never silently coerce, clamp, reorder or ignore
   a bad recommendation.
3. Publish only finally submitted answers. Cancellation/abort discards partial
   answers and custom drafts; no partial payload masquerades as consent.
4. Declare model-only exposure and sequential execution. Return a schema-backed
   structured result plus model-facing text and renderer metadata.
5. Preserve per-question navigation and editor drafts within one invocation, not
   across calls, session changes, reload or restart.
6. Use separate focus and recommendation signals, and a bounded scrollable
   viewport. Theme colors are semantic, not hardcoded.
7. Treat signal abort/session invalidation as cancellation, close through Pi's
   completion callback and release owned listeners exactly once. Actual host
   lifecycle integration must be verified, not assumed.
8. The [optional Herdr attention proposal](./herdr-integration.mara.md) holds one
   boolean-only blocked activation across the complete user-input flow and
   balances it on every terminal path without releasing other producers.

These are reviewable design decisions, not additional user approvals. Updating
an item's status to accepted must reflect review; its presence in this file does
not authorize implementation.

## Proposed structured design

:::mara design DES-QUESTIONS-TOOL
:mid: 01M3VDN8W8F1K91XP95JMDCQVM
:title: Define validated questions and schema-backed answer outcomes
:status: draft
:kind: interface
:satisfies: REQ-QUESTIONS-INTERACTION
:satisfies: REQ-QUESTIONS-RECOMMENDATION
:satisfies: REQ-QUESTIONS-GUIDANCE

## Registration and exposure

Register one tool named `ask_questions`, labelled Ask Questions. Propose
`exposure: "model-only"` because the operation asks a person rather than
orchestrating programmatic work, and `executionMode: "sequential"` so sibling
calls cannot simultaneously compete for the terminal. Keep it normally active
when the extension is enabled; do not rewrite the tool loadout or entire system
prompt. No slash command, shortcut, CLI flag, provider registration or persistent
status widget is required.

Use a short description, a prompt snippet and guidelines through the tool's
ordinary registration fields. Proposed guideline content:

- Use ask_questions for direct questions when structured input helps; ordinary
  chat is appropriate for trivial, rhetorical or lightweight next-step questions.
- Batch related questions. Keep questions concise and options short and concrete.
- When you have a justified preferred answer, provide recommendedOption for that
  option. Omit it when there is no clear preference; recommendations are optional.
  A recommendation still requires the user's confirmation.

Do not require that the recommendation be first or reorder supplied options to
move it first. Option numbering stays stable throughout an invocation.

## Input contract

The top-level object contains `questions`, an ordered array of length 1–6.
Each question contains:

| Field | Meaning |
| --- | --- |
| `header?` | Optional nonblank short progress label; absent means Q1, Q2, etc. |
| `question` | Required nonblank full question text |
| `options` | Ordered array of 1–8 option objects |
| `recommendedOption?` | Optional integer in 1–options.length; refers only to a supplied option |

Each option has required nonblank `label` and optional nonblank
`description`. The custom-answer choice is a UI-owned extra row named
Write your own answer, always appended and never included in supplied-option
numbering. To recommend a proposed answer that is not among existing options,
the agent may supply that answer as an ordinary option and reference it;
recommending the built-in editor row or pre-filling custom text is outside scope.

Example input:
```json
{
  "questions": [
    {
      "header": "Storage",
      "question": "Which storage approach should we use?",
      "options": [
        { "label": "JSON files", "description": "Minimal setup" },
        { "label": "SQLite", "description": "Transactional local storage" }
      ],
      "recommendedOption": 2
    }
  ]
}
```

Use JSON-schema/TypeBox validation for types, cardinalities and the integer
1–8 range; perform semantic validation of `recommendedOption <= options.length`
and nonblank textual fields before opening UI. The proposal rejects unknown
input properties, wrong types, null optional fields, whitespace-only strings,
empty/out-of-bounds arrays and fractional/out-of-bounds recommendations. Do not
coerce numbers/strings, clamp recommendations, silently remove malformed
questions or fall back to the first option on invalid input. Validation failure
is a failed tool call with a useful field/question-specific explanation, not
`unavailable` or `cancelled`.

Trim boundary whitespace for supplied headers. Retain valid question/option
content in results; rendering may sanitize terminal control sequences without
modifying the logical values. Character-count guidance (roughly 30 for headers,
120 for questions, 40 for option labels and 100 for descriptions) is advice,
not enforced truncation or a hard maximum. Duplicate labels remain distinguishable
by option number, never by label matching. Omitting a recommendation means no
recommendation; default focus on option 1 must not invent one.

## Result contract

Declare an output schema and return the matching payload as `structuredContent`.
Use the same payload in `details` for historical rendering, with human-readable
`content` for the model. This is proposed serialization, not copied from the
reference or a compatibility obligation to it.

The payload contains:

- `status`: answered, cancelled or unavailable.
- `questions`: normalized question snapshots in original order. Each includes
  one-based `questionNumber`, derived/explicit `header`, full `question`,
  original `options` with labels/descriptions, and `recommendedOption` only
  when supplied.
- `answers`: final submitted answers in original question order. Each contains
  one-based `questionNumber`, `kind` (option or custom), full `answer`, and
  `optionNumber` only for kind option.
- `reason`: omitted for answered; dismissed, aborted, session_changed, reload or
  shutdown for cancelled; non_tui for unavailable.

Answered requires exactly one answer for every question. Option answers use the
original option label and number, not UI suffixes such as Recommended. Custom
answers trim outer whitespace only; preserve internal whitespace and line breaks.
Cancelled and unavailable have `answers: []`: in-progress selections, confirmed
intermediate answers and editor drafts are never returned as submitted answers.
Do not add an acceptance flag based on the recommendation; comparison with
`recommendedOption` is derivable, and agent advice is distinct from user choice.

Example answered payload:
```json
{
  "status": "answered",
  "questions": [
    {
      "questionNumber": 1,
      "header": "Storage",
      "question": "Which storage approach should we use?",
      "options": [
        { "label": "JSON files", "description": "Minimal setup" },
        { "label": "SQLite", "description": "Transactional local storage" }
      ],
      "recommendedOption": 2
    }
  ],
  "answers": [
    {
      "questionNumber": 1,
      "kind": "option",
      "answer": "SQLite",
      "optionNumber": 2
    }
  ]
}
```

Model-facing text repeats each full question and submitted answer. Cancellation
states that nothing was submitted; unavailable says the interactive TUI is
required and asks the agent to use ordinary chat instead. Both are normal
non-error results. Abort publication remains subject to Pi's tool runtime: if
the host aborts before recording a result, do not force a replacement message.

Malformed input and unexpected UI/runtime failures are failures, not an extra
successful status. Clean up and propagate a failed tool result through the
host's supported error mechanism; never catch all exceptions as cancellation.
The extension does not set terminate or send an independent user/custom message
to resume work. Pi owns the normal post-tool continuation.

## Transcript rendering

The call renderer shows tool identity, question count and a compact preview,
tolerating partial/invalid arguments during streaming without opening UI.
The result renderer uses persisted details, not live prompt state. Distinguish
answered, cancelled and unavailable, and render submitted question/answer text
without semantic truncation; expansion/scrolling can reveal long content. Preserve
the absence of answers for non-answered outcomes. No modal is reopened when
rendering old results, navigating history, exporting or resuming a session.
:::

:::mara design DES-QUESTIONS-TUI
:mid: 01M3VDNCD66KGHZHSFSWZ0G6P1
:title: Separate recommendation focus and confirmed answers in a bounded TUI flow
:status: draft
:kind: behavior
:satisfies: REQ-QUESTIONS-INTERACTION
:satisfies: REQ-QUESTIONS-RECOMMENDATION

## Components and state

Create a fresh custom component through `ctx.ui.custom()` for each invocation,
using Pi's renderer, theme, keybindings and built-in editor/scrolling primitives.
Propose an inline custom screen in the interactive input area rather than a
second terminal renderer or permanent main-editor replacement. Keep source
separation small: tool/schema adapter, invocation-local flow state and themed
component. Pure transitions and validation should be testable independently of
terminal rendering; do not build a general questionnaire framework.

States are question-options(N), custom-editor(N), review and completed(outcome).
Per-question state contains the focused row, last confirmed answer and retained
custom draft. No question is answered by initial focus. Initialize each question's
focus once to its recommended supplied option or option 1. Subsequent visits retain
that question's last focus; changing another answer never resets recommendation
defaults. The immutable recommendation is separate from focus and confirmed answer.

## Question screen and recommendation styling

Show progress N/total, the header, full question, numbered supplied options with
optional descriptions, and the appended custom-answer row. Show contextual
controls. Recommendations do not add/remove rows or change shortcut numbers.

Use three independent cues:

- Focus: a pointer and accent styling on its prefix/number.
- Recommendation: an explicit Recommended suffix/badge and semantic `success`
  color on the recommended label/badge, even when focused or previously chosen.
- Confirmed answer on a revisit: a separate checkmark/Chosen marker, not a
  recommendation marker. Non-recommended chosen rows can use `muted` marker
  styling rather than the recommendation color.

For a focused recommendation, keep the accent pointer and success label/badge
rather than letting focus coloring override recommendation coloring. Nonfocused,
nonrecommended labels use normal text. Color differences depend on the active
theme, so the text marker remains authoritative when theme tokens have similar
colors or the terminal is monochrome. Use no hardcoded ANSI palette or additional
theme schema. Recompute styled output on theme invalidation.

If a long label leaves no space for the badge, wrap it onto a continuation line
belonging to that option rather than hiding it by truncation. Focus scrolling
keeps the selected row and its recommendation marker visible when feasible;
offscreen recommendations remain marked when scrolled into view. Do not claim
that every option can stay visible at once in a tiny viewport.

## Controls outside the editor

| Input | Question-options | Review |
| --- | --- | --- |
| Up/Down or k/j | Move one row; clamp at ends, no wrap | Scroll review content; do not change answers |
| PageUp/PageDown | Scroll content without changing focus/answers | Scroll review content |
| 1–9 | Immediately select that numbered row, including custom | No answer selection or submission |
| Enter | Confirm supplied option or open custom editor | Submit all answers |
| l | Same as option selection | No submission |
| Left or h | Previous question when N > 1; no-op on first | Last question |
| Escape | Cancel whole invocation | Cancel whole invocation |

All transitions request a render only while the invocation is live. After terminal
completion, ignore input. Shortcuts cannot be interpreted inside an active custom
editor: j/k/h/l, arrows and digits are editor input/navigation. Page scrolling
outside the editor lets the user read long rows/questions without choosing a
different option; the next focus-navigation action scrolls the focused row back
into view. The editor manages its own text scrolling.

## Answer and custom-editor transitions

Confirming a supplied option records/replaces that question's intermediate
answer. For one question this is final explicit submission. For multiple
questions advance to the next question, and after the last move to review.
Moving a focus alone never changes the intermediate answer.

Selecting custom opens an editor using the last retained draft, otherwise the
last confirmed custom answer, otherwise empty text. The user types their own
answer; agent recommendation never injects text into that editor. Enter saves a
nonblank value; support multiline editing with the host's configured editor
bindings (default Shift+Enter inserts a newline). Empty/whitespace-only submission
stays in the editor with actionable feedback and changes no answer.

Escape in the editor saves the unsent draft in invocation-local state and returns
to options, preserving the prior confirmed answer until a replacement is
confirmed. Opening the editor again recovers that draft. A final successful custom
answer trims boundary whitespace, then uses the same single/multiple-question
advance rules as an option answer. Backtracking can replace an earlier option
with custom text, custom text with an option, or one custom answer with another.
Only the latest confirmed answer is included on final submission.

## Review

For multiple questions, show every full question and its confirmed answer in
original order, with header/number and whether the answer is custom. Do not turn
an unconfirmed focus or unfinished custom draft into a review answer. Submit only
when all questions have confirmed answers. If an invariant violation leaves one
unanswered, keep submission disabled and return to the missing question with
feedback rather than inventing an answer. Back revisits the last question; further
backtracking uses ordinary question navigation. Reanswering advances through the
remaining questions with existing state preserved and returns to review.

Escape in review cancels, even if all intermediate answers have been recorded.
Nothing reaches the result's submitted-answer array until final Enter.

## Layout, focus and accessibility

Wrap question text, labels, descriptions, drafts and review answers with
terminal-column-aware helpers. Respect available width and height, including
wide/combining Unicode, terminal resize and very small viewports. Use a bounded
scrollable content area so long content cannot push the selected row/editor or
controls irretrievably offscreen. Provide keyboard access to all content and keep
focus visible. Rendering may be compact, but stored/model-facing values remain
complete. Render untrusted text without interpreting embedded terminal escape
sequences or executing hyperlinks/control actions.

Forward the custom component's Focusable state to the child editor when editing
and respect the host cursor marker/IME protocol. Do not capture unrelated Pi
shortcuts indiscriminately. Pi's configured interrupt must reach the tool-abort
path rather than insert literal control data or leave the prompt waiting; verify
its actual dispatch with the selected host. Restore the original main-editor text
and focus on completion without committing unsent drafts to chat.

Invalidate layout on width/height/content/theme changes. Cache only correctly
keyed layout; do not retain theme-styled strings across invalidation. Mouse
support is optional; there is always a complete keyboard path in regular and
fullscreen TUI.
:::

:::mara design DES-QUESTIONS-LIFECYCLE
:mid: 01M3VDNG1XZQT6ZVB0CS99XE8C
:title: Own invocation completion cancellation and cleanup without background work
:status: draft
:kind: behavior
:satisfies: REQ-QUESTIONS-LIFETIME
:satisfies: REQ-QUESTIONS-INDEPENDENT

## Factory and invocation boundaries

The extension factory registers the tool and only the public lifecycle handlers
needed to invalidate a live invocation. Loading the factory does not open UI,
start processes/timers/watchers, access credentials, write files, reconstruct
drafts or call a model. Keep at most one active invocation controller within the
runtime; state is not a process-global singleton shared across extension reloads.

Execution order:

1. Validate and normalize the complete input before touching UI.
2. Inspect the tool's provided AbortSignal. Already-aborted valid calls do not
   open UI or return a successful answer.
3. Require `ctx.mode === "tui"` (and usable UI). All other modes return
   unavailable with reason non_tui. Do not use `hasUI` alone: RPC has dialog UI
   but custom terminal components are unsupported.
4. Create invocation-local state and a unique ownership token; register owned
   cancellation callbacks and open the custom screen.
5. Await exactly one terminal outcome. Only explicit single-answer confirmation
   or final review submission can produce answered.
6. Snapshot the result independently of mutable invocation state, then close
   UI/release owned resources before resolving and return through the ordinary
   tool call. The host owns transcript insertion and follow-up.

Sequential registration prevents ordinary model-issued sibling prompts from
overlapping. Also defensively reject an unexpected second live invocation with
a failed tool result before opening another UI; never dispose a different
controller or silently merge questions.

## Terminal-outcome arbitration

Use one idempotent completion path shared by explicit submit, dismissal, signal
abort and session/runtime invalidation. The first observed terminal event wins.
Set the terminal guard before closing the UI or projecting answers. A late
keypress, double Enter, repeated shutdown, listener callback or stale result
cannot change the chosen outcome or call completion twice.

Dismissal has reason dismissed; tool signal abort has reason aborted; session
replacement/navigation has reason session_changed; runtime reload and shutdown
use their corresponding reasons when distinguishable. If public lifecycle data
does not distinguish reload from shutdown, use shutdown rather than inventing a
private signal. Close through the completion callback supplied by
`ctx.ui.custom()`, not by hiding an overlay or installing another component.
Host behavior that suppresses aborted tool-result recording is not overridden.

Remove the abort listener and clear the active controller only if the ownership
token matches. Dispose component/editor/viewport-owned resources idempotently;
retain no references to the captured session context after completion. Clear
transient answers and drafts after projecting the submitted result, without
mutating the independent result snapshot. Do not
manually reset unrelated widgets, titles, footers or another extension's UI.

Handle abort during factory/component setup as well as after it is visible.
In the inspected host, calling completion during factory setup can occur before
the host stores the component for disposal. Do not assume host disposal covers
that race: the invocation must release its own resources exactly once and avoid
showing an already-completed screen. Unexpected factory/render/UI failures require
cleanup and a failed tool call, not an answered or silently cancelled result.

## Session, branch, reload and exit

Bind a live questionnaire to the calling session/runtime and branch context.
Do not transfer it to a different session, new session, fork or tree navigation.
Use public pre-transition/invalidation events and shutdown cleanup to cancel
before stale state can be submitted. The pinned SDK exposes
session_before_switch, session_before_fork, session_before_tree and
session_shutdown; verify which paths cover actual new/switch/navigation/reload
operations before relying on them. Do not invent a reload event or inspect
private runtime/session state. A pre-event may conservatively cancel a prompt
even if another handler ultimately prevents the transition; it must not block
navigation just to preserve a draft.

Invalidation handlers close the active invocation synchronously/idempotently
through its controller and return without requesting an agent continuation.
They do not await a model turn, mutate the session tree or initiate replacement.
Recheck ownership/liveness before final submission; late completion cannot write
answers into a new session. No recovery or suspended-questionnaire subsystem is
required. In-memory and persisted Pi sessions have the same transient UI policy.

After final result recording, questions and submitted answers participate in
ordinary Pi tool-result history, branching and retention. No separate appendEntry,
settings store, autosave file or durable draft journal is created. Reload/resume
can display an old result through its renderer but cannot reopen the prompt or
pretend an intermediate answer was submitted.

Normal shutdown closes only owned UI/listeners. There are no child processes,
external locks, gates or persistent services to recover after abrupt process loss.
A crash may leave no recorded result; no post-exit continuation or recovery is
promised.

## Integration boundary

No model/provider calls, analytics telemetry, direct network access, filesystem
writes, subagents, jobs-core, gates-protocol or statusline integration are required.
The optional presentation-only proposal in [[DES-QUESTIONS-HERDR-ATTENTION]]
uses Pi's existing event bus to signal a live questionnaire's human-input wait;
it introduces no Herdr backend client or package dependency. If adopted, release
its invocation-owned activation through this same terminal cleanup path, not
from a renderer or a separate global shutdown reset. The installed hook alone
owns any resulting Herdr transport/reporting.
Questions/answers still enter Pi's ordinary tool transcript and may be visible
to its configured provider, history/export and host telemetry. Do not describe the
tool as confidential or telemetry-free. The extension makes no extra inference
request beyond the host's surrounding assistant/tool cycle.
:::
