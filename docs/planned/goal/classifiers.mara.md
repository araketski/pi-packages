# Goal classifier policy and limited evaluation

These are agreed provisional settings and recorded synthetic evaluation, not an
implemented goal extension, calibrated production accuracy, or campaign dispatch.
Provider selection remains explicit and user-owned. The concrete settings file,
public turn-ownership/cancellation/usage hooks, and complete bounded-context
assembly remain design work before runtime implementation.

:::mara evidence EVD-GOAL-CLASSIFIER-PILOT
:mid: 01M3RWR74R6AYRGVNJW7YWNCZX
:title: Observe native classifier pilot and held-out synthetic results
:status: accepted
:result: inconclusive
:captured_at: 2026-09-30
:subject_revision: 4d13b89e6c49a21fca10f0ce32faf8f428cf17e4; synthetic fixture SHA-256 b11fc58677e52d779a2b5af3ff68f80d903d0614ea9f3adba235813564e25600
:evidences: VER-GOAL-CLASSIFIERS

On 2026-09-30, with repository HEAD `4d13b89e6c49a21fca10f0ce32faf8f428cf17e4` unchanged, used Pi 0.99.1's native `models.getAvailableOfType("classifier")` and `models.classify()` from codemode. Availability inspection was followed by actual classifier requests; no provider was enabled and no new AI client was introduced. These were synthetic evaluations, not goal extension execution, repository-content review, or a native goal lifecycle test.

The user authorized 40 calls across OpenRouter `typesafe/jev-1.13` and `jaredpalmer/kev-4b`, then 60 additional Jev calls, under one USD 1 estimated-spend ceiling and a stop-on-unaccountable-pricing/usage condition. Exactly 100 calls completed (80 Jev, 20 Kev), one at a time, without missing usage, call errors, or extra retries. All authorized calls are consumed; this is not authorization for further evaluations.

Twenty prelabelled pilot cases per model covered progress, repetition, legitimate waiting, blockers, uncertainty, acceptance-criteria quality, evidence, and embedded misleading instructions. Jev matched 19/20 exact labels and all 20 intended action outcomes; its one disagreement was insufficient versus uncertain, both refusing review. Kev matched 16/20 labels and 18/20 action outcomes, including two incorrect criteria approvals. This supports selecting Jev as an evaluation reference, not treating its answers as facts.

The additional Jev run used 60 new prelabelled cases: 30 calibration and 30 held out, ten per task in each split. Each task had five positive-action and five negative-action cases per split. For supervision, positive action means a pause candidate, not a completed temporal pause; for reviews it means sufficient assessment, not completed goal execution. Predeclared candidate cutoffs were 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99, 1.00, with winning margins 0, 0.10, 0.20, 0.30. Select zero calibration false-positive actions, maximize true positives, then prefer higher probability/margin thresholds. Freeze selected rules before any held-out request; no rule was changed after observing validation.

Calibration selected supervision 0.80 and criteria/evidence 0.60, all with a 0.30 winning margin, and matched all 30 action labels. Held-out actions matched 28/30: supervision 10/10, criteria 9/10, evidence 9/10; no incorrect approvals or pause candidates against the supplied labels. C108, labelled sufficient, was judged insufficient. Its Unicode-readability/zero-width criteria may themselves be ambiguous and need independent label review; the original label is retained. E102 was classified sufficient at 0.61, but its 0.27 winning margin failed the frozen 0.30 threshold. E118 differed between uncertain and insufficient without changing refusal. Do not hide these conservative blocks by retuning on the held-out data.

Observed additional-run end-to-end call latency: median 270 ms, nearest-rank p95 378 ms, maximum 552 ms. Across all 80 Jev calls, estimated cost was USD 0.001912848 (mean USD 0.0000239106); all 100 calls reported 50,279 input and 5,671 output tokens, with estimated total USD 0.002111718. Reported cost matched the then-listed USD 0.042/million input tokens and zero output price. This is native reported/catalog-estimated usage, not an independently reconciled provider invoice. At that observed Jev mean, USD 0.05 covers about 2,091 calls; at 8,000 reported input tokens/call it covers about 148. The user chose a rolling hourly classifier cap rather than a lifetime-per-goal cap.

[Normalized synthetic inputs, fixed labels, templates, and full native responses](classifier-evaluation-data.mara.md) are retained in Git. Original local artifacts remain under `/home/araketski/.cache/pi-goal-classifier-pilot-1790759887711/` and `/home/araketski/.cache/pi-goal-classifier-validation-1790760514188/`. Original SHA-256 identities:

| Artifact                       | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| Pilot fixtures                 | `ba5046636084ce69dbe733c47aab6b55c5d8ec7fb31d0b1aafa8a8aa7073910c` |
| Pilot results                  | `5a3ec99fbf2d0bf7322adc424ffc8a73641abac85c5a8a7cb18d8fa31c090bc7` |
| Additional fixtures            | `b11fc58677e52d779a2b5af3ff68f80d903d0614ea9f3adba235813564e25600` |
| Rules frozen before validation | `fed75e3c30a03747e0b409847ff3258e7d9a34522d915122f6a52fb3bc72ba50` |
| Additional results             | `c2c2c5a8075cd9b2d5fa9069c6a62e1637800a0770cd1dbc79ede96dc6a5ee75` |

