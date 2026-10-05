import { ai, Type, assert, probe, setup, tool, result } from './pi-harness.mjs';

const namespaces = ['jobs', 'goal', 'herdr'];
const coreA = await import('./core-a.mjs');
const coreB = await import('./core-b.mjs');

await probe('actual public Pi event bus carries independent core participants', async () => {
  let owner, observer;
  const h = await setup({
    extension: (pi) =>
      pi.on('session_start', (_event, ctx) => {
        owner = coreA.createJobsParticipant(pi, {
          runtimeId: 'fixture-runtime',
          participantId: 'fixture-owner',
          role: 'owner',
        });
        observer = coreB.createJobsParticipant(pi, {
          runtimeId: 'fixture-runtime',
          participantId: 'fixture-observer',
          role: 'observer',
        });
        owner.start();
        observer.start();
        owner.publish(ctx.sessionManager.getSessionId(), [
          {
            identity: {
              runtimeId: 'fixture-runtime',
              ownerId: 'fixture-owner',
              producerId: 'unknown/external',
              sessionId: ctx.sessionManager.getSessionId(),
              jobId: 'J',
            },
            execution: { state: 'unknown', reason: 'no executor in this checkpoint' },
            delivery: { mode: 'automatic', state: 'pending' },
            awaiting: true,
            lifetime: 'managed',
            capabilities: {
              stop: false,
              setAwaiting: false,
              setDelivery: false,
              readOutput: false,
              readResult: false,
            },
          },
        ]);
      }),
  });
  try {
    assert.notEqual(coreA.createJobsParticipant, coreB.createJobsParticipant);
    assert.equal(observer.view().snapshots[0].jobs[0].identity.producerId, 'unknown/external');
    assert.equal(observer.view().snapshots[0].jobs[0].execution.state, 'unknown');
    assert(!h.session.messages.some((message) => message.role === 'custom'));
    return observer.view();
  } finally {
    owner?.close();
    observer?.close();
    h.close();
  }
});
const register = (pi) => {
  // Registration capability probe only; not an implementation of these consumers.
  pi.on('session_start', () => {
    const discovery = pi.getActiveTools().includes('tool_search');
    for (const namespace of namespaces)
      pi.registerTool(
        tool(
          `${namespace}_inspect`,
          async () => result(namespace, { structuredContent: { namespace } }),
          {
            namespace: { name: namespace },
            exposure: discovery ? 'deferred' : 'direct',
            outputSchema: Type.Object({ namespace: Type.String() }),
          },
        ),
      );
    pi.registerTool(
      tool('bash', async () => result('replacement-bash'), {
        namespace: { name: 'jobs' },
        exposure: 'direct',
      }),
    );
  });
};

await probe('exact bash replacement and collision-free prefixed namespaces', async () => {
  const h = await setup({ extension: register });
  try {
    const all = h.pi.getAllTools();
    assert.equal(all.filter((t) => t.name === 'bash').length, 1);
    for (const namespace of namespaces) {
      const name = `${namespace}_inspect`;
      assert.equal(all.filter((t) => t.name === name).length, 1);
      assert.equal(all.find((t) => t.name === name).namespace.name, namespace);
      assert.equal((await h.call(name)).content[0].text, namespace);
    }
    assert.equal((await h.call('bash')).content[0].text, 'replacement-bash');
    assert(h.session.getActiveToolNames().includes('bash'));
    const declared = ai.getCurrentTools(h.requests[0].context.messages).map((t) => t.name);
    assert(declared.includes('bash'));
    assert(declared.includes('jobs_inspect'));
    return {
      all: all.map((t) => ({ name: t.name, namespace: t.namespace, exposure: t.exposure })),
      declared,
    };
  } finally {
    h.close();
  }
});

await probe('enabled discovery and absent disabled inactive builtin fallback', async () => {
  const records = [];
  for (const configuration of ['enabled', 'absent', 'disabled', 'noExtensions', 'inactive']) {
    const h = await setup({
      extension: register,
      builtins: configuration !== 'absent',
      builtinStyle: true,
      noExtensions: configuration === 'noExtensions',
      settings: {
        defaultTools: configuration === 'inactive' ? [] : ['+codemode', '+tool_search'],
        ...(configuration === 'disabled'
          ? { extensions: ['-builtin:codemode', '-builtin:tool-search'] }
          : {}),
      },
    });
    try {
      const before = h.session.getActiveToolNames();
      const exposure = h.pi.getAllTools().find((t) => t.name === 'jobs_inspect').exposure;
      if (configuration === 'enabled') {
        assert.equal(exposure, 'deferred');
        assert(!before.includes('jobs_inspect'));
        await h.call('tool_search', { query: 'jobs_inspect' });
        assert(h.session.getActiveToolNames().includes('jobs_inspect'));
        const composition = await h.call('codemode', { code: 'text(await tools.jobs_inspect());' });
        assert.equal(
          composition.content
            .slice(1)
            .map((c) => c.text)
            .join('\n'),
          '{"namespace":"jobs"}',
        );
      } else {
        assert.equal(exposure, 'direct');
        assert(before.includes('jobs_inspect'));
        assert(!before.includes('tool_search')); // do not turn it on for fallback
        assert.equal((await h.call('jobs_inspect')).content[0].text, 'jobs');
      }
      records.push({ configuration, exposure, before, after: h.session.getActiveToolNames() });
    } finally {
      h.close();
    }
  }
  return records;
});

