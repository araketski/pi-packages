# Pi 0.99.1 isolated native API probes

This report records SDK and loopback-transport observations, not implementation of
the planned workflow packages. The campaign remains paused. No accepted policy,
Work dependency, provider selection, package implementation or user setting was
changed by these probes.

:::mara evidence EVD-PI-0991-NATIVE-PROBES
:mid: 01M3RZCYDE3WEPS6SKADT4CPKN
:title: Observe isolated native tool routing classifier and lifecycle boundaries
:status: accepted
:result: inconclusive
:captured_at: 2026-09-30
:subject_revision: 4053c0b7c8c65a0e4aad00c92845b065e0296167; Pi 0.99.1; harness SHA-256 458242a3e21516f0a41cc7916ce5c3a10fb119e3e96287713e7b864e42aa2aa4
:evidences: VER-PI-ATOMIC-TOOLS
:evidences: VER-JOBS-DELIVERY
:evidences: VER-JOBS-SESSION-AND-EXIT
:evidences: VER-GOAL-CLASSIFIERS

On 2026-09-30, with repository implementation unchanged at the subject revision, completed 21 isolated probe scenarios using the installed Pi 0.99.1 SDK and Node 26.7.0. All six final scripts exited zero and recorded every scenario; these are observations with focused assertions, not 21 claims of full product conformance. [Complete final fixtures and results](pi-0991-native-probe-data.mara.md) are retained in Git. Local originals are in `/home/araketski/.cache/pi-0991-native-probes.8H9PXQ/`.

## Isolation and scope

Every script ran in a fresh Linux user/network namespace, with an empty inherited environment except PATH, an isolated HOME, PI_OFFLINE=1 and the result filename. Only the wire script enabled that namespace's loopback interface. There was no external network route, inherited provider credential, live model inference, campaign agent or reviewer. Chat responses and classifier answers were deterministic fixtures. The wire script used Pi's actual OpenAI Responses and System One implementations against a loopback HTTP server: two chat requests and six classifier HTTP attempts, not calls to a model service. Reported fixture usage/cost is test data, not money spent. All 100 earlier live-classifier authorizations remain consumed.

Created disposable SDK sessions and resource loaders under the cache directory, using public SDK/extension interfaces. Read implementation sources only to interpret public behavior, not to mutate private state or use a private usage writer. No Herdr resource, managed OS job or inhibitor was created. Current Nx targets cover existing packages, not these standalone external-cache SDK probes; no package test, build, pack or consumer target was rerun for this documentation-only increment.

## Tool identity, exposure and validation

- A tool registered as `bash` with native namespace metadata `jobs` replaced the native bash tool and executed directly. Namespace metadata was visible in `getAllTools()`. The namespace did **not** prefix its registration key: registering `inspect` twice under different namespaces in one factory retained only the second definition. Exact public names still need design; namespace grouping alone is not collision isolation.
- SDK `excludeTools` removed named direct and deferred tools from lookup and nested execution. Exclusion survived subsequent registration and activation attempts; excluded fixture execute functions were never called.
- Removing a deferred tool from the active set, including `defaultTools: ["-probe_deferred"]`, did **not** remove nested callability. These select declarations, not an authorization/denial boundary. Do not equate them with `excludeTools`.
- Explicitly installed native tool-search discovered and activated a deferred fixture; native codemode called it and received its structured value. A hidden fixture was absent from the exposed listing. SDK built-ins were absent when not installed, when their named builtin resources were disabled, and with `noExtensions`; the separately supplied inline direct fixture still worked. This exercises SDK builtin resource selection, not every CLI mode or a finished package's fallback implementation.
- Nested schema validation and `tool_call` blocking prevented execution. A `tool_result` hook replacing content also removed the original structured secret. A typed error remained `isError: true` directly, but a codemode script could return its structured error data with an outer successful result. Outer script success must not replace the operation's typed outcome.

## Model-visible results

The same final-result fixture was retrieved through native codemode with its output discarded, reduced to the job identifier, and fully forwarded. Each inner invocation produced a successful `tool_result` event. The next synthetic provider context contained only the outer script's chosen text; discarded results and omitted outcome fields were not restored by nested call metadata. A direct tool invocation returned its final content normally.

