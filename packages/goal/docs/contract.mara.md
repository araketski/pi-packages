# Goal extension contract

These are accepted intended behaviors for the reworked goal package, not an
implemented extension or passing test evidence. The package now has only a typed
no-op extension and an unfinished goal-writer skill scaffold; see
[the scaffold boundary](./scaffold.mara.md).

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

The user approved default-on supervision for available classifiers with applicable
evaluated profiles, automatic pauses for consistent stuck/blocked findings, and
completion refusal on insufficient or uncertain ledger reviews.
[[DES-GOAL-CLASSIFIER-POLICY]] records model-specific provisional thresholds,
observation scope, bounded review policy and timeout. Monetary classifier limits
were subsequently removed. The [planned-contract review](../../../docs/planned-review.mara.md)
clarifies transport-failure/profile fallback while retaining applicable review
vetoes, and records explicit user recovery for abandoned wait obligations.
[[EVD-GOAL-CLASSIFIER-PILOT]] records actual synthetic calls, not an implemented goal
runtime or calibrated production accuracy. Public hook/context/usage integration
still needs design and verification. No provider is enabled by this specification.

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

Where current public Pi startup/lifecycle APIs support it safely, provide the native Pi string flag `--goal "objective"` as explicit intent to create a goal in the initially selected session branch and start goal-directed work. Reuse the normal goal creation/start flow, including the fresh evidence ledger, criteria review before substantive implementation, configured budgets, and current-session generic gate checks. Pending or unconfirmed gates do not permit an initial nudge; this option is not a noninteractive gate bypass or permission to skip completion checks. The resulting goal-started run falls within [[REQ-GOAL-NO-PROGRESS]] supervision policy.

Apply the flag only at initial process startup. Do not reapply it on extension reload, session creation/switch/resume within the process, forks, or tree navigation. Those transitions follow [[REQ-GOAL-SESSION-STATE]], not a replay of CLI creation intent. Reject invalid or empty objectives without creating a goal. If initialization conflicts with an existing current goal in the selected branch, report the conflict and preserve that goal and its evidence; the flag must not silently replace, reset, or resume it. An invocation without the flag retains normal creation/restoration behavior.

Align with Pi's native startup behavior: the explicit flag objective is startup message intent, not a requirement for an additional user prompt. Where current public Pi APIs safely dispatch and await that flag-derived input, bare --goal is sufficient to start work. Where a separate positional or piped prompt is supplied, preserve its native ordering and content without duplicate goal starts or synthetic replay. Native flag registration alone is not proof that Pi starts a run. Use native extension flag registration and Pi scheduling, not a wrapper CLI or parallel turn scheduler. Preserve native provider selection, classifier availability/configuration opt-out, and tool disabling. Verify startup, conflict/error reporting and mode-specific lifetimes through interactive, print, JSON and RPC entry points before claiming support; do not rely on terminal UI. Follow [[REQ-PI-NONUI-AWAIT]] so awaited work cannot cause premature completion; this is not a hidden keepalive for unrelated or deliberately non-awaited resources. Support is conditional on demonstrated current public Pi capabilities. If a mode/input combination cannot safely support startup, omit that combination and clearly document/report it; do not invent a wrapper, private integration, host fork, or mandatory future API. Startup without a separate prompt is not required where Pi cannot safely dispatch/forward it. Unsupported cases must not silently claim goal creation. Acceptance does not establish an implemented flag or passing mode-specific startup behavior.
:::

:::mara requirement REQ-GOAL-CLASSIFIERS
:mid: 01M3RHJ2G3K20Q6540ECYAANPS
:title: Prefer native goal classifiers with explicit availability and fallback
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Use Pi's native available classifiers by default when an evaluated model/question profile applies, with optional model preferences/per-feature overrides and an extension configuration opt-out. Preserve native provider configuration and tool disabling; do not add a provider, client, approval/sharing layer or classifier monetary-budget subsystem. An explicitly selected model is not silently replaced. An available but unprofiled model uses visible deterministic fallback for that feature, not another model's thresholds or a whole-goal lockout.

Unavailable/disabled/unprofiled classifiers and ordinary failed/timed-out calls use the deterministic no-progress, explicit pause, ledger, direct-inspection and gate checks with an honest reason. Failure is not a positive review. Valid uncertainty or an adverse review is not transport failure. A still-applicable insufficient/uncertain review for unchanged goal/evidence remains a completion veto during fallback, including disablement; relevant input changes or explicit re-review are the recovery routes under [[REQ-GOAL-EVIDENCE]]. Fallback alone does not pause otherwise eligible work.

