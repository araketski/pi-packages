import {
  createEventBus,
  type ExtensionAPI,
  type ExtensionToolContext,
  type KeybindingsManager as PiKeybindings,
  type Theme,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  CURSOR_MARKER,
  KeybindingsManager,
  TUI_KEYBINDINGS,
  stripTerminalSequences as stripAnsi,
  visibleWidth,
  type Component,
  type Focusable,
  type TUI,
} from '@earendil-works/pi-tui';
import { Check } from 'typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';
import questionsExtension from '../extensions/ask-questions/index.ts';

type Screen = Component & Focusable & { dispose(): void };
type Factory = (
  tui: TUI,
  theme: Theme,
  kb: PiKeybindings,
  done: (value: unknown) => void,
) => Screen;
const input = {
  questions: [
    {
      header: ' Storage ',
      question: 'Which storage?',
      options: [{ label: 'Files', description: 'Simple' }, { label: 'SQLite' }],
      recommendedOption: 2,
    },
  ],
};
const second = { question: 'Which interface?', options: [{ label: 'CLI' }, { label: 'Web' }] };
const two = { questions: [...input.questions, second] };
const down = '\x1b[B';
const up = '\x1b[A';
const left = '\x1b[D';
const enter = '\r';
const escape = '\x1b';
const pageDown = '\x1b[6~';
const pageUp = '\x1b[5~';

