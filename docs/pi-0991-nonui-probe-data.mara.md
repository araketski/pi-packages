# Pi 0.99.1 non-UI probe sources and observations

See [the report](pi-0991-nonui-probes.mara.md) for scope, limitations and replay.
Four source blocks reproduce the isolated native CLI observations. The final
block is a bounded summary with source/raw-artifact hashes, not a complete
transcript archive. All five blocks preserve the captured source bytes when
extracted as documented. These fixtures are not workflow implementations.

## fixture.ts

```text
// Synthetic offline host fixture, not a workflow implementation.
import { appendFileSync } from 'node:fs';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai';
import { Type } from '@sinclair/typebox';

export default function (pi) {
  const scenario = process.env.PROBE_SCENARIO;
  const trace = (type, data = {}) => appendFileSync(process.env.PROBE_TRACE, JSON.stringify({ at: Date.now(), type, ...data }) + '\n');
  const delay = Number(process.env.PROBE_DELAY ?? 600);
  let requests = 0, jobTimer, pending = false, complete = false, submitted = false;
  let resolveJob;
  const job = new Promise(resolve => { resolveJob = resolve; });
  let startupResolve;
  const startupSettled = new Promise(resolve => { startupResolve = resolve; });
  const startup = scenario.startsWith('startup');
  const hold = ['hold', 'hold-queued', 'abort', 'signal', 'boundary-error'].includes(scenario);
  pi.registerFlag('goal', { type: 'string', description: 'Synthetic startup probe objective, not the goal package' });
  pi.registerProvider('probe', {
    api: 'nonui-probe', baseUrl: 'http://127.0.0.1:1/unused', apiKey: 'synthetic-not-a-credential',
    models: [{ id: 'physical', name: 'Offline synthetic fixture', api: 'nonui-probe', input: ['text'], reasoning: false,
      contextWindow: 100000, maxTokens: 2048, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    streamSimple(model, context, options) {
      const count = ++requests;
      trace('request', { count, messages: context.messages.map(m => ({ role: m.role, content: m.content })) });
      const stream = new AssistantMessageEventStream();
      let ended = false;
      const finish = aborted => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', onAbort);
        const sawResult = JSON.stringify(context.messages).includes('FINAL_RESULT_PASS');
        const content = aborted ? [] : startup ? [{ type: 'text', text: 'STARTUP_DONE' }] : count === 1 ?
          [{ type: 'toolCall', id: 'launch-1', name: 'probe_launch', arguments: {} }] :
          [{ type: 'text', text: sawResult ? 'REVIEW_DONE' : 'WAITING_FOR_TESTS' }];
        const message = { role: 'assistant', content, api: model.api, provider: model.provider, model: model.id,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: aborted ? 'aborted' : content.some(c => c.type === 'toolCall') ? 'toolUse' : 'stop', timestamp: Date.now() };
        if (aborted) {
          message.errorMessage = 'Synthetic cooperative abort';
          trace('provider-aborted', { count });
          stream.push({ type: 'error', reason: 'aborted', error: message });
        } else {
          stream.push({ type: 'start', partial: { ...message, content: [], stopReason: 'pending' } });
          for (const [i, c] of content.entries()) {
            if (c.type === 'toolCall') {
              stream.push({ type: 'toolcall_start', contentIndex: i, partial: message });
              stream.push({ type: 'toolcall_end', contentIndex: i, toolCall: c, partial: message });
            } else {
              stream.push({ type: 'text_start', contentIndex: i, partial: message });
              stream.push({ type: 'text_delta', contentIndex: i, delta: c.text, partial: message });
              stream.push({ type: 'text_end', contentIndex: i, content: c.text, partial: message });
            }
          }
          stream.push({ type: 'done', reason: message.stopReason, message });
          trace('provider-done', { count, sawResult, text: content.filter(c => c.type === 'text').map(c => c.text).join('') });
        }
        stream.end();
      };
      const onAbort = () => finish(true);
      const timer = setTimeout(() => finish(false), startup ? 100 : 5);
      options?.signal?.addEventListener('abort', onAbort, { once: true });
      if (options?.signal?.aborted) finish(true);
      return stream;
    }
  });
  pi.registerTool({ name: 'probe_launch', label: 'Synthetic delayed work', description: 'Start a timer-only synthetic job', parameters: Type.Object({}),
    execute: async (_id, _args, signal) => {
      pending = true;
      trace('job-started', { signal: !!signal });
      signal?.addEventListener('abort', () => trace('launch-signal-aborted'), { once: true });
      jobTimer = setTimeout(() => {
        pending = false; complete = true;
        trace('job-completed');
        if (scenario === 'hold-queued') {
          pi.sendMessage({ customType: 'probe-result', content: 'FINAL_RESULT_PASS', display: false }, { triggerTurn: true, deliverAs: 'followUp' });
          trace('result-queued');
          submitted = true;
        }
        resolveJob();
      }, delay);
      return { content: [{ type: 'text', text: 'job-1 running' }], details: { job: 'job-1', status: 'running' } };
    }
  });
  pi.on('input', event => {
    trace('input', { source: event.source, text: event.text });
    if (scenario === 'startup-input' && pi.getFlag('goal')) {
      return { action: 'transform', text: `OBJECTIVE: ${pi.getFlag('goal')}\nCONTEXT: ${event.text}` };
    }
  });
  pi.on('session_start', async (event, ctx) => {
    trace('session-start', { reason: event.reason, mode: ctx.mode, goal: pi.getFlag('goal'), signal: !!ctx.signal });
    if (event.reason === 'startup' && ['startup-fire', 'startup-await'].includes(scenario)) {
      pi.sendUserMessage(String(pi.getFlag('goal')));
      trace('startup-sent');
      if (scenario === 'startup-await') {
        await startupSettled;
        trace('startup-handler-returned');
      }
    }
  });
  pi.on('agent_start', () => trace('agent-start'));
  pi.on('agent_end', () => trace('agent-end'));
  pi.on('agent_settled', () => { trace('agent-settled', { pending, complete, submitted }); startupResolve(); });
  pi.on('agent_before_settle', async (event, ctx) => {
    trace('boundary', { pending, complete, submitted, outcome: event.outcome, signal: !!ctx.signal, idle: ctx.isIdle() });
    if (!hold || submitted) return;
    if (scenario === 'boundary-error') throw new Error('Synthetic boundary failure');
    trace('wait-start', { signal: !!ctx.signal, aborted: ctx.signal?.aborted });
    ctx.signal?.addEventListener('abort', () => trace('wait-signal-aborted'), { once: true });
    await job;
    trace('wait-end', { signal: !!ctx.signal, aborted: ctx.signal?.aborted });
    if (scenario === 'hold-queued') return;
    if (complete) {
      submitted = true;
      trace('result-proposed');
      return { entries: [{ type: 'custom_message', customType: 'probe-result', content: 'FINAL_RESULT_PASS', display: false }], continue: true };
    }
  });
  pi.on('session_shutdown', event => {
    trace('session-shutdown', { reason: event.reason, pending, complete });
    clearTimeout(jobTimer);
    // Release this fixture's wait; this is not production cancellation or an exit receipt.
    resolveJob();
  });
}
```

