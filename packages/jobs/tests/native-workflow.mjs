import { assert, Type, setup, tool, result, probe, sleep } from './pi-harness.mjs';

const ownedFixtures = new Set();
// The bounded parent runner sends SIGTERM on deadline. Clean actual owned groups
// before exiting; do not leave cleanup to an unverified signal to the wrapper.
process.once('SIGTERM', () => {
  void Promise.all([...ownedFixtures].map((f) => f.close())).then(
    () => process.exit(1),
    (error) => {
      console.error(String(error));
      process.exit(1);
    },
  );
});

async function nativeFixture() {
  let factory;
  let owner;
  let active;
  let output = '';
  let readyResolve;
  let heldResolve;
  const ready = new Promise((r) => {
    readyResolve = r;
  });
  const held = new Promise((r) => {
    heldResolve = r;
  });
  const authority = Object.freeze({
    runtimeId: 'fixture-runtime',
    ownerId: 'fixture-owner',
    generation: 'generation',
  });
  const h = await setup({
    builtins: true,
    settings: { defaultTools: ['+codemode'] },
    extension: (pi) => {
      pi.events.on('fixture:adapter', (data) => {
        factory = data;
      });
      pi.registerTool(
        tool(
          'fixture_execute',
          async (_id, input, signal, _update, ctx) => {
            owner ??= factory({ authority: () => authority });
            const launched = await owner.launch(
              {
                identity: {
                  runtimeId: authority.runtimeId,
                  ownerId: authority.ownerId,
                  sessionId: ctx.sessionManager.getSessionId(),
                  jobId: 'fixture-job',
                  producerId: 'unfamiliar/external',
                },
                authority,
                awaiting: true,
                delivery: 'automatic',
                lifetime: 'managed',
              },
              {
                command: input.command,
                cwd: ctx.cwd,
                foregroundBudgetMs: input.budget ?? 5000,
                background: input.background ?? false,
                stopGraceMs: 60,
              },
              {
                append: async ({ bytes }) => {
                  output += Buffer.from(bytes).toString();
                  if (output.includes('ready')) readyResolve();
                },
              },
              signal,
            );
            assert.equal(launched.status, 'ok');
            active = launched.value;
            const foreground = await owner.foreground(active);
            return result(JSON.stringify(foreground), {
              structuredContent: foreground,
              isError:
                foreground.kind === 'completed' &&
                foreground.execution.outcome.kind === 'exit' &&
                foreground.execution.outcome.exitCode !== 0,
            });
          },
          {
            parameters: Type.Object({
              command: Type.String(),
              budget: Type.Optional(Type.Number()),
              background: Type.Optional(Type.Boolean()),
            }),
            outputSchema: Type.Any(),
            executionMode: 'sequential',
            exposure: 'direct',
          },
        ),
      );
      pi.registerTool(
        tool(
          'fixture_hold',
          async (_id, _input, signal) => {
            heldResolve();
            if (!signal.aborted)
              await new Promise((resolve) =>
                signal.addEventListener('abort', resolve, { once: true }),
              );
            return result('wait aborted; no execution stop');
          },
          { executionMode: 'sequential', exposure: 'codemode' },
        ),
      );
      pi.registerTool(
        tool(
          'fixture_ready',
          async () => {
            await ready;
            return result('ready');
          },
          { exposure: 'codemode' },
        ),
      );
      pi.registerTool(
        tool(
          'fixture_nested',
          async (_id, input, _signal, _update, ctx) => {
            const value = await ctx.executeTool('fixture_execute', input);
            if (input.hold) await ctx.executeTool('fixture_hold', {});
            return value;
          },
          {
            parameters: Type.Object({
              command: Type.String(),
              budget: Type.Optional(Type.Number()),
              hold: Type.Optional(Type.Boolean()),
            }),
            outputSchema: Type.Any(),
            exposure: 'direct',
          },
        ),
      );
    },
  });
  h.pi.events.emit('fixture:adapter-request', {});
  assert.equal(typeof factory, 'function', 'actual resource-internal adapter failed to load');
  let closed = false;
  const fixture = {
    h,
    ready,
    held,
    get owner() {
      return owner;
    },
    get handle() {
      return active;
    },
    output: () => output,
    async close() {
      if (closed) return;
      closed = true;
      // Stop before disposing the fixture session, never signal observed numeric PIDs.
      try {
        await h.session.abort();
        if (active) {
          await owner.stop(active, authority, 0);
          const state = await owner.completion(active);
          assert.equal(state.state, 'terminal', 'fixture cleanup is not confirmed');
        }
      } finally {
        h.close();
        ownedFixtures.delete(fixture);
      }
    },
  };
  ownedFixtures.add(fixture);
  return fixture;
}

