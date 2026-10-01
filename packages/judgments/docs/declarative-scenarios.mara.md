# Declarative judgment scenarios

The user approved this next-increment design after reviewing JSON-only,
filename-based scenario identity, fixed/dynamic criteria, agent-facing preparation
guidance and scope/loading rules. It extends the [core contract](contract.mara.md);
the advisory/native-runtime boundaries remain authoritative.

**Implementation state:** approved, not implemented. The current package still
has three tools and a hardcoded Mara scenario. Its [initial verification](contract.mara.md#observed-initial-verification)
does not verify the file loader, validation tool or revised input/result contract.
This document is the canonical specification for those changes, not a claim of
delivery or classifier quality.

These folders are extension-owned data locations following Pi's agent-directory
and working-directory conventions, not a resource kind Pi already discovers.
A custom scenario directory alone is not one of Pi's documented native
project-trust triggers. Implementation must verify the actual host trust
behavior rather than equating directory presence or command-line extension
loading with project trust.

## Approved contract

:::mara requirement REQ-JUDGMENTS-DECLARATIVE
:mid: 01M3VRB4T975SFPPZXR394CJF4
:title: Support reusable non-executable JSON judgment definitions
:status: accepted
:kind: functional
:contributes_to: GOAL-JUDGMENTS-ASSISTANCE

Allow reusable named judgments to be authored as JSON data rather than scenario-specific TypeScript. Use one file per scenario, with its filename stem as the canonical ID and no redundant ID field. Discover bundled, global and trusted project definitions with visible provenance and honest diagnostics. Definitions describe evidence inputs, saved native classifier questions, fixed or caller-supplied criteria and agent interpretation guidance.

Provide read-only validation of saved definitions without classification. Agents can intentionally author recurring rubrics with existing file tools, validate them and reuse them, subject to their existing delegated scope and approval requirements. Do not automatically persist every judgment or silently promote project definitions into global configuration. Keep the generic evaluation escape hatch, native runtime, advisory semantics and no-background-supervision boundaries.
:::

:::mara design DES-JUDGMENTS-DECLARATIVE
:mid: 01M3VRBAGEYSBBBMJ6HT881NV6
:title: Resolve fixed and dynamic JSON scenarios through one generic evaluator
:status: accepted
:kind: interface
:satisfies: REQ-JUDGMENTS-DECLARATIVE
:satisfies: REQ-JUDGMENTS-ON-DEMAND
:satisfies: REQ-JUDGMENTS-MARA-CONTEXT

Store one JSON file per scenario under `<agent-dir>/judgments/scenarios/`, `<cwd>/.pi/judgments/scenarios/`, or the package's bundled `scenarios/` directory. The agent directory defaults to `~/.pi/agent` and follows Pi configuration. IDs come from filename stems; do not store another `id` inside the definition. JSON is the only supported definition format.

Use camelCase metadata: `formatVersion` (initially 1), `mode`, `purpose`, `useWhen`, `avoidWhen`, `inputSchema`, `questions` and `interpretation`. `inputSchema` is JSON Schema for supplied evidence; standard property `description` and optional `examples` explain input meanings and preparation. Types, required fields and constraints validate structure, not semantic adequacy. Do not create a separate input glossary or rename external source data such as Mara's schema keys.

Questions are keyed by question ID and retain native classifier `type`, `instructions` and fixed `criteria`. With `mode: fixed`, every question must contain criteria; an omission is a definition error. With `mode: dynamic`, at least one question omits criteria, and each omitted question requires nonblank agent-facing `criteriaGuidance`. Fixed questions may coexist. The mode must match the question contents rather than being silently inferred or repaired.

Evaluate a scenario with `{scenario, input, criteria?}`. Validate evidence against `inputSchema`. Caller criteria are keyed by question ID and must match that saved question's native criteria shape: choice label-to-description mapping, bool true/false descriptions, or score description array. Combine them with the saved questions before using the shared native classifier runtime. Missing required criteria, unknown question IDs and attempted overrides of fixed criteria are errors before classification. Do not introduce `from` bindings, JSON Pointer lookup, templates, expressions, executable scenario code or scenario-specific executors.

Retain `judgments_list_scenarios`, `judgments_evaluate_scenario` and unchanged generic `judgments_evaluate`; add separate read-only `judgments_validate_scenario` for saved definitions, without a classifier request or file repair. Discovery returns scenario identity, purpose, invocation/exclusion guidance, evidence schema with descriptions/examples, required dynamic question IDs/types and criteria guidance, interpretation, and source/scope. Fixed classifier rubrics stay internal. A known suitable scenario remains directly callable without repeated discovery.

Resolve project over global over bundled definitions. Same-scope duplicate IDs are errors. An invalid higher-scope definition blocks that ID instead of falling back to another scope. Discovery reports invalid files while leaving unrelated valid scenarios usable. Refresh definitions on explicit calls, not through a background watcher. Respect Pi's project-trust decision when loading project definitions; configuration-directory presence and an explicitly loaded extension are not independent permission to load untrusted project data.

Convert the bundled Mara scenario into JSON using the same capabilities as user-authored scenarios. Representation choices remain fixed; flavour criteria are caller-supplied, so its mode is dynamic. Its criteria guidance instructs the agent to follow the portable Mara skill, retrieve the selected project's actual schema and preserve description, use_when, avoid_when and distinguish_from in criterion descriptions, using JSON text when packaging multiple guidance fields. The agent supplies project vocabulary, not a preselected winning flavour or default engineering template. Relevant existing knowledge remains evidence supplied by the agent. The extension has no Mara connection.

Return structured advisory results with runtime status, classifier identity, raw typed answers, reported usage when available, and scenario interpretation guidance. No-fit and insufficient-information meanings remain explicit in the rubric and are interpreted by the agent. Replace the current scenario-specific computed assessment/label mapper rather than inventing a programmable result-mapping language. A valid native response does not establish a favorable result, acceptance, authorization or verification. Native failures, unavailability and cancellation remain honest, without classifier-provider/model fallback or automatic actions.

The generic skill teaches discovery, preparation from scenario metadata, evaluation and intentional project-local authoring with existing write/edit tools followed by validation. It discourages repeated assessments of unchanged relevant inputs and unnecessary listing, but is not an invocation-enforcement mechanism. Mara-specific instructions remain in its definition. A workflow engine, scenario marketplace, automatic generation/persistence, global promotion and separate supervision remain out of scope.
:::

:::mara verification VER-JUDGMENTS-DECLARATIVE
:mid: 01M3VRBG6M72FN37QC9MF2X3HH
:title: Verify JSON definitions criteria assembly scope loading and agent guidance
:status: accepted
:method: test
:level: integration
:verifies: REQ-JUDGMENTS-DECLARATIVE
:verifies: DES-JUDGMENTS-DECLARATIVE

Automate fixed, dynamic and mixed-question scenario fixtures using controlled native classifier responses. Confirm filename-based identity, JSON-only definitions, camelCase metadata, mode/criteria consistency, required dynamic preparation guidance, evidence-schema validation, matching criteria shapes and rejection of missing criteria, unknown question IDs or fixed-criteria overrides before classification. Confirm both valid modes produce ordinary native questions and retain raw typed answers and interpretation without domain executors, expression evaluation or a programmable result mapper.

Use isolated agent and working directories to check bundled/global/project loading, configured agent-directory resolution, host project-trust allow/deny behavior, precedence, same-scope duplicates, invalid overrides blocking lower definitions, visible diagnostics and continued use of unrelated valid scenarios. Modify saved files between explicit calls and observe refreshed definitions without a watcher. Include a project containing only the custom scenario folder so native trust behavior is not assumed from conventional-resource tests.

Inspect discovery for evidence descriptions/examples, required dynamic question IDs/types, criteria guidance and provenance without classifier requests. Validation of saved definitions makes no classifier calls or writes. Check generic skill guidance for intentional authoring/validation, no automatic persistence/global promotion, no unchanged-input reassessment, and no Mara-specific content. Load a data-only Mara definition with fixed representation and caller-supplied custom flavour guidance; preserve its schema guidance and explicit no-fit/insufficient options without fetching Mara or authoring knowledge.

Rerun applicable source checks, fresh explicit archive checks and independently installed Pi consumer tests. Verify the JSON definition ships in the artifact and loads independently from source TypeScript, while tests and repository-only specifications remain excluded. Preserve native authentication/selection, failure/cancellation, usage and authority-boundary coverage from the core contract. These are acceptance criteria for implementation, not observed passing results; current initial tests do not establish delivery, accuracy, token savings or reliable invocation of the declarative design.
:::
