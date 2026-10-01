# Planned questions extension

## Scope and authority

Create an independently authored Pi extension with the user-facing questionnaire
behavior discussed for [pi-questions](https://github.com/drsh4dow/pi-questions),
plus an explicit optional recommended option. The agreed destination after
scaffolding is `packages/questions`, with expected generator-derived identity
`@araketski/pi-questions` and model-facing tool name `ask_questions`.

The user approved independent implementation, not upstream source reuse.
The reference was inspected at revision
`53ef061c14d1e1eb44a7f94cee4fe46b88c0449b`; no license file or package license
declaration was found in that checkout. This is provenance for the discussion,
not a legal determination, dependency, compatibility promise, or authority to
copy code. Do not copy upstream source, tests, assets, or authored documentation.

**This increment is documentation only.** No package, extension, executable
tests, dependency changes, or implementation campaign are authorized here.
Accepted items below record agreed intent, not completed behavior. The
[design](./design.mara.md) records proposed implementation-level contracts;
its draft items need review/acceptance before behavior is implemented from them.
The [verification plan](./verification.mara.md) defines future checks; none
has run. Mara document validation is not extension verification.

## Agreed behavior

- One model-callable questionnaire tool, not a slash-command planning system.
- One to six ordered questions, each with one to eight suggested options and an
  always-available custom text answer.
- Single-question confirmation submits directly; multiple questions have a
  review step and backtracking before final submission.
- Optional `recommendedOption` per question, numbered from **1** within supplied
  options. Initially select it without submitting anything; when absent select
  the first option. Keep a visible recommendation label and distinct themed
  styling even after the cursor moves elsewhere.
- Recommendations are advice, never consent or a restriction on other answers.
  Agent prompt guidance encourages them when there is a genuine preference,
  without requiring one.
- Keyboard-first interactive TUI. Cancellation and missing interactive UI are
  ordinary outcomes, not successful answers. No child agents or extra model
  calls are involved.

The details that need design approval include result serialization, invalid-input
policy, disposal/abort handling, exact theme-token choice, custom-editor draft
retention, bounded viewport behavior, and model-only versus nested-tool exposure.
The complete proposals are in the design rather than inferred from the reference.

An additional [draft Herdr attention integration](./herdr-integration.mara.md)
proposes a balanced, boolean-only herdr:blocked activation while the questionnaire
awaits human input, following the existing Goal convention. It is optional
presentation, not a new gate/job dependency or accepted runtime behavior.

## Package and documentation lifecycle

Keep this documentation in `docs/planned/questions/` until successful
scaffolding. Use the local [nx-pi generators](../../../packages/nx-pi/README.md)
for the new resource package and extension entrypoint, after inspecting installed
help and dry runs. Choose the package version at that time consistently with
[workspace release policy](../../release.mara.md); do not fix a future version
or publish anything as part of this specification.

In the scaffolding increment, move structured items with Mara into
`packages/questions/docs/`, preserving IDs, MIDs and relations. Relocate the
supporting narrative, repair relative and incoming links (including the root
README), validate completely, and remove accounted-for staging documents.
Do not create the package directory just to house drafts.

Select publication files explicitly: extension entrypoint/helpers, consumer
README and applicable license material. Repository-only `*.mara.md`, tests and
tool configurations stay out of the artifact. Pi supplies its SDK, TUI and
TypeBox; follow host-peer and catalog conventions rather than bringing in the
reference's dependencies or Bun tooling. Use repository Vitest/Nx conventions.
There is no planned runtime workspace-library dependency, generic gate producer,
settings file or background service.

The workspace catalog currently selects Pi 0.99.1. Local Pi documentation
inspected for this design is 0.99.2; relevant mode/tool/custom-UI declarations and
custom-screen implementation were also inspected in the workspace's pinned SDK.
Neither source inspection proves runtime conformance. Verify the intentionally
selected development host before implementing host-dependent mechanisms and
follow [release-time compatibility policy](../../pi-compatibility.mara.md)
without silently upgrading dependencies or advertising broad version support.

## Structured agreed knowledge

:::mara goal GOAL-QUESTIONS-USER-INPUT
:mid: 01M3VDECR6BEVXM79MYF3JWNEM
:title: Collect explicit user answers with visible optional agent recommendations
:status: accepted

Let a Pi user answer concise clarification questions through a keyboard-first questionnaire rather than repeatedly composing chat replies. Agent recommendations make a preferred choice easy to see and accept while preserving the user's ability to disagree, supply a custom answer or dismiss the interaction.
:::

:::mara requirement REQ-QUESTIONS-INTERACTION
:mid: 01M3VDEG7ZEXD58M4JC5HXP0J0
:title: Collect ordered option or custom answers with explicit submission
:status: accepted
:kind: functional
:contributes_to: GOAL-QUESTIONS-USER-INPUT

Expose ask_questions for one to six ordered questions, each with one to eight suggested options. Each question always permits a user-written answer. Support keyboard navigation, direct option shortcuts and backtracking; a single question submits on explicit answer confirmation, while multiple questions require a final review/submission step. Return the submitted answers associated with their original questions. Merely displaying or focusing an option is not an answer. Dismissal and lack of interactive TUI yield normal cancelled or unavailable outcomes, never fabricated answers.
:::

:::mara requirement REQ-QUESTIONS-RECOMMENDATION
:mid: 01M3VDEKHRS3V9TM5KJM2HQS91
:title: Preselect and persistently identify an optional recommended option
:status: accepted
:kind: functional
:contributes_to: GOAL-QUESTIONS-USER-INPUT

Allow each question to omit a recommendation or provide recommendedOption using one-based supplied-option numbering. On the question's initial visit, focus that option without submitting it; when omitted, initially focus the first supplied option. Identify the recommendation with an explicit Recommended label and distinct theme-aware color independent of the currently focused option. Moving focus must not remove or transfer recommendation marking. The user can choose any other option or a custom answer. Returning to a visited question preserves the user's navigation rather than repeatedly overriding it with the agent's recommendation. Recommendations remain optional and are never treated as consent or automatically submitted.
:::

:::mara requirement REQ-QUESTIONS-GUIDANCE
:mid: 01M3VDEQB55WWTZM9R5KJFGG1J
:title: Encourage useful questionnaires and optional recommendations without forcing them
:status: accepted
:kind: functional
:contributes_to: GOAL-QUESTIONS-USER-INPUT

When ask_questions is active, provide concise model-facing guidance to use it for direct user questions where structured input helps, batch related questions and keep wording/options short and concrete. Permit ordinary chat for trivial, rhetorical or lightweight next-step questions. Additionally encourage providing a recommended option when the agent has a justified preferred/proposed answer, while explicitly allowing omission when there is no clear preference. Do not demand a recommendation for every question, fabricate a preference, or equate a default focus with user approval.
:::

:::mara requirement REQ-QUESTIONS-LIFETIME
:mid: 01M3VDETRGEZH7JAXCD2MNY9J5
:title: Bound the questionnaire to one interactive tool invocation
:status: accepted
:kind: functional
:contributes_to: GOAL-QUESTIONS-USER-INPUT

Open a questionnaire only in a real interactive TUI; RPC dialog capability alone is insufficient. RPC, JSON and print calls return unavailable promptly with guidance to ask in chat, without blocking for UI or accepting defaults. One invocation owns its transient UI and answers. Cancellation, tool abort and session/runtime invalidation must not submit unfinished answers, leave a stale prompt usable or leak owned listeners. Fresh invocations do not inherit previous answers or drafts. Use the ordinary tool result and host-controlled follow-up; the extension does not call model/provider APIs, create agents/processes, schedule independent model turns, manage jobs/gates, write settings or maintain background work.
:::

:::mara requirement REQ-QUESTIONS-INDEPENDENT
:mid: 01M3VDEY3BS04HKRAMC8S2X0TJ
:title: Author the extension from the repository contracts without copying upstream
:status: accepted
:kind: constraint
:contributes_to: GOAL-QUESTIONS-USER-INPUT

Implement and test the repository-owned questions extension independently from this contract and its reviewed design. Do not copy the reference extension's implementation, tests, assets or authored documentation, install it as a runtime dependency, or adopt its build/dependency choices by default. Upstream inspection informs the discussed observable behavior only; it is not the implementation specification. Keep project contracts and verification canonical in Mara and observe the repository's package, publication and release-compatibility practices.
:::

:::mara decision ADR-QUESTIONS-INDEPENDENT
:mid: 01M3VDF1HEAHB9SQVEH7H4MD7D
:title: Use a specification-led independent implementation rather than a source fork
:status: accepted
:justifies: REQ-QUESTIONS-INDEPENDENT

The user explicitly chose an independent implementation after inspection did not find an upstream license file or package license declaration. Preserve the requested observable questionnaire behavior and the agreed recommendation improvement as repository-owned requirements; write fresh code and tests from reviewed contracts later. This avoids making source reuse or upstream architecture an implicit prerequisite. The inspected revision is provenance only; no legal conclusion about upstream licensing or claim of copied-source permission is made.
:::
