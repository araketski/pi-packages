# Advisor decisions and rationale

These are choices explicitly selected in the interview, not inferred architecture
commitments. Requirements own the resulting obligations.

:::mara decision ADR-ADVISOR-BROAD-TRIGGER
:mid: 01M4E8MKDACSZARXTC4NWQ9VEV
:title: Check substantive proposals rather than only suspected expansion
:status: accepted
:justifies: REQ-ADVISOR-PRE-ADOPTION
:justifies: REQ-ADVISOR-EXCLUSIONS

**Decision:** Delegate before adopting substantive proposals, with the agreed mechanical/routine and unchanged-evidence exclusions.

**Alternatives discussed:** Check only suspected scope expansion, or check at fixed plan/review checkpoints.

**Rationale and consequence:** A suspicion-only trigger relies on the agent already recognizing the problem it is meant to detect. Fixed checkpoints can miss proposals arising between them. The selected trigger reduces those dependencies at the cost of more calls; it does not authorize classifying every edit or turn.

**Source and status:** The user explicitly chose “Before adopting substantive proposals” in the interview. The rationale above is the tradeoff presented with that choice. Reopen only if observed behavior requires a change to this agreed boundary.
:::

:::mara decision ADR-ADVISOR-DEFAULT-NOT-GATE
:mid: 01M4E8MKDPAJSMEJVFBDTQ02B9
:title: Make classification consequential without giving it scope authority
:status: accepted
:justifies: REQ-ADVISOR-RESULT-AUTHORITY
:justifies: REQ-ADVISOR-SCOPE-DISPOSITION
:justifies: REQ-ADVISOR-FAILURE

**Decision:** Treat a usable result as the default, permit concrete explained overrides, leave new obligations proposed or omitted, and ask only when a material decision is needed. If classification fails, disclose that and reason conservatively.

**Alternatives discussed:** Advice that the agent is free to ignore; a binding result with escalation; always asking about each addition; allowing the agent to adopt additions with rationale; pausing every affected proposal until classification works.

**Rationale and consequence:** The selected authority makes delegation consequential without making the classifier an absolute gate. Conservative fallback avoids requiring classifier availability for all progress while preserving the scope boundary. An override or failed call is not a way to invent user approval.

**Source and status:** The user selected “Default, with justified override”, “Do not adopt; ask only if needed”, and “Disclose and reason conservatively”. These are accepted choices, not a claim that classifier results are correct.
:::

:::mara decision ADR-ADVISOR-BOUNDED-EVIDENCE
:mid: 01M4E8MKE0KN0RVD6VM4NR1PQJ
:title: Use a source-backed packet rather than automatic context or a browsing agent
:status: accepted
:justifies: REQ-ADVISOR-EVIDENCE
:justifies: REQ-ADVISOR-DATA-BOUNDARY

**Decision:** The coding agent supplies the relevant proposal and agreement excerpts to a bounded classifier call through Pi credentials.

**Alternatives discussed:** Automatic session context and an independent classifier agent that gathers evidence with tools.

**Rationale and consequence:** The selected packet makes proposal-specific authority and gaps explicit without automatically exposing the whole conversation or adding a browsing-agent workflow. Evidence collection remains the coding agent's responsibility; this does not establish independent completeness of its packet. Selected excerpts are processed by the classifier provider and calls may incur charges.

**Source and status:** The user selected “Agent-supplied, source-backed packet”. These tradeoffs were presented in the interview; no additional provider, storage, or privacy guarantees were selected.
:::
