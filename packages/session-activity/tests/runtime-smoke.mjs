// Offline native Pi TUI/print lifecycle replay for source and independent packed consumers.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { createServer as socketServer } from 'node:net';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdkPath, packageRoot] = process.argv.slice(2);
const sdk = await import(pathToFileURL(sdkPath).href);
const quote = (text) => `'${text.replace(/'/gu, `'\\''`)}'`;
const waitFor = async (predicate, context = () => '') => {
  const deadline = Date.now() + 12000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, `timed out: ${context()}`);
    await new Promise((done) => setTimeout(done, 10));
  }
};
async function run(config, behavior = 'normal', mode = 'tui', withHerdr = true) {
  const dir = await mkdtemp(join(tmpdir(), 'activity-pi-native-'));
  const statusLog = join(dir, 'status-events.jsonl');
  const statusEvents = async () =>
    (await readFile(statusLog, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const socketPath = join(dir, 'metadata.sock');
  const rpc = [];
  const requests = [];
  const sockets = new Set();
  let chatCount = 0;
  let releaseChat;
  const chatGate = new Promise((done) => {
    releaseChat = done;
  });
  let releaseSummary;
  const summaryGate = new Promise((done) => {
    releaseSummary = done;
  });
  const metadata = socketServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let raw = '';
    socket.on('data', (data) => {
      raw += data.toString();
      if (!raw.includes('\n')) return;
      const request = JSON.parse(raw.split('\n')[0]);
      rpc.push(request);
      socket.end(JSON.stringify({ id: request.id, result: { accepted: true } }) + '\n');
    });
  });
  await new Promise((done) => metadata.listen(socketPath, done));
  const provider = httpServer(async (req, res) => {
    let raw = '';
    for await (const data of req) raw += data;
    const body = JSON.parse(raw);
    const summary = body.messages.some(
      (m) =>
        (m.role === 'system' || m.role === 'developer') &&
        typeof m.content === 'string' &&
        m.content.includes('Summarize the main coding agent'),
    );
    requests.push({ summary, body, headers: req.headers });
    if (summary && behavior === 'failure') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ error: { message: 'offline fixture unauthorized', type: 'test_error' } }),
      );
      return;
    }
    if (summary && behavior === 'late') await summaryGate;
    if (!summary && ++chatCount > 1) await chatGate;
    const tool = !summary && chatCount === 1;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const delta = summary
      ? { role: 'assistant', content: '{"activity":"Running parser tests"}' }
      : tool
        ? {
            role: 'assistant',
            content: 'Inspecting parser code',
            tool_calls: [
              {
                index: 0,
                id: 'fixture-read',
                type: 'function',
                function: {
                  name: 'read',
                  arguments: JSON.stringify({ path: join(dir, 'parser.ts') }),
                },
              },
            ],
          }
        : { role: 'assistant', content: 'Normal chat reply' };
    const chunk = (delta, finish_reason) => ({
      id: 'offline',
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
      choices: [{ index: 0, delta, finish_reason }],
    });
    res.end(
      `data: ${JSON.stringify(chunk(delta, null))}\n\n` +
        `data: ${JSON.stringify(chunk({}, tool ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise((done) => provider.listen(0, '127.0.0.1', done));
  let child;
  let exited;
  let output = '';
  try {
    await mkdir(join(dir, 'sessions'));
    await writeFile(statusLog, '');
    const observerPath = join(dir, 'status-observer.ts');
    await writeFile(
      observerPath,
      `
      import { appendFileSync } from 'node:fs';
      export default function(pi) {
        const save = (type, payload) => appendFileSync(${JSON.stringify(statusLog)}, JSON.stringify({ type, payload }) + '\\n');
        for (const type of ['set', 'clear', 'snapshot']) {
          pi.events.on('pi-statusline:status:' + type, (payload) => {
            save(type, payload);
            if (type === 'set') pi.events.emit('pi-statusline:status:snapshot-request', {});
          });
        }
        pi.on('agent_settled', () => save('settled', {}));
      }
    `,
    );
    await writeFile(join(dir, 'parser.ts'), 'TOOL_RESULT_SECRET\n');
    await writeFile(join(dir, 'session-activity.json'), JSON.stringify(config));
    await writeFile(
      join(dir, 'settings.json'),
      JSON.stringify({
        quietStartup: true,
        compaction: { enabled: false },
        retry: { enabled: false },
        cacheWarming: { mode: 'off' },
      }),
    );
    const model = (id, header) => ({
      api: 'openai-completions',
      baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
      apiKey: `offline-${header}`,
      headers: { 'x-activity-source': header },
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
      join(dir, 'models.json'),
      JSON.stringify({
        providers: {
          'activity-chat': model('chat-model', 'chat'),
          'activity-summary': model('summary-model', 'summary'),
        },
      }),
    );
    const args = [
      process.execPath,
      join(dirname(sdkPath), 'cli.js'),
      '--offline',
      '--no-approve',
      '--no-context-files',
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--no-themes',
      '--tools',
      'read',
      '-e',
      packageRoot,
      '-e',
      observerPath,
      '--provider',
      'activity-chat',
      '--model',
      'chat-model',
      '--thinking',
      'high',
      '--name',
      'Stable parser task',
      '--session-dir',
      join(dir, 'sessions'),
      ...(mode === 'print' ? ['--print'] : []),
      'Investigate parser failures',
    ];
    const env = {
      ...process.env,
      PI_CODING_AGENT_DIR: dir,
      PI_OFFLINE: '1',
      PI_TELEMETRY: '0',
      TERM: 'xterm-256color',
      HERDR_ENV: '1',
      HERDR_SOCKET_PATH: socketPath,
      HERDR_PANE_ID: 'w-fixture:p-fixture',
    };
    delete env.CI;
    delete env.TMUX;
    if (!withHerdr) {
      delete env.HERDR_ENV;
      delete env.HERDR_SOCKET_PATH;
      delete env.HERDR_PANE_ID;
    }
    child =
      mode === 'tui'
        ? spawn(
            'script',
            [
              '-q',
              '-e',
              '-c',
              `stty cols 100 rows 30; exec ${args.map(quote).join(' ')}`,
              '/dev/null',
            ],
            { cwd: dir, env, detached: true },
          )
        : spawn(args[0], args.slice(1), { cwd: dir, env, detached: true });
    child.stdout.on('data', (data) => {
      output = (output + data.toString()).slice(-15000);
    });
    child.stderr.on('data', (data) => {
      output = (output + data.toString()).slice(-15000);
    });
    exited = new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
    if (mode === 'print') child.stdin.end();
    const shouldGenerate = mode === 'tui' && config.provider !== 'missing';
    await waitFor(
      () => chatCount >= 2 && (!shouldGenerate || requests.some((r) => r.summary)),
      () =>
        JSON.stringify({
          mode,
          behavior,
          chatCount,
          requests: requests.map((r) => r.summary),
          exitCode: child.exitCode,
          output,
        }),
    );
    if (behavior === 'normal' && shouldGenerate) {
      await waitFor(
        async () =>
          (await statusEvents()).some(
            (r) =>
              r.type === 'set' &&
              r.payload.key === 'activity' &&
              r.payload.text === 'Running parser tests',
          ),
        () => output,
      );
      await waitFor(
        () => output.includes('Running parser tests'),
        () => output,
      );
      if (withHerdr)
        await waitFor(
          () => rpc.some((r) => r.params.tokens.activity === 'Running parser tests'),
          () => output,
        );
      assert.equal(child.exitCode, null, 'phrase must publish before chat finishes');
    }
    releaseChat();
    if (mode === 'tui') {
      await waitFor(
        async () => (await statusEvents()).some((r) => r.type === 'settled'),
        () => output,
      );
      if (withHerdr)
        await waitFor(
          () => rpc.filter((r) => r.params.tokens.activity === null).length >= 2,
          () => output,
        );
      if (behavior === 'late') {
        releaseSummary();
        await new Promise((done) => setTimeout(done, 50));
        assert.equal(rpc.filter((r) => typeof r.params.tokens.activity === 'string').length, 0);
      }
      child.stdin.write('\u0004');
    }
    assert.equal(await exited, 0, output);
    const summaries = requests.filter((r) => r.summary);
    const events = await statusEvents();
    const sets = events.filter((r) => r.type === 'set');
    const clears = events.filter((r) => r.type === 'clear');
    const snapshots = events.filter((r) => r.type === 'snapshot');
    if (behavior === 'normal' && shouldGenerate) {
      assert.equal(sets.length, 1, 'one protocol publication from one summary');
      assert.equal(sets[0].payload.source, 'session-activity');
      assert.equal(sets[0].payload.key, 'activity');
      assert.equal(sets[0].payload.text, 'Running parser tests');
      assert.equal(snapshots.length, 1, 'late snapshot recovers the current phrase');
      assert.equal(snapshots[0].payload.statuses[0].text, 'Running parser tests');
      assert.deepEqual(
        clears.map((r) => r.payload),
        [{ source: 'session-activity', key: 'activity' }],
      );
    } else {
      assert.equal(
        sets.length,
        0,
        'headless, failed or cancelled generation must not publish status',
      );
    }
    if (!withHerdr) assert.equal(rpc.length, 0, 'no Herdr context means no socket operations');
    if (mode === 'print')
      assert.equal(rpc.length, 0, 'headless processes must not touch pane metadata');
    assert.equal(
      summaries.length,
      shouldGenerate ? 1 : 0,
      'no failure retry, fallback model, or headless generation',
    );
    for (const call of summaries) {
      assert.equal(call.body.model, config.model ?? 'chat-model');
      assert.equal(call.headers['x-activity-source'], config.model ? 'summary' : 'chat');
      assert.equal(
        call.headers.authorization,
        `Bearer offline-${config.model ? 'summary' : 'chat'}`,
      );
      assert.equal(call.body.reasoning_effort, config.thinking === 'low' ? 'low' : undefined);
      assert.equal(call.body.max_completion_tokens ?? call.body.max_tokens, 128);
      assert.equal(call.body.messages.filter((m) => m.role === 'user').length, 1);
      assert.ok(!JSON.stringify(call.body).includes('TOOL_RESULT_SECRET'));
    }
    assert.ok(requests.filter((r) => !r.summary).every((r) => r.body.reasoning_effort === 'high'));
    assert.ok(
      rpc.every(
        (r) => r.method === 'pane.report_metadata' && r.params.source === 'pi:session-activity',
      ),
    );
    assert.ok(
      rpc.every((r) => !('ttl_ms' in r.params) && !('title' in r.params) && !('state' in r.params)),
    );
    const files = (await readdir(join(dir, 'sessions'))).filter((name) => name.endsWith('.jsonl'));
    assert.equal(files.length, 1);
    const saved = sdk.SessionManager.open(join(dir, 'sessions', files[0]));
    assert.equal(saved.getSessionName(), 'Stable parser task');
    const transcript = JSON.stringify(saved.getEntries());
    assert.ok(
      !transcript.includes('Running parser tests'),
      'reporter is outside conversation history',
    );
    if (mode === 'tui') {
      const titles = output
        .split('\u001b]0;')
        .slice(1)
        .filter((part) => part.includes('\u0007'))
        .map((part) => part.slice(0, part.indexOf('\u0007')));
      assert.ok(
        !titles.includes('Running parser tests'),
        'reporter must not change terminal title',
      );
    }
  } finally {
    releaseChat();
    releaseSummary();
    if (child?.exitCode === null && child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
      await exited;
    }
    sockets.forEach((socket) => socket.destroy());
    await new Promise((done) => metadata.close(done));
    provider.closeAllConnections();
    await new Promise((done) => provider.close(done));
    await rm(dir, { recursive: true, force: true });
  }
}
await run({});
await run({ provider: 'activity-summary', model: 'summary-model', thinking: 'low' });
await run({}, 'failure');
await run({ provider: 'missing', model: 'missing' });
await run({}, 'late');
await run({}, 'normal', 'print');
await run({}, 'normal', 'tui', false);
await run({}, 'late', 'tui', false);
console.log(
  'PASS: native Pi TUI dual/no-Herdr status, native fallback, late snapshots, cleanup, overrides, no retries/fallback, cancellation, print isolation and unchanged transcript/name/title',
);
