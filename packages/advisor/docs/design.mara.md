# Advisor design hypothesis

The candidate below is deliberately draft. It is not a selected architecture.

## Technical observations and their limits

These are observations from the read-only interview investigation, not new
product commitments or evidence of a working advisor:

- The old `extensions/judgments/index.ts` exposed `useWhen` and `avoidWhen`
  through discovery, while initial tool guidance was generic. A discovery
  bottleneck is plausible, but the cause of the reported non-use is unproven.
- Installed Pi 1.0.4 documented tool descriptions, prompt guidance, namespace
  guidance, and loadout-dependent exposure. Initial guidance is technically
  plausible, but visibility under codemode and reliable use require observation.
- Pi supports native classifier calls from extensions without codemode as the
  transport. Typed answers carry choices and probabilities, not written rationales;
  agent explanations must not be attributed to the classifier.
- During the interview, the catalog contained `openai/gpt-6.1-sol` and
  credential-aware discovery listed `openrouter/typesafe/jev-1.13`.
  Availability metadata does not prove inference success or decision quality.

Read-only reference:
`/home/araketski/Work/github.com/araketski/pi-packages--rework/packages/judgments`.
Pi observations came from `docs/extensions.md`, `docs/codemode.md`, and
`docs/models.md` under the installed Pi 1.0.4. Neither reference establishes
scope for the new extension.

The versioned classifier in [[REQ-ADVISOR-CONTEXT]] was recommended for repeatable
acceptance rather than importing the old moving default. Its actual quality
remains to be tested.

## Candidate interface

:::mara design DES-ADVISOR-INITIAL-INDEX
:mid: 01M4E8MKEB99QMSAR8VEBBTPQY
:title: Expose a compact invocation index and retrieve details on demand
:status: draft
:kind: interface
:satisfies: REQ-ADVISOR-PRE-ADOPTION
:satisfies: REQ-ADVISOR-EXCLUSIONS
:satisfies: REQ-ADVISOR-NO-SUPERVISOR

**Hypothesis, not an accepted architecture:** Runtime scenario definitions contain invocation triggers and exclusions. The extension generates a compact index in the agent's initial tool context. Detailed evidence requirements and rubrics are retrieved when needed. Runtime scenario formats and APIs are not selected; these definitions need not share Mara's scenario flavour or storage format.

**Intended fit:** Make the selected decision discoverable at the right time without a per-turn classifier supervisor. The `satisfies` links express proposed design intent, not demonstrated satisfaction.

**Question to resolve:** Which non-supervisory exposure mechanism actually makes the trigger visible and effective under the selected codemode setup? Tool descriptions, prompt guidance, or another mechanism remain alternatives. Inspect the effective initial prompt/tool declarations, then run [[VER-ADVISOR-ORDINARY-TASKS]]. Metadata presence alone cannot answer the behavioral question.

**Other open technical choices:** Evidence-contract encoding, rubric encoding, result schema, unusable-result handling, and any numeric confidence threshold. Preserve the accepted three outcomes and conservative fallback. No generic question API, configuration hierarchy, scenario-authoring framework, or compatibility with the old extension is implied.

**Source:** The user expressly presented the compact-index design as a hypothesis in the opening request, not a fixed architecture decision. Keep it draft unless a later decision selects it.
:::
