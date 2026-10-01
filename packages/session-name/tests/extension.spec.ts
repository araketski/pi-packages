import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SessionManager,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import extension from '../extensions/session-name/index.ts';

type Stream = ExtensionContext['modelRegistry']['streamSimple'];
type Response = Awaited<ReturnType<ReturnType<Stream>['result']>>;
type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;
const model = {
  provider: 'session-provider',
  id: 'active-model',
  api: 'openai-completions',
} as NonNullable<ExtensionContext['model']>;
const alternate = { ...model, provider: 'title-provider', id: 'title-model' };

function response(
  text = 'Fix login redirect',
  stopReason: Response['stopReason'] = 'stop',
  errorMessage?: string,
): Response {
  return {
    role: 'assistant',
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [{ type: 'text', text }],
    stopReason,
    errorMessage,
    timestamp: 1,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const fixtures: {
  dir: string;
  emit: (type: string, event?: Record<string, unknown>) => Promise<void>;
}[] = [];
function harness(config?: unknown, mode: ExtensionContext['mode'] = 'tui') {
  const dir = mkdtempSync(join(tmpdir(), 'session-name-unit-'));
  vi.stubEnv('PI_CODING_AGENT_DIR', dir);
  if (config !== undefined)
    writeFileSync(
      join(dir, 'session-name.json'),
      typeof config === 'string' ? config : JSON.stringify(config),
    );
  const handlers = new Map<string, Handler[]>();
  const streamSimple = vi.fn<Stream>(
    () => ({ result: async () => response() }) as ReturnType<Stream>,
  );
  const find = vi.fn(() => alternate as NonNullable<ExtensionContext['model']> | undefined);
  const ui = { setTitle: vi.fn(), notify: vi.fn() };
  const ctx = {
    cwd: dir,
    mode,
    hasUI: mode === 'tui' || mode === 'rpc',
    ui,
    sessionManager: SessionManager.inMemory(dir),
    model,
    thinkingLevel: 'high',
    modelRegistry: { streamSimple, find },
    signal: undefined,
  } as unknown as ExtensionContext;
  const emit = async (type: string, event: Record<string, unknown> = {}) => {
    for (const handler of handlers.get(type) ?? []) await handler({ type, ...event }, ctx);
  };
  const setSessionName = vi.fn((name: string) => {
    (ctx.sessionManager as SessionManager).appendSessionInfo(name);
    void emit('session_info_changed', { name: ctx.sessionManager.getSessionName() });
  });
  const pi = {
    on: (type: string, handler: Handler) => {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return () => {};
    },
    getSessionName: () => ctx.sessionManager.getSessionName(),
    setSessionName,
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    registerFlag: vi.fn(),
    registerShortcut: vi.fn(),
  };
  extension(pi as unknown as ExtensionAPI);
  const addUser = (
    content: string | { type: 'text'; text: string }[] = 'Fix login redirect\nMore details',
  ) => {
    (ctx.sessionManager as SessionManager).appendMessage({ role: 'user', content, timestamp: 1 });
  };
  const h = {
    dir,
    ctx,
    pi,
    ui,
    streamSimple,
    find,
    emit,
    addUser,
    start: () => emit('session_start', { reason: 'startup' }),
    // Settle background naming microtasks, not the main agent exchange.
    settle: async () => {
      await emit('before_agent_start', { prompt: '' });
      await new Promise<void>((done) => process.nextTick(done));
    },
  };
  fixtures.push(h);
  return h;
}

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(async () => {
  for (const h of fixtures.splice(0)) {
    await h.emit('session_shutdown');
    rmSync(h.dir, { recursive: true, force: true });
  }
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// @mara checks REQ-SESSION-NAME-AUTO
// @mara checks REQ-SESSION-NAME-MODEL
// @mara checks REQ-SESSION-NAME-RECOVERY
// @mara checks REQ-SESSION-NAME-LIFECYCLE
// @mara checks REQ-SESSION-NAME-TITLE
// @mara implements VER-SESSION-NAME-CONFORMANCE
describe('automatic naming', () => {
  it('starts from the incoming prompt without blocking chat and tolerates transcript progress', async () => {
    const h = harness();
    const pending = deferred();
    h.streamSimple.mockReturnValue({ result: () => pending.promise } as ReturnType<Stream>);
    await h.start();
    // Pi has not persisted the opening prompt when before_agent_start fires.
    await h.emit('before_agent_start', { prompt: 'Investigate login loops' });
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
    expect(h.streamSimple.mock.calls[0]?.[1].messages[0]).toMatchObject({
      content: [{ type: 'text', text: 'Investigate login loops' }],
    });
    expect(h.pi.setSessionName).not.toHaveBeenCalled();
    h.addUser('Investigate login loops');
    (h.ctx.sessionManager as SessionManager).appendMessage(response('Chat is still working'));
    await h.emit('before_agent_start', { prompt: 'Later prompt' });
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
    pending.resolve(response());
    await vi.waitFor(() => {
      expect(h.pi.setSessionName).toHaveBeenCalledExactlyOnceWith('Fix login redirect');
    });
  });

  it('does not name at startup or settlement without a usable opening prompt', async () => {
    const h = harness();
    await h.start();
    await h.emit('agent_settled');
    await h.emit('before_agent_start', { prompt: ' \n\t ' });
    expect(h.streamSimple).not.toHaveBeenCalled();
    await h.emit('before_agent_start', { prompt: 'First usable prompt' });
    await vi.waitFor(() => expect(h.pi.setSessionName).toHaveBeenCalledTimes(1));
  });

  it('prefers the saved opening text to the incoming prompt in an unnamed resumed session', async () => {
    const h = harness();
    h.addUser('Saved opening prompt');
    await h.start();
    await h.emit('before_agent_start', { prompt: 'New follow-up prompt' });
    expect(h.streamSimple.mock.calls[0]?.[1].messages[0]).toMatchObject({
      content: [{ type: 'text', text: 'Saved opening prompt' }],
    });
    await vi.waitFor(() => expect(h.pi.setSessionName).toHaveBeenCalledTimes(1));
  });

  it('contains background persistence errors instead of rejecting into the chat', async () => {
    const h = harness();
    h.pi.setSessionName.mockImplementation(() => {
      throw new Error('persistence failed');
    });
    await h.start();
    await h.emit('before_agent_start', { prompt: 'Opening prompt' });
    await vi.waitFor(() => expect(h.pi.setSessionName).toHaveBeenCalledTimes(1));
  });

  it('uses the selected model and opening prompt once, without changing chat or registering UI', async () => {
    const h = harness();
    h.addUser();
    await h.start();
    const before = h.ctx.sessionManager.getEntries();
    await h.settle();
    await h.settle();
    expect(h.pi.setSessionName).toHaveBeenCalledExactlyOnceWith('Fix login redirect');
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
    const [selected, context, options] = h.streamSimple.mock.calls[0]!;
    expect(selected).toBe(model);
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'Fix login redirect\nMore details' }],
    });
    expect(context.systemPrompt).toContain('title');
    expect(options).toMatchObject({ maxTokens: 128, maxRetries: 0 });
    expect(options?.reasoning).toBeUndefined();
    expect(h.ctx.model).toBe(model);
    expect(h.ctx.thinkingLevel).toBe('high');
    expect(
      h.ctx.sessionManager
        .getEntries()
        .slice(before.length)
        .map((e) => e.type),
    ).toEqual(['session_info']);
    for (const register of [
      h.pi.registerCommand,
      h.pi.registerTool,
      h.pi.registerFlag,
      h.pi.registerShortcut,
    ])
      expect(register).not.toHaveBeenCalled();
    expect(h.ui.notify).not.toHaveBeenCalled();
    expect(h.ui.setTitle).toHaveBeenLastCalledWith('Fix login redirect');
  });

  it.each(['Already named', ''])(
    'respects saved naming metadata, including a deliberate clear: %j',
    async (name) => {
      const h = harness();
      (h.ctx.sessionManager as SessionManager).appendSessionInfo(name);
      h.addUser();
      await h.start();
      await h.settle();
      expect(h.streamSimple).not.toHaveBeenCalled();
      expect(h.pi.setSessionName).not.toHaveBeenCalled();
    },
  );

  it('does not consume the opportunity on an image-only prompt and extracts text blocks later', async () => {
    const h = harness();
    (h.ctx.sessionManager as SessionManager).appendMessage({
      role: 'user',
      content: [{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }],
      timestamp: 1,
    });
    await h.start();
    await h.settle();
    expect(h.streamSimple).not.toHaveBeenCalled();
    h.addUser([
      { type: 'text', text: 'Fix login' },
      { type: 'text', text: 'redirect' },
    ]);
    await h.settle();
    expect(h.streamSimple.mock.calls[0]?.[1].messages[0]).toMatchObject({
      content: [{ type: 'text', text: 'Fix login redirect' }],
    });
  });

  it('bounds prompt text and normalizes unsafe, multiline and overlong titles', async () => {
    const h = harness();
    h.addUser('🙂'.repeat(2000));
    h.streamSimple.mockReturnValue({
      result: async () =>
        response('\n  "Fix\u001b login redirect with seven extra words please!"\nExplanation'),
    } as ReturnType<Stream>);
    await h.start();
    await h.settle();
    const content = h.streamSimple.mock.calls[0]![1].messages[0]!.content;
    expect(
      Array.isArray(content) && content[0]?.type === 'text' && Array.from(content[0].text).length,
    ).toBe(1000);
    expect(h.pi.setSessionName).toHaveBeenCalledWith('Fix login redirect with seven extra');
  });

  it('truncates Unicode by code points without breaking surrogate pairs', async () => {
    const h = harness();
    h.addUser();
    h.streamSimple.mockReturnValue({
      result: async () => response('🙂'.repeat(100)),
    } as ReturnType<Stream>);
    await h.start();
    await h.settle();
    expect(h.ctx.sessionManager.getSessionName()).toBe('🙂'.repeat(59) + '…');
  });
});

