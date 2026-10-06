import { assert, probe, setup, tool, result, root } from './pi-harness.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from './core-a.mjs';

const outputRoot = join(root, 'output');
mkdirSync(outputRoot);
const genericGates = await import(
  JSON.parse(readFileSync(join(root, 'imports.json'), 'utf8')).gates
);
const diagnostics = [];
const runtime = core.createJobsSessionRuntime({
  runtimeId: 'fixture-runtime',
  participantId: 'delivery',
  inbox: core.createCompletionCoordinator(),
  output: core.createJobsFileOutput(outputRoot),
  diagnose: (message) => diagnostics.push(message),
});
await probe(
  'real finite command saves final result, holds native non-UI wait, delivers and releases gate',
  async () => {
    let launched = 0,
      stopped = 0;
    let complete = Promise.resolve();
    const gates = new Set();
    const h = await setup({
      extension: (pi) => {
        core.bindJobsSessionRuntime(pi, runtime, (_pi, ctx) => {
          const owner = genericGates.createGateOwner(pi, 'finite-owner');
          owner.start(ctx);
          return {
            reconcile(ids) {
              owner.reconcile(
                ctx,
                ids.map((id) => ({ id })),
              );
              gates.clear();
              for (const id of ids) gates.add(id);
            },
            close: () => owner.close(),
          };
        });
        pi.registerTool(
          tool('fixture_launch', async (_id, _args, _signal, _update, ctx) => {
            const identity = {
              runtimeId: 'fixture-runtime',
              ownerId: 'owner',
              producerId: 'external',
              jobId: 'finite',
              sessionId: ctx.sessionManager.getSessionId(),
            };
            let child;
            const admitted = await runtime.admit(
              {
                identity,
                authority: {
                  runtimeId: identity.runtimeId,
                  ownerId: identity.ownerId,
                  generation: 'owned',
                },
                awaiting: true,
                delivery: 'automatic',
                lifetime: 'managed',
              },
              {
                cancel: async () => {
                  stopped++;
                  child?.kill('SIGTERM');
                },
                dispose() {},
              },
            );
            assert.equal(admitted.status, 'ok');
            assert.equal(gates.size, 1);
            launched++;
            child = spawn('sh', ['-c', 'sleep 0.08; printf finite-result'], {
              stdio: ['ignore', 'pipe', 'pipe'],
            });
            let text = '';
            child.stdout.on('data', (bytes) => {
              text += bytes;
              void runtime.capture(identity, bytes);
            });
            complete = new Promise((resolve, reject) =>
              child.on('close', async (exitCode, signal) => {
                try {
                  assert.equal(signal, null);
                  assert.equal(
                    (
                      await runtime.complete({
                        identity: { job: identity, resultId: 'finite-final' },
                        outcome: { kind: 'exit', exitCode },
                        content: text,
                      })
                    ).status,
                    'ok',
                  );
                  resolve();
                } catch (error) {
                  reject(error);
                }
              }),
            );
            return result('background finite');
          }),
        );
      },
    });
    try {
      h.queue.push(
        { content: [{ type: 'toolCall', id: 'launch', name: 'fixture_launch', arguments: {} }] },
        { content: [{ type: 'text', text: 'I am waiting.' }] },
        { content: [{ type: 'text', text: 'consumed finite result' }] },
      );
      const start = performance.now();
      await h.session.prompt('Start finite work and consume final result.');
      await complete;
      assert(performance.now() - start >= 50);
      assert.equal(launched, 1);
      assert.equal(stopped, 0);
      assert.equal(runtime.inspect()[0].delivery.state, 'delivered');
      assert.equal(gates.size, 0);
      assert(
        h.requests.some((r) =>
          JSON.stringify(r.context.messages).includes('Pi jobs final result v1'),
        ),
      );
      assert(h.events.some((e) => e.type === 'agent_settled'));
      assert.equal(h.errors.length, 0);
      return {
        launched,
        stopped,
        requests: h.requests.length,
        observation: runtime.inspect()[0],
        diagnostics,
      };
    } finally {
      await runtime.shutdown('quit');
      h.close();
    }
  },
);

await import('./session-cases.mjs');
