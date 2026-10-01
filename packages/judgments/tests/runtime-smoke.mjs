// Native Pi replay using a local HTTP provider, shared by source and packed consumers.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdkPath, packageRoot] = process.argv.slice(2);
const sdk = await import(pathToFileURL(sdkPath).href);
const agentDir = await mkdtemp(join(tmpdir(), 'judgments-native-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
let action;
let issued;
let failure = false;
const requests = [];
const server = createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const body = JSON.parse(raw);
  if (req.url.endsWith('/systemone')) {
    requests.push({ body, headers: req.headers });
    if (failure) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'private diagnostic' } }));
      return;
    }
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([id, q]) => {
        if (q.type === 'noul') return [id, { type: 'noul', noul: 0.8 }];
        if (q.type === 'score') return [id, { type: 'score', score: 0.7, confidence: 0.7 }];
        const choice = Object.keys(q.criteria)[0];
        return [
          id,
          {
            type: 'choice',
            choice,
            probabilities: Object.fromEntries(
              Object.keys(q.criteria).map((key) => [key, key === choice ? 1 : 0]),
            ),
            confidence: 1,
          },
        ];
      }),
    );
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ answers, usage: { input_tokens: 100, output_tokens: 10 } }));
    return;
  }
  assert.ok(req.url.endsWith('/chat/completions'));
  const sendCall = action && !issued;
  issued = true;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (delta, finish_reason) => ({
    id: 'offline',
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
    choices: [{ index: 0, delta, finish_reason }],
  });
  const delta = sendCall
    ? {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'offline-' + Date.now(),
            type: 'function',
            function: { name: action.name, arguments: JSON.stringify(action.args) },
          },
        ],
      }
    : { role: 'assistant', content: 'Offline fixture reply' };
  res.end(
    'data: ' +
      JSON.stringify(chunk(delta, null)) +
      '\n\ndata: ' +
      JSON.stringify(chunk({}, sendCall ? 'tool_calls' : 'stop')) +
      '\n\ndata: [DONE]\n\n',
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let session;
try {
  const config = JSON.stringify({
    providers: {
      openrouter: {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        apiKey: 'offline-fixture-only',
        models: [
          {
            id: 'offline-chat',
            api: 'openai-completions',
            reasoning: false,
            input: ['text'],
            contextWindow: 16384,
            maxTokens: 2048,
          },
        ],
      },
    },
  });
  await writeFile(join(agentDir, 'models.json'), config);
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ packages: [packageRoot] }));
  const runtime = await sdk.ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    modelsStorePath: join(agentDir, 'models-store.json'),
    allowModelNetwork: false,
  });
  assert.ok(runtime.getModelOfType('classifier', 'openrouter', '~typesafe/jev-latest'));
  const cwd = join(agentDir, 'workspace');
  await mkdir(cwd);
  const loader = new sdk.DefaultResourceLoader({ cwd, agentDir });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions.find(
    (ext) => ext.path === join(packageRoot, 'extensions/judgments/index.ts'),
  );
  assert.ok(extension);
  assert.equal(extension.handlers.size, 0, 'no automatic hooks');
  assert.equal(extension.commands.size, 0);
  assert.equal(extension.flags.size, 2);
  const skill = loader.getSkills();
  assert.deepEqual(skill.diagnostics, []);
  assert.ok(
    skill.skills.some((s) => s.filePath === join(packageRoot, 'skills/judgments/SKILL.md')),
  );
  const names = [
    'judgments_list_scenarios',
    'judgments_evaluate_scenario',
    'judgments_evaluate',
    'judgments_validate_scenario',
  ];
  assert.deepEqual([...extension.tools.keys()], names);
  for (const { definition } of extension.tools.values()) {
    assert.equal(definition.namespace.name, 'judgments');
    assert.ok(definition.outputSchema);
  }

  const settingsManager = sdk.SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
    cacheWarming: { mode: 'off' },
  });
  ({ session } = await sdk.createAgentSession({
    cwd,
    agentDir,
    modelRuntime: runtime,
    model: runtime.getModel('openrouter', 'offline-chat'),
    thinkingLevel: 'off',
    resourceLoader: loader,
    tools: names,
    sessionManager: sdk.SessionManager.inMemory(),
    settingsManager,
  }));
  await session.bindExtensions({});
  const completions = [];
  session.subscribe((event) => {
    if (event.type === 'tool_execution_end') completions.push(event);
  });
  async function run(name, args) {
    action = name ? { name, args } : undefined;
    issued = false;
    await session.prompt('Offline deterministic replay');
    if (!name) return undefined;
    const result = [...session.agent.state.messages].reverse().find((m) => m.role === 'toolResult');
    assert.equal(result.toolName, name);
    const event = completions.at(-1);
    assert.equal(event.toolName, name);
    return { ...result, ...event.result, isError: event.isError };
  }
  await run();
  assert.equal(requests.length, 0, 'idle/unrelated chat makes no classifier requests');
  const listing = await run('judgments_list_scenarios', {});
  assert.ok(listing.structuredContent, JSON.stringify(listing));
  assert.equal(listing.structuredContent.scenarios[0].id, 'mara-representation');
  assert.equal(requests.length, 0);
  const generic = await run('judgments_evaluate', {
    state: { evidence: 'Offline sample' },
    questions: {
      supported: {
        type: 'bool',
        instructions: 'Assess evidence',
        criteria: { true: 'Supported', false: 'Not supported' },
      },
    },
  });
  assert.equal(generic.isError, false);
  assert.equal(generic.structuredContent.status, 'assessed');
  assert.equal(generic.structuredContent.answers.supported.probability, 0.8);
  assert.equal(generic.usage.totalTokens, 110);
  assert.equal(generic.structuredContent.usage.totalTokens, 110);
  assert.equal(requests[0].headers.authorization, 'Bearer offline-fixture-only');
  assert.equal(requests[0].body.model, '~typesafe/jev-latest');
  assert.equal(
    requests[0].body.questions.supported.type,
    'noul',
    'native runtime performs wire adaptation',
  );

  const scenario = await run('judgments_evaluate_scenario', {
    scenario: 'mara-representation',
    criteria: {
      flavour: {
        invariant: JSON.stringify({
          name: 'invariant',
          description: 'Durable invariant',
          use_when: ['One obligation'],
          avoid_when: [],
          distinguish_from: {},
        }),
        none: 'No fitting flavour',
        insufficient: 'Missing context',
      },
    },
    input: {
      content: 'One durable invariant',
      purpose: 'Record a referenced obligation',
      flavours: {
        invariant: {
          description: 'Durable invariant',
          use_when: ['One obligation'],
          avoid_when: [],
          distinguish_from: {},
        },
      },
    },
  });
  assert.equal(scenario.structuredContent.answers.flavour.choice, 'invariant');
  assert.equal(scenario.structuredContent.scenario, 'mara-representation');
  assert.ok(scenario.structuredContent.interpretation.includes('no computed assessment'));
  assert.ok(!('assessment' in scenario.structuredContent));
  assert.equal(requests.length, 2);
  const saved = {
    formatVersion: 1,
    mode: 'dynamic',
    purpose: 'Consumer-authored scenario',
    useWhen: ['Relevant decision'],
    avoidWhen: [],
    inputSchema: {
      type: 'object',
      properties: { evidence: { type: 'string', description: 'Grounded evidence' } },
      required: ['evidence'],
    },
    questions: {
      x: {
        type: 'bool',
        instructions: 'Assess',
        criteriaGuidance: 'Supply actual support and non-support descriptions',
      },
      strength: {
        type: 'score',
        instructions: 'Score supplied support',
        criteria: ['Weak', 'Strong'],
      },
    },
    interpretation: 'Advisory consumer fixture',
  };
  const projectRoot = join(cwd, '.pi/judgments');
  const globalRoot = join(agentDir, 'judgments');
  await mkdir(join(projectRoot, 'scenarios'), { recursive: true });
  await mkdir(join(globalRoot, 'scenarios'), { recursive: true });
  assert.equal(
    sdk.hasTrustRequiringProjectResources(cwd),
    false,
    'custom-only data is not a native trust trigger',
  );
  await writeFile(join(projectRoot, 'scenarios/saved.json'), JSON.stringify(saved));
  await writeFile(
    join(globalRoot, 'scenarios/saved.json'),
    JSON.stringify({ ...saved, purpose: 'Global fixture' }),
  );
  assert.equal(
    (await run('judgments_validate_scenario', { scenario: 'saved' })).structuredContent.valid,
    true,
  );
  assert.equal(requests.length, 2, 'validation never classifies');
  const criteria = { x: { true: 'Supported observation', false: 'Not supported' } };
  const project = await run('judgments_evaluate_scenario', {
    scenario: 'saved',
    input: { evidence: 'Observed' },
    criteria,
  });
  assert.equal(project.structuredContent.source.scope, 'project');
  assert.equal(project.structuredContent.answers.x.probability, 0.8);
  assert.equal(project.structuredContent.answers.strength.score, 0.7);
  await writeFile(
    join(projectRoot, 'scenarios/saved.json'),
    JSON.stringify({ ...saved, mode: 'fixed' }),
  );
  assert.equal(
    (await run('judgments_validate_scenario', { scenario: 'saved' })).structuredContent.valid,
    false,
  );
  const beforeInvalid = requests.length;
  assert.equal(
    (
      await run('judgments_evaluate_scenario', {
        scenario: 'saved',
        input: { evidence: 'Observed' },
        criteria,
      })
    ).isError,
    true,
  );
  assert.equal(requests.length, beforeInvalid, 'invalid higher override never falls back');
  await writeFile(join(projectRoot, 'scenarios/saved.json'), JSON.stringify(saved));
  const globalConfig = JSON.stringify({ provider: 'openrouter', model: '~typesafe/jev-latest' });
  const projectConfig = JSON.stringify({ provider: 'missing-provider', model: 'missing-model' });
  await writeFile(join(globalRoot, 'config.json'), globalConfig);
  await writeFile(join(projectRoot, 'config.json'), projectConfig);
  assert.equal(
    (
      await run('judgments_evaluate_scenario', {
        scenario: 'saved',
        input: { evidence: 'Observed' },
        criteria,
      })
    ).structuredContent.status,
    'unavailable',
  );
  settingsManager.setProjectTrusted(false);
  const denied = await run('judgments_evaluate_scenario', {
    scenario: 'saved',
    input: { evidence: 'Observed' },
    criteria,
  });
  assert.equal(denied.structuredContent.source.scope, 'global');
  assert.equal(
    denied.structuredContent.status,
    'assessed',
    'denied project config cannot override global selection',
  );
  const deniedCatalog = await run('judgments_list_scenarios', {});
  assert.ok(
    deniedCatalog.structuredContent.diagnostics.some((d) => d.code === 'project_untrusted'),
  );
  const beforeFailure = requests.length;
  failure = true;
  const failed = await run('judgments_evaluate', {
    state: {},
    questions: {
      x: { type: 'bool', instructions: 'Assess', criteria: { true: 'Yes', false: 'No' } },
    },
  });
  assert.equal(failed.isError, true);
  assert.equal(failed.structuredContent.status, 'failed');
  assert.ok(!JSON.stringify(failed).includes('private diagnostic'));
  assert.equal(requests.length, beforeFailure + 1, 'no hidden retries or fallback');
  session.extensionRunner.setFlagValue('judgments-provider', 'missing-provider');
  session.extensionRunner.setFlagValue('judgments-model', 'missing-model');
  const unavailable = await run('judgments_evaluate', {
    state: {},
    questions: {
      x: { type: 'bool', instructions: 'Assess', criteria: { true: 'Yes', false: 'No' } },
    },
  });
  assert.equal(unavailable.structuredContent.status, 'unavailable');
  assert.equal(requests.length, beforeFailure + 1);
  assert.equal(await readFile(join(projectRoot, 'config.json'), 'utf8'), projectConfig);
  assert.equal(await readFile(join(globalRoot, 'config.json'), 'utf8'), globalConfig);
  assert.equal(session.model.id, 'offline-chat');
  assert.equal(await readFile(join(agentDir, 'models.json'), 'utf8'), config);
  console.log(
    'PASS: native Pi discovery, skill, on-demand tools, classifier/auth/usage, honest failures and no model/config changes',
  );
} finally {
  session?.dispose();
  await new Promise((resolve) => server.close(resolve));
  await rm(agentDir, { recursive: true, force: true });
}
