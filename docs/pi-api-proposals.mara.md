# Local drafts for Pi API additions

The user authorized **drafting**, not upstream submission, implementation, a Pi
upgrade, or campaign restart. The designs below are **draft proposals**:
names and signatures are illustrative, not APIs available in Pi 0.99.1 or
accepted upstream contracts. The user's subsequent scope decision is to implement
against current public Pi capabilities and omit unsupported features. None of these
four proposals is a campaign prerequisite, an instruction to build a host workaround,
or a reason to block otherwise supported extension functionality.

The basis is [[EVD-PI-0991-NATIVE-PROBES]] and the installed 0.99.1
`docs/extensions.md`, `docs/sdk.md`, `docs/models.md`,
`docs/session-format.md` and `docs/virtual-models.md`, plus the exported
extension, session-manager and model/auth declarations. The probes use a real
host with synthetic providers/loopback transports, not live service validation.
No upstream checkout or newer release has been evaluated. The later startup and
terminal-outcome drafts also use [[EVD-PI-0991-NONUI-PROBES]] and
[[EVD-PI-0991-TURN-END-PROBES]], plus current CLI/JSON/RPC documentation and public
extension/session declarations.

For terminal exit codes, the user subsequently dropped custom mapping where the
current public SDK does not support it; see [[REQ-PI-NONUI-AWAIT]]. Pi 0.99.1 exposes `shutdown(): void`,
`prompt(): Promise<void>` and boundary results containing entries/continuation,
not an extension exit-code or workflow-outcome setter. The inspected print/JSON
runner chooses its exit status and reports extension-handler errors separately;
the probes observed a boundary error followed by exit zero. An embedding SDK
application can choose its own process exit policy, but that is not an extension
API for changing Pi CLI or RPC behavior. Node/Bun process-global `exitCode` is not
that SDK API either; this increment neither tests nor adopts such a workaround.
These observations do not prove every runtime alternative impossible. They do
mean the conditional SDK-based mapping is not established on the selected host.

The separately accepted classifier policy is [[DES-GOAL-CLASSIFIER-POLICY]]:
explicit native `maxRetries: 0`, no extension retry loop, and a configurable
five-second whole-call deadline. It does not depend on these draft API names.

:::mara design DES-PI-EXTENSION-USAGE-API
:mid: 01M3S05BK1MGNKTQ7WKBDD09F7
:title: Propose a public session-scoped native usage writer for extensions
:status: draft
:kind: interface
:satisfies: REQ-GOAL-CLASSIFIERS
:satisfies: REQ-GOAL-BUDGETS
:satisfies: REQ-STATUSLINE-BUILTINS

## Problem and smallest proposed addition

Extensions can classify during commands or lifecycle handlers, without an assistant/tool result to carry usage. The probe observed no automatic usage entry for these calls. Pi already has native `UsageEntry` accounting and a full-SDK `SessionManager.appendUsage(kind, provider, model, usage, note?)`, but extensions receive a read-only session manager that deliberately excludes it.

Propose one narrow, session-scoped extension method, tentatively `ctx.recordUsage(report)`, that validates and appends the existing native usage entry through the host. Keep the session manager read-only. Do not add a second ledger, an accounting bus between packages, synthetic tool messages, or an automatically instrumented replacement ModelRegistry.

Illustrative input, **not executable against 0.99.1**:

```ts
// Proposed API. Exact naming/types remain for upstream review.
ctx.recordUsage({
  kind: 'goal:criteria-review',
  provider: result.provider,
  model: result.model,
  usage: normalizedKnownUsage, // Valid existing Pi Usage, not a blind cast.
  expectedLeafId: leafCapturedForThisAssessment,
});
```

The draft's minimum scope is reporting complete, attributable usage from a still-valid session/branch. This primitive alone is not a complete solution for late results or unknown accounting.

## Proposed semantics

