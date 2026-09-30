# Planned goal extension

These are accepted intended behaviors for the reworked goal package, not an
implemented extension or passing test evidence. The package remains staged here
until scaffolding; move its knowledge with Mara when that happens.

## Reference and agreed changes

The reference is `packages/goal/` at Git revision
`d9b1b8c72bf261be74d3229e766adb685b940aa4` in the original checkout. Inspection covered
its command/tool/runtime, clock, restart, persistence, prompt and skill sources,
plus selected lifecycle, evidence, progress, and gates tests. Those tests were read,
not executed. Source reuse must preserve applicable license/provenance notices.

Retain its persistent branch-local objective, optional token/wall-time budgets,
mandatory evidence ledger, restart policies, statusline support, and goal-writer
skill. Prefer native classifiers for semantic supervision and ledger review, with
the prior deterministic behavior as an availability/failure fallback. Add explicit
blocked pauses, distinguish user abort from delivery failure, keep read-only
inspection available in every state, and enforce generic gate eligibility for
normal start/resume and completion.
Do not restore the old gate protocol's domains, wake handoffs, or auto-resume claims.

Gated means active but waiting, not lifecycle-paused: the active wall clock still
runs. Goal observes current-session gates without inspecting their producers.
The [jobs integration](./jobs-integration.mara.md) is a consumer verification case,
not an additional runtime dependency on jobs-core or Herdr.

The user selected a clean break from legacy saved data. Use fresh persistence
identifiers, leave legacy session records untouched and unused, and do not build
a migration or legacy-state compatibility layer. Concrete new entry shapes and
new tool argument schemas remain implementation designs within this contract.

The user approved default-on supervision when a classifier is configured and
available, automatic pauses for consistent stuck/blocked findings, and completion
refusal on insufficient or uncertain ledger reviews. [[DES-GOAL-CLASSIFIER-POLICY]]
records the subsequently agreed model-specific provisional thresholds, observation
scope, bounded review policy, timeout, and rolling classifier budget.
[[EVD-GOAL-CLASSIFIER-PILOT]] records actual synthetic calls, not an implemented goal
runtime or calibrated production accuracy. Public hook/context/usage integration
still needs design and verification. No provider is enabled by this specification,
and neither these decisions nor the pilot authorize campaign dispatch.

## Agreed knowledge

:::mara goal GOAL-PERSISTENT-AUTONOMY
:mid: 01M3Q5PHV8M479QQTS9BFTRC1C
:title: Pursue a persistent objective with evidence and bounded autonomous continuation
:status: accepted

Give one assistant a persistent objective for its conversation, either from the start or for the portion after the goal is set. While active, normal user messages guide that assistant toward the same goal; there is no separate attached-chat mode or shared goal across assistants/sessions. Keep the assistant working until the goal is satisfied, restoring direction after premature stopping or context compaction. Retain branch-local state through supported Pi lifecycle changes, and stop autonomous continuation honestly when complete, paused, blocked, aborted, or budget-limited. Goal does not execute or own work belonging to other extensions.
:::

:::mara requirement REQ-GOAL-CONTROLS
:mid: 01M3Q5PMXKW0GBF2NS995WM04N
:title: Provide explicit goal controls and always-available read-only inspection
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Maintain one current goal per conversation branch. Preserve /goal creation, status, waits, evidence, evidence reset, pause, resume, continue, clear, restart-policy, no-progress, and statusbar controls. Model-driven creation or replacement requires explicit user intent, not inference from an ordinary task. Use the reference replacement/reset confirmations, reject stale confirmations, and preserve terminal audit records. Expose a single-purpose namespaced goal-inspection tool as read-only in active, paused, complete, budget-limited, and unset states; absence of a goal is a valid inspection result. Restrict evidence mutation and completion to an active current goal. Pause and clear control only goal autonomy; they do not cancel jobs or clear producer gates.

All model-facing goal operations follow [[REQ-PI-ATOMIC-TOOLS]]; the user-facing /goal command family need not be split into separate slash commands. Use `goal_*` registration names plus native namespace metadata; per-operation suffixes and schemas remain public API design, not a requirement to preserve legacy unnamespaced names.

