# Pi-jobs execution

This is the consumer-facing execution contract for the replacement model `bash`
tool in `pi-jobs`, not an implemented extension. The package is now scaffolded; runtime execution remains unimplemented.

Use the [shared lifecycle](../../jobs-core/docs/lifecycle.mara.md) for termination,
reconciliation, and session continuity, and the
[shared delivery contract](../../jobs-core/docs/delivery.mara.md) for completion messages.
The local adapter implements the foreground/background behavior below; Herdr
execution remains owned by the [Herdr plan](../../herdr/docs/scope.mara.md). The
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
