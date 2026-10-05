# Pi-jobs execution

This is the consumer-facing execution contract for the replacement model `bash`
tool in `pi-jobs`, not an implemented extension. The package is now scaffolded; runtime execution remains unimplemented.

Use the [shared lifecycle](../../jobs-core/docs/lifecycle.mara.md) for termination,
reconciliation, and session continuity, and the
[shared delivery contract](../../jobs-core/docs/delivery.mara.md) for completion messages.
The local adapter implements the foreground/background behavior below; Herdr
execution remains owned by the [Herdr plan](../../../docs/planned/herdr/scope.mara.md). The
[control-surface plan](./controls.mara.md) defines the jobs tool, `/jobs`, native
user-bash boundary, and initial runtime support.

## Agreed knowledge

:::mara goal GOAL-JOBS-MANAGED-LIFETIME
:mid: 01M3PTSZNA34DADC14WYH20F5B
:title: Keep asynchronous work controllable without losing session results
:status: accepted

Let ordinary bash commands continue without blocking Pi indefinitely, while keeping cancellation predictable and preserving results for the originating session. Managed work should not remain running after normal Pi exit, while explicitly persistent Herdr terminals remain available to the user. Required asynchronous work and pending result delivery must not cause premature goal continuation.
:::

:::mara requirement REQ-JOBS-FOREGROUND-BUDGET
:mid: 01M3PTT2NP5GVDQF4TNPRMRQG0
:title: Background the same local command after a configurable five-second wait
:status: accepted
:kind: functional
:contributes_to: GOAL-JOBS-MANAGED-LIFETIME

The replacement bash tool uses a configurable foreground wait budget with a five-second default. Every ordinary bash command can use the local runner without a command-name whitelist. A command that finishes within the budget returns its foreground result. A command still running when the budget expires returns a job identity and continues as the same execution, without termination, restart, or migration into a Herdr pane. Also allow explicit immediate background launch, with the same delivery, awaiting, and lifetime options. Budget expiry is not a hard execution timeout. Completion racing with the handoff must not lose the result or deliver both a foreground result and an unnecessary duplicate completion.
:::

:::mara verification VER-JOBS-FOREGROUND-HANDOFF
:mid: 01M3PTTH3X0D4R2HK88DXYXGN2
:title: Exercise quick completion, background handoff, and cancellation boundaries
:status: accepted
:method: test
:level: integration
:verifies: REQ-JOBS-FOREGROUND-BUDGET
:verifies: REQ-JOBS-CANCELLATION-BOUNDARY
:verifies: REQ-JOBS-HARD-TIMEOUT

With controlled clocks and a fake executor, verify the five-second foreground default, a configured alternative, explicit immediate backgrounding, completion on either side of budget expiry, and no lost or unnecessarily duplicated result at the boundary. Repeat the basic flow with a real local command whose process identity and single execution can be checked: no rerun and no Herdr dependency. Exercise the same flow through Pi 0.99.1 native nested tools/codemode as well as direct tool calls. Ending or aborting a script must not cancel an already handed-off background job; an unfinished foreground call remains bound to its operation's abort. Foreground abort stops its command; after handoff, abort an unrelated agent turn and confirm the job continues, then explicitly stop it. Verify graceful termination, the five-second default escalation and a configured grace period, owned child cleanup, and unrelated-process safety. Test no hard deadline by default, an explicit hard timeout, and a proven completion winning over a later cancellation/timeout request. Failed or unconfirmed termination remains uncertain and tracked. Include success, nonzero exit, and launch failure. These are future checks, not observed passing results; define concrete ownership and race mechanisms before implementing their assertions.
:::

:::mara design DES-JOBS-LOCAL-EXECUTOR
:mid: 01M45RDQKZXDFF0N440499J41H
:title: Own a Linux process group and arbitrate same-process handoff
:status: accepted
:kind: behavior
:satisfies: REQ-JOBS-FOREGROUND-BUDGET
:satisfies: REQ-JOBS-CANCELLATION-BOUNDARY
:satisfies: REQ-JOBS-HARD-TIMEOUT
:depends_on: DES-JOBS-INTERFACE-CHECKPOINT

