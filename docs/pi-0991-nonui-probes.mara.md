# Pi 0.99.1 non-UI lifecycle probes

The user authorized isolated offline startup, waiting, result-delivery and
cancellation probes after accepting [[REQ-PI-NONUI-AWAIT]]. These observations are
not a workflow implementation or a diagnosis of the historical reviewer incident.
No live inference was performed.

## Subject and isolation

- Repository subject: `eb988f68b7039faf38072d349d9071db9930cc7a` (`rework`).
- Linux x64, Node 26.7.0, installed compiled Pi CLI 0.99.1.
- CLI SHA-256: `be050f18fadcf2b5323f5473454505271a6f6e9dca2c00cc719a6398c19133c6`.
- Fresh user/network namespaces via `unshare --user --map-root-user --net`, empty
  inherited environment, isolated HOME and per-case workspaces, offline mode, no
  network routes. The provider is an in-process deterministic stream fixture;
  no HTTP requests, credentials, classifier calls or paid inference are involved.
- Built-in/discovered extensions, skills, themes, prompts and context files are
  disabled. Only the explicit fixture extension and its synthetic tool are used.
- Each child has a seven-second external safety deadline; none needed watchdog
  termination. SIGTERM is sent only to the identified synthetic probe child.
- The delayed work is a timer, not an OS command or Herdr job. No campaign agents,
  reviewers, Herdr resources, inhibition, user settings or package sources change.

The canonical [sources and bounded observations](pi-0991-nonui-probe-data.mara.md)
contain four source files and the final observation summary. Raw native
stdout/stderr/protocol/context traces are generated on every run, retained locally
under `/home/araketski/.cache/pi-nonui-probes.jMWZ7A/`, and hashed in the summary;
they are not duplicated as a full transcript archive in Git. Initial exploratory
runs informed the final assertions; the frozen fixtures were then rerun and
replayed from the archived sources in the fresh directory
`/home/araketski/.cache/pi-nonui-replay.b0wviF/`. All five archive blocks were
byte-compared with the captured originals. An assertion of an observed limitation
is not a product conformance pass.

## Observed scenarios