The current goal directs this assistant's conversation for its active interval, not a separately attached stream of messages. Normal user messages provide guidance, clarification, and feedback within that interval; there is no per-message attachment command or `/goal run` operation in this design. Such messages do not by themselves create another goal, replace the stored objective/criteria, or resume a paused goal. Explicit goal changes still follow the existing creation/replacement, revision, and review rules. [[REQ-GOAL-NO-PROGRESS]] defines supervision of that active interval; [[REQ-GOAL-CLI-STARTUP]] defines explicit creation/start intent at process startup.
:::

:::mara requirement REQ-GOAL-CLI-STARTUP
:mid: 01M3S2TKVW228AA6DMZ71ZVY8N
:title: Create and start an explicit goal once at CLI startup
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

When the goal extension is loaded, support the native Pi string flag `--goal "objective"` as explicit intent to create a goal in the initially selected session branch and start goal-directed work. Reuse the normal goal creation/start flow, including the fresh evidence ledger, criteria review before substantive implementation, configured budgets, and current-session generic gate checks. Pending or unconfirmed gates do not permit an initial nudge; this option is not a noninteractive gate bypass or permission to skip completion checks. The resulting goal-started run falls within [[REQ-GOAL-NO-PROGRESS]] supervision policy.

Apply the flag only at initial process startup. Do not reapply it on extension reload, session creation/switch/resume within the process, forks, or tree navigation. Those transitions follow [[REQ-GOAL-SESSION-STATE]], not a replay of CLI creation intent. Reject invalid or empty objectives without creating a goal. If initialization conflicts with an existing current goal in the selected branch, report the conflict and preserve that goal and its evidence; the flag must not silently replace, reset, or resume it. An invocation without the flag retains normal creation/restoration behavior.

Use native extension flag registration and Pi scheduling, not a wrapper CLI or parallel turn scheduler. Preserve user-selected providers, classifier availability/fallback, sharing/spending ceilings, and tool disabling. Verify startup, conflict/error reporting and mode-specific lifetimes through interactive, print, JSON and RPC entry points before claiming support; do not rely on terminal UI. Follow [[REQ-PI-NONUI-AWAIT]] so awaited work cannot cause premature completion; this is not a hidden keepalive for unrelated or deliberately non-awaited resources. Acceptance of this requirement does not establish an implemented flag or passing mode-specific startup behavior.
:::

:::mara requirement REQ-GOAL-CLASSIFIERS
:mid: 01M3RHJ2G3K20Q6540ECYAANPS
:title: Prefer native goal classifiers with explicit availability and fallback
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Use Pi's native classifier capability as the first choice for goal semantic assessments, through an explicitly configured provider/model and context-sharing policy rather than a separate AI client. Check native classifier availability before calling it. Missing configuration, model, or credentials must not make the goal extension unusable. Support local and explicitly selected cloud classifiers with one user-selected default and optional per-feature model overrides. Keep provider selection and spending/data-sharing limits user-controlled; project settings can tighten, not broaden, those limits. Require model-specific thresholds rather than silently applying another model's profile.

If a classifier is unavailable or its request fails, report the fallback and retain the prior behavior for that operation: deterministic no-progress checks and explicit blocked/pause controls for supervision, and the existing ledger, direct-inspection, and gate checks for completion. A valid uncertain or adverse assessment is not an unavailable classifier and must not be relabelled as failure to bypass its decision. An applicable rejection for unchanged goal/evidence survives later unavailability, failure, or budget exhaustion; fallback must not erase it. User abort still follows [[REQ-GOAL-PAUSE-RECOVERY]], not a provider-error continuation path.

