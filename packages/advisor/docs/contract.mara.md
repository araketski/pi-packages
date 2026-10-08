# Advisor first-slice contract

Accepted obligations for the new-obligation decision. `accepted` records agreement,
not implemented behavior. Source selections refer to the advisor interview recorded
in [the entry point](./first-slice.mara.md).

:::mara term TERM-ADVISOR-OBLIGATION
:mid: 01M4E8GSAJG2YR28B52Y90B83Z
:title: Obligation and necessary implementation work
:status: accepted

An obligation is a commitment about behavior, support, compatibility, guarantees, or acceptance within the selected delivery. Its authority comes from the actual user request or an applicable accepted contract, not from the mere existence of code, a dependency, a generated plan, a test, or a review recommendation.

New code is not necessarily a new obligation. Necessary implementation work stays within the agreement when a concrete failure or dependency argument connects it to a current obligation under supported conditions and explains why the measure is proportionate. Vague appeals to reliability or best practice do not establish that connection. Existing authorization carries forward.

Source: the user's selection of the new-obligation decision and the three-outcome/evidence choices in the advisor interview; applicable agent requirement-source policy. This definition controls the first slice, not every possible advisor decision.
:::

:::mara requirement REQ-ADVISOR-PRE-ADOPTION
:mid: 01M4E8HRZ423P42RTY99G5CKVP
:title: Delegate before adopting substantive proposals
:status: accepted
:kind: functional
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

For the selected decision, the agent shall delegate whether a concrete, non-mechanical proposal introduces a [[TERM-ADVISOR-OBLIGATION]] before adopting it into the plan, implementation, or acceptance criteria. This applies to review suggestions and substantive proposals arising during implementation, including those the agent believes are already in scope.

The agent shall do this in ordinary work without the user naming advisor, a judgment tool, or asking for classification. The trigger is not limited to suspected scope expansion or fixed plan/review checkpoints.

Source: opening user outcome and the interview choice “Before adopting substantive proposals”.
:::

:::mara requirement REQ-ADVISOR-EXCLUSIONS
:mid: 01M4E8HRZFBNVHZK3KKVZCJW5G
:title: Exclude mechanical work and unchanged decisions
:status: accepted
:kind: functional
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

The agent shall not invoke this decision for purely mechanical work or routine steps already covered by a checked proposal, and shall not repeat it for an unchanged proposal against unchanged evidence. Material changes to a proposal or its relevant agreement/evidence may create a new decision point. These exclusions do not exempt a newly arising substantive proposal.

Source: the selected trigger option and “Repeated ordinary-task traces” acceptance choice in the interview.
:::

:::mara requirement REQ-ADVISOR-NO-SUPERVISOR
:mid: 01M4E8HRZTHFJYJF601JWA6K5E
:title: Do not use a per-turn classifier invocation supervisor
:status: accepted
:kind: constraint
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

The extension shall not run a classifier after every turn to decide whether another classifier call is needed. Supplying static or generated invocation guidance is not itself a classifier invocation.

Source: explicit exclusion in the user's opening request. This constraint does not select an alternative architecture.
:::

:::mara requirement REQ-ADVISOR-OUTCOMES
:mid: 01M4E8HS03BJ9ZFZ79MVCJQ9RF
:title: Classify proposals into three scope outcomes
:status: accepted
:kind: functional
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

The selected decision shall distinguish these semantic outcomes against the agreement for the current delivery:

- **Within agreement:** directly serves an agreed commitment or is necessary implementation work as defined by [[TERM-ADVISOR-OBLIGATION]].
- **New obligation:** adds a behavior, support commitment, compatibility promise, guarantee, or acceptance condition not established by the actual request or applicable accepted contract.
- **Unresolved:** missing or conflicting evidence prevents a supported decision.

Unresolved is a substantive answer, distinct from unavailable or unusable classification. These meanings do not prescribe wire labels, an API schema, or a numeric confidence threshold.

Source: the user's selection of “Three outcomes” in the interview.
:::

:::mara requirement REQ-ADVISOR-EVIDENCE
:mid: 01M4E8HS0CSP91EW6AGFPNTWXZ
:title: Submit a source-backed proposal and agreement packet
:status: accepted
:kind: functional
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

The agent shall supply the classifier with:

