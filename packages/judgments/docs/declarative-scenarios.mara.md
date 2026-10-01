# Declarative judgment scenarios

The user approved this next-increment design after reviewing JSON-only,
filename-based scenario identity, fixed/dynamic criteria, agent-facing preparation
guidance and scope/loading rules. The subsequently approved layout keeps a
`config.json` for provider/model selection next to `scenarios/`. It extends the [core contract](contract.mara.md);
the advisory/native-runtime boundaries remain authoritative.

**Implementation state:** implemented. The four public tools now use the shared
JSON definition validator, scoped loader and provider/model-pair selection.
The bundled Mara scenario is data-only, with fixed representation and
caller-prepared flavour criteria. The generic skill teaches intentional
project-local authoring, validation and reuse without automatic persistence.

## Observed declarative verification

On Node 26.7.0, pnpm 12.8.1, Nx 23.2.1 and Pi SDK 0.99.1, all 66 tests passed:
28 definition/request-assembly cases, 14 scoped loading/config cases, 5 public
declarative-tool cases, 16 retained native/authority-boundary cases, one source
Pi replay and two fresh, independently installed npm/pnpm consumer replays.
Source `typecheck`, `lint` and `pi-check` passed. The consumer tests explicitly
packed fresh archives and passed `pi-check-package` on each before installation.

The replays exercise choice, bool and score answers through real Pi tool and
native classifier execution against local HTTP; they check authentication,
reported usage, refresh-on-call, invalid override blocking, config selection,
host trust denials and acceptance of custom-data-only projects without a native
trust trigger. Discovery/validation make no classifier calls; configuration
and model selection are not rewritten. The archives include the JSON scenario
and exclude tests and repository-only Mara specifications.