## run.mjs

```text
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = dirname(fileURLToPath(import.meta.url));
const cli = process.env.PROBE_PI;
assert.ok(cli, 'PROBE_PI must identify the isolated CLI executable');
const records = [];
const cases = [
  ['unguarded-print', 'unprotected', 'print'],
  ['unguarded-json', 'unprotected', 'json'],
  ['guarded-print', 'hold', 'print'],
  ['guarded-json', 'hold', 'json'],
  ['queued-result-json', 'hold-queued', 'json'],
  ['guarded-rpc', 'hold', 'rpc'],
  ['abort-rpc', 'abort', 'rpc', { control: 'abort', delay: 1800 }],
  ['sigterm-json', 'signal', 'json', { control: 'SIGTERM', delay: 1800 }],
  ['startup-flag-only-json', 'startup-passive', 'json', { goal: true, noPrompt: true }],
  ['startup-fire-json', 'startup-fire', 'json', { goal: true, noPrompt: true }],
  ['startup-fire-print', 'startup-fire', 'print', { goal: true, noPrompt: true }],
  ['startup-await-json', 'startup-await', 'json', { goal: true, noPrompt: true }],
  ['startup-await-print', 'startup-await', 'print', { goal: true, noPrompt: true }],
  ['startup-input-json', 'startup-input', 'json', { goal: true, message: 'Keep the public API unchanged' }],
  ['startup-piped-print', 'startup-input', 'print', { goal: true, message: 'Keep the public API unchanged', stdin: 'Synthetic test observations\n' }],
  ['help-goal', 'startup-passive', 'print', { goal: true, help: true, noPrompt: true }],
  ['boundary-error-json', 'boundary-error', 'json'],
];
function lines(path) {
  try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function execute(name, scenario, mode, options) {
  const directory = join(root, 'cases', name);
  const home = join(directory, 'home');
  const cwd = join(directory, 'workspace');
  mkdirSync(join(home, '.pi', 'agent'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(home, '.pi', 'agent', 'settings.json'), JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false }, quietStartup: true }));
  const tracePath = join(directory, 'trace.jsonl');
  writeFileSync(tracePath, '');
  const args = ['--offline', '--no-approve', '--no-session', '--no-extensions', '--extension', join(root, 'fixture.ts'),
    '--no-skills', '--no-themes', '--no-prompt-templates', '--no-context-files', '--provider', 'probe', '--model', 'physical',
    '--thinking', 'off', '--tools', 'probe_launch', ...(mode === 'print' ? ['--print'] : ['--mode', mode])];
  if (options.goal) args.push('--goal', 'Fix synthetic login failure');
  if (options.help) args.push('--help');
  if (mode !== 'rpc' && !options.noPrompt) args.push(options.message ?? 'Synthetic review; launch tests and wait for their result');
  const started = Date.now();
  const child = spawn(cli, args, { cwd, env: { PATH: process.env.PATH, HOME: home, PI_OFFLINE: '1',
    PROBE_SCENARIO: scenario, PROBE_TRACE: tracePath, PROBE_DELAY: String(options.delay ?? 600), TERM: 'dumb', NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', buffer = '', watchdogFired = false, controlled = false;
  const protocol = [], controls = [];
  child.stdin.on('error', error => controls.push({ type: 'stdin-error', error: error.code, at: Date.now() }));
  child.stdout.on('data', data => {
    stdout += data.toString();
    if (mode !== 'rpc') return;
    buffer += data.toString();
    while (buffer.includes('\n')) {
      const i = buffer.indexOf('\n'), line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line); protocol.push({ at: Date.now(), event });
        if (event.type === 'agent_settled') {
          // Keep RPC alive briefly so an abort acknowledgement is not lost to client EOF.
          setTimeout(() => { if (!child.stdin.destroyed) child.stdin.end(); }, 100);
        }
      } catch { controls.push({ type: 'non-json-stdout', line }); }
    }
  });
  child.stderr.on('data', data => { stderr += data.toString(); });
  if (mode === 'rpc') child.stdin.write(JSON.stringify({ id: 'prompt-1', type: 'prompt', message: 'Synthetic review; launch tests and wait for their result' }) + '\n');
  else child.stdin.end(options.stdin ?? '');
  const poll = setInterval(() => {
    if (!options.control || controlled || !lines(tracePath).some(x => x.type === 'wait-start')) return;
    controlled = true;
    controls.push({ type: options.control, at: Date.now() });
    if (options.control === 'abort') child.stdin.write(JSON.stringify({ id: 'abort-1', type: 'abort' }) + '\n');
    else child.kill(options.control);
  }, 10);
  const watchdog = setTimeout(() => {
    watchdogFired = true;
    controls.push({ type: 'watchdog-SIGKILL', at: Date.now() });
    child.kill('SIGKILL');
  }, 7000);
  const exit = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  clearInterval(poll); clearTimeout(watchdog);
  const trace = lines(tracePath);
  writeFileSync(join(directory, 'stdout.txt'), stdout);
  writeFileSync(join(directory, 'stderr.txt'), stderr);
  writeFileSync(join(directory, 'control.json'), JSON.stringify({ args, controls, exit, watchdogFired, protocol }, null, 2) + '\n');
  const events = mode === 'rpc' ? protocol.map(x => x.event) : mode === 'json' ? stdout.split('\n').filter(Boolean).map(x => JSON.parse(x)) : [];
  const requests = trace.filter(x => x.type === 'request');
  const wait = trace.find(x => x.type === 'wait-start');
  const completed = trace.find(x => x.type === 'job-completed');
  const settled = trace.find(x => x.type === 'agent-settled');
  const abortAck = protocol.find(x => x.event.id === 'abort-1');
  const action = controls.find(x => x.type === options.control);
  return { name, scenario, mode, exit, elapsedMs: Date.now() - started, watchdogFired,
    requests: requests.length, modelSawFinalResult: requests.some(x => JSON.stringify(x.messages).includes('FINAL_RESULT_PASS')),
    jobCompleted: !!completed, settledWithPending: settled?.pending, waitSignal: wait?.signal,
    abortAcknowledgementMs: abortAck && action ? abortAck.at - action.at : undefined,
    signalExitMs: action && options.control === 'SIGTERM' ? Date.now() - action.at : undefined,
    emittedAgentStarts: events.filter(x => x.type === 'agent_start').length,
    observedAgentStarts: trace.filter(x => x.type === 'agent-start').length,
    emittedSettled: events.filter(x => x.type === 'agent_settled').length,
    finalText: mode === 'print' && !options.help ? stdout.trim() : trace.filter(x => x.type === 'provider-done').at(-1)?.text,
    registeredGoalInHelp: options.help ? stdout.includes('--goal') : undefined,
    outputAssistantTexts: events.filter(x => x.type === 'message_end' && x.message?.role === 'assistant').flatMap(x => x.message.content.filter(c => c.type === 'text').map(c => c.text)),
    stderr, trace, controls, protocol, events };
}
for (const [name, scenario, mode, options = {}] of cases) {
  let record;
  try {
    record = await execute(name, scenario, mode, options);
    assert.equal(record.watchdogFired, false, 'external safety deadline was needed');
    assert.ok(!record.stderr.includes('Failed to load extension'), record.stderr);
    if (['hold', 'hold-queued'].includes(scenario)) {
      assert.equal(record.exit.code, 0, record.stderr);
      assert.equal(record.requests, 3);
      assert.equal(record.jobCompleted, true);
      assert.equal(record.modelSawFinalResult, true);
      assert.equal(record.settledWithPending, false);
      assert.equal(record.finalText, 'REVIEW_DONE');
      const end = record.trace.findIndex(x => x.type === 'job-completed');
      assert.equal(record.trace.slice(0, end).filter(x => x.type === 'request').length, 2, 'model polling while pending');
    } else if (scenario === 'unprotected') {
      assert.equal(record.requests, 2);
      assert.equal(record.jobCompleted, false);
      assert.equal(record.settledWithPending, true);
      assert.equal(record.finalText, 'WAITING_FOR_TESTS');
    } else if (scenario === 'startup-input') {
      assert.equal(record.requests, 1);
      const input = record.trace.find(x => x.type === 'request');
      assert.ok(JSON.stringify(input.messages).includes('OBJECTIVE: Fix synthetic login failure'));
      assert.ok(JSON.stringify(input.messages).includes('CONTEXT:'));
      if (options.stdin) assert.ok(JSON.stringify(input.messages).includes('Synthetic test observations'));
    } else if (scenario === 'abort') {
      assert.equal(record.waitSignal, false);
      assert.equal(record.requests, 2);
      assert.equal(record.jobCompleted, true);
      assert.equal(record.modelSawFinalResult, false);
      assert.ok(record.abortAcknowledgementMs >= options.delay / 2, 'abort unexpectedly interrupted the boundary wait');
      assert.equal(record.trace.some(x => x.type === 'wait-signal-aborted' || x.type === 'launch-signal-aborted'), false);
    } else if (scenario === 'signal') {
      assert.equal(record.exit.code, 143);
      assert.equal(record.jobCompleted, false);
      assert.ok(record.trace.some(x => x.type === 'session-shutdown'));
      assert.equal(record.modelSawFinalResult, false);
    } else if (scenario === 'startup-fire') {
      assert.ok(record.requests <= 1);
      assert.equal(record.trace.some(x => x.type === 'provider-done'), false);
      assert.equal(record.emittedAgentStarts, 0);
    } else if (scenario === 'startup-await') {
      assert.equal(record.requests, 1);
      assert.equal(record.finalText, 'STARTUP_DONE');
      assert.equal(record.observedAgentStarts, 1);
      assert.equal(record.emittedAgentStarts, 0);
      assert.equal(record.emittedSettled, 0);
      if (mode === 'json') assert.deepEqual(record.outputAssistantTexts, []);
    } else if (scenario === 'boundary-error') {
      assert.equal(record.exit.code, 0);
      assert.equal(record.settledWithPending, true);
      assert.equal(record.jobCompleted, false);
      assert.ok(record.stderr.includes('Synthetic boundary failure'));
    } else if (options.help) {
      assert.equal(record.requests, 0); assert.equal(record.registeredGoalInHelp, true);
      assert.equal(record.trace.some(x => x.type === 'session-start'), false);
    } else if (scenario === 'startup-passive') {
      assert.equal(record.requests, 0);
      assert.ok(record.trace.some(x => x.type === 'session-start' && x.goal === 'Fix synthetic login failure'));
    }
    record.status = 'observed';
  } catch (error) {
    record = { ...record, name, status: 'failed', error: String(error), stack: error.stack };
    process.exitCode = 1;
  }
  records.push(record);
  writeFileSync(join(root, 'results.json'), JSON.stringify(records, null, 2) + '\n');
  const { trace, controls, protocol, events, ...summary } = record;
  console.log(JSON.stringify(summary));
}
```

