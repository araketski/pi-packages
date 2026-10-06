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
:::
