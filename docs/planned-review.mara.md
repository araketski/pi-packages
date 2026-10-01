# Planned-contract usability review

This documentation-only review covered all 16 files under `docs/planned/` at its
start, plus the linked gates/workflow contracts, classifier records and native
non-UI probe findings. Another contributor subsequently scaffolded session-activity
and moved its reviewed contract to `packages/session-activity/docs/`.
The review did not implement the workflow packages, run their future tests,
enable providers, or restart the implementation campaign.

## Review scope and conclusions

| Reviewed knowledge | Conclusion |
| --- | --- |
| [Goal contract](planned/goal/contract.mara.md), [classifier policy](planned/goal/classifiers.mara.md), [synthetic records](planned/goal/classifier-evaluation-data.mara.md), [jobs integration](planned/goal/jobs-integration.mara.md) | Clarify transport-failure and unprofiled-model fallback. Keep the strict applicable review veto by explicit user choice. Align startup with native Pi input/lifecycle behavior. |
| [Jobs-core boundary](planned/jobs-core/contract.mara.md), [lifecycle](planned/jobs-core/lifecycle.mara.md), [delivery](planned/jobs-core/delivery.mara.md), [storage](planned/jobs-core/storage.mara.md) | No blanket prohibition on local execution or backgrounding was found. Preserve one execution, original-session routing, bounded output and honest outcomes. Strengthen fork/gate-replay acceptance coverage. |
| [Jobs execution](planned/jobs/execution.mara.md), [controls](planned/jobs/controls.mara.md) | Five-second background handoff is not a hard timeout. Awaiting is separate from execution lifetime. Non-UI waiting still requires real native integration proof. |
| [Herdr scope](planned/herdr/scope.mara.md), [transport/execution](planned/herdr/contract.mara.md) | Explicit local resource and execution controls remain useful without an agent-messaging system. Ambiguous RPC replies must not be blindly retried, but supported positive execution still needs tests. |
| [Caffeinate contract](planned/caffeinate/contract.mara.md), [jobs integration](planned/caffeinate/jobs-integration.mara.md) | Same effective generic gates as goal, with explicit manual overrides. A pending next-turn result can intentionally keep inhibition active; actual display/sleep support needs Linux backend verification. |
| [Gate visibility/recovery](planned/gates/contract.mara.md) and [protocol](../packages/gates-protocol/docs/contract.mara.md) | Read-only inspection alone cannot recover an absent owner's historical wait. Add separate explicit user-only abandonment, retaining unknown external outcomes. |
| [Session activity](../packages/session-activity/docs/contract.mara.md) | Meaningful multi-turn root-TUI reporting remains allowed. Headless exclusion, no phrase for a short settled run and best-effort crash cleanup are documented scope choices, not evidence of blanket disablement. |

These conclusions concern the text, not runtime conformance. A bounded judgment
request assessed the supplied policy excerpts and cases. Its advisory results
supported the fallback/profile and absent-owner recovery gaps, classified strict
review refusal as a material tradeoff, and distinguished next-turn/startup scope
and fork integration risks from logically contradictory requirements. The
classifier did not retrieve missing evidence, verify implementation or approve
policy changes. The user made the decisions below explicitly.

## Confirmed choices

- [[REQ-GOAL-CLASSIFIERS]] and [[DES-GOAL-CLASSIFIER-POLICY]] use visible
  deterministic fallback for transport errors/timeouts without an applicable
  prior refusal. Failure is not classifier approval; ledger, direct-inspection,
  revision and gate checks remain required.
- Only applicable evaluated model/question profiles drive classifier decisions.
  An available unprofiled model uses visible deterministic fallback, without
  silently borrowing Jev thresholds or requiring provider setup. This is a
  missing-profile condition, not an unavailable-provider claim.
- The user retained the strict veto in [[REQ-GOAL-EVIDENCE]]. A still-applicable
  insufficient or uncertain review survives disablement and other fallback
  conditions. There is no user/model force-complete override. Relevant evidence
  changes or explicit re-review remain the recovery routes; automatic repeated
  requests until approval remain prohibited.
- [[REQ-GATES-USER-ABANDONMENT]] permits a confirmed, audited user-only action
  ending one selected effective wait obligation. It does not establish success,
  termination or result delivery, take job ownership, change job settings, or
  suppress independent delivery. Other obligations remain intact. Discovery
  must not keep blocking solely for the abandoned absent-owner obligation.
  Exact protocol/acquisition identity and user-control design remain open;
  this new recovery capability is not implemented by the existing API.
- [[REQ-GOAL-CLI-STARTUP]] follows native Pi behavior. Where current public APIs
  can safely dispatch and await the flag objective as startup input, bare
  `--goal` is sufficient; do not impose another prompt. Preserve separate
  native input when supplied. Registration alone is not proof of dispatch, and
  unsupported combinations must clearly report no start. No wrapper, private
  runtime integration or new mandatory host API was selected.

## Positive paths and remaining integration risks

[[VER-GOAL-CLASSIFIERS]] now includes successful deterministic completion with
no classifier, explicit disablement, an unprofiled model and transport failure,
as well as preservation of applicable refusals. [[VER-GOAL-SCHEDULING-AND-RECOVERY]]
requires usable standalone goal start/continuation/completion after genuine
empty discovery, without jobs or Herdr as prerequisites.

[[VER-GATES-USER-ABANDONMENT]] and [[VER-GATES-DISCOVERY-BOUNDARY]] cover absent-owner
recovery, other-owner isolation, stale confirmations, failed journal appends,
reload, late reports and genuinely new acquisitions. [[VER-JOBS-SESSION-AND-EXIT]]
explicitly checks that copied gate history does not strand a fork with inherited
waits or transfer ownership.

Awaited next-natural-turn delivery remains an intentional external-input wait in
interactive/RPC/SDK use: goal does not nudge merely to deliver it, and caffeinate
can keep its gate-derived hold after execution finishes. Automatic delivery is
the finite-command default. One-shot print/JSON rejects awaited plus next-turn
before launching or changing settings. Preserve clear waiting diagnostics and
positive automatic-delivery coverage, rather than silently changing the chosen
mode or making deferred delivery appear automatic.

The existing native probes identify usable hooks and specific failed strategies,
not a proof that every public-API solution is impossible. Non-UI cancellation,
startup mode/input coverage, recorded final-result receipts, real Herdr execution,
Linux inhibition, bounded classifier context and model quality still require
implementation-time verification. Successful structural validation is not a
substitute for these positive paths or evidence that a strict policy works.
