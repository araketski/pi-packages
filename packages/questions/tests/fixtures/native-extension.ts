import { appendFileSync, readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentTools,
} from '@earendil-works/pi-ai';
import type { Static } from 'typebox';
import type { inputSchema } from '../../extensions/ask-questions/schema.ts';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionToolContext,
} from '@earendil-works/pi-coding-agent';
import { isFocusable, matchesKey, type Component } from '@earendil-works/pi-tui';
import questionsExtension from '../../extensions/ask-questions/index.ts';

// Fixture-only instrumentation, deliberately excluded from the artifact.
// No live inference, production credentials, user settings or Herdr socket.
export default function nativeFixture(pi: ExtensionAPI) {
  const agentDir = process.env.PI_CODING_AGENT_DIR!;
  const config = JSON.parse(readFileSync(join(agentDir, 'fixture.json'), 'utf8')) as {
    questions: Static<typeof inputSchema>['questions'];
    setupAbort?: boolean;
    switchPath?: string;
  };
  const trace = (value: object) =>
    appendFileSync(join(agentDir, 'trace.jsonl'), `${JSON.stringify(value)}\n`);
  const mock = fauxProvider({
    provider: 'questions-fixture',
    api: 'questions-fixture-api',
    models: [{ id: 'questions-model', contextWindow: 128000, maxTokens: 1024 }],
    tokensPerSecond: 100000,
  });
  pi.registerProvider(mock.provider);
  let context: ExtensionCommandContext | undefined;
  let removeInput: (() => void) | undefined;
  let rootReady = false;
  let count = 0;
  let veto = false;
  let inputSequence = 0;

  pi.events.on('herdr:blocked', (value) => {
    const data = value as { active: boolean };
    if (rootReady) count += data.active ? 1 : -1;
    trace({ type: 'attention', data, count, rootReady });
  });
  questionsExtension({
    ...pi,
    registerTool(definition) {
      pi.registerTool({
        ...definition,
        async execute(id, args, signal, onUpdate, ctx) {
          const before = signal ? getEventListeners(signal, 'abort').length : 0;
          let readPaging: (() => string[][]) | undefined;
          let pagingBefore: string[][] | undefined;
          trace({ type: 'execute', mode: ctx.mode, hasUI: ctx.hasUI });
          const wrapped: ExtensionToolContext = {
            ...ctx,
            ui: {
              ...ctx.ui,
              custom: (factory, options) =>
                ctx.ui.custom(async (tui, theme, kb, done) => {
                  readPaging = () => [
                    kb.getKeys('tui.altScreen.pageUp'),
                    kb.getKeys('tui.altScreen.pageDown'),
                  ];
                  pagingBefore = readPaging();
                  if (config.setupAbort) ctx.abort();
                  const component = await factory(tui, theme, kb, done);
                  trace({
                    type: 'component-created',
                    emptyAfterSetupAbort: config.setupAbort
                      ? component.render(tui.terminal.columns).length === 0
                      : undefined,
                  });
                  return {
                    get focused() {
                      return isFocusable(component) && component.focused;
                    },
                    set focused(value: boolean) {
                      if (isFocusable(component)) component.focused = value;
                    },
                    invalidate: () => component.invalidate(),
                    handleInput(data: string) {
                      inputSequence++;
                      trace({ type: 'key', data, sequence: inputSequence });
                      component.handleInput?.(data);
                    },
                    render(width: number) {
                      const lines = component.render(width);
                      trace({
                        type: 'frame',
                        width,
                        rows: tui.terminal.rows,
                        lines,
                        focused: isFocusable(component) && component.focused,
                        sequence: inputSequence,
                      });
                      return lines;
                    },
                    dispose() {
                      trace({ type: 'dispose' });
                      (component as Component & { dispose?(): void }).dispose?.();
                    },
                  };
                }, options),
            },
          };
          try {
            const result = await definition.execute(id, args, signal, onUpdate, wrapped);
            let editor: string | undefined;
            try {
              editor = ctx.ui.getEditorText();
            } catch {
              /* The host may invalidate ctx during signal shutdown. Do not probe it again. */
            }
            trace({
              type: 'returned',
              payload: result.structuredContent,
              editor,
              pagingBefore,
              pagingAfter: readPaging?.(),
              listenersBefore: before,
              listenersAfter: signal ? getEventListeners(signal, 'abort').length : 0,
            });
            return result;
          } catch (error) {
            trace({ type: 'failure', message: String(error) });
            throw error;
          }
        },
      });
    },
  } as ExtensionAPI);

  function responses() {
    mock.setResponses([
      (transcript) => {
        trace({
          type: 'request',
          tools: getCurrentTools(transcript.messages).map((tool) => tool.name),
        });
        return fauxAssistantMessage(
          fauxToolCall('ask_questions', { questions: config.questions }),
          { stopReason: 'toolUse' },
        );
      },
      (transcript) => {
        trace({
          type: 'follow-up',
          toolResults: transcript.messages.filter((message) => message.role === 'toolResult'),
        });
        return fauxAssistantMessage('FIXTURE_DONE');
      },
    ]);
  }
  responses();
  pi.registerCommand('fixture-open', {
    description: 'Start the controlled questionnaire test',
    handler: async (_args, ctx) => {
      context = ctx;
      await pi.setModel(mock.getModel());
      responses();
      ctx.ui.setEditorText('preserved main draft');
      pi.sendUserMessage('Controlled questionnaire fixture');
    },
  });
  pi.on('session_before_switch', () => {
    trace({ type: 'pre-switch', veto });
    if (veto) {
      veto = false;
      return { cancel: true };
    }
    return undefined;
  });
  pi.on('session_before_fork', () => {
    trace({ type: 'pre-fork' });
  });
  pi.on('session_before_tree', () => {
    trace({ type: 'pre-tree' });
  });
  pi.on('session_start', (event, ctx) => {
    rootReady = ctx.mode === 'tui';
    trace({ type: 'startup', mode: ctx.mode, reason: event.reason });
    if (!rootReady) return;
    // An independent synthetic producer, not the absent Goal package.
    if (count === 0) pi.events.emit('herdr:blocked', { active: true });
    removeInput?.();
    removeInput = ctx.ui.onTerminalInput((data) => {
      if (matchesKey(data, 'f1')) {
        const resize = spawnSync('stty', ['rows', '12', 'cols', '18'], { stdio: 'inherit' });
        trace({ type: 'resize', status: resize.status });
        return { consume: true };
      }
      if (matchesKey(data, 'f2')) {
        trace({ type: 'theme', result: ctx.ui.setTheme('light') });
        return { consume: true };
      }
      const action = matchesKey(data, 'f5')
        ? 'new'
        : matchesKey(data, 'f6')
          ? 'fork'
          : matchesKey(data, 'f7')
            ? 'tree'
            : matchesKey(data, 'f8')
              ? 'switch'
              : matchesKey(data, 'f9')
                ? 'reload'
                : matchesKey(data, 'f10')
                  ? 'shutdown'
                  : matchesKey(data, 'f11')
                    ? 'veto'
                    : undefined;
      if (!action || !context) return undefined;
      const captured = context;
      const user = captured.sessionManager
        .getEntries()
        .find((entry) => entry.type === 'message' && entry.message.role === 'user');
      trace({ type: 'action', action });
      if (action === 'shutdown') {
        // Exercise the host's actual signal-triggered graceful shutdown. The
        // extension shutdown() request itself is deferred until the agent settles.
        process.kill(process.pid, 'SIGTERM');
        return { consume: true };
      }
      let operation: Promise<unknown>;
      if (action === 'reload') operation = captured.reload();
      else if (action === 'switch') operation = captured.switchSession(config.switchPath!);
      else if (action === 'fork') operation = captured.fork(user!.id);
      else if (action === 'tree') operation = captured.navigateTree(user!.id, { summarize: false });
      else {
        veto = action === 'veto';
        operation = captured.newSession();
      }
      void operation.then(
        (result) => trace({ type: 'action-finished', action, result }),
        (error) => trace({ type: 'action-failed', action, message: String(error) }),
      );
      return { consume: true };
    });
  });
  pi.on('session_shutdown', () => {
    trace({ type: 'shutdown', count });
    removeInput?.();
    removeInput = undefined;
    rootReady = false;
  });
  pi.on('agent_start', () => {
    trace({ type: 'agent-start', count });
  });
  pi.on('agent_settled', (_event, ctx) => {
    if (!rootReady) {
      trace({ type: 'settled-without-live-tui', count });
      return;
    }
    trace({
      type: 'settled',
      count,
      editor: ctx.ui.getEditorText(),
      entries: ctx.sessionManager.getEntries(),
    });
  });
}
