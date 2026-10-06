# Goal classifier policy and limited evaluation

These are agreed provisional settings and recorded synthetic evaluation, not an
implemented goal extension or calibrated production accuracy.
Use Pi's available classifiers and existing provider configuration, with an
extension-configured opt-out, necessary assessment context, and no new approval or
cost-management layer. Concrete settings, supported lifecycle/cancellation hooks,
and complete context assembly remain implementation work; unavailable host features
are omitted rather than turned into mandatory API prerequisites.

:::mara evidence EVD-GOAL-CLASSIFIER-PILOT
:mid: 01M3RWR74R6AYRGVNJW7YWNCZX
:title: Observe native classifier pilot and held-out synthetic results
:status: accepted
:result: inconclusive
:captured_at: 2026-09-30
:subject_revision: 4d13b89e6c49a21fca10f0ce32faf8f428cf17e4; synthetic fixture SHA-256 b11fc58677e52d779a2b5af3ff68f80d903d0614ea9f3adba235813564e25600
:evidences: VER-GOAL-CLASSIFIERS

On 2026-09-30, with repository HEAD `4d13b89e6c49a21fca10f0ce32faf8f428cf17e4` unchanged, used Pi 0.99.1's native `models.getAvailableOfType("classifier")` and `models.classify()` from codemode. Availability inspection was followed by actual classifier requests; no provider was enabled and no new AI client was introduced. These were synthetic evaluations, not goal extension execution, repository-content review, or a native goal lifecycle test.

The user authorized 40 calls across OpenRouter `typesafe/jev-1.13` and `jaredpalmer/kev-4b`, then 60 additional Jev calls, under one USD 1 estimated-spend ceiling and a stop-on-unaccountable-pricing/usage condition. Exactly 100 calls completed (80 Jev, 20 Kev), one at a time, without missing usage, call errors, or extra retries.

Twenty prelabelled pilot cases per model covered progress, repetition, legitimate waiting, blockers, uncertainty, acceptance-criteria quality, evidence, and embedded misleading instructions. Jev matched 19/20 exact labels and all 20 intended action outcomes; its one disagreement was insufficient versus uncertain, both refusing review. Kev matched 16/20 labels and 18/20 action outcomes, including two incorrect criteria approvals. This supports selecting Jev as an evaluation reference, not treating its answers as facts.

The additional Jev run used 60 new prelabelled cases: 30 calibration and 30 held out, ten per task in each split. Each task had five positive-action and five negative-action cases per split. For supervision, positive action means a pause candidate, not a completed temporal pause; for reviews it means sufficient assessment, not completed goal execution. Predeclared candidate cutoffs were 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99, 1.00, with winning margins 0, 0.10, 0.20, 0.30. Select zero calibration false-positive actions, maximize true positives, then prefer higher probability/margin thresholds. Freeze selected rules before any held-out request; no rule was changed after observing validation.

Calibration selected supervision 0.80 and criteria/evidence 0.60, all with a 0.30 winning margin, and matched all 30 action labels. Held-out actions matched 28/30: supervision 10/10, criteria 9/10, evidence 9/10; no incorrect approvals or pause candidates against the supplied labels. C108, labelled sufficient, was judged insufficient. Its Unicode-readability/zero-width criteria may themselves be ambiguous and need independent label review; the original label is retained. E102 was classified sufficient at 0.61, but its 0.27 winning margin failed the frozen 0.30 threshold. E118 differed between uncertain and insufficient without changing refusal. Do not hide these conservative blocks by retuning on the held-out data.

Observed additional-run end-to-end call latency: median 270 ms, nearest-rank p95 378 ms, maximum 552 ms. Across all 80 Jev calls, estimated cost was USD 0.001912848 (mean USD 0.0000239106); all 100 calls reported 50,279 input and 5,671 output tokens, with estimated total USD 0.002111718. Reported cost matched the then-listed USD 0.042/million input tokens and zero output price. This is native reported/catalog-estimated usage, not an independently reconciled provider invoice. At that observed Jev mean, USD 0.05 covers about 2,091 calls; at 8,000 reported input tokens/call it covers about 148. At that time the user chose a rolling hourly classifier cap rather than a lifetime-per-goal cap. The later simplification in [[DES-GOAL-CLASSIFIER-POLICY]] removes classifier cost management; the historical measurements and evaluation authorization remain unchanged.

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

Use native available classifiers with optional preferred/per-feature models and an extension opt-out. Follow [[REQ-GOAL-CLASSIFIERS]] for visible fallback and preservation of applicable refusals; do not create providers, change host settings, add a client/approval layer or introduce cost management.

The provisional reference profile is openrouter/typesafe/jev-1.13, not a moving latest alias. Use winning-label probability, not normalized confidence: stuck/blocked supervision requires at least 0.80; sufficient criteria/evidence review requires at least 0.60; each must lead the runner-up by at least 0.30. Weak positive reviews are uncertain. These settings belong to the evaluated model/questions in [the synthetic records](classifier-evaluation-data.mara.md), not calibrated accuracy for arbitrary models. An unprofiled chosen model uses fallback. Check representative actual runtime inputs for applicability; other-model calibration campaigns are deferred and no production-accuracy claim is made.

Supervise completed assistant turns in the current active goal interval under [[REQ-GOAL-NO-PROGRESS]], including ordinary guidance, initial/resumed/manual/automatic work. Do not sample every nested tool call or another session. Check legitimate generic-gate waiting directly. Pause after three consecutive qualifying new stuck/blocked observations, resetting on progress or explicit resume; cached/repeated observations do not advance the streak. Preserve independent jobs/delivery and reject stale goal/session callbacks.

Review criteria on creation/material change and evidence on completion/explicit review. Use bounded latest assessments tied to relevant revisions/inputs and classifier configuration. Reuse unchanged answers rather than automatic retries until approval. Configuration changes do not erase an otherwise applicable refusal solely through disablement or model/profile unavailability. Explicit re-review or changed relevant evidence can resolve it; no force-complete bypass exists.

Use one bounded assessment with relevant supplied goal/ledger and inspected artifact excerpts under [[ADR-WORKFLOW-MINIMAL-PROFILE]]. Report missing/oversized required context instead of approving truncation, crawling artifacts or building a multi-batch planner. Inputs are transient; retain concise diagnostics/references. Recheck relevant revisions before applying an answer.

Default the configurable whole-call timeout to five seconds and pass native maxRetries:0 per call, with no extension retry loop or global provider-setting change. Ignore late answers after expiry/cancellation or revision change; timeout does not prove physical provider cancellation or zero usage. Use ordinary native usage where supported and disclose missing attribution. No caps, price admission, spending reservations or usage-reconciliation service; optional whole-goal token/wall-time limits remain separate. Verify ordinary native request/timeout behavior, not every provider's authentication/retry/cancellation interleaving.

[[EVD-GOAL-CLASSIFIER-PILOT]] remains limited synthetic evidence, not passing native runtime integration or production-quality calibration.
:::