Apply the provisional evaluated profile and bounded request policy in [[DES-GOAL-CLASSIFIER-POLICY]]. Supplied context may include bounded relevant inspected code, diff, and test-output excerpts under the selected sharing policy. Use complete-coverage bounded batches for oversized reviews, never approval from silently truncated input. Bound supplied context, request frequency, latency, and cost; account for attributable reported usage without double counting under [[REQ-GOAL-BUDGETS]]. Classifiers inspect only supplied data: an artifact reference is not automatic artifact retrieval. Keep inputs transient and persist only bounded assessment diagnostics/references, not another transcript or raw artifact store. Recheck goal identity/revision and session context before applying asynchronous results. Classifier judgments and confidence are not verified facts or authorization; deterministic ownership, gate, budget, and structural checks remain authoritative.
:::

:::mara requirement REQ-GOAL-EVIDENCE
:mid: 01M3Q5PQVV9QPABKMS06G7PX0Q
:title: Require a bounded goal-bound evidence ledger and unblocked completion
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Every new goal starts with an empty evidence ledger. The checklist expresses observable acceptance criteria for the objective, not merely implementation tasks; the ledger also records their status, supporting evidence, and blockers. Require a nonempty checklist whose requirements are all verified with evidence before model-driven completion; also require confirmed-unblocked current-session gate state. Use goal identity and expected revision to reject stale or cross-goal mutations. Preserve reference operations to initialize/upsert requirements, add/remove evidence, and change requirement status; blocked requirements require a blocker, and verified requirements require evidence. Bound the ledger to 50 requirements, 20 evidence items per requirement, and 16 KiB serialized data. Store concise references and claims, not raw logs or file contents. A changed requirement invalidates its prior verification. Ledger claims are not automatic proof that referenced artifacts satisfy the objective; the completion prompt and goal-writer skill still require direct inspection. Do not add a dependency on Mara, Work, or a particular producer.

Review acceptance criteria when first created or materially changed, before substantive implementation. At completion attempts or explicit review requests, use [[REQ-GOAL-CLASSIFIERS]] to assess whether the criteria cover the objective and supplied evidence supports each claimed verification, including missing checks and contradictions. An insufficient or uncertain review blocks completion with no force-complete bypass. Repair implementation/evidence or clarify the criteria without weakening acceptance criteria, rather than immediately pausing merely for a refusal; normal blocker, supervision, and budget policies still apply. Users can revise evidence, explicitly re-review, pause, or clear the goal. A positive review does not mark criteria verified, complete the goal by itself, or bypass the existing structural, direct-inspection, revision, and confirmed-unblocked gate checks. If the classifier is unavailable or the request fails, retain those previous completion checks with a visible fallback rather than fabricating classifier approval. Cache reviews for unchanged relevant inputs and classifier configuration as specified in [[DES-GOAL-CLASSIFIER-POLICY]]; do not automatically retry unchanged inputs until an approval appears. An explicit re-review can produce a new valid assessment, but a provider outage cannot erase a still-applicable rejection. Bound batches while requiring coverage of every criterion and its relevant evidence; incomplete coverage is not approval. A path or claim alone does not establish the contents or validity of an uninspected artifact.
:::

:::mara requirement REQ-GOAL-BUDGETS
:mid: 01M3Q5PTVGBMJKBA2G7V23ESTH
:title: Enforce optional token and active wall-time budgets without controlling jobs
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Allow optional token and wall-time budgets together, with no whole-goal token/wall-time budget invented when the user did not request one. The separate default classifier spending limit in [[DES-GOAL-CLASSIFIER-POLICY]] is not a whole-goal budget. Count attributable classifier usage once within a configured token budget, without double counting tool-result/native usage records. Preserve reference command budget syntax and validation. Count wall time while active, including gate waits; exclude explicit pauses, terminal/budget-limited intervals, and process-offline gaps. Keep agent turn-processing time distinct from active wall time, checkpoint through Pi persistence, clamp clock rollback, and account for final-turn tokens even if completion occurred during that turn. Reaching either budget prevents further substantive autonomous goal continuation and records the limit honestly; it does not kill jobs or release gates. Request one concise progress/blocker summary only when normal idle, pending-message, and gate conditions allow; otherwise retain it for a natural model-visible turn, without bypassing gates or duplicating an acknowledged summary.
:::

