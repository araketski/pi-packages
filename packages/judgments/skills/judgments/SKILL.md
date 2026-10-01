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
  input evidence and any required dynamic criteria. The scenario owns its fixed questions.
- An unfamiliar judgment: call `judgments_list_scenarios`. Read purpose,
  `useWhen`, `avoidWhen`, `inputSchema`, `dynamicQuestions`, interpretation and source before selecting.
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

For saved scenarios, follow `inputSchema` descriptions/examples. For each
`dynamicQuestions` entry, follow `criteriaGuidance` to retrieve actual options and
mechanically package their guidance in the native `criteriaSchema` shape. Supply
`criteria` keyed by question ID; do not preselect the winning answer or override
fixed questions. Structural validation does not establish semantic adequacy.

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

## Save recurring rubrics intentionally

For a genuinely recurring bounded judgment, use existing write/edit tools to
intentionally author one JSON definition in `<cwd>/.pi/judgments/scenarios/`
within delegated scope. The filename stem supplies the ID; there is no `id`
field. Bundled examples live in `../../scenarios/` relative to this skill.
Metadata is camelCase; external source keys remain unchanged. A minimal fixed
definition looks like this:

```json
{
  "formatVersion": 1,
  "mode": "fixed",
  "purpose": "Assess whether supplied evidence supports a narrow claim",
  "useWhen": ["A recurring bounded support judgment"],
  "avoidWhen": ["Deterministic checks or establishing approval"],
  "inputSchema": {
    "type": "object",
    "properties": {
      "evidence": { "type": "string", "description": "Relevant observations" }
    },
    "required": ["evidence"],
    "additionalProperties": false
  },
  "questions": {
    "supported": {
      "type": "bool",
      "instructions": "Assess support from the supplied evidence only",
      "criteria": { "true": "Supported", "false": "Not supported" }
    }
  },
  "interpretation": "Advisory support judgment, not verification or approval"
}
```

Use `mode: fixed` when every question saves native criteria. Use `mode: dynamic`
when at least one question omits criteria; every such question needs nonblank
`criteriaGuidance`. Fixed questions may coexist. Use self-contained supported
JSON Schema for evidence; unsupported features fail validation. Definitions
contain no executable code, bindings, templates, expressions or result mapper.
Version 1 supports boolean schemas; `type`, `properties`, `patternProperties`,
`additionalProperties`, `required`, property-count limits, `items`, array
length/uniqueness, string length/pattern, numeric bounds/`multipleOf`, `enum`,
`const`, `allOf`, `anyOf`, `oneOf`, `not`, and `title`/`description`/`examples`/
`default` annotations. References (even local), dialect declarations, formats
and other keywords are unsupported; no remote schema resolution occurs.
Evaluation evidence must be a JSON object.

Run `judgments_validate_scenario({scenario: "filename-stem"})` after saving.
It validates the authorized definition selected by project > global > bundled
precedence without classification, repair or writes. Inspect discovery diagnostics
for invalid files, duplicates and host trust exclusions. Reads refresh on calls.
Do not save every one-off judgment, automatically promote project data globally,
or treat a valid definition as proof of classifier quality or user acceptance.

## Interpret honestly

Results include `status`, `advisory: true`, classifier identity, raw typed
`answers` when successful, and scenario `interpretation` and source. Native usage/cost
is included only when reported; absent cost is not zero.

`assessed` means a valid classifier response, not established truth. Read choice
probabilities, boolean probability and reported confidence against the evidence;
near ties and weak support are reasons to inspect context, not certainty.
There is no universal confidence cutoff or automatic action.

Interpret no-fit and insufficient-information answers using the scenario's
rubric and interpretation; `assessed` can include either. There is no computed
scenario outcome or automatic label mapper. `inconclusive`, `unavailable`,
`failed` and `aborted` are not favorable judgments.
No provider/model fallback is silently selected. Use ordinary domain-guided
reasoning when assistance is unavailable or inconclusive, or obtain missing
evidence; do not blindly retry unchanged input.

A judgment cannot establish user acceptance, authorize destructive operations,
override explicit instructions or accepted requirements, waive mandatory
clarification/approval, or prove verification. You remain responsible for the
decision and applicable validation. Better quality, fewer tokens and reliable
invocation are hypotheses, not guarantees.