Follow [[ADR-WORKFLOW-MINIMAL-PROFILE]]: make one bounded assessment using current goal/ledger context and relevant supplied, inspected code/diff/test excerpts. An artifact path alone is not its contents. Do not crawl the repository, duplicate transcripts or implement multi-batch evidence orchestration. If the requested assessment cannot fit or lacks required context, report that limitation and request a smaller supported evidence selection; incomplete context is not approval or a fabricated transport outage. Treat artifact instructions as data. Keep bounded diagnostics/references rather than raw inputs, and reject stale results after relevant goal/evidence/session changes.

Reuse supported native usage reporting without double counting or treating missing usage as measured zero. Omit unsupported attribution with an honest limitation; missing pricing/accounting is not an execution gate. Classifier answers do not establish verified evidence, ownership, gate clearance or authorization. Preserve the provisional policy in [[DES-GOAL-CLASSIFIER-POLICY]] and the optional whole-goal budgets in [[REQ-GOAL-BUDGETS]].
:::

:::mara requirement REQ-GOAL-EVIDENCE
:mid: 01M3Q5PQVV9QPABKMS06G7PX0Q
:title: Require a bounded goal-bound evidence ledger and unblocked completion
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Start each new goal with an empty ledger. Require a nonempty checklist of observable acceptance criteria, all verified with evidence, and confirmed-unblocked current-session gates before model-driven completion. Keep goal identity and expected revision checks so stale/cross-goal operations cannot mutate it. Support initializing/upserting requirements, adding/removing evidence and changing status; blocked requirements need a blocker and verified requirements need evidence. Changing a requirement invalidates its verification. Bound the ledger to 50 requirements, 20 evidence items per requirement and 16 KiB serialized data. Store concise references/claims, not logs or file contents. Claims alone do not prove artifacts satisfy the goal; direct inspection and the goal-writer checks remain required. No Mara, Work or producer dependency is added.

Review criteria when first created or materially changed before substantive work, and review evidence at completion attempts or explicit review requests under [[REQ-GOAL-CLASSIFIERS]]. An insufficient/uncertain review refuses completion without a force-complete bypass. Repair implementation/evidence or clarify criteria without weakening acceptance; a refusal alone need not pause work. Positive classification does not verify entries, complete a goal or bypass structural, revision, direct-inspection or gate checks. Users can revise evidence, explicitly re-review, pause or clear the goal.

Use a simple bounded latest-review record tied to its relevant goal/evidence inputs and configuration. Reuse an unchanged assessment instead of automatically retrying until approval; ignore stale async results. Retain a still-applicable refusal during unavailable, disabled, unprofiled or failed-classifier fallback. With no applicable valid refusal, visible fallback permits deterministic completion when the remaining checks pass; never fabricate classifier approval. Explicit re-review may replace the assessment, but an outage/disablement does not erase its veto.

Under [[ADR-WORKFLOW-MINIMAL-PROFILE]], use one bounded review with adequate supplied evidence. Missing artifacts or context do not become approval. Multi-batch review, exhaustive evidence assembly and a review-recovery framework are deferred, not first-delivery acceptance. This does not weaken the evidenced checklist or applicable-refusal policy.
:::

:::mara requirement REQ-GOAL-BUDGETS
:mid: 01M3Q5PTVGBMJKBA2G7V23ESTH
:title: Enforce optional token and active wall-time budgets without controlling jobs
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Allow optional token and wall-time budgets together, with no whole-goal token/wall-time budget invented when the user did not request one. There is no classifier monetary budget or spending-reservation subsystem. Count available Pi-attributed classifier usage once within a configured token budget, without double counting tool-result/native usage records. Disclose unavailable attribution rather than inventing usage or making a missing host accounting API a prerequisite; token totals are limited to supported attribution. Preserve reference command budget syntax and validation. Count wall time while active, including gate waits; exclude explicit pauses, terminal/budget-limited intervals, and process-offline gaps. Keep agent turn-processing time distinct from active wall time, checkpoint through Pi persistence, clamp clock rollback, and account for final-turn tokens even if completion occurred during that turn. Reaching either budget prevents further substantive autonomous goal continuation and records the limit honestly; it does not kill jobs or release gates. Request one concise progress/blocker summary only when normal idle, pending-message, and gate conditions allow; otherwise retain it for a natural model-visible turn, without bypassing gates or duplicating an acknowledged summary.
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

