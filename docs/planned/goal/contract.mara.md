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
mandatory evidence ledger, restart policies, opt-in no-progress detection,
statusline support, and goal-writer skill. Add explicit blocked pauses, distinguish
user abort from delivery failure, keep read-only inspection available in every
state, and enforce generic gate eligibility for normal start/resume and completion.
Do not restore the old gate protocol's domains, wake handoffs, or auto-resume claims.

Gated means active but waiting, not lifecycle-paused: the active wall clock still
runs. Goal observes current-session gates without inspecting their producers.
The [jobs integration](./jobs-integration.mara.md) is a consumer verification case,
not an additional runtime dependency on jobs-core or Herdr.

The user selected a clean break from legacy saved data. Use fresh persistence
identifiers, leave legacy session records untouched and unused, and do not build
a migration or legacy-state compatibility layer. Concrete new entry shapes and
new tool argument schemas remain implementation designs within this contract.

## Agreed knowledge

:::mara goal GOAL-PERSISTENT-AUTONOMY
:mid: 01M3Q5PHV8M479QQTS9BFTRC1C
:title: Pursue a persistent objective with evidence and bounded autonomous continuation
:status: accepted

Let users explicitly enable sustained work toward an auditable objective, retain its state through Pi conversation lifecycle changes, and stop autonomous continuation honestly when complete, paused, blocked, aborted, or budget-limited. Goal does not execute or own work belonging to other extensions.
:::

:::mara requirement REQ-GOAL-CONTROLS
:mid: 01M3Q5PMXKW0GBF2NS995WM04N
:title: Provide explicit goal controls and always-available read-only inspection
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Maintain one current goal per conversation branch. Preserve /goal creation, status, waits, evidence, evidence reset, pause, resume, continue, clear, restart-policy, no-progress, and statusbar controls. Model-driven creation or replacement requires explicit user intent, not inference from an ordinary task. Use the reference replacement/reset confirmations, reject stale confirmations, and preserve terminal audit records. Expose get_goal as read-only in active, paused, complete, budget-limited, and unset states; absence of a goal is a valid inspection result. Restrict evidence mutation and completion to an active current goal. Pause and clear control only goal autonomy; they do not cancel jobs or clear producer gates.
:::

:::mara requirement REQ-GOAL-EVIDENCE
:mid: 01M3Q5PQVV9QPABKMS06G7PX0Q
:title: Require a bounded goal-bound evidence ledger and unblocked completion
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Every new goal starts with an empty evidence ledger. Require a nonempty checklist whose requirements are all verified with evidence before model-driven completion; also require confirmed-unblocked current-session gate state. Use goal identity and expected revision to reject stale or cross-goal mutations. Preserve reference operations to initialize/upsert requirements, add/remove evidence, and change requirement status; blocked requirements require a blocker, and verified requirements require evidence. Bound the ledger to 50 requirements, 20 evidence items per requirement, and 16 KiB serialized data. Store concise references and claims, not raw logs or file contents. A changed requirement invalidates its prior verification. Ledger claims are not automatic proof that referenced artifacts satisfy the objective; the completion prompt and goal-writer skill still require direct inspection. Do not add a dependency on Mara, Work, or a particular producer.
:::

:::mara requirement REQ-GOAL-BUDGETS
:mid: 01M3Q5PTVGBMJKBA2G7V23ESTH
:title: Enforce optional token and active wall-time budgets without controlling jobs
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Allow optional token and wall-time budgets together, with no budget invented when the user did not request one. Preserve reference command budget syntax and validation. Count wall time while active, including gate waits; exclude explicit pauses, terminal/budget-limited intervals, and process-offline gaps. Keep agent turn-processing time distinct from active wall time, checkpoint through Pi persistence, clamp clock rollback, and account for final-turn tokens even if completion occurred during that turn. Reaching either budget prevents further substantive autonomous goal continuation and records the limit honestly; it does not kill jobs or release gates. Request one concise progress/blocker summary only when normal idle, pending-message, and gate conditions allow; otherwise retain it for a natural model-visible turn, without bypassing gates or duplicating an acknowledged summary.
:::

:::mara requirement REQ-GOAL-CONTINUATION
:mid: 01M3Q5PXSTTJNGWETVTKC9QDA1
:title: Use Pi scheduling and generic gates for guarded continuation and explicit bypass
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Automatic continuation, normal goal start, and resume obey current-session generic gate state: pending or unconfirmed state is not permission to nudge. Queue normal follow-up only for an active eligible goal when Pi is idle, no messages or goal continuation are pending, and discovery/reconciliation confirms the session unblocked. Recheck after asynchronous boundaries and invalidate stale requests after goal, session, or relevant gate changes. Gate observations may cause eligibility reevaluation, but the protocol does not dispatch turns or carry producer-specific wake instructions; goal owns its normal continuation policy. For /goal continue only, retain an explicit interactive confirmation allowing one turn despite the displayed gates, without clearing them. Refuse stale confirmations or a non-interactive gate bypass. This particular user control is not a general approval system. Follow [[REQ-WORKFLOW-PRODUCER-INDEPENDENCE]] and [[REQ-GATES-SIGNAL-ONLY]].
:::