// @mara checks REQ-SESSION-NAME-MODEL
describe('four-key configuration', () => {
  it.each(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])(
    'uses a configured model and request-local %s thinking',
    async (thinking) => {
      const h = harness({ provider: 'title-provider', model: 'title-model', thinking });
      h.addUser();
      await h.start();
      await h.settle();
      expect(h.find).toHaveBeenCalledWith('title-provider', 'title-model');
      expect(h.streamSimple.mock.calls[0]?.[0]).toBe(alternate);
      expect(h.streamSimple.mock.calls[0]?.[2]?.reasoning).toBe(
        thinking === 'off' ? undefined : thinking,
      );
      expect(h.ctx.model).toBe(model);
      expect(h.ctx.thinkingLevel).toBe('high');
    },
  );

  it.each(
    [
      '{',
      [],
      null,
      { provider: 'only-provider' },
      { model: 'only-model' },
      { provider: '', model: 'id' },
      { provider: 42, model: 'id' },
      { thinking: 'wrong' },
      { setTitle: 'false' },
      { extra: true },
      { constructor: 'unsupported' },
    ].map((config): [unknown] => [config]),
  )('warns once and uses defaults for invalid config %j', async (config) => {
    const h = harness(config);
    h.addUser();
    await h.start();
    await h.settle();
    expect(h.ui.notify).toHaveBeenCalledTimes(1);
    expect(h.ui.notify.mock.calls[0]?.[1]).toBe('warning');
    expect(h.streamSimple.mock.calls[0]?.[0]).toBe(model);
  });

  it('accepts explicit null selection and reads changed config on reload', async () => {
    vi.useFakeTimers();
    const h = harness({ provider: null, model: null, setTitle: false });
    (h.ctx.sessionManager as SessionManager).appendSessionInfo('Existing');
    await h.start();
    await vi.runOnlyPendingTimersAsync();
    expect(h.ui.setTitle).not.toHaveBeenCalled();
    writeFileSync(join(h.dir, 'session-name.json'), JSON.stringify({ setTitle: true }));
    await h.emit('session_start', { reason: 'reload' });
    await vi.runOnlyPendingTimersAsync();
    expect(h.ui.setTitle).toHaveBeenLastCalledWith('Existing');
  });

  it('uses the heuristic, not the active model, if an explicit override is unavailable', async () => {
    const h = harness({ provider: 'missing', model: 'missing' });
    h.find.mockReturnValue(undefined);
    h.addUser();
    await h.start();
    await h.settle();
    expect(h.streamSimple).not.toHaveBeenCalled();
    expect(h.pi.setSessionName).toHaveBeenCalledWith('Fix login redirect');
  });
});