This concretely rejects nested success, `structuredContent`, and `nestedCalls` as standalone delivery receipts. It does **not** implement a trustworthy arbitrary-script receipt mechanism or prove automatic delivery/deduplication. Keep [[REQ-JOBS-DELIVERY-RECEIPTS]] unchanged; conservative pending state and the eventual identifiable receipt path still require design. Do not replace it with arbitrary identifier text searches.

## Selected and dispatched models

With Pi's real OpenAI Responses transport, physical and native virtual selections both reached the loopback physical model. In the virtual case, `ctx.model` at request/header hooks remained the virtual selection. `before_provider_headers` exposed only type/headers; `before_provider_request` exposed type/payload, whose model string did not identify the provider/authentication. Headers ran first. `provider_stream_event` exposed physical provider/API/model after dispatch, and the finalized assistant message recorded the physical model.

This supports honest selected-to-observed-model presentation, not a safe pre-dispatch identity proof for routed fast-service mutation. [[REQ-FAST-ELIGIBILITY]] already requires unsupported/no mutation when identity or capability cannot be established. No live fast-service capability, Codex OAuth request, alias resolution or arbitrary third-party router was tested.

## Classifier accounting and activity

- Calling `ctx.modelRegistry.classify()` inside a fixture tool did not automatically attribute its returned usage. Explicitly returning the tool's own usage did; when called through codemode, nested usage appeared once on the outer tool result. Native `models.classify()` inside codemode attributed its own usage automatically. These mechanisms must not be combined to double count the same call.
- An idle extension command's classifier call appended no native usage entry and produced no monitored agent/tool activity events. An outstanding manual classifier request still reported `ctx.isIdle() === true` with no operation signal. [[REQ-CAFFEINATE-AUTO-HOLD]] therefore cannot rely on assistant activity alone; its public activity or generic-gate integration remains necessary.
- The public extension context declares a read-only session manager without `appendUsage`; that method exists on the host SDK's full SessionManager, not the supported extension surface. No supported non-tool usage writer was found. This remains an integration gap, not permission to cast away the readonly contract, fabricate tool results, misuse compaction entries or introduce a second accounting protocol.
- A fixture returning the minimal classifier usage shape allowed by the native type (no cache counters) reached codemode unchanged; the SDK's session-stat token sums became non-finite, serialized as null, while cost remained correct. The tested real System One success returned complete cache counters. Consumers must handle optional/missing accounting honestly; this is not evidence that the reference provider always returns incomplete usage.

## Timeout, retries and lifecycle

- The real System One transport retried a synthetic HTTP 503 twice by default: three attempts. Passing `maxRetries: 0` made one attempt. A separate stalled request with a five-second AbortSignal ended aborted at about five seconds, making one attempt. Agent-level retry was disabled in the fixture; it did not disable classifier transport retries.
- The agreed no-extension-added-retry policy does not yet decide how to configure native retries. A whole-call deadline must include retries/authentication rather than treating a per-attempt timeout as the total bound. Unknown or failed-request accounting remains unresolved; the probe does not prove a zero-cost failure or a spending-reservation implementation.
- A cooperating synthetic classifier propagated cancellation as an aborted result and exceptions as error results. A synthetic provider that ignored its signal returned success after the deadline: ModelRegistry did not race it into a hard timeout. Deadline/result-revision checks must not assume all providers cooperate; physical cancellation, resource release and late usage require an honest policy.
- Reload emitted shutdown/start with reason reload, preserved session identity, and invalidated captured APIs. New/resume/fork and quit had distinct lifecycle reasons; `withSession` callbacks received fresh session contexts. A classifier already running without a signal survived reload, but its old Pi API refused to append the late result. Stale-context protection does not replace goal/evidence revision checks.
- Aborting a run cancelled an outstanding nested call. A completed nested tool's supplied signal was detached before a later outer-script abort; a completed direct tool's signal still became aborted when the same run was cancelled. Managed handoff must therefore explicitly establish independent ownership and detach foreground cancellation consistently, not infer it from returning a value. These are signal-only fixtures, not real process-tree shutdown or completion-race verification.
- Input events distinguished interactive from extension input. Tool-turn and settlement events exposed turn indexes and conversation context, but no goal-ownership field; turn indexes restarted for each run. A custom continuation retained its custom type in context. Deterministic goal-directed turn tracking still needs design; neither every active-goal conversation turn nor every extension-originated turn is automatically goal work.

