import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { fauxAssistantMessage } from '@earendil-works/pi-ai';
import { CURSOR_MARKER, stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import type { Result } from '../extensions/ask-questions/schema.ts';

interface Trace {
  type: string;
  lines?: string[];
  width?: number;
  rows?: number;
  focused?: boolean;
  payload?: Result;
  editor?: string;
  count?: number;
  rootReady?: boolean;
  data?: { active: boolean };
  listenersBefore?: number;
  listenersAfter?: number;
  [field: string]: unknown;
}
const questions = [
  {
    header: 'Storage',
    question: 'Pick storage 界e\u0301?',
    options: [{ label: 'Files' }, { label: 'SQLite', description: 'Transactional local storage' }],
    recommendedOption: 2,
  },
  { question: 'Pick interface?', options: [{ label: 'CLI' }, { label: 'Web' }] },
];
const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

async function native(
  mode = 'regular',
  config: { questions?: unknown[]; setupAbort?: boolean; persistent?: boolean } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'questions-native-'));
  const agentDir = join(dir, 'agent');
  mkdirSync(agentDir);
  const sessions = join(dir, 'sessions');
  mkdirSync(sessions);
  const target = SessionManager.create(dir, sessions);
  target.appendModelChange('questions-fixture', 'questions-model');
  target.appendMessage({ role: 'user', content: 'fixture target session', timestamp: Date.now() });
  target.appendMessage(fauxAssistantMessage('fixture seed'));
  writeFileSync(
    join(agentDir, 'fixture.json'),
    JSON.stringify({
      questions: config.questions ?? questions,
      setupAbort: config.setupAbort,
      switchPath: target.getSessionFile(),
    }),
  );
  writeFileSync(
    join(agentDir, 'settings.json'),
    JSON.stringify({
      quietStartup: true,
      doubleEscapeAction: 'none',
      compaction: { enabled: false },
      retry: { enabled: false },
      cacheWarming: 'off',
      showHardwareCursor: true,
      enableInstallTelemetry: false,
    }),
  );
  writeFileSync(join(agentDir, 'keybindings.json'), JSON.stringify({ 'app.interrupt': 'ctrl+x' }));
  const cli = join(
    dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))),
    'cli.js',
  );
  const args = [
    process.execPath,
    cli,
    '--approve',
    '--offline',
    '--no-extensions',
    '--no-skills',
    '--no-prompt-templates',
    '--no-themes',
    '--no-context-files',
    '--no-builtin-tools',
    '--session-dir',
    sessions,
    '--provider',
    'questions-fixture',
    '--model',
    'questions-model',
    '--thinking',
    'off',
    '--use-theme',
    'dark',
    '--tui-mode',
    mode,
    '-e',
    join(import.meta.dirname, 'fixtures/native-extension.ts'),
    ...(config.persistent ? [] : ['--no-session']),
  ];
  const child = spawn(
    'script',
    ['-qfec', `stty rows 32 cols 80; exec ${args.map(quote).join(' ')}`, '/dev/null'],
    {
      cwd: dir,
      // Deliberately no inherited provider credentials, Herdr socket/pane or Pi settings.
      env: {
        PATH: process.env.PATH,
        HOME: dir,
        XDG_CONFIG_HOME: dir,
        XDG_DATA_HOME: dir,
        LANG: 'C.UTF-8',
        TERM: 'xterm-256color',
        PI_OFFLINE: '1',
        PI_SKIP_VERSION_CHECK: '1',
        PI_TELEMETRY: '0',
        PI_HARDWARE_CURSOR: '1',
        PI_CODING_AGENT_DIR: agentDir,
        HERDR_ENV: '1',
      },
    },
  );
  let output = '';
  child.stdout.on('data', (data: Buffer) => {
    output = (output + data.toString()).slice(-200_000);
  });
  child.stderr.on('data', (data: Buffer) => {
    output = (output + data.toString()).slice(-200_000);
  });
  const records = () =>
    existsSync(join(agentDir, 'trace.jsonl'))
      ? readFileSync(join(agentDir, 'trace.jsonl'), 'utf8')
          .split('\n')
          .slice(0, -1)
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Trace)
      : [];
  const wait = async (predicate: (records: Trace[]) => boolean, label: string) => {
    const deadline = Date.now() + 15_000;
    while (!predicate(records())) {
      if (Date.now() > deadline || child.exitCode !== null)
        throw new Error(
          `Native ${mode}: ${label}\n${JSON.stringify(records().slice(-8))}\n${stripTerminalSequences(output).slice(-4000)}`,
        );
      await delay(20);
    }
  };
  const frame = () =>
    records()
      .filter((record) => record.type === 'frame')
      .at(-1);
  const text = () => frame()?.lines?.map(stripTerminalSequences).join('\n') ?? '';
  const key = (data: string) => {
    child.stdin.write(data);
  };
  const open = async () => {
    const before = records().filter((record) => record.type === 'execute').length;
    key('\x15/fixture-open\r');
    await wait(
      (records) => records.filter((record) => record.type === 'execute').length > before,
      'model-issued registered tool',
    );
    if (!config.setupAbort)
      await wait((records) => {
        const latest = records.filter((record) => record.type === 'execute').at(-1)!;
        return records
          .slice(records.indexOf(latest) + 1)
          .some(
            (record) =>
              record.type === 'frame' &&
              record.lines?.some((line) => line.includes('(recommended)')),
          );
      }, 'fresh invocation recommendation frame');
  };
  const close = async () => {
    if (child.exitCode === null) {
      child.stdin.write('\x1b[21~'); // F10 requests the host's clean shutdown.
      await Promise.race([
        new Promise<void>((resolve) => child.once('exit', () => resolve())),
        delay(1500),
      ]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    await delay(20);
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    await wait(
      (records) =>
        records.some((record) => record.type === 'startup') &&
        stripTerminalSequences(output).includes('questions-model'),
      'root TUI startup',
    );
    return {
      records,
      wait,
      frame,
      text,
      key,
      open,
      close,
      child,
      get output() {
        return output;
      },
    };
  } catch (error) {
    await stop(child);
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
async function stop(child: ChildProcessWithoutNullStreams) {
  child.kill('SIGKILL');
  await delay(20);
}

// @mara implements VER-QUESTIONS-INTERACTION
// @mara implements VER-QUESTIONS-LIFETIME
// @mara implements VER-QUESTIONS-HERDR-ATTENTION
describe('actual Pi 0.99.1 TUI, controlled Faux provider and no live Herdr backend', () => {
  it.each(['regular', 'fullscreen'])(
    'selects, edits, backtracks and submits through the model-issued tool in %s mode',
    async (mode) => {
      const h = await native(mode);
      try {
        await h.open();
        expect(
          h
            .records()
            .some(
              (record) =>
                record.type === 'request' && (record.tools as string[]).includes('ask_questions'),
            ),
        ).toBe(true);
        expect(h.records().filter((record) => record.type === 'returned')).toHaveLength(0);
        expect(h.text()).toContain('> 2. SQLite');
        const panel = h.frame()!.lines!.map(stripTerminalSequences);
        expect(panel[0]).toBe('─'.repeat(80));
        expect(panel[1]).toBe('ask_questions 1/2 • Storage');
        expect(h.frame()!.lines![1]).toContain('\x1b[1mask_questions\x1b[22m');
        expect(panel.at(-1)).toBe('─'.repeat(80));
        const recommended = h.frame()!.lines!.find((line) => line.includes('(recommended)'))!;
        const styleBefore = (line: string, label: string) =>
          line.slice(0, line.indexOf(label)).split('\x1b[').at(-1)?.split('m')[0];
        expect(styleBefore(recommended, '>')).not.toBe(styleBefore(recommended, 'SQLite'));
        expect(styleBefore(recommended, 'SQLite')).not.toBe(
          styleBefore(recommended, '(recommended)'),
        );
        expect(h.text()).not.toMatch(/\[Chosen\]|\[Recommended\]/);
        h.key('\x1b[A');
        await h.wait(() => h.text().includes('> 1. Files'), 'focus moves independently');
        expect(h.frame()!.lines!.find((line) => line.includes('(recommended)'))).not.toBe(
          recommended,
        );
        expect(h.text()).toContain('(recommended)');
        h.key('\x1bOQ'); // F2 changes the actual host theme.
        await h.wait(
          (records) => records.some((record) => record.type === 'theme'),
          'theme invalidation',
        );
        h.key('3');
        await h.wait(() => h.text().includes('Enter save'), 'custom editor');
        expect(h.frame()!.focused).toBe(true);
        expect(h.frame()!.lines!.join('\n')).toContain(CURSOR_MARKER);
        expect(h.frame()!.lines!.find((line) => line.includes(CURSOR_MARKER))).toMatch(/^   /);
        expect(h.text()).toContain('SQLite (recommended)');
        expect(h.output).not.toContain(CURSOR_MARKER); // Consumed by the host cursor/IME renderer.
        h.key('\x1b[200~custom 界e\u0301  answer\x1b[201~');
        await h.wait(() => h.text().includes('custom 界e\u0301'), 'custom text');
        h.key('\x1b');
        await h.wait(
          () => h.text().includes('Write your own answer') && !h.text().includes('Enter save'),
          'Escape back preserves draft',
        );
        h.key('\r');
        await h.wait(() => h.text().includes('custom 界e\u0301'), 'draft restored');
        h.key('\x1b[13;2u');
        h.key('\x1b[200~second  line\x1b[201~');
        await h.wait(() => h.text().includes('second  line'), 'multiline edit');
        h.key('\r');
        await h.wait(
          () => h.text().includes('Pick interface?'),
          'advance without final submission',
        );
        h.key('2');
        await h.wait(() => h.text().includes('Review'), 'final review');
        h.key('\x1b[D');
        await h.wait(() => h.text().includes('> 2. Web'), 'revisit confirmed option');
        expect(h.frame()!.lines!.find((line) => line.includes('Web'))).toContain(
          '\x1b[1mWeb\x1b[22m',
        );
        expect(h.text()).not.toContain('[Chosen]');
        h.key('\r');
        await h.wait(() => h.text().includes('Review'), 'return to explicit final review');
        expect(h.records().filter((record) => record.type === 'returned')).toHaveLength(0);
        expect(
          h
            .records()
            .filter((record) => record.type === 'attention')
            .map((record) => record.count),
        ).toEqual([1, 2]);
        h.key('\r');
        await h.wait(
          (records) => records.some((record) => record.type === 'settled'),
          'ordinary host continuation',
        );
        const returned = h.records().find((record) => record.type === 'returned')!;
        expect(returned.payload).toMatchObject({
          status: 'answered',
          answers: [
            { kind: 'custom', answer: 'custom 界e\u0301  answer\nsecond  line' },
            { kind: 'option', optionNumber: 2, answer: 'Web' },
          ],
        });
        expect(returned.editor).toBe('preserved main draft');
        expect(returned.pagingAfter).toEqual(returned.pagingBefore);
        expect(returned.pagingAfter).toEqual([['pageUp'], ['pageDown']]);
        expect(returned.listenersAfter).toBeLessThanOrEqual(returned.listenersBefore!);
        expect(
          h
            .records()
            .filter((record) => record.type === 'attention')
            .map((record) => record.count),
        ).toEqual([1, 2, 1]);
        expect(h.records().filter((record) => record.type === 'follow-up')).toHaveLength(1);
        expect(h.records().filter((record) => record.type === 'dispose')).toHaveLength(1);
      } finally {
        await h.close();
      }
    },
    45_000,
  );

  it.each(['regular', 'fullscreen'])(
    'bounds wrapped Unicode content after a real terminal resize in %s',
    async (mode) => {
      const h = await native(mode, {
        questions: [
          {
            ...questions[0],
            question: 'Long question 界e\u0301 '.repeat(25),
            options: [{ label: 'Files' }, { label: 'SQLite' }],
            recommendedOption: 2,
          },
        ],
      });
      try {
        await h.open();
        h.key('\x1bOP'); // F1 invokes stty on this isolated PTY.
        await h.wait(
          () => h.frame()?.width === 18 && h.frame()?.rows === 12,
          'SIGWINCH recomputes viewport',
        );
        expect(h.frame()!.lines!.length).toBeLessThanOrEqual(6);
        expect(h.frame()!.lines!.every((line) => visibleWidth(line) <= 18)).toBe(true);
        const initial = h.text();
        h.key('\x1b[5~');
        await h.wait(
          () => h.text() !== initial && h.text().includes('Long question'),
          'page scrolling reaches full question',
        );
        h.key('j');
        await h.wait(
          () => h.text().includes('> 3. Write your') && h.text().includes('own answer'),
          'focus is visible after scrolling',
        );
        h.key('\x1b');
        await h.wait((records) => records.some((record) => record.type === 'returned'), 'dismiss');
        expect(h.records().find((record) => record.type === 'returned')!.payload).toMatchObject({
          status: 'cancelled',
          reason: 'dismissed',
          answers: [],
        });
      } finally {
        await h.close();
      }
    },
    30_000,
  );

  it.each(['\x18', '\x03'])(
    'dispatches actual interrupt %j from custom editing through the tool abort signal',
    async (key) => {
      const h = await native();
      try {
        await h.open();
        h.key('3');
        await h.wait(() => h.text().includes('Enter save'), 'editor');
        h.key(key);
        await h.wait(
          (records) => records.some((record) => record.type === 'returned'),
          'signal cancellation',
        );
        expect(h.records().find((record) => record.type === 'returned')!.payload).toMatchObject({
          status: 'cancelled',
          reason: 'aborted',
          answers: [],
        });
        expect(
          h
            .records()
            .filter((record) => record.type === 'attention')
            .map((record) => record.count),
        ).toEqual([1, 2, 1]);
      } finally {
        await h.close();
      }
    },
    30_000,
  );

  it('closes and restores input even when abort happens before host component assignment', async () => {
    const h = await native('regular', { setupAbort: true });
    try {
      await h.open();
      await h.wait(
        (records) => records.some((record) => record.type === 'returned'),
        'setup abort',
      );
      expect(
        h.records().find((record) => record.type === 'component-created')!.emptyAfterSetupAbort,
      ).toBe(true);
      expect(h.records().find((record) => record.type === 'returned')!.payload).toMatchObject({
        status: 'cancelled',
        reason: 'aborted',
        answers: [],
      });
      expect(h.records().filter((record) => record.type === 'frame')).toHaveLength(0);
      expect(
        h
          .records()
          .filter((record) => record.type === 'attention')
          .map((record) => record.count),
      ).toEqual([1, 2, 1]);
    } finally {
      await h.close();
    }
  }, 30_000);

  it.each([
    ['tree', '\x1b[18~'],
    ['reload', '\x1b[20~'],
  ])(
    'observes the host %s streaming guard, then aborts and exercises the actual idle operation',
    async (action, key) => {
      const h = await native('regular', { persistent: true });
      try {
        await h.open();
        h.key(key);
        await h.wait(
          (records) =>
            records.some(
              (record) => record.type === (action === 'tree' ? 'action-failed' : 'action-finished'),
            ),
          'streaming operation guard',
        );
        expect(h.records().filter((record) => record.type === 'returned')).toHaveLength(0);
        expect(
          h
            .records()
            .filter((record) => record.type === 'attention')
            .map((record) => record.count),
        ).toEqual([1, 2]);
        h.key('\x18');
        await h.wait(
          (records) => records.some((record) => record.type === 'settled'),
          'abort settles before retry',
        );
        expect(h.records().find((record) => record.type === 'returned')!.payload).toMatchObject({
          status: 'cancelled',
          reason: 'aborted',
          answers: [],
        });
        const before = h.records().filter((record) => record.type === 'action-finished').length;
        h.key(key);
        await h.wait(
          (records) =>
            records.filter((record) => record.type === 'action-finished').length > before,
          'actual idle operation',
        );
        expect(
          h
            .records()
            .some((record) => record.type === (action === 'tree' ? 'pre-tree' : 'shutdown')),
        ).toBe(true);
        await h.open();
        expect(h.text()).not.toContain('Chosen');
        h.key('\x1b');
      } finally {
        await h.close();
      }
    },
    30_000,
  );

  it.each([
    ['new', '\x1b[15~'],
    ['fork', '\x1b[17~'],
    ['switch', '\x1b[19~'],
    ['veto', '\x1b[23~'],
    ['shutdown', '\x1b[21~'],
  ])(
    'invalidates a live prompt through the actual host %s action',
    async (action, key) => {
      const h = await native('regular', { persistent: true });
      try {
        await h.open();
        h.key('3');
        await h.wait(() => h.text().includes('Enter save'), 'editor');
        h.key('\x1b[200~unsubmitted draft\x1b[201~');
        await h.wait(() => h.text().includes('unsubmitted draft'), 'draft before invalidation');
        h.key(key);
        await h.wait(
          (records) => records.some((record) => record.type === 'returned'),
          `${action} closes invocation`,
        );
        expect(h.records().find((record) => record.type === 'returned')!.payload).toMatchObject({
          status: 'cancelled',
          answers: [],
        });
        expect(
          h
            .records()
            .filter((record) => record.type === 'attention' && record.data?.active === false),
        ).toHaveLength(1);
        expect(h.records().some((record) => record.type === 'action-failed')).toBe(false);
        if (action !== 'shutdown') {
          await h.wait(
            (records) => records.some((record) => record.type === 'action-finished'),
            `${action} completes without waiting for a continuation in our handler`,
          );
          if (action === 'veto')
            expect(
              h.records().find((record) => record.type === 'action-finished')!.result,
            ).toMatchObject({ cancelled: true });
          await h.open();
          expect(h.text()).not.toContain('Chosen');
          h.key('3');
          await h.wait(() => h.text().includes('Enter save'), 'fresh custom editor');
          expect(h.text()).not.toContain('unsubmitted draft');
          h.key('\x1b');
          await h.wait(() => !h.text().includes('Enter save'), 'leave fresh editor');
          h.key('\x1b');
        }
      } finally {
        await h.close();
      }
    },
    45_000,
  );
});