await probe('exact exclusion blocks direct nested and activation attempts', async () => {
  const excluded = ['bash', ...namespaces.map((n) => `${n}_inspect`)];
  const h = await setup({
    extension: (pi) => {
      register(pi);
      pi.registerTool(
        tool('fixture_caller', async (_id, _args, _signal, _update, ctx) => {
          const values = [];
          for (const name of excluded) values.push(await ctx.executeTool(name, {}));
          return result(JSON.stringify(values));
        }),
      );
    },
    excludeTools: excluded,
  });
  try {
    h.pi.setActiveTools([...h.pi.getActiveTools(), ...excluded]);
    for (const name of excluded) {
      assert(!h.session.getActiveToolNames().includes(name));
      assert.equal((await h.call(name)).isError, true);
    }
    const nested = JSON.parse((await h.call('fixture_caller')).content[0].text);
    assert(nested.every((v) => v.isError));
    return { excluded, active: h.session.getActiveToolNames(), nested };
  } finally {
    h.close();
  }
});

await probe(
  'structured operation errors do not become success from outer script status',
  async () => {
    let executions = 0;
    const h = await setup({
      builtins: true,
      settings: { defaultTools: ['+codemode'] },
      extension: (pi) => {
        pi.registerTool(
          tool(
            'jobs_read_result',
            async () => {
              executions++;
              return result('unavailable', {
                isError: true,
                structuredContent: { status: 'unavailable' },
              });
            },
            {
              parameters: Type.Object({ jobId: Type.String() }),
              outputSchema: Type.Object({ status: Type.String() }),
              namespace: { name: 'jobs' },
              exposure: 'direct',
            },
          ),
        );
      },
    });
    try {
      assert.equal((await h.call('jobs_read_result', {})).isError, true);
      assert.equal(executions, 0);
      assert.equal((await h.call('jobs_read_result', { jobId: 'J' })).isError, true);
      const outer = await h.call('codemode', {
        code: 'text(await tools.jobs_read_result({jobId:"J"}));',
      });
      assert(!outer.isError);
      assert.equal(
        JSON.parse(
          outer.content
            .slice(1)
            .map((c) => c.text)
            .join('\n'),
        ).status,
        'unavailable',
      );
      return { executions, outer };
    } finally {
      h.close();
    }
  },
);

await probe('nested discarded filtered forwarded and direct final content boundary', async () => {
  const final = {
    jobId: 'J',
    resultId: 'R',
    outcome: { kind: 'exit', exitCode: 0 },
    content: 'final-sentinel',
  };
  const h = await setup({
    builtins: true,
    settings: { defaultTools: ['+codemode'] },
    extension: (pi) => {
      pi.registerTool(
        tool(
          'jobs_read_result',
          async () => result(JSON.stringify(final), { structuredContent: final }),
          {
            namespace: { name: 'jobs' },
            exposure: 'direct',
            outputSchema: Type.Object({
              jobId: Type.String(),
              resultId: Type.String(),
              outcome: Type.Object({ kind: Type.String(), exitCode: Type.Number() }),
              content: Type.String(),
            }),
          },
        ),
      );
    },
  });
  try {
    const observations = [];
    const cases = [
      ['discarded', 'await tools.jobs_read_result(); text("discarded");', 'discarded'],
      [
        'filtered',
        'const r=await tools.jobs_read_result(); text({jobId:r.jobId});',
        '{"jobId":"J"}',
      ],
      ['forwarded', 'text(await tools.jobs_read_result());', JSON.stringify(final)],
    ];
    for (const [name, code, expected] of cases) {
      const before = h.extensionEvents.length;
      const outer = await h.call('codemode', { code });
      assert.equal(
        outer.content
          .slice(1)
          .map((c) => c.text)
          .join('\n'),
        expected,
      );
      const modelResult = h.requests
        .at(-1)
        .context.messages.findLast((m) => m.role === 'toolResult');
      assert.deepEqual(modelResult.content, outer.content);
      const nested = h.extensionEvents
        .slice(before)
        .filter((e) => e.event.type === 'tool_result' && e.event.parentToolCallId);
      assert.equal(nested.length, 1);
      assert(!nested[0].event.isError);
      assert(
        outer.nestedCalls?.calls?.length || outer.nestedCalls?.length || modelResult.nestedCalls,
      );
      observations.push({ name, outer, modelResult, nested });
    }
    const direct = await h.call('jobs_read_result');
    assert.equal(direct.content[0].text, JSON.stringify(final));
    return { observations, direct };
  } finally {
    h.close();
  }
});