:::mara requirement REQ-GOAL-CONTINUATION
:mid: 01M3Q5PXSTTJNGWETVTKC9QDA1
:title: Use Pi scheduling and generic gates for guarded continuation and explicit bypass
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Automatic continuation, normal goal start, and resume obey current-session generic gate state: pending or unconfirmed state is not permission to nudge. Queue normal follow-up only for an active eligible goal when Pi is idle, no messages or goal continuation are pending, and discovery/reconciliation confirms the session unblocked. Recheck after asynchronous boundaries and invalidate stale requests after goal, session, or relevant gate changes. Gate observations may cause eligibility reevaluation, but the protocol does not dispatch turns or carry producer-specific wake instructions; goal owns its normal continuation policy. For /goal continue only, retain an explicit interactive confirmation allowing one turn despite the displayed gates, without clearing them. Refuse stale confirmations or a non-interactive gate bypass. This particular user control is not a general approval system. Follow [[REQ-WORKFLOW-PRODUCER-INDEPENDENCE]] and [[REQ-GATES-SIGNAL-ONLY]].

An assistant response or run ending before the active goal is satisfied is not goal completion. When eligible under the checks above, continue toward the same goal rather than stopping merely because the assistant stopped early. Keep bounded, fresh objective, constraints, and current completion/evidence state available in native model context while the goal is active, including after compaction and in continuation reminders, so the assistant can recover direction. Do not create a second goal, reset progress, or use a second transcript store to supply that context. Pauses, user abort, budgets, pending messages, generic gates, and evidence-based completion still govern continuation.

In non-UI runs, follow [[REQ-PI-NONUI-AWAIT]] for needs-attention reporting and stopped progression when a relevant owner remains unknown after reconciliation timeout. This is a consumer response to unresolved generic gate state, not permission to clear gates, infer owner death or control external execution. Do not confuse it with ordinary confirmed-pending work, which remains subject to normal guarded waiting.
:::

:::mara requirement REQ-GOAL-PAUSE-RECOVERY
:mid: 01M3Q5Q0NHBNH6XYYSX6MRNBMA
:title: Pause honestly for blocked work or user abort instead of repeatedly nudging
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Provide a model-accessible blocked/pause operation which records a concrete blocker and the input needed to proceed, then stops autonomous nudges until explicit /goal resume. Do not infer completion, clear gates, or stop jobs from this pause. A user abort of the current run while goal is active immediately pauses goal autonomy rather than being retried as a provider failure. Background-job execution and result delivery remain independent. Keep ordinary delivery/provider failures separate, bounded, diagnostic, and explicitly recoverable; do not endlessly generate new continuations after failure. Reuse Pi scheduling and retry facilities where applicable, and retain paused recovery if a resume request cannot be delivered.

Classifier-supervised stuck/blocked pauses follow [[REQ-GOAL-NO-PROGRESS]] and require explicit resume as well. Their diagnostic must distinguish an assessed problem from an explicit model-reported blocker; neither is permission to control external execution.

The non-UI unknown-owner needs-attention stop in [[REQ-PI-NONUI-AWAIT]] also pauses goal autonomy until explicit /goal resume. A later owner response, confirmed-empty gate state or result delivery does not automatically reactivate the goal. Independent jobs and their selected result-delivery policy remain unaffected by this pause. Explicit resume still obeys current generic gates, budgets and normal guarded scheduling; it is not permission to clear unresolved gates or bypass them.
:::

:::mara requirement REQ-GOAL-SESSION-STATE
:mid: 01M3Q5Q3K399ZS8P2J9GF7P5Z6
:title: Restore branch-local goal state through Pi without charging offline time
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Persist compact goal state, ledger, progress diagnostics, settings, and pending-summary information with Pi custom entries and restore from the selected branch. Default startup/reload restoration of an active goal to paused; retain configurable restore-idle (active without a startup turn) and resume (one eligible guarded continuation) policies. /tree restores selected branch state, while new/fork/session-resume paths follow their branch contents rather than blindly applying startup/reload behavior. Never reuse stale session-bound contexts or charge inactive/offline gaps as active time. No-session operation follows Pi in-memory resumability, without a new session system or post-exit persistence promise. Goal history does not transfer ownership of external jobs or gates. A goal belongs to this assistant's selected conversation branch, not a cross-session coordinator or shared objective registry. Switching to another session does not carry the old goal into it or keep the old goal autonomously progressing in the background; each selected branch restores its own local state. Restoring a conversation or inheriting branch history does not create shared goal authority between assistants.

