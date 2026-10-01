// Replay with either workspace source or a freshly installed package. No live model calls.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdkPath, packageRoot] = process.argv.slice(2);
const sdk = await import(pathToFileURL(sdkPath).href);
const agentDir = await mkdtemp(join(tmpdir(), 'repair-fast-runtime-'));
const requests = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  requests.push({ payload: JSON.parse(body), headers: req.headers });
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (delta, finish_reason) => ({
    id: 'loopback',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-5.4',
    choices: [{ index: 0, delta, finish_reason }],
  });
  res.end(
    `data: ${JSON.stringify(chunk({ role: 'assistant', content: 'ok' }, null))}\n\n` +
      `data: ${JSON.stringify(chunk({}, 'stop'))}\n\ndata: [DONE]\n\n`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let session;
try {
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  await writeFile(
    join(agentDir, 'models.json'),
    JSON.stringify({
      providers: {
        'repair-actual': {
          api: 'openai-completions',
          baseUrl,
          apiKey: 'loopback-only',
          models: [{ id: 'gpt-5.4', contextWindow: 8192, maxTokens: 128 }],
        },
        'repair-selection': {
          api: 'openai-responses',
          baseUrl,
          apiKey: 'loopback-only',
          models: [{ id: 'gpt-5.4', contextWindow: 8192, maxTokens: 128 }],
        },
      },
    }),
  );
  const runtime = await sdk.ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    modelsStorePath: join(agentDir, 'models-store.json'),
    allowModelNetwork: false,
  });
  const actual = runtime.getModel('repair-actual', 'gpt-5.4');
  const selection = runtime.getModel('repair-selection', 'gpt-5.4');
  assert.ok(actual && selection);
  let switched = false;
  const loader = new sdk.DefaultResourceLoader({
    cwd: agentDir,
    agentDir,
    additionalExtensionPaths: [packageRoot],
    extensionFactories: [
      (pi) => {
        // Change the live selection after dispatch chose its physical target, before the
        // fast-mode payload handler. The public API allows this; model ID stays identical.
        pi.on('before_provider_headers', async () => {
          if (!switched) {
            switched = true;
            assert.equal(await pi.setModel(selection), true);
          }
        });
      },
    ],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  ({ session } = await sdk.createAgentSession({
    cwd: agentDir,
    agentDir,
    modelRuntime: runtime,
    model: actual,
    resourceLoader: loader,
    tools: [],
    sessionManager: sdk.SessionManager.inMemory(agentDir),
    settingsManager: sdk.SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
      cacheWarming: { mode: 'off' },
    }),
  }));
  await session.bindExtensions({});
  await session.prompt('/fast on');
  await session.prompt('loopback identity regression');
  assert.equal(session.getLastAssistantText(), 'ok');
  assert.equal(requests.length, 1);
  assert.equal(switched, true);
  assert.equal(session.model.provider, 'repair-selection');
  assert.equal(requests[0].payload.model, 'gpt-5.4');
  assert.equal(
    'service_tier' in requests[0].payload,
    false,
    'selected Responses model must not add priority to actual Completions request',
  );
  assert.equal('speed' in requests[0].payload, false);
  assert.equal(requests[0].headers['anthropic-beta'], undefined);
  assert.ok(
    session.sessionManager
      .getBranch()
      .some(
        (entry) =>
          entry.type === 'custom' && entry.customType === 'fast' && entry.data?.enabled === true,
      ),
  );
  console.log(
    'PASS: native same-ID selection/dispatch mismatch remains untouched; intent persisted',
  );
} finally {
  session?.dispose();
  await new Promise((resolve) => server.close(resolve));
  await rm(agentDir, { recursive: true, force: true });
}