## summarize.mjs

```text
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = dirname(fileURLToPath(import.meta.url));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const results = JSON.parse(readFileSync(join(root, 'results.json'), 'utf8'));
assert.equal(results.length, 17);
assert.ok(results.every(r => r.status === 'observed'));
const routes = JSON.parse(readFileSync(join(root, 'routes.json'), 'utf8'));
assert.deepEqual(routes, []);
const observations = {
  subjectRevision: 'eb988f68b7039faf38072d349d9071db9930cc7a',
  capturedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch, cli: process.env.PROBE_PI, cliVersion: '0.99.1', cliSha256: sha(process.env.PROBE_PI) },
  isolation: { outerDriver: 'unshare --user --map-root-user --net', inheritedEnvironment: false, networkRoutes: routes, provider: 'in-process synthetic only', externalInferenceCalls: 0 },
  sources: Object.fromEntries(['fixture.ts', 'run.mjs', 'summarize.mjs', 'replay.sh'].map(name => [name, sha(join(root, name))])),
  rawResultsSha256: sha(join(root, 'results.json')),
  note: 'Bounded observations, not full raw transcript archives. stdout/stderr/control/trace files are generated under cases/ on every run. Fixture submitted means a draft or queue operation, NOT a delivery receipt. Synthetic timer completion is NOT process exit.',
  records: results.map(({trace, controls, protocol, events, stderr, ...summary}) => ({
    ...summary, stderr: stderr.replaceAll(root, '<probe-root>'),
    controls,
    timing: trace.map(({at, messages, ...event}) => ({ms: at - trace[0].at, ...event,
      ...(messages ? {messageRoles: messages.map(m => m.role), sawFinalResult: JSON.stringify(messages).includes('FINAL_RESULT_PASS')} : {})})),
    jsonEventTypes: events.map(e => e.type),
    rawFiles: Object.fromEntries(['trace.jsonl', 'stdout.txt', 'stderr.txt', 'control.json'].map(name => [name, sha(join(root, 'cases', summary.name, name))]))
  }))
};
writeFileSync(join(root, 'observations.json'), JSON.stringify(observations, null, 2) + '\n');
console.log(JSON.stringify({scenarios: results.length, status: 'observed', sourceHashes: observations.sources}));
```

