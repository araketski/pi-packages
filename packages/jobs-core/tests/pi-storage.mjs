import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert, root, sdk, setup } from './pi-harness.mjs';
const { createJobStorage } = await import(
  JSON.parse(readFileSync(join(root, 'imports.json'), 'utf8')).storage
);
const policy = {
  totalBytes: 40_000,
  outputBytes: 100,
  trackingBytes: 4096,
  resultBytes: 4096,
  retentionMs: 1000,
};
const request = (sessionId, jobId) => ({
  identity: { runtimeId: 'R', ownerId: 'O', sessionId, jobId, producerId: 'external/opaque' },
  authority: { runtimeId: 'R', ownerId: 'O', generation: 'G' },
  awaiting: true,
  delivery: 'automatic',
  lifetime: 'managed',
});
const cwd = join(root, 'persistent-workspace');
mkdirSync(cwd, { recursive: true });
const manager = sdk.SessionManager.create(cwd, join(root, 'sessions'));
const file = manager.getSessionFile();
assert.ok(file);
assert.equal(existsSync(file), false);
let firstUserChecked = false;
const active = await setup({ cwdOverride: cwd, sessionManager: manager });
try {
  const storage = await createJobStorage({
    agentDirectory: join(root, 'persistent-agent'),
    policy,
  });
  const launch = request(manager.getSessionId(), 'persistent');
  const admission = await storage.jobs.reserve(launch);
  assert.equal(admission.status, 'ok');
  active.pi.appendEntry('jobs/reference', {
    job: launch.identity,
    reservationId: admission.value.reservationId,
  });
  assert.equal(existsSync(file), false, 'setup-only custom entries need not create a session file');
  assert(!JSON.stringify(manager.buildSessionContext().messages).includes('jobs/reference'));
  await storage
    .output(admission.value)
    .append({ stream: 'combined', bytes: Buffer.from('external full command log') });
  manager.appendMessage({
    role: 'user',
    content: 'First user persists the buffered reference.',
    timestamp: Date.now(),
  });
  assert.equal(existsSync(file), true);
  const entries = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((x) => JSON.parse(x));
  assert(entries.some((e) => e.type === 'custom' && e.customType === 'jobs/reference'));
  assert(entries.some((e) => e.type === 'message' && e.message.role === 'user'));
  assert(!entries.some((e) => e.type === 'message' && e.message.role === 'assistant'));
  firstUserChecked = true;
  assert(!readFileSync(file, 'utf8').includes('external full command log'));
  const result = {
    identity: { job: launch.identity, resultId: 'stable-result' },
    outcome: { kind: 'exit', exitCode: 0 },
    content: 'Saved, not delivered.',
  };
  assert.equal((await storage.results.save(result)).status, 'ok');
  const restored = await createJobStorage({ agentDirectory: storage.agentDirectory });
  assert.deepEqual((await restored.results.read(result.identity)).value, result);
  assert.equal((await restored.jobs.read(launch.identity)).value.delivery.state, 'pending');
  assert.equal(sdk.SessionManager.open(file).getSessionId(), manager.getSessionId());
} finally {
  active.close();
}
const ephemeralManager = sdk.SessionManager.inMemory(join(root, 'ephemeral-workspace'));
const ephemeral = await setup({ sessionManager: ephemeralManager });
try {
  const storage = await createJobStorage({
    agentDirectory: join(root, 'ephemeral-agent'),
    policy,
    ephemeral: true,
  });
  const launch = request(ephemeralManager.getSessionId(), 'temporary');
  const admission = await storage.jobs.reserve(launch);
  assert.equal(admission.status, 'ok');
  ephemeral.pi.appendEntry('jobs/reference', { job: launch.identity });
  assert.equal(ephemeralManager.getSessionFile(), undefined);
  await storage
    .output(admission.value)
    .append({ stream: 'combined', bytes: Buffer.from('no-session output') });
  assert.equal((await storage.readOutput(launch.identity)).value.text, 'no-session output');
  assert.equal((await storage.close()).status, 'ok');
  assert.equal((await storage.jobs.read(launch.identity)).status, 'unavailable');
} finally {
  ephemeral.close();
}
writeFileSync(
  join(root, 'storage-results.json'),
  JSON.stringify({
    baseline: 'Pi 0.99.1',
    setupOnlyBuffered: true,
    firstUserBeforeAssistant: firstUserChecked,
    externalLogs: true,
    savedResultNotReceipt: true,
    ephemeralCleanup: true,
  }),
);