## Limitations and next decisions

Overall result is **inconclusive for the linked full verification methods**. The probes establish useful native seams and specific limits, not workflow implementation, complete namespace/provider compatibility, delivery receipts, classifier budgets/temporal policy, OS inhibition or real managed execution. They do not cover interactive/print/JSON/RPC parity, reload handoff of real processes, or every provider. No implementation item was closed and the Work graph was not resequenced.

Before further implementation, resolve non-tool usage attribution, the identifiable nested delivery path, native retry/deadline accounting, exact tool names/disablement semantics, goal-turn ownership and managed cancellation handoff. Any proposal to change Pi, relax a contract, or alter campaign prerequisites requires separate agreement; these findings do not authorize an upstream submission, dependency upgrade or campaign restart.
:::

## Reproduction

Use the repository's installed Pi 0.99.1 development dependency and Node 26.7.0.
The fixtures need no new dependency install. Extract the named text blocks from
[the artifact record](pi-0991-native-probe-data.mara.md) into a fresh directory
outside the checkout. For example, from this repository root:

```sh
set -e
probe="$(mktemp -d "$HOME/.cache/pi-native-replay.XXXXXX")"
python3 - "$probe" <<'PY'
import pathlib, re, sys
source = pathlib.Path("docs/pi-0991-native-probe-data.mara.md").read_text()
destination = pathlib.Path(sys.argv[1])
for name, _, content in re.findall(r"^## ([^\n]+)\n\n(`{3,})text\n([\s\S]*?)\n\2$", source, re.M):
    assert pathlib.Path(name).name == name
    (destination / name).write_text(content + "\n")
PY
node --input-type=module -e '
  import {createRequire} from "node:module";
  const sdk=import.meta.resolve("@earendil-works/pi-coding-agent");
  console.log(JSON.stringify({
    sdk,
    ai:new URL("../../pi-ai/dist/index.js",sdk).href,
    typebox:createRequire(sdk).resolve("@sinclair/typebox")
  }));
' > "$probe/imports.json"
mkdir -p "$probe/home" "$probe/workspace"
printf 'Replay directory: %s\n' "$probe"
for file in tools classifiers lifecycle additional exposure; do
  unshare --user --map-root-user --net env -i PATH="$PATH" \
    HOME="$probe/home" PI_OFFLINE=1 PROBE_OUTPUT="$file-results.json" \
    node "$probe/$file.mjs" || exit
done
unshare --user --map-root-user --net sh -c '
  ip link set lo up &&
  env -i PATH="$PATH" HOME="$1/home" PI_OFFLINE=1 \
    PROBE_OUTPUT=wire-results.json node "$1/wire.mjs"
' sh "$probe"
```

The import map resolves the SDK's public entry and its own Pi AI/TypeBox copies
without adding repository dependencies; the System One fixture uses Pi AI's
exported `api/typesafe-system-one` implementation. If user/network namespaces
are unavailable, report unavailable isolation rather than running this against
ordinary network access or live credentials. Do not replay the earlier live
classifier benchmark.

The final fixture run followed corrections to fixture setup: required provider
metadata and classifier implementation registration, a referenced timer for a
signal-only wait, single binding per replacement session, and waiting for actual
settlement after fire-and-forget extension messaging. These were fixture defects,
not product regressions. Fresh runs vary in IDs, ports and timings; compare
observable assertions and outcomes rather than byte-identical result JSON.

The documented extraction/replay command was also executed in a fresh directory,
`/home/araketski/.cache/pi-native-replay.Hp5UrK/`: all six scripts completed and
all 21 scenarios were recorded again. All 13 archived source/result blocks were
byte-compared with the original final files after formatting; all matched.
