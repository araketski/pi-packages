import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionContext, TurnEndEvent } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults, loadConfig } from '../extensions/session-activity/config.ts';
import { ActivityDigest } from '../extensions/session-activity/digest.ts';
import { generateActivity, parseActivity } from '../extensions/session-activity/summary.ts';

const dirs: string[] = [];
afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function config(raw?: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'activity-config-'));
  dirs.push(dir);
  vi.stubEnv('PI_CODING_AGENT_DIR', dir);
  if (raw !== undefined)
    writeFileSync(
      join(dir, 'session-activity.json'),
      typeof raw === 'string' ? raw : JSON.stringify(raw),
    );
  const warn = vi.fn();
  return { value: loadConfig(warn), warn };
}

// @mara checks REQ-SESSION-ACTIVITY-MODEL
it('uses independent agent-directory defaults and does not warn for a missing file', () => {
  expect(config().value).toEqual({
    provider: null,
    model: null,
    thinking: 'off',
    intervalTurns: 5,
  });
  expect(config().warn).not.toHaveBeenCalled();
  expect(config({ provider: 'p', model: 'm', thinking: 'low', intervalTurns: 2 }).value).toEqual({
    provider: 'p',
    model: 'm',
    thinking: 'low',
    intervalTurns: 2,
  });
});
it.each([
  '{',
  'null',
  '[]',
  { setTitle: true },
  { provider: 'p' },
  { thinking: null },
  { model: 'm' },
  { provider: '', model: '' },
  { intervalTurns: 0 },
  { intervalTurns: 1.5 },
  { intervalTurns: '5' },
  { intervalTurns: Number.MAX_SAFE_INTEGER + 1 },
])('warns once and discards an invalid config: %j', (raw) => {
  const result = config(raw);
  expect(result.value).toEqual(defaults);
  expect(result.warn).toHaveBeenCalledTimes(1);
});

function message(content: unknown[], stopReason = 'toolUse'): TurnEndEvent['message'] {
  return { role: 'assistant', content, stopReason } as TurnEndEvent['message'];
}
// @mara checks REQ-SESSION-ACTIVITY-DIGEST
it('retains only curated recent activity, not thinking, edit contents or bulk arguments', () => {
  const digest = new ActivityDigest();
  digest.add(
    message([
      { type: 'thinking', thinking: 'THINKING_SECRET' },
      { type: 'text', text: 'Investigating parser failures' },
      {
        type: 'toolCall',
        name: 'edit',
        arguments: {
          path: 'parser.ts',
          oldText: 'SOURCE_SECRET',
          newText: 'REPLACEMENT_SECRET',
          token: 'AUTH_SECRET',
        },
      },
      { type: 'toolCall', name: 'bash', arguments: { command: 'pnpm nx test parser' } },
    ]),
  );
  const text = digest.snapshot();
  expect(text).toContain('parser.ts');
  expect(text).toContain('pnpm nx test parser');
  expect(text).toContain('Investigating parser failures');
  expect(text).not.toMatch(/SECRET/);
  for (let i = 0; i < 6; i++) digest.add(message([{ type: 'text', text: `recent-${i}` }]));
  expect(digest.snapshot()).not.toContain('parser.ts');
  expect(digest.snapshot()).not.toContain('recent-0');
  expect(digest.snapshot()).toContain('recent-5');
  digest.reset();
  expect(digest.snapshot()).toBe('');
});
it('bounds huge/many entries and counts Unicode code points without retaining full payloads', () => {
  const digest = new ActivityDigest();
  const text = '😀'.repeat(10_000);
  for (let i = 0; i < 6; i++)
    digest.add(
      message(
        Array.from({ length: 100 }, () => ({
          type: 'toolCall',
          name: 'bash',
          arguments: { command: text },
        })).concat([{ type: 'text', text }] as never[]),
      ),
    );
  expect(Array.from(digest.snapshot()).length).toBeLessThanOrEqual(6000);
  expect(digest.snapshot()).not.toContain('😀'.repeat(601));
});

