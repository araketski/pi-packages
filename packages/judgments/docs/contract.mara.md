# Lightweight Pi judgment assistance

This records the user-agreed purpose and scope of `@araketski/pi-judgments` at
`packages/judgments`. The tools, generic skill and declarative JSON scenarios
are implemented. The [declarative-scenario contract](declarative-scenarios.mara.md)
records the current definition/loading interface and observed checks separately
from approval. No quality/token-saving benefit is established.

## Initial scope and boundaries

The package provides four on-demand namespaced Pi tools: scenario listing,
saved scenario evaluation, generic question evaluation and read-only saved
scenario validation. It bundles one generic judgment skill and one data-only
Mara representation/flavour scenario. JSON definitions and scoped classifier
configuration follow [the declarative contract](declarative-scenarios.mara.md).
Clarification and proportionality scenarios, Work integration, automatic
supervision, persistent decision state and review gates remain excluded. Do not build a scenario marketplace, separate
process, tool broker, provider client or shared framework before a concrete need
exists.

A judgment scenario is a saved classifier question set and its usage guidance,
not a Mara `scenario` item or an executable action. The current public interface
is summarized below. Each tool has one coherent responsibility and must preserve
[native atomic tool conventions](../../../docs/workflow-contracts.mara.md).

The portable Mara skill and Mara/Work operations remain agent-agnostic. Pi-specific
judgment guidance belongs to the Pi package, not the portable skill. Its bundled
judgment skill is generic: all Mara-specific guidance belongs to the bundled
scenario metadata, not that skill. The agent still has to recognize a decision
point and supply adequate evidence: usage
guidance is assistance, not an enforcement guarantee. Confidence is not evidence,
acceptance, authorization or proof of correctness.

The goal extension's [classifier policy](../../../docs/planned/goal/classifiers.mara.md) is a separate
contract. Its per-active-goal cadence, pause behavior, cutoffs and reference model
are not inherited by this on-demand assistant.

## Implemented interface

- `judgments_list_scenarios({})` discovers authorized bundled/global/project
  definitions and diagnostics without classification. Metadata includes `id`,
  `mode`, `purpose`, `useWhen`, `avoidWhen`, `inputSchema`, `dynamicQuestions`,
  `interpretation` and `source`. Fixed questions stay internal.
- `judgments_evaluate_scenario({scenario, input, criteria?})` evaluates a saved
  definition. Supply JSON-object evidence and criteria keyed by each required
  dynamic question ID. Fixed criteria cannot be overridden. The bundled
  `mara-representation` takes `content`, `purpose`, actual project `flavours`
  guidance and optional `context`, plus caller-prepared flavour criteria.
- `judgments_evaluate({state, questions})` retains the generic native `choice`,
  `bool` and `score` interface for judgments outside saved scenarios.
- `judgments_validate_scenario({scenario})` validates the selected saved definition
  and returns identity, provenance and diagnostics without classification,
  repair or writes. Invalid/missing definitions set the host error flag.

Tools share native namespace `judgments` while retaining unique registration
names. Essential delegation/data-flow/authority guidance is in descriptions;
the bundled skill remains entirely generic. Scenario metadata supplies the
Mara checkpoint, schema-retrieval instructions and authoring responsibilities.

Classifier selection uses explicit CLI flags over the trusted project
`judgments/config.json` pair, the global pair and defaults
`openrouter/~typesafe/jev-latest`. Config files must supply both provider and
model; a CLI provider change requires an explicit model. Credentials remain in
Pi. See [the declarative design](declarative-scenarios.mara.md) for complete
selection, loading, validation and host-trust rules. Supplied context goes to
that classifier and may incur charges. Each evaluation submits one native
request with automatic transport retries disabled; cancellation is forwarded
and late results after cancellation are not treated as assessments.

Evaluation returns `advisory: true`, `classifier`, `guidance` and runtime
`status`. Successful native responses retain raw typed `answers`; native `usage`
is included in structured and host tool results only when reported. Saved
scenarios also return identity, source and interpretation. There is no computed
`assessment` or `flavour_labels` mapper. `assessed` means a valid native response,
including no-fit or insufficient-information answers, not a favorable judgment.
The agent interprets those answers against the rubric and evidence. Unavailable,
failed and aborted results set the host error flag. Invalid inputs are rejected
before classification without echoing evidence; provider diagnostics are sanitized.

The bundled scenario asks independent representation and conditional-flavour
questions in one request. Flavour criteria preserve the actual project schema
rather than a hardcoded vocabulary; the agent supplies and interprets labels.
Missing flavour context is distinct from no fit. There is no confidence cutoff
or automatic action. Read uncertainty against evidence rather than interpreting
`assessed` as truth.

## Observed initial verification

The original implementation checkpoint was commit `ab6fb31`. On Node 26.7.0,
pnpm 12.8.1, Nx 23.2.1 and Pi SDK 0.99.1:

- 19 automated tests passed: controlled native responses/failures/cancellation,
  local discovery, all representation outcomes, custom vocabulary and guidance
  placement, plus source and independently installed npm/pnpm artifact replay.