The earlier definition and loading increments were committed as `c6fd1fa` and
`d244f19`. Reproduction commands are in the
[core verification notes](contract.mara.md#observed-initial-verification).
These controlled tests are not a live accuracy campaign and do not establish
quality improvements, token savings, reliable agent invocation, compatibility
with other Pi versions, license completeness or publication readiness.

The subsequent purpose-input refinement was verified red–green: the minimal
Mara input without `purpose` initially failed evidence validation; after making
it optional, all 67 tests passed. Controlled cases cover both omitted and
supplied intended-use purpose, with unchanged evidence reaching the classifier.
The source and fresh npm/pnpm consumer replays use only candidate content and
actual flavour guidance, plus dynamic criteria. Source typecheck, lint and
`pi-check`, and both fresh archive `pi-check-package` checks passed. Rubric
instructions distinguish genuine ambiguity from an absent optional field;
these tests do not prove live classifier adherence or savings.

The subsequent invocation-guidance refinement explicitly excludes confirmation
of already-established classifications, including a batch explicitly designated
as requirements. Mixed batches delegate only unresolved candidates. The discovery
regression failed before the guidance change, then all 67 tests and source checks
passed, including fresh npm/pnpm consumers and their explicit archive checks.
Read-only `judgments_validate_scenario` also returned valid for the bundled
scenario. These checks establish exposed guidance, not enforced agent behavior;
no automatic gate or batch evaluator was added.

These folders are extension-owned data locations following Pi's agent-directory
and working-directory conventions, not a resource kind Pi already discovers.
A custom scenario directory alone is not one of Pi's documented native
project-trust triggers. Implementation must verify the actual host trust
behavior rather than equating directory presence or command-line extension
loading with project trust. The observed host result is true for custom-data-only
projects without a prompt. The user explicitly accepted that behavior: use the
host's reported state, preserve denials, and add no extra trigger requirement.

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

Support optional package-owned JSON classifier-selection configuration at `<agent-dir>/judgments/config.json` and `<cwd>/.pi/judgments/config.json`, alongside each scope's `scenarios/` directory. Each configuration file contains a complete `provider` and `model` pair, not a router setting or a partial selection. Model IDs are provider-specific; do not independently merge these fields across configuration scopes. Select the trusted project pair over the global pair, then the existing default pair `openrouter` and `~typesafe/jev-latest`. Explicit `--judgments-provider` / `--judgments-model` CLI overrides take precedence: a model-only override applies to the selected provider, while changing that provider requires an explicit model. Default-valued flag registrations must not be mistaken for explicit user overrides. Invalid configuration produces explicit errors rather than being treated as absent or triggering lower-scope/default fallback. An unavailable provider/model combination returns an honest error without guessing a replacement. Keep credentials in Pi's existing credential management, not in this file; do not introduce router logic, rewrite host settings or create configuration automatically. The configuration file is not a scenario and must not enter scenario discovery. Project configuration follows the same host trust boundary as project scenario data.

Use camelCase metadata: `formatVersion` (initially 1), `mode`, `purpose`, `useWhen`, `avoidWhen`, `inputSchema`, `questions` and `interpretation`. `inputSchema` is self-contained JSON Schema for supplied evidence, compatible with Pi's validation facilities; standard property `description` and optional `examples` explain input meanings and preparation. Do not fetch remote schemas or resolve external schema dependencies. Reject unsupported schema features explicitly during definition validation rather than silently ignoring constraints. Version 1 supports boolean schemas, type, properties/patternProperties, additionalProperties, required, property-count constraints, items, array length/uniqueness, string length/pattern, numeric bounds/multipleOf, enum/const, allOf/anyOf/oneOf/not, and title/description/examples/default annotations. References (including local references), dialect declarations, formats and other keywords are explicitly unsupported in this increment. Types, required fields and constraints validate structure, not semantic adequacy. Do not create a separate input glossary or rename external source data such as Mara's schema keys.

Questions are keyed by question ID and retain native classifier `type`, `instructions` and fixed `criteria`. With `mode: fixed`, every question must contain criteria; an omission is a definition error. With `mode: dynamic`, at least one question omits criteria, and each omitted question requires nonblank agent-facing `criteriaGuidance`. Fixed questions may coexist. The mode must match the question contents rather than being silently inferred or repaired.

Evaluate a scenario with `{scenario, input, criteria?}`. Validate evidence against `inputSchema`. Caller criteria are keyed by question ID and must match that saved question's native criteria shape: choice label-to-description mapping, bool true/false descriptions, or score description array. Combine them with the saved questions before using the shared native classifier runtime. Missing required criteria, unknown question IDs and attempted overrides of fixed criteria are errors before classification. Do not introduce `from` bindings, JSON Pointer lookup, templates, expressions, executable scenario code or scenario-specific executors.

Retain `judgments_list_scenarios`, `judgments_evaluate_scenario` and unchanged generic `judgments_evaluate`; add separate read-only `judgments_validate_scenario` for saved definitions, without a classifier request or file repair. Discovery returns scenario identity, purpose, invocation/exclusion guidance, evidence schema with descriptions/examples, required dynamic question IDs/types and criteria guidance, interpretation, and source/scope. Fixed classifier rubrics stay internal. A known suitable scenario remains directly callable without repeated discovery.

Resolve project over global over bundled definitions. Same-scope duplicate IDs are errors. An invalid higher-scope definition blocks that ID instead of falling back to another scope. Discovery reports invalid files while leaving unrelated valid scenarios usable. Refresh definitions on explicit calls, not through a background watcher. Gate project definitions and configuration on the host context's isProjectTrusted() result. A false result excludes project data. Accept Pi's true result for custom-data-only projects even when no native trust prompt ran; the user explicitly waived a separate trigger requirement. Do not introduce another approval system, inspect or change the host trust store, or automatically create conventional resources to force a prompt.

Convert the bundled Mara scenario into JSON using the same capabilities as user-authored scenarios. Representation choices remain fixed; flavour criteria are caller-supplied, so its mode is dynamic. Require candidate content and actual project flavour guidance; `input.purpose` and `input.context` are optional. Purpose describes intended use or preservation, not a preselected flavour or a justification the agent must construct before delegation. Missing optional purpose alone does not justify an insufficient-information answer; that option is for material ambiguity in the supplied evidence. This scenario-specific input is distinct from the required definition-level `purpose` describing the scenario itself. Its criteria guidance instructs the agent to follow the portable Mara skill, retrieve the selected project's actual schema and preserve description, use_when, avoid_when and distinguish_from in criterion descriptions, using JSON text when packaging multiple guidance fields. The agent supplies project vocabulary, not a preselected winning flavour or default engineering template. Relevant existing knowledge remains evidence supplied by the agent. The extension has no Mara connection.

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

Automate fixed, dynamic and mixed-question scenario fixtures using controlled native classifier responses. Confirm filename-based identity, JSON-only definitions, camelCase metadata, mode/criteria consistency, required dynamic preparation guidance, evidence-schema validation, matching criteria shapes and rejection of missing criteria, unknown question IDs or fixed-criteria overrides before classification. Include self-contained supported input schemas and reject unsupported features or external schema dependencies without fetching remote schemas or making classifier requests. Confirm both valid modes produce ordinary native questions and retain raw typed answers and interpretation without domain executors, expression evaluation or a programmable result mapper.

Exercise optional global and trusted project `judgments/config.json` files with explicit provider/model CLI overrides and absent configuration. Verify pair-based scope precedence, preservation of the existing default pair and distinction between explicit flags and flag defaults. Use different provider-specific model IDs to prove project selection replaces the global pair without cross-scope field merging. Check that each config requires both fields, a model-only CLI override retains the selected provider, and a CLI provider change requires an explicit model. Malformed or incomplete configuration must produce explicit errors without lower-scope/default fallback; unavailable provider/model combinations must not trigger a guessed replacement. Declined project trust must exclude project configuration as well as scenarios. Confirm config.json is not discovered as a scenario, no router setting or separate credential store is introduced, and configuration reads do not rewrite host settings or create files.

Use isolated agent and working directories to check bundled/global/project loading, configured agent-directory resolution, host project-trust allow/deny behavior, precedence, same-scope duplicates, invalid overrides blocking lower definitions, visible diagnostics and continued use of unrelated valid scenarios. Modify saved files between explicit calls and observe refreshed definitions without a watcher. Include a project containing only the custom scenario folder so native trust behavior is not assumed from conventional-resource tests.

Inspect discovery for evidence descriptions/examples, required dynamic question IDs/types, criteria guidance and provenance without classifier requests. Validation of saved definitions makes no classifier calls or writes. Check generic skill guidance for intentional authoring/validation, no automatic persistence/global promotion, no unchanged-input reassessment, and no Mara-specific content. Load a data-only Mara definition with fixed representation and caller-supplied custom flavour guidance; preserve its schema guidance and explicit no-fit/insufficient options without fetching Mara or authoring knowledge.

Rerun applicable source checks, fresh explicit archive checks and independently installed Pi consumer tests. Verify the JSON definition ships in the artifact and loads independently from source TypeScript, while tests and repository-only specifications remain excluded. Preserve native authentication/selection, failure/cancellation, usage and authority-boundary coverage from the core contract. These are repeatable acceptance checks; observed results and their limitations are recorded separately in the Observed declarative verification section. An accepted verification definition does not itself establish delivery, accuracy, token savings or reliable invocation.
:::
