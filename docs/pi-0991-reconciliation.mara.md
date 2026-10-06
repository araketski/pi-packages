# Pi 0.99.1 capability reconciliation

Pi 0.99.1 is the agreed development baseline. Source inspection, completed baseline
checks, and limited classifier evaluation below are distinct from full workflow
runtime verification. Delivery status and routine review/check receipts belong in Work.
The release-time verification policy remains [[REQ-PI-RELEASE-COMPAT]].

## Current implementation scope after user simplification

Implement against available public Pi capabilities. When Pi does not support a
feature, omit it and document the limitation rather than adding a workaround,
mandatory host upgrade, or dependency on the local API drafts. In particular,
[[REQ-PI-NONUI-AWAIT]] no longer requires custom exit-code mapping on Pi 0.99.1,
and [[REQ-GOAL-CLI-STARTUP]] is limited to demonstrably supported mode/input cases.
This is scope reduction, not permission to claim an omitted capability works or
weaken ownership, result receipts, or truthful completion in supported modes.

[[REQ-GOAL-CLASSIFIERS]] uses native available classifiers by default and supplies
needed context, including code/diff/test excerpts, without an added approval or
excerpt-sharing opt-in. The extension has a classifier-disable configuration flag.
Fallback conditions are unavailable or disabled classifiers, not cost or privacy
admission policies. [[DES-GOAL-CLASSIFIER-POLICY]] no longer requires monetary caps,
spending reservations, or price-based admission. Preserve supported native usage
reporting without making missing accounting an execution gate. Optional explicitly
configured whole-goal token/wall-time limits are separate and remain opt-in.
Earlier budget choices, conditional API proposals, and probe findings below are
historical context, not contradictory current requirements.

[[ADR-WORKFLOW-MINIMAL-PROFILE]] now narrows future acceptance for the whole
remaining workflow: normal supported native paths plus focused errors and safety
checks, not exhaustive mode/producer/fault products or new calibration/recovery
machinery. Goal uses one bounded supplied-context assessment, not a multi-batch
artifact assembler. Historical host probes and synthetic data below remain
unchanged and do not prove this revised plan works.

## Fast-mode compatibility observations

The user explicitly requested usable fast mode after encountering the no-op
warning. [[REQ-FAST-ELIGIBILITY]] and [[DES-FAST-REQUEST]] now restore the existing
direct-selection compatibility path, with exact model IDs, configured OAuth and
payload-shape checks. This is not immutable physical request identity. Virtual
routes remain unsupported, and nested/same-ID auth races retain explicit
limitations rather than silently disabling all direct use.

Positive SDK 0.99.1 loopback requests and isolated installed CLI 0.99.2 print-mode
requests now verify Claude fast speed/betas and OpenAI/OAuth Codex priority on
the wire. Off mode, authored fields and the Completions-to-Responses mismatch
regression remain covered. Independent review exposed an early Claude beta
header override suppressing Pi-generated catalog flags. A red/green regression
now uses a real catalog model with high reasoning; the fix merges the fast beta
into the native payload list after Pi generates its defaults, preserving effort,
thinking-binding and OAuth betas. The SDK serializes this list into the HTTP
header; the extension no longer registers a header-only mutation handler.
No live service acceptance or speedup is claimed.
Work item `w-4d6781fd` records execution/check evidence.

The user subsequently reported that `openai/gpt-6.1-sol` was still excluded.
That exact ID is now explicitly allowlisted for OpenAI Responses and OAuth Codex
Responses. Positive source/fresh-packed SDK and installed CLI loopback checks
verify priority transmission on both APIs, with off/authored-value/OAuth guards.
This is not inferred family-wide support or live service entitlement/speedup.
Work item `w-f2547453` records this follow-up.

## Inspection provenance

