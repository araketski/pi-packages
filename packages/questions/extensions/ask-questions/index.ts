import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text, TruncatedText } from '@earendil-works/pi-tui';
import { Check } from 'typebox/value';
import { QuestionFlow } from './flow.ts';
import { QuestionScreen, displayText } from './screen.ts';
import {
  inputSchema,
  normalizeInput,
  outputSchema,
  resultText,
  snapshotQuestions,
  type CancelReason,
  type Question,
  type Result,
} from './schema.ts';

type Completion = { kind: 'result'; result: Result } | { kind: 'failure'; error: unknown };

// @mara implements DES-QUESTIONS-LIFECYCLE
// @mara implements DES-QUESTIONS-HERDR-ATTENTION
class Invocation {
  completion?: Completion;
  private done?: (completion: Completion) => void;
  private component?: QuestionScreen;
  private attentionOwned = false;
  private cleanup?: () => void;
  constructor(
    private readonly questions: readonly Question[],
    private readonly emit: (active: boolean) => void,
    cleanup: () => void,
  ) {
    this.cleanup = cleanup;
  }
  acquireAttention() {
    if (this.completion || this.attentionOwned) return;
    // Ownership records the emission attempt, not delivery. Never retry an
    // anonymous counted activation when a listener/transport fails.
    this.attentionOwned = true;
    this.emit(true);
  }
  attach(done: (completion: Completion) => void, component: QuestionScreen) {
    if (this.completion) {
      component.dispose();
      done(this.completion);
      return;
    }
    this.done = done;
    this.component = component;
  }
  cancel(reason: CancelReason) {
    this.end({
      kind: 'result',
      result: {
        status: 'cancelled',
        reason,
        questions: snapshotQuestions(this.questions),
        answers: [],
      },
    });
  }
  fail(error: unknown) {
    this.end({ kind: 'failure', error });
  }
  submit(result: Result) {
    this.end({ kind: 'result', result });
  }
  private end(completion: Completion) {
    if (this.completion) return;
    this.completion = completion;
    const done = this.done;
    const component = this.component;
    const cleanup = this.cleanup;
    this.done = undefined;
    this.component = undefined;
    this.cleanup = undefined;
    try {
      if (this.attentionOwned) {
        this.attentionOwned = false;
        this.emit(false);
      }
      component?.dispose();
      done?.(completion);
    } finally {
      // Closing observers cannot replace an invocation before its UI closes.
      cleanup?.();
    }
  }
}

// @mara implements DES-QUESTIONS-TOOL
export default function questionsExtension(pi: ExtensionAPI) {
  let active: Invocation | undefined;
  let rootStarted = false;
  pi.on('session_start', (_event, ctx) => {
    active?.cancel('session_changed');
    rootStarted = ctx.mode === 'tui';
  });
  pi.on('session_before_switch', () => {
    active?.cancel('session_changed');
  });
  pi.on('session_before_fork', () => {
    active?.cancel('session_changed');
  });
  pi.on('session_before_tree', () => {
    active?.cancel('session_changed');
  });
  pi.on('session_shutdown', () => {
    active?.cancel('shutdown');
    rootStarted = false;
  });

  pi.registerTool({
    name: 'ask_questions',
    label: 'Ask Questions',
    description: 'Ask the user one or more questions with selectable options and custom answers.',
    promptSnippet:
      'Collect related user choices through an interactive questionnaire with optional recommendations.',
    promptGuidelines: [
      'Use ask_questions for direct questions when structured input helps; use ordinary chat for trivial, rhetorical or lightweight next-step questions.',
      'Batch related questions. Keep questions concise and options short and concrete.',
      'When you have a justified preferred answer, provide its 1-based recommendedOption. Omit it when there is no clear preference: recommendations are optional and still require user confirmation. Never reorder options to put the recommendation first.',
    ],
    exposure: 'model-only',
    executionMode: 'sequential',
    parameters: inputSchema,
    outputSchema,
    async execute(_id, args, signal, _onUpdate, ctx) {
      const questions = normalizeInput(args);
      const respond = (payload: Result) => ({
        content: [{ type: 'text' as const, text: resultText(payload) }],
        structuredContent: payload,
        details: payload,
      });
      if (signal?.aborted)
        return respond({ status: 'cancelled', reason: 'aborted', questions, answers: [] });
      if (ctx.mode !== 'tui' || !ctx.hasUI || typeof ctx.ui?.custom !== 'function')
        return respond({ status: 'unavailable', reason: 'non_tui', questions, answers: [] });
      if (active) throw new Error('A questions invocation is already active.');
      const emit = (active: boolean) => {
        try {
          pi.events.emit('herdr:blocked', { active });
        } catch {
          /* Optional presentation must not fail or hang the questionnaire. */
        }
      };
      const onAbort = () => invocation.cancel('aborted');
      const invocation = new Invocation(questions, emit, () => {
        signal?.removeEventListener('abort', onAbort);
        if (active === invocation) active = undefined;
      });
      active = invocation;
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      if (rootStarted && process.env.HERDR_ENV === '1') invocation.acquireAttention();
      try {
        await ctx.ui.custom<Completion>((tui, theme, kb, done) => {
          const component = new QuestionScreen(tui, theme, kb, new QuestionFlow(questions), {
            submit: (result) => {
              if (active === invocation) invocation.submit(result);
            },
            dismiss: () => invocation.cancel('dismissed'),
            interrupt: () => {
              ctx.abort();
              invocation.cancel('aborted');
            },
            fail: (error) => invocation.fail(error),
          });
          invocation.attach(done, component);
          return component;
        });
        // Host disposal and late callbacks cannot substitute a new outcome.
        if (!invocation.completion) invocation.cancel('dismissed');
      } catch (error) {
        invocation.fail(error);
      }
      const completion = invocation.completion!;
      if (completion.kind === 'failure') throw completion.error;
      return respond(completion.result);
    },
    renderCall(args, theme) {
      const count = Array.isArray(args?.questions) ? args.questions.length : 0;
      const preview = args?.questions?.[0]?.question;
      return new TruncatedText(
        `${theme.fg('toolTitle', theme.bold('ask_questions'))} · ${count} question(s)${typeof preview === 'string' ? ` · ${displayText(preview).replace(/\n/g, ' ')}` : ''}`,
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      if (Check(outputSchema, result.details)) {
        const status = result.details.status;
        return new Text(
          `${theme.fg(status === 'answered' ? 'success' : 'muted', `Ask Questions · ${status}`)}\n${displayText(resultText(result.details))}`,
          0,
          0,
        );
      }
      return new Text(
        result.content
          .filter((block) => block.type === 'text')
          .map((block) => displayText(block.text))
          .join('\n'),
        0,
        0,
      );
    },
  });
}