- Source `typecheck`, `lint` and `pi-check` passed. Both fresh consumer
  tarballs passed `pi-check-package`. Publication allowlisting excluded tests,
  compiler configuration and repository-only Mara specifications.
- The offline HTTP replay exercised real Pi discovery, tool execution, native
  System One bool-wire adaptation, host credentials, usage reporting, provider
  failure and configured unavailability without classifier fallback, automatic
  hooks or main-model/config changes.
- The development workspace's frozen-lockfile install succeeded.

Reproduce repository checks through `pnpm nx run-many -t
test,typecheck,lint,pi-check -p @araketski/pi-judgments`. This machine used
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_PREFER_NODE_STRIP_TYPES=false`
to avoid its plugin-worker/native-TS loading issues. For explicit packing use
`pnpm nx pack @araketski/pi-judgments --packDestination=<absolute-directory>`,
then `pnpm nx run @araketski/pi-judgments:pi-check-package
--tarball=<absolute-archive>`.

These checks use controlled answers and local HTTP, not a live Jev accuracy
campaign. They do not prove quality improvement, token savings, reliable agent
invocation, other Pi versions, licensing completeness or publication readiness.

## Agreed contract

:::mara goal GOAL-JUDGMENTS-ASSISTANCE
:mid: 01M3VDSQXGB4DSD0BZJDY0X0HV
:title: Make repeated bounded judgments easier without adding supervision
:status: accepted

Reduce repeated question-design work for agents through reusable, narrow classifier judgments, while retaining generic judgments for new situations. This is advisory assistance at selected decision points, not guaranteed token savings, improved accuracy or autonomous supervision.
:::

:::mara requirement REQ-JUDGMENTS-ON-DEMAND
:mid: 01M3VDSVBTGKT5KYWBR2HC72MK
:title: Provide predefined and generic advisory judgments on demand
:status: accepted
:kind: functional
:contributes_to: GOAL-JUDGMENTS-ASSISTANCE

Expose three separate core, single-purpose namespaced tools: list available scenarios, evaluate a named scenario with its required inputs, and evaluate generic state with typed questions. Preserve globally unique registration names as well as native namespace metadata. Retain generic evaluation for judgments outside bundled scenarios. The declarative increment adds a fourth read-only definition-validation tool under [[REQ-JUDGMENTS-DECLARATIVE]].

Scenario listing returns selection metadata: ID, purpose, use-when and avoid-when guidance, required inputs, dynamic criteria preparation and interpretation guidance. Fixed classifier questions remain internal to scenario execution so the agent need not reconstruct the rubric. Listing does not call a classifier. Known suitable scenarios may be evaluated directly; unfamiliar judgments warrant catalog inspection; when none fits, use generic evaluation. Do not require a listing call on every turn or repeated listing of already-known scenarios.

Bundle one generic judgment skill covering when to delegate, scenario selection, input preparation, probabilities, uncertainty and failure handling. It contains no Mara-specific instructions; those belong to the bundled scenario metadata. Keep essential invocation guidance in the tool descriptions rather than relying on automatic skill loading.

Judgments run only when requested at relevant decision points, not automatically on every turn or tool call. Guidance must discourage repeated assessment of unchanged relevant inputs; no background monitor or persisted judgment cache is required. The initial Mara scenario's checkpoint is before creating an item or changing its flavour, not ordinary wording edits. Return structured advisory results, not automatic mutations, model switches or execution approvals. Explicit user instructions, accepted requirements, mandatory clarification/approval rules and deterministic verification remain authoritative.
:::

:::mara requirement REQ-JUDGMENTS-NATIVE-CLASSIFIER
:mid: 01M3VDSYKP5T6QN6AYDAXR36PT
:title: Use configured native classifiers and report unavailable judgments honestly
:status: accepted
:kind: functional
:contributes_to: GOAL-JUDGMENTS-ASSISTANCE

Run both judgment modes through Pi's native classifier runtime and existing provider credentials. Classifier selection is configurable; the initial selection is provider `openrouter`, model `~typesafe/jev-latest`. Do not introduce a separate provider client or credential store, rewrite host settings or silently choose another provider/model when the selected classifier is unavailable or fails.

Return explicit unavailable, failed or insufficient-information outcomes as appropriate; do not fabricate a successful assessment. Agent guidance permits ordinary schema-guided reasoning when assistance is unavailable or inconclusive, without waiving mandatory clarification or approval rules. Necessary supplied context is sent to the selected classifier; communicate that data flow without claiming classification is local. Preserve supported native usage reporting without inventing missing cost data. Quality and savings are not guaranteed.
:::

:::mara requirement REQ-JUDGMENTS-MARA-CONTEXT
:mid: 01M3VDT1XJXHJCYM8K9A99JS2Z
:title: Judge Mara representation using agent-supplied project schema guidance
:status: accepted
:kind: functional
:contributes_to: GOAL-JUDGMENTS-ASSISTANCE

The initial bundled Mara scenario receives candidate content, its intended purpose and the selected project's actual flavour guidance retrieved by the agent through Mara, plus relevant existing knowledge where needed. The companion does not own a Mara connection or automatically retrieve the project corpus. Keep Mara's portable skill unchanged.

Recommend structured-item representation and a schema-declared flavour, narrative, separation of mixed concerns, or an explicit insufficient-information/no-fitting-flavour result. Use the supplied description, use_when, avoid_when and distinguish_from guidance rather than a hardcoded engineering vocabulary or flavour names alone; custom project flavours must remain eligible. Never force a flavour when none fits or treat classification as evidence of user acceptance. The agent remains responsible for grounded authoring and Mara validation; the judgment operation performs no Mara or Work writes.
:::

:::mara design DES-JUDGMENTS-LIGHTWEIGHT
:mid: 01M3VDT5C8XA9XF0NRR0Z3T0MT
:title: Wrap native classification with one bundled scenario and a generic escape hatch
:status: accepted
:kind: interface
:satisfies: REQ-JUDGMENTS-ON-DEMAND
:satisfies: REQ-JUDGMENTS-NATIVE-CLASSIFIER
:satisfies: REQ-JUDGMENTS-MARA-CONTEXT

Use a small Pi extension to register three atomic namespaced tools for scenario metadata listing, predefined evaluation and generic evaluation. The two evaluation tools share native classifier execution without combining their public argument schemas into an action-dispatch tool. Resolve the configured classifier through Pi's model runtime and execute typed classification with runtime-resolved credentials. Scenario listing is local and makes no classifier request.

Keep one bundled Mara question set alongside its selection/input/result metadata. A generic skill teaches discovery, selecting a suitable scenario, preparing context, using the generic escape hatch and interpreting results. It contains no Mara-specific authoring guidance. Short tool descriptions expose essential usage guidance; catalog metadata supplies scenario-specific checkpoints and exclusions. Do not depend on guaranteed automatic skill loading or require repeated catalog inspection for known scenarios.

The agent follows the portable Mara skill to gather selected-project guidance and relevant knowledge, supplies that context to predefined evaluation, interprets the recommendation and authors/validates through Mara. Fixed questions reduce repeated rubric construction; project vocabulary remains input data. Missing context and classifier failures remain explicit rather than becoming positive judgments. Exact API names, serialization and classifier question wording are not frozen by conversational examples. The first increment deliberately excluded a user-defined file loader. The subsequently approved [[DES-JUDGMENTS-DECLARATIVE]] adds JSON definitions and a separate read-only validation tool while preserving this lightweight runtime and authority boundary. Its raw-answer/interpretation contract replaces the first increment's domain-specific result mapper. A separate classifier runtime, periodic hook, persisted judgments or action dispatcher remain excluded.
:::

:::mara verification VER-JUDGMENTS-CONTRACT
:mid: 01M3VDT8SPEDH2M7YRYYE2E9F2
:title: Verify on-demand judgment modes native runtime use and Mara guidance
:status: accepted
:method: test
:level: integration
:verifies: REQ-JUDGMENTS-ON-DEMAND
:verifies: REQ-JUDGMENTS-NATIVE-CLASSIFIER
:verifies: REQ-JUDGMENTS-MARA-CONTEXT
:verifies: DES-JUDGMENTS-LIGHTWEIGHT

Load the core judgment tools together in Pi integration fixtures and inspect globally unique names, namespace metadata and distinct single-purpose argument contracts. The declarative increment also loads the fourth validation tool, checked by [[VER-JUDGMENTS-DECLARATIVE]]. List the bundled scenario and verify ID, purpose, invocation/exclusion guidance, required inputs, dynamic criteria preparation and interpretation metadata without a classifier request. Known scenarios must be directly callable without a preceding listing. Inspect the bundled skill for generic discovery/evaluation/uncertainty guidance and absence of Mara-specific instructions; keep scenario-specific instructions in metadata and essential usage guidance in tool descriptions.

Use controlled classifier responses to exercise both evaluation tools: bundled scenario construction uses declared questions and required inputs, while generic questions reach the same native runtime without needing a scenario. Idle turns and unrelated tool activity must make no classifier calls. Inspect guidance against unnecessary repeated listing and unchanged-input assessment; do not claim these instructions guarantee agent invocation behavior.

Supply a custom Mara vocabulary and check it is preserved in classification input rather than replaced with built-in flavours. Exercise item/flavour, narrative, mixed-content and insufficient/no-fit responses with controlled answers. Verify that the tools do not retrieve Mara context, mutate knowledge, change the main model or alter permissions. Missing required input must not silently produce a successful assessment. Exercise configured classifier selection, unavailable credentials/model, provider failure and cancellation; require honest outcomes without provider fallback. Inspect usage handling through supported native tool results and preservation of explicit approval/clarification requirements in guidance.

These checks establish the operation contracts, not classifier accuracy, token savings, reliable invocation by every agent or real-world authoring quality. Tests can be automated without requiring the user to perform a manual evaluation campaign. Observed initial checks and their limitations are recorded in the Observed initial verification section; an accepted verification definition is not itself a passing execution.
:::