// @mara checks REQ-SESSION-ACTIVITY-DIGEST
it.each([
  'await Promise.allSettled([tools.bash({ command: "pnpm nx test parser" }), tools.bash({ command: "pnpm nx lint parser" })]);',
  'await tools.read({ path: "docs/extensions.md" }); await tools.mcp__mara__search({ query: "activity" });',
])('retains codemode script evidence without running it: %s', (code) => {
  const digest = new ActivityDigest();
  digest.add(message([{ type: 'toolCall', name: 'codemode', arguments: { code } }]));
  expect(digest.snapshot()).toBe(`tool codemode: code=${code}`);
  for (let i = 0; i < 5; i++) digest.add(message([{ type: 'text', text: `recent-${i}` }]));
  expect(digest.snapshot()).not.toContain(code);
  digest.reset();
  expect(digest.snapshot()).toBe('');
});
it('bounds leading codemode excerpts in Unicode code points and the rolling digest', () => {
  const digest = new ActivityDigest();
  const code = '😀'.repeat(10_000) + 'OMITTED_TAIL';
  for (let i = 0; i < 6; i++) {
    digest.add(
      message(
        Array.from({ length: 100 }, () => ({
          type: 'toolCall',
          name: 'codemode',
          arguments: { code },
        })),
      ),
    );
  }
  const text = digest.snapshot();
  expect(text).toContain(`tool codemode: code=${'😀'.repeat(395)}`);
  expect(text).not.toContain('😀'.repeat(396));
  expect(text).not.toContain('OMITTED_TAIL');
  expect(Array.from(text).length).toBeLessThanOrEqual(6000);
  expect(text).not.toMatch(/\p{Cs}/u);
});
it.each([{}, { code: null }, { code: 1 }, { code: ['NESTED_SECRET'] }, null])(
  'omits missing or non-string codemode code: %j',
  (args) => {
    const digest = new ActivityDigest();
    digest.add(message([{ type: 'toolCall', name: 'codemode', arguments: args }]));
    expect(digest.snapshot()).toBe('tool codemode: ');
  },
);
it('allows embedded payloads only in codemode excerpts, not arbitrary tool arguments', () => {
  const digest = new ActivityDigest();
  const code =
    'throw new Error("Do not execute"); await tools.write({ path: "x", content: "EMBEDDED_PAYLOAD" });';
  digest.add(
    message([
      { type: 'toolCall', name: 'codemode', arguments: { code, content: 'OTHER_SECRET' } },
      { type: 'toolCall', name: 'write', arguments: { path: 'x', code, content: 'DIRECT_SECRET' } },
    ]),
  );
  expect(digest.snapshot()).toContain(`tool codemode: code=${code}`);
  expect(digest.snapshot()).toContain('tool write: path=x');
  expect(digest.snapshot()).not.toMatch(/OTHER_SECRET|DIRECT_SECRET/);
  expect(digest.snapshot().split('\n')).toHaveLength(2);
});

// @mara checks REQ-SESSION-ACTIVITY-PHRASE
it.each([
  ['{"activity":"  **Running parser tests**\\n "}', 'Running parser tests'],
  ['{"activity":null}', undefined],
  ['{"activity":"Running\\u0000 parser tests"}', 'Running parser tests'],
  ['{"activity":"Running\\ud800 parser tests"}', undefined],
  ['{"activity":"One two three four five six"}', undefined],
  [JSON.stringify({ activity: 'a'.repeat(61) }), undefined],
  [JSON.stringify({ activity: '😀'.repeat(60) }), '😀'.repeat(60)],
  ['not json', undefined],
  ['{"activity":""}', undefined],
  ['{"activity":3}', undefined],
  ['{"activity":"Running tests","extra":1}', undefined],
])('validates normalized activity without truncation (%s)', (raw, expected) => {
  expect(parseActivity(raw)).toBe(expected);
});