Compaction must preserve the current goal and ledger rather than create a new goal, reset evidence, or replay startup intent. Restore bounded current goal context for subsequent work under [[REQ-GOAL-CONTINUATION]]; a compacted summary is not a replacement for the current durable goal state.
:::

:::mara requirement REQ-GOAL-NO-PROGRESS
:mid: 01M3Q5Q6HY4TRSY3MYTJ9F5PYS
:title: Prefer classifier supervision with bounded deterministic fallback
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Prefer native classifier supervision under [[REQ-GOAL-CLASSIFIERS]] for semantic stuck/blocked detection. Enable supervision by default when a classifier is configured and available, while respecting an explicit off setting. Without a classifier, retain the previous opt-in deterministic behavior; an enabled supervisor uses that deterministic fallback if its classifier becomes unavailable or fails.

Classifier supervision covers completed assistant turns while the current goal is active in the selected session/branch, including normal user messages, initial work, resume, manual continue, and automatic/restart-directed work. Evaluate at completed-turn boundaries, not after every nested tool call. Eligibility follows the active goal interval, not per-message attachment, semantic relevance of prompt wording, or an interactive-versus-extension input distinction. Use public Pi lifecycle/context integration and current goal/session revisions to reject stale observations and callbacks; do not supervise other assistants/sessions or turns outside the active interval. Native turn indices alone are not stable observation identities. Use bounded relevant goal context, recent observations, and evidence changes to distinguish substantive progress, repeated unsuccessful attempts, concrete blockers, and uncertainty. Check known generic-gate waiting directly so legitimate waiting is not treated as stagnation. Three consecutive qualifying new stuck/blocked observations under [[DES-GOAL-CLASSIFIER-POLICY]] automatically pause goal autonomy until explicit resume, with the assessment and supporting observations visible. Repeated evaluation or cached reuse of one observation is not a new observation; progress and explicit resume reset the streak. Do not pause solely because a classifier is uncertain or unavailable.

The deterministic fallback retains its previous, narrower sampling scope, not a separate user-facing chat mode: goal-owned automatic synthetic continuations, not user turns, manual continue/resume, restart turns, or unrelated producers' turns. It retains bounded fingerprints, a four-observation window, and a pause after three consecutive conservative repeated comparisons. A meaningful summary/tool-pattern change or evidence revision change resets its streak. Do not persist assistant text, tool arguments/output, or file contents in this detector. Either mode may pause, not complete or clear the goal, mutate gates, stop jobs, or suppress independent result delivery. Explicit resume resets the streak while retaining bounded diagnostics; explicit reset clears its history.
:::

:::mara requirement REQ-GOAL-PRESENTATION
:mid: 01M3Q5Q9J6WQGB093A4B17XKBC
:title: Provide goal status and an evidence-oriented goal-writing skill
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Show objective, lifecycle/waiting state, remaining budgets, evidence summary, progress diagnostics, restart policy, and current-session gate diagnostics through user controls. Publish optional structured status and a normal Pi footer fallback, without requiring the statusline extension. Turning statusbar publication off must not erase transcript history. Keep model tool output bounded with honest truncation and preserve the bounded evidence ledger for recovery. Package goal-writer with the six-part outcome, verification, constraints, boundaries, iteration, and blocked-stop contract; include budgets only when requested and name verification commands only after checking them. Use Pi rendering/scheduling facilities rather than parallel UI or turn machinery.

Expose classifier versus fallback mode, assessment outcome/confidence when supplied, supporting observation references, and unavailability/failure reasons without presenting them as verified facts. The goal-writer skill must distinguish acceptance criteria from tasks and evidence claims from direct artifact verification.

