import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { HerdrTransport, resolveLocalContext } from '../extensions/herdr/transport.ts';

// Explicit opt-in: this starts ONLY an owned headless server with a private config/socket.
it.skipIf(process.env.PI_HERDR_REAL_TEST !== '1')(
  'demonstrates the public adapter on isolated Linux Herdr 0.9.1',
  async () => {
    expect(process.platform).toBe('linux');
    expect(execFileSync('herdr', ['--version'], { encoding: 'utf8' }).trim()).toBe('herdr 0.9.1');
    const bulk = mkdtempSync(join(tmpdir(), 'herdr-real-'));
    const ipc = mkdtempSync(join(process.env.XDG_RUNTIME_DIR!, 'ht-'));
    writeFileSync(
      join(ipc, 'owner.json'),
      JSON.stringify({ session: process.env.PI_SESSION_ID, bulk, pid: process.pid }),
    );
    const config = join(ipc, 'herdr');
    mkdirSync(config);
    mkdirSync(join(bulk, 'home'));
    writeFileSync(
      join(config, 'config.toml'),
      'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n[ui.toast]\ndelivery = "off"\n[ui.sound]\nenabled = false\n[experimental]\nallow_nested = true\npane_history = false\n',
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: join(bulk, 'home'),
      XDG_CONFIG_HOME: ipc,
      XDG_CACHE_HOME: join(bulk, 'cache'),
      XDG_STATE_HOME: join(bulk, 'state'),
      XDG_DATA_HOME: join(bulk, 'data'),
      SHELL: '/bin/sh',
    };
    for (const key of Object.keys(env))
      if (key.startsWith('HERDR_') || /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN)$/.test(key))
        delete env[key];
    const run = (args: string[]) =>
      execFileSync('herdr', args, { env, cwd: bulk, encoding: 'utf8', timeout: 5000 });
    const cli = (args: string[]) => JSON.parse(run(args));
    const server = spawn('herdr', ['server'], {
      env,
      cwd: bulk,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    server.stdout.on('data', (chunk) => {
      serverLog += chunk.toString();
    });
    server.stderr.on('data', (chunk) => {
      serverLog += chunk.toString();
    });
    const exited = new Promise<void>((resolve) => server.once('exit', () => resolve()));
    let adapter: HerdrTransport | undefined;
    const socketPath = join(config, 'herdr.sock');
    let stopped = false;
    try {
      for (let i = 0; i < 100 && !existsSync(socketPath); i++) {
        if (server.exitCode !== null) throw Error(`Owned server exited: ${serverLog}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(existsSync(socketPath)).toBe(true);
      // All setup CLI commands are pinned to the private socket, never the user's endpoint.
      env.HERDR_SOCKET_PATH = socketPath;
      const status = run(['status']);
      const a = cli([
        'workspace',
        'create',
        '--cwd',
        bulk,
        '--label',
        'transport-owned-a',
        '--no-focus',
      ]).result;
      const b = cli([
        'workspace',
        'create',
        '--cwd',
        bulk,
        '--label',
        'transport-owned-b',
        '--no-focus',
      ]).result;
      const context = resolveLocalContext({
        HERDR_ENV: '1',
        HERDR_SOCKET_PATH: socketPath,
        HERDR_WORKSPACE_ID: a.workspace.workspace_id,
        HERDR_TAB_ID: a.tab.tab_id,
        HERDR_PANE_ID: a.root_pane.pane_id,
      });
      adapter = new HerdrTransport(context);
      await adapter.connect();
      expect(adapter.view().version).toBe('0.9.1');
      cli(['workspace', 'focus', b.workspace.workspace_id]);
      let current = await adapter.currentPane();
      expect(current.pane_id).toBe(a.root_pane.pane_id);
      const beforeStreamMove = current;
      const streamMove = cli([
        'pane',
        'move',
        current.pane_id,
        '--new-workspace',
        '--label',
        'from-event-stream',
        '--no-focus',
      ]).result.move_result;
      for (
        let i = 0;
        i < 100 &&
        adapter.view().panes.find((p) => p.terminal_id === current.terminal_id)?.pane_id !==
          streamMove.pane.pane_id;
        i++
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
      expect(adapter.view().panes.find((p) => p.terminal_id === current.terminal_id)?.pane_id).toBe(
        streamMove.pane.pane_id,
      );
      current = await adapter.currentPane();
      expect(current.terminal_id).toBe(beforeStreamMove.terminal_id);
      const renamed = await adapter.renamePane(current.pane_id, 'transport-renamed');
      expect(renamed).toMatchObject({ acknowledged: true, pane: { label: 'transport-renamed' } });
      const move = await adapter.movePane(current.pane_id, {
        type: 'new_workspace',
        label: 'transport-owned-moved',
      });
      expect(move.changed).toBe(true);
      expect(move.pane.pane_id).not.toBe(current.pane_id);
      expect(move.pane.terminal_id).toBe(current.terminal_id);
      for (
        let i = 0;
        i < 100 &&
        adapter.view().panes.find((p) => p.terminal_id === current.terminal_id)?.pane_id !==
          move.pane.pane_id;
        i++
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
      expect(adapter.view().panes.find((p) => p.terminal_id === current.terminal_id)?.pane_id).toBe(
        move.pane.pane_id,
      );
      expect((await adapter.currentPane()).pane_id).toBe(move.pane.pane_id);
      expect((await adapter.getPane(move.pane.pane_id)).label).toBe('transport-renamed');
      adapter.close();
      cli(['pane', 'rename', move.pane.pane_id, 'while-disconnected']);
      await adapter.reconnect();
      const finalPane = adapter.view().panes.find((p) => p.terminal_id === current.terminal_id);
      expect(finalPane).toMatchObject({ pane_id: move.pane.pane_id, label: 'while-disconnected' });
      const finalSnapshot = cli(['api', 'snapshot']);
      expect(finalSnapshot.result.snapshot.focused_workspace_id).toBe(b.workspace.workspace_id);
      const receipt = {
        serverPid: server.pid,
        socketPath,
        ipc,
        bulk,
        status,
        caller: context,
        current,
        beforeStreamMove,
        streamMove,
        move,
        finalPane,
        finalView: adapter.view(),
        finalSnapshot,
      };
      if (process.env.PI_TEST_EVIDENCE_DIR) {
        mkdirSync(process.env.PI_TEST_EVIDENCE_DIR, { recursive: true });
        writeFileSync(
          join(process.env.PI_TEST_EVIDENCE_DIR, 'real-herdr.json'),
          JSON.stringify(receipt, null, 2),
        );
      }
    } finally {
      adapter?.close();
      if (existsSync(socketPath) && server.exitCode === null) {
        env.HERDR_SOCKET_PATH = socketPath;
        run(['server', 'stop']);
      }
      await Promise.race([
        exited.then(() => {
          stopped = true;
        }),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
      expect(stopped, `Owned server ${server.pid} did not stop; retained ${bulk} and ${ipc}`).toBe(
        true,
      );
      if (process.env.PI_TEST_EVIDENCE_DIR) {
        writeFileSync(join(process.env.PI_TEST_EVIDENCE_DIR, 'real-herdr-server.log'), serverLog);
        for (const file of ['herdr-server.log', 'config.toml'])
          if (existsSync(join(config, file)))
            writeFileSync(
              join(process.env.PI_TEST_EVIDENCE_DIR, file),
              readFileSync(join(config, file)),
            );
      }
      rmSync(bulk, { recursive: true });
      rmSync(ipc, { recursive: true });
      if (process.env.PI_TEST_EVIDENCE_DIR)
        writeFileSync(
          join(process.env.PI_TEST_EVIDENCE_DIR, 'real-herdr-cleanup.json'),
          JSON.stringify({
            serverPid: server.pid,
            exited: stopped,
            bulk,
            ipc,
            bulkAbsent: !existsSync(bulk),
            ipcAbsent: !existsSync(ipc),
          }),
        );
    }
  },
  30000,
);
