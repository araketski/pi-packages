:::mara evidence EVD-HERDR-JSON-LOCAL-TRANSPORT
:mid: 01M484WQYS5TH0R55S6NDC6FTA
:title: Demonstrate the bounded JSON transport on isolated Linux Herdr 0.9.1
:status: accepted
:result: passed
:captured_at: 2026-10-06T08:21:42Z
:subject_revision: ec760f15d34423ed8e9cdedc5ea53984f394e0e0
:evidences: VER-HERDR-JSON-TRANSPORT

Verified the bounded pane transport slice at branch `w-9770e3f3-herdr-transport`, commit `ec760f15d34423ed8e9cdedc5ea53984f394e0e0`, tree `d0e383b514272fafc4f0805a3b113dcd595ef8d6`. This is not evidence of managed commands, jobs composition, Pi-facing resource tools or agent delegation.

`pnpm nx run @araketski/pi-herdr:test` passed 14 tests: nine controlled transport cases, one opt-in real-server workflow, and four fresh archive/independent consumer cases (npm/pnpm at manifest 0.1.0 and copied alternate version). The observed red phase ran nine behavioral tests against the unimplemented seam; all nine failed before implementation. Controlled sockets verify subscription acknowledgement before snapshot, bootstrap arrivals, stable terminal identity, disconnect/resnapshot, unsupported-method errors, malformed replies/events, bounded timeout and an applied mutation with a lost reply submitted exactly once. No CLI/local fallback, mutation retry or completion synthesis exists in the transport.

The real fixture started owned Linux Herdr 0.9.1 PID `2493476` with a private short configuration/socket path. It captured the actual injected Herdr environment from its owned shell pane. Adapter requests used that endpoint and caller ID while a different workspace was focused. Stable terminal `term_65d27ae6249461` followed public pane references `w1:p1` → `w3:p1` (external public move observed through the subscription) → `w4:p1` (adapter move). Query, rename and ordinary disconnect/reconnect/resnapshot passed; the reconnect captured an external label update made while disconnected. The focused workspace stayed `w2`. The owned server exited and both its bulk fixture and private IPC directory were removed. The live user server and unrelated panes/worktrees were not changed.

Observed public details are encoded in the design and tests: lifecycle selectors use dots while event envelopes use underscores; `pane.current` returns `pane_current`, and rename returns `pane_info`. The selected lifecycle stream does not report every pane field change: external rename was observed without a `pane.updated` event, so query/resnapshot remains necessary for externally changed labels. Agent status and pane exit remain observations, not command outcomes.

Strict source lint/typecheck and source `pi-check` passed. nx-pi tooling was freshly built; each newly packed archive was supplied explicitly to `pi-check-package`. Independent installed consumers used Pi 0.99.1 for no-op source-resource loading and its host-provided Jiti for the installed transport source workflow. They typechecked installed source, emitted declarations into fixture-owned storage and independently consumed those declarations. Metadata-only exports, source byte hashes, no registrations, no bundled host SDK and exact archive membership passed. No package/catalog/lockfile or jobs-contract version changed.

The 0.1.0 archive SHA-256 was `9658456dadc3eed073ba41e959b549298e5d57c7893e49638d93fd26dfdc9854`; transport source SHA-256 was `1d52bc1523da173b1f668d9dfb1042098d631c53298f07b693125f2fb61eeb36`. Runtime archive members were only `package.json`, `README.md`, `LICENSE`, `extensions/herdr/index.ts` and `extensions/herdr/transport.ts`.

Retained receipts, exact archives, red/green logs, schema/documentation inputs, real server transcript and cleanup proof are under `/home/araketski/.local/state/pi/verification/01a11039-9ffa-7315-bd0c-f47ff9eabbac/`: `tested-identity.txt`, `full-test.log`, `source-checks.log`, `npm-0.1.0.json`, `pnpm-0.1.0.json`, `real-herdr.json` and `real-herdr-cleanup.json`. Disposable install/build caches are owned by that worker session and removed at handoff. Independent review, scope integration, final main checks and publication are separate gates; this execution record does not claim them.

### Follow-up provenance

This is the historical test execution at the stated revision, not a claim of clean review. Review 1 (`pi-review.vMr2Id`) subsequently demonstrated late-reply cache reversal and overflowing configured timeouts. Both received focused failing regressions and narrow fixes; their fresh checks and final review are recorded in the owning Work item.

Initial follow-up runs reused top-level consumer/cleanup receipt filenames. The baseline test logs, revision, real-server receipt and captured cleanup observation are preserved under `baseline-ec760/`. Its archive was reconstructed from the recorded Git source and matches the original SHA-256 byte-for-byte; reconstruction is not another claimed test execution. New follow-up receipts and archives use separate `after-review-1/` and final-verification directories. The original passing test outcome and its source revision remain unchanged; newer receipts do not verify that historical revision.
:::