Show the selected classifier/profile, pending review and coverage, cached versus fresh assessment, winning probability versus confidence, and estimated classifier spend/remaining rolling and optional total caps. Explain when a refusal remains applicable during fallback; never advertise missing pricing as known free usage. These are intended changes, not current UI evidence.
:::

:::mara requirement REQ-GOAL-FRESH-STATE
:mid: 01M3Q5QCDZRSMYQV9EW03HTYN2
:title: Start the reworked goal extension without importing legacy state
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Use a fresh persistence namespace for the reworked goal package. Do not import, reinterpret, restore, or rewrite legacy goal session state, settings, evidence, or counters. Leave legacy session history untouched and unused as runtime state, and start without an active goal until explicitly created or restored from the new namespace. New-format state must round-trip through Pi; malformed state must not fabricate evidence, completion, or unsafe continuation. No legacy compatibility or automatic migration layer is required.
:::

:::mara verification VER-GOAL-CONTROLS-AND-EVIDENCE
:mid: 01M3Q5QFDEA8ES0FEN9R9QQW6N
:title: Verify goal control scope evidence invariants and presentation
:status: accepted
:method: test
:level: integration
:verifies: REQ-GOAL-CONTROLS
:verifies: REQ-GOAL-EVIDENCE
:verifies: REQ-GOAL-PRESENTATION
:verifies: REQ-GOAL-CLI-STARTUP

Exercise real Pi tool/command registration, explicit creation/replacement, every-state read-only inspection, active-only mutation, stale confirmations, and user pause/clear without external job/gate changes. Test all ledger operations, byte/count bounds, stale/cross-goal revisions, invalidated evidence, blocked requirements, and refusal of completion with pending or unconfirmed generic gates. Require a fully evidenced, confirmed-unblocked goal before completion. Verify status publication/fallback, bounded model output, and packaged goal-writer discovery and content. These are future checks, not passing evidence.

With an active goal such as implementing retries, submit ordinary guidance such as considering exponential backoff and normal clarifying questions. Verify the same goal remains current and supplies context without an attachment command or a second/replacement goal. Guidance alone must not silently rewrite the stored objective/criteria; intentional material revisions still follow the normal review rules. Ordinary messages with an unset, paused, complete, or cleared goal must not implicitly create/restart/resume autonomy.

Exercise classifier ledger review through [[REQ-GOAL-CLASSIFIERS]]: insufficient and uncertain reviews refuse completion, and a positive review cannot verify entries or override missing evidence, stale revisions, or pending/unknown gates. Unavailability/request failure retains prior completion checks with an explicit diagnostic, never a fabricated positive assessment. Cover criteria that omit part of the objective, contradictory or irrelevant evidence, uninspected artifact references, and evidence/goal/session changes while review is pending. Verify assessment and fallback presentation.

Verify initial/materially changed criteria review before substantive work, corrective action without weakening criteria, no force-complete bypass, explicit re-review versus unchanged-input caching, and unchanged-evidence rejection surviving outage/budget exhaustion. Exercise complete-coverage batches including failed, missing, stale, contradictory, and truncated parts; a partial positive cannot approve the whole ledger.

Exercise [[REQ-GOAL-CLI-STARTUP]] through real interactive, print, JSON and RPC entry points with controlled model/classifier fixtures. A valid `--goal` objective creates one goal and starts its normal guarded flow; without the flag, startup behavior is unchanged. Check empty/invalid objectives and conflicts with existing current goals: reject initialization without overwriting goal/evidence state or silently resuming on behalf of the flag. A successful CLI start must obey pending/unknown gates, configured budgets, classifier availability/fallback and initial criteria review, with no gate or completion bypass. Include startup with no separate prompt and with positional or piped input; verify native input ordering and no lost input, duplicate start, or goal-state leakage into another session. Verify help-only loading causes no goal creation or inference, and that an absent/disabled extension does not silently claim the flag worked. After initialization, reload, new/switch/resume, fork and tree navigation must not replay it. Cover persistent and in-memory sessions, native mode-specific errors and termination, and no hidden indefinite keepalive. These are future checks; native string-flag registration alone is not startup integration evidence.
:::

