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
function compose() {
  const inbox = core.createCompletionCoordinator();
  const runtime = core.createJobsSessionRuntime({
    runtimeId: 'R',
    participantId: 'P',
    inbox,
    output: core.createJobsFileOutput(join(root, 'review-regression-' + ++sequence)),
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
