export type FastModel = {
  provider: string;
  api?: string;
  id: string;
  headers?: Record<string, string>;
};

export type FastContext = {
  model?: FastModel;
  modelRegistry: { isUsingOAuth(model: FastModel): boolean };
};

type Eligibility = { supported: boolean; reason?: string; option?: 'speed' | 'service_tier' };

const CLAUDE_MODELS = new Set([
  'claude-opus-4-6',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-opus-5-5',
]);
const OPENAI_MODELS = new Set([
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
]);
const FAST_BETA = 'fast-mode-2026-02-01';
const OAUTH_BETAS = ['claude-code-20250219', 'oauth-2025-04-20'];

export function getModelEligibility(ctx: FastContext): Eligibility {
  const model = ctx.model;
  if (!model) return { supported: false, reason: 'No model is selected' };
  const id = model.id.replace(/^(?:anthropic|openai)\//u, '');
  if (model.api === 'anthropic-messages' && CLAUDE_MODELS.has(id)) {
    return { supported: true, option: 'speed' };
  }
  if (
    (model.api === 'openai-responses' || model.api === 'openai-codex-responses') &&
    OPENAI_MODELS.has(id)
  ) {
    if (model.api === 'openai-codex-responses' && !ctx.modelRegistry.isUsingOAuth(model)) {
      return { supported: false, reason: 'ChatGPT OAuth auth is required' };
    }
    return { supported: true, option: 'service_tier' };
  }
  return {
    supported: false,
    reason: `Current model (${model.provider}/${model.id}) does not support fast mode`,
  };
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}

export function getFastPayload(
  payload: unknown,
  ctx: FastContext,
  enabled: boolean,
): Record<string, unknown> | undefined {
  if (!enabled || !isRecord(payload)) return undefined;
  const eligibility = getModelEligibility(ctx);
  if (!eligibility.supported || !eligibility.option || payload.model !== ctx.model?.id)
    return undefined;
  if (eligibility.option in payload) return undefined;
  return { ...payload, [eligibility.option]: eligibility.option === 'speed' ? 'fast' : 'priority' };
}

export function applyFastHeaders(
  headers: Record<string, string | null>,
  ctx: FastContext,
  enabled: boolean,
): void {
  if (!enabled || ctx.model?.api !== 'anthropic-messages' || !getModelEligibility(ctx).supported)
    return;
  const key =
    Object.keys(headers).find((name) => name.toLowerCase() === 'anthropic-beta') ??
    'anthropic-beta';
  const existing = headers[key];
  const tokens =
    typeof existing === 'string'
      ? existing
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean)
      : [];
  const required = ctx.modelRegistry.isUsingOAuth(ctx.model)
    ? [...OAUTH_BETAS, FAST_BETA]
    : [FAST_BETA];
  headers[key] = [...new Set([...tokens, ...required])].join(',');
}