- Bind to the context's session/runtime, not a mutable global current session. The caller supplies the captured leaf guard, including null for an empty tree. Reject a stale context or changed leaf without appending to another branch. No caller-selected session file, arbitrary historical parent, implicit branch navigation, or widening to general SessionManager writes.
- Append a native `type: "usage"` entry with the existing provider/model/kind/usage fields and an optional bounded note. Return the appended entry identity. It contributes to native accounting, remains outside model context, and neither starts a turn nor changes tools, goals, gates or authorization.
- Preserve native persistence semantics: a successful append is not fsync and setup-only entries may remain buffered until a user/assistant message exists. In-memory sessions remain usable. Document write failures and whether the outcome is definitely not recorded or ambiguous; never advise blind replay after ambiguity.
- Validate the report shape and numeric fields; preserve caller-supplied provider/model attribution without claiming to authenticate that attribution or audit billing. This first writer accepts a valid complete Pi Usage record. Do not convert unavailable pricing/usage into zero, copy the selected chat model over the classifier's identity, or manufacture cache counts merely to satisfy a type. The minimal classifier result shape and complete native Usage are not interchangeable.
- Accounting has exactly one owner for each call. Existing tool-result usage and codemode's classifier aggregation stay unchanged. Report a call either through its existing tool-result path or through this writer, not both. The minimal method is not a global deduplicator and does not detect a caller deliberately reporting the same work twice.
- Appending while idle must update native statistics and notify the host's normal accounting/UI refresh path without a fake message or assistant run. Whether that needs a small public usage-change event is an upstream API question, not an invented event available today.

## Deliberate limits and unresolved questions

1. **Late completion:** rejecting stale contexts/changed leaves is safe against misattribution but does not account a call that completes after reload, tree navigation or session replacement. Before using this for full goal conformance, choose a supported host mechanism for late usage, such as a narrowly scoped reporter bound before dispatch, or another explicit host-owned reconciliation path. Do not silently drop the cost, append it to the new branch, retain invalid contexts, or solve this with an extension-written session file.
2. **Incomplete usage/pricing:** the existing required numeric Usage shape cannot by itself represent every unknown/partial result. Decide how native accounting exposes incompleteness before claiming complete classifier totals. Rejection plus a visible caller warning is an honest limitation of the minimal writer, not complete accounting or a free call. No new partial-usage schema is selected here.
3. **Ambiguous writes/duplicates:** returned entry identity and caller bookkeeping cover an ordinary successful append. If recoverable idempotent reporting is required, agree on host-owned operation identity and retention rather than hiding an unbounded deduplication store in this proposal.
4. **Lifecycle and activity are separate:** recording usage is not proof that an operation is running or stopped. Caffeinate still consumes public activity or generic gates under [[REQ-CAFFEINATE-AUTO-HOLD]], and deadline expiration cannot release an unresolved activity obligation by itself.

These are blockers for this optional API proposal, not prerequisites for the current extension. Under the user's native-supported scope in [[REQ-GOAL-CLASSIFIERS]], omit unsupported attribution features with honest limitations rather than waiting for an upstream API or using private methods.

## Proposed upstream acceptance checks

Add failing public-API tests before implementation, reusing the existing offline probe approach:

- An idle command records one attributable native usage entry; native totals and active-branch consumers see it once, and no model-context message, tool result or automatic turn is created.
- A lifecycle-handler report follows the same path. Ordinary tool and codemode accounting is unchanged; fixtures demonstrate choosing only one reporting path.
- Reject malformed/non-finite/negative usage, stale contexts and mismatched leaf guards without a partial append or cross-session write.
- Empty/in-memory sessions and a persisted/reopened branch retain the expected native semantics. Fork/tree selection counts entries on the selected branch rather than abandoned histories.
- A delayed report after reload/switch/tree change demonstrates the documented rejection/late-accounting policy; it cannot disappear silently or be attached to the wrong active branch.
- Missing usage/pricing yields explicit incomplete/error behavior, not a fabricated zero total. Exercise the accepted representation once that open question is resolved.
- Test persistence failures and idle UI/accounting refresh without a live provider. Required late/partial/idempotency decisions must be resolved before calling the broader integration complete.

No such new API tests or implementation ran in this documentation increment; the prior probes establish the gap only.
:::

:::mara design DES-PI-REQUEST-IDENTITY-API
:mid: 01M3S05EPVPY8S2M0BJZGFEJZV
:title: Propose resolved request identity on pre-dispatch provider hooks
:status: draft
:kind: interface
:satisfies: REQ-FAST-ELIGIBILITY

## Problem and smallest proposed addition

At Pi 0.99.1's `before_provider_headers` and `before_provider_request` hooks, `ctx.model` can still be the selected virtual model. The payload may expose a model string but not its provider or actual authentication. The header hook ran first in the tested Responses path. Physical provider/API/model are exposed by stream events and assistant messages only after dispatch, too late to make a safe request mutation.

Propose adding a read-only, sanitized request descriptor to **both existing hooks**, bound to the physical request chosen by the native router. Preserve existing handler ordering, header mutation and payload-return contracts rather than adding another router or broker. Keep `ctx.model` as the user's selection.

Illustrative descriptor, **not an existing or final Pi type**:

```ts
type ProposedRequestIdentity = Readonly<{
  requestId: string;
  resolvedModel: Readonly<{ provider: string; api: string; id: string }>;
  authKind: 'api_key' | 'oauth' | 'none' | 'unknown';
}>;
// Proposed: event.request on before_provider_headers / before_provider_request.
```

`authKind` needs actual request-resolution provenance, not a guess from stored credentials. Current `AuthResult.auth` exposes request material rather than this classification, so simply copying the old provider auth-status check is insufficient. Unknown is a valid, conservative result.

## Proposed semantics

- Capture the resolved physical provider/API/model when preparing the request. Carry it to both hooks for that same logical prepared request; do not look it up again from mutable selection, rerun the router, or expose a live mutable model/catalog object.
- Use a non-secret correlation ID for overlapping prepared requests. A changed route or new prepared request gets a new ID. The ID is not a transport-attempt counter: lower-level HTTP retries may reuse a prepared request. It is neither a delivery receipt nor usage deduplication authority.
- Set the auth classification only when Pi can establish the effective mode for this request, including runtime key overrides and provider-specific resolution. Do not infer OAuth from a provider name, presence of a bearer string, stored OAuth credentials shadowed by a key, or a human-readable source label. Otherwise report unknown.
- Do not add tokens, credential objects, environment values, secret-bearing URLs, or full stored headers to the descriptor. Existing header hooks already have their own header access; this addition must not spread that material into general request diagnostics.
- Make the descriptor an additive hook field. Existing extensions may ignore it. Consumers feature-detect absence or unknown values and preserve unsupported/no-mutation behavior on older hosts. Optional typing/registration and exact names need upstream review; do not bump this repository's Pi pin or require consumer changes here.
- Model identity is the client's resolved target, not proof of the backend implementation behind an alias/proxy. Nor is it proof of fast-service capability, entitlement, price or support. [[REQ-FAST-ELIGIBILITY]] still applies its independently verified API/model/authentication conditions and explicit allowlist.
- A read-only descriptor is context for trusted extension hooks, not an authorization mechanism. Providers that omit the required instrumentation cannot be advertised as covered.

## Critical ordering limitation

Adding metadata does not by itself guarantee the final wire request: a later extension can transform opaque payload/header data. The draft deliberately calls the field `resolvedModel`, not `guaranteedWireModel`. A request hook can compare a supported payload's model field, but a header hook cannot validate a future payload transformation.

Upstream must document the point at which identity/authentication is authoritative and what happens if a later transformation redirects or changes authentication. Either preserve/revalidate that invariant at the send boundary, or explicitly mark such paths outside the guarantee. If current hook ordering cannot supply the proof needed for a compatible whole request, a final request-preparation stage would be a separate design discussion, not a hidden part of this small metadata addition. Fast-mode must remain unsupported wherever the required proof is absent; this proposal alone does not establish routed fast-mode safety.

## Proposed upstream acceptance checks

Use deterministic virtual routers and real provider implementations against isolated loopback servers; no paid inference is needed:

- With a virtual selection, both pre-dispatch hooks observe the physical descriptor and matching request ID while `ctx.model` stays virtual. Capture the server request to confirm the tested resolved target.
- Cover two concurrent requests and a selection change while one is pending; identities must not bleed between them. Re-routing prepares a fresh descriptor; unchanged transport retries follow the documented correlation semantics.
- Exercise API-key and synthetic OAuth resolution, a runtime key shadowing stored OAuth, opaque/custom auth and authentication failure. Classification must match effective provenance or remain unknown, with no secret copied into metadata.
- Cover the supported Responses, Codex Responses and Anthropic header/payload paths separately; do not extrapolate the existing Responses probe to every transport. Declare coverage of compaction/cache-warming/direct calls explicitly rather than assuming every operation uses identical hook plumbing.
- A later hook changes a model/authentication-related field: demonstrate invariant enforcement or an explicit unsupported/unknown outcome. Observing the original descriptor is not a pass for final-wire identity.
- Legacy handlers still work and leave other fields/headers intact; an older host with no descriptor leaves the consumer conservatively unsupported. Header/payload handler errors, aborts and pre-dispatch failures retain native semantics.
- Assert diagnostics contain only the sanitized descriptor, not credentials, environment or copied headers.

No new hook fields, provider capability claims or upstream tests are implemented here. [[EVD-PI-0991-NATIVE-PROBES]] remains the evidence for current behavior; this is only a candidate contract for review.
:::