Outcome is **inconclusive for full [[VER-GOAL-CLASSIFIERS]] conformance**. These small, author-labelled synthetic sets do not calibrate production accuracy, validate other models/templates, establish temporal consistency or timeout-tail behavior, prove complete batching/usage integration, or test actual goals and Linux inhibition. The provisional settings were subsequently approved by the user; no runtime configuration, workflow implementation, or campaign dispatch followed from these calls.
:::

:::mara design DES-GOAL-CLASSIFIER-POLICY
:mid: 01M3RWRA7XPRN2AP2S6SQK3Z2S
:title: Bound classifier-first assessments with explicit model profiles and user limits
:status: accepted
:kind: behavior
:satisfies: REQ-GOAL-CLASSIFIERS
:satisfies: REQ-GOAL-EVIDENCE
:satisfies: REQ-GOAL-NO-PROGRESS

Use one explicitly selected user-level classifier by default, with optional user-selected overrides for supervision and ledger review. Support both local and explicitly selected cloud models through Pi's native registry; never enable a provider, switch providers, or add a classifier client automatically. Provider/model choices and spending/data-sharing ceilings are user-controlled. Projects may tighten those ceilings, not broaden them. Other classifiers require explicit model-specific thresholds rather than silently inheriting the reference model's cutoffs.

The reference evaluation model is `openrouter/typesafe/jev-1.13`, not the moving latest alias. Its provisional profile uses the returned winning-label probability, not the separate normalized confidence field: supervision requires at least 0.80 for a stuck/blocked label; criteria/evidence review requires at least 0.60 for a sufficient label. Each qualifying label must lead the runner-up by at least 0.30. A weak positive review is uncertain and cannot permit completion. These cutoffs are specific to the evaluated model/questions; changes need evaluation and must not be advertised as equivalent calibrated accuracy. The question templates and observations are retained in [the synthetic records](classifier-evaluation-data.mara.md). Runtime prompt/context adaptation still needs validation.

Run semantic supervision after completed goal-directed turns, not every nested tool invocation. Cover initial goal work, automatic continuations, restart-directed work, resume, and manual continue, while excluding unrelated conversation or other producers' unrelated turns. Known generic-gate waiting is checked directly, not inferred by a classifier. Auto-pause after three consecutive qualifying **new** stuck/blocked observations; cached answers or repeated evaluation of one observation do not advance the streak. Progress and explicit resume reset it; nonqualifying observations cannot form a consecutive qualifying sequence. Pausing does not stop jobs, change gates, or suppress independent delivery. This temporal policy is user-selected and still needs runtime testing; static classification cases do not verify it.

Review acceptance criteria when first created or materially changed before substantive implementation. Review evidence at completion attempts or explicit review requests. Cache ledger reviews against unchanged relevant inputs and classifier configuration, including goal/evidence revision and supplied evidence context; changes invalidate stale results. An explicit user-requested re-review may obtain a new assessment, but automatic repeated attempts until one passes are not allowed. When input exceeds a bounded request, use bounded batches and require complete relevant coverage: missing or silently truncated evidence cannot produce approval. A batch's valid refusal must not be discarded because another batch fails. Exact assembly/batch limits remain to be designed and tested.

Use a configurable five-second whole-call timeout, including authentication/request setup, and no extension-added retry loop. Explicitly pass `maxRetries: 0` on every goal classifier call, including supervision, criteria review, and each evidence-review batch; do not rely on the host's agent retry setting or the transport default. This is a per-call option, not permission to rewrite global Pi/provider settings. Distinct bounded batches and explicit re-review remain governed by the existing cadence, caching and budget rules, not an automatic retry-until-success loop. Verify supported transports honor the zero-retry option. Deadline expiry is not proof that an uncooperative provider stopped or that a failed request was free; late-result, activity and incomplete-usage handling still need runtime design. The default classifier-only spending ceiling is an estimated USD 0.05 per rolling hour **per goal**, with an optional user-set total cap. It is not a USD 0.05 lifetime cap and is separate from optional whole-goal token/wall-time budgets; attributable usage still counts there once. It permits at most an estimated USD 1.20 over a continuously active 24 hours, not an expected spend. Respect tighter project limits. Exhaustion produces visible fallback rather than silently increasing a limit, ending the goal, or erasing an existing applicable review refusal. Bound requests before dispatch using the selected pricing/context policy, account reported usage without duplication, and never present missing usage or pricing as measured zero cost. Reservation and incomplete-usage handling require explicit design before implementation.

Inputs may include bounded relevant goal context and inspected code, diff, or test-output excerpts under the selected sharing policy, not an entire transcript or automatic retrieval of every referenced artifact. Inputs remain transient; persist bounded diagnostics and references, not raw evidence. Check availability before requests and reject stale results after goal/evidence/session changes. Valid refusals for unchanged goal/evidence survive later outages; no force-complete bypass is provided. Users can revise evidence, explicitly re-review, pause, or clear the goal. A refusal should cause the agent to repair implementation/evidence or clarify criteria without weakening acceptance criteria, subject to blockers, supervision and budgets. See [[REQ-GOAL-EVIDENCE]].

[[EVD-GOAL-CLASSIFIER-PILOT]] records the limited synthetic basis for the provisional profile, not full [[VER-GOAL-CLASSIFIERS]] conformance.
:::
