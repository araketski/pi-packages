# Advisor: agreed first slice

## Source and status

The selected first decision is **“Does this proposal introduce a new obligation?”**
The items below decompose the interview agreement; they do not expand it.

Source: the user's request and explicit selections in Pi session
`01a11296-66fe-7721-a13d-a3ffe6197903`. The original narrative record is retained
in Git at commit `24918aa`; this document and its linked items are now the canonical
structured record. Each item identifies its originating choice or constraint,
so product meaning does not depend on access to the conversation.

The user requested this decomposition after the interview. No extension
implementation, separate intent assessment, classifier inference, or behavioral
acceptance execution has occurred as part of this work. Implementation,
publication, deployment, and merge are not authorized by this documentation.

## Knowledge map

| Knowledge | Canonical home |
| --- | --- |
| Desired outcome | [[GOAL-ADVISOR-TIMELY-DELEGATION]] below |
| Vocabulary and independently checkable obligations | [Contract](./contract.mara.md) |
| Ordinary-task and failure flows | [Scenarios](./scenarios.mara.md) |
| Selected tradeoffs and rationale | [Decisions](./decisions.mara.md) |
| Unselected compact-index hypothesis and technical observations | [Draft design](./design.mara.md) |
| Repeatable checks and retained execution records | [Verification](./verification.mara.md) |

Accepted items record agreed intent, not implementation or passing tests.
[[DES-ADVISOR-INITIAL-INDEX]] remains draft. No implementation-artifact or
behavioral-evidence items are created because neither exists for this slice.

## Delivery boundary and completion

The first support boundary is [[REQ-ADVISOR-CONTEXT]]. The current delivery selects
only the new-obligation decision; it does not inherit the reference extension's
scope, APIs, storage formats, or compatibility promises.

Completion requires the accepted requirements, [[VER-ADVISOR-ORDINARY-TASKS]],
[[VER-ADVISOR-FAILURE]], and [[VER-ADVISOR-BOUNDARIES]], plus applicable repository
verification and review gates. Check definitions and graph coverage are not
passing execution evidence.

No material product choice remains open from the interview. Technical work
remains: select and assess a solution consistent with the agreement, settle the
encoding and exposure questions in the draft design, and prepare exact fixtures
for the accepted scenarios before execution. Reopen product choices only if
technical evidence would require changing an agreed boundary.

## Goal

:::mara goal GOAL-ADVISOR-TIMELY-DELEGATION
:mid: 01M49BE0GNJSWD7BSZ077K7WVM
:title: Delegate selected decisions during ordinary work without reminders
:status: accepted

For explicitly selected decision types, the Pi agent delegates at the appropriate decision point during ordinary work without the user mentioning a judgment tool. Merely exposing callable classifiers is not sufficient.

The first selected decision is whether a proposal introduces a [[TERM-ADVISOR-OBLIGATION]]. The linked requirements define its boundaries, and [[VER-ADVISOR-ORDINARY-TASKS]] defines the ordinary-work acceptance method. Accepted intent does not claim implementation or successful execution.

Source: the user's opening request and first-decision answer in Pi session `01a11296-66fe-7721-a13d-a3ffe6197903`. The reported problem was that the previous implementation exposed classifier tools but the agent did not use them during ordinary work. The user chose the new-obligation decision instead of the offered Mara-representation, review-disposition, and ask-versus-proceed candidates.
:::