function harness(
  options: {
    mode?: string;
    hasUI?: boolean;
    setupError?: Error;
    beforeFactory?: () => void;
    interrupt?: 'ctrl+x';
    startup?: boolean;
    tuiMode?: 'regular' | 'fullscreen';
  } = {},
) {
  let tool: ToolDefinition | undefined;
  let component: Screen | undefined;
  let completions = 0;
  const handlers = new Map<string, ((event: unknown, ctx: ExtensionToolContext) => void)[]>();
  const events = createEventBus();
  const emissions: unknown[] = [];
  events.on('herdr:blocked', (value) => emissions.push(value));
  const pi = {
    registerTool: (definition: ToolDefinition) => {
      tool = definition;
    },
    on: (event: string, handler: (event: unknown, ctx: ExtensionToolContext) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    events,
  } as unknown as ExtensionAPI;
  const signal = new AbortController();
  const terminal = { rows: 40, columns: 80 };
  const tui = {
    terminal,
    mode: options.tuiMode ?? 'regular',
    requestRender: vi.fn(),
  } as unknown as TUI;
  const colors: Record<string, string> = {
    success: '\x1b[32m',
    accent: '\x1b[36m',
    muted: '\x1b[90m',
    error: '\x1b[31m',
  };
  const theme = {
    fg: (color: string, text: string) => `${colors[color] ?? '\x1b[39m'}${text}\x1b[39m`,
    bold: (text: string) => text,
  } as Theme;
  const kb = new KeybindingsManager(
    { ...TUI_KEYBINDINGS, 'app.interrupt': { defaultKeys: 'escape' } },
    options.interrupt ? { 'app.interrupt': options.interrupt } : {},
  ) as unknown as PiKeybindings;
  const custom = vi.fn(
    (factory: Factory) =>
      new Promise<unknown>((resolve, reject) => {
        if (options.setupError) {
          reject(options.setupError);
          return;
        }
        options.beforeFactory?.();
        component = factory(tui, theme, kb, (value) => {
          completions++;
          resolve(value);
          component?.dispose();
        });
        component.focused = true;
      }),
  );
  const abort = vi.fn(() => signal.abort());
  const ctx = {
    mode: options.mode ?? 'tui',
    hasUI: options.hasUI ?? true,
    ui: { custom },
    abort,
  } as unknown as ExtensionToolContext;
  questionsExtension(pi);
  function emit(event: string, reason?: string) {
    handlers.get(event)?.forEach((handler) => handler({ type: event, reason }, ctx));
  }
  if (options.startup !== false) emit('session_start');
  function definition() {
    if (!tool) throw new Error('ask_questions not registered');
    return tool;
  }
  function start(args: unknown = input) {
    return definition().execute('call-1', args, signal.signal, undefined, ctx);
  }
  function screen() {
    if (!component) throw new Error('custom questionnaire not opened');
    return component;
  }
  return {
    definition,
    start,
    screen,
    custom,
    ctx,
    abort,
    signal,
    tui,
    terminal,
    theme,
    kb,
    events,
    emissions,
    emit,
    get completions() {
      return completions;
    },
    text: (width = 80) => screen().render(width).map(stripAnsi).join('\n'),
    key: (key: string) => screen().handleInput?.(key),
  };
}

function expectPayload(
  result: Awaited<ReturnType<ToolDefinition['execute']>>,
  h: ReturnType<typeof harness>,
) {
  expect(result.structuredContent).toEqual(result.details);
  expect(Check(h.definition().outputSchema!, result.structuredContent)).toBe(true);
  return result.structuredContent;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// @mara implements VER-QUESTIONS-INTERACTION
describe('Questions tool contract', () => {
  it('registers exactly the model-only sequential tool with optional recommendation guidance', () => {
    const h = harness();
    expect(h.definition()).toMatchObject({
      name: 'ask_questions',
      label: 'Ask Questions',
      exposure: 'model-only',
      executionMode: 'sequential',
    });
    expect(h.definition().promptSnippet).toBeTruthy();
    expect(h.definition().promptGuidelines?.join(' ')).toMatch(/recommendedOption/);
    expect(h.definition().promptGuidelines?.join(' ')).toMatch(/omit|optional/i);
    expect(h.custom).not.toHaveBeenCalled();
    expect(h.emissions).toEqual([]);
  });

  it.each(['rpc', 'json', 'print', 'headless', 'sdk'])(
    'returns unavailable in %s even with hasUI',
    async (mode) => {
      vi.stubEnv('HERDR_ENV', '1');
      const h = harness({ mode });
      const result = await h.start();
      expect(expectPayload(result, h)).toMatchObject({
        status: 'unavailable',
        reason: 'non_tui',
        answers: [],
      });
      expect(JSON.stringify(result.content)).toMatch(/chat/i);
      expect(h.custom).not.toHaveBeenCalled();
      expect(h.emissions).toEqual([]);
    },
  );

  it('requires usable UI in TUI mode', async () => {
    const h = harness({ hasUI: false });
    expect(expectPayload(await h.start(), h)).toMatchObject({
      status: 'unavailable',
      reason: 'non_tui',
      answers: [],
    });
    expect(h.custom).not.toHaveBeenCalled();
  });

  it.each([
    { questions: [] },
    { questions: Array(7).fill(input.questions[0]) },
    { questions: [{ ...input.questions[0], extra: 'unknown' }] },
    { ...input, extra: true },
    { questions: [{ ...input.questions[0], question: ' \n ' }] },
    { questions: [{ ...input.questions[0], header: null }] },
    { questions: [{ ...input.questions[0], options: [] }] },
    { questions: [{ ...input.questions[0], options: Array(9).fill({ label: 'x' }) }] },
    { questions: [{ ...input.questions[0], options: [{ label: '  ' }] }] },
    { questions: [{ ...input.questions[0], options: [{ label: 'x', description: '\t' }] }] },
    ...[0, -1, 1.5, 3, 9, '2', null].map((recommendedOption) => ({
      questions: [{ ...input.questions[0], recommendedOption }],
    })),
  ])('rejects malformed inputs before UI and attention: %j', async (args) => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    await expect(h.start(args)).rejects.toThrow(/questions|recommendedOption/);
    expect(h.custom).not.toHaveBeenCalled();
    expect(h.emissions).toEqual([]);
  });

  it('checks validation before an already-aborted signal, then cancels valid input without opening UI', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    h.signal.abort();
    await expect(h.start({ questions: [] })).rejects.toThrow(/questions/);
    expect(expectPayload(await h.start(), h)).toMatchObject({
      status: 'cancelled',
      reason: 'aborted',
      answers: [],
    });
    expect(h.custom).not.toHaveBeenCalled();
    expect(h.emissions).toEqual([]);
  });

  it('scopes only conflicting fullscreen page keys and restores owned bindings without losing other changes', async () => {
    const h = harness({ tuiMode: 'fullscreen' });
    h.kb.setUserBindings({ 'tui.altScreen.pageUp': ['pageUp', 'ctrl+p'] });
    const result = h.start();
    expect(h.kb.getKeys('tui.altScreen.pageUp')).toEqual(['ctrl+p']);
    expect(h.kb.getKeys('tui.altScreen.pageDown')).toEqual([]);
    h.kb.setUserBindings({ ...h.kb.getUserBindings(), 'tui.editor.undo': 'alt+z' });
    h.key(escape);
    await result;
    expect(h.kb.getKeys('tui.altScreen.pageUp')).toEqual(['pageUp', 'ctrl+p']);
    expect(h.kb.getKeys('tui.altScreen.pageDown')).toEqual(['pageDown']);
    expect(h.kb.getUserBindings()['tui.editor.undo']).toBe('alt+z');
    h.screen().dispose();
    expect(h.kb.getKeys('tui.altScreen.pageUp')).toEqual(['pageUp', 'ctrl+p']);
  });

  it('does not submit initial focus; Enter submits the recommended original option', async () => {
    const h = harness();
    const result = h.start();
    expect(h.completions).toBe(0);
    expect(h.text()).toMatch(/> 2\. SQLite.*Recommended/);
    h.key(enter);
    expect(expectPayload(await result, h)).toEqual({
      status: 'answered',
      questions: [{ ...input.questions[0], header: 'Storage', questionNumber: 1 }],
      answers: [{ questionNumber: 1, kind: 'option', optionNumber: 2, answer: 'SQLite' }],
    });
    expect(h.completions).toBe(1);
  });

  it('omission means first focus, no recommendation, and duplicate labels retain option identity', async () => {
    const h = harness();
    const args = {
      questions: [{ question: 'Duplicate?', options: [{ label: 'same' }, { label: 'same' }] }],
    };
    const result = h.start(args);
    expect(h.text()).toContain('> 1. same');
    expect(h.text()).not.toContain('Recommended');
    h.key('2');
    expect(expectPayload(await result, h)).toMatchObject({
      questions: [{ header: 'Q1' }],
      answers: [{ optionNumber: 2, answer: 'same' }],
    });
  });

  it('requires final review submission and cancels without intermediate answers', async () => {
    const h = harness();
    const result = h.start(two);
    h.key(enter);
    h.key('2');
    expect(h.text()).toContain('Review');
    expect(h.text()).toContain('SQLite');
    expect(h.text()).toContain('Web');
    expect(h.completions).toBe(0);
    h.key('1');
    h.key('l');
    expect(h.completions).toBe(0);
    h.key(escape);
    expect(expectPayload(await result, h)).toMatchObject({
      status: 'cancelled',
      reason: 'dismissed',
      answers: [],
    });
  });

  it('backtracks with focus preserved and replaces only the confirmed answer', async () => {
    const h = harness();
    const result = h.start(two);
    h.key(up);
    h.key(enter);
    h.key('2');
    h.key(left);
    h.key('h');
    expect(h.text()).toContain('> 1. Files');
    expect(h.text()).toMatch(/1\. Files.*Chosen/);
    expect(h.text()).toMatch(/2\. SQLite.*Recommended/);
    h.key('2');
    expect(h.text()).toContain('> 2. Web');
    h.key(enter);
    h.key(enter);
    expect(expectPayload(await result, h)).toMatchObject({
      status: 'answered',
      answers: [
        { answer: 'SQLite', optionNumber: 2 },
        { answer: 'Web', optionNumber: 2 },
      ],
    });
  });

  it('keeps custom drafts local, rejects blank submission, preserves internal whitespace and supports editor literals', async () => {
    const h = harness();
    const result = h.start();
    h.key('3');
    h.key(' \t ');
    h.key(enter);
    expect(h.text()).toMatch(/nonblank|non-blank/i);
    expect(h.completions).toBe(0);
    h.key('jkh123');
    expect(h.screen().render(80).join('\n')).toContain(CURSOR_MARKER);
    h.key('\x1b[13;2u'); // Host default Shift+Enter.
    h.key('second  line ');
    h.key(escape);
    expect(h.text()).toContain('Write your own answer');
    expect(h.completions).toBe(0);
    h.key(enter);
    expect(h.text()).toContain('jkh123');
    h.key(enter);
    expect(expectPayload(await result, h)).toMatchObject({
      answers: [{ kind: 'custom', answer: 'jkh123\nsecond  line' }],
    });
    expect(JSON.stringify((await result).content)).toContain('second  line');
  });

  it('keeps textual focus, recommendation and Chosen cues when semantic colors overlap', async () => {
    const h = harness();
    h.theme.fg = (_color, text) => `\x1b[32m${text}\x1b[39m`;
    const result = h.start(two);
    h.key(up);
    h.key(enter);
    h.key(left);
    expect(h.text()).toContain('> 1. Files [Chosen]');
    expect(h.text()).toContain('2. SQLite [Recommended]');
    h.key(escape);
    await result;
  });

  it('keeps recommendation semantic styling independent of focus and Chosen', async () => {
    const h = harness();
    const result = h.start(two);
    const recommended = '\x1b[32mRecommended\x1b[39m';
    expect(h.screen().render(80).join('\n')).toContain(recommended);
    h.key(up);
    expect(h.screen().render(80).join('\n')).toContain(recommended);
    expect(h.text()).toContain('> 1. Files');
    h.key(enter);
    h.key(left);
    expect(h.text()).toMatch(/Files.*Chosen/);
    expect(h.screen().render(80).join('\n')).toContain(recommended);
    h.key(escape);
    await result;
  });

  it('bounds and scrolls wrapped Unicode content without changing logical values; sanitizes terminal controls', async () => {
    const h = harness();
    h.terminal.rows = 12;
    const label = `Long 界e\u0301 ${'word '.repeat(35)}\x1b]0;hostile\x07\x1b[2J`;
    const args = {
      questions: [
        {
          question: 'Long question '.repeat(20),
          options: [{ label }, { label: 'Last' }],
          recommendedOption: 1,
        },
      ],
    };
    const result = h.start(args);
    const first = h.screen().render(18);
    expect(first.length).toBeLessThanOrEqual(6);
    expect(first.every((line) => visibleWidth(line) <= 18)).toBe(true);
    expect(first.join('\n')).not.toContain('hostile');
    h.key(pageDown);
    h.key(pageDown);
    expect(h.completions).toBe(0);
    h.key(down);
    expect(h.text(18)).toContain('> 2. Last');
    h.key(pageUp);
    h.terminal.rows = 50;
    h.screen().invalidate();
    expect(h.text(40)).toContain('Recommended');
    h.key('1');
    expect(expectPayload(await result, h)).toMatchObject({ answers: [{ answer: label }] });
  });

  it('keeps multiline progress headers in one physical line while retaining the full snapshot', async () => {
    const h = harness();
    const result = h.start({ questions: [{ ...input.questions[0], header: ' Storage\nchoice ' }] });
    expect(
      h
        .screen()
        .render(80)
        .every((line) => !line.includes('\n')),
    ).toBe(true);
    h.key(enter);
    expect(expectPayload(await result, h)).toMatchObject({
      questions: [{ header: 'Storage\nchoice' }],
    });
  });

  it('renders history from persisted details without reopening UI or emitting attention', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    const result = h.start();
    h.key(enter);
    const output = await result;
    const count = h.custom.mock.calls.length;
    const renderContext = {
      args: {},
      toolCallId: 'call-1',
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: '.',
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: true,
      showImages: false,
      isError: false,
    };
    const call = h.definition().renderCall!({}, h.theme, renderContext);
    expect(call.render(80).map(stripAnsi).join('\n')).toContain('ask_questions');
    const longCall = h.definition().renderCall!(
      { questions: [{ ...input.questions[0], question: 'Long preview '.repeat(50) }] },
      h.theme,
      renderContext,
    );
    expect(longCall.render(30)).toHaveLength(1);
    const rendered = h.definition().renderResult!(
      output,
      { expanded: true, isPartial: false },
      h.theme,
      renderContext,
    );
    expect(rendered.render(80).map(stripAnsi).join('\n')).toContain('SQLite');
    expect(h.custom.mock.calls.length).toBe(count);
    expect(h.emissions).toEqual([{ active: true }, { active: false }]);
  });
});

