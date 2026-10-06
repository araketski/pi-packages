// Shared source/installed scaffold check. No model inference or live user state.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdkPath, resourcePath] = process.argv.slice(2);
const packageRoot = await realpath(resourcePath);
const agentDir = await mkdtemp(join(tmpdir(), 'goal-agent-'));
let networkCalls = 0;
globalThis.fetch = () => {
  networkCalls++;
  throw new Error('Network access is forbidden in scaffold discovery');
};
try {
  const sdk = await import(pathToFileURL(sdkPath).href);
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ packages: [packageRoot] }));
  const loader = new sdk.DefaultResourceLoader({
    cwd: agentDir,
    agentDir,
    noContextFiles: true,
  });
  const checkResources = async () => {
    await loader.reload();
    const result = loader.getExtensions();
    assert.deepEqual(result.errors, []);
    assert.equal(result.extensions.length, 1);
    const extension = result.extensions[0];
    assert.equal(
      await realpath(extension.resolvedPath),
      join(packageRoot, 'extensions/goal/index.ts'),
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
    const { skills, diagnostics } = loader.getSkills();
    assert.deepEqual(diagnostics, []);
    // Pi also supplies bundled skills. Assert the selected package's provenance,
    // not the size of the host's complete skill catalog.
    const packageSkills = skills.filter(
      (skill) => skill.sourceInfo?.origin === 'package' && skill.sourceInfo.baseDir === packageRoot,
    );
    assert.equal(packageSkills.length, 1);
    const skill = packageSkills[0];
    assert.equal(skill.name, 'goal-writer');
    assert.equal(skill.sourceInfo.origin, 'package');
    assert.equal(await realpath(skill.sourceInfo.baseDir), packageRoot);
    assert.equal(await realpath(skill.filePath), join(packageRoot, 'skills/goal-writer/SKILL.md'));
    assert.match(skill.description, /^TODO:/);
    assert.match(await readFile(skill.filePath, 'utf8'), /TODO: Replace this scaffold/);
    assert.deepEqual(loader.getPrompts().prompts, []);
    assert.deepEqual(loader.getThemes().themes, []);
    assert.equal(networkCalls, 0);
  };
  await checkResources();
  const runtime = await sdk.ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    modelsStorePath: join(agentDir, 'models-store.json'),
    allowModelNetwork: false,
  });
  const sessionManager = sdk.SessionManager.inMemory(agentDir);
  sessionManager.appendCustomEntry('legacy-goal-fixture', { objective: 'Leave this untouched' });
  const legacy = JSON.stringify(sessionManager.getEntries()[0]);
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
  // The SDK constructor records its own thinking level. Freeze history after
  // host initialization so binding/reload mutations are attributable here.
  assert.equal(JSON.stringify(sessionManager.getEntries()[0]), legacy);
  const before = JSON.stringify(sessionManager.getEntries());
  try {
    await session.bindExtensions({});
    assert.deepEqual(session.getAllTools(), []);
    assert.equal(JSON.stringify(sessionManager.getEntries()), before);
    await session.reload();
    assert.deepEqual(session.getAllTools(), []);
    assert.equal(JSON.stringify(sessionManager.getEntries()), before);
    await checkResources();
    assert.equal(networkCalls, 0);
  } finally {
    session.dispose();
  }
  console.log(
    JSON.stringify({
      sdkPath: await realpath(sdkPath),
      packageRoot,
      piVersion: JSON.parse(await readFile(join(sdkPath, '../../package.json'), 'utf8')).version,
      extension: 'goal',
      skill: 'goal-writer',
      registrations: 0,
      networkCalls,
      sessionEntriesUnchanged: true,
    }),
  );
} finally {
  await rm(agentDir, { recursive: true, force: true });
}
