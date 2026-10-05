// Public Pi registration capability fixture; not production jobs/goal/Herdr tools.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.JOBS_CLI_FIXTURE_ROOT;
const paths = JSON.parse(readFileSync(join(root, 'imports.json'), 'utf8'));
const ai = await import(paths.ai);
const { Type } = await import(paths.typebox);
const namespaces = ['jobs', 'goal', 'herdr'];
const names = ['bash', ...namespaces.map((n) => `${n}_inspect`)];
const text = (value) => ({ content: [{ type: 'text', text: value }], details: undefined });
export default function (pi) {
  const scenario = process.env.JOBS_CLI_SCENARIO;
  let phase = 0;
  const observations = [];
  // The fixture selects declared exposure from its explicit test configuration at load time.
  // Consumer registration/fallback implementation remains outside jobs-core.
  const discovery = scenario === 'discovery';
  for (const namespace of namespaces)
    pi.registerTool({
      name: `${namespace}_inspect`,
      label: namespace,
      description: 'Credential-free registration fixture',
      parameters: Type.Object({}),
      namespace: { name: namespace },
      exposure: discovery ? 'deferred' : 'direct',
      async execute() {
        return text(`${namespace}-sentinel`);
      },
    });
  pi.registerTool({
    name: 'bash',
    label: 'bash',
    description: 'Credential-free bash replacement fixture',
    parameters: Type.Object({}),
    namespace: { name: 'jobs' },
    exposure: 'direct',
    async execute() {
      return text('replacement-bash-sentinel');
    },
  });
  pi.registerTool({
    name: 'fixture_nested',
    label: 'fixture',
    description: 'Nested exclusion fixture',
    parameters: Type.Object({}),
    async execute(_id, _args, _signal, _update, context) {
      const outcomes = [];
      for (const name of names) outcomes.push(await context.executeTool(name, {}));
      assert(outcomes.every((o) => o.isError));
      return text('nested-exclusion-sentinel');
    },
  });
  pi.on('session_start', (_event, ctx) => {
    const enabledDiscovery = pi.getActiveTools().includes('tool_search');
    assert.equal(enabledDiscovery, discovery);
    observations.push({
      mode: ctx.mode,
      discovery,
      all: pi
        .getAllTools()
        .map((t) => ({ name: t.name, namespace: t.namespace, exposure: t.exposure })),
      active: pi.getActiveTools(),
    });
    if (scenario === 'discovery') assert(discovery);
    else assert(!discovery);
    if (scenario === 'excluded')
      for (const name of names) assert(!pi.getActiveTools().includes(name));
  });
  pi.on('agent_settled', () =>
    writeFileSync(join(root, 'settled.json'), JSON.stringify({ observations, phase })),
  );
  pi.registerProvider('fixture', {
    api: 'fixture-api',
    apiKey: 'not-a-credential',
    baseUrl: 'http://127.0.0.1:1/unused',
    models: [
      {
        id: 'fixture',
        name: 'Fixture',
        input: ['text'],
        reasoning: false,
        contextWindow: 100000,
        maxTokens: 2048,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
    streamSimple(model, context) {
      const previous = context.messages.filter((m) => m.role === 'toolResult');
      let content;
      if (scenario === 'discovery' && phase === 0)
        content = [
          { type: 'toolCall', id: 'search', name: 'tool_search', arguments: { query: 'inspect' } },
        ];
      else if (scenario === 'discovery' && phase === 1)
        content = [
          {
            type: 'toolCall',
            id: 'compose',
            name: 'codemode',
            arguments: {
              code: 'text(await tools.bash()); text(await tools.jobs_inspect()); text(await tools.goal_inspect()); text(await tools.herdr_inspect());',
            },
          },
        ];
      else if (scenario !== 'discovery' && phase === 0)
        content = [
          ...names.map((name, i) => ({ type: 'toolCall', id: `call-${i}`, name, arguments: {} })),
          ...(scenario === 'excluded'
            ? [{ type: 'toolCall', id: 'nested', name: 'fixture_nested', arguments: {} }]
            : []),
        ];
      else {
        if (scenario === 'excluded') {
          for (const name of names) assert(previous.findLast((m) => m.toolName === name).isError);
          assert.equal(
            previous.findLast((m) => m.toolName === 'fixture_nested').content[0].text,
            'nested-exclusion-sentinel',
          );
        } else if (scenario === 'discovery') {
          const output = previous
            .findLast((m) => m.toolName === 'codemode')
            .content.map((c) => c.text)
            .join('\n');
          for (const marker of [
            'replacement-bash-sentinel',
            ...namespaces.map((n) => `${n}-sentinel`),
          ])
            assert(output.includes(marker));
        } else {
          assert.equal(
            previous.findLast((m) => m.toolName === 'bash').content[0].text,
            'replacement-bash-sentinel',
          );
          for (const namespace of namespaces)
            assert.equal(
              previous.findLast((m) => m.toolName === `${namespace}_inspect`).content[0].text,
              `${namespace}-sentinel`,
            );
        }
        observations.push({
          declared: ai.getCurrentTools(context.messages).map((t) => t.name),
          results: previous,
        });
        content = [{ type: 'text', text: 'CLI-SEAM-PASS' }];
      }
      phase++;
      const message = {
        role: 'assistant',
        content,
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
        stopReason: content.some((c) => c.type === 'toolCall') ? 'toolUse' : 'stop',
        timestamp: Date.now(),
      };
      const stream = new ai.AssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: 'start', partial: { ...message, content: [], stopReason: 'pending' } });
        for (const [contentIndex, c] of content.entries()) {
          if (c.type === 'toolCall') {
            stream.push({ type: 'toolcall_start', contentIndex, partial: message });
            stream.push({ type: 'toolcall_end', contentIndex, toolCall: c, partial: message });
          } else {
            stream.push({ type: 'text_start', contentIndex, partial: message });
            stream.push({ type: 'text_delta', contentIndex, delta: c.text, partial: message });
            stream.push({ type: 'text_end', contentIndex, content: c.text, partial: message });
          }
        }
        stream.push({ type: 'done', reason: message.stopReason, message });
        stream.end();
      });
      return stream;
    },
  });
}
