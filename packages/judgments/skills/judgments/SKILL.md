---
name: judgments
description: 'Delegate bounded judgments using predefined scenarios or typed questions over supplied evidence. Use for repeated categorization and assessment, not generation or automatic supervision.'
---

# On-demand judgments

Use a classifier for a narrow decision over evidence you already have: choosing
among well-described categories, assessing a stated condition, or scoring against
an explicit rubric. Do not delegate generation, broad planning, authoritative
approval, or deterministic checks better handled by code.

## Choose a path

- A known suitable scenario: call `judgments_evaluate_scenario` directly with its
  required inputs. The scenario owns its fixed questions.
- An unfamiliar judgment: call `judgments_list_scenarios`. Read purpose,
  `use_when`, `avoid_when`, inputs, outcomes and interpretation before selecting.
  Listing is local metadata, not a classifier request.
- No fitting scenario: use `judgments_evaluate` with structured `state` and typed
  `questions`.

Call at relevant decision points, not every turn. Do not repeatedly list known
scenarios or reassess unchanged relevant evidence. There is no background
monitoring or persistent cache; avoid repetition yourself.

## Prepare evidence and questions

Include enough grounded context to distinguish the options, but avoid irrelevant
history and secrets. These tools do not retrieve missing evidence. Supplied
context is sent to the configured classifier through Pi's native runtime and
existing credentials; classification is not necessarily local.

For generic evaluation, name evidence fields explicitly and ask atomic questions:

```json
{
  "state": { "message": "The build completed, but the deploy is still pending." },
  "questions": {
    "deployment_complete": {
      "type": "bool",
      "instructions": "Does message state that deployment is complete?",
      "criteria": {
        "true": "Deployment is explicitly complete.",
        "false": "Deployment is pending, failed, or not established."
      }
    }
  }
}
```

- `choice`: criteria is a label-to-description mapping. Include a no-fit or
  insufficient-information option when a forced category would mislead.
- `bool`: criteria describes both `true` and `false`.
- `score`: criteria is an ordered array of rubric descriptions, using the
  configured native classifier's score semantics.

Multiple independent questions may share state in one request. A question cannot
consume another question's answer within that request. Avoid vague criteria and
put uncertainty into the rubric rather than assuming evidence is complete.

## Interpret honestly

Results include `status`, `advisory: true`, classifier identity, raw typed
`answers` when successful, and optional scenario `assessment`. Native usage/cost
is included only when reported; absent cost is not zero.

`assessed` means a valid classifier response, not established truth. Read choice
probabilities, boolean probability and reported confidence against the evidence;
near ties and weak support are reasons to inspect context, not certainty.
There is no universal confidence cutoff or automatic action.

`inconclusive` means the scenario cannot recommend a fitting result from these
inputs. `unavailable`, `failed` and `aborted` are not favorable judgments.
No provider/model fallback is silently selected. Use ordinary domain-guided
reasoning when assistance is unavailable or inconclusive, or obtain missing
evidence; do not blindly retry unchanged input.

A judgment cannot establish user acceptance, authorize destructive operations,
override explicit instructions or accepted requirements, waive mandatory
clarification/approval, or prove verification. You remain responsible for the
decision and applicable validation. Better quality, fewer tokens and reliable
invocation are hypotheses, not guarantees.
