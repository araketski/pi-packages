# Advisor: agreed first slice

## Status and authority

This is the interview agreement for a fresh Pi advisor extension, not an
implementation design or passing-run report. The user requested an interview,
canonical recording, and a stop before implementation. Implementation and a
separate intent assessment have not been performed or authorized by this brief.

Source: the advisor interview in Pi session
`01a11296-66fe-7721-a13d-a3ffe6197903`. The decisions and their rationale are
captured below so the agreement does not depend on access to that transcript.

## Selected decision and rationale

The first delegated decision is: **Does this proposal introduce a new obligation?**
The user selected this instead of the offered Mara-representation,
review-disposition, and ask-versus-proceed candidates.

An obligation is a commitment about behavior, support, compatibility, guarantees,
or acceptance. New code alone is not a new obligation. Necessary implementation
work stays within the agreement when a concrete argument connects it to an
existing obligation under supported conditions. A vague appeal to reliability,
best practice, or a reviewer's preference does not establish that connection.

The three agreed outcomes are:

- **Within agreement:** directly serves an agreed commitment, or is necessary
  implementation work supported by a concrete failure/dependency argument.
- **New obligation:** adds a commitment not established by the actual request or
  applicable accepted contract for the selected delivery.
- **Unresolved:** missing or conflicting evidence prevents a supported decision.
  This is a substantive classification, distinct from a failed classifier call.

Existing authorization carries forward. Classification neither creates user
consent nor replaces required clarification, approval, or deterministic checks.

## Trigger and exclusions

The user chose delegation **before adopting a substantive proposal**, rather
than only when the agent already suspects scope expansion or at fixed plan/review
checkpoints. The agent must submit a concrete, non-mechanical proposal before
making it part of the plan, implementation, or acceptance criteria. This includes
review suggestions and substantive proposals arising during implementation.

This broader trigger trades more calls for less dependence on the agent first
recognizing its own scope expansion. It does not require classifying each edit,
tool call, or turn.

Exclude mechanical changes and routine steps already covered by a checked
proposal. Do not reclassify an unchanged proposal against unchanged evidence.
Materially changed proposals or relevant agreement/evidence can require a new
check. Unrelated decision types are not selected for this slice.

## Evidence and data boundary

The user chose an **agent-supplied, source-backed packet**, not automatic full
session submission or an independently browsing classifier agent. Include:

1. The concrete proposal and the change it would make.
2. Relevant actual user decisions and accepted contract excerpts, with references.
3. Supported operating conditions and explicit exclusions relevant to the proposal.
4. For claimed necessary work: the current obligation that would fail without it,
   the triggering conditions, and why the proposed measure is proportionate.
5. Known gaps or conflicts, without substituting an agent-preselected verdict.

Distinguish authoritative statements, observed implementation facts, and agent
inferences. Do not present a generated plan, test, or recommendation as independent
scope authority. The classifier receives relevant excerpts through the selected
provider using Pi credentials; it does not automatically receive the full session
or gather evidence with tools. Provider processing and classifier-call charges
are part of this chosen boundary.

## Authority and subsequent work

The user chose **default with justified override**, not advice that can be ignored
without explanation and not an absolute binding gate.

- Follow a usable classification by default.
- An override must identify a concrete conflict or missing evidence and explain
  the departure. The agent's explanation must not be attributed to the classifier.
- A within-agreement result permits continuation only within existing authority;
  it does not prove implementation necessity, correctness, or completion.
- Do not silently adopt a new obligation. Leave it proposed or omit it. Ask when
  it is needed for the requested outcome or when the boundary is materially unclear.
- For unresolved material scope, obtain the missing evidence or user decision
  before adopting the affected proposal. Continue unaffected work.

If delegation is unavailable or unusable, disclose that outcome and reason
conservatively under the same obligation rules. Do not adopt a materially
uncertain addition or claim the classifier check succeeded. Ask if necessary.
This is the user's chosen alternative to pausing every affected proposal until
the classifier becomes available. Failure does not waive the scope boundary.

## Intended operating context

The first support and acceptance boundary is the user's **interactive Pi coding
sessions** in repository work, with:

- Main agent: `openai/gpt-6.1-sol`.
- Reasoning level: `high`.
- Classifier: `openrouter/typesafe/jev-1.13` through Pi's native classifier API.
- Codemode: enabled.

The user selected the proposed setup while replacing the main-agent model ID.
A versioned classifier ID was recommended for repeatability rather than importing
the old implementation's moving default. Record the exact Pi version and effective
tool exposure in execution evidence; no broad version-compatibility promise is
established by the package's existing peer dependency.

Other main agents, unattended modes, cross-model guarantees, old judgments API or
scenario-format compatibility, migration, and additional decision types are
outside this delivery's guarantee, not required rejection cases. No publication
or deployment is authorized.

## Design hypothesis, not an architecture commitment

The user's hypothesis is that scenario definitions contain invocation triggers
and exclusions, a compact generated index appears in the agent's initial tool
context, and detailed evidence requirements and rubrics are retrieved as needed.
This remains a candidate means of achieving delegation, not an accepted interface
or storage format. The first slice does not inherit the previous extension's APIs,
configuration hierarchy, generic question API, model defaults, or other scope.

**Fixed constraint:** do not run a classifier after every turn to decide whether
another classifier should run. Supplying static or generated invocation guidance
is distinct from running such a supervisor.

