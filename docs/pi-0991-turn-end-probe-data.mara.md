# Pi 0.99.1 turn-end probe variant and observations

See [the non-UI report](pi-0991-nonui-probes.mara.md#supplementary-turn-end-observations).
This variant verifies the exact hashes of the [base sources](pi-0991-nonui-probe-data.mara.md)
before changing only its own fresh extracted fixture copies. It does not modify Pi
or the repository. The bounded observation summary records the derived source
hashes and raw trace hashes. Full raw logs are regenerated locally on replay.

## turn-end-variant.mjs

```text
// Apply only to fresh extracts of the four sources archived in the first non-UI report.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = dirname(fileURLToPath(import.meta.url));
function update(name, expectedHash, transform) {
  const file = join(root, name), original = readFileSync(file, 'utf8');
  assert.equal(createHash('sha256').update(original).digest('hex'), expectedHash, name + ' differs from the frozen base');
  writeFileSync(file, transform(original));
}
function replace(source, oldText, newText) {
  assert.equal(source.split(oldText).length, 2, 'Nonunique replacement: ' + oldText);
  return source.replace(oldText, newText);
}
update('fixture.ts', '86f472ea5c4a8af9b106a6e9bf1673fba0710c061f39545766ad598261f06ca6', s => {
  s = replace(s, ".includes(scenario);\n  pi.registerFlag", ".includes(scenario) || scenario.startsWith('turn-');\n  pi.registerFlag");
  s = replace(s, "pi.on('agent_before_settle', async (event, ctx) => {", "pi.on(scenario.startsWith('turn-') ? 'turn_end' : 'agent_before_settle', async (event, ctx) => {\n    if (scenario.startsWith('turn-') && event.message.stopReason === 'toolUse') return;");
  s = replace(s, "trace('boundary', { pending, complete, submitted,", "trace('boundary', { boundaryType: event.type, pending, complete, submitted,");
  s = replace(s, "    await job;\n    trace('wait-end'", "    const signal = ctx.signal;\n    let cancelListener;\n    if (scenario.startsWith('turn-')) {\n      if (signal?.aborted) return;\n      try {\n        await Promise.race([job, new Promise(resolve => {\n          cancelListener = resolve;\n          signal?.addEventListener('abort', cancelListener, { once: true });\n        })]);\n      } finally {\n        if (cancelListener) signal?.removeEventListener('abort', cancelListener);\n      }\n      if (signal?.aborted) { trace('wait-interrupted'); return; }\n    } else await job;\n    trace('wait-end'");
  return s;
});
update('run.mjs', '0502710a0883c81ff210a2dada87944afba9c0924c524a5d1a29d7e7c1ec0d0a', s => {
  const cases = s.match(/const cases = \[[\s\S]*?\n\];/);
  assert.ok(cases);
  s = replace(s, cases[0], "const cases = [\n  ['turn-end-print', 'turn-hold', 'print'],\n  ['turn-end-json', 'turn-hold', 'json'],\n  ['turn-end-rpc', 'turn-hold', 'rpc'],\n  ['turn-end-abort-rpc', 'turn-abort', 'rpc', { control: 'abort', delay: 1800 }],\n];");
  s = replace(s, "['hold', 'hold-queued'].includes(scenario)", "['hold', 'hold-queued', 'turn-hold'].includes(scenario)");
  s = replace(s, "    } else if (scenario === 'abort') {", "    } else if (scenario === 'turn-abort') {\n      assert.equal(record.waitSignal, true);\n      assert.equal(record.requests, 2);\n      assert.equal(record.jobCompleted, false);\n      assert.equal(record.modelSawFinalResult, false);\n      assert.equal(record.settledWithPending, true);\n      assert.ok(record.abortAcknowledgementMs < options.delay / 2, 'abort failed to interrupt the wait promptly');\n      assert.ok(record.trace.some(x => x.type === 'wait-interrupted'));\n      assert.ok(record.trace.some(x => x.type === 'wait-signal-aborted'));\n    } else if (scenario === 'abort') {");
  return s;
});
update('summarize.mjs', '6a74bacc56579b15d402fdb45c30a6031ae3f928559c5c9edb81cb1acff23df2', s => {
  s = replace(s, 'assert.equal(results.length, 17)', 'assert.equal(results.length, 4)');
  s = replace(s, 'eb988f68b7039faf38072d349d9071db9930cc7a', 'b9932771b65eed7c2ca37561aadb06969b4bd366');
  s = replace(s, "'summarize.mjs', 'replay.sh'", "'summarize.mjs', 'replay.sh', 'turn-end-variant.mjs'");
  return s;
});
```

## observations.json

```text
{
  "subjectRevision": "b9932771b65eed7c2ca37561aadb06969b4bd366",
  "capturedAt": "2026-09-30T12:46:04.686Z",
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
    "fixture.ts": "3faf84c08c587897e293f5b0d54fe094a8a384d1ae9f286d212a900b5d5fd6ef",
    "run.mjs": "28e5eb0db7c0eda62bb5362c16cff0b5a4a98deb7af5524bedbeb4ef3de9f8d9",
    "summarize.mjs": "00aa2f5323ab29e590c494dadc4ee7188026fce01aab4d6c65692a44bcbba6a5",
    "replay.sh": "11f4be9c9e572cf4b725abd30fd36b5415536778cfc4dff4e9cc68b06c3d1133",
    "turn-end-variant.mjs": "a634fa052c31be0cb033ddd97728fca7ab4e437f3cf76e6534d63968852c5230"
  },
  "rawResultsSha256": "048ebfd49bc6a250649cd8d01c87434a95fa521cf0cbf6ebbdff6b2a2eb6140a",
  "note": "Bounded observations, not full raw transcript archives. stdout/stderr/control/trace files are generated under cases/ on every run. Fixture submitted means a draft or queue operation, NOT a delivery receipt. Synthetic timer completion is NOT process exit.",
  "records": [
    {
      "name": "turn-end-print",
      "scenario": "turn-hold",
      "mode": "print",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 869,
      "watchdogFired": false,
      "requests": 3,
      "modelSawFinalResult": true,
      "jobCompleted": true,
      "settledWithPending": false,
      "waitSignal": true,
      "emittedAgentStarts": 0,
      "observedAgentStarts": 1,
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
          "type": "boundary",
          "boundaryType": "turn_end",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": true,
          "idle": false
        },
        {
          "ms": 21,
          "type": "wait-start",
          "signal": true,
          "aborted": false
        },
        {
          "ms": 614,
          "type": "job-completed"
        },
        {
          "ms": 614,
          "type": "wait-end",
          "signal": true,
          "aborted": false
        },
        {
          "ms": 614,
          "type": "result-proposed"
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
          "ms": 621,
          "type": "boundary",
          "boundaryType": "turn_end",
          "pending": false,
          "complete": true,
          "submitted": true,
          "outcome": "completed",
          "signal": true,
          "idle": false
        },
        {
          "ms": 621,
          "type": "agent-end"
        },
        {
          "ms": 622,
          "type": "agent-settled",
          "pending": false,
          "complete": true,
          "submitted": true
        },
        {
          "ms": 622,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": false,
          "complete": true
        }
      ],
      "jsonEventTypes": [],
      "rawFiles": {
        "trace.jsonl": "be868b03a6f090110a4128aeec9ed383c455c64931be32ba6161fea281ebb108",
        "stdout.txt": "71c1afa2f2306b4b313b508c2453ba427c4bfafe5a68f486e3de94e7d8dc8e92",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "4d23c635b9b6f767340a674a6510ce5ed0744c2231c554e05e21f44358f60b58"
      }
    },
    {
      "name": "turn-end-json",
      "scenario": "turn-hold",
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
      "waitSignal": true,
      "emittedAgentStarts": 1,
      "observedAgentStarts": 1,
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
          "type": "boundary",
          "boundaryType": "turn_end",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": true,
          "idle": false
        },
        {
          "ms": 22,
          "type": "wait-start",
          "signal": true,
          "aborted": false
        },
        {
          "ms": 615,
          "type": "job-completed"
        },
        {
          "ms": 615,
          "type": "wait-end",
          "signal": true,
          "aborted": false
        },
        {
          "ms": 616,
          "type": "result-proposed"
        },
        {
          "ms": 616,
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
          "ms": 621,
          "type": "provider-done",
          "count": 3,
          "sawResult": true,
          "text": "REVIEW_DONE"
        },
        {
          "ms": 621,
          "type": "boundary",
          "boundaryType": "turn_end",
          "pending": false,
          "complete": true,
          "submitted": true,
          "outcome": "completed",
          "signal": true,
          "idle": false
        },
        {
          "ms": 621,
          "type": "agent-end"
        },
        {
          "ms": 622,
          "type": "agent-settled",
          "pending": false,
          "complete": true,
          "submitted": true
        },
        {
          "ms": 622,
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
        "entry_appended",
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
        "trace.jsonl": "add8c591d15623fbf55db7540ad6aee9cc7210e7f8065e8707823f291e69aa58",
        "stdout.txt": "239d5b8a72d13f1d2155f32529b39077999bcf40121e36d39d8cb99dc1511e91",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "5756372af484a63f97d5bb58e10d613d98c67b61231f9d22f54e0df9ab65a2b9"
      }
    },
    {
      "name": "turn-end-rpc",
      "scenario": "turn-hold",
      "mode": "rpc",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 962,
      "watchdogFired": false,
      "requests": 3,
      "modelSawFinalResult": true,
      "jobCompleted": true,
      "settledWithPending": false,
      "waitSignal": true,
      "emittedAgentStarts": 1,
      "observedAgentStarts": 1,
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
          "ms": 15,
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
          "ms": 18,
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
          "ms": 23,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 23,
          "type": "boundary",
          "boundaryType": "turn_end",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": true,
          "idle": false
        },
        {
          "ms": 23,
          "type": "wait-start",
          "signal": true,
          "aborted": false
        },
        {
          "ms": 616,
          "type": "job-completed"
        },
        {
          "ms": 616,
          "type": "wait-end",
          "signal": true,
          "aborted": false
        },
        {
          "ms": 616,
          "type": "result-proposed"
        },
        {
          "ms": 617,
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
          "ms": 622,
          "type": "provider-done",
          "count": 3,
          "sawResult": true,
          "text": "REVIEW_DONE"
        },
        {
          "ms": 622,
          "type": "boundary",
          "boundaryType": "turn_end",
          "pending": false,
          "complete": true,
          "submitted": true,
          "outcome": "completed",
          "signal": true,
          "idle": false
        },
        {
          "ms": 623,
          "type": "agent-end"
        },
        {
          "ms": 623,
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
        "entry_appended",
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
        "trace.jsonl": "fac6e76cc8796c78556337a72051918930b35d0848ecea5956059a93deb7518b",
        "stdout.txt": "37f460fa29e64215f581fe4e95cdff387b3795b1c5e165cc6e4b86449a3db139",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "869682d62fd2abf2cbafee44a4ddb5844c43e43f5e0e1b21cfdd2713208708ec"
      }
    },
    {
      "name": "turn-end-abort-rpc",
      "scenario": "turn-abort",
      "mode": "rpc",
      "exit": {
        "code": 0,
        "signal": null
      },
      "elapsedMs": 395,
      "watchdogFired": false,
      "requests": 2,
      "modelSawFinalResult": false,
      "jobCompleted": false,
      "settledWithPending": true,
      "waitSignal": true,
      "abortAcknowledgementMs": 6,
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
          "at": 1790772364553
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
          "ms": 7,
          "type": "request",
          "count": 1,
          "messageRoles": [
            "system",
            "user"
          ],
          "sawFinalResult": false
        },
        {
          "ms": 15,
          "type": "provider-done",
          "count": 1,
          "sawResult": false,
          "text": ""
        },
        {
          "ms": 17,
          "type": "job-started",
          "signal": true
        },
        {
          "ms": 18,
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
          "ms": 25,
          "type": "provider-done",
          "count": 2,
          "sawResult": false,
          "text": "WAITING_FOR_TESTS"
        },
        {
          "ms": 25,
          "type": "boundary",
          "boundaryType": "turn_end",
          "pending": true,
          "complete": false,
          "submitted": false,
          "outcome": "completed",
          "signal": true,
          "idle": false
        },
        {
          "ms": 25,
          "type": "wait-start",
          "signal": true,
          "aborted": false
        },
        {
          "ms": 40,
          "type": "launch-signal-aborted"
        },
        {
          "ms": 40,
          "type": "wait-signal-aborted"
        },
        {
          "ms": 40,
          "type": "wait-interrupted"
        },
        {
          "ms": 41,
          "type": "agent-end"
        },
        {
          "ms": 41,
          "type": "agent-settled",
          "pending": true,
          "complete": false,
          "submitted": false
        },
        {
          "ms": 141,
          "type": "session-shutdown",
          "reason": "quit",
          "pending": true,
          "complete": false
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
        "agent_settled",
        "response"
      ],
      "rawFiles": {
        "trace.jsonl": "40b108d75c4f75ab74578ad3cb0d24c869b08f845dad5e78a4b7a446e7af0b88",
        "stdout.txt": "397d70f6af7bc726777351f3bbe4babffe2c3bfdf43f793637c10e0f81eba24f",
        "stderr.txt": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "control.json": "15a4f85591e0b90df0ac55c9fd9daf2de350c6ef3a279c463dc14708d02351ff"
      }
    }
  ]
}
```