| Case                     | Observation                                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unguarded-print`        | Two synthetic requests; assistant says `WAITING_FOR_TESTS`; exit 0 while timer work is pending; no final result consumed.                                                                                                                                                                           |
| `unguarded-json`         | Same early completion, including `agent_settled` and exit 0.                                                                                                                                                                                                                                        |
| `guarded-print`          | Awaiting the timer in `agent_before_settle`, then returning a result draft and continuation, permits a third request to consume the result and output `REVIEW_DONE`.                                                                                                                                |
| `guarded-json`           | Same result consumption; one final settlement after the review response.                                                                                                                                                                                                                            |
| `queued-result-json`     | Queuing `pi.sendMessage(..., { triggerTurn: true, deliverAs: "followUp" })` while the boundary waits also reaches the next provider context without an extra duplicate request.                                                                                                                     |
| `guarded-rpc`            | The client receives settlement only after result consumption and the final review response; client EOF then closes the process.                                                                                                                                                                     |
| `abort-rpc`              | Boundary context has no signal. RPC abort acknowledgement waits about 1.786 seconds, until the 1.8-second timer resolves. Neither the boundary nor retained completed-direct-tool signal reports abort. Further model continuation is suppressed, but the wait itself was not promptly interrupted. |
| `sigterm-json`           | SIGTERM invokes shutdown; fixture cleanup clears its timer and releases its wait. Exit 143 occurs about 9 ms after the signal, without consuming the final result. This proves this fixture's shutdown path, not physical job-tree cancellation.                                                    |
| `startup-flag-only-json` | Native string flag is available at session startup, but registration alone starts no run. CLI exits 0.                                                                                                                                                                                              |
| `startup-fire-json`      | A fire-and-forget `sendUserMessage` from `session_start` races disposal: no provider request completes, no normal run events reach stdout, and a stale-context error is printed; exit remains 0.                                                                                                    |
| `startup-fire-print`     | Same race and stale-context diagnostic; empty final output and exit 0.                                                                                                                                                                                                                              |
| `startup-await-json`     | Waiting for the extension-observed settlement inside `session_start` completes a synthetic request, but stdout contains no agent/message/settlement events for it.                                                                                                                                  |
| `startup-await-print`    | The same startup strategy completes and prints `STARTUP_DONE`; this does not establish JSON parity or correct mixed-input ordering.                                                                                                                                                                 |
| `startup-input-json`     | With an actual supplied first prompt, the public input hook combines the fixture objective and prompt into one request with normal JSON run events.                                                                                                                                                 |
| `startup-piped-print`    | Native piped text and positional prompt both reach the input transformation and one synthetic request.                                                                                                                                                                                              |
| `help-goal`              | Loaded extension's string flag appears in help; no session starts or provider calls occur.                                                                                                                                                                                                          |
| `boundary-error-json`    | A thrown boundary-handler error is reported on stderr, but Pi still settles with pending timer work and exits 0. Handler throws alone do not provide an honest nonzero unfinished-run signal.                                                                                                       |

All four guarded successful cases issue exactly two requests before timer
completion and one afterward: no repeated model polling while waiting. The next
provider context contains `FINAL_RESULT_PASS`, and the fixture returns
`REVIEW_DONE`. This demonstrates visibility for those controlled message paths,
not a general receipt/deduplication implementation for direct or discarded nested
retrieval. The fixture's `submitted` flag means draft proposal or queue admission,
**not** a receipt. Likewise, timer completion is not a process exit observation.

## Interpretation and remaining boundaries

Inspected Pi 0.99.1's public extension declarations and matching mode/session
implementations to interpret the observations. Print/JSON waits for supplied
`session.prompt()` calls and then disposes the runtime. Its session event
subscription is installed after extension binding invokes `session_start`.
The native pre-settlement handler is awaited; the extension context's signal
comes from the low-level agent, whose signal was absent at this boundary in these
fixtures. RPC abort suppresses continuation but waits for settlement.

These are useful native integration points, but the simple boundary-wait strategy
is **not a complete cancellable solution**. A public cancellation path for that
pre-settlement wait, mode-safe startup with fully observed/awaited runs, and reliable unfinished
outcome signaling still need design and proof. Do not patch private runtime fields,
use busy model polling, fake provider errors, or replace Pi scheduling to conceal
these gaps. No claim is made that every alternative public integration is
impossible; the tested strategies are insufficient for the full contract.

No standalone SDK-host or interactive TUI conformance was executed in this set.
The npm-distributed Node CLI, arbitrary providers, actual goals/classifiers,
local/Herdr processes, generic gate integration, process trees, result-storage
failures and nested receipts remain unverified. Unknown-owner waits, next-turn
versus automatic delivery at settlement, goal pause/budget boundaries, and exact
machine-readable terminal/exit semantics are still unresolved design choices.
Existing local Pi API proposals remain drafts, not available or verified host APIs.

## Supplementary turn-end observations

Before proposing another host API, four further offline cases tested the existing
`turn_end` boundary at repository subject
`b9932771b65eed7c2ca37561aadb06969b4bd366`, with the same CLI, isolation and
synthetic provider. The [small hash-checked variant and observations](pi-0991-turn-end-probe-data.mara.md)
reuse the frozen base sources above. Raw captures are retained in
`/home/araketski/.cache/pi-turn-end-probes.8VEqkn/`. Archived-source replay passed
in `/home/araketski/.cache/pi-turn-end-replay.mwOrRX/`; the two supplementary
artifact blocks were byte-compared with the captured originals.

- `turn-end-print`, `turn-end-json`, and `turn-end-rpc`: after the assistant stops
  without a tool call, await the pending timer through the native `turn_end`
  handler, then propose the final result and continuation. The context **does**
  have an operation signal here. All three cases consume the result and produce
  `REVIEW_DONE`, with exactly two requests before completion and one afterward.
- `turn-end-abort-rpc`: racing that wait against its public operation signal lets
  RPC abort interrupt it promptly, before the timer completes, and prevents the
  third model request. The fixture remains pending until later client EOF causes
  shutdown cleanup. Cancelling the wait did not itself claim job termination.

This narrows the initial finding: absence of a signal at `agent_before_settle`
does not imply absence at every usable native boundary. A cancellable candidate
exists for these turn-end cases; a new cancellation API is not established as
necessary for them. However, turn end is earlier than final settlement. Later
handler activity, multi-owner ordering, generic gates, queued result delivery,
abort/completion races and goal integration remain untested. Do not block a later
handler whose work is needed to release a wait, confuse proposed entries with
receipts, or assume this candidate covers work first acquired after turn end.
The startup/JSON and unfinished-outcome findings above remain unchanged.

### Replay the supplementary cases

Extract only source blocks from both data files into a fresh directory, then apply
the variant to those copies. It rejects a modified base rather than guessing.

```sh
probe=$(mktemp -d "$HOME/.cache/pi-turn-end-replay.XXXXXX")
python3 - "$probe" <<'PY'
import pathlib, re, sys
for doc in ['pi-0991-nonui-probe-data.mara.md', 'pi-0991-turn-end-probe-data.mara.md']:
    source = pathlib.Path('docs', doc).read_text()
    for name, _, body in re.findall(r'^## ([^\n]+)\n\n(`{3,})text\n([\s\S]*?)\n\2$', source, re.M):
        if name != 'observations.json':
            pathlib.Path(sys.argv[1], name).write_text(body + '\n')