:::mara design DES-PI-STARTUP-INPUT-API
:mid: 01M3S6K3XF4WY8KQRD9NRFPB3F
:title: Propose host-owned preparation and dispatch of extension startup input
:status: draft
:kind: interface
:satisfies: REQ-GOAL-CLI-STARTUP

## Problem and smallest proposed host change

A registered string flag does not itself provide an initial prompt. The 0.99.1 probes showed that sending startup work without awaiting it can race print/JSON disposal, while awaiting it inside session_start can finish before JSON forwarding is attached. With an actual first prompt, native input transformation worked. None of those observations proves the full --goal startup contract.

First evaluate correcting existing host ordering and awaiting: attach native output/event consumers before startup work can run, and account for extension-requested startup work before a one-shot host decides it has nothing to await. Prefer that smaller change where it supplies the complete contract. If extensions still cannot safely inspect/augment the normalized first input or supply one when absent, propose one startup-input preparation hook, tentatively `startup_input`. This name and hook do not exist in the inspected SDK.

The hook receives only the native normalized initial input (including an explicit absent-input case), the selected session context and a host-bound invocation identity. It can leave that input unchanged, supply/augment the initial prompt with goal context, or reject initialization with a bounded reason. The host, not the extension, owns dispatch and awaiting. Exact types and whether an existing API can provide the same contract remain open; this is not a second prompt queue or scheduler.

## Proposed semantics

- Run once for initial invocation preparation, after required session restoration and before its first dispatch, with JSON/RPC event consumers ready. Do not rerun on reload, new/switch/resume inside the process, fork or tree navigation. SDK binding alone must not unexpectedly start inference; an embedding host explicitly opts into startup preparation/dispatch.
- Preserve native positional/piped/file/image handling and any remaining prompt ordering. With explicit --goal intent, preserve the actual first supplied message together with the active goal context rather than discarding it or launching duplicate initial work. With no initial input, allow one host-dispatched goal-start prompt. Expose normalized input, not raw argv, credentials or unrelated settings.
- Keep --goal registration and values under the existing native flag API. Help/version/resource-only loading must not dispatch work. An absent/disabled extension cannot claim its flag created a goal. No provider/model activation, tool re-enabling or gate/budget bypass.
- The goal extension validates objective and existing-goal conflicts before claiming successful creation/start. Normal criteria review and evidence rules still govern substantive work. A preparation rejection must be observable without a successful-run claim or silently replacing/resuming an existing goal.
- The host awaits the actual scheduled startup run through normal native settlement. All native run/message/tool/settlement events must reach the ordinary JSON/RPC consumers; do not replay buffered synthetic event copies from the extension. Print retains its native output path. If other work is already queued, preserve native ordering and avoid duplicate startup.
- Provide a public cancellation/lifecycle boundary for preparation itself; do not reuse a stale context or infer cancellation from elapsed time. Later awaited work uses ordinary supported run integration. [[EVD-PI-0991-TURN-END-PROBES]] supplies a candidate for some waits, not a guarantee for all final-settlement races.
- This hook supplies initial-invocation preparation only. [[REQ-GOAL-CONTROLS]] makes ordinary messages part of the current active goal's conversation without a later chat-attachment mechanism. Startup identity is not a cross-session goal registry, ownership of external work, or authorization created by a goal label.

## Open decisions and acceptance checks

Define ordering with existing session_start handlers and restore/resume policies, composition/conflict handling between multiple startup contributors, cancellation before dispatch, and state reporting if preparation fails after an extension appended its own state. Do not promise transactional rollback of unrelated extension writes. A startup request accepted into a queue is not proof that the run completed.

Use offline real-mode regressions for no-input --goal, an existing first prompt, piped text, attachments, multiple inputs, help-only loading, rejected/conflicting goals, disabled extensions, startup failures, cancellation and lifecycle changes. Assert one intended run, preserved input, ordinary JSON/RPC event framing, complete event visibility and no premature disposal. Include explicit SDK-host opt-in versus ordinary binding. Reuse native persistence semantics; do not introduce file-existence admission or a second session store.

This is a local draft, not a new host hook, implemented startup feature, or authorization to upgrade Pi. The earlier probes did not execute these proposed acceptance checks against a modified host.
:::

:::mara design DES-PI-RUN-OUTCOME-API
:mid: 01M3S6K71MSB2PXZTG9VXBFDT3
:title: Propose explicit native terminal run outcomes with host-owned exit mapping
:status: draft
:kind: interface
:satisfies: REQ-PI-NONUI-AWAIT

## Problem and conditional scope

