export type FastModel = {
  provider: string;
  api?: string;
  id: string;
  headers?: Record<string, string>;
};

/** Selected direct model and configured authentication; not routed request identity. */
export type FastSelection = {
  model: FastModel;
  oauth: boolean;
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

export function getModelEligibility(ctx: FastSelection | undefined): Eligibility {
  const model = ctx?.model;
  if (!model)
    return {
      supported: false,
      reason: 'No model is selected',
    };
  if (typeof ctx?.oauth !== 'boolean') {
    return { supported: false, reason: 'Selected model authentication is unavailable' };
  }
  const id = model.id.replace(/^(?:anthropic|openai)\//u, '');
  if (model.api === 'anthropic-messages' && CLAUDE_MODELS.has(id)) {
    return { supported: true, option: 'speed' };
  }
  if (
    (model.api === 'openai-responses' || model.api === 'openai-codex-responses') &&
    OPENAI_MODELS.has(id)
  ) {
    if (model.api === 'openai-codex-responses' && ctx?.oauth !== true) {
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
  ctx: FastSelection | undefined,
  enabled: boolean,
): Record<string, unknown> | undefined {
  if (!enabled || !isRecord(payload)) return undefined;
  const eligibility = getModelEligibility(ctx);
  if (!eligibility.supported || !eligibility.option || payload.model !== ctx?.model.id)
    return undefined;
  // Reject incompatible/ambiguous envelopes, including a same-ID Completions
  // request after another extension changes selection to Responses in flight.
  if (eligibility.option === 'service_tier') {
    if (!Array.isArray(payload.input) || 'messages' in payload) return undefined;
  } else if (!Array.isArray(payload.messages) || 'input' in payload) {
    return undefined;
  }
  if (eligibility.option === 'speed') {
    // Pi computes its native beta list before this hook. Changing headers earlier
    // makes Pi treat them as an override and drops required catalog feature betas.
    const existing = payload.betas;
    if (
      existing !== undefined &&
      (!Array.isArray(existing) || !existing.every((value) => typeof value === 'string'))
    ) {
      return undefined;
    }
    const tokens = (existing ?? []).map((token: string) => token.trim()).filter(Boolean);
    const required = ctx?.oauth ? [...OAUTH_BETAS, FAST_BETA] : [FAST_BETA];
    return {
      ...payload,
      ...('speed' in payload ? {} : { speed: 'fast' }),
      // The native Anthropic SDK serializes betas to the HTTP header, not the body.
      betas: [...new Set([...tokens, ...required])],
    };
  }
  if (eligibility.option in payload) return undefined;
  return { ...payload, service_tier: 'priority' };
}