Compared the installed 0.99.1 documentation and its 0.99.0/0.99.1 changelog entries
with the repository's 0.87.1 assumptions. Inspected the published
[@earendil-works/pi-coding-agent 0.99.1 archive](https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-0.99.1.tgz),
including `dist/core/extensions/types.d.ts`, `agent-session.d.ts`,
`session-manager.js`, and `tools/bash.js`, against installed 0.87.1 counterparts.
Archive SHA-256: `6686592adaea19092c85c94f5d40323dbf3db141e90eb3ede9e9e87302abdd1d`.
The SDK's `examples/sdk/14-codemode-mcp.ts` documents explicit native-extension
setup; SDK sessions do not automatically inherit the CLI's built-ins.

The inspected delta does not supply durable managed background jobs, a shared
owner/observer gate contract, a Herdr execution backend, goal evidence policy,
or OS inhibition. Those gaps alone did not establish package boundaries. After
the native-first review, the user explicitly reconfirmed independently installable
local jobs, Herdr, goal, caffeinate and gates-inspection extensions, with only
necessary execution lifecycle/ownership/storage/delivery shared between local and
Herdr execution; see [[DES-JOBS-PACKAGE-BOUNDARY]]. Pi retains tool discovery,
composition and agent scheduling. Producer independence still applies. Concrete
interfaces and proof mechanisms require implementation-time verification.

## Native capabilities to reuse

- Use built-in codemode, tool search, and MCP rather than adding a competing
  JavaScript/tool broker or MCP client. Project Mara/Work MCP is development
  configuration, not a dependency of published workflow packages.
- Custom tools can declare `outputSchema`, return `structuredContent` and
  `isError`, and specify exposure, namespace, and capability annotations. Native
  `ctx.executeTool()` handles validation, hooks, cancellation, and nested events.
  Annotations are unverified hints, not ownership proof or an approval framework.
  [[REQ-PI-ATOMIC-TOOLS]] now requires single-purpose namespaced operations across
  repository packages, replacing the old one-jobs-tool decision. Managed bash
  stays directly available as the native replacement; other tools use enabled
  native discovery or direct fallback without re-enabling disabled tools or
  rewriting settings. The limited native probes below establish useful host
  registration/disablement behavior, not complete package conformance.
- Preserve native sessions, custom entries/messages, queueing, actionable
  `turn_end`/`agent_before_settle`, and notification-only `agent_settled`. Do not
  equate low-level `agent_end`, queue acceptance, or RPC prompt disposition with
  final delivery or settled inactivity. These lifecycle boundaries are not all
  new in 0.99.1; their existing semantics still govern integration behavior.
- Use Pi UI components and active theme callbacks. The new default `system`
  palette can change at runtime; avoid permanently cached ANSI colors. Existing
  `theme.fg()`/`bg()` remain supported alongside `style()`, colors, and appearance.
- Native classifiers are now an agreed first-class capability for goal supervision
  and ledger review; see [[REQ-GOAL-CLASSIFIERS]], [[REQ-GOAL-NO-PROGRESS]], and
  [[REQ-GOAL-EVIDENCE]]. The user approved classifier-first behavior with visible
  fallback, not a mandatory new provider. Extensions can call
  `ctx.modelRegistry.classify()` without codemode. Inspection of Pi 0.99.1
  `docs/models.md`, `docs/llama-cpp.md`, `docs/virtual-models.md`, and
  `examples/extensions/jev-router.ts` establishes the API, not assessment quality.
  Subsequent [[EVD-GOAL-CLASSIFIER-PILOT]] records 100 authorized synthetic calls;
  [[DES-GOAL-CLASSIFIER-POLICY]] records the agreed provisional profile and limits.
  Actual goal integration and calibrated production accuracy remain unverified.
- Support configured native virtual models; do not build a separate routing
  extension. The statusline will show selected versus observed actual model, and
  routed fast-mode remains unsupported without actual request identity.
  Direct fast mode follows the restored compatibility scope above. Image-generation features remain unselected.
  Count all Pi-attributed active-branch usage in the statusline and relevant goal
  budgets without counting nested/aggregate usage twice. Do not classify command lifetime, ownership, or
  delivery receipts from semantic model judgments.

## Nested tools and delivery

