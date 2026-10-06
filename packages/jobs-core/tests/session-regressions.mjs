import { assert, probe, setup, tool, result, root, sdk } from './pi-harness.mjs';
import { join } from 'node:path';
import * as core from './core-a.mjs';
let sequence = 0;

for (const first of [true, false])
  await probe(
    'automatic arrival joins asynchronous prompt startup (binding first: ' + first + ')',
    async () => {
      const c = compose();
      let entered, release;
      let blocked = false;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      const starting = new Promise((resolve) => {
        entered = resolve;
      });
      const h = await setup({
        extension: (pi) => {
          const block = () =>
            pi.on('before_agent_start', async () => {
              if (!blocked) {
                blocked = true;
                entered();
                await held;
              }
            });
          if (!first) block();
          core.bindJobsSessionRuntime(pi, c.runtime);
          if (first) block();
        },
      });
      let running;
      try {
        const final = await c.admit(h.ctx);
        running = h.session.prompt('real user request');
        await starting;
        await c.runtime.complete(final);
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(h.requests.length, 0, 'no competing jobs-only run during user startup');
        release();
        await running;
        await h.session.waitForIdle();
        assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
        assert(
          h.requests.some((r) =>
            r.context.messages.some(
              (m) => m.role === 'user' && JSON.stringify(m).includes('real user request'),
            ),
          ),
        );
        assert.equal(h.errors.length, 0);
        return { requests: h.requests.length };
      } finally {
        release();
        await running?.catch(() => {});
        await c.runtime.shutdown('quit');
        h.close();
      }
    },
  );