// @mara implements VER-QUESTIONS-LIFETIME
// @mara implements VER-QUESTIONS-HERDR-ATTENTION
describe('invocation ownership and optional attention', () => {
  it.each([
    'session_before_switch',
    'session_before_fork',
    'session_before_tree',
    'session_shutdown',
  ])('synchronously closes on %s exactly once, even when transition is vetoed', async (event) => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    const result = h.start(two);
    h.key(enter);
    h.emit(event);
    h.emit(event);
    h.key(enter);
    h.screen().dispose();
    expect(h.completions).toBe(1);
    expect(h.emissions).toEqual([{ active: true }, { active: false }]);
    expect(expectPayload(await result, h)).toMatchObject({
      status: 'cancelled',
      reason: event === 'session_shutdown' ? 'shutdown' : 'session_changed',
      answers: [],
    });
  });

  it.each([
    ['reload', 'reload'],
    ['new', 'session_changed'],
    ['resume', 'session_changed'],
    ['fork', 'session_changed'],
    ['quit', 'shutdown'],
  ])(
    'uses public shutdown metadata %s without inventing a private reload event',
    async (reason, expected) => {
      const h = harness();
      const result = h.start();
      h.emit('session_shutdown', reason);
      expect(expectPayload(await result, h)).toMatchObject({
        status: 'cancelled',
        reason: expected,
        answers: [],
      });
    },
  );

  it.each(['options', 'editor', 'review'])(
    'balances signal abort in %s and removes its listener',
    async (stage) => {
      vi.stubEnv('HERDR_ENV', '1');
      const h = harness();
      const remove = vi.spyOn(h.signal.signal, 'removeEventListener');
      const result = h.start(two);
      if (stage === 'editor') h.key('3');
      if (stage === 'review') {
        h.key(enter);
        h.key(enter);
      }
      h.signal.abort();
      h.key(enter);
      expect(expectPayload(await result, h)).toMatchObject({
        status: 'cancelled',
        reason: 'aborted',
        answers: [],
      });
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(h.completions).toBe(1);
      expect(h.emissions).toEqual([{ active: true }, { active: false }]);
    },
  );

  it('routes configured interrupt and Ctrl+C to host abort rather than editor text', async () => {
    for (const interrupt of ['\x18', '\x03']) {
      const h = harness({ interrupt: 'ctrl+x' });
      const result = h.start();
      h.key('3');
      h.key(interrupt);
      expect(h.abort).toHaveBeenCalledTimes(1);
      expect(expectPayload(await result, h)).toMatchObject({
        status: 'cancelled',
        reason: 'aborted',
        answers: [],
      });
    }
  });

  it('balances abort during component setup and never exposes completed content', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    let h: ReturnType<typeof harness>;
    h = harness({ beforeFactory: () => h.signal.abort() });
    expect(expectPayload(await h.start(), h)).toMatchObject({
      status: 'cancelled',
      reason: 'aborted',
    });
    expect(h.screen().render(80)).toEqual([]);
    expect(h.completions).toBe(1);
    expect(h.emissions).toEqual([{ active: true }, { active: false }]);
  });

  it('propagates UI setup failures and cleans up instead of relabelling cancellation', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const failure = new Error('UI setup broken');
    const h = harness({ setupError: failure });
    await expect(h.start()).rejects.toBe(failure);
    expect(h.emissions).toEqual([{ active: true }, { active: false }]);
    h.emit('session_shutdown');
    expect(h.emissions).toHaveLength(2);
  });

  it('propagates render failures through the failed tool call with balanced cleanup', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    const result = h.start();
    const failure = new Error('theme failed');
    h.theme.fg = () => {
      throw failure;
    };
    expect(h.screen().render(80)).toEqual([]);
    await expect(result).rejects.toBe(failure);
    expect(h.emissions).toEqual([{ active: true }, { active: false }]);
  });

  it('rejects reentrant calls without touching the existing prompt', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    const result = h.start();
    await expect(h.start()).rejects.toThrow(/already|active/i);
    expect(h.custom).toHaveBeenCalledTimes(1);
    expect(h.emissions).toEqual([{ active: true }]);
    h.key(enter);
    await result;
  });

  it('first terminal event wins and stale callbacks cannot close or release a fresh invocation', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    const first = h.start(two);
    const old = h.screen();
    h.key(enter);
    h.key(escape);
    await first;
    const secondResult = h.start();
    old.handleInput?.(enter);
    old.dispose();
    expect(h.emissions).toEqual([{ active: true }, { active: false }, { active: true }]);
    expect(h.text()).not.toContain('Chosen');
    h.key(enter);
    h.key(enter);
    h.signal.abort();
    expect(expectPayload(await secondResult, h)).toMatchObject({
      status: 'answered',
      answers: [{ answer: 'SQLite' }],
    });
    expect(h.completions).toBe(2);
    expect(h.emissions).toEqual([
      { active: true },
      { active: false },
      { active: true },
      { active: false },
    ]);
  });

  it('keeps ownership until the old UI closes, even if release observers try to reenter', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    let attempted: Promise<unknown> | undefined;
    h.events.on('herdr:blocked', (value) => {
      if (!(value as { active: boolean }).active && !attempted)
        attempted = h.start().catch((error) => error);
    });
    const first = h.start();
    h.key(enter);
    await first;
    try {
      expect(h.custom).toHaveBeenCalledTimes(1);
    } finally {
      h.signal.abort();
    }
    expect(await attempted).toBeInstanceOf(Error);
  });

  it('holds one interval across navigation, blank editor retries and review, preserving another producer', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    let count = 0;
    h.events.on('herdr:blocked', (value) => {
      count += (value as { active: boolean }).active ? 1 : -1;
    });
    h.events.emit('herdr:blocked', { active: true });
    const result = h.start(two);
    h.key('3');
    h.key(enter);
    h.key('custom');
    h.key(enter);
    h.key(enter);
    h.emit('agent_start');
    h.emit('agent_settled');
    expect(count).toBe(2);
    expect(h.emissions).toEqual([{ active: true }, { active: true }]);
    h.key(enter);
    await result;
    expect(count).toBe(1);
    h.events.emit('herdr:blocked', { active: false });
    expect(count).toBe(0);
  });

  it('preserves Questions when the independent producer releases first', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    let count = 0;
    h.events.on('herdr:blocked', (value) => {
      count += (value as { active: boolean }).active ? 1 : -1;
    });
    h.events.emit('herdr:blocked', { active: true });
    const result = h.start();
    expect(count).toBe(2);
    h.events.emit('herdr:blocked', { active: false });
    expect(count).toBe(1);
    expect(h.completions).toBe(0);
    h.key(enter);
    expect(expectPayload(await result, h)).toMatchObject({ status: 'answered' });
    expect(count).toBe(0);
  });

  it.each([undefined, '0'])('does not emit outside Herdr (%s)', async (env) => {
    vi.stubEnv('HERDR_ENV', env);
    const h = harness();
    const result = h.start();
    h.key(enter);
    await result;
    expect(h.emissions).toEqual([]);
  });

  it('does not acquire before root-session startup', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness({ startup: false });
    const result = h.start();
    h.key(enter);
    await result;
    expect(h.emissions).toEqual([]);
  });

  it('still answers when attention reporting throws or no hook is installed', async () => {
    vi.stubEnv('HERDR_ENV', '1');
    const h = harness();
    const emit = vi.spyOn(h.events, 'emit').mockImplementation(() => {
      throw new Error('listener unavailable');
    });
    const result = h.start();
    h.key(enter);
    expect(expectPayload(await result, h)).toMatchObject({ status: 'answered' });
    expect(h.completions).toBe(1);
    expect(emit).toHaveBeenNthCalledWith(1, 'herdr:blocked', { active: true });
    expect(emit).toHaveBeenNthCalledWith(2, 'herdr:blocked', { active: false });
  });
});