:::mara verification VER-GOAL-SCHEDULING-AND-RECOVERY
:mid: 01M3Q5QJB91QXXCJP49M7S5BBE
:title: Verify guarded continuation budgets blocked pauses and user abort
:status: accepted
:method: test
:level: integration
:verifies: REQ-GOAL-BUDGETS
:verifies: REQ-GOAL-CONTINUATION
:verifies: REQ-GOAL-PAUSE-RECOVERY
:verifies: REQ-GOAL-NO-PROGRESS

Use controlled clocks and actual Pi lifecycle/message scheduling with generic gate owners. Cover start/resume while gated, unknown versus confirmed-empty state, pending messages, duplicate/stale continuation races, and the explicit one-turn confirmed bypass without gate clearance. Measure wall time during gate waits versus explicit pauses and offline intervals; exercise combined limits, mid-turn expiry, final-turn token accounting, and deferred summary receipts. A model-blocked goal and a user-aborted run must remain paused until explicit resume, while independent job delivery still follows its own policy. Exercise bounded delivery failure recovery and classifier-first supervision with deterministic fallback without observing other sessions or turns outside the active goal interval. No producer-name or jobs-core dependency is permitted. These tests have not run.

Cover configured/available classifier default enablement, explicit off, the previous no-classifier opt-in behavior, and deterministic fallback while supervision is enabled. Consistent stuck/blocked answers pause autonomy until explicit resume without stopping jobs or changing gates; uncertain answers and provider failures alone do not assert a blocker. Exercise legitimate gate waiting, progress/evidence changes, stale async assessments, fingerprint fallback/reset thresholds, and independent result delivery during a pause. Use [[VER-GOAL-CLASSIFIERS]] for the native availability/failure boundary and model-quality evaluation.

Classifier supervision must cover normal user-message turns, initial work, resumed, manually continued, and automatic work while the current goal is active in the selected session/branch. Exercise completed-turn rather than nested-call sampling and three consecutive qualifying new observations, resetting on progress/resume and not advancing from cached/repeated observations. Separately preserve the deterministic fallback's narrower legacy observation scope. The static pilot does not verify these temporal transitions.

With an active goal, exercise normal user guidance and clarification without any attachment operation. Their completed assistant turns are eligible observations even without repeating the objective; input origin alone does not exclude a completed assistant turn in this active interval. Exercise CLI startup and automatic continuations under the same current-goal scope. Pause, clear, complete, replace, switch sessions/branches, and deliver delayed events: old observations must not apply to a later active interval or another goal/session. Keep deterministic fallback limited to its separately specified automatic-synthetic scope and verify that scope through public native integration rather than guessing from prompt wording or reused turn indices.

Have the assistant stop early with an unfinished active goal: when otherwise eligible, require a normal guarded continuation with fresh goal context, not a claim of completion or another goal. Compact the conversation and inspect subsequent native model input for the current objective, constraints, and completion/evidence state, preserving goal identity and ledger progress. Compaction alone is not a new progress observation or permission to resume a paused goal. Verify pending messages, gates, pauses, budgets, and completed goals prevent inappropriate or duplicate automatic continuation.

Include the non-UI unknown-owner timeout cases in [[VER-PI-NONUI-AWAIT]] with generic owners: needs-attention stops progression without clearing unresolved gates, while a responsive owner with known pending work remains a normal gate wait. Verify no producer-specific inspection or timeout-triggered stop of independent work. After the needs-attention pause, recover the owner and deliver its result/confirmed state; require goal autonomy to stay paused until explicit /goal resume. Verify independent execution/delivery continue according to their own policies, without goal-driven cancellation or suppression. Resume with gates still unresolved must not nudge; resume after confirmed clearance still rechecks budgets and current goal/session revisions. Cover late/stale callbacks and restoration so neither owner recovery nor reloading silently reactivates the paused goal.
:::