Pi 0.99.1 exposes low-level activity outcomes and notification-only agent_settled, but the inspected extension surface has no workflow-outcome/exit-code setter. Boundary results contain entries and continue, while prompt() returns Promise<void>. The non-UI probe's boundary exception produced stderr diagnostics and exit zero. Those signals are not sufficient to distinguish a completed workflow from a paused or otherwise unfinished one.

The user favors nonzero print/JSON exit for unfinished/error outcomes **only when a small, supported SDK integration permits it**. This proposal explores a minimal native facility rather than treating the behavior as mandatory on 0.99.1. Caller-owned SDK applications can already choose their process exit policy; extensions must not assume that authority over arbitrary hosts. Process-global exitCode manipulation is not the proposed SDK contract and has not been selected or tested here.

## Smallest candidate interface

Allow a trusted extension to contribute a bounded, run-scoped terminal report at the native finalization boundary, and expose the finalized host result through native SDK/JSON/RPC run-completion reporting. Prefer an additive result field on an existing actionable boundary if it can supply the guarantees below; an illustrative name is `terminalReport`, not an available BoundaryResult member.

A candidate report distinguishes completed from incomplete, with an explicit incomplete reason such as paused, blocked/needs-input, budget-limited, aborted or workflow error, plus an optional bounded diagnostic. Exact enums, field names and transport shape are not fixed. Do not copy a workflow error into a fake assistant/provider stopReason, or change prompt()'s return type without a separate compatibility decision.

The host performs mode-specific mapping after real settlement and cleanup. Extensions report their own established workflow state; they do not directly terminate the process, choose arbitrary OS exit codes, mutate another session's outcome, or install a replacement RPC/CLI wrapper.

## Proposed semantics

- Bind reports to the actual session/run and current finalization attempt. Reject stale reports after reload/session replacement and do not associate them using a reusable turn index or the latest selected goal alone. Native queue/continuation activity can invalidate a provisional terminal report; do not publish it as final while work remains.
- A report neither schedules another model call nor skips pending native work, required delivery, gate checks or cleanup. Keep agent_settled notification-only. Expose the final result in a correlated public completion event/result readable by SDK consumers without inspecting private fields or parsing assistant prose.
- Combine native abort/error information and participating extension reports conservatively. A completed report must not erase a known incomplete/error outcome. Keep bounded source/reason details when several reports disagree; aggregation and handler-failure rules require explicit upstream definition rather than last-writer-wins success.
- Report completion of execution/workflow obligations, not a semantic verdict on task quality. A completed review may contain findings. A failed test process can be valid evidence within a still-running diagnostic task; it must not automatically decide the enclosing task's outcome. Classifiers do not establish successful delivery, gate clearance or verified completion.
- For a supported print/JSON host, prefer zero for completed invocation and nonzero plus a distinct reason for incomplete/error termination, while retaining native signal/cleanup behavior. Choose exact code assignments, multi-prompt aggregation and legacy compatibility explicitly. Ordinary text mode must not gain a second JSON stream; JSON stdout remains native protocol records and diagnostics stay off it.
- RPC/SDK expose the outcome without automatically shutting down their long-lived host. Startup rejection before an agent run needs a corresponding invocation-level failure path under [[DES-PI-STARTUP-INPUT-API]], not a fabricated settled agent run.
- Absence of this feature on an older host leaves the conditional exit mapping unavailable. Preserve truthful workflow state/diagnostics and disclose that exit zero is not a workflow-completion guarantee; do not weaken awaited-work protection or silently substitute a new scheduler, host fork or forced exit.

## Open decisions and acceptance checks

Finalize the native run/invocation correlation, terminal-report composition, rejection of stale contexts, treatment of finalization-handler failures, output shape, exact codes and compatibility before implementation. A report from a trusted extension is not a host-authenticated proof of all external work; define the covered scope and unavailable/unknown cases honestly. Do not add another durable workflow ledger or global extension accounting/coordination bus.

Use controlled providers and real print/JSON/RPC plus SDK hosts. Cover completed execution (including reviews with findings), explicit paused/blocked/budget-limited states, aborts, workflow/native errors, mixed reports, boundary failures, multiple prompts, continuation after a provisional report, stale reports and startup rejection. Assert no false success, no premature settlement, intact output framing and cleanup, and no unwanted RPC/SDK process exit. Feature absence must follow the documented limitation rather than a private-field or process-termination workaround.

No outcome setter, event field or exit mapping is implemented or tested here. This draft does not make unsupported exit control a new prerequisite by itself, authorize a dependency upgrade, or replace the user's minimal-effort condition.
:::
