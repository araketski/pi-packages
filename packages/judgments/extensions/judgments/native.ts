import type { AgentToolResult, ExtensionToolContext } from '@earendil-works/pi-coding-agent';
import { Value } from 'typebox/value';
import { answer } from './schemas.ts';
import type { Source } from './loading.ts';

export type Request = Parameters<ExtensionToolContext['modelRegistry']['classify']>[1];
export type NativeResult = Awaited<ReturnType<ExtensionToolContext['modelRegistry']['classify']>>;
export type Selection = { provider: string; model: string };
export const guidance =
  'Advisory only: probabilities are not evidence, acceptance, authorization or verification. Supply relevant evidence; do not repeat unchanged judgments. If unavailable or inconclusive, use ordinary reasoning without waiving required clarification or approval.';
export type Evaluation = {
  status: 'assessed' | 'inconclusive' | 'unavailable' | 'failed' | 'aborted';
  advisory: true;
  classifier: Selection;
  guidance: string;
  message?: string;
  answers?: NativeResult['answers'];
  usage?: NativeResult['usage'];
  scenario?: string;
  interpretation?: string;
  source?: Source;
};

function validAnswers(request: Request, result: NativeResult): boolean {
  return Object.entries(request.questions).every(([key, question]) => {
    const value = result.answers?.[key];
    if (!Value.Check(answer, value) || value.type !== question.type) return false;
    if (value.type === 'choice' && question.type === 'choice') {
      return (
        Object.hasOwn(question.criteria, value.choice) &&
        Object.keys(question.criteria).every((label) => Object.hasOwn(value.probabilities, label))
      );
    }
    return true;
  });
}

// @mara implements REQ-JUDGMENTS-NATIVE-CLASSIFIER
export async function evaluate(
  selection: Selection,
  request: Request,
  ctx: ExtensionToolContext,
  signal?: AbortSignal,
): Promise<Evaluation> {
  const base = { advisory: true as const, classifier: selection, guidance };
  let usage: NativeResult['usage'];
  const finish = (status: Evaluation['status'], message: string): Evaluation => ({
    ...base,
    status,
    message,
    ...(usage ? { usage } : {}),
  });
  if (signal?.aborted) return finish('aborted', 'Judgment cancelled; no assessment.');
  try {
    const model = ctx.modelRegistry.findOfType('classifier', selection.provider, selection.model);
    if (!model)
      return finish(
        'unavailable',
        'Configured classifier is not registered; no fallback selected.',
      );
    const available = await ctx.modelRegistry.getAvailableOfType('classifier', selection.provider, {
      signal,
    });
    if (signal?.aborted) return finish('aborted', 'Judgment cancelled; no assessment.');
    if (!available.some((m) => m.provider === model.provider && m.id === model.id)) {
      return finish(
        'unavailable',
        'Configured classifier is unavailable with current host credentials; no fallback selected.',
      );
    }
    const result = await ctx.modelRegistry.classify(model, request, { signal, maxRetries: 0 });
    usage = result.usage;
    if (signal?.aborted || result.stopReason === 'aborted')
      return finish('aborted', 'Judgment cancelled; no assessment.');
    if (result.stopReason !== 'stop')
      return finish('failed', 'Native classifier request failed; no assessment or fallback.');
    if (!validAnswers(request, result))
      return finish(
        'failed',
        'Native classifier returned incomplete or invalid answers; no assessment.',
      );
    return { ...base, status: 'assessed', answers: result.answers, ...(usage ? { usage } : {}) };
  } catch {
    // Provider diagnostics can echo submitted evidence or credentials. Do not propagate them.
    return signal?.aborted
      ? finish('aborted', 'Judgment cancelled; no assessment.')
      : finish('failed', 'Native classifier operation failed; no assessment or fallback.');
  }
}

export function toolResult<T extends object>(data: T): AgentToolResult {
  const result = data as { usage?: AgentToolResult['usage']; status?: string; valid?: boolean };
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    details: {},
    structuredContent: data as AgentToolResult['structuredContent'],
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.valid === false || ['failed', 'unavailable', 'aborted'].includes(result.status ?? '')
      ? { isError: true }
      : {}),
  };
}
