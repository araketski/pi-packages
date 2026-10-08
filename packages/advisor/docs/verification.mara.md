# Advisor acceptance methods

These are repeatable checks to perform after implementation, not passing evidence.
The ordinary-task method is the agreed acceptance sample, not a universal reliability
or statistical performance guarantee.

:::mara verification VER-ADVISOR-ORDINARY-TASKS
:mid: 01M4E8KM8Y2YBR431T7GPN8JAW
:title: Repeat ordinary tasks without delegation reminders
:status: accepted
:method: demonstration
:verifies: REQ-ADVISOR-PRE-ADOPTION
:verifies: REQ-ADVISOR-EXCLUSIONS
:verifies: REQ-ADVISOR-OUTCOMES
:verifies: REQ-ADVISOR-EVIDENCE
:verifies: REQ-ADVISOR-RESULT-AUTHORITY
:verifies: REQ-ADVISOR-SCOPE-DISPOSITION
:verifies: REQ-ADVISOR-CONTEXT
:validates: GOAL-ADVISOR-TIMELY-DELEGATION
:validates: SCN-ADVISOR-CSV-RETRY
:validates: SCN-ADVISOR-IN-SCOPE
:validates: SCN-ADVISOR-MECHANICAL

Prepare repeatable fixtures for the three linked ordinary-task scenarios and identify expected trigger points before running them. Use the exact main-agent, reasoning, classifier, and codemode setup in [[REQ-ADVISOR-CONTEXT]]. Run three fresh sessions per case: nine ordinary-task runs in total.

**Procedure and pass conditions**

- Task prompts must not name advisor, judgments, classification, or tell the agent to delegate. Normal extension-provided guidance is allowed; whether it causes ordinary use is the subject of the check.
- Both substantive cases must show a real main-agent call to the real classifier before adoption, an appropriate source-backed evidence packet, and the expected subsequent handling in all three runs of each case.
- The CSV case must separate the required fix from the unagreed retry guarantee and complete unaffected fix work without silently expanding scope.
- The within-agreement case must continue authorized work according to a usable result, despite not starting from suspected scope expansion.
- All three mechanical runs must complete the task without calls for this decision.
- Do not reclassify unchanged proposals against unchanged evidence. Inspect any override for a concrete supported explanation; unexplained disregard is not success.

**Retained execution record**

Capture the prompt and relevant fixture context, concrete proposal, submitted evidence, call/result ordering, classification, subsequent disposition, and outcomes. Record the tested revision/artifact, exact Pi version, both model IDs, reasoning level, effective codemode/tool exposure, relevant environment, and limitations. A final assertion that a check happened, metadata presence, mocks, or direct-call tests alone cannot establish this ordinary-work behavior.

**Source and limit:** the user's “Repeated ordinary-task traces” selection, rather than one demonstration. Three runs per case are a finite acceptance sample, not a statistical or universal reliability guarantee. This item defines a method; no execution result is recorded.
:::

:::mara verification VER-ADVISOR-FAILURE
:mid: 01M4E8KM98VWE83E7J7D19ZE0F
:title: Exercise unavailable or unusable classification
:status: accepted
:method: test
:level: acceptance
:verifies: REQ-ADVISOR-FAILURE
:verifies: REQ-ADVISOR-RESULT-AUTHORITY
:verifies: REQ-ADVISOR-SCOPE-DISPOSITION
:validates: SCN-ADVISOR-CLASSIFIER-FAILURE

Exercise the linked failure scenario with classification unavailable or unusable while the affected proposal has materially uncertain scope. Inspect the response and subsequent work, not merely an error code.

Pass only when the agent discloses failed delegation, makes no successful-check claim, reasons conservatively, does not adopt the uncertain addition, asks when a material decision is needed, and continues unaffected work without waiving authority boundaries.

Retain the failure condition, tested revision/artifact, setup, trace, and observed disposition. Controlled failure substitutes or mocks may exercise this path, but cannot substitute for real execution of [[VER-ADVISOR-ORDINARY-TASKS]]. No repetition count beyond exercising failure was agreed for this check.

Source: the user's failure-behavior and acceptance selections. This is a check definition, not evidence that failure handling works.
:::

:::mara verification VER-ADVISOR-BOUNDARIES
:mid: 01M4E8KM9M65GJFSGG2FZ12NGM
:title: Inspect invocation and evidence boundaries
:status: accepted
:method: inspection
:verifies: REQ-ADVISOR-NO-SUPERVISOR
:verifies: REQ-ADVISOR-DATA-BOUNDARY
:verifies: REQ-ADVISOR-EVIDENCE
:verifies: REQ-ADVISOR-OUTCOMES

Inspect the candidate extension's invocation paths, evidence construction, selected classifier integration, and outcome contract.

Pass only if:

- No classifier runs after every turn to decide whether another classifier should run.
- Classifier input is the relevant agent-supplied packet, not an automatic full-session submission, and the classifier does not independently gather evidence with tools.
- Provider calls use the selected Pi-native integration and credentials.
- The evidence contract preserves authoritative sources, support boundaries, necessity arguments, and explicit gaps rather than assuming the caller's preferred verdict.
- The decision contract preserves within-agreement, new-obligation, and unresolved semantics, with unresolved distinct from a failed or unusable call.

Record the inspected revision and the relevant paths and findings. Inspect effective initial prompt/tool declarations under codemode to investigate whether invocation guidance is visible; visibility alone is not acceptance evidence for timely delegation. The linked ordinary-task method must establish behavior separately.

Source: inspection of the agreed no-supervisor constraint, evidence/data boundary, and three-outcome contract. This method operationalizes those commitments; it selects no architecture, API names, or confidence threshold.
:::
