import { assert, probe, setup, tool, result, sdk, ai, root } from './pi-harness.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import * as core from './core-a.mjs';
import * as other from './core-b.mjs';
const paths = JSON.parse(readFileSync(join(root, 'imports.json'), 'utf8'));
const gates = await import(paths.gates);
let serial = 0;
function compose() {
  const output = join(root, 'composition-' + ++serial);
  mkdirSync(output);
  const diagnostics = [];
  const inbox = core.createCompletionCoordinator();
  const runtime = core.createJobsSessionRuntime({
    runtimeId: 'R',
    participantId: 'shared',
    inbox,
    output: core.createJobsFileOutput(output),
    cleanupMs: 30,
    reconciliationMs: 30,
    diagnose: (m) => diagnostics.push(m),
  });
  function bind(pi) {
    // Independently loaded copies receive the SAME runtime/inbox, not a package singleton.
    other.bindJobsSessionRuntime(pi, runtime, (_pi, ctx) => {
      const owner = gates.createGateOwner(pi, 'generic-jobs-owner');
      owner.start(ctx);
      return {
        reconcile: (ids) =>
          owner.reconcile(
            ctx,
            ids.map((id) => ({ id })),
          ),
        close: () => owner.close(),
      };
    });
  }
  return { runtime, inbox, diagnostics, bind };
}
async function admitted(
  c,
  ctx,
  jobId,
  delivery = 'automatic',
  awaiting = false,
  lifetime = 'managed',
  owned = { cancel: async () => {}, dispose() {} },
) {
  const identity = {
    runtimeId: 'R',
    ownerId: jobId === 'B' ? 'other-owner' : 'owner',
    producerId: jobId === 'B' ? 'other-producer' : 'external',
    sessionId: ctx.sessionManager.getSessionId(),
    jobId,
  };
  const request = {
    identity,
    authority: { runtimeId: 'R', ownerId: identity.ownerId, generation: 'owned' },
    delivery,
    awaiting,
    lifetime,
  };
  assert.equal((await c.runtime.admit(request, owned)).status, 'ok');
  return {
    identity: { job: identity, resultId: jobId + '-final' },
    outcome: { kind: 'exit', exitCode: 0 },
    content: 'final-' + jobId,
  };
}