`ctx.executeTool()` calls carry `parentToolCallId` and emit tool events, but do not
produce their own transcript tool result. Pi keeps bounded `nestedCalls` metadata,
not the nested result content. Codemode can discard a nested result entirely.
Consequently neither `tool_result`, a resolved nested call, `structuredContent`,
nor an outer tool result containing only call metadata is a delivery receipt.
[[REQ-JOBS-DELIVERY-RECEIPTS]] still requires a recorded model-visible final result.
Do not infer visibility by searching arbitrary output text for a job ID.

C1/C4 and J2 must define and test the receipt path through the native tool pipeline,
including discarded, filtered, and explicitly forwarded results. If visibility
cannot be established, keep delivery pending and use the existing stable-result
retry policy, not execution replay. This clarification does not require an
assistant acknowledgement, a new routing service, or a producer-specific gate.
[[VER-JOBS-DELIVERY]] covers the observable boundary.

## Local execution and output

Native bash now returns structured output to codemode, including nonzero exit
status through an error result rather than only throwing. Structured output has
a 1 MiB bound with retained beginning/tail; model-facing text still uses Pi's
2000-line/50KB bound. These are presentation limits, not the revised jobs
output ceiling of 10 MB (10,000,000 bytes) per job. The shared quota and
completion-space reservations are retired under [[ADR-JOBS-SESSION-BOUNDED-STORAGE]].

J1/J2/J5 must exercise direct and nested invocation, nonzero exit, launch failure,
truncation, and foreground/handoff races. Define honest structured terminal versus
running results; a background identity must not fabricate an exit code. Do not
let the end/abort of a codemode script kill a job already handed into managed
background ownership. A still-foreground command remains abortable; cancelling a
wait does not stop its job. Preserve native `!`/`!!` behavior.
[[VER-JOBS-FOREGROUND-HANDOFF]] and [[REQ-JOBS-CONTROL-SURFACE]] remain authoritative.

## Session persistence boundary

Pi 0.87.1 waited for an assistant message before flushing a new session. In
0.99.1, `SessionManager` creates it once a user **or** assistant message exists.
Setup/custom entries alone can still remain in memory. Append success still does
not mean fsync, and missing session files are not a new admission guard.
C3/C4 and the gates-protocol compatibility checks must cover setup-only state,
first-user persistence, reload/reopen, branching, and in-memory sessions.
See [[REQ-JOBS-PI-STATE]], [[VER-JOBS-PI-STORAGE]], and
[[ADR-GATES-PI-RESUMABILITY-BOUNDARY]]. Compact jobs records/results now use Pi
custom entries; only bounded output artifacts remain external. Genuine session
deactivation requests bounded best-effort managed cancellation, with no guaranteed
inactive-session tracking/completion capture/delivery. Crash/forced-kill cleanup
and survivor recovery are outside scope; saved running metadata is not liveness.
Reload of the same active session still needs fresh public callbacks and preserved
execution. See [[REQ-JOBS-SESSION-CONTINUITY]] and [[DES-JOBS-SESSION-STORE]]. Do not
add another session/gate journal or raw JSONL edits. The minimal storage profile
uses trusted serialized same-job calls, live memory output and best-effort
completion/explicit-read snapshots. It does not promise strict persistence
retries, exact replay after write failures, continuous disk-log freshness or
automatic seven-day retention. This narrows storage only; native gate, receipt
and process-control obligations remain unchanged.

## Package impact and retained scope

| Area                       | Reconciliation                                                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jobs-core                  | C1 public tool/receipt boundary; C3 native persistence; C4 nested visibility, queues, and lifecycle; C5 real participant conformance. Session-backed storage, per-job bounds and ownership/lifetime mapping need their selected design and verification.              |
| jobs                       | Native structured tool integration and cancellation checks above; same-process foreground/background handoff remains necessary.                                                                                                                                       |
| herdr                      | Keep the public current-local JSON adapter and explicit resources/execution split. Native MCP does not replace Herdr's transport or prove command completion. Test adapter tools through the native nested pipeline without inventing approval, retries, or fallback. |
| goal                       | Keep fresh state and generic gates; add the agreed native-classifier supervision and ledger review with fallback. Use actionable Pi scheduling boundaries, not notification-only settlement, to schedule turns.                                                       |
| caffeinate                 | Keep fresh settings and all-tracked-session generic gates. Observe Pi activity/queues through settlement, including nested work; do not infer idleness from one completed inner tool. Actual Linux inhibition remains separate verification.                          |
| gates                      | Keep read-only state/history/health, notice suppression, and reconciliation semantics. New theme behavior affects presentation, not authority.                                                                                                                        |
| gates/statusline protocols | Recheck exported host types and real SDK integration. The Pi bump alone does not change their protocol identity or prove actual consumer integration.                                                                                                                 |
| fast-mode/statusline       | Recheck resource loading, provider hooks, packed consumers, and theme behavior. Upstream pricing fixes or a new provider label do not prove these extensions redundant.                                                                                               |
| nx-pi                      | Recheck generated resource discovery/theme schema and independent consumers. Preserve infrastructure neutrality; do not make MCP or a TypeScript loader a generated consumer requirement.                                                                             |