## Selected backend and evidence

The user selected a Node-only Linux supervisor, not a pidfd/native/Python prerequisite. The resource-internal adapter implements the committed ExecutionAdapter with an opaque in-memory handle, LaunchRequest, OutputSink and ControlAuthority. Keep metadata-only package exports and an unregistered factory; explicitly publish the real source modules. This is not storage, result delivery, lifecycle composition or tool/UI registration.

Launch one detached Node supervisor as a new session/process-group leader, then one bash child inheriting that group. Bash is never rerun on handoff. The supervisor remains alive until its command and observed group members are no longer executing. Stop messages travel over the private parent-child IPC channel. Only the supervisor signals, using its own still-live process-group ID; no parent check-then-kill by numeric PID/PGID. Thus a stale handle cannot signal a reused process ID. Record Linux boot ID, supervisor PID/session/group/start ticks and command PID/start ticks for diagnosis. Procfs samples are evidence, not atomic signalling authority.

Graceful stop sends SIGTERM to the owned group while the supervisor's own handler keeps it alive. Default grace is 5000ms; per-call stop accepts an explicit validated grace. Escalation sends SIGKILL from inside the pinned group, including the supervisor. A requested stop is not terminal. Parent checks group/session observations after supervisor closure; missing/unreadable evidence or remaining live members yields unknown, not a fabricated exit code. Zombies are nonexecuting, not live work. Actual observed command outcome wins over later stop/timeout; launch failure is distinct from nonzero process exit.

## Explicit containment limitation

A Node-only process group is not a cgroup/subreaper. Descendants can escape via setsid/setpgid; procfs sampling cannot discover every short-lived ancestry transition. Detectable escaped descendants are retained as unknown with their identities, and are never signalled by a racy numeric-PID fallback. No guarantee of escaped-daemon cleanup or complete descendant discovery is claimed. Unverifiable termination stays tracked. Missing supervisor reports likewise cannot establish successful completion. Tests use known confined workloads and an explicitly owned escaped fixture to prove this boundary.

## Arbitration and inputs

The owner supplies an accessor for its current owner-held authority object. Launch/stop require that exact object and matching runtime/owner/generation; copied snapshot fields do not confer possession. Rotation invalidates old handles for control. This is trusted in-process possession, not authentication against malicious extensions.

Input carries command, absolute cwd, optional environment/shell executable, foregroundBudgetMs, background and stopGraceMs. Caller-resolved settings only: five-second foreground and grace defaults, no hard deadline unless LaunchRequest.hardTimeoutMs is provided. Configuration-file loading/precedence belongs to its later slice. Local persistent lifetime is unsupported (persistence is the explicit Herdr choice). Awaiting/delivery remain unchanged metadata, not backend branches.

One synchronous arbitration latch chooses foreground completion or background handoff, never both. Terminal evidence observed before budget expiry wins; budget expiry while running detaches the foreground abort listener before resolving handoff. Completion after that remains available on the handle, without a duplicate foreground result. Foreground abort suppresses handoff and requests normal stop/escalation; proven completion is never relabelled cancelled. After handoff, script/turn abort cannot stop the execution. Hard timeout uses the same owned-group stop path independently of handoff. Output is drained with stream backpressure into the supplied sink, including after handoff; sink failure records output-loss diagnostics and continues draining without changing the process exit outcome.

## Acceptance boundary

Controlled-clock tests establish budget/default/abort/completion ordering. Real isolated Linux tests establish quick success, nonzero exit, launch failure, one command PID/execution, output draining, graceful/escalated group cleanup, hard timeout and unrelated-process safety. Credential-free Pi 0.99.1 SDK tests exercise direct, native nested and actual codemode calls before/after handoff, including script exit. Installed npm/pnpm resource tests exercise the selected source modules without a new root library or bundled Pi host. Passing these checks does not prove concrete tools, persistence/recovery, normal-exit lifecycle mapping or final-result receipts.
:::