await probe(
  'common batching across producers/core copies and selected direct receipt arbitration',
  async () => {
    const c = compose();
    let selected;
    const h = await setup({
      extension: (pi) => {
        c.bind(pi);
        pi.registerTool(
          tool('fixture_batch', async (_id, _a, _s, _u, ctx) => {
            const a = await admitted(c, ctx, 'A'),
              b = await admitted(c, ctx, 'B'),
              later = await admitted(c, ctx, 'C');
            for (const final of [a, b, later])
              assert.equal((await c.runtime.complete(final)).status, 'ok');
            selected = a;
            return result(core.jobsFinalResultText(c.runtime.readResult(a.identity.job).value));
          }),
        );
      },
    });
    try {
      await h.call('fixture_batch');
      const notifications = h.session.messages.filter(
        (m) => m.role === 'custom' && m.customType === core.JOBS_RESULTS_MESSAGE_TYPE,
      );
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0].content.length, 2);
      assert(!JSON.stringify(notifications).includes(core.jobsFinalResultText(selected)));
      assert(c.runtime.inspect().every((j) => j.delivery.state === 'delivered'));
      const observer = gates.createGateObserver(h.pi);
      observer.start(h.ctx);
      observer.finishDiscovery();
      assert(observer.view().owners.every((owner) => owner.gates.length === 0));
      observer.close();
      assert.equal(h.errors.length, 0);
      assert.notEqual(core.bindJobsSessionRuntime, other.bindJobsSessionRuntime);
      return { observations: c.runtime.inspect(), notifications, distinctCopies: true };
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

for (const style of ['discarded', 'filtered', 'forwarded', 'direct']) {
  await probe('native finalized ' + style + ' final-result receipt', async () => {
    const c = compose();
    const h = await setup({
      builtins: true,
      settings: { defaultTools: ['+codemode'] },
      extension: (pi) => {
        c.bind(pi);
        pi.registerTool(
          tool('fixture_final', async (_id, _a, _s, _u, ctx) => {
            const final = await admitted(c, ctx, 'nested', 'next-natural-turn');
            await c.runtime.complete(final);
            return result(core.jobsFinalResultText(final));
          }),
        );
        if (style === 'filtered')
          pi.on('message_end', (event) =>
            event.message.role === 'toolResult'
              ? {
                  message: { ...event.message, content: [{ type: 'text', text: 'filtered-away' }] },
                }
              : undefined,
          );
      },
    });
    try {
      if (style === 'direct') await h.call('fixture_final');
      else
        await h.call('codemode', {
          code:
            style === 'forwarded'
              ? 'text(await tools.fixture_final());'
              : 'await tools.fixture_final(); text("discarded final content");',
        });
      const expected = ['direct', 'forwarded'].includes(style) ? 'delivered' : 'pending';
      assert.equal(c.runtime.inspect()[0].delivery.state, expected);
      assert.equal(h.errors.length, 0);
      return {
        style,
        expected,
        observation: c.runtime.inspect()[0],
        transcript: h.session.messages.filter((m) => m.role === 'toolResult'),
      };
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  });
}

await probe(
  'one native pending wake while starting/working; later arrivals reach next boundary without steering',
  async () => {
    const c = compose();
    let reservations = 0;
    const reserve = c.inbox.reserveWake.bind(c.inbox);
    c.inbox.reserveWake = async (...args) => {
      const reply = await reserve(...args);
      if (reply.state === 'reserved') reservations++;
      return reply;
    };
    let release, entered;
    const requestEntered = new Promise((resolve) => {
      entered = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let first = true,
      requestCount = 0;
    const h = await setup({
      extension: c.bind,
      provider: {
        streamSimple(model) {
          requestCount++;
          const stream = new ai.AssistantMessageEventStream();
          queueMicrotask(async () => {
            if (first) {
              first = false;
              entered();
              await held;
            }
            const message = {
              role: 'assistant',
              content: [{ type: 'text', text: 'consumed' }],
              api: model.api,
              provider: model.provider,
              model: model.id,
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
              stopReason: 'stop',
              timestamp: Date.now(),
            };
            stream.push({
              type: 'start',
              partial: { ...message, content: [], stopReason: 'pending' },
            });
            stream.push({ type: 'done', reason: 'stop', message });
            stream.end();
          });
          return stream;
        },
      },
    });
    try {
      const a = await admitted(c, h.ctx, 'A'),
        b = await admitted(c, h.ctx, 'B');
      await c.runtime.complete(a);
      await requestEntered;
      await c.runtime.complete(b);
      assert.equal(reservations, 1);
      assert.equal(
        c.runtime.inspect().find((j) => j.identity.jobId === 'B').delivery.state,
        'pending',
      );
      release();
      await h.session.waitForIdle();
      assert(c.runtime.inspect().every((j) => j.delivery.state === 'delivered'));
      assert.equal(reservations, 1);
      assert.equal(requestCount, 2);
      assert.equal(h.errors.length, 0);
      return { reservations, observations: c.runtime.inspect(), requests: requestCount };
    } finally {
      release();
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

await probe('next natural turn and display-only do not authorize an idle wake', async () => {
  const c = compose();
  const h = await setup({ extension: c.bind });
  try {
    const next = await admitted(c, h.ctx, 'next', 'next-natural-turn');
    const display = await admitted(c, h.ctx, 'display', 'display-only', true);
    await c.runtime.complete(next);
    await c.runtime.complete(display);
    assert.equal(h.requests.length, 0);
    await h.session.prompt('next user message');
    assert.equal(
      c.runtime.inspect().find((j) => j.identity.jobId === 'next').delivery.state,
      'delivered',
    );
    assert.equal(
      c.runtime.inspect().find((j) => j.identity.jobId === 'display').delivery.state,
      'not-required',
    );
    assert(!JSON.stringify(h.requests).includes(core.jobsFinalResultText(display)));
    return c.runtime.inspect();
  } finally {
    await c.runtime.shutdown('quit');
    h.close();
  }
});

await probe(
  'ambiguous wake admission retains saved stable result for redelivery without rerun',
  async () => {
    const c = compose();
    let failed = false;
    const h = await setup({
      extension: (pi) =>
        c.bind({
          ...pi,
          sendMessage(message, options) {
            if (!failed) {
              failed = true;
              throw Error('ambiguous admission');
            }
            pi.sendMessage(message, options);
          },
        }),
    });
    try {
      const final = await admitted(c, h.ctx, 'ambiguous');
      await c.runtime.complete(final);
      assert.equal(c.runtime.inspect()[0].delivery.state, 'pending');
      assert.equal(h.requests.length, 0);
      await h.session.prompt('consume saved result');
      assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
      assert.equal(
        c.runtime.inspect()[0].delivery.receipt.result.resultId,
        final.identity.resultId,
      );
      assert(c.diagnostics.some((m) => m.includes('unconfirmed')));
      return { final, observation: c.runtime.inspect()[0], diagnostics: c.diagnostics };
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

await probe(
  'same-session idle/tree/reload preserves actual command with fresh callbacks',
  async () => {
    const c = compose();
    let loads = 0,
      stopped = 0;
    const h = await setup({
      extension: (pi) => {
        c.bind(pi);
        loads++;
      },
    });
    let child;
    try {
      await h.session.prompt('establish tree');
      const original = h.ctx;
      const final = await admitted(c, h.ctx, 'reload', 'automatic', false, 'managed', {
        cancel: async () => {
          stopped++;
          child.kill('SIGTERM');
        },
        dispose() {},
      });
      child = spawn('sh', ['-c', 'sleep 0.15; printf reload-result'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      let captured = '';
      child.stdout.on('data', (bytes) => {
        captured += bytes;
        void c.runtime.capture(final.identity.job, bytes);
      });
      const completed = new Promise((resolve, reject) =>
        child.on('close', async (code, signal) => {
          try {
            assert.equal(signal, null);
            final.outcome.exitCode = code;
            final.content = captured;
            await c.runtime.complete(final);
            resolve();
          } catch (error) {
            reject(error);
          }
        }),
      );
      const user = h.session.sessionManager
        .getBranch()
        .find((e) => e.type === 'message' && e.message.role === 'user');
      await h.session.navigateTree(user.id, { summarize: false });
      await h.session.reload();
      assert.equal(loads, 2);
      assert.notEqual(h.ctx, original);
      assert.throws(() => original.sessionManager, /stale/);
      await completed;
      await h.session.waitForIdle();
      assert.equal(stopped, 0);
      assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
      assert.equal(h.errors.length, 0);
      return { loads, stopped, observation: c.runtime.inspect()[0] };
    } finally {
      await c.runtime.shutdown('quit');
      if (child && child.exitCode === null) child.kill('SIGKILL');
      h.close();
    }
  },
);

await probe(
  'persistent saved results defer on reopen; running is historical and fork copies confer no authority',
  async () => {
    const c = compose();
    const cwd = join(root, 'persistent');
    mkdirSync(cwd);
    const manager = sdk.SessionManager.create(cwd, join(cwd, 'sessions'));
    let h = await setup({ sessionManager: manager, extension: c.bind });
    let final, historical;
    try {
      await h.session.prompt('persist first user');
      final = await admitted(c, h.ctx, 'saved', 'next-natural-turn');
      await c.runtime.complete(final);
      historical = await admitted(c, h.ctx, 'running', 'display-only', false);
      await c.runtime.shutdown('quit');
      h.close();
      const reopened = sdk.SessionManager.open(manager.getSessionFile());
      h = await setup({
        sessionManager: reopened,
        extension: c.bind,
        sessionStartEvent: { type: 'session_start', reason: 'resume' },
      });
      assert.equal(h.requests.length, 0);
      const running = c.runtime.inspect().find((j) => j.identity.jobId === 'running');
      assert.equal(running.execution.state, 'unknown');
      assert.equal(running.capabilities.stop, false);
      await h.session.prompt('retrieve saved final');
      assert.equal(
        c.runtime.inspect().find((j) => j.identity.jobId === 'saved').delivery.state,
        'delivered',
      );
      assert.equal(h.errors.length, 0);
      return {
        final,
        historical,
        observations: c.runtime.inspect(),
        file: reopened.getSessionFile(),
      };
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

await probe(
  'native SDK abort cancels waiting only, and unknown awaited ownership stops with needs-attention',
  async () => {
    const c = compose();
    let stop = 0;
    const h = await setup({ extension: c.bind });
    try {
      const final = await admitted(c, h.ctx, 'awaited', 'automatic', true, 'managed', {
        cancel: async () => {
          stop++;
        },
        dispose() {},
      });
      let settled = false;
      const pending = h.session.prompt('await without model polling').then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
      assert.equal(settled, false);
      await h.session.abort();
      await pending;
      assert.equal(stop, 0);
      assert.equal(c.runtime.inspect()[0].execution.state, 'running');
      const unknown = {
        ...c.runtime.inspect()[0],
        execution: { state: 'unknown', reason: 'current owner observation unavailable' },
      };
      await c.runtime.update(unknown);
      await h.session.prompt('reconcile unknown owner');
      assert(c.diagnostics.some((m) => m.includes('needs-attention')));
      assert.equal(c.runtime.inspect()[0].awaiting, true);
      assert.equal(c.runtime.inspect()[0].delivery.state, 'pending');
      const denied = await c.runtime.admit(
        {
          identity: { ...final.identity.job, jobId: 'invalid-combination' },
          authority: { runtimeId: 'R', ownerId: 'owner', generation: 'owned' },
          awaiting: true,
          delivery: 'next-natural-turn',
          lifetime: 'managed',
        },
        { cancel: async () => {}, dispose() {} },
      );
      assert.equal(denied.status, 'invalid');
      assert.equal(h.errors.length, 0);
      return {
        stopBeforeShutdown: stop,
        diagnostics: c.diagnostics,
        observations: c.runtime.inspect(),
      };
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

await probe(
  'actual new/switch/fork and orderly exit cancel owned managed work with bounded uncertainty',
  async () => {
    const c = compose();
    const cwd = join(root, 'replacement');
    mkdirSync(cwd);
    let h,
      cancellations = 0,
      disposals = 0;
    const factory = async (request) => {
      h = await setup({
        cwdOverride: request.cwd,
        sessionManager: request.sessionManager,
        sessionStartEvent: request.sessionStartEvent,
        extension: c.bind,
        bind: false,
      });
      return h;
    };
    const host = await sdk.createAgentSessionRuntime(factory, {
      cwd,
      agentDir: cwd,
      sessionManager: sdk.SessionManager.create(cwd, join(cwd, 'sessions')),
    });
    host.setRebindSession((session) =>
      session.bindExtensions({ onError: (e) => h.errors.push(e) }),
    );
    await host.session.bindExtensions({});
    const children = [];
    const start = async (name) => {
      let child;
      const final = await admitted(c, h.ctx, name, 'automatic', false, 'managed', {
        cancel: async () => {
          cancellations++;
          child.kill('SIGTERM');
        },
        dispose: () => {
          disposals++;
        },
      });
      child = spawn('sleep', ['5'], { stdio: 'ignore' });
      children.push(child);
      const stopped = new Promise((resolve) => child.on('close', resolve));
      return { final, stopped };
    };
    try {
      await host.session.prompt('original');
      const originalFile = host.session.sessionFile;
      let job = await start('new');
      await host.newSession();
      await job.stopped;
      assert.equal((await c.runtime.complete(job.final)).status, 'unavailable');
      await host.session.prompt('replacement');
      job = await start('switch');
      await host.switchSession(originalFile);
      await job.stopped;
      assert(c.runtime.inspect().every((j) => j.execution.state === 'unknown'));
      await host.session.prompt('fork root');
      job = await start('fork');
      const leaf = host.session.sessionManager
        .getBranch()
        .findLast((e) => e.type === 'message' && e.message.role === 'user');
      await host.fork(leaf.id, { position: 'at' });
      await job.stopped;
      assert.equal(c.runtime.inspect().length, 0);
      await host.session.prompt('forked session');
      job = await start('exit');
      await host.dispose();
      await job.stopped;
      assert.equal(cancellations, 4);
      assert.equal(disposals, 4);
      return { cancellations, disposals, diagnostics: c.diagnostics };
    } finally {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await host.dispose();
    }
  },
);