// @mara checks REQ-SESSION-NAME-RECOVERY
describe('retry and fallback', () => {
  it.each([408, 429, 500, 502, 503])('retries HTTP %i once', async (status) => {
    const h = harness();
    h.addUser();
    h.streamSimple.mockImplementationOnce((_model, _context, options) => {
      void options?.onResponse?.(
        { status } as Parameters<NonNullable<NonNullable<Parameters<Stream>[2]>['onResponse']>>[0],
        _model,
      );
      return { result: async () => response('', 'error', `HTTP ${status}`) } as ReturnType<Stream>;
    });
    await h.start();
    await h.settle();
    expect(h.streamSimple).toHaveBeenCalledTimes(2);
    expect(h.pi.setSessionName).toHaveBeenCalledWith('Fix login redirect');
  });

  it.each([400, 401, 403, 404])('does not retry permanent HTTP %i errors', async (status) => {
    const h = harness();
    h.addUser('  Investigate auth failure\nsecret details');
    h.streamSimple.mockReturnValue({
      result: async () => response('', 'error', `HTTP ${status}`),
    } as ReturnType<Stream>);
    await h.start();
    await h.settle();
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
    expect(h.pi.setSessionName).toHaveBeenCalledWith('Investigate auth failure');
  });

  it('retries a transport exception, then uses the heuristic after the second failure', async () => {
    const h = harness();
    h.addUser('\n  Investigate   sockets  \nMore');
    h.streamSimple.mockImplementation(() => {
      throw new Error('ECONNRESET');
    });
    await h.start();
    await h.settle();
    await h.settle();
    expect(h.streamSimple).toHaveBeenCalledTimes(2);
    expect(h.pi.setSessionName).toHaveBeenCalledExactlyOnceWith('Investigate sockets');
  });

  it.each([
    response('', 'error', 'No API key available'),
    response('', 'error', 'Unknown failure'),
    response(''),
    response('   `  ` '),
  ])('falls back without retry for an unusable/permanent result', async (result) => {
    const h = harness();
    h.addUser('A'.repeat(80));
    h.streamSimple.mockReturnValue({ result: async () => result } as ReturnType<Stream>);
    await h.start();
    await h.settle();
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
    expect(h.pi.setSessionName).toHaveBeenCalledWith('A'.repeat(59) + '…');
  });

  it('uses the heuristic without a model', async () => {
    const h = harness();
    h.ctx.model = undefined;
    h.addUser();
    await h.start();
    await h.settle();
    expect(h.streamSimple).not.toHaveBeenCalled();
    expect(h.pi.setSessionName).toHaveBeenCalledWith('Fix login redirect');
  });

  it('discards an aborted response instead of retrying or persisting a fallback', async () => {
    const h = harness();
    h.addUser();
    h.streamSimple.mockReturnValue({
      result: async () => response('', 'aborted'),
    } as ReturnType<Stream>);
    await h.start();
    await h.settle();
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
    expect(h.pi.setSessionName).not.toHaveBeenCalled();
  });

  it('bounds providers that never settle, aborts each attempt, and falls back after two deadlines', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.addUser();
    const pending = deferred();
    h.streamSimple.mockReturnValue({ result: () => pending.promise } as ReturnType<Stream>);
    await h.start();
    const naming = h.settle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.streamSimple).toHaveBeenCalledTimes(2);
    expect(h.streamSimple.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    await naming;
    expect(h.streamSimple.mock.calls[1]?.[2]?.signal?.aborted).toBe(true);
    expect(h.pi.setSessionName).toHaveBeenCalledWith('Fix login redirect');
    pending.resolve(response('Too late'));
    await Promise.resolve();
    expect(h.pi.setSessionName).toHaveBeenCalledTimes(1);
  });
});