Pi now warns about host-provided modules in runtime dependencies and suppresses
automatic Pi peer installation for managed git packages as well as npm packages.
Inspect package manifests and fresh installed artifacts; do not bundle another
Pi host. Follow the existing package contracts rather than silently changing peer
ranges or consumer infrastructure. Built-ins can be disabled/replaced, and
`--no-extensions` now also disables built-in extensions: explicitly configure
native codemode/MCP in SDK tests that intend to cover them.

## Verified reserved-theme correction

The separately authorized correction under [[DES-NXPI-THEME-CONTRACT]] rejects
Pi's exact reserved `system` theme name before generator writes; names such as
`system-dark` remain valid. The source regression first failed because generation
resolved instead of rejecting, then passed with the guard.

On Node 26.7.0, Nx 23.2.1, npm 11.19.0 and pnpm 12.8.1, the uncached nx-pi
test/typecheck/lint/build run passed with **302 tests**. Fresh plugin/resource
packs were exercised in independent npm/pnpm consumers: reserved-name rejection
in dry-run and real CLI invocations preserved authored files; valid resources
passed source and explicit-tarball checks and loaded through Pi 0.99.1.
A separate credential-free process used the installed SDK's public `initTheme`
and `getMarkdownTheme` APIs to verify that selecting `system` ignores a custom
palette while the same palette under a non-reserved name is selected. No model
session or inference was used; this is not interactive terminal/theme-switching QA.

The first full attempt failed 41 validation-fixture setups because the configured
temporary parent did not yet exist. Creating that directory, without changing
product or test code, allowed the complete rerun to pass. Local logs are
`~/.cache/nx-pi-system-theme-{red,green,checks,checks-final}.log`; the test sources
are the durable regression/replay method. No dependency versions changed.
The plugin itself has no inferred `pi-check` target; the eligible generated
consumer packages were checked. Other packages, Node versions and full workflow
integration were not reverified by this bounded repair.

## Agreed capability boundaries

- [[REQ-STATUSLINE-BUILTINS]] and [[DES-STATUSLINE-BUILTIN-VALUES]] now include
  tool-result/native usage and selected-to-actual model display. The requirements
  and their verification methods define coverage; the historical host inspection
  alone does not establish implementation conformance.
- At inspection, [[REQ-FAST-ELIGIBILITY]] required actual-request identity.
  Its later direct-mode restoration above supersedes blanket omission; routed
  support remains unavailable. Sol 6.1 was subsequently explicitly added after
  the user's exclusion report and positive direct-wire checks, not automatically
  because it was available or selected for workers.
- [[DES-GOAL-CLASSIFIER-POLICY]] and [[EVD-GOAL-CLASSIFIER-PILOT]] separate agreed
  provisional policy from actual limited calls and still-unverified goal runtime.
  [[REQ-CAFFEINATE-AUTO-HOLD]] includes active classifier work outside assistant
  turns, through public activity or generic gates rather than classifier-specific
  consumer logic.

The user subsequently approved globally unique `jobs_*`, `goal_*` and `herdr_*`
registration names alongside native namespace metadata, preserving the exact `bash`
replacement name; see [[REQ-PI-ATOMIC-TOOLS]]. [[REQ-GOAL-CLI-STARTUP]] adds the
accepted `pi --goal "objective"` startup contract: normal guarded creation/start,
initial-startup-only application, and rejection of existing-goal conflicts without
silent replacement. These are intended behaviors, not implemented tools or CLI
startup support.