## replay.sh

```text
#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
: "${PROBE_PI:?Set PROBE_PI to the installed Pi 0.99.1 executable}"
mkdir -p "$root/home"
unshare --user --map-root-user --net env -i PATH="$PATH" HOME="$root/home" PI_OFFLINE=1 PROBE_PI="$PROBE_PI" PROBE_ROOT="$root" /bin/sh -eu -c '
  test "$("$PROBE_PI" --version)" = "0.99.1"
  ip -j route > "$PROBE_ROOT/routes.json"
  node "$PROBE_ROOT/run.mjs"
  node "$PROBE_ROOT/summarize.mjs"
'
```

## observations.json

```text
{
  "subjectRevision": "eb988f68b7039faf38072d349d9071db9930cc7a",
  "capturedAt": "2026-09-30T12:33:53.647Z",
  "runtime": {
    "node": "v26.7.0",
    "platform": "linux",
    "arch": "x64",
    "cli": "/home/araketski/.local/share/mise/installs/pi/0.99.1/pi/pi",
    "cliVersion": "0.99.1",
    "cliSha256": "be050f18fadcf2b5323f5473454505271a6f6e9dca2c00cc719a6398c19133c6"
  },
  "isolation": {
    "outerDriver": "unshare --user --map-root-user --net",
    "inheritedEnvironment": false,
    "networkRoutes": [],
    "provider": "in-process synthetic only",
    "externalInferenceCalls": 0
  },
  "sources": {
    "fixture.ts": "86f472ea5c4a8af9b106a6e9bf1673fba0710c061f39545766ad598261f06ca6",
    "run.mjs": "0502710a0883c81ff210a2dada87944afba9c0924c524a5d1a29d7e7c1ec0d0a",
    "summarize.mjs": "6a74bacc56579b15d402fdb45c30a6031ae3f928559c5c9edb81cb1acff23df2",
    "replay.sh": "11f4be9c9e572cf4b725abd30fd36b5415536778cfc4dff4e9cc68b06c3d1133"
  },
  "rawResultsSha256": "32f518eb2b5cae8a9d856ba95f526ebd7028f2aba948c800b2d3e5de2a49732d",
  "note": "Bounded observations, not full raw transcript archives. stdout/stderr/control/trace files are generated under cases/ on every run. Fixture submitted means a draft or queue operation, NOT a delivery receipt. Synthetic timer completion is NOT process exit.",
  "records": [
    {
      "name": "unguarded-print",
      "scenario": "unprotected",
      "mode": "print",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 267,
      "watchdogFired": false,
      "requests": 2,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": true,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 1,
      "emittedSettled": 0,
      "finalText": "WAITING_FOR_TESTS",
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "print",
          "signal": false
        },
        {
          "ms": 0,
          "type": "input",
          "source": "interactive",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 4,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 13,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 14,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 15,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 20,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 20,
          "type": "agent-end"
        },
        {
          "ms": 21,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 21,
          "type": "agent-settled",
          "pending": true,
          "complete": false,
          "submitted": false
        },
        {
          "ms": 21,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": true,
          "complete": false
        }
      ],
      "jsonEventTypes": [],
      "rawFiles": {
        "trace.jsonl": "8f9df85cce2b2c02c5d4af15465359c396bb051edb87c0ccc52ad0bd1a815fee",
        "stdout.txt": "f15b202da3501a279a341b5f5d760fe905d9e1c6c527ce2a4d9210c2a520235d",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "d42eea870a1792b2e491379d90e47f13b20844e60fcc7969c62195331f80ad96"
      }
    },
    {
      "name": "unguarded-json",
      "scenario": "unprotected",
      "mode": "json",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 266,
      "watchdogFired": false,
      "requests": 2,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": true,
      "emittedAgentStarts": 1,
      "observedAgentStarts": 1,
      "emittedSettled": 1,
      "finalText": "WAITING_FOR_TESTS",
      "outputAssistantTexts": [
        "WAITING_FOR_TESTS"
      ],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "signal": false
        },
        {
          "ms": 0,
          "type": "input",
          "source": "interactive",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 4,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 12,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 13,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 14,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 20,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 20,
          "type": "agent-end"
        },
        {
          "ms": 21,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 21,
          "type": "agent-settled",
          "pending": true,
          "complete": false,
          "submitted": false
        },
        {
          "ms": 21,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": true,
          "complete": false
        }
      ],
      "jsonEventTypes": [
        "session",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_end",
        "tool_execution_start",
        "tool_execution_end",
        "message_start",
        "message_end",
        "turn_end",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "agent_settled"
      ],
      "rawFiles": {
        "trace.jsonl": "1768cd2ff07f534f1303aba2f4947e2d6fccd3f32e8ed004621787e4e73b2205",
        "stdout.txt": "090a7eded2a047be00e55250458f8a57ce1880a7ed4ab16524724c7b40d4a66f",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "91c2d3bf51054596bbbd5a400e018e8d4fd22c84f0e8a9b6bb0d3267eb2c5500"
      }
    },
    {
      "name": "guarded-print",
      "scenario": "hold",
      "mode": "print",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 868,
      "watchdogFired": false,
      "requests": 3,
      "modelSawFinalResult": true,
      "jobCompleted": true,
      "settledWithPending": false,
      "waitSignal": false,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 2,
      "emittedSettled": 0,
      "finalText": "REVIEW_DONE",
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "print",
          "signal": false
        },
        {
          "ms": 0,
          "type": "input",
          "source": "interactive",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 4,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 12,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 13,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 14,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 19,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 19,
          "type": "agent-end"
        },
        {
          "ms": 20,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 20,
          "type": "wait-start",
          "signal": false
        },
        {
          "ms": 613,
          "type": "job-completed"
        },
        {
          "ms": 613,
          "type": "wait-end",
          "signal": false
        },
        {
          "ms": 613,
          "type": "result-proposed"
        },
        {
          "ms": 614,
          "type": "agent-start"
        },
        {
          "ms": 614,
          "type": "request",
          "count": 3,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult",
            "assistant",
            "user"
          ],
          "sawFinalResult": true
        },
        {
          "ms": 619,
          "type": "provider-done",
          "count": 3,
          "sawResult": true,
          "text": "REVIEW_DONE"
        },
        {
          "ms": 619,
          "type": "agent-end"
        },
        {
          "ms": 619,
          "type": "boundary",
          "pending": false,
          "complete": true,
          "submitted": true,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 620,
          "type": "agent-settled",
          "pending": false,
          "complete": true,
          "submitted": true
        },
        {
          "ms": 620,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": true
        }
      ],
      "jsonEventTypes": [],
      "rawFiles": {
        "trace.jsonl": "b27d0848874743caa4151d4aff057daa9d9f5994dc2362804f5f25c562a0d1a0",
        "stdout.txt": "71c1afa2f2306b4b313b508c2453ba427c4bfafe5a68f486e3de94e7d8dc8e92",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "d42eea870a1792b2e491379d90e47f13b20844e60fcc7969c62195331f80ad96"
      }
    },
    {
      "name": "guarded-json",
      "scenario": "hold",
      "mode": "json",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 864,
      "watchdogFired": false,
      "requests": 3,
      "modelSawFinalResult": true,
      "jobCompleted": true,
      "settledWithPending": false,
      "waitSignal": false,
      "emittedAgentStarts": 2,
      "observedAgentStarts": 2,
      "emittedSettled": 1,
      "finalText": "REVIEW_DONE",
      "outputAssistantTexts": [
        "WAITING_FOR_TESTS",
        "REVIEW_DONE"
      ],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "signal": false
        },
        {
          "ms": 0,
          "type": "input",
          "source": "interactive",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 4,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 10,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 11,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 12,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 17,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 17,
          "type": "agent-end"
        },
        {
          "ms": 18,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 18,
          "type": "wait-start",
          "signal": false
        },
        {
          "ms": 611,
          "type": "job-completed"
        },
        {
          "ms": 612,
          "type": "wait-end",
          "signal": false
        },
        {
          "ms": 612,
          "type": "result-proposed"
        },
        {
          "ms": 612,
          "type": "agent-start"
        },
        {
          "ms": 613,
          "type": "request",
          "count": 3,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult",
            "assistant",
            "user"
          ],
          "sawFinalResult": true
        },
        {
          "ms": 618,
          "type": "provider-done",
          "count": 3,
          "sawResult": true,
          "text": "REVIEW_DONE"
        },
        {
          "ms": 618,
          "type": "agent-end"
        },
        {
          "ms": 618,
          "type": "boundary",
          "pending": false,
          "complete": true,
          "submitted": true,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 618,
          "type": "agent-settled",
          "pending": false,
          "complete": true,
          "submitted": true
        },
        {
          "ms": 619,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": true
        }
      ],
      "jsonEventTypes": [
        "session",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_end",
        "tool_execution_start",
        "tool_execution_end",
        "message_start",
        "message_end",
        "turn_end",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "entry_appended",
        "agent_start",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "agent_settled"
      ],
      "rawFiles": {
        "trace.jsonl": "590d6a132cc7ad615a3dd12d175e21f8f7f2cc84179c4cc0c829d19f7b3cf1e1",
        "stdout.txt": "fa18427c886750837d5b4f7c60b2936817777dc5d1df44a415e8393b240c80ea",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "91c2d3bf51054596bbbd5a400e018e8d4fd22c84f0e8a9b6bb0d3267eb2c5500"
      }
    },
    {
      "name": "queued-result-json",
      "scenario": "hold-queued",
      "mode": "json",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 862,
      "watchdogFired": false,
      "requests": 3,
      "modelSawFinalResult": true,
      "jobCompleted": true,
      "settledWithPending": false,
      "waitSignal": false,
      "emittedAgentStarts": 2,
      "observedAgentStarts": 2,
      "emittedSettled": 1,
      "finalText": "REVIEW_DONE",
      "outputAssistantTexts": [
        "WAITING_FOR_TESTS",
        "REVIEW_DONE"
      ],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "signal": false
        },
        {
          "ms": 1,
          "type": "input",
          "source": "interactive",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 5,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 12,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 13,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 14,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 19,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 19,
          "type": "agent-end"
        },
        {
          "ms": 20,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 20,
          "type": "wait-start",
          "signal": false
        },
        {
          "ms": 614,
          "type": "job-completed"
        },
        {
          "ms": 614,
          "type": "result-queued"
        },
        {
          "ms": 614,
          "type": "wait-end",
          "signal": false
        },
        {
          "ms": 614,
          "type": "agent-start"
        },
        {
          "ms": 615,
          "type": "request",
          "count": 3,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult",
            "assistant",
            "user"
          ],
          "sawFinalResult": true
        },
        {
          "ms": 620,
          "type": "provider-done",
          "count": 3,
          "sawResult": true,
          "text": "REVIEW_DONE"
        },
        {
          "ms": 620,
          "type": "agent-end"
        },
        {
          "ms": 620,
          "type": "boundary",
          "pending": false,
          "complete": true,
          "submitted": true,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 621,
          "type": "agent-settled",
          "pending": false,
          "complete": true,
          "submitted": true
        },
        {
          "ms": 621,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": true
        }
      ],
      "jsonEventTypes": [
        "session",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_end",
        "tool_execution_start",
        "tool_execution_end",
        "message_start",
        "message_end",
        "turn_end",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "agent_settled"
      ],
      "rawFiles": {
        "trace.jsonl": "5c8a40fe0308181aee27c37c29223f6da750ed6478412aba4aa200cec401235a",
        "stdout.txt": "f12b8b940c71311e4f350095ea686b48d4677d8d2e8308ec976b8b0732844bcc",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "91c2d3bf51054596bbbd5a400e018e8d4fd22c84f0e8a9b6bb0d3267eb2c5500"
      }
    },
    {
      "name": "guarded-rpc",
      "scenario": "hold",
      "mode": "rpc",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 975,
      "watchdogFired": false,
      "requests": 3,
      "modelSawFinalResult": true,
      "jobCompleted": true,
      "settledWithPending": false,
      "waitSignal": false,
      "emittedAgentStarts": 2,
      "observedAgentStarts": 2,
      "emittedSettled": 1,
      "finalText": "REVIEW_DONE",
      "outputAssistantTexts": [
        "WAITING_FOR_TESTS",
        "REVIEW_DONE"
      ],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "rpc",
          "signal": false
        },
        {
          "ms": 2,
          "type": "input",
          "source": "rpc",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 4,
          "type": "agent-start"
        },
        {
          "ms": 6,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 14,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 16,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 17,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 22,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 22,
          "type": "agent-end"
        },
        {
          "ms": 23,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 23,
          "type": "wait-start",
          "signal": false
        },
        {
          "ms": 616,
          "type": "job-completed"
        },
        {
          "ms": 616,
          "type": "wait-end",
          "signal": false
        },
        {
          "ms": 616,
          "type": "result-proposed"
        },
        {
          "ms": 617,
          "type": "agent-start"
        },
        {
          "ms": 618,
          "type": "request",
          "count": 3,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult",
            "assistant",
            "user"
          ],
          "sawFinalResult": true
        },
        {
          "ms": 623,
          "type": "provider-done",
          "count": 3,
          "sawResult": true,
          "text": "REVIEW_DONE"
        },
        {
          "ms": 623,
          "type": "agent-end"
        },
        {
          "ms": 623,
          "type": "boundary",
          "pending": false,
          "complete": true,
          "submitted": true,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 624,
          "type": "agent-settled",
          "pending": false,
          "complete": true,
          "submitted": true
        },
        {
          "ms": 724,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": true
        }
      ],
      "jsonEventTypes": [
        "response",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_end",
        "tool_execution_start",
        "tool_execution_end",
        "message_start",
        "message_end",
        "turn_end",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "entry_appended",
        "agent_start",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "agent_settled"
      ],
      "rawFiles": {
        "trace.jsonl": "3f907430d7574ad8d65e4e31514c9d653ec2d5dd15f876ed65d79a32bccaaf19",
        "stdout.txt": "7a422fa60c5447b08214a0bcf0ae14ebbd8657c538a1b33b209ce335ccf820d1",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "6dff127710a62e4d1df927f6fcc4128dd6d5ca07dd1efa55a3faf416692c64c5"
      }
    },
    {
      "name": "abort-rpc",
      "scenario": "abort",
      "mode": "rpc",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 2153,
      "watchdogFired": false,
      "requests": 2,
      "modelSawFinalResult": false,
      "jobCompleted": true,
      "settledWithPending": false,
      "waitSignal": false,
      "abortAcknowledgementMs": 1786,
      "emittedAgentStarts": 1,
      "observedAgentStarts": 1,
      "emittedSettled": 1,
      "finalText": "WAITING_FOR_TESTS",
      "outputAssistantTexts": [
        "WAITING_FOR_TESTS"
      ],
      "status": "observed",
      "stderr": "",
      "controls": [
        {
          "type": "abort",
          "at": 1790771628790
        }
      ],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "rpc",
          "signal": false
        },
        {
          "ms": 2,
          "type": "input",
          "source": "rpc",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 4,
          "type": "agent-start"
        },
        {
          "ms": 6,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 14,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 15,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 16,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 21,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 21,
          "type": "agent-end"
        },
        {
          "ms": 22,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 22,
          "type": "wait-start",
          "signal": false
        },
        {
          "ms": 1815,
          "type": "job-completed"
        },
        {
          "ms": 1815,
          "type": "wait-end",
          "signal": false
        },
        {
          "ms": 1815,
          "type": "result-proposed"
        },
        {
          "ms": 1816,
          "type": "agent-settled",
          "pending": false,
          "complete": true,
          "submitted": true
        },
        {
          "ms": 1916,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": true
        }
      ],
      "jsonEventTypes": [
        "response",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_end",
        "tool_execution_start",
        "tool_execution_end",
        "message_start",
        "message_end",
        "turn_end",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "entry_appended",
        "agent_settled",
        "response"
      ],
      "rawFiles": {
        "trace.jsonl": "7fbfeae91d8d7566840ad60608b1c040b20480681d3bbc5b2e846a11eda54edb",
        "stdout.txt": "d1d651cc990b6a30de56c2ea778f8d084291438ecdcda9fe68c045c7db2cf69d",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "2cf65da9a916cb12859e7fb39b3fad86f390a0f23dd610f5c61a24bf323ac13b"
      }
    },
    {
      "name": "sigterm-json",
      "scenario": "signal",
      "mode": "json",
      "exit": {
        "code": 143,
        "signal": null
      },
      "elapsedMs": 271,
      "watchdogFired": false,
      "requests": 2,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": true,
      "waitSignal": false,
      "signalExitMs": 9,
      "emittedAgentStarts": 1,
      "observedAgentStarts": 1,
      "emittedSettled": 0,
      "finalText": "WAITING_FOR_TESTS",
      "outputAssistantTexts": [
        "WAITING_FOR_TESTS"
      ],
      "status": "observed",
      "stderr": "",
      "controls": [
        {
          "type": "SIGTERM",
          "at": 1790771630944
        }
      ],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "signal": false
        },
        {
          "ms": 1,
          "type": "input",
          "source": "interactive",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 5,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 12,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 13,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 15,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 20,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 20,
          "type": "agent-end"
        },
        {
          "ms": 21,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 21,
          "type": "wait-start",
          "signal": false
        },
        {
          "ms": 34,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": true,
          "complete": false
        },
        {
          "ms": 34,
          "type": "wait-end",
          "signal": false
        },
        {
          "ms": 34,
          "type": "agent-settled",
          "pending": true,
          "complete": false,
          "submitted": false
        }
      ],
      "jsonEventTypes": [
        "session",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_end",
        "tool_execution_start",
        "tool_execution_end",
        "message_start",
        "message_end",
        "turn_end",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end"
      ],
      "rawFiles": {
        "trace.jsonl": "2f2d5a199b321628e88a682cea59650eae52f8e3d7b824924555395eac479beb",
        "stdout.txt": "717b0f7ca188ab77e945ff6d5134101388c9ae7cae92e95326a8277eb18aa64f",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "8a80daa205df65bd64488e0bbcb3d1a48e6f4b0747e002ffcbdad2042cc7916c"
      }
    },
    {
      "name": "startup-flag-only-json",
      "scenario": "startup-passive",
      "mode": "json",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 241,
      "watchdogFired": false,
      "requests": 0,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 0,
      "emittedSettled": 0,
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "goal": "Fix synthetic login failure",
          "signal": false
        },
        {
          "ms": 1,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": false
        }
      ],
      "jsonEventTypes": [
        "session"
      ],
      "rawFiles": {
        "trace.jsonl": "f4b75f8fa87dfe3ee0dbf9c39d7d748575580995ff08412317413d0872697473",
        "stdout.txt": "8873f181c8d72ae519981a1624bc9f8f94c98c7a22bc57f6189c208347ea9728",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "1a887321655f86ee92044f14087b2b07a9963afef40ccca88db7e71620712bc2"
      }
    },
    {
      "name": "startup-fire-json",
      "scenario": "startup-fire",
      "mode": "json",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 256,
      "watchdogFired": false,
      "requests": 0,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": false,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 1,
      "emittedSettled": 0,
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "Extension error (<probe-root>/fixture.ts): This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().\n",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "goal": "Fix synthetic login failure",
          "signal": false
        },
        {
          "ms": 1,
          "type": "input",
          "source": "extension",
          "text": "Fix synthetic login failure"
        },
        {
          "ms": 1,
          "type": "startup-sent"
        },
        {
          "ms": 3,
          "type": "agent-start"
        },
        {
          "ms": 3,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": false
        },
        {
          "ms": 6,
          "type": "agent-settled",
          "pending": false,
          "complete": false,
          "submitted": false
        }
      ],
      "jsonEventTypes": [
        "session"
      ],
      "rawFiles": {
        "trace.jsonl": "6f845809ca7c857e8daed2fab9f360af7c589348558cb3668ef64feb6c87619f",
        "stdout.txt": "bebf2ef92d7b8cb3ebb5f352a3435b6935f8ff3b6b289e8550fc1eeb4cd5c5e8",
        "stderr.txt": "9256f183bb5227dd31bba91ef6adb0f60c85e3029dd78cfcffdc27ba05f84308",
        "control.json": "1a887321655f86ee92044f14087b2b07a9963afef40ccca88db7e71620712bc2"
      }
    },
    {
      "name": "startup-fire-print",
      "scenario": "startup-fire",
      "mode": "print",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 251,
      "watchdogFired": false,
      "requests": 0,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": false,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 1,
      "emittedSettled": 0,
      "finalText": "",
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "Extension error (<probe-root>/fixture.ts): This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().\n",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "print",
          "goal": "Fix synthetic login failure",
          "signal": false
        },
        {
          "ms": 0,
          "type": "input",
          "source": "extension",
          "text": "Fix synthetic login failure"
        },
        {
          "ms": 0,
          "type": "startup-sent"
        },
        {
          "ms": 1,
          "type": "agent-start"
        },
        {
          "ms": 2,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": false
        },
        {
          "ms": 4,
          "type": "agent-settled",
          "pending": false,
          "complete": false,
          "submitted": false
        }
      ],
      "jsonEventTypes": [],
      "rawFiles": {
        "trace.jsonl": "de8ead99fedf68ad7c289e96264cbf8c154f1183d098d099da4dd799b601a135",
        "stdout.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "stderr.txt": "9256f183bb5227dd31bba91ef6adb0f60c85e3029dd78cfcffdc27ba05f84308",
        "control.json": "36e4739cdc17a418808cfd8e070bad63c7f5060553b133b164d8f32c263b87b8"
      }
    },
    {
      "name": "startup-await-json",
      "scenario": "startup-await",
      "mode": "json",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 353,
      "watchdogFired": false,
      "requests": 1,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": false,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 1,
      "emittedSettled": 0,
      "finalText": "STARTUP_DONE",
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "goal": "Fix synthetic login failure",
          "signal": false
        },
        {
          "ms": 1,
          "type": "input",
          "source": "extension",
          "text": "Fix synthetic login failure"
        },
        {
          "ms": 1,
          "type": "startup-sent"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 4,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 106,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": "STARTUP_DONE"
        },
        {
          "ms": 106,
          "type": "agent-end"
        },
        {
          "ms": 107,
          "type": "boundary",
          "pending": false,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 107,
          "type": "agent-settled",
          "pending": false,
          "complete": false,
          "submitted": false
        },
        {
          "ms": 107,
          "type": "startup-handler-returned"
        },
        {
          "ms": 108,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": false
        }
      ],
      "jsonEventTypes": [
        "session"
      ],
      "rawFiles": {
        "trace.jsonl": "fb3856fc8303a389bfa9cf2cbf7f3dd239535b80daa50dc7096a2c322408b3ed",
        "stdout.txt": "daa3ccc4458574eec9b60ba619f687f5e3215ddd3d1ad4303b21b65d1def0ce4",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "1a887321655f86ee92044f14087b2b07a9963afef40ccca88db7e71620712bc2"
      }
    },
    {
      "name": "startup-await-print",
      "scenario": "startup-await",
      "mode": "print",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 347,
      "watchdogFired": false,
      "requests": 1,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": false,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 1,
      "emittedSettled": 0,
      "finalText": "STARTUP_DONE",
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "print",
          "goal": "Fix synthetic login failure",
          "signal": false
        },
        {
          "ms": 1,
          "type": "input",
          "source": "extension",
          "text": "Fix synthetic login failure"
        },
        {
          "ms": 1,
          "type": "startup-sent"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 4,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 105,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": "STARTUP_DONE"
        },
        {
          "ms": 106,
          "type": "agent-end"
        },
        {
          "ms": 106,
          "type": "boundary",
          "pending": false,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 107,
          "type": "agent-settled",
          "pending": false,
          "complete": false,
          "submitted": false
        },
        {
          "ms": 107,
          "type": "startup-handler-returned"
        },
        {
          "ms": 107,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": false
        }
      ],
      "jsonEventTypes": [],
      "rawFiles": {
        "trace.jsonl": "8708f16643f04cd3b54211a545de5d3476c9032130d95718dedf79415c4d24f0",
        "stdout.txt": "859d42ddfe3eacf49276d6a799818bfaf4e3dc4f2212faf3eb4b83159fe2d566",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "36e4739cdc17a418808cfd8e070bad63c7f5060553b133b164d8f32c263b87b8"
      }
    },
    {
      "name": "startup-input-json",
      "scenario": "startup-input",
      "mode": "json",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 349,
      "watchdogFired": false,
      "requests": 1,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": false,
      "emittedAgentStarts": 1,
      "observedAgentStarts": 1,
      "emittedSettled": 1,
      "finalText": "STARTUP_DONE",
      "outputAssistantTexts": [
        "STARTUP_DONE"
      ],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "goal": "Fix synthetic login failure",
          "signal": false
        },
        {
          "ms": 1,
          "type": "input",
          "source": "interactive",
          "text": "Keep the public API unchanged"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 5,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 106,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": "STARTUP_DONE"
        },
        {
          "ms": 106,
          "type": "agent-end"
        },
        {
          "ms": 107,
          "type": "boundary",
          "pending": false,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 108,
          "type": "agent-settled",
          "pending": false,
          "complete": false,
          "submitted": false
        },
        {
          "ms": 108,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": false
        }
      ],
      "jsonEventTypes": [
        "session",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "agent_settled"
      ],
      "rawFiles": {
        "trace.jsonl": "ee99d192f27247715a0edb33a9d942140532e65c8d827d24a6e3463cf0498b6f",
        "stdout.txt": "ff4f89fe547827233431b3dc4c342acc7d9977e737578800af39d545735c7ab0",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "aa201f4be009f4a51874774c2a526563e16cde6125e2acb29819c78726a29a74"
      }
    },
    {
      "name": "startup-piped-print",
      "scenario": "startup-input",
      "mode": "print",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 360,
      "watchdogFired": false,
      "requests": 1,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": false,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 1,
      "emittedSettled": 0,
      "finalText": "STARTUP_DONE",
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "print",
          "goal": "Fix synthetic login failure",
          "signal": false
        },
        {
          "ms": 1,
          "type": "input",
          "source": "interactive",
          "text": "Synthetic test observationsKeep the public API unchanged"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 5,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 106,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": "STARTUP_DONE"
        },
        {
          "ms": 107,
          "type": "agent-end"
        },
        {
          "ms": 108,
          "type": "boundary",
          "pending": false,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 108,
          "type": "agent-settled",
          "pending": false,
          "complete": false,
          "submitted": false
        },
        {
          "ms": 108,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": false
        }
      ],
      "jsonEventTypes": [],
      "rawFiles": {
        "trace.jsonl": "738b4afd2547e5870559289867fec649ad57b6e5f7fbed3c240fdb46e6d68a26",
        "stdout.txt": "859d42ddfe3eacf49276d6a799818bfaf4e3dc4f2212faf3eb4b83159fe2d566",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "78fbed37adefde746b34c34d3c93802bc679aa327d7f0251247ef5dca06fb7c5"
      }
    },
    {
      "name": "help-goal",
      "scenario": "startup-passive",
      "mode": "print",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 244,
      "watchdogFired": false,
      "requests": 0,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 0,
      "emittedSettled": 0,
      "registeredGoalInHelp": true,
      "outputAssistantTexts": [],
      "status": "observed",
      "stderr": "",
      "controls": [],
      "timing": [],
      "jsonEventTypes": [],
      "rawFiles": {
        "trace.jsonl": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "stdout.txt": "ba25985076675defc31199e308ce0e0464d3bf4c06e4e8b25778608f812a3725",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "1c7e894f839cb449d85dbf154e17909bb9c685adfc54d51b8e6282b7bd848fc6"
      }
    },
    {
      "name": "boundary-error-json",
      "scenario": "boundary-error",
      "mode": "json",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 264,
      "watchdogFired": false,
      "requests": 2,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": true,
      "emittedAgentStarts": 1,
      "observedAgentStarts": 1,
      "emittedSettled": 1,
      "finalText": "WAITING_FOR_TESTS",
      "outputAssistantTexts": [
        "WAITING_FOR_TESTS"
      ],
      "status": "observed",
      "stderr": "Extension error (<probe-root>/fixture.ts): Synthetic boundary failure\n",
      "controls": [],
      "timing": [
        {
          "ms": 0,
          "type": "session-start",
          "reason": "startup",
          "mode": "json",
          "signal": false
        },
        {
          "ms": 1,
          "type": "input",
          "source": "interactive",
          "text": "Synthetic review; launch tests and wait for their result"
        },
        {
          "ms": 2,
          "type": "agent-start"
        },
        {
          "ms": 5,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 14,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 15,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 16,
          "type": "request",
          "count": 2,
          "messageRoles": [
            "system",
            "user",
            "assistant",
            "toolResult"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 21,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 21,
          "type": "agent-end"
        },
        {
          "ms": 22,
          "type": "boundary",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": false,
          "idle": false
        },
        {
          "ms": 23,
          "type": "agent-settled",
          "pending": true,
          "complete": false,
          "submitted": false
        },
        {
          "ms": 23,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": true,
          "complete": false
        }
      ],
      "jsonEventTypes": [
        "session",
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "message_start",
        "message_end",
        "message_start",
        "message_update",
        "message_update",
        "message_end",
        "tool_execution_start",
        "tool_execution_end",
        "message_start",
        "message_end",
        "turn_end",
        "turn_start",
        "message_start",
        "message_update",
        "message_update",
        "message_update",
        "message_end",
        "turn_end",
        "agent_end",
        "agent_settled"
      ],
      "rawFiles": {
        "trace.jsonl": "d36e1c2b9d422f35be40fab6547c83f52180e6054cd40e40181d3717e736585d",
        "stdout.txt": "94418aa5771d071ad190c05f26f3756f632bf697ed016325c04ff9ca3137099f",
        "stderr.txt": "967f17aefba768db13ef01077b94b2a846fbd8cb74860f1c212ddc794dba5696",
        "control.json": "91c2d3bf51054596bbbd5a400e018e8d4fd22c84f0e8a9b6bb0d3267eb2c5500"
      }
    }
  ]
}
```