for (const mode of ['direct', 'nested', 'codemode']) {
  await probe(`real ${mode} foreground cancellation stops its Linux command`, async () => {
    const f = await nativeFixture();
    try {
      const command = 'printf ready; sleep 10';
      const call =
        mode === 'direct'
          ? f.h.call('fixture_execute', { command })
          : mode === 'nested'
            ? f.h.call('fixture_nested', { command })
            : f.h.call('codemode', {
                code: `text(await tools.fixture_execute(${JSON.stringify({ command })}));`,
              });
      await f.ready;
      const before = f.owner.evidence(f.handle);
      await f.h.session.abort();
      await call;
      const state = await f.owner.completion(f.handle);
      assert.equal(state.state, 'terminal');
      assert.equal(state.outcome.kind, 'terminated');
      return { mode, before, state, output: f.output() };
    } finally {
      await f.close();
    }
  });
  await probe(`real ${mode} handed-off execution survives outer turn/script abort`, async () => {
    const f = await nativeFixture();
    try {
      const args = {
        command: 'printf "ready pid=%s\\n" "$$"; sleep .5; printf "tail pid=%s\\n" "$$"',
        budget: 100,
      };
      let call;
      if (mode === 'direct') {
        f.h.queue.push({
          content: [
            { type: 'toolCall', id: 'execute-direct', name: 'fixture_execute', arguments: args },
            { type: 'toolCall', id: 'hold-direct', name: 'fixture_hold', arguments: {} },
          ],
        });
        // Use a native wrapper to keep the same direct call signal alive across this turn.
        f.h.pi.setActiveTools([...f.h.pi.getActiveTools(), 'fixture_hold']);
        call = f.h.session.prompt('Controlled direct-call cancellation fixture.');
      } else if (mode === 'nested') call = f.h.call('fixture_nested', { ...args, hold: true });
      else
        call = f.h.call('codemode', {
          code: `text(await tools.fixture_execute(${JSON.stringify(args)})); await tools.fixture_hold();`,
        });
      await f.held;
      const before = f.owner.evidence(f.handle);
      await f.h.session.abort();
      await call;
      assert.equal((await f.owner.observe(f.handle)).state, 'running');
      const state = await f.owner.completion(f.handle);
      assert.deepEqual(state, { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } });
      const pids = [...f.output().matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]));
      assert.deepEqual(pids, [before.commandPid, before.commandPid]);
      return { mode, before, state, output: f.output() };
    } finally {
      await f.close();
    }
  });
}
await probe('actual codemode script end aborts unfinished foreground execution', async () => {
  const f = await nativeFixture();
  try {
    const command = 'printf ready; sleep 10';
    await f.h.call('codemode', {
      code: `const pending = tools.fixture_execute(${JSON.stringify({ command })}); await tools.fixture_ready(); text("script ended");`,
    });
    const state = await f.owner.completion(f.handle);
    assert.equal(state.state, 'terminal');
    assert.equal(state.outcome.kind, 'terminated');
    return { state, output: f.output() };
  } finally {
    await f.close();
  }
});
await probe('actual codemode script end leaves a handed-off Linux execution alive', async () => {
  const f = await nativeFixture();
  try {
    const args = { command: 'printf ready; sleep .3; printf finished', budget: 100 };
    const outer = await f.h.call('codemode', {
      code: `text(await tools.fixture_execute(${JSON.stringify(args)}));`,
    });
    assert.equal((await f.owner.observe(f.handle)).state, 'running');
    const state = await f.owner.completion(f.handle);
    assert.deepEqual(state, { state: 'terminal', outcome: { kind: 'exit', exitCode: 0 } });
    assert.equal(f.output(), 'readyfinished');
    return { outer, state, output: f.output() };
  } finally {
    await f.close();
  }
});
await probe('direct and codemode nonzero exits preserve actual Linux status', async () => {
  const observations = [];
  for (const mode of ['direct', 'codemode']) {
    const f = await nativeFixture();
    try {
      const args = { command: 'printf nonzero; exit 9' };
      const value =
        mode === 'direct'
          ? await f.h.call('fixture_execute', args)
          : await f.h.call('codemode', {
              code: `text(await tools.fixture_execute(${JSON.stringify(args)}));`,
            });
      const state = await f.owner.completion(f.handle);
      assert.deepEqual(state, { state: 'terminal', outcome: { kind: 'exit', exitCode: 9 } });
      if (mode === 'direct') assert(value.isError);
      observations.push({ mode, state, value });
    } finally {
      await f.close();
    }
  }
  return observations;
});
await sleep(1);
