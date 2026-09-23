import type { StatuslineStatus } from '@aliaksei-raketski/pi-statusline-protocol';

export const FAST_COMMAND = 'fast';
export const FAST_FLAG = 'fast';
export const FAST_STATUS_KEY = 'fast';
export const FAST_STATE_CUSTOM_TYPE = 'fast';

export const FAST_ON_TEXT = 'fast on';
export const FAST_OFF_TEXT = 'fast off';
export const FAST_UNSUPPORTED_TEXT = 'no fast';

const FAST_SPEED = 'fast';
const FAST_BETA = 'fast-mode-2026-02-01';
const CLAUDE_CODE_OAUTH_BETAS = ['claude-code-20250219', 'oauth-2025-04-20'];
const FAST_SERVICE_TIER = 'priority';

// Features match on the model's wire API, so proxies such as LiteLLM that speak
// the same API (with `anthropic/` or `openai/` model-id prefixes) are covered.
const CLAUDE_API = 'anthropic-messages';
const OPENAI_CODEX_API = 'openai-codex-responses';
const OPENAI_RESPONSES_API = 'openai-responses';

const CLAUDE_FAST_MODELS = new Set([
  'claude-opus-4-6',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-opus-5-5',
]);
const OPENAI_FAST_MODELS = new Set([
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
]);
const CLAUDE_UNSUPPORTED_MESSAGE =
  'Fast mode is only available for Claude Opus 4.6, 4.8, 5, and 5.5';
const OPENAI_UNSUPPORTED_MESSAGE =
  'Fast mode is only available for GPT-5.4, GPT-5.5, GPT-5.6 Luna/Sol/Terra, and GPT-6 Astra/Sol/Luna';

export type FastModel = {
  provider: string;
  api?: string;
  id: string;
  headers?: Record<string, string>;
};

export type FastContext = {
  model?: FastModel;
  modelRegistry: {
    isUsingOAuth(model: FastModel): boolean;
  };
};

export type FastFeature = {
  api: string;
  supportedModels: Set<string>;
  injectionKey: string;
  injectionValue: string;
  unsupportedModelMessage: string;
  isEligible?: (ctx: FastContext) => string | undefined;
};

export type FastModeState = {
  enabled: boolean;
};

export type FastStatusState = 'on' | 'off' | 'unsupported';

export type FastStatusColor = 'accent' | 'muted' | 'warning';

export type FastStatusView = {
  text: string;
  color: FastStatusColor;
  state: FastStatusState;
  fallbackColor: FastStatusColor;
};

export type FastStatusPayload = Omit<StatuslineStatus, 'key'> & {
  state: FastStatusState;
  fallbackColor: FastStatusColor;
};

export type FastStatusEntryData = {
  enabled: boolean;
};

export type FastSessionEntry = {
  type: string;
  customType?: string;
  data?: unknown;
};

export type CurrentModelStatus = {
  feature?: FastFeature;
  isSupported: boolean;
  reason?: string;
};

export type FastStateEntryData = {
  enabled: boolean;
};

function isPayloadRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}

export function createFastModeState(enabled = false): FastModeState {
  return { enabled };
}

export function createFastStateEntryData(state: FastModeState): FastStateEntryData {
  return { enabled: state.enabled };
}

export function restoreFastModeState(
  entries: Iterable<FastSessionEntry>,
  defaultEnabled = false,
): FastModeState {
  let enabled = defaultEnabled;

  for (const entry of entries) {
    if (entry.type !== 'custom' || entry.customType !== FAST_STATE_CUSTOM_TYPE) continue;
    if (!isPayloadRecord(entry.data) || typeof entry.data.enabled !== 'boolean') continue;
    enabled = entry.data.enabled;
  }

  return createFastModeState(enabled);
}

export function getStatusPayload(
  state: FastModeState,
  modelStatus: CurrentModelStatus,
): FastStatusPayload {
  if (!state.enabled) {
    return {
      text: FAST_OFF_TEXT,
      state: 'off',
      fallbackColor: 'muted',
    };
  }

  if (!modelStatus.isSupported) {
    return {
      text: FAST_UNSUPPORTED_TEXT,
      state: 'unsupported',
      fallbackColor: 'warning',
    };
  }

  return {
    text: FAST_ON_TEXT,
    state: 'on',
    fallbackColor: 'accent',
  };
}

export function getStatusView(
  state: FastModeState,
  modelStatus: CurrentModelStatus,
): FastStatusView {
  const payload = getStatusPayload(state, modelStatus);
  return {
    text: payload.text,
    state: payload.state,
    fallbackColor: payload.fallbackColor,
    color: payload.fallbackColor,
  };
}