The user subsequently clarified the goal model in [[GOAL-PERSISTENT-AUTONOMY]] and
[[REQ-GOAL-CONTROLS]]: a goal directs one assistant's conversation, from the start
or during the portion after it is set, not a shared task across assistants/sessions.
Normal messages naturally guide the current active goal. This supersedes the earlier
explicit ordinary-chat attachment policy; the proposed `/goal run` command is
withdrawn, not accepted or implemented. [[REQ-GOAL-CONTINUATION]] requires guarded
continuation after premature stopping and fresh goal context after compaction.
Branch-local persistence restores that conversation's state; it does not coordinate
other sessions. [[REQ-GOAL-NO-PROGRESS]] now scopes classifier observations to
completed assistant turns in the current active goal interval, while retaining the
deterministic fallback's narrower sampling. Pause/resume, gates, budgets, evidence,
and completion safeguards remain unchanged. The updated verification methods are
repeatable integration checks, not runtime evidence.

[[REQ-PI-NONUI-AWAIT]] subsequently revises the earlier separate-explicit-wait
policy: selected awaited work must prevent premature non-UI completion, including
reviewers without an active goal. Required final results must reach the model before
it finishes the task; an assistant saying it is waiting is not successful completion.
[[VER-PI-NONUI-AWAIT]] defines the regression and cancellation/exit checks.
Subsequent [[EVD-PI-0991-NONUI-PROBES]] records 17 CLI scenarios and a fresh replay:
native pre-settlement waiting can deliver a result for model consumption without
polling, but the tested wait has no boundary cancellation signal, RPC abort waits
for its resolution, and naive CLI startup loses work or JSON events. A thrown
boundary-handler error can still exit zero. These observations leave cancellable
waiting, mode-safe startup and unfinished-outcome signaling unresolved; see
[the report](pi-0991-nonui-probes.mara.md). Supplementary
[[EVD-PI-0991-TURN-END-PROBES]] finds a cancellable candidate at the earlier native
`turn_end` boundary: print/JSON/RPC result consumption and prompt RPC abort worked
in four controlled cases. This avoids assuming a new cancellation API is necessary
for those cases, but does not establish final-settlement, multi-owner/gate or goal
integration. The startup and terminal-outcome gaps remain.

The user subsequently authorized local [[DES-PI-STARTUP-INPUT-API]] and
[[DES-PI-RUN-OUTCOME-API]] drafts, not host changes or submission. Nonzero exit
mapping is conditional on a small supported SDK integration, not an unconditional
0.99.1 requirement. The inspected public extension API has no outcome/exit-code
setter; a caller-owned SDK application's process policy is not an extension
capability. Preserve honest workflow diagnostics without promising unsupported
exit control or making it a new prerequisite by itself. The drafts and their
compatibility/composition questions remain unimplemented.

The user also approved the two waiting-policy clarifications in
[[REQ-PI-NONUI-AWAIT]]: reject awaited plus next-natural-turn selections in
one-shot print/JSON, and stop non-UI progression with needs-attention when a
relevant owner stays unknown after normal reconciliation timeout. Preserve
unresolved gates and normal actual-exit cleanup; neither decision promotes
delivery modes or turns timeout into proof of execution completion or owner death.
Responsive owners with known pending work remain normal waits. The updated
[[VER-PI-NONUI-AWAIT]] and linked delivery/goal checks are plans, not observed
conformance. The user subsequently chose explicit `/goal resume` after a
needs-attention pause, even if the owner recovers; see [[REQ-GOAL-PAUSE-RECOVERY]].
Independent jobs and result delivery remain unaffected by that goal pause.
The current supported scope is defined by the requirements above, not the local API drafts.