PY
node "$probe/turn-end-variant.mjs"
PROBE_PI=/absolute/path/to/pi-0.99.1 sh "$probe/replay.sh" > "$probe/replay.log" 2>&1
```

## Replay

Run only with the intended Pi 0.99.1 executable and Linux user/network namespace
support, Node, Python and `ip` available. Extract the four sources and the captured
summary into a fresh cache directory; the driver overwrites the summary with its
new run observations, so timestamps, paths and timings will differ.

```sh
probe=$(mktemp -d "$HOME/.cache/pi-nonui-replay.XXXXXX")
python3 - "$probe" <<'PY'
import pathlib, re, sys
source = pathlib.Path('docs/pi-0991-nonui-probe-data.mara.md').read_text()
matches = re.findall(r'^## ([^\n]+)\n\n(`{3,})text\n([\s\S]*?)\n\2$', source, re.M)
expected = {'fixture.ts', 'run.mjs', 'summarize.mjs', 'replay.sh', 'observations.json'}
assert len(matches) == len(expected) and {m[0] for m in matches} == expected
for name, _, body in matches:
    pathlib.Path(sys.argv[1], name).write_text(body + '\n')
PY
PROBE_PI=/absolute/path/to/pi-0.99.1 sh "$probe/replay.sh" > "$probe/replay.log" 2>&1
```

A successful driver means the 17 recorded host behaviors were observed again,
including the known failure modes. It does not mean [[VER-PI-NONUI-AWAIT]] or
[[VER-GOAL-CONTROLS-AND-EVIDENCE]] passed for the unimplemented workflow packages.

## Evidence

:::mara evidence EVD-PI-0991-NONUI-PROBES
:mid: 01M3S53SVS20DEJ43AQ52V6F3P
:title: Observe non-UI settlement startup and cancellation limits in isolated Pi 0.99.1
:status: accepted
:result: inconclusive
:captured_at: 2026-09-30
:subject_revision: eb988f68b7039faf38072d349d9071db9930cc7a
:evidences: VER-PI-NONUI-AWAIT
:evidences: VER-GOAL-CONTROLS-AND-EVIDENCE

Executed and replayed 17 isolated offline scenarios through the installed compiled Pi 0.99.1 CLI using an in-process synthetic provider and timer-only work. The report above and [archived sources/observations](pi-0991-nonui-probe-data.mara.md) distinguish unguarded early settlement, successful native pre-settlement result consumption, delayed RPC abort without a boundary signal, SIGTERM fixture cleanup, CLI flag/startup races and missing JSON startup events, native first-input transformation, help-only loading, and boundary errors that still exit zero.

All final fixture assertions and fresh-directory replay completed successfully, including assertions of host limitations. Outcome is inconclusive for the linked full verification methods: these are partial host observations, not an implemented goal/jobs/Herdr integration or a passing non-UI workflow. No live inference, managed OS jobs, campaign agents or reviewers ran. The observed premature completion resembles the user's regression scenario but does not diagnose the historical reviewer incident. Cancellation, startup and terminal-outcome integration remain outside this evidence's verified scope.
:::

:::mara evidence EVD-PI-0991-TURN-END-PROBES
:mid: 01M3S5NNMQ1JRXKGPGCE0Z474C
:title: Observe a cancellable native turn-end wait without assuming new host APIs
:status: accepted
:result: inconclusive
:captured_at: 2026-09-30
:subject_revision: b9932771b65eed7c2ca37561aadb06969b4bd366
:evidences: VER-PI-NONUI-AWAIT

Four supplementary offline CLI cases test a signal-aware turn_end wait after the assistant's no-tool response. Print, JSON and RPC consume the synthetic final result and complete the review without repeated polling; RPC abort interrupts the wait before timer completion, without claiming execution termination. See the supplementary section above and [hash-checked variant/observations](pi-0991-turn-end-probe-data.mara.md). All four assertions and archived-source fresh replay completed successfully.

This evidence narrows the no-signal finding in [[EVD-PI-0991-NONUI-PROBES]] to the tested pre-settlement hook; it does not prove a new cancellation API is required for turn-end waiting. Outcome remains inconclusive for the full workflow verification: later handlers, multiple producers, generic gates, actual local/Herdr work, goals, receipts and final-settlement races are not covered. Startup and terminal-outcome gaps remain. No live inference or campaign execution occurred.
:::
