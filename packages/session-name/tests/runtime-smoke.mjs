// Offline native Pi replay, shared by source and independently installed artifacts.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdkPath, packageRoot] = process.argv.slice(2);
const sdk = await import(pathToFileURL(sdkPath).href);
const agentDir = await mkdtemp(join(tmpdir(), 'session-name-runtime-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
const requests = [];
let failure;
let remainingFailures = 0;
let chatGate;
let titleGate;
let releaseChat;
let releaseTitle;
async function waitFor(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'timed out waiting for background naming');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const server = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const title = body.messages.some(
    (m) =>
      (m.role === 'system' || m.role === 'developer') &&
      typeof m.content === 'string' &&
      m.content.includes('Generate a concise task title'),
  );
  requests.push({ title, body, headers: req.headers });
  if (title && remainingFailures-- > 0) {
    res.writeHead(failure, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `HTTP ${failure}`, type: 'test_error' } }));
    return;
  }
  await (title ? titleGate : chatGate);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (delta, finish_reason) => ({
    id: 'offline',
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
    choices: [{ index: 0, delta, finish_reason }],
  });
  res.end(
    `data: ${JSON.stringify(chunk({ role: 'assistant', content: title ? '"Fix login redirect."' : 'Normal chat reply' }, null))}\n\n` +
      `data: ${JSON.stringify(chunk({}, 'stop'))}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let session;
try {
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const provider = (id, header) => ({
    api: 'openai-completions',
    baseUrl,
    apiKey: 'offline-only',
    headers: { 'x-title-source': header },
    models: [
      {
        id,
        reasoning: true,
        compat: { supportsReasoningEffort: true },
        contextWindow: 8192,
        maxTokens: 2048,
      },
    ],
  });
  await writeFile(
    join(agentDir, 'models.json'),
    JSON.stringify({
      providers: {
        'naming-chat': provider('chat-model', 'chat'),
        'naming-title': provider('title-model', 'title'),
      },
    }),
  );
  const runtime = await sdk.ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    modelsStorePath: join(agentDir, 'models-store.json'),
    allowModelNetwork: false,
  });
  const model = runtime.getModel('naming-chat', 'chat-model');
  assert.ok(model);

  async function run(
    config,
    status,
    count,
    expectedName,
    expectedTitleCalls,
    savedName,
    concurrent = false,
  ) {
    await writeFile(join(agentDir, 'session-name.json'), JSON.stringify(config));
    failure = status;
    remainingFailures = count;
    const start = requests.length;
    const loader = new sdk.DefaultResourceLoader({
      cwd: agentDir,
      agentDir,
      additionalExtensionPaths: [packageRoot],
    });
    await loader.reload();
    const resources = loader.getExtensions();
    assert.deepEqual(resources.errors, []);
    const loaded = resources.extensions.find(
      (ext) => ext.path === join(packageRoot, 'extensions/session-name/index.ts'),
    );
    assert.ok(loaded, 'entrypoint must come from supplied source/installed package');
    assert.equal(loaded.commands.size, 0);
    assert.equal(loaded.tools.size, 0);
    const manager = sdk.SessionManager.create(agentDir, join(agentDir, 'sessions'));
    if (savedName !== undefined) manager.appendSessionInfo(savedName);
    ({ session } = await sdk.createAgentSession({
      cwd: agentDir,
      agentDir,
      modelRuntime: runtime,
      model,
      thinkingLevel: 'high',
      resourceLoader: loader,
      tools: [],
      sessionManager: manager,
      settingsManager: sdk.SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: false },
        cacheWarming: { mode: 'off' },
      }),
    }));
    await session.bindExtensions({});
    if (concurrent) {
      chatGate = new Promise((resolve) => {
        releaseChat = resolve;
      });
      titleGate = new Promise((resolve) => {
        releaseTitle = resolve;
      });
    }
    let chatFinished = false;
    const chat = session.prompt('Please investigate login loops\nMore private details').then(() => {
      chatFinished = true;
    });
    if (concurrent) {
      await waitFor(
        () =>
          requests.slice(start).some((r) => r.title) && requests.slice(start).some((r) => !r.title),
      );
      assert.equal(manager.getSessionName(), undefined);
      if (concurrent === 'chat-first') {
        releaseChat();
        await chat;
        assert.equal(manager.getSessionName(), undefined, 'chat must not wait for naming');
        releaseTitle();
      } else {
        releaseTitle();
        await waitFor(() => manager.getSessionName() === expectedName);
        assert.equal(chatFinished, false, 'name must be persisted before the chat finishes');
        releaseChat();
      }
    }
    await chat;
    // Chat completion no longer waits for the independent title request.
    await waitFor(() => manager.getSessionName() === expectedName);
    chatGate = titleGate = undefined;
    assert.equal(manager.getSessionName(), expectedName, JSON.stringify(requests.slice(start)));
    assert.equal(session.model.provider, 'naming-chat');
    assert.equal(session.getLastAssistantText(), 'Normal chat reply');
    assert.equal(session.thinkingLevel, 'high');
    const calls = requests.slice(start).filter((r) => r.title);
    assert.equal(calls.length, expectedTitleCalls);
    for (const call of calls) {
      assert.equal(call.body.model, config.model ?? 'chat-model');
      assert.equal(call.headers['x-title-source'], config.model ? 'title' : 'chat');
      assert.equal(call.body.reasoning_effort, config.thinking === 'low' ? 'low' : undefined);
      assert.equal(call.body.max_completion_tokens ?? call.body.max_tokens, 128);
      assert.equal(call.body.messages.filter((m) => m.role === 'user').length, 1);
    }
    assert.equal(
      manager.getEntries().filter((e) => e.type === 'message' && e.message.role === 'user').length,
      1,
    );
    await session.prompt('A second chat turn');
    assert.equal(requests.slice(start).filter((r) => r.title).length, expectedTitleCalls);
    const file = manager.getSessionFile();
    assert.ok(file);
    const reopened = sdk.SessionManager.open(file);
    assert.equal(reopened.getSessionName(), expectedName);
    assert.ok((await readFile(file, 'utf8')).includes('session_info'));
    session.dispose();
    session = undefined;
  }

  await run({}, 503, 1, 'Fix login redirect', 2);
  await run(
    { provider: 'naming-title', model: 'title-model', thinking: 'low' },
    0,
    0,
    'Fix login redirect',
    1,
  );
  await run({}, 401, 1, 'Please investigate login loops', 1);
  await run({ provider: 'missing', model: 'missing' }, 0, 0, 'Please investigate login loops', 0);
  await run({}, 0, 0, 'Saved task', 0, 'Saved task');
  await run({}, 0, 0, undefined, 0, '');
  await run({}, 0, 0, 'Fix login redirect', 1, undefined, 'title-first');
  await run({}, 0, 0, 'Fix login redirect', 1, undefined, 'chat-first');
  console.log(
    'PASS: concurrent native naming before chat completion, provider/auth/thinking overrides, retry/fallback, transcript isolation and saved metadata',
  );
} finally {
  releaseTitle?.();
  releaseChat?.();
  session?.dispose();
  await new Promise((resolve) => server.close(resolve));
  await rm(agentDir, { recursive: true, force: true });
}
