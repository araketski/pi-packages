import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { HerdrPublisher } from '../extensions/session-activity/publisher.ts';

// @mara implements VER-SESSION-ACTIVITY-PUBLISHER
it('publishes and deletes activity on an isolated actual Herdr server without touching lifecycle metadata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'activity-herdr-real-'));
  const ipcDir = mkdtempSync(join(process.env.PI_TEST_IPC_DIR ?? tmpdir(), 'activity-herdr-ipc-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: dir,
    XDG_CONFIG_HOME: ipcDir,
    XDG_DATA_HOME: join(dir, '.local/share'),
    XDG_STATE_HOME: join(dir, '.local/state'),
    XDG_CACHE_HOME: join(dir, '.cache'),
    PI_CODING_AGENT_DIR: join(dir, '.pi/agent'),
    SHELL: '/bin/sh',
  };
  for (const key of Object.keys(env)) if (key.startsWith('HERDR_')) delete env[key];
  mkdirSync(join(ipcDir, 'herdr'), { recursive: true });
  writeFileSync(
    join(ipcDir, 'herdr/config.toml'),
    'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\n',
  );
  const name = 'activity-contract-test';
  const child = spawn('herdr', ['--session', name, 'server'], {
    cwd: dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  child.stderr.on('data', (data) => {
    output += data.toString();
  });
  let publisher: HerdrPublisher | undefined;
  const cli = (...args: string[]) =>
    spawnSync('herdr', ['--session', name, ...args], {
      cwd: dir,
      env,
      encoding: 'utf8',
      timeout: 5000,
    });
  const json = (...args: string[]) => {
    const result = cli(...args);
    expect(result.status, result.stdout + result.stderr + output).toBe(0);
    return JSON.parse(result.stdout) as Record<string, any>;
  };
  try {
    const deadline = Date.now() + 8000;
    while (cli('workspace', 'list').status !== 0) {
      expect(Date.now(), output).toBeLessThan(deadline);
      await new Promise((done) => setTimeout(done, 50));
    }
    const created = json(
      'workspace',
      'create',
      '--cwd',
      dir,
      '--label',
      'session-activity isolated verification',
      '--no-focus',
    );
    const pane = created.result.root_pane.pane_id as string;
    const status = cli('status');
    const socket = status.stdout.match(/socket:\s*(.+)/u)?.[1]?.trim();
    expect(socket, status.stdout + output).toBeDefined();
    expect(
      socket?.startsWith(`${ipcDir}/`),
      'RPC must target only the private fixture server',
    ).toBe(true);
    expect(
      cli(
        'pane',
        'report-metadata',
        pane,
        '--source',
        'activity-fixture',
        '--token',
        'unrelated=retain-me',
        '--title',
        'Stable responsibility',
      ).status,
    ).toBe(0);
    expect(
      cli(
        'pane',
        'report-agent',
        pane,
        '--source',
        'activity-fixture-lifecycle',
        '--agent',
        'pi',
        '--state',
        'working',
      ).status,
    ).toBe(0);
    const before = json('pane', 'get', pane);
    publisher = new HerdrPublisher({
      HERDR_ENV: '1',
      HERDR_SOCKET_PATH: socket,
      HERDR_PANE_ID: pane,
    });
    expect(await publisher.publish('Running parser tests', new AbortController().signal)).toBe(
      true,
    );
    const published = json('pane', 'get', pane);
    expect(JSON.stringify(published)).toContain('Running parser tests');
    expect(JSON.stringify(published)).toContain('retain-me');
    expect(await publisher.clear(new AbortController().signal)).toBe(true);
    const cleared = json('pane', 'get', pane);
    expect(JSON.stringify(cleared)).not.toContain('Running parser tests');
    // A stale publication racing an already applied clear must be rejected by sequencing.
    expect(
      cli(
        'pane',
        'report-metadata',
        pane,
        '--source',
        'pi:session-activity',
        '--agent',
        'pi',
        '--seq',
        '1',
        '--token',
        'activity=Obsolete activity',
      ).status,
    ).toBe(0);
    expect(JSON.stringify(json('pane', 'get', pane))).not.toContain('Obsolete activity');
    expect(JSON.stringify(cleared)).toContain('retain-me');
    expect(before.result.pane.agent_status).toBe('working');
    expect(cleared.result.pane.agent_status).toEqual(before.result.pane.agent_status);
    expect(JSON.stringify(cleared)).toContain('Stable responsibility');
  } finally {
    publisher?.dispose();
    cli('server', 'stop'); // This explicitly selected private server only.
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise((done) => {
      if (child.exitCode !== null) done(undefined);
      else {
        child.once('close', done);
        setTimeout(() => child.kill('SIGKILL'), 1000).unref();
      }
    });
    rmSync(ipcDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
