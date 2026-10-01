import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { expect, it, vi } from 'vitest';

function quote(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

function terminateGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH'))
      throw error;
  }
}

// @mara checks REQ-SESSION-NAME-TITLE
// @mara implements VER-SESSION-NAME-CONFORMANCE
it.each([true, false])(
  'real Pi TUI startup/resume and rename keep the selected title behavior (setTitle=%s)',
  async (setTitle) => {
    for (const resume of [false, true]) {
      const dir = mkdtempSync(join(tmpdir(), 'session-name-tui-'));
      writeFileSync(join(dir, 'session-name.json'), JSON.stringify({ setTitle }));
      writeFileSync(
        join(dir, 'settings.json'),
        JSON.stringify({
          quietStartup: true,
          compaction: { enabled: false },
          cacheWarming: { mode: 'off' },
        }),
      );
      writeFileSync(
        join(dir, 'models.json'),
        JSON.stringify({
          providers: {
            'naming-ui': {
              api: 'openai-completions',
              baseUrl: 'http://127.0.0.1:1/v1',
              apiKey: 'offline-only',
              models: [{ id: 'ui-model', contextWindow: 8192, maxTokens: 128 }],
            },
          },
        }),
      );
      let sessionFile: string | undefined;
      if (resume) {
        const manager = SessionManager.create(dir, join(dir, 'sessions'));
        manager.appendSessionInfo('Saved task');
        manager.appendMessage({ role: 'user', content: 'Earlier prompt', timestamp: 1 });
        manager.appendMessage({
          role: 'assistant',
          content: [{ type: 'text', text: 'Earlier reply' }],
          api: 'openai-completions',
          provider: 'naming-ui',
          model: 'ui-model',
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
        sessionFile = manager.getSessionFile();
      }
      const args = [
        process.execPath,
        resolve(
          import.meta.dirname,
          '../../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js',
        ),
        '--offline',
        '--no-approve',
        '--no-context-files',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--no-themes',
        '--no-tools',
        '-e',
        resolve(import.meta.dirname, '..'),
        '--provider',
        'naming-ui',
        '--model',
        'ui-model',
        ...(sessionFile ? ['--session', sessionFile] : ['--name', 'Saved task']),
      ];
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PI_OFFLINE: '1',
        PI_TELEMETRY: '0',
        PI_CODING_AGENT_DIR: dir,
        TERM: 'xterm-256color',
      };
      delete env.CI;
      delete env.TMUX;
      const child = spawn(
        'script',
        ['-q', '-e', '-c', `stty cols 100 rows 30; exec ${args.map(quote).join(' ')}`, '/dev/null'],
        { cwd: dir, env, detached: true },
      );
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exited = new Promise<number | null>((done, reject) => {
        child.once('error', reject);
        child.once('close', done);
      });
      void exited.catch(() => undefined);
      const titles = () =>
        output
          .split('\u001b]0;')
          .slice(1)
          .filter((part) => part.includes('\u0007'))
          .map((part) => part.slice(0, part.indexOf('\u0007')));
      const waitForTitle = async (name: string) => {
        await vi.waitFor(
          () => {
            expect(child.exitCode, output.slice(-4000)).toBeNull();
            const title = titles().at(-1);
            if (setTitle) expect(title, output.slice(-4000)).toBe(name);
            else {
              expect(title, output.slice(-4000)).toContain(` - ${name} - `);
              expect(title).not.toBe(name);
            }
          },
          { timeout: 15_000, interval: 30 },
        );
        await new Promise((done) => setTimeout(done, 100));
        if (setTitle) expect(titles().at(-1)).toBe(name);
        else expect(titles().at(-1)).toContain(` - ${name} - `);
      };
      try {
        await waitForTitle('Saved task');
        child.stdin.write('/name Renamed task\r');
        await waitForTitle('Renamed task');
        child.stdin.write('\u0004');
        const result = await Promise.race([
          exited,
          new Promise<never>((_done, reject) => {
            const timer = setTimeout(() => reject(new Error('Pi TUI did not exit')), 5000);
            timer.unref();
          }),
        ]);
        expect(result, output.slice(-4000)).toBe(0);
      } finally {
        if (child.exitCode === null && child.pid) {
          terminateGroup(child.pid);
          await exited;
        }
        rmSync(dir, { recursive: true, force: true });
      }
    }
  },
  45_000,
);