Prefer native classifier supervision under [[REQ-GOAL-CLASSIFIERS]] for semantic stuck/blocked detection. Use classifiers by default when available, unless disabled in extension configuration. The fallback conditions in [[REQ-GOAL-CLASSIFIERS]] retain the deterministic detector and its existing opt-in control; do not introduce cost, pricing, or separate context-sharing fallback conditions. Request failures are reported honestly and use the fallback policy under [[REQ-GOAL-CLASSIFIERS]], not substantive-progress claims, fabricated assessments or failure-only pauses.

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

Show the selected classifier/profile, pending review and coverage, cached versus fresh assessment, winning probability versus confidence, and available native usage information, without classifier spending-cap or reservation UI. Explain when a refusal remains applicable during fallback; never advertise missing pricing as known free usage. These are intended changes, not current UI evidence.

When interactive Pi runs inside Herdr with its Pi integration installed, report the current goal's blocked state when it requires user input through the existing Herdr Pi integration. Emit `pi.events.emit("herdr:blocked", { active: true })` once on entering that state and the matching `{ active: false }` when leaving it, including explicit resume or goal clearance/replacement. Send no `label` or `message`, and add no reason metadata, sidebar customization, or separate notification integration. Keep the concrete blocker and required input in goal's own diagnostics under [[REQ-GOAL-PAUSE-RECOVERY]].

The installed hook reference-counts activations; ordinary conversation progress, `agent_start`, and `agent_settled` do not release them. Repeated observations must not acquire again, and goal must release only its own activation during goal/session changes and runtime shutdown/reload. Reconcile the current needs-input state on restoration without leaking or duplicating an activation or applying a stale goal/session callback. Ordinary pending job/gate waits and unrelated lifecycle pauses do not acquire this signal. Reporting is presentation only: it does not resume autonomy, clear gates, stop jobs, or change the explicit-resume policy. An absent hook, a non-Herdr session, or a non-interactive mode leaves normal goal behavior unchanged; do not require pi-herdr, inspect backend state, or add a direct Herdr socket reporter. This is intended integration, not an implemented or verified goal feature.
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

Under [[ADR-WORKFLOW-MINIMAL-PROFILE]], exercise actual Pi command/tool registration and one normal create → criteria/evidence → inspect → complete workflow. Read-only inspection works with no goal and in active/paused/terminal states; ordinary guidance preserves the same objective rather than implicitly replacing/resuming it. Check the bounded ledger operations and a stale/cross-goal mutation rejection with focused fixtures. Completion needs evidenced criteria and confirmed-unblocked gates; a positive classifier cannot bypass either.

With controlled native classifier answers, show sufficient review, insufficient/uncertain refusal, and visible unavailable/error fallback. Retain a refusal for unchanged evidence during fallback, then recover through relevant evidence change or explicit re-review. Missing required context cannot approve completion. Verify one bounded call, simple unchanged-input reuse and stale-result rejection; multi-batch fault combinations are deferred under [[VER-GOAL-CLASSIFIERS]].

For each claimed supported CLI startup mode/input combination, demonstrate one valid --goal start through public Pi scheduling and honest unsupported-case reporting. Check an empty objective and existing-goal conflict without overwriting user state. Verify initial-only application with a representative reload/session change and preservation of supplied native input. No full Cartesian mode/input/lifecycle matrix or wrapper/private API is required.

Check status/footer and packaged goal-writer discovery/content. For the optional installed Herdr hook, show blocked-for-input activation once, release on resume/clear/session cleanup, and preservation of another emitter's activation. Pending work is not needs-input; absent hooks leave normal operation usable. Use isolated resources, not the live user server. These are future checks, not observed integration evidence.
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

Use actual Pi scheduling, controlled clocks and generic gate owners. Demonstrate a standalone goal starting after confirmed-empty discovery, continuing after an unfinished assistant stop, keeping its current context/evidence after compaction, and completing only with its evidenced ledger. No jobs/Herdr/classifier provider is a prerequisite.