// @mara checks REQ-SESSION-NAME-LIFECYCLE
describe('cancellation and user authority', () => {
  it.each(['Manual title', ''])(
    'manual name/clear %j cancels generation, including a late successful response',
    async (name) => {
      const h = harness();
      h.addUser();
      const pending = deferred();
      h.streamSimple.mockReturnValue({ result: () => pending.promise } as ReturnType<Stream>);
      await h.start();
      const naming = h.settle();
      h.pi.setSessionName(name);
      await naming;
      expect(h.streamSimple.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
      pending.resolve(response('Late model title'));
      await Promise.resolve();
      await h.settle();
      expect(h.pi.setSessionName).toHaveBeenCalledExactlyOnceWith(name);
    },
  );

  it.each(['session_shutdown', 'session_tree', 'session_start'])(
    '%s prevents fallback and late persistence',
    async (event) => {
      const h = harness();
      h.addUser();
      const pending = deferred();
      h.streamSimple.mockReturnValue({ result: () => pending.promise } as ReturnType<Stream>);
      await h.start();
      const naming = h.settle();
      await h.emit(event, { reason: 'reload' });
      await naming;
      expect(h.streamSimple.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
      pending.resolve(response('', 'error', 'HTTP 503'));
      await Promise.resolve();
      expect(h.pi.setSessionName).not.toHaveBeenCalled();
    },
  );

  it('does not apply an old operation to a new session or interfere with its generation', async () => {
    const h = harness();
    h.addUser();
    const pending = deferred();
    h.streamSimple.mockReturnValueOnce({ result: () => pending.promise } as ReturnType<Stream>);
    await h.start();
    const old = h.settle();
    h.ctx.sessionManager = SessionManager.inMemory(h.dir);
    h.addUser('New task');
    await h.emit('session_start', { reason: 'new' });
    await old;
    await h.settle();
    pending.resolve(response('Old task title'));
    await Promise.resolve();
    expect(h.pi.setSessionName).toHaveBeenCalledExactlyOnceWith('Fix login redirect');
  });

  it('rejects a changed session even if no cancellation event was delivered', async () => {
    const h = harness();
    h.addUser();
    const pending = deferred();
    h.streamSimple.mockReturnValue({ result: () => pending.promise } as ReturnType<Stream>);
    await h.start();
    const naming = h.settle();
    h.ctx.sessionManager = SessionManager.inMemory(h.dir);
    pending.resolve(response('Stale title'));
    await naming;
    expect(h.pi.setSessionName).not.toHaveBeenCalled();
  });
});

// @mara checks REQ-SESSION-NAME-TITLE
describe('terminal titles', () => {
  it.each(['startup', 'resume', 'reload', 'fork'])(
    'defers the existing name past native %s title handling',
    async (reason) => {
      vi.useFakeTimers();
      const h = harness();
      (h.ctx.sessionManager as SessionManager).appendSessionInfo('Existing task');
      await h.emit('session_start', { reason });
      expect(h.ui.setTitle).not.toHaveBeenCalled();
      await vi.runOnlyPendingTimersAsync();
      expect(h.ui.setTitle).toHaveBeenLastCalledWith('Existing task');
      h.pi.setSessionName('Renamed task');
      expect(h.ui.setTitle).toHaveBeenLastCalledWith('Renamed task');
    },
  );

  it.each(['tui', 'rpc', 'json', 'print'] as const)(
    'never calls the title API with setTitle false in %s mode',
    async (mode) => {
      vi.useFakeTimers();
      const h = harness({ setTitle: false }, mode);
      h.addUser();
      await h.start();
      await h.settle();
      h.pi.setSessionName('Manual');
      await vi.runOnlyPendingTimersAsync();
      expect(h.ui.setTitle).not.toHaveBeenCalled();
      expect(h.streamSimple).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['rpc', 'json', 'print'] as const)(
    'names sessions without terminal calls in %s mode',
    async (mode) => {
      vi.useFakeTimers();
      const h = harness(undefined, mode);
      h.addUser();
      await h.start();
      await h.settle();
      await vi.runOnlyPendingTimersAsync();
      expect(h.pi.setSessionName).toHaveBeenCalledWith('Fix login redirect');
      expect(h.ui.setTitle).not.toHaveBeenCalled();
    },
  );

  it('leaves unnamed/cleared titles native and cancels a pending startup title on shutdown', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.start();
    await vi.runOnlyPendingTimersAsync();
    expect(h.ui.setTitle).not.toHaveBeenCalled();
    h.pi.setSessionName('Before clear');
    h.ui.setTitle.mockClear();
    await h.start();
    h.pi.setSessionName('');
    await vi.runOnlyPendingTimersAsync();
    expect(h.ui.setTitle).not.toHaveBeenCalled();
    h.pi.setSessionName('Before shutdown');
    h.ui.setTitle.mockClear();
    await h.start();
    await h.emit('session_shutdown');
    await vi.runOnlyPendingTimersAsync();
    expect(h.ui.setTitle).not.toHaveBeenCalled();
  });

  it('strips terminal controls from manual names without changing their stored metadata', async () => {
    const h = harness();
    await h.start();
    h.pi.setSessionName('Manual\u001b\u0007 title');
    expect(h.ui.setTitle).toHaveBeenLastCalledWith('Manual title');
    expect(h.ctx.sessionManager.getSessionName()).toBe('Manual\u001b\u0007 title');
  });
});