await probe(
  'fresh admission cannot lift saved automatic results next-user-input deferral',
  async () => {
    const cwd = join(root, 'saved-admission');
    const manager = sdk.SessionManager.create(cwd, join(cwd, 'sessions'));
    let h = await setup({ sessionManager: manager });
    const c = compose();
    try {
      await h.session.prompt('persist native history');
      const job = {
        runtimeId: 'R',
        sessionId: manager.getSessionId(),
        ownerId: 'old',
        producerId: 'external',
        jobId: 'saved',
      };
      const store = core.createSessionJobStore({
        session: {
          sessionId: manager.getSessionId(),
          persistent: true,
          getEntries: () => manager.getEntries(),
          appendEntry: (type, data) => h.pi.appendEntry(type, data),
        },
        output: core.createJobsFileOutput(join(root, 'saved-admission-output')),
      });
      const reserved = await store.jobs.reserve({
        identity: job,
        authority: { runtimeId: 'R', ownerId: 'old', generation: 'old' },
        awaiting: false,
        lifetime: 'managed',
        delivery: 'automatic',
      });
      assert.equal(reserved.status, 'ok');
      await store.results.save({
        identity: { job, resultId: 'old-final' },
        outcome: { kind: 'exit', exitCode: 0 },
        content: 'saved automatic final',
      });
      store.invalidateOrigin();
      await store.dispose();
      h.close();
      h = await setup({
        sessionManager: sdk.SessionManager.open(manager.getSessionFile()),
        sessionStartEvent: { type: 'session_start', reason: 'resume' },
        extension: (pi) => core.bindJobsSessionRuntime(pi, c.runtime),
      });
      const fresh = await c.admit(h.ctx, 'display-only');
      await c.runtime.complete(fresh);
      await h.session.waitForIdle();
      assert.equal(h.requests.length, 0);
      assert.equal(
        c.runtime.inspect().find((j) => j.identity.jobId === 'saved').delivery.state,
        'pending',
      );
      await h.session.prompt('next real user input');
      assert.equal(
        c.runtime.inspect().find((j) => j.identity.jobId === 'saved').delivery.state,
        'delivered',
      );
      assert.equal(h.errors.length, 0);
      return c.runtime.inspect();
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);
for (const extensionFirst of [false, true])
  await probe(
    'one-at-a-time queued turns retain accepted generations (extension first: ' +
      extensionFirst +
      ')',
    async () => {
      const c = compose();
      let entered, release;
      const runningTool = new Promise((resolve) => {
        entered = resolve;
      });
      const held = new Promise((resolve) => {
        release = resolve;
      });
      const h = await setup({
        extension: (pi) => {
          core.bindJobsSessionRuntime(pi, c.runtime);
          pi.registerTool(
            tool('fixture_hold', async () => {
              entered();
              await held;
              return result('hold released');
            }),
          );
          pi.registerTool(
            tool('fixture_next_final', async (_id, _a, _s, _u, ctx) => {
              const final = await c.admit(ctx, 'next-natural-turn');
              await c.runtime.complete(final);
              return result('final saved, not returned here');
            }),
          );
        },
      });
      let running;
      try {
        h.session.setFollowUpMode('one-at-a-time');
        running = h.call('fixture_hold');
        await runningTool;
        if (extensionFirst)
          await h.session.prompt('second queued extension input', {
            source: 'extension',
            streamingBehavior: 'followUp',
          });
        else await h.session.followUp('second queued user');
        await h.session.followUp('third queued user');
        h.queue.push(
          { content: [{ type: 'text', text: 'first turn finished' }] },
          {
            content: [
              {
                type: 'toolCall',
                id: 'queued-next-final',
                name: 'fixture_next_final',
                arguments: {},
              },
            ],
          },
        );
        release();
        await running;
        await h.session.waitForIdle();
        assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
        const receiving = h.requests.find((r) =>
          r.context.messages.some(
            (m) => m.role === 'user' && JSON.stringify(m).includes('third queued user'),
          ),
        );
        assert(
          receiving &&
            JSON.stringify(receiving.context.messages).includes('required-final-content'),
        );
        assert.equal(h.errors.length, 0);
        return { requests: h.requests.length, observation: c.runtime.inspect()[0] };
      } finally {
        release();
        await running?.catch(() => {});
        await c.runtime.shutdown('quit');
        h.close();
      }
    },
  );

await probe(
  'successful display-only override excludes a still-capturing natural-turn batch',
  async () => {
    const c = compose();
    let entered, release;
    const captured = new Promise((resolve) => {
      entered = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const capture = c.inbox.capture.bind(c.inbox);
    c.inbox.capture = async (...args) => {
      const batch = await capture(...args);
      if (batch.status === 'ok' && batch.value.length) {
        entered();
        await held;
      }
      return batch;
    };
    const h = await setup({ extension: (pi) => core.bindJobsSessionRuntime(pi, c.runtime) });
    let running;
    try {
      const final = await c.admit(h.ctx, 'next-natural-turn');
      await c.runtime.complete(final);
      running = h.session.prompt('next real input');
      await captured;
      const observation = c.runtime.inspect()[0];
      observation.delivery = { mode: 'display-only', state: 'not-required' };
      assert.equal((await c.runtime.update(observation)).status, 'ok');
      release();
      await running;
      assert.equal(
        h.requests.some((r) =>
          JSON.stringify(r.context.messages).includes('required-final-content'),
        ),
        false,
      );
      assert.equal(c.runtime.inspect()[0].delivery.state, 'not-required');
      assert.equal(h.errors.length, 0);
      return c.runtime.inspect()[0];
    } finally {
      release();
      await running?.catch(() => {});
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

await probe(
  'native replacement cannot authorize launch after skipping admission cancellation',
  async () => {
    const outcomes = [];
    for (let delay = 0; delay < 8; delay++) {
      const c = compose({
        create: async () => 'memory',
        write: async () => {},
        read: async () => ({
          bytes: new Uint8Array(),
          totalBytes: 0,
          headBytes: 0,
          finished: true,
        }),
        remove: async () => {},
      });
      let h,
        cancellations = 0;
      const cwd = join(root, 'admission-replacement-' + delay);
      const factory = async (request) => {
        h = await setup({
          cwdOverride: request.cwd,
          sessionManager: request.sessionManager,
          sessionStartEvent: request.sessionStartEvent,
          bind: false,
          extension: (pi) => {
            pi.on('session_shutdown', async () => {
              for (let i = 0; i < delay; i++) await Promise.resolve();
            });
            core.bindJobsSessionRuntime(pi, c.runtime);
          },
        });
        return h;
      };
      const host = await sdk.createAgentSessionRuntime(factory, {
        cwd,
        agentDir: cwd,
        sessionManager: sdk.SessionManager.inMemory(cwd),
      });
      host.setRebindSession((session) =>
        session.bindExtensions({ onError: (e) => h.errors.push(e) }),
      );
      try {
        await host.session.bindExtensions({});
        const job = {
          runtimeId: 'R',
          sessionId: h.ctx.sessionManager.getSessionId(),
          ownerId: 'O',
          producerId: 'external',
          jobId: 'J',
        };
        const admission = c.runtime.admit(
          {
            identity: job,
            authority: { runtimeId: 'R', ownerId: 'O', generation: 'owned' },
            awaiting: true,
            lifetime: 'managed',
            delivery: 'automatic',
          },
          {
            cancel: async () => {
              cancellations++;
            },
            dispose() {},
          },
        );
        const switching = host.newSession();
        const reply = await admission;
        await switching;
        assert(
          reply.status !== 'ok' || cancellations === 1,
          'success after cancellation snapshot skipped the job authorizes unmanaged launch',
        );
        outcomes.push({ delay, status: reply.status, cancellations });
        assert.equal(h.errors.length, 0);
      } finally {
        await host.dispose();
      }
    }
    return outcomes;
  },
);

await probe(
  'extension-origin startup guards fresh work without lifting saved-result permission',
  async () => {
    const c = compose();
    let launched = false;
    const h = await setup({
      extension: (pi) => {
        core.bindJobsSessionRuntime(pi, c.runtime);
        pi.on('before_agent_start', async (_event, ctx) => {
          if (!launched) {
            launched = true;
            const final = await c.admit(ctx);
            await c.runtime.complete(final);
          }
        });
      },
    });
    try {
      await h.session.prompt('extension-origin request', { source: 'extension' });
      await h.session.waitForIdle();
      assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
      assert.equal(h.errors.length, 0);
      return { requests: h.requests.length, observations: c.runtime.inspect() };
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

await probe(
  'queued owner settings preserve completed execution and valid finalized receipt snapshots',
  async () => {
    const c = compose();
    let replies;
    const h = await setup({
      extension: (pi) => {
        core.bindJobsSessionRuntime(pi, c.runtime);
        pi.registerTool(
          tool('fixture_settings_race', async (_id, _a, _s, _u, ctx) => {
            const final = await c.admit(ctx);
            const stale = c.runtime.inspect()[0];
            stale.delivery = { mode: 'next-natural-turn', state: 'pending' };
            replies = await Promise.all([c.runtime.complete(final), c.runtime.update(stale)]);
            return result(core.jobsFinalResultText(final));
          }),
        );
      },
    });
    try {
      await h.call('fixture_settings_race');
      assert(replies.every((r) => r.status === 'ok'));
      const observation = c.runtime.inspect()[0];
      assert.deepEqual(observation.execution, {
        state: 'terminal',
        outcome: { kind: 'exit', exitCode: 0 },
      });
      assert.equal(observation.delivery.state, 'delivered');
      const participant = core.createJobsParticipant(h.pi, {
        runtimeId: 'R',
        participantId: 'O',
        role: 'owner',
      });
      participant.start();
      participant.publish(h.ctx.sessionManager.getSessionId(), [observation]);
      participant.close();
      assert.equal(h.errors.length, 0);
      return { replies, observation };
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

function compose(output) {
  const inbox = core.createCompletionCoordinator();
  const runtime = core.createJobsSessionRuntime({
    runtimeId: 'R',
    participantId: 'P',
    inbox,
    output: output ?? core.createJobsFileOutput(join(root, 'review-regression-' + ++sequence)),
    diagnose() {},
  });
  const admit = async (ctx, delivery = 'automatic', awaiting = false) => {
    const job = {
      runtimeId: 'R',
      ownerId: 'O',
      producerId: 'external',
      sessionId: ctx.sessionManager.getSessionId(),
      jobId: 'J',
    };
    assert.equal(
      (
        await runtime.admit(
          {
            identity: job,
            authority: { runtimeId: 'R', ownerId: 'O', generation: 'owned' },
            awaiting,
            delivery,
            lifetime: 'managed',
          },
          { cancel: async () => {}, dispose() {} },
        )
      ).status,
      'ok',
    );
    return {
      identity: { job, resultId: 'F' },
      outcome: { kind: 'exit', exitCode: 0 },
      content: 'required-final-content',
    };
  };
  return { inbox, runtime, admit };
}

await probe(
  'awaited RPC next-turn remains pending until a real next input and recorded receipt',
  async () => {
    const c = compose();
    let started;
    const admission = new Promise((resolve) => {
      started = resolve;
    });
    const h = await setup({
      bind: false,
      extension: (pi) => {
        core.bindJobsSessionRuntime(pi, c.runtime);
        pi.registerTool(
          tool('fixture_next', async (_id, _a, _s, _u, ctx) => {
            const final = await c.admit(ctx, 'next-natural-turn', true);
            await c.runtime.complete(final);
            started();
            return result('next-turn final pending');
          }),
        );
      },
    });
    try {
      await h.session.bindExtensions({ mode: 'rpc', onError: (e) => h.errors.push(e) });
      let settled = false;
      const running = h.call('fixture_next').then(() => {
        settled = true;
      });
      await admission;
      await new Promise((resolve) => setTimeout(resolve, 15));
      assert.equal(settled, false, 'awaited pending receipt must not settle RPC');
      assert.equal(c.runtime.inspect()[0].delivery.state, 'pending');
      await h.session.followUp('next real user input');
      await Promise.race([
        running,
        new Promise((_, reject) => {
          const timer = setTimeout(
            () => reject(Error('next input never released native wait')),
            1500,
          );
          timer.unref();
        }),
      ]);
      assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
      assert(
        h.requests.some((r) =>
          JSON.stringify(r.context.messages).includes('required-final-content'),
        ),
      );
      assert.equal(h.errors.length, 0);
      return { requests: h.requests.length, observation: c.runtime.inspect()[0] };
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

await probe(
  'completion after final boundary capture is delivered at native idle transition',
  async () => {
    const c = compose();
    let armed = false,
      fired = false,
      final;
    const capture = c.inbox.capture.bind(c.inbox);
    c.inbox.capture = async (...args) => {
      const batch = await capture(...args);
      if (armed && !fired) {
        fired = true;
        await c.runtime.complete(final);
      }
      return batch;
    };
    const h = await setup({
      extension: (pi) => {
        pi.on('agent_before_settle', () => {
          armed = true;
        });
        core.bindJobsSessionRuntime(pi, c.runtime);
      },
    });
    try {
      final = await c.admit(h.ctx);
      await h.session.prompt('finish current run');
      await h.session.waitForIdle();
      assert.equal(fired, true);
      assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
      assert.equal(h.requests.length, 2);
      assert.equal(h.errors.length, 0);
      return c.runtime.inspect()[0];
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

for (const mode of ['display-only', 'next-natural-turn'])
  await probe('completed ' + mode + ' override updates inbox and automatic wake', async () => {
    const c = compose();
    const h = await setup({ extension: (pi) => core.bindJobsSessionRuntime(pi, c.runtime) });
    try {
      const final = await c.admit(h.ctx, mode);
      await c.runtime.complete(final);
      assert.equal(h.requests.length, 0);
      const observation = c.runtime.inspect()[0];
      observation.delivery = { mode: 'automatic', state: 'pending' };
      observation.awaiting = true;
      assert.equal((await c.runtime.update(observation)).status, 'ok');
      await h.session.waitForIdle();
      assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
      assert.equal(h.requests.length, 1);
      assert.equal(h.errors.length, 0);
      return c.runtime.inspect()[0];
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  });

await probe(
  'a recorded receipt survives post-completion mode changes without a new obligation',
  async () => {
    const c = compose();
    const h = await setup({ extension: (pi) => core.bindJobsSessionRuntime(pi, c.runtime) });
    try {
      const final = await c.admit(h.ctx);
      await c.runtime.complete(final);
      await h.session.waitForIdle();
      const receipt = c.runtime.inspect()[0].delivery.receipt;
      let observation = c.runtime.inspect()[0];
      observation.delivery = { mode: 'display-only', state: 'not-required' };
      await c.runtime.update(observation);
      const leaf = h.session.sessionManager
        .getBranch()
        .find((e) => e.type === 'custom' && e.customType === 'araketski.pi-jobs/storage');
      await h.session.navigateTree(leaf.id, { summarize: false });
      observation = c.runtime.inspect()[0];
      observation.delivery = { mode: 'automatic', state: 'pending' };
      await c.runtime.update(observation);
      assert.equal(c.runtime.inspect()[0].delivery.state, 'delivered');
      assert.deepEqual(c.runtime.inspect()[0].delivery.receipt, receipt);
      return c.runtime.inspect()[0];
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);

await probe(
  'explicit display-only retrieval preserves valid snapshots and not-required delivery',
  async () => {
    const c = compose();
    let final;
    const h = await setup({
      extension: (pi) => {
        core.bindJobsSessionRuntime(pi, c.runtime);
        pi.registerTool(tool('fixture_read', async () => result(core.jobsFinalResultText(final))));
      },
    });
    try {
      final = await c.admit(h.ctx, 'display-only');
      await c.runtime.complete(final);
      await h.call('fixture_read');
      const observation = c.runtime.inspect()[0];
      assert.equal(observation.delivery.state, 'not-required');
      const participant = core.createJobsParticipant(h.pi, {
        runtimeId: 'R',
        participantId: 'O',
        role: 'owner',
      });
      participant.start();
      participant.publish(h.ctx.sessionManager.getSessionId(), [observation]);
      participant.close();
      assert.equal(h.errors.length, 0);
      return observation;
    } finally {
      await c.runtime.shutdown('quit');
      h.close();
    }
  },
);
