:::mara design DES-JOBS-INTERFACE-CHECKPOINT
:mid: 01M458PF2WY9FPGDQ7JKPGKMM5
:title: Define the minimal shared jobs participant and delivery coordination seam
:status: accepted
:kind: interface
:satisfies: REQ-JOBS-PRODUCER-IDENTITY
:satisfies: REQ-JOBS-VERSION-DIAGNOSTICS
:satisfies: REQ-JOBS-COMPLETION-INBOX
:satisfies: REQ-WORKFLOW-PRODUCER-INDEPENDENCE
:depends_on: DES-JOBS-PACKAGE-BOUNDARY

## Checkpoint versus later runtime

This checkpoint supplies exported envelopes and minimal participant discovery/contract metadata behavior, not execution, lifecycle reconciliation, quota accounting, storage persistence, owner control routing or concrete Pi delivery. Read [the delivery contract](./delivery.mara.md) and [the Pi 0.99.1 reconciliation](../../../docs/pi-0991-reconciliation.mara.md#nested-tools-and-delivery). Full delivery implementation and VER-JOBS-DELIVERY belong to Work item `34f4436cc1b5436e86b7a083abc1b9f8`; it is not started here. Narrow test fixtures do not prove local/Herdr or goal/caffeinate runtime integration.

## Identity and authority

JobIdentity separates runtimeId (this Pi process/runtime incarnation), ownerId (participant routing identity), sessionId (native originating Pi session), jobId (owner/session-local stable execution identity), and producerId (opaque originating extension/API consumer identity). ResultIdentity adds a stable resultId; retries reuse it rather than restarting execution. Use the complete identity for correlation, including producer identity preservation. Identity fields are nonempty bounded strings, not backend names or process IDs. Diagnostic reasons are nonempty text, not identities: preserve surrounding whitespace, newlines and long backend error details rather than applying the identity bound. Unknown conforming producers participate without a whitelist.

ControlAuthority is a distinct owner-held runtime/owner/generation assertion. It is not a credential or a grant from a job snapshot, producer label, capability hint, historical entry, fork or observer registration. Concrete owners/adapters must validate possession/current generation and backend ownership before acting. Observation capabilities describe supported operations, not authorization. JobOwnerPort has separate inspect/output/result/wait/stop/setAwaiting/setDelivery requests; it is not a tool broker or action-dispatch model tool. Wait cancellation cancels only the wait; a successful stop request means requested, not confirmed termination. Generic consumers use these ports/capabilities, never backend/producer branches.

ExecutionState keeps running, terminal-with-observed-outcome and unknown-with-reason distinct. DeliveryState independently keeps pending, unknown, delivered-with-receipt or display-only/not-required. A terminal execution need not be delivered; an unknown execution must not acquire a fabricated exit code. A launch failure is an outcome distinct from process exit. Awaiting and managed/persistent lifetime are independent. OutputWindow reports its retained content/reference/completeness/loss. ExecutionAdapter owns opaque handles, backend input and evidence; JobStore owns admission reservations/atomic writes and ResultSink owns stable saved final results. Those interfaces are obligations for later implementations, not functioning stores or executors.

## Library-owned participant metadata

The user selected `0.1.0` as the first jobs-contract release stamp for this checkpoint. JOBS_CONTRACT_VERSION is hardcoded, independent of manifest/Nx version changes. A different first shipping version requires an explicit release-preparation correction; no release is claimed. Compare exact marker equality, not ranges/order. The stable participant channel is not version-partitioned, so incompatible copies remain discoverable and can warn. Metadata is created by the imported library; callers supply only runtimeId/participantId/role, not release or contract versions.

createJobsParticipant receives an explicit shared event bus (public pi.events can satisfy it). start registers discovery, announces metadata and requests already-published owner snapshots; close removes its subscription. Owners publish validated originating-session snapshots; observers cannot publish them and never deliver/wake/control by registration. Reported snapshots are assertions, not independently verified liveness or control authority. Missing snapshots/owners mean unconfirmed state, not confirmed empty. Mismatched/missing markers produce identity/revision diagnostics, never overwrite accepted job snapshots or clear work. Malformed snapshots, including sparse job arrays, are rejected without JSON scalar coercion: a boxed number is not an observed numeric exit code and cannot replace accepted unknown state. Matching metadata is not proof of same-release end-to-end support. The trusted in-process bus is not an adversarial authentication boundary; this seam adds no cross-process service.

## Shared completion coordination contract

CompletionCoordinator is an explicitly supplied SINGLE runtime arbitration service, shared by all participating owners and independently loaded core copies. There is no package singleton, implicit service creation or per-producer coordinator. The later delivery integration owns runtime composition, registration/reload handoff and verifies that all owners use the same service. Operations are linearizable per SessionScope (runtimeId plus originating sessionId). An unavailable/missing arbiter is unknown, not permission to wake independently. This is completion-delivery arbitration, not scheduling executions or managing agents.

Enqueue keeps stable final-result identity and mode. Inspect and selected capture do not consume results. reserveWake atomically checks eligibility/pending automatic results and reserves the sole pending wake BEFORE submitting anything to Pi. It returns reserved/already-pending/ineligible/unknown. Working, inactive, resume-deferred and unknown sessions cannot reserve an automatic wake. Next-natural-turn/display-only results alone cannot reserve one either. Concurrent arrivals join the inbox without additional wakes. The token includes its runtime/session/requester identity; a different owner cannot release another reservation by merely guessing an ID.

Queued/starting/unconfirmed wake disposition is not delivery and retains arbitration until an actionable boundary reconciles it. Definite submission failure leaves results pending and permits guarded retry. capture freezes only the selected eligible results; later arrivals remain pending. Recheck receipt state before actually sending a captured batch. confirm consumes only selected saved results for which the trusted host established a matching model-visible final-result receipt. finishWake clears the matching reservation at an actionable idle boundary, then rechecks pending/eligibility before another reservation. Results already pending on session resume wait for the next user message. Observers and gates never reserve a competing wake. Concrete service behavior, five-job races, queue suppression, recovery and native scheduling proof are deferred to the delivery item.

## Pi host and native receipt seam

JobsPiHost is a narrow integration port, not a claim that its methods exist directly on ExtensionAPI. The delivery layer maps appendReference to compact custom entries, eligibility to fresh session/lifecycle/queue facts and submitWake/recordResults to supported public Pi operations. Append/queue admission is not fsync or a receipt. No private fields, new host API, custom exit-code mapping or forced host upgrade is assumed.

FinalResultReceipt binds stable result/job identity, originating session, native record entry identity/kind and exact final-content digest. Only the trusted delivery integration creates one after checking a finalized recorded model-visible message/tool result. It is not a consumer-supplied authorization token. Native structuredContent, a nested tool_result, a resolved nested call and nestedCalls metadata are NOT receipts. Direct results still need finalized-record inspection, including hook transformations. For an outer composition, merely returning a job ID or filtering/discarding final content leaves delivery pending. Do not scan arbitrary output for IDs or guess visibility. Explicit forwarding can be counted only when the finalized outer record has an identifiable complete final result; otherwise preserve pending/unknown and retry saved results through the supported owner message path, never replay execution. This checkpoint defines the boundary, not that complete receipt verifier.

Tools remain in their consumer packages. Use exact `bash` for replacement with jobs namespace; use globally unique `jobs_*`, `goal_*`, `herdr_*` names plus native namespace metadata for atomic operations. Namespaces do not qualify registration keys. Use enabled public native tool_search for deferred discovery, otherwise direct exposure without enabling built-ins or changing settings. Explicit excludeTools/CLI exclusion is denial; active/default-tool selection alone is not authorization or denial for nested calls. Public SDK/native CLI fixtures must establish these seams before schemas freeze. Full actual tool registration, UI and mode-specific workflow conformance remain consumer work.
:::

:::mara verification VER-JOBS-INTERFACE-CHECKPOINT
:mid: 01M459DGPMTZFMX9Z72PF1SAQ6
:title: Verify the minimal jobs public contract and native Pi seams without claiming a runtime
:status: accepted
:method: test
:level: integration
:verifies: DES-JOBS-INTERFACE-CHECKPOINT
:verifies: REQ-JOBS-PRODUCER-IDENTITY
:verifies: REQ-JOBS-VERSION-DIAGNOSTICS

Run the resolved jobs-core test/build/typecheck/strict-lint/source-check targets. Participant tests must observe red failures before implementation, then exercise independent compiled copies over an explicitly supplied bus, previously unknown opaque producers, library-owned exact contract metadata and both directions of a late marker mismatch. Missing metadata is unknown, not a match. Malformed records, wrong owner/session/runtime identities, scalar coercion, invalid outcomes/receipts and unreadable revisions must not replace valid job assertions. Observers cannot publish owner snapshots, acquire execution authority, wake or deliver merely by registration. Missing snapshots do not prove empty work. Test explicit fixture isolation and subscription cleanup.

Rebuild and pack actual selected library files; check the explicit fresh archive with pi-check-package and strict declaration/runtime consumers installed independently with npm and pnpm. Inspect archive contents and real paths, import the root and ./testing, reject unsupported source subpaths, test independent loaded copies and opaque identity preservation. A disposable package manifest bump must not change the contract stamp or compiled library bytes. These tests are contract/installed-library evidence, not real persistence, output/quota enforcement, managed processes or consumer workflow integration.

Run credential-free network-isolated public Pi 0.99.1 SDK fixtures and native print/JSON/RPC/interactive CLI fixtures with bounded process deadlines. Exercise representative jobs__, goal__ and herdr_* atomic registrations with matching suffixes and namespace metadata, exact directly available bash replacement, enabled deferred native discovery/composition, absent/disabled/inactive discovery with direct exposure and explicit exact exclusion blocking both direct and nested execution. Never activate built-ins or rewrite real user settings to pass a fixture. Include SDK built-in resource setup explicitly. Public pi.events must carry independent loaded core participants without a package singleton or model-directed side effects.

Inspect finalized transcript/provider context for direct results and native nested discarded/filtered/explicitly forwarded final-result fixtures. Require the complete chosen final content, not only codemode's header, bounded call metadata or inner tool events. Schema failures must prevent execution; typed inner errors remain errors even if an outer script chooses to return their data successfully. These host fixtures establish the public native seam and negative receipt boundary, not a generic script receipt verifier or concrete jobs/goal/Herdr tools. The shared CompletionCoordinator/JobsPiHost types establish later implementation obligations; full five-job wake/retrieval/recovery and recorded-receipt arbitration remain VER-JOBS-DELIVERY in the dependency-blocked delivery item. Record actual revision/artifact evidence and unsupported cases in Work; no source test alone proves a fresh installed artifact or full native workflow.
:::