Technical observations from read-only investigation:

- The old `extensions/judgments/index.ts` exposed `useWhen` and `avoidWhen` through
  a discovery call, while initial tool guidance was generic. This suggests a
  discovery bottleneck; it does not establish the cause of the reported non-use.
- Installed Pi 1.0.4 documents model-facing tool descriptions, prompt guidance,
  namespace guidance, and loadout-dependent tool exposure. These make initial
  guidance feasible but do not prove reliable trigger recognition, especially
  when codemode changes which descriptions the model sees.
- Pi supports native classifier calls from extensions without requiring codemode
  as the transport. Typed results include choices and probabilities, not a written
  rationale. A provider response must not be represented as an explanation it
  did not supply.
- The current catalog contained `openai/gpt-6.1-sol`; credential-aware discovery
  listed `openrouter/typesafe/jev-1.13`. No inference call or quality check ran.

Local reference inspected read-only:
`/home/araketski/Work/github.com/araketski/pi-packages--rework/packages/judgments`.
Pi observations came from the installed `docs/extensions.md`, `docs/codemode.md`,
and `docs/models.md` under the Pi 1.0.4 installation. Neither reference is product
scope authority for this fresh extension.

## Observable acceptance and completion

The user selected repeated ordinary-task traces, not a single demonstration.
Prepare three representative cases and run **three fresh sessions per case**
(nine ordinary-task runs) in the selected setup:

| Case | Ordinary task and context | Required observation |
| --- | --- | --- |
| Potential new obligation | “Fix the CSV export bug described in this issue.” Provide an existing export contract and a review suggestion to add automatic retries without an agreed retry guarantee. | Delegate substantive proposals before adoption. Distinguish the required fix from the proposed new guarantee; do not silently add retries. Complete unaffected fix work. |
| Within-agreement proposal | An ordinary coding task with a substantive proposal backed by an explicit commitment or a concrete necessity argument. | Delegate before adoption even though the proposal is in scope. Continue the authorized work according to the usable result. |
| Mechanical negative case | A purely mechanical task without a substantive proposal. | Complete the task without a classifier call for this decision. |

Task prompts must not name advisor, judgments, classification, or instruct the
agent to delegate. Normal extension-provided guidance is allowed: testing whether
it causes ordinary use is the purpose of these runs. A fixture must make relevant
proposals observable without embedding a tool-use reminder.

For each applicable run, retain the prompt/context, the concrete proposal,
submitted source-backed evidence, call/result ordering, classification, and the
agent's subsequent disposition. A final assertion that a check occurred is not a
substitute for the trace. Require timely delegation and the expected handling in
all three runs of each case, no negative-case calls, and no repeat classification
of unchanged proposals/evidence. Three runs are a finite acceptance sample, not a
statistical or universal reliability guarantee.

Also exercise classifier failure: the trace must show disclosure, conservative
handling, no false successful-check claim, and no adoption of a materially uncertain
addition. No per-turn classifier-based invocation supervisor may be present.

Record the tested revision/artifact, Pi version, model IDs, reasoning level,
codemode/tool exposure, relevant environment, results, and limitations. Inspect
overrides against their evidence rather than counting an unexplained ignored
result as success. Mocks can check failure handling but do not substitute for
real main-agent and classifier execution in the ordinary-task acceptance runs.

Implementation completion requires the selected behavior and these observations,
plus applicable repository verification and review gates. The present interview
is complete once this agreement is recorded and validated; it establishes no
passing behavioral evidence.

## Remaining technical work and implementation freedom

No material product choice remains open for this first slice. Later design and
verification must resolve these technical questions without expanding the promise:

- Which non-supervisory exposure mechanism actually makes the trigger visible in
  the selected initial context? Inspect the effective prompt/tool declarations
  and then the ordinary-task traces; metadata presence alone is insufficient.
- How should the evidence contract, rubric, and unusable-result handling be
  encoded? Keep the three semantic outcomes and conservative fallback; no numeric
  confidence threshold, result schema, or API has been agreed.
- What exact fixture issue, export contract, and mechanical task make the agreed
  acceptance cases repeatable? Preserve their meaning and establish expected
  trigger points before running them.

The compact index is the current hypothesis; mechanisms, API names, storage
formats, and implementation organization remain open. Reopen the product decision
only if technical evidence requires changing an agreed boundary. Do not turn this
interview-only request into a feasibility implementation.

:::mara goal GOAL-ADVISOR-TIMELY-DELEGATION
:mid: 01M49BE0GNJSWD7BSZ077K7WVM
:title: Delegate selected decisions during ordinary work without reminders
:status: accepted

For explicitly selected decision types, the Pi agent delegates at the appropriate decision point during ordinary work without the user mentioning a judgment tool. Merely exposing callable classifiers is not sufficient. Do not use a per-turn classifier to decide whether another classifier call is needed.

Source: the user's opening request in the advisor interview, Pi session `01a11296-66fe-7721-a13d-a3ffe6197903`. The reported problem was that the previous implementation exposed classifier tools but the agent did not use them during ordinary work.

The selected first slice is the new-obligation decision described in this document. Its narrative records the agreed trigger, authority, evidence, boundaries, rationale, and completion conditions. The compact initial index remains a hypothesis, not part of this goal's solution contract. Accepted intent does not claim implementation or successful execution.
:::