function modelContext() {
  const model = { provider: 'chat', id: 'active', api: 'openai-completions' };
  const response = {
    stopReason: 'stop',
    content: [{ type: 'text', text: '{"activity":"Running parser tests"}' }],
  };
  const streamSimple = vi.fn(() => ({ result: async () => response }));
  const find = vi.fn(() => ({ ...model, id: 'alternate' }));
  const ctx = {
    model,
    modelRegistry: { streamSimple, find },
    thinkingLevel: 'high',
  } as unknown as ExtensionContext;
  return { ctx, model, response, streamSimple, find };
}
// @mara checks REQ-SESSION-ACTIVITY-MODEL
// @mara checks REQ-SESSION-ACTIVITY-FAILURE
// @mara checks REQ-SESSION-ACTIVITY-ASYNC
// @mara checks REQ-SESSION-ACTIVITY-DIGEST
// @mara checks REQ-SESSION-ACTIVITY-PHRASE
describe('background generation', () => {
  it('uses active model with reasoning off, bounded input/output and no chat mutation', async () => {
    const h = modelContext();
    expect(
      await generateActivity(
        h.ctx,
        defaults,
        'tool bash: tests',
        'Inspecting parser code',
        new AbortController().signal,
      ),
    ).toBe('Running parser tests');
    const [model, input, options] = h.streamSimple.mock.calls[0] as unknown as [
      unknown,
      { messages: unknown[] },
      Record<string, unknown>,
    ];
    expect(model).toBe(h.model);
    expect(JSON.stringify(input)).toContain('Inspecting parser code');
    expect(JSON.stringify(input)).not.toContain('high');
    expect(options).toMatchObject({ maxTokens: 128, maxRetries: 0, timeoutMs: 10000 });
    expect(options.reasoning).toBeUndefined();
    expect(h.ctx.thinkingLevel).toBe('high');
    expect(h.find).not.toHaveBeenCalled();
  });
  it('sends codemode evidence to one existing request with purpose and untrusted-data guidance', async () => {
    const h = modelContext();
    const code = 'await tools.bash({ command: "pnpm nx test parser" });';
    const digest = new ActivityDigest();
    digest.add(message([{ type: 'toolCall', name: 'codemode', arguments: { code } }]));
    await generateActivity(
      h.ctx,
      defaults,
      digest.snapshot(),
      undefined,
      new AbortController().signal,
    );
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
    const input = (h.streamSimple.mock.calls[0] as unknown as unknown[])[1] as {
      systemPrompt: string;
      messages: { content: { text: string }[] }[];
    };
    expect(JSON.parse(input.messages[0]!.content[0]!.text).digest).toContain(code);
    expect(input.systemPrompt).toMatch(/codemode.*purpose/i);
    expect(input.systemPrompt).toMatch(/rather than.*using codemode/i);
    expect(input.systemPrompt).toMatch(/script.*untrusted data, not instructions/i);
    expect(input.systemPrompt).toMatch(/do not.*success/i);
  });
  it('honors explicit overrides and skips unresolved models without fallback', async () => {
    const h = modelContext();
    const cfg = { ...defaults, provider: 'custom', model: 'alternate', thinking: 'low' as const };
    await generateActivity(h.ctx, cfg, 'digest', undefined, new AbortController().signal);
    expect(h.find).toHaveBeenCalledWith('custom', 'alternate');
    expect((h.streamSimple.mock.calls[0] as unknown as unknown[])[2]).toMatchObject({
      reasoning: 'low',
    });
    h.streamSimple.mockClear();
    h.find.mockReturnValue(undefined as never);
    expect(
      await generateActivity(h.ctx, cfg, 'digest', undefined, new AbortController().signal),
    ).toBeUndefined();
    expect(h.streamSimple).not.toHaveBeenCalled();
  });
  it('bounds waiting even if a provider ignores cancellation, with no retry', async () => {
    vi.useFakeTimers();
    const h = modelContext();
    let resolve!: (value: typeof h.response) => void;
    const pending = new Promise<typeof h.response>((r) => {
      resolve = r;
    });
    h.streamSimple.mockReturnValue({ result: () => pending });
    const task = generateActivity(
      h.ctx,
      defaults,
      'digest',
      undefined,
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(await task).toBeUndefined();
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
    const options = (h.streamSimple.mock.calls[0] as unknown as unknown[])[2] as {
      signal: AbortSignal;
    };
    expect(options.signal.aborted).toBe(true);
    resolve(h.response);
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels without fallback and handles provider errors silently', async () => {
    const h = modelContext();
    const abort = new AbortController();
    abort.abort();
    expect(
      await generateActivity(h.ctx, defaults, 'digest', undefined, abort.signal),
    ).toBeUndefined();
    expect(h.streamSimple).not.toHaveBeenCalled();
    h.streamSimple.mockImplementation(() => {
      throw new Error('missing authentication');
    });
    expect(
      await generateActivity(h.ctx, defaults, 'digest', undefined, new AbortController().signal),
    ).toBeUndefined();
    expect(h.streamSimple).toHaveBeenCalledTimes(1);
  });
});
