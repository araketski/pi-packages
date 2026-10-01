# Questions verification plan

These are future repeatable checks, **not observed passing results**. No
questions package or executable tests exists in this increment. Documentation
validation checks corpus integrity only.

Derive implementation tests from [the agreed contract](./contract.mara.md) and
the accepted [design](./design.mara.md). Use
red–green–refactor for each behavioral increment, with repository Vitest tests
reachable through resolved Nx targets. Do not copy upstream tests.

The accepted [optional Herdr attention integration](./herdr-integration.mara.md)
has its own future verification for balanced events and independent Goal blockers.
Acceptance does not imply implemented integration or an observed runtime result.

## Observable acceptance examples

| Case | Action | Expected outcome |
| --- | --- | --- |
| No recommendation | Open a question with A and B | A is focused; neither row is marked recommended; no answer yet |
| Recommendation is second | Supply `recommendedOption: 2` | B is initially focused and visibly marked Recommended; nothing is submitted |
| Focus leaves recommendation | Move from B to A | A owns the focus indicator; B retains its recommendation label and recommendation color |
| Follow recommendation | Confirm B in a single question | B is returned as the explicit user answer |
| Disagree | Select A, or type a custom answer | The chosen answer is returned without replacement or forced confirmation of B |
| Multiple recommendations | Open several questions with different recommendations | Each first visit uses its own default; review appears only after every question has an answer |
| Backtracking | Answer, move back, change the answer, complete review | Only the latest confirmed answer for each question is submitted; focus is not reset to the recommendation |
| Custom answer | Select Write your own answer, type and confirm | Trim boundary whitespace only; preserve internal text and line breaks |
| Blank custom answer | Submit empty or whitespace-only text | Stay in the editor with actionable feedback; no answer is recorded |
| Escape in editor | Type a draft, then Escape | Return to that question's options; do not cancel the whole questionnaire |
| Escape outside editor | Dismiss question or review | Cancelled outcome, never answered; result has no partial answers |
| Non-TUI | Run in RPC (including `hasUI: true`), JSON or print | Unavailable result, no custom component call, no dialog wait or automatic default answer |
| Invalid recommendation | Supply 0, a fraction, or a value beyond available options | Input error before UI; no coercion, fallback answer or recommendation reassignment |
| Abort or invalidation | Abort while choosing, editing or reviewing | Prompt closes, no submitted answers, owned listeners are released, next prompt still works |

Serialization, editor-draft retention and lifecycle mechanics in this table
follow the accepted design, alongside persistent recommendation marking,
optional guidance and explicit confirmation. These are acceptance expectations,
not observed results.

## Structured verification definitions

:::mara verification VER-QUESTIONS-INTERACTION
:mid: 01M3VDRHESQDH5TTM6DFJC49TD
:title: Verify explicit answers optional guidance and persistent recommendations
:status: accepted
:method: test
:level: integration
:verifies: REQ-QUESTIONS-INTERACTION
:verifies: REQ-QUESTIONS-RECOMMENDATION
:verifies: REQ-QUESTIONS-GUIDANCE
:verifies: DES-QUESTIONS-TOOL
:verifies: DES-QUESTIONS-TUI

Use an independently authored deterministic tool/UI harness for the accepted
product requirements. Exercise the acceptance table and the accepted detailed
input/result/flow contract. Confirm fresh-state defaults,
recommendation on a nonfirst option, independent per-question recommendations,
persistent marking after focus changes, explicit confirmation, alternative and
custom answers, backtracking and final-review behavior. Include all eight supplied
options plus custom shortcut 9, boundary navigation, Escape in editor versus
elsewhere, blank editor submission and duplicate labels with stable option
numbers. No focus change or initial recommendation can record an answer.

Test the approved schema/semantic input failures before UI: counts 0/7 questions
and 0/9 options, malformed types, missing/nonblank text, unknown properties, null
optional fields, recommendation 0/negative/fraction/>8 and recommendation <=8
but beyond a shorter options array. Valid omission and the last available
recommendation must pass. Check complete model-facing text, structuredContent,
details and output-schema agreement for every normal outcome; cancellation and
unavailable must not include unsubmitted answers. Exercise empty/partial argument
rendering and historical-result rendering without reopening UI.

Inspect registered snippet/guidelines for useful structured questioning,
batching and a conditional recommendation suggestion with explicit permission
to omit one. Absence of recommendedOption must remain valid. Check that guidance
does not require moving the recommendation to option 1. Prompt text inspection
does not prove a model always follows it; any live-model assessment is separately
authorized and recorded.

A mock harness alone is insufficient for the recommendation UI. Use a real
interactive Pi pseudo-terminal without production credentials to select through
the registered tool in controlled scenarios. Test regular/fullscreen, narrow
and short terminals, resize, Unicode/wide/combining characters, long wrapped
content, theme invalidation, overlapping theme colors, scrolling, custom-editor
focus/IME cursor placement and main-editor restoration. Verify the recommendation
label/color remains separate from the focus pointer and chosen marker, including
when the recommendation is focused. Sanitize hostile terminal controls only for
rendering without losing logical answer text.