:::mara verification VER-GOAL-STATE-AND-CLEAN-BREAK
:mid: 01M3Q5QN8XNAHCAKVX0FRAQFFT
:title: Verify new goal persistence and deliberate legacy-state isolation
:status: accepted
:method: test
:level: integration
:verifies: REQ-GOAL-SESSION-STATE
:verifies: REQ-GOAL-FRESH-STATE

Exercise real persistent/in-memory Pi sessions, branch navigation, session changes, forks, and each startup/reload policy without stale callbacks, duplicated turns, or offline budget charging. Seed legacy reference-format goal entries: the reworked extension must not activate/import them or alter those bytes. Create a new-format goal and verify restoration from its new namespace, preserving its ledger/settings and normal gate isolation. Malformed current records must not fabricate verified state. Use separate assistant conversations with different or absent goals and switch between their branches: restoration recovers only the selected branch's state, no shared active goal or background continuation in the deselected conversation. Forked/history-derived state must remain independently scoped rather than sharing authority. Compact an active conversation and verify its current goal/evidence survive and fresh context is supplied without replaying startup or resetting progress. These are future checks, not executed migration or lifecycle evidence.
:::

:::mara verification VER-GOAL-CLASSIFIERS
:mid: 01M3RHJ5GPAZD3VJSTP03B453N
:title: Verify native classifier availability fallback and assessment quality
:status: accepted
:method: test
:level: integration
:verifies: REQ-GOAL-CLASSIFIERS
:verifies: DES-GOAL-CLASSIFIER-POLICY

Exercise the native Pi classifier boundary with controlled answers and failures. Cover absent configuration/model/credentials, request error and timeout, cancellation, valid uncertainty, and adverse judgments. Verify visible fallback only for unavailability/failure, no classifier request when unavailable, no hidden provider switch, and preservation of explicit abort/paused state.

Check bounded inputs/calls, latency and cost policies, attributable usage without double counting, compact diagnostics rather than persisted raw inputs, and stale results across goal/evidence revisions and session changes. Classifiers must not create ownership, clear gates, mark ledger entries verified, or bypass structural checks.

Evaluate candidate models and questions on labelled examples of substantive progress, repetition, legitimate waiting, concrete blockers, ambiguous context, and supported/insufficient/contradictory ledger evidence. Include misleading instructions embedded in assessment data and missing referenced artifacts. Record model/configuration, observed errors including false pauses and false approvals, latency and usage; choose confidence/consistency policies from that evidence rather than assuming reported confidence is calibrated accuracy. Controlled fixtures alone do not establish classifier quality. [[EVD-GOAL-CLASSIFIER-PILOT]] records executed synthetic model assessments only. Full native goal integration, temporal policy, bounded-context assembly, budget/usage integration and production assessment quality remain unverified.

Verify the model-specific provisional profile in [[DES-GOAL-CLASSIFIER-POLICY]], including missing profiles for other models, explicit local/cloud selection, per-feature overrides, project ceilings, five-second whole-call default timeout, explicit native `maxRetries: 0` and no extension retry loop, and the rolling per-goal USD 0.05/hour cap with optional total cap. Use controlled time and reported/estimated usage to test long-running goals, no double counting, exhaustion/fallback without deleting refusals, and unknown accounting without a false zero-cost claim. Validate the actual runtime questions/context and record false blocks as well as false approvals; do not transfer the synthetic profile to other models or new question shapes without evaluation.

Use controlled transports to count classifier attempts for retryable HTTP failures and timeouts in supervision, criteria review and multi-batch evidence review: at most one transport attempt per call, with distinct batch/re-review calls accounted separately. Set a nonzero host provider retry configuration and confirm the goal's explicit per-call zero still wins without changing saved settings. Include authentication/setup in the timeout boundary, a provider that ignores cancellation, late responses and missing failure usage; do not treat a timed-out caller as proof of physical cancellation or zero spend. The earlier probe demonstrated the System One transport option, not this unimplemented goal integration.
:::