export function getCurrentModelStatus(ctx: FastContext): CurrentModelStatus {
  const model = ctx.model;
  if (!model) {
    return {
      isSupported: false,
      reason: 'No model is selected',
    };
  }

  const modelKey = `${model.provider}/${model.id}`;
  const featuresForBackend = FEATURES.filter((feature) => feature.api === model.api);

  if (featuresForBackend.length === 0) {
    return {
      isSupported: false,
      reason: `Current model (${modelKey}) does not support fast mode`,
    };
  }

  const matchingFeature = featuresForBackend.find((feature) =>
    feature.supportedModels.has(model.id.replace(/^(?:anthropic|openai)\//u, '')),
  );
  if (!matchingFeature) {
    return {
      feature: featuresForBackend[0],
      isSupported: false,
      reason:
        featuresForBackend[0]?.unsupportedModelMessage ??
        'Current model does not support fast mode',
    };
  }

  if (matchingFeature.isEligible) {
    const reason = matchingFeature.isEligible(ctx);
    if (reason) {
      return {
        feature: matchingFeature,
        isSupported: false,
        reason,
      };
    }
  }

  return {
    feature: matchingFeature,
    isSupported: true,
  };
}

export function syncFeatureState(ctx: FastContext, state: FastModeState): CurrentModelStatus {
  void state;
  return getCurrentModelStatus(ctx);
}

export function applyFastModeHeaders(
  headers: Record<string, string | null>,
  ctx: FastContext,
  state: FastModeState,
  modelStatus = getCurrentModelStatus(ctx),
): void {
  const model = ctx.model;
  const shouldEnable =
    model?.api === CLAUDE_API &&
    state.enabled &&
    modelStatus.isSupported &&
    modelStatus.feature?.api === CLAUDE_API;
  if (!shouldEnable || !model) return;

  const headerKey =
    Object.keys(headers).find((key) => key.toLowerCase() === 'anthropic-beta') ?? 'anthropic-beta';
  const existingValue = headers[headerKey];
  const existing = splitBetaHeader(typeof existingValue === 'string' ? existingValue : '');
  const requiredBase = ctx.modelRegistry.isUsingOAuth(model) ? CLAUDE_CODE_OAUTH_BETAS : [];
  headers[headerKey] = Array.from(new Set([...existing, ...requiredBase, FAST_BETA])).join(',');
}

export function getFastPayload(
  payload: unknown,
  ctx: FastContext,
  state: FastModeState,
  modelStatus: CurrentModelStatus,
): Record<string, unknown> | undefined {
  if (!state.enabled) return undefined;
  if (!modelStatus.isSupported || !modelStatus.feature) return undefined;
  if (!isPayloadRecord(payload)) return undefined;
  if (payload.model !== ctx.model?.id) return undefined;
  if (modelStatus.feature.injectionKey in payload) return undefined;

  return {
    ...payload,
    [modelStatus.feature.injectionKey]: modelStatus.feature.injectionValue,
  };
}

const FAST_FEATURES: readonly FastFeature[] = [
  {
    api: CLAUDE_API,
    supportedModels: CLAUDE_FAST_MODELS,
    injectionKey: 'speed',
    injectionValue: FAST_SPEED,
    unsupportedModelMessage: CLAUDE_UNSUPPORTED_MESSAGE,
  },
  {
    api: OPENAI_RESPONSES_API,
    supportedModels: OPENAI_FAST_MODELS,
    injectionKey: 'service_tier',
    injectionValue: FAST_SERVICE_TIER,
    unsupportedModelMessage: OPENAI_UNSUPPORTED_MESSAGE,
  },
  {
    api: OPENAI_CODEX_API,
    supportedModels: OPENAI_FAST_MODELS,
    injectionKey: 'service_tier',
    injectionValue: FAST_SERVICE_TIER,
    unsupportedModelMessage: OPENAI_UNSUPPORTED_MESSAGE,
    isEligible: (ctx) =>
      ctx.model && ctx.modelRegistry.isUsingOAuth(ctx.model)
        ? undefined
        : 'ChatGPT OAuth auth is required; API-key auth is intentionally not used',
  },
];

function splitBetaHeader(value: string): string[] {
  return (value ?? '')
    .split(',')
    .map((current) => current.trim())
    .filter(Boolean);
}

export const FEATURES = FAST_FEATURES;
