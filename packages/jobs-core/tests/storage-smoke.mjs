import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Shared native/installed-artifact fixture: actual public Pi 0.99.1 and an ordinary command.
export async function exerciseStorage(core, sdk, root, other = core) {
  const value = (reply) => {
    assert.equal(reply.status, 'ok', JSON.stringify(reply));
    return reply.value;
  };
  await mkdir(root, { recursive: true });
  const records = [];
  for (const persistent of [true, false]) {
    const cwd = join(root, persistent ? 'persistent' : 'memory');
    await mkdir(cwd, { recursive: true });
    const manager = persistent
      ? sdk.SessionManager.create(cwd, join(cwd, 'sessions'))
      : sdk.SessionManager.inMemory(cwd);
    const outputRoot = join(cwd, 'owned-output');
    const output = core.createJobsFileOutput(outputRoot);
    const session = (m) => ({
      sessionId: m.getSessionId(),
      persistent,
      appendEntry: (type, data) => {
        m.appendCustomEntry(type, data);
      },
      getEntries: () => m.getEntries(),
    });
    const store = core.createSessionJobStore({
      session: session(manager),
      output,
      maxBytes: 100,
      headBytes: 8,
    });
    const job = {
      runtimeId: 'runtime',
      ownerId: 'owner',
      sessionId: manager.getSessionId(),
      jobId: 'command',
      producerId: 'external/opaque',
    };
    const request = {
      identity: job,
      authority: { runtimeId: 'runtime', ownerId: 'owner', generation: 'owned' },
      awaiting: true,
      delivery: 'automatic',
      lifetime: 'managed',
    };
    const token = value(await store.jobs.reserve(request));
    const filename = manager.getSessionFile();
    if (persistent) {
      assert(filename);
      assert.equal(existsSync(filename), false);
    }
    assert.deepEqual(manager.buildSessionContext().messages, []);
    assert.equal(manager.getEntries().filter((e) => e.type === 'custom').length, 1);
    const child = spawn(process.execPath, [
      '-e',
      "process.stdout.write('BEGIN:'+ 'é'.repeat(50000)+':TAIL');process.exitCode=7",
    ]);
    let launchCount = 1;
    const closed = new Promise((resolve, reject) => {
      child.once('close', resolve);
      child.once('error', reject);
    });
    for await (const bytes of child.stdout)
      value(await store.capture(job, { stream: 'stdout', bytes }));
    child.stderr.resume();
    assert.equal(await closed, 7);
    // Explicit output read obtains the live buffer and attempts a snapshot.
    const live = value(await store.readOutput(job));
    assert.equal(live.source, 'live');
    assert.equal(live.retainedBytes, 100);
    assert.equal(live.totalBytes, 100011);
    assert.equal(live.window.omittedBytes, 99911);
    assert.equal(live.window.complete, false);
    assert(live.window.text.startsWith('BEGIN:'));
    assert(live.window.text.endsWith(':TAIL'));
    const excerpt = sdk.truncateHead(live.window.text, { maxBytes: 60, maxLines: 10 });
    assert(excerpt.content.length < live.window.text.length);
    const final = {
      identity: { job, resultId: 'stable-result' },
      outcome: { kind: 'exit', exitCode: 7 },
      content: 'actual command exited 7',
    };
    value(await store.results.save(final));
    const observed = value(await store.jobs.read(job));
    value(
      await store.jobs.save(token, {
        ...observed,
        awaiting: false,
        delivery: { mode: 'next-natural-turn', state: 'pending' },
      }),
    );
    // Setup/custom entries still do not flush Pi's newly created session.
    if (persistent) assert.equal(existsSync(filename), false);
    manager.appendMessage({
      role: 'user',
      content: 'first user before any assistant',
      timestamp: Date.now(),
    });
    if (persistent) assert.equal(existsSync(filename), true);
    const reopenedManager = persistent ? sdk.SessionManager.open(filename) : manager;
    const reopened = other.createSessionJobStore({ session: session(reopenedManager), output });
    assert.deepEqual(value(await reopened.results.read(final.identity)), final);
    const history = value(await reopened.jobs.read(job));
    assert.equal(history.awaiting, false);
    assert.equal(history.delivery.mode, 'next-natural-turn');
    assert.equal(history.capabilities.stop, false);
    assert.equal(history.execution.outcome.exitCode, 7);
    assert.equal(reopenedManager.buildSessionContext().messages.length, 1);
    assert.equal(reopenedManager.buildSessionContext().messages[0].role, 'user');
    assert.equal(JSON.stringify(reopenedManager.getEntries()).includes('BEGIN:'), false);
    const savedOutput = value(await reopened.readOutput(job));
    assert.equal(savedOutput.source, 'snapshot');
    assert.equal(savedOutput.window.omittedBytes, 99911);
    await output.remove(savedOutput.window.reference);
    assert.equal((await reopened.readOutput(job)).status, 'unavailable');
    assert.deepEqual(value(await reopened.results.read(final.identity)), final);
    assert.equal(launchCount, 1); // Replay is data-only; no executor/launch capability is supplied.
    // A separate producer/core copy/session has its own admission and output, no shared ceiling.
    const manager2 = sdk.SessionManager.inMemory(cwd);
    const second = other.createSessionJobStore({
      session: { ...session(manager2), persistent: false },
      output,
      maxBytes: 100,
      headBytes: 8,
    });
    const job2 = {
      ...job,
      sessionId: manager2.getSessionId(),
      jobId: 'independent',
      producerId: 'another/opaque',
    };
    value(await second.jobs.reserve({ ...request, identity: job2, delivery: 'display-only' }));
    value(await second.capture(job2, { stream: 'combined', bytes: Buffer.alloc(120, 66) }));
    assert.equal(value(await second.readOutput(job2)).retainedBytes, 100);
    value(
      await second.results.save({
        identity: { job: job2, resultId: 'second-final' },
        outcome: { kind: 'exit', exitCode: 0 },
        content: 'finished',
      }),
    );
    assert.equal(await second.dispose().then((x) => x.length), 0);
    // Another no-session instance owns cleanup only of its own temporary artifact.
    const cleanupJob = { ...job2, jobId: 'temporary' };
    const temporary = core.createSessionJobStore({
      session: { ...session(manager2), persistent: false },
      output,
      maxBytes: 100,
    });
    value(
      await temporary.jobs.reserve({ ...request, identity: cleanupJob, delivery: 'display-only' }),
    );
    value(
      await temporary.results.save({
        identity: { job: cleanupJob, resultId: 'temporary-final' },
        outcome: { kind: 'exit', exitCode: 0 },
        content: 'finished',
      }),
    );
    assert.equal((await readdir(outputRoot)).length, 1);
    assert.equal((await temporary.dispose()).length, 0);
    assert.equal((await readdir(outputRoot)).length, 0);
    store.invalidateOrigin();
    const entryCount = manager.getEntries().length;
    assert.equal((await store.results.save(final)).status, 'unavailable');
    assert.equal(manager.getEntries().length, entryCount);
    records.push({
      persistent,
      sessionId: manager.getSessionId(),
      exitCode: 7,
      retainedBytes: 100,
      omittedBytes: 99911,
      customEntries: reopenedManager.getEntries().filter((e) => e.type === 'custom').length,
      firstUserPersistence: persistent,
      modelMessages: 1,
    });
  }
  return records;
}
