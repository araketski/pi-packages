// Credential-free public Pi fixture derived from docs/pi-0991-native-probe-data.mara.md.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
export { assert };
export const root = dirname(fileURLToPath(import.meta.url));
const paths = JSON.parse(readFileSync(join(root, 'imports.json'), 'utf8'));
export const sdk = await import(paths.sdk);
export const ai = await import(paths.ai);
export const { Type } = await import(paths.typebox);
export const records = [];
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const usage = (input = 0) => ({
  input,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input,
  cost: { input: input / 1000, output: 0, cacheRead: 0, cacheWrite: 0, total: input / 1000 },
});
export const result = (text, extra = {}) => ({
  content: [{ type: 'text', text }],
  details: undefined,
  ...extra,
});
export const tool = (name, execute, extra = {}) => ({
  name,
  label: name,
  description: 'Synthetic offline probe ' + name,
  parameters: Type.Object({}),
  execute,
  ...extra,
});
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function probe(name, fn) {
  try {
    const data = await fn();
    records.push({ name, status: 'observed', data });
    console.log(JSON.stringify(records.at(-1)));
  } catch (error) {
    records.push({ name, status: 'failed', error: String(error), stack: error.stack });
    console.error(JSON.stringify(records.at(-1)));
    process.exitCode = 1;
  }
  writeFileSync(
    join(root, process.env.PROBE_OUTPUT ?? 'results.json'),
    JSON.stringify(records, null, 2) + '\n',
  );
}
let sequence = 0;
export async function setup({
  extension = () => {},
  builtins = false,
  settings = {},
  excludeTools = [],
  noTools,
  provider,
  sessionManager,
  sessionStartEvent,
  cwdOverride,
  bind = true,
  builtinStyle = false,
  noExtensions = false,
} = {}) {
  const cwd = cwdOverride ?? join(root, 'workspace', 'case-' + ++sequence);
  mkdirSync(cwd, { recursive: true });
  const settingsManager = sdk.SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
    ...settings,
  });
  const requests = [],
    queue = [],
    events = [],
    extensionEvents = [],
    errors = [];
  let piRef, ctxRef;
  const chat = {
    id: 'physical',
    name: 'Synthetic physical',
    api: 'probe-chat',
    input: ['text'],
    reasoning: false,
    contextWindow: 100000,
    maxTokens: 2048,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  const streamSimple = (model, context, _options) => {
    requests.push({ model: clone(model), context: clone(context) });
    const s = new ai.AssistantMessageEventStream();
    queueMicrotask(async () => {
      try {
        const instruction = queue.shift() ?? {
          content: [{ type: 'text', text: 'synthetic done' }],
        };
        const message = {
          role: 'assistant',
          content: instruction.content,
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: usage(),
          stopReason: instruction.content.some((x) => x.type === 'toolCall') ? 'toolUse' : 'stop',
          timestamp: Date.now(),
        };
        s.push({ type: 'start', partial: { ...message, content: [], stopReason: 'pending' } });
        for (const [i, c] of message.content.entries()) {
          if (c.type === 'toolCall') {
            s.push({ type: 'toolcall_start', contentIndex: i, partial: message });
            s.push({ type: 'toolcall_end', contentIndex: i, toolCall: c, partial: message });
          } else {
            s.push({ type: 'text_start', contentIndex: i, partial: message });
            s.push({ type: 'text_delta', contentIndex: i, delta: c.text, partial: message });
            s.push({ type: 'text_end', contentIndex: i, content: c.text, partial: message });
          }
        }
        s.push({ type: 'done', reason: message.stopReason, message });
        s.end();
      } catch (e) {
        s.end();
        throw e;
      }
    });
    return s;
  };
  const modelRuntime = await sdk.ModelRuntime.create({
    authPath: join(cwd, 'auth.json'),
    modelsPath: null,
    modelsStorePath: join(cwd, 'models-store.json'),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  modelRuntime.registerProvider('probe', {
    api: 'probe-chat',
    baseUrl: 'http://127.0.0.1:1/unused',
    apiKey: 'synthetic-not-a-credential',
    models: [chat],
    streamSimple,
    ...provider,
  });
  const loader = new sdk.DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    noExtensions,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [
      ...(builtins
        ? builtinStyle
          ? [
              {
                name: 'codemode',
                builtin: true,
                replaceable: true,
                factory: sdk.createCodemodeExtension({ mode: 'on' }),
              },
              {
                name: 'tool-search',
                builtin: true,
                replaceable: true,
                factory: sdk.createToolSearchExtension(),
              },
            ]
          : [sdk.createCodemodeExtension({ mode: 'on' }), sdk.createToolSearchExtension()]
        : []),
      (pi) => {
        piRef = pi;
        for (const type of [
          'session_start',
          'session_shutdown',
          'input',
          'agent_start',
          'agent_end',
          'agent_before_settle',
          'agent_settled',
          'turn_start',
          'turn_end',
          'tool_call',
          'tool_result',
          'message_end',
          'tool_execution_start',
          'tool_execution_end',
        ]) {
          pi.on(type, (event, ctx) => {
            ctxRef = ctx;
            extensionEvents.push({
              event: clone(event),
              sessionId: ctx.sessionManager.getSessionId(),
              idle: ctx.isIdle(),
              signal: !!ctx.signal,
            });
          });
        }
        extension(pi);
      },
    ],
  });
  await loader.reload();
  const loaded = await sdk.createAgentSession({
    cwd,
    agentDir: cwd,
    settingsManager,
    resourceLoader: loader,
    modelRuntime,
    model: modelRuntime.getModel('probe', 'physical'),
    sessionManager: sessionManager ?? sdk.SessionManager.inMemory(cwd),
    sessionStartEvent,
    excludeTools,
    noTools,
  });
  const { session } = loaded;
  session.subscribe((e) => events.push(clone(e)));
  if (bind) await session.bindExtensions({ onError: (e) => errors.push(clone(e)) });
  return {
    ...loaded,
    services: {
      cwd,
      agentDir: cwd,
      modelRuntime,
      settingsManager,
      resourceLoader: loader,
      diagnostics: [],
    },
    session,
    modelRuntime,
    loader,
    settingsManager,
    requests,
    queue,
    events,
    extensionEvents,
    errors,
    get pi() {
      return piRef;
    },
    get ctx() {
      return ctxRef;
    },
    async call(name, args = {}) {
      const id = 'probe-call-' + (requests.length + 1);
      queue.push({ content: [{ type: 'toolCall', id, name, arguments: args }] });
      await session.prompt('Synthetic fixture, not a real model request.');
      const msg = session.messages.findLast((m) => m.role === 'toolResult' && m.toolCallId === id);
      assert.ok(msg, 'missing synthetic tool result');
      return msg;
    },
    close() {
      session.dispose();
    },
  };
}
