// Isolated scaffold loading only; no model inference or live power state.
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdkPath, resourcePath] = process.argv.slice(2);
const packageRoot = await realpath(resourcePath);
const agentDir = await mkdtemp(join(tmpdir(), 'caffeinate-agent-'));
let networkCalls = 0;
let processCalls = 0;
let busEmissions = 0;
globalThis.fetch = () => {
  networkCalls++;
  throw new Error('Network access is forbidden in scaffold loading');
};
try {
  const sdk = await import(pathToFileURL(sdkPath).href);
  // Block backend launches and native network entrypoints before loading the
  // package. This subprocess owns these guards; host SDK import is not measured.
  for (const method of [
    'spawn',
    'spawnSync',
    'exec',
    'execSync',
    'execFile',
    'execFileSync',
    'fork',
  ]) {
    childProcess[method] = () => {
      processCalls++;
      throw new Error(`Process launch ${method} is forbidden in scaffold loading`);
    };
  }
  for (const [module, methods] of [
    [net, ['connect', 'createConnection']],
    [http, ['request', 'get']],
    [https, ['request', 'get']],
  ]) {
    for (const method of methods) {
      module[method] = () => {
        networkCalls++;
        throw new Error(`Network ${method} is forbidden in scaffold loading`);
      };
    }
  }
  syncBuiltinESMExports();
  const eventBus = sdk.createEventBus();
  const emit = eventBus.emit.bind(eventBus);
  eventBus.emit = (channel, data) => {
    busEmissions++;
    emit(channel, data);
  };
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ packages: [packageRoot] }));
  const loader = new sdk.DefaultResourceLoader({
    cwd: agentDir,
    agentDir,
    eventBus,
    noContextFiles: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  const checkResources = async () => {
    await loader.reload();
    const result = loader.getExtensions();
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings ?? [], []);
    assert.equal(result.extensions.length, 1);
    const extension = result.extensions[0];
    assert.equal(
      await realpath(extension.resolvedPath),
      join(packageRoot, 'extensions/caffeinate/index.ts'),
    );
    assert.equal(extension.sourceInfo.origin, 'package');
    assert.equal(await realpath(extension.sourceInfo.baseDir), packageRoot);
    for (const field of [
      'handlers',
      'tools',
      'commands',
      'flags',
      'shortcuts',
      'messageRenderers',
    ]) {
      assert.equal(extension[field].size, 0, `${field} must remain empty`);
    }
    assert.equal(extension.markdownTransformer, undefined);
    assert.equal(extension.entryRenderers?.size ?? 0, 0);
    assert.deepEqual(loader.getSkills().skills, []);
    assert.deepEqual(loader.getPrompts().prompts, []);
    assert.deepEqual(loader.getThemes().themes, []);
  };
  await checkResources();
  const runtime = await sdk.ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    modelsStorePath: join(agentDir, 'models-store.json'),
    allowModelNetwork: false,
  });
  const sessionManager = sdk.SessionManager.inMemory(agentDir);
  sessionManager.appendCustomEntry('unrelated-fixture', { value: 'Leave this untouched' });
  const unrelated = JSON.stringify(sessionManager.getEntries()[0]);
  const { session } = await sdk.createAgentSession({
    cwd: agentDir,
    agentDir,
    resourceLoader: loader,
    modelRuntime: runtime,
    sessionManager,
    tools: [],
    settingsManager: sdk.SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: false },
      cacheWarming: { mode: 'off' },
    }),
  });
  // Host initialization may record its own thinking level. Compare history
  // after construction to attribute binding/reload changes to the scaffold.
  assert.equal(JSON.stringify(sessionManager.getEntries()[0]), unrelated);
  const before = JSON.stringify(sessionManager.getEntries());
  try {
    await session.bindExtensions({});
    assert.deepEqual(session.getAllTools(), []);
    assert.equal(JSON.stringify(sessionManager.getEntries()), before);
    await session.reload();
    assert.deepEqual(session.getAllTools(), []);
    assert.equal(JSON.stringify(sessionManager.getEntries()), before);
    await checkResources();
    assert.equal(busEmissions, 0);
    assert.equal(processCalls, 0);
    assert.equal(networkCalls, 0);
  } finally {
    session.dispose();
  }
  console.log(
    JSON.stringify({
      sdkPath: await realpath(sdkPath),
      packageRoot,
      piVersion: JSON.parse(await readFile(join(sdkPath, '../../package.json'), 'utf8')).version,
      extension: 'caffeinate',
      registrations: 0,
      busEmissions,
      processCalls,
      networkCalls,
      sessionEntriesUnchanged: true,
      ownership: {
        uid: process.getuid(),
        pid: process.pid,
        stat: await readFile('/proc/self/stat', 'utf8'),
        argv: process.argv,
        session: process.env.PI_SESSION_ID,
        tmpdir: tmpdir(),
      },
    }),
  );
} finally {
  await rm(agentDir, { recursive: true, force: true });
}
