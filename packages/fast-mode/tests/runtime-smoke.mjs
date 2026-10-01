// Replay workspace source or a fresh installed package. Only synthetic loopback requests.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const [sdkPath, packageRoot, cliPath] = process.argv.slice(2);
const sdk = await import(pathToFileURL(sdkPath).href);
const agentDir = await mkdtemp(join(tmpdir(), 'fast-mode-runtime-'));
const requests = [];
const sse = (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const decoded = req.headers['content-encoding'] === 'zstd' ? zstdDecompressSync(body) : body;
  const payload = JSON.parse(decoded.toString('utf8'));
  requests.push({ payload, headers: req.headers });
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  if (payload.model.startsWith('claude-')) {
    res.end(
      [
        {
          type: 'message_start',
          message: {
            id: 'local',
            type: 'message',
            role: 'assistant',
            model: payload.model,
            content: [],
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
        { type: 'message_stop' },
      ]
        .map(sse)
        .join(''),
    );
  } else if (Array.isArray(payload.input)) {
    const item = {
      id: 'message-local',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'ok', annotations: [] }],
    };
    res.end(
      [
        { type: 'response.created', response: { id: 'local', status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'ok' },
        { type: 'response.output_item.done', output_index: 0, item },
        {
          type: 'response.completed',
          response: {
            id: 'local',
            status: 'completed',
            output: [item],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ]
        .map(sse)
        .join(''),
    );
  } else {
    const chunk = (delta, finish_reason) => ({
      id: 'local',
      object: 'chat.completion.chunk',
      created: 1,
      model: payload.model,
      choices: [{ index: 0, delta, finish_reason }],
    });
    res.end(
      `data: ${JSON.stringify(chunk({ role: 'assistant', content: 'ok' }, null))}\n\ndata: ${JSON.stringify(chunk({}, 'stop'))}\n\ndata: [DONE]\n\n`,
    );
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const token = `local.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'loopback-only' } })).toString('base64url')}.local`;
  const provider = (api, id, apiKey = 'loopback-only') => ({
    api,
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    models: [{ id, contextWindow: 8192, maxTokens: 128 }],
  });
  await writeFile(
    join(agentDir, 'models.json'),
    JSON.stringify({
      providers: {
        'restore-claude': provider('anthropic-messages', 'claude-opus-5'),
        // Keep real catalog compatibility flags; a synthetic model would miss native betas.
        anthropic: { baseUrl },
        'restore-openai': provider('openai-responses', 'gpt-5.4'),
        'openai-codex': provider('openai-codex-responses', 'gpt-5.4', null),
        'restore-codex-key': provider('openai-codex-responses', 'gpt-5.4', token),
        'restore-completions': provider('openai-completions', 'gpt-5.4'),
      },
    }),
  );
  await writeFile(
    join(agentDir, 'auth.json'),
    JSON.stringify({
      anthropic: {
        type: 'oauth',
        access: 'sk-ant-oat01-loopback-only',
        refresh: 'unused',
        expires: Date.now() + 3600_000,
      },
      'openai-codex': {
        type: 'oauth',
        access: token,
        refresh: 'unused',
        expires: Date.now() + 3600_000,
      },
    }),
  );
  const runtime = await sdk.ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    modelsStorePath: join(agentDir, 'models-store.json'),
    allowModelNetwork: false,
  });
  for (const name of [
    'restore-claude',
    'anthropic',
    'restore-openai',
    'openai-codex',
    'restore-codex-key',
    'restore-completions',
  ]) {
    const id = name === 'restore-claude' || name === 'anthropic' ? 'claude-opus-5' : 'gpt-5.4';
    const model = runtime.getModel(name, id);
    assert.ok(model);
    assert.equal(model.baseUrl, baseUrl);
    const mismatch = name === 'restore-completions';
    let switched = false;
    let authored = false;
    const option = id.startsWith('claude') ? 'speed' : 'service_tier';
    const loader = new sdk.DefaultResourceLoader({
      cwd: agentDir,
      agentDir,
      additionalExtensionPaths: [packageRoot],
      extensionFactories: [
        (pi) => {
          pi.on('before_provider_headers', async () => {
            if (mismatch && !switched) {
              switched = true;
              assert.equal(await pi.setModel(runtime.getModel('restore-openai', id)), true);
            }
          });
          pi.on('before_provider_request', (event) =>
            authored ? { ...event.payload, [option]: 'user-value' } : undefined,
          );
        },
      ],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const { session } = await sdk.createAgentSession({
      cwd: agentDir,
      agentDir,
      modelRuntime: runtime,
      model,
      thinkingLevel: 'high',
      resourceLoader: loader,
      tools: [],
      sessionManager: sdk.SessionManager.inMemory(agentDir),
      settingsManager: sdk.SettingsManager.inMemory({
        transport: 'sse',
        compaction: { enabled: false },
        retry: { enabled: false },
        cacheWarming: { mode: 'off' },
      }),
    });
    try {
      await session.bindExtensions({});
      for (const mode of mismatch ? ['on'] : ['on', 'off', 'authored']) {
        authored = mode === 'authored';
        await session.prompt(mode === 'off' ? '/fast off' : '/fast on');
        const before = requests.length;
        await session.prompt(`loopback ${name} ${mode}`);
        assert.equal(session.getLastAssistantText(), 'ok', JSON.stringify(session.messages.at(-1)));
        assert.equal(requests.length, before + 1);
        const wire = requests.at(-1);
        const supported = name !== 'restore-codex-key' && !mismatch;
        const expected = authored
          ? 'user-value'
          : mode === 'on' && supported
            ? option === 'speed'
              ? 'fast'
              : 'priority'
            : undefined;
        assert.equal(wire.payload[option], expected, `${name}/${mode} actual wire fast option`);
        if (option === 'speed') {
          const betas = wire.headers['anthropic-beta']?.split(',') ?? [];
          assert.equal(betas.includes('fast-mode-2026-02-01'), mode !== 'off');
          if (name === 'anthropic') {
            assert.equal(model.compat.supportsMidConvoEffort, true);
            assert.ok(betas.includes('mid-conversation-output-config-2026-07-01'));
            assert.ok(betas.includes('thinking-binding-controls-2026-08-01'));
            assert.equal(wire.payload.betas, undefined, 'SDK must serialize betas as headers');
            assert.ok(betas.includes('claude-code-20250219'));
            assert.ok(betas.includes('oauth-2025-04-20'));
          }
        } else {
          assert.equal(wire.headers['anthropic-beta'], undefined);
        }
        assert.equal(wire.payload[option === 'speed' ? 'service_tier' : 'speed'], undefined);
      }
      if (mismatch) {
        assert.equal(switched, true);
        assert.equal(session.model.provider, 'restore-openai');
      }
      assert.ok(
        session.sessionManager
          .getBranch()
          .some(
            (entry) =>
              entry.type === 'custom' &&
              entry.customType === 'fast' &&
              entry.data?.enabled === true,
          ),
      );
      console.log(`PASS: ${name} wire options, completed response and persisted intent`);
    } finally {
      session.dispose();
    }
  }
  // Optional installed-CLI replay; normal workspace/consumer tests require only the pinned SDK.
  if (cliPath) {
    await writeFile(
      join(agentDir, 'settings.json'),
      JSON.stringify({
        transport: 'sse',
        compaction: { enabled: false },
        retry: { enabled: false },
        cacheWarming: { mode: 'off' },
      }),
    );
    for (const [provider, model, option] of [
      ['restore-claude', 'claude-opus-5', 'speed'],
      ['restore-openai', 'gpt-5.4', 'service_tier'],
      ['openai-codex', 'gpt-5.4', 'service_tier'],
    ]) {
      const before = requests.length;
      const execution = promisify(execFile)(
        cliPath,
        [
          '--print',
          '--no-session',
          '--no-extensions',
          '--no-skills',
          '--no-prompt-templates',
          '--no-themes',
          '--no-context-files',
          '--no-tools',
          '--offline',
          '-e',
          packageRoot,
          '--provider',
          provider,
          '--model',
          model,
          '--fast',
          '--',
          'loopback CLI fast restoration',
        ],
        {
          cwd: agentDir,
          timeout: 30_000,
          env: {
            PATH: process.env.PATH,
            HOME: agentDir,
            PI_CODING_AGENT_DIR: agentDir,
            PI_OFFLINE: '1',
            NO_COLOR: '1',
          },
        },
      );
      execution.child.stdin.end();
      const { stdout } = await execution;
      assert.equal(stdout.trim(), 'ok');
      assert.equal(requests.length, before + 1);
      assert.equal(requests.at(-1).payload[option], option === 'speed' ? 'fast' : 'priority');
      console.log(`PASS: installed CLI ${provider} sends ${option} and completes`);
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(agentDir, { recursive: true, force: true });
}
