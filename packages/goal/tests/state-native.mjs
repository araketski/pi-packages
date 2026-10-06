// Actual host APIs and resource source from the selected installed package.
// Test-only companion observes state; the public runtime owns session replacement.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, realpath, rename, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function exerciseState(sdk, sdkPath, packageRoot, agentDir, runtime) {
  const { createJiti } = createRequire(await realpath(sdkPath))('jiti');
  const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false });
  const { bindGoalState } = await jiti.import(join(packageRoot, 'extensions/goal/index.ts'));
  const { STATE_ENTRY } = await jiti.import(join(packageRoot, 'extensions/goal/state.ts'));
  const observations = [];
  for (const mode of ['persistent', 'memory']) {
    let state;
    const reasons = [];
    const errors = [];
    const resourceLoaderOptions = {
      noContextFiles: true,
      extensionFactories: [
        (pi) => {
          state = bindGoalState(pi);
          pi.on('session_start', (event) => reasons.push(event.reason));
          pi.on('session_tree', () => reasons.push('tree'));
          pi.on('session_compact', () => reasons.push('compact'));
          pi.on('session_before_compact', (event) => ({
            compaction: {
              summary: 'Controlled summary; not a goal-state replacement',
              firstKeptEntryId: event.preparation.firstKeptEntryId,
              tokensBefore: event.preparation.tokensBefore,
            },
          }));
        },
      ],
    };
    const manager =
      mode === 'persistent'
        ? sdk.SessionManager.create(agentDir, join(agentDir, 'sessions'))
        : sdk.SessionManager.inMemory(agentDir);
    manager.appendCustomEntry('goal-state', {
      status: 'active',
      objective: 'Legacy remains unused',
      evidence: ['legacy'],
    });
    const legacyEntry = JSON.stringify(manager.getEntries()[0]);
    // Public conversation append creates a persistent file. No raw session writes.
    manager.appendMessage({ role: 'user', content: 'Isolated fixture seed', timestamp: 1 });
    const model = runtime.getModels()[0];
    manager.appendMessage({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Controlled historical turn for native compaction preparation.' },
      ],
      api: model.api,
      provider: model.provider,
      model: model.id,
      stopReason: 'stop',
      timestamp: 2,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    manager.appendMessage({
      role: 'user',
      content: 'A subsequent turn can be kept after compaction',
      timestamp: 3,
    });
    const originalFile = manager.getSessionFile();
    const legacyLine =
      mode === 'persistent' ? (await readFile(originalFile, 'utf8')).split('\n')[1] : null;
    const createRuntime = async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
      const services = await sdk.createAgentSessionServices({
        cwd,
        agentDir,
        modelRuntime: runtime,
        resourceLoaderOptions,
        settingsManager: sdk.SettingsManager.inMemory({
          compaction: { enabled: false, keepRecentTokens: 1 },
          retry: { enabled: false },
          cacheWarming: { mode: 'off' },
        }),
      });
      const result = await sdk.createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        model,
        tools: [],
      });
      return { ...result, services, diagnostics: services.diagnostics };
    };
    const start = async (sessionManager) => {
      const host = await sdk.createAgentSessionRuntime(createRuntime, {
        cwd: agentDir,
        agentDir,
        sessionManager,
      });
      host.setRebindSession((next) =>
        next.bindExtensions({ onError: (error) => errors.push(error) }),
      );
      await host.session.bindExtensions({ onError: (error) => errors.push(error) });
      return host;
    };
    let host = await start(manager);
    let session = host.session;
    const bind = () => ({
      goalId: state.inspect().goal.id,
      revision: state.inspect().goal.revision,
    });
    try {
      assert.equal(state.inspect().goal, null);
      assert.equal(JSON.stringify(session.sessionManager.getEntries()[0]), legacyEntry);
      state.create('A fresh installed consumer loads and restores an evidenced goal');
      state.initializeRequirements(bind(), [
        { id: 'consumer', criterion: 'Installed package loads through Pi 0.99.1' },
      ]);
      state.addEvidence(bind(), 'consumer', {
        id: 'receipt',
        reference: 'native consumer receipt',
        claim: 'Resource loaded and state round-tripped',
      });
      state.setRequirementStatus(bind(), 'consumer', 'verified');
      state.recordReview(state.beginReview('criteria', 'criteria-key', 'profile-key'), {
        outcome: 'sufficient',
        diagnostic: 'Controlled stored assessment, not classifier inference',
      });
      state.recordReview(state.beginReview('evidence', 'evidence-key', 'profile-key'), {
        outcome: 'insufficient',
        diagnostic: 'Controlled refusal',
      });
      state.updateSettings(bind(), { classifiersEnabled: false });
      const beforeReload = state.inspect();
      if (mode === 'persistent') {
        const diskBefore = await readFile(originalFile);
        await rename(originalFile, originalFile + '.saved');
        await mkdir(originalFile);
        assert.throws(() =>
          state.addEvidence(bind(), 'consumer', {
            id: 'rejected',
            reference: 'ref',
            claim: 'Rejected by disk append',
          }),
        );
        await rmdir(originalFile);
        await rename(originalFile + '.saved', originalFile);
        assert.deepEqual(await readFile(originalFile), diskBefore);
        await session.reload();
        assert.equal(state.inspect().goal, null);
        assert.match(state.diagnostic, /failed append/);
        assert.throws(() => state.create('Bypass failed append'), /session/);
        assert.equal((await host.switchSession(originalFile)).cancelled, false);
        session = host.session;
        assert.deepEqual(state.inspect(), beforeReload);
        assert.equal(state.hasApplicableRefusal(), true);
        assert.throws(() => state.recordTerminal(bind(), 'complete'), /review/);
      }
      const activeEntry = session.sessionManager.getLeafId();
      const late = state.beginReview('evidence', 'evidence-key', 'profile-key');
      await session.reload();
      assert.equal(state.inspect().goal.status, 'paused');
      assert.deepEqual(state.inspect().goal.ledger, beforeReload.goal.ledger);
      assert.equal(state.hasApplicableRefusal(), true);
      assert.equal(
        state.recordReview(late, { outcome: 'sufficient', diagnostic: 'Stale reload result' }),
        false,
      );
      const tree = await session.navigateTree(activeEntry, { summarize: false });
      assert.equal(tree.cancelled, false);
      assert.deepEqual(state.inspect(), beforeReload);
      await session.compact();
      assert.deepEqual(state.inspect(), beforeReload);
      assert(reasons.includes('compact'));
      const saved = state.inspect();
      const entries = session.sessionManager.getEntries();
      const header = session.sessionManager.getHeader();
      const selectedFile = session.sessionManager.getSessionFile();
      await host.dispose();
      const reopenedManager =
        mode === 'persistent'
          ? sdk.SessionManager.open(selectedFile, join(agentDir, 'sessions'))
          : sdk.SessionManager.inMemory(agentDir, undefined, [header, ...entries]);
      host = await start(reopenedManager);
      session = host.session;
      assert.deepEqual(errors, []);
      assert.equal(
        state.inspect().goal?.status,
        'paused',
        JSON.stringify({ mode, diagnostic: state.diagnostic, reasons }),
      );
      assert.deepEqual(state.inspect().goal.ledger, saved.goal.ledger);
      assert.equal(state.hasApplicableRefusal(), true);
      // Tree follows branch contents instead of replaying startup pause policy.
      assert.equal(
        (await session.navigateTree(activeEntry, { summarize: false })).cancelled,
        false,
      );
      assert.deepEqual(state.inspect(), saved);
      state.recordReview(state.beginReview('evidence', 'evidence-key', 'profile-key'), {
        outcome: 'sufficient',
        diagnostic: 'Explicit valid replacement assessment',
      });
      state.recordTerminal(bind(), 'complete');
      const terminal = state.inspect();
      const completedEntry = session.sessionManager.getLeafId();
      const forkPoint = session.sessionManager.appendMessage({
        role: 'user',
        content: 'Fork at this normal user entry',
        timestamp: 2,
      });
      const originalSession = session.sessionManager.getSessionId();
      assert.equal((await host.fork(forkPoint, { position: 'at' })).cancelled, false);
      session = host.session;
      assert.notEqual(session.sessionManager.getSessionId(), originalSession);
      assert.deepEqual(state.inspect(), terminal);
      const forkTicketState = state;
      assert.equal((await host.newSession()).cancelled, false);
      session = host.session;
      assert.equal(state.inspect().goal, null);
      assert.equal(forkTicketState.inspect().goal, null);
      if (mode === 'persistent') {
        assert.equal((await host.switchSession(selectedFile)).cancelled, false);
        session = host.session;
        assert.deepEqual(state.inspect(), terminal);
        assert.equal((await readFile(originalFile, 'utf8')).split('\n')[1], legacyLine);
        assert.equal(JSON.stringify(session.sessionManager.getEntries()[0]), legacyEntry);
        assert(session.sessionManager.getEntry(completedEntry));
        const audit = JSON.stringify(session.sessionManager.getEntry(completedEntry));
        state.create('Next goal, former terminal record retained');
        assert.equal(JSON.stringify(session.sessionManager.getEntry(completedEntry)), audit);
      }
      // Seed ordinary malformed new-format state with the public API, never raw JSONL.
      session.sessionManager.appendCustomEntry(STATE_ENTRY, {
        schema: 1,
        goal: { status: 'complete', ledger: [] },
      });
      await session.reload();
      assert.equal(state.inspect().goal, null);
      assert.match(state.diagnostic, /malformed/);
      assert.deepEqual(errors, []);
      observations.push({
        mode,
        roundTrip: true,
        branch: true,
        fork: true,
        newSession: true,
        switchedSession: mode === 'persistent',
        compaction: true,
        malformed: true,
        refusalRetained: true,
        failedAppendQuarantined: mode === 'persistent',
        legacyBytePreserved: true,
        lifecycleReasons: [...new Set(reasons)],
      });
    } finally {
      await host.dispose();
    }
  }
  return observations;
}