:::mara requirement REQ-GOAL-PAUSE-RECOVERY
:mid: 01M3Q5Q0NHBNH6XYYSX6MRNBMA
:title: Pause honestly for blocked work or user abort instead of repeatedly nudging
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Provide a model-accessible blocked/pause operation which records a concrete blocker and the input needed to proceed, then stops autonomous nudges until explicit /goal resume. Do not infer completion, clear gates, or stop jobs from this pause. A user abort of the current run while goal is active immediately pauses goal autonomy rather than being retried as a provider failure. Background-job execution and result delivery remain independent. Keep ordinary delivery/provider failures separate, bounded, diagnostic, and explicitly recoverable; do not endlessly generate new continuations after failure. Reuse Pi scheduling and retry facilities where applicable, and retain paused recovery if a resume request cannot be delivered.
:::

:::mara requirement REQ-GOAL-SESSION-STATE
:mid: 01M3Q5Q3K399ZS8P2J9GF7P5Z6
:title: Restore branch-local goal state through Pi without charging offline time
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Persist compact goal state, ledger, progress diagnostics, settings, and pending-summary information with Pi custom entries and restore from the selected branch. Default startup/reload restoration of an active goal to paused; retain configurable restore-idle (active without a startup turn) and resume (one eligible guarded continuation) policies. /tree restores selected branch state, while new/fork/session-resume paths follow their branch contents rather than blindly applying startup/reload behavior. Never reuse stale session-bound contexts or charge inactive/offline gaps as active time. No-session operation follows Pi in-memory resumability, without a new session system or post-exit persistence promise. Goal history does not transfer ownership of external jobs or gates.
:::

:::mara requirement REQ-GOAL-NO-PROGRESS
:mid: 01M3Q5Q6HY4TRSY3MYTJ9F5PYS
:title: Keep no-progress detection optional bounded and limited to owned synthetic turns
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Retain opt-in no-progress detection, disabled by default. Observe only goal-owned automatic synthetic continuation turns, not user turns, manual continue/resume, restart turns, or turns initiated by other producers. Preserve bounded deterministic fingerprints, a four-observation window, and a pause after three consecutive conservative repeated comparisons. A meaningful summary/tool-pattern change or evidence revision change resets the streak. Do not store assistant text, tool arguments/output, or file contents in this detector. It may pause, not complete or clear the goal or mutate gates. Explicit resume resets the streak while retaining bounded diagnostics; explicit reset clears its history.
:::

:::mara requirement REQ-GOAL-PRESENTATION
:mid: 01M3Q5Q9J6WQGB093A4B17XKBC
:title: Provide goal status and an evidence-oriented goal-writing skill
:status: accepted
:kind: functional
:contributes_to: GOAL-PERSISTENT-AUTONOMY

Show objective, lifecycle/waiting state, remaining budgets, evidence summary, progress diagnostics, restart policy, and current-session gate diagnostics through user controls. Publish optional structured status and a normal Pi footer fallback, without requiring the statusline extension. Turning statusbar publication off must not erase transcript history. Keep model tool output bounded with honest truncation and preserve the bounded evidence ledger for recovery. Package goal-writer with the six-part outcome, verification, constraints, boundaries, iteration, and blocked-stop contract; include budgets only when requested and name verification commands only after checking them. Use Pi rendering/scheduling facilities rather than parallel UI or turn machinery.
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

Exercise real Pi tool/command registration, explicit creation/replacement, every-state read-only inspection, active-only mutation, stale confirmations, and user pause/clear without external job/gate changes. Test all ledger operations, byte/count bounds, stale/cross-goal revisions, invalidated evidence, blocked requirements, and refusal of completion with pending or unconfirmed generic gates. Require a fully evidenced, confirmed-unblocked goal before completion. Verify status publication/fallback, bounded model output, and packaged goal-writer discovery and content. These are future checks, not passing evidence.
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

Use controlled clocks and actual Pi lifecycle/message scheduling with generic gate owners. Cover start/resume while gated, unknown versus confirmed-empty state, pending messages, duplicate/stale continuation races, and the explicit one-turn confirmed bypass without gate clearance. Measure wall time during gate waits versus explicit pauses and offline intervals; exercise combined limits, mid-turn expiry, final-turn token accounting, and deferred summary receipts. A model-blocked goal and a user-aborted run must remain paused until explicit resume, while independent job delivery still follows its own policy. Exercise bounded delivery failure recovery and opt-in repeated-synthetic detection without observing unrelated turns. No producer-name or jobs-core dependency is permitted. These tests have not run.
:::

:::mara verification VER-GOAL-STATE-AND-CLEAN-BREAK
:mid: 01M3Q5QN8XNAHCAKVX0FRAQFFT
:title: Verify new goal persistence and deliberate legacy-state isolation
:status: accepted
:method: test
:level: integration
:verifies: REQ-GOAL-SESSION-STATE
:verifies: REQ-GOAL-FRESH-STATE

Exercise real persistent/in-memory Pi sessions, branch navigation, session changes, forks, and each startup/reload policy without stale callbacks, duplicated turns, or offline budget charging. Seed legacy reference-format goal entries: the reworked extension must not activate/import them or alter those bytes. Create a new-format goal and verify restoration from its new namespace, preserving its ledger/settings and normal gate isolation. Malformed current records must not fabricate verified state. These are future checks, not executed migration evidence.
:::