1. The concrete proposal and what it would change.
2. Relevant actual user decisions and accepted contract excerpts, with references.
3. Relevant supported operating conditions and explicit exclusions.
4. For claimed necessary implementation work, the current obligation that would fail without it, the triggering conditions, and why the proposed measure is proportionate.
5. Known gaps and conflicts rather than an agent-preselected verdict.

The packet shall distinguish authoritative statements, observed implementation facts, and agent inferences. Generated plans, tests, or recommendations shall not be treated as independent scope authority; apply [[TERM-ADVISOR-OBLIGATION]].

Source: the user's selection of “Agent-supplied, source-backed packet” and its enumerated contents in the interview.
:::

:::mara requirement REQ-ADVISOR-DATA-BOUNDARY
:mid: 01M4E8HS0NPG9208F2SX5FGPGK
:title: Limit classifier input to the agent-supplied packet
:status: accepted
:kind: constraint
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

The classifier shall receive the relevant agent-supplied evidence packet through the selected provider using Pi credentials. The extension shall not automatically submit the full session or give the classifier tools to gather evidence independently.

Provider processing and classifier-call charges are within this selected boundary; this does not establish a local-only processing guarantee.

Source: the user's evidence-boundary choice in the interview, instead of automatic session context or a browsing classifier agent.
:::

:::mara requirement REQ-ADVISOR-RESULT-AUTHORITY
:mid: 01M4E8HS0YK1ET8A5R6EQ3MM0B
:title: Follow usable classifications with accountable overrides
:status: accepted
:kind: functional
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

The agent shall follow a usable classification by default. An override shall identify a concrete conflict or missing evidence and explain the departure; silently ignoring the result does not satisfy this requirement. The agent shall not attribute its own explanation to a classifier that did not supply it.

A classification does not create user consent, waive required clarification or approval, or replace deterministic verification. A within-agreement result is not proof of necessity, correctness, or completion.

Source: the user's “Default, with justified override” choice; applicable agent authorization policy. The explanation boundary reflects the observed typed classifier interface, not a requirement for generated classifier rationales.
:::

:::mara requirement REQ-ADVISOR-SCOPE-DISPOSITION
:mid: 01M4E8HS18JZHBPMKJF20BDVQF
:title: Do not silently adopt new or materially unresolved obligations
:status: accepted
:kind: functional
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

When the result is new obligation, the agent shall leave the addition proposed or omit it rather than silently adopt it. Ask the user when the addition is needed for the requested outcome or the boundary is materially unclear; asking about every optional addition is not required.

For unresolved material scope, obtain the missing evidence or user decision before adopting the affected proposal. Continue unaffected work. Any justified departure from the classification remains subject to existing authority; it cannot manufacture approval.

Source: the user's “Do not adopt; ask only if needed” result-consequence choice in the interview.
:::

:::mara requirement REQ-ADVISOR-FAILURE
:mid: 01M4E8HS1JP1NFVX6GWWPPHTXB
:title: Disclose unusable delegation and reason conservatively
:status: accepted
:kind: functional
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

If classification is unavailable or unusable, the agent shall disclose the failed delegation, use the same obligation rules to reason conservatively, and not claim the classifier check succeeded. It shall not adopt a materially uncertain addition. Ask when necessary and continue unaffected work without waiving the scope boundary.

Source: the user's “Disclose and reason conservatively” choice rather than pausing every affected proposal until classification works. This does not promise automatic recovery or a substitute provider.
:::

:::mara requirement REQ-ADVISOR-CONTEXT
:mid: 01M4E8HS1XRCBRZ53VS3XP1Y4P
:title: Support the selected interactive Pi setup
:status: accepted
:kind: constraint
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

The first slice shall support the user's interactive Pi coding sessions in repository work with main agent `openai/gpt-6.1-sol`, reasoning level `high`, native classifier `openrouter/typesafe/jev-1.13`, and codemode enabled.

Other main agents, unattended operation, cross-model guarantees, compatibility or migration for the old judgments API/scenario format, and additional decision types are outside this delivery's guarantee, not required rejection cases. The scaffold's peer dependency does not establish broad Pi-version compatibility.

Source: the user's interactive-session choice and final setup answer “1 but openai/gpt-6.1-sol”, retaining the offered high reasoning, versioned Jev, and enabled codemode settings.
:::
