# Reference patterns for lightweight judgment assistance

Supporting source inspection for [the agreed contract](contract.mara.md), not
new accepted requirements, a dependency selection, or verification of these
packages. Inspected four shallow Git checkouts at the revisions below. No
reference extension was installed, its tests executed, or a classifier called
for this inspection. Reuse ideas selectively; copying code would require license
and compatibility review. The reference transports are not needed because our
contract uses Pi's native classifier runtime.

## Small named bundles

[pi-typesafe-ai bundle.ts](https://github.com/schuettc/pi-extensions/blob/2130270e0a693da58f7bb3c68d0898918f95d738/packages/pi-typesafe-ai/src/bundle.ts)
defines `Bundle<T>` as an ID, fixed questions and a mapping from answers to a
result. `evaluateBundle()` submits those questions against supplied state and
returns both mapped value and raw answers with usage and latency.

This supports keeping the first bundled scenario small rather than introducing
a workflow engine. It is a library pattern, not an agent-callable registry that
loads declarative scenarios by name. Its own client and credential store are not
part of our design.

## Separate preparation, questions and interpretation

[pi-jev-checkpoints evaluator.ts](https://github.com/wylu1037/pi-jev-checkpoints/blob/d3c5412b393e95f90b5bcf53503365ba66d65e8b/src/shared/evaluator.ts)
defines a `CheckpointSpec` with `name`, `buildState(input)`, `questions(state)` and
`decide(answers, state)`. It returns discriminated decided/skipped results rather
than manufacturing a positive judgment when evaluation is unavailable.

[clarity-gate/spec.ts](https://github.com/wylu1037/pi-jev-checkpoints/blob/d3c5412b393e95f90b5bcf53503365ba66d65e8b/src/checkpoints/clarity-gate/spec.ts)
asks separate questions about clarity, ambiguity type and a source fragment.
The separation is useful for a bundled scenario with schema-dependent choices:
question wording can be fixed while the project's vocabulary is dynamic input.
Questions in a single classifier request are independent; one must not silently
consume another's answer as though the classifier ran a sequential workflow.
Keep interpretation advisory rather than importing this package's blocking or
steering policies.

[evidence.ts](https://github.com/wylu1037/pi-jev-checkpoints/blob/d3c5412b393e95f90b5bcf53503365ba66d65e8b/src/shared/evidence.ts)
only accepts selected source-fragment IDs that exist in the supplied candidate
set. This is a useful pattern if a later scenario identifies evidence: return a
reference to supplied material, not an invented explanation or citation. It does
not prove the selected fragment supports the conclusion.

The inspected [clarity-gate extension](https://github.com/wylu1037/pi-jev-checkpoints/blob/d3c5412b393e95f90b5bcf53503365ba66d65e8b/src/checkpoints/clarity-gate/extension.ts)
can assess at the first configured mutation in a turn rather than every tool
call. This demonstrates a narrower trigger, but automatic triggers remain out of
our initial scope. Its deduplication also treats an identical previously flagged
prompt as already clarified, while the spec can pass on inferred delegation to
the assistant. Do not adopt those as authorization semantics: repetition and
classifier-predicted delegation do not resolve explicit approval obligations.
Its concurrency comment marks the first mutation evaluated before awaiting;
that is not proof that sibling concurrent mutations await the same gate.

## Guidance belongs near the tool

[pi-typesafe extension.ts](https://github.com/DevMortimer/pi-typesafe/blob/3a498ea1ba90c041c52e7632e8f292c1d706ac52/src/extension.ts)
uses a concise description, `promptSnippet`, `promptGuidelines` and a compact
request example. It explains batching independent questions over shared state,
naming relevant fields, uncertainty and the distinction between confidence and
authorization. Its schema validates requests and reports errors without echoing
submitted values. Use these as guidance/validation ideas, not a reason to adopt
its provider SDK, separate login, consent workflow, daily ledger or limits.

[@geminixiang/pi-jev extension](https://github.com/geminixiang/pi-stuff/blob/131bef92fd1bd7b15d8f9bf4e7395219a68f6c47/packages/pi-jev/extensions/index.ts)
combines tool-attached guidance with a
[bundled skill](https://github.com/geminixiang/pi-stuff/blob/131bef92fd1bd7b15d8f9bf4e7395219a68f6c47/packages/pi-jev/skills/jev/SKILL.md).
The short surface makes usage discoverable; the skill carries fuller atomic
question and structured-state guidance. Its `label` is display text, not a saved
scenario identifier. Its own multi-backend SDK and automatic backend preference
order differ from our native runtime and no-silent-fallback contract. Do not copy
its generic confidence cutoff or claim that speculative additional questions
cost nothing; both need model/request-specific justification.

## Implication for the first increment

The inspected sources support a modest implementation: one named bundled question
set, validated agent-supplied inputs, a generic question path, clear advisory
outcomes and compact invocation guidance. They do not establish a need for another
classifier client, periodic supervision, provider fallback, persistent decisions
or user-defined scenario-file infrastructure. No exact declarative agent-facing
scenario registry was identified in these four checkouts; this is a bounded
finding, not a claim that none exists in the catalog.
