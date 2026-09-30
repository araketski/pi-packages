# Local drafts for two Pi API additions

The user authorized **drafting**, not upstream submission, implementation, a Pi
upgrade, or campaign restart. The two designs below are **draft proposals**:
names and signatures are illustrative, not APIs available in Pi 0.99.1 or
accepted upstream contracts.

The basis is [[EVD-PI-0991-NATIVE-PROBES]] and the installed 0.99.1
`docs/extensions.md`, `docs/sdk.md`, `docs/models.md`,
`docs/session-format.md` and `docs/virtual-models.md`, plus the exported
extension, session-manager and model/auth declarations. The probes use a real
host with synthetic providers/loopback transports, not live service validation.
No upstream checkout or newer release has been evaluated.

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

These are explicit draft blockers, not permission to weaken [[REQ-GOAL-CLASSIFIERS]] or use private methods until an upstream API exists.

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