Observe red failures for the intended missing behavior before each implementation
slice, then green results and refactoring. Record host version, mode and actual
tested scope. These checks are definitions only; none has run for this package.
:::

:::mara verification VER-QUESTIONS-LIFETIME
:mid: 01M3VDRMVK2ZE8Y9B9MWKKTRR8
:title: Verify prompt disposal mode guards and cancellation races in the actual host
:status: accepted
:method: test
:level: integration
:verifies: REQ-QUESTIONS-LIFETIME
:verifies: DES-QUESTIONS-LIFECYCLE

Exercise the tool without interactive UI in RPC (explicitly hasUI=true), JSON
and print fixtures. Require immediate unavailable, no custom component/dialog
call, no default answer and chat-fallback guidance. Test input validation and
already-aborted valid calls before UI setup. Use controlled live TUI invocation
fixtures for dismissal, abort while choosing/editing/reviewing, abort during
component setup, double Enter, submit-versus-abort races, repeated disposal,
unexpected UI failure, a defensive reentrant call and stale callbacks. First
terminal event wins; failed UI is not relabelled cancellation. After completion,
a fresh call has no inherited answers/drafts and can be answered normally.

Use actual Pi lifecycle operations in an isolated session/runtime to verify new
session, switch, fork, tree navigation, reload and shutdown against public events,
including pre-transitions later vetoed by another handler and live prompt closure.
Establish that each applicable path reaches cancellation/cleanup and cannot
record stale answers in another session. Do not infer reload coverage merely from
an SDK event declaration. Check actual tool-signal/interrupt dispatch, original
editor text/focus restoration and owned-resource disposal even when completion
occurs before host component assignment. Do not await an agent continuation
inside lifecycle handlers or force recording when the host suppresses an aborted
result. Verify historical result rendering/resume does not reopen a questionnaire.

Count owned listeners/components and forbidden effects: no remaining invocation,
timers, child processes, model/provider requests, extension-authored messages,
session/draft/settings writes, gate acquisition or statusline changes. Pi's normal
tool-result/session writes are expected host behavior, not extension side effects.
Separate deterministic race tests from actual host observations and report any
unsupported path as a limitation. These checks have not run.
:::

:::mara verification VER-QUESTIONS-INDEPENDENT
:mid: 01M3VDRR8TW4XHNQTF62VWAGY8
:title: Inspect independent authorship and package scope before accepting realization
:status: accepted
:method: inspection
:verifies: REQ-QUESTIONS-INDEPENDENT

Review the implementation increment's diff and provenance against the agreed
no-copy decision. Require freshly authored source/tests/documentation derived
from the reviewed Mara contracts, no vendored upstream files/assets, no upstream
runtime dependency and no restored upstream build/dependency stack. Similar
public tool concepts or expected behaviors alone are not evidence of copied code.
This is an author review, not a mechanical proof of originality or a legal opinion.

Inspect package identity, deliberate publication files, applicable license
material, host peers and catalog/workspace references. Ensure Mara items/narrative
were relocated with stable identities in the successful scaffold increment and
staging copies removed only after references were repaired. Source/packed checks
cannot replace attribution/license review or authorize publication. No
implementation is present and this inspection has not been performed.
:::

:::mara verification VER-QUESTIONS-LOADING
:mid: 01M3VDRVJJ1E2052DKZMEMVRTK
:title: Verify source and isolated packed loading separately from TUI behavior
:status: accepted
:method: test
:level: integration
:verifies: REQ-QUESTIONS-LIFETIME
:verifies: REQ-QUESTIONS-INDEPENDENT

Follow [the repository load-check policy](../../testing.mara.md) after scaffolding.
Use the package's resolved Nx test target for source DefaultResourceLoader checks
in an isolated agent directory. Require no loader errors, discovery of every
declared entrypoint and exactly one ask_questions registration with the approved
exposure, schema, sequential mode and guidance. Merely importing a module or
passing a manifest-path checker is insufficient.

Explicitly pack the package and any intentionally added runtime workspace
dependencies, install the archive(s) with the deliberately pinned Pi SDK in a
temporary consumer outside this repository, then load from the installed artifact
with no workspace paths/symlinks or ambient settings. Verify helpers/dependencies
resolve and factory loading does not open UI or start work. Clean up consumers.
Inspect packed files for consumer README/license, required extension helpers and
absence of tests, development configuration and repository-only Mara knowledge.

Run source pi-check and pi-check-package with that exact explicit archive
separately. Keep fresh distribution/load checks reachable through the package's
Nx tests. Use available package test/typecheck/lint and applicable build checks,
and complete Mara validation. Resolve project targets before running them; no
test target or resource package is created by these definitions.

Follow [release compatibility policy](../../pi-compatibility.mara.md) before a
release. Record the selected host version; neither wildcard host-peer syntax,
local SDK loading, static archive checks nor source inspection promises support
for other versions. Run the real TUI checks in VER-QUESTIONS-INTERACTION and
VER-QUESTIONS-LIFETIME separately: loaders do not exercise keyboard/focus/cancel
behavior. No archive, loading test or release check exists or has run here.
:::
