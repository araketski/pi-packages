# Advisor behavioral scenarios

These flows express intended behavior, not completed executions. Exact repository
fixtures remain to be prepared without changing these outcomes.

:::mara scenario SCN-ADVISOR-CSV-RETRY
:mid: 01M4E8JM60S5JCF8S2G5YT0XMH
:title: Fix a CSV export bug without adopting an unagreed retry guarantee
:status: accepted
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

**Start:** An ordinary task says “Fix the CSV export bug described in this issue.” The repository fixture supplies an existing export contract, the defect, and a review suggestion to add automatic retries without an agreed retry guarantee. The task does not mention advisor, judgments, classification, or delegation.

**Flow:** The agent gathers the applicable agreement and forms concrete proposals. Before adopting substantive proposals into its plan, code, or acceptance conditions, it submits the proposal and source-backed evidence. It distinguishes the required bug fix from the unagreed retry guarantee and applies the result disposition.

**Observable outcome:** The trace contains timely delegation and evidence-based handling, no silent retry guarantee, and completion of unaffected fix work. Unchanged proposals/evidence are not reclassified.

Source: the CSV-fix/retry example included in the user's selected “Repeated ordinary-task traces” acceptance option. Exact issue and fixture code remain to be authored.
:::

:::mara scenario SCN-ADVISOR-IN-SCOPE
:mid: 01M4E8JM6B4D8Q00NCFDP43PSW
:title: Delegate an in-scope substantive implementation proposal
:status: accepted
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

**Start:** An ordinary coding task has a substantive proposal backed by an explicit commitment or a concrete necessity argument under supported conditions. The prompt contains no advisor or classification reminder.

**Flow:** Although the agent believes the proposal is in scope, it delegates before adoption with the relevant evidence. It uses the within-agreement result as the default and continues the authorized work.

**Observable outcome:** The trace shows pre-adoption delegation, the source-backed necessity or explicit commitment, and continuation within existing authority. A usable result is neither silently ignored nor represented as proof of correctness. No duplicate call is made for unchanged proposal/evidence.

Source: the in-scope substantive case in the user's selected repeated-task acceptance option. Exact task remains a fixture-design choice.
:::

:::mara scenario SCN-ADVISOR-MECHANICAL
:mid: 01M4E8JM6P1E6VZDHE4N3EFBZ2
:title: Complete mechanical work without a scope classification
:status: accepted
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

**Start:** A purely mechanical task contains no substantive proposal. The prompt does not mention advisor or judgments.

**Flow:** The agent performs the task without invoking the new-obligation classifier.

**Observable outcome:** The requested work is completed with zero classifier calls for this decision. Routine steps covered by a previously checked proposal likewise do not create fresh decision points without relevant change.

Source: the mechanical negative case and exclusions in the user's selected trigger and repeated-task acceptance options. Exact mechanical task remains to be selected.
:::

:::mara scenario SCN-ADVISOR-CLASSIFIER-FAILURE
:mid: 01M4E8JM6Z3R014GDC8S2HNV55
:title: Handle failed delegation without inventing scope authority
:status: accepted
:contributes_to: GOAL-ADVISOR-TIMELY-DELEGATION

**Start:** The agent reaches a substantive proposal with materially uncertain scope, but classification is unavailable or unusable.

**Flow:** It reports the failed delegation and reasons conservatively from the available agreement. It asks for a material missing decision when necessary and continues unaffected work.

**Observable outcome:** The agent does not claim a successful classifier check or adopt the uncertain addition. Classifier availability does not silently change the scope boundary.

Source: the user's conservative-fallback choice and acceptance option requiring a classifier-failure check.
:::