Before implementation/API freeze, verify the prefixed tool surface, bash replacement
and explicit disabling; resolve model-visible nested receipts; public routed-model
identity; foreground/handoff cancellation; reload/session-scoped callbacks; concrete
active-goal context/lifecycle isolation and mode-specific CLI startup; and usage/activity
attribution for classifier calls inside and outside tools. Record unsupported cases
honestly rather than using private state or adding a tool broker.

Subsequent user-authorized [[EVD-PI-0991-NATIVE-PROBES]] records 21 isolated SDK
and loopback scenarios with no live model calls. It confirms useful tool/lifecycle
seams, while exposing missing pre-request routed identity and non-tool usage
attribution, classifier retry/deadline nuances, and differing direct/nested signal
lifetimes. Nested delivery receipts and current-goal lifecycle/revision isolation
remain design work; the superseded per-chat attachment policy is not an API gap.
See [the report and replay fixtures](pi-0991-native-probes.mara.md); these limited
observations do not complete workflow verification.

The subsequent user decision sets native classifier `maxRetries: 0` in
[[DES-GOAL-CLASSIFIER-POLICY]]. Local-only [[DES-PI-EXTENSION-USAGE-API]] and
[[DES-PI-REQUEST-IDENTITY-API]] draft the two requested upstream additions;
[their scope and open questions](pi-api-proposals.mara.md) are not implemented
or accepted upstream APIs. The drafts do not establish host support.

<a id="verification-before-dispatch"></a>

## Baseline compatibility checks

Historical baseline verification covered the following compatibility criteria.

1. Repository Pi development versions and independent consumer fixtures select
   0.99.1; the lockfile is generated through pnpm and frozen installation passes.
2. Add a first-user persistence regression and observe the intended failure on
   0.87.1 before upgrading. Run the real SessionManager/SDK protocol tests on 0.99.1.
3. Relevant resolved Nx test/build/lint/typecheck and eligible source `pi-check`
   targets pass. Rebuild before packing; check explicit fresh archives and their
   independent npm/pnpm consumer loading, including generated resources.
4. Refresh current compatibility statements without rewriting historical results
   into 0.99.1 evidence. Diagnose Work and validate Mara completely. Record actual
   checks, artifacts, failures, and remaining runtime limitations.

### Observed repository checks

On Node 26.7.0 with pnpm 12.8.1 and npm 11.19.0, the preparation working tree
passed the following checks; no release or workflow implementation is implied:

- The new first-user persistence regression failed on 0.87.1 at the expected
  missing-file assertion (22 other tests passed), then all 23 gates-protocol
  tests passed on 0.99.1.
- `CI=1 pnpm nx run-many -t test,typecheck,lint,build,pi-check --parallel=3
--skip-nx-cache --outputStyle=static` passed across the five existing projects:
  300 nx-pi, 23 gates-protocol, 13 statusline-protocol, 22 statusline, and
  35 fast-mode tests. This included fresh extension packs/static archive checks,
  isolated npm loading, and generated-resource/plugin npm/pnpm consumers.
- Resolver inspection then found fast-mode's automatically installed wildcard
  peer was still 0.87.1. Adding an explicit catalog-backed **development**
  dependency made all workspace Pi SDK resolutions 0.99.1; fast-mode's 35 tests,
  typecheck, lint, source check, and packed npm loading passed again. Its consumer
  peer remains host-provided, not a bundled/runtime Pi dependency.
- Fresh builds and explicit archive checks of both actual protocol libraries
  passed, followed by runtime imports and declaration resolution in independent
  npm and pnpm consumers with Pi 0.99.1. Declaration smoke used `skipLibCheck`;
  it is not a typecheck of all Pi dependencies. The initial auxiliary probe
  incorrectly imported the internal `GateProjection`; correcting the probe to
  the actual public exports passed without changing the library API.
- Frozen installation, changed-file formatting, and Nx sync checks passed.
  Nx emitted its known native-TypeScript/CommonJS loading warnings before its
  successful fallback; these were not runtime compatibility failures.

These historical baseline checks do not establish full jobs/Herdr/goal/caffeinate/gates
integration, live fast-service provider behavior, or release readiness. Routine
commands, logs, archive hashes, and delivery receipts are recorded in the owning
Work items; the classifier pilot is not a substitute for runtime integration.
