# Lightweight Pi judgment assistance

This records the user-agreed purpose and initial scope. `judgments` is a staging
label, not a frozen package or tool registration name. No package has been
scaffolded and no implementation or quality/token-saving benefit is established.

## Initial scope and boundaries

Implement one on-demand Pi judgment operation with predefined scenario and generic
question modes. Start with one bundled Mara representation/flavour scenario;
user-defined scenario files, clarification and proportionality scenarios, Work
integration, automatic supervision, persistent decision state and review gates are
deferred. Do not build a scenario marketplace, separate process, tool broker,
provider client or shared framework before a concrete need exists.

A judgment scenario is a saved classifier question set and its usage guidance,
not a Mara `scenario` item or an executable action. Exact configuration syntax,
public argument/result schemas and registration names remain implementation design
work. Both modes perform the same coherent judgment operation and must preserve
[native atomic tool conventions](../../workflow-contracts.mara.md).

The portable Mara skill and Mara/Work operations remain agent-agnostic. Pi-specific
judgment guidance belongs to the Pi package, not the portable skill. The agent
still has to recognize a decision point and supply adequate evidence: usage
guidance is assistance, not an enforcement guarantee. Confidence is not evidence,
acceptance, authorization or proof of correctness.

The goal extension's [classifier policy](../goal/classifiers.mara.md) is a separate
contract. Its per-active-goal cadence, pause behavior, cutoffs and reference model
are not inherited by this on-demand assistant.

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

Expose one coherent judgment operation accepting either a named bundled scenario with its required input or generic state and typed questions. A predefined scenario supplies purpose, use-when and avoid-when guidance, required context, fixed classifier questions and result interpretation. Expose a concise scenario catalog to the agent and make detailed guidance available when needed, rather than requiring it to reconstruct the rubric on every call. Retain the generic mode for judgments outside bundled scenarios.

Judgments run only when requested at relevant decision points, not automatically on every turn or tool call. Guidance must discourage repeated assessment of unchanged relevant inputs; no background monitor or persisted judgment cache is required. The first bundled checkpoint is before creating a Mara item or changing its flavour, not ordinary wording edits. Return structured advisory results, not automatic mutations, model switches or execution approvals. Explicit user instructions, accepted requirements, mandatory clarification/approval rules and deterministic verification remain authoritative.
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

Use a small Pi extension to implement the single-purpose judgment operation, with one bundled Mara question set and an alternative generic state/questions path. Resolve the configured classifier through Pi's model runtime and execute typed classification with the runtime-resolved credentials. Keep scenario metadata and questions together with concise agent-visible invocation guidance; details may load on demand. No user-defined declarative file loader, separate classifier runtime, periodic hook, persistence subsystem or action dispatcher is part of the first increment.

The agent follows the portable Mara skill to gather selected-project guidance and relevant knowledge, supplies that context to the operation, interprets its recommendation and authors/validates through Mara. Fixed questions reduce repeated rubric construction; project vocabulary remains input data. Missing context and classifier failures remain explicit rather than becoming positive judgments. Exact API names, serialization and classifier question wording are not frozen by the conversational examples.
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

Use controlled classifier responses and Pi integration fixtures to exercise both modes: bundled scenario construction uses its declared questions and required input, while generic questions reach the same native runtime without needing a scenario. Inspect catalog/detail guidance for purpose, invocation checkpoints, exclusions and result interpretation; idle turns and unrelated tool activity must make no classifier calls.

Supply a custom Mara vocabulary and check it is preserved in the classification input rather than replaced with built-in flavours. Exercise item/flavour, narrative, mixed-content and insufficient/no-fit responses with controlled answers. Verify that the tool does not retrieve Mara context, mutate knowledge, change the main model or alter permissions. Missing required input must not silently produce a successful assessment. Exercise configured classifier selection, unavailable credentials/model, provider failure and cancellation; require honest outcomes without provider fallback. Inspect usage handling through supported native tool results and preservation of explicit approval/clarification requirements in guidance.

These checks establish the operation contract, not classifier accuracy, token savings, reliable invocation by every agent or real-world authoring quality. Tests can be automated without requiring the user to perform a manual evaluation campaign. No implementation checks have run for this planned assistant.
:::