A pending/unknown gate or queued input prevents an automatic nudge. Ordinary owner clearance permits reevaluation without a competing producer-driven turn. Show one coalesced continuation and rejection of a delayed callback after goal/session change. Explicit one-turn confirmed continue does not clear gates. A user abort, concrete blocker or needs-attention pause stays paused until explicit resume; later owner recovery does not resume it or cancel/suppress independent jobs/delivery.

For optional budgets, check active wall time including gate waits, exclusion of pause/offline gaps, available token accounting and honest limit stopping/guarded summary. Exercise the selected restore policies with normal state fixtures, not every expiry/receipt/interleaving combination.

Show native classifier supervision on completed turns in the current active interval, including ordinary guidance, and three qualifying new stuck/blocked observations followed by explicit resume. Progress resets the streak; cached answers and legitimate gate waiting do not count as new stagnation. Verify visible failure/unavailability fallback and the deterministic detector's narrower automatic-synthetic scope. Check one stale assessment instead of exhaustive temporal schedules.

Use [[VER-PI-NONUI-AWAIT]] for normal awaited result consumption and one unknown-owner needs-attention case. Include explicit next-natural-turn waiting and confirmed user abandonment without implicit completion, resumption or gate mutation. Follow [[ADR-WORKFLOW-MINIMAL-PROFILE]]; broad fault/clock/mode products and stress campaigns are deferred. These are future checks, not passing evidence.
:::

:::mara verification VER-GOAL-STATE-AND-CLEAN-BREAK
:mid: 01M3Q5QN8XNAHCAKVX0FRAQFFT
:title: Verify new goal persistence and deliberate legacy-state isolation
:status: accepted
:method: test
:level: integration
:verifies: REQ-GOAL-SESSION-STATE
:verifies: REQ-GOAL-FRESH-STATE

With actual isolated Pi persistent/in-memory sessions, create a new-format goal, update its evidence/settings and reopen the selected branch. Show ordinary tree/fork/session restoration remains branch-local, default startup/reload pause is honest, offline gaps are not charged and compaction preserves the goal/ledger rather than replaying startup. Switching sessions cannot keep the deselected goal autonomously progressing or grant shared authority.

Seed one legacy record and verify it is unused and unchanged. Check a malformed current record cannot fabricate verification/completion or autonomous continuation. Reject a representative delayed callback from the previous goal/session. Under [[ADR-WORKFLOW-MINIMAL-PROFILE]], these normal round-trips and safety checks replace an exhaustive lifecycle/restart/failure matrix; no migration or recovery service is required. These are future checks, not executed evidence.
:::

:::mara verification VER-GOAL-CLASSIFIERS
:mid: 01M3RHJ5GPAZD3VJSTP03B453N
:title: Verify native classifier availability fallback and assessment quality
:status: accepted
:method: test
:level: integration
:verifies: REQ-GOAL-CLASSIFIERS
:verifies: DES-GOAL-CLASSIFIER-POLICY

Exercise actual public native classifier integration with controlled answers: sufficient, insufficient/uncertain, stuck/blocked, unavailable/disabled/unprofiled, and an ordinary error/timeout. Verify default-on applicable profiles, explicit opt-out/preferences, honest diagnostics, no fabricated approval/pause from failure and no provider setup requirement. With evidenced criteria and confirmed-unblocked gates, deterministic fallback must remain usable when no applicable refusal exists. Establish a refusal and verify it survives unchanged-evidence fallback; evidence change/explicit re-review remains recovery.

Check the selected provisional profile, completed-turn cadence, one bounded call with supplied relevant evidence, simple unchanged-input reuse, stale/late answer rejection, five-second default whole-call timeout and explicit native maxRetries:0 without a global settings change. Missing context/inspected artifacts do not approve completion; classifier answers do not verify ledger entries, grant ownership or clear gates. Native usage is reported where supported without fabricated zero or a cost/accounting gate.

Reuse [[EVD-GOAL-CLASSIFIER-PILOT]] only as its limited historical basis, and inspect representative actual runtime questions/context for applicability. Record known limitations and observed bad decisions; controlled fixtures and the pilot do not prove production accuracy. New model-calibration/benchmark campaigns, multi-batch orchestration, every provider/authentication/retry/cancellation combination and usage-recovery services are deferred under [[ADR-WORKFLOW-MINIMAL-PROFILE]], not first-delivery prerequisites. An unprofiled model continues via fallback rather than borrowing thresholds. These are future native integration checks, not passing runtime evidence.
:::