:::mara evidence EVD-HERDR-JSON-REVIEWED-TRANSPORT
:mid: 01M487JNBKNDXFEVVZ2SFXTS2J
:title: Verify and independently review the corrected bounded local transport
:status: accepted
:result: passed
:captured_at: 2026-10-06T09:08:25Z
:subject_revision: f73a72434c946b3e90d6d2b8e729e055e975dcc7
:evidences: VER-HERDR-JSON-TRANSPORT

Final bounded transport verification ran on `f73a72434c946b3e90d6d2b8e729e055e975dcc7`, tree `d133ab3fb31f048abef6106472c78abdb8a9408e`, branch `w-9770e3f3-herdr-transport`. This supersedes neither the bytes nor the recorded test outcomes of [[EVD-HERDR-JSON-LOCAL-TRANSPORT]]; it records the corrected source after independent findings were addressed.

The complete Nx test target passed 22 tests: 17 focused controlled transport tests, one isolated real Linux Herdr 0.9.1 workflow and four fresh npm/pnpm archive consumers (manifest and copied alternate versions). Source lint/typecheck/pi-check passed uncached; fresh archives were explicitly supplied to pi-check-package. Consumers verified source-resource no-op loading on Pi 0.99.1, installed transport runtime through host Jiti, source typechecking, independently emitted/consumed declarations, metadata-only exports, exact selected files and host-provided SDK dependencies.

The real run used owned server PID `4065111` and captured actual inherited caller environment from its owned pane. Stable terminal `term_65d284385f6161` followed `w1:p1` → `w3:p1` through an external move observed on the stream, then `w4:p1` through adapter movement and reconnect/resnapshot. Explicit IDs and inherited caller alias resolved independently of another focused workspace. The owned server exited; its bulk fixture and short private IPC/config directory were proven absent. Focused intentional early-failure and log-write-failure runs separately verified stopped-server fixture cleanup; their test commands intentionally exited 1 and are not misreported as passing real-workflow runs.

Five fresh read-only reviews used exactly openai/gpt-6.1-sol / xhigh / --fast --no-approve. The first four reported six concrete findings, all fixed within this interface/verification boundary with observed failing regressions: late replies reversing newer lifecycle changes, oversized Node deadlines, newer replies for initially uncached panes, old-generation cache contamination, a shared bootstrap deadline, and failure-path fixture cleanup. No finding was deferred or dismissed. Raw incorrect verdicts remain unchanged with supported fix-now dispositions. Review 5 (`pi-review.MlvTBx`, reviewer session `01a11073-d3ce-71b7-b685-811a073cab5c`) completed with `findings: []` and `overall_correctness: patch is correct`.

For review 5, logical local `rework` resolved to supplied SHA `7e88f5a90de27d2fad0825d55a966432099b3070`; the actual merge/diff base was `1ec4c672f21e1f27dab38a575fb1fcba1e2da596`. Reviewed HEAD was the stated subject revision. Process exit 0, agent_settled, final message_end stopReason stop, actual model/effort/flags/session identity, empty stderr and identical before/after source/runtime/generated hashes were verified. The reviewer reran controlled tests and uncached source checks, not the real-server/distribution tests; those passed in the implementing session on this exact SHA. This establishes a clean final review, not combined-scope or main integration.

The final 0.1.0 archive SHA-256 is `dee0c998b2ad31902e908766dad2b77b7c322ecc62b57696578b3309f0c5dc50`; transport source SHA-256 is `b109bdcaf1981ffabed309f38b35e5fcbf2501dd8d04a7ce45f3a00d90303705`. Only metadata/README/license and the factory/transport runtime source are published by the existing allowlist. Versions, catalog/lockfile, metadata exports and no-op registration remain unchanged.

Retained evidence root: `/home/araketski/.local/state/pi/verification/01a11039-9ffa-7315-bd0c-f47ff9eabbac/`. Exact tested identities, fresh archives/consumer receipts and real-server cleanup are in `final-f73a/`; raw reviews and completion/profile evidence are in the five `pi-review.*` directories; finding dispositions are in `review-1-triage.md` through `review-4-triage.md`. Final handoff records and cleanup proof remain outside publication and in the owning Work item.

Scope remains current-local Linux, pane topology with query-refreshed information, explicit reconnect/resnapshot and honest ambiguous mutation errors. External field changes not present in the selected stream require explicit query/resnapshot. No managed-command results, jobs composition, Pi-facing tools, agent delegation, remote support, total-order/replay guarantee, CLI/local fallback, mutation retry or server restart is claimed. The Work item stays open for separately authorized local rework integration.
:::
