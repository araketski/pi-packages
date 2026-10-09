import { expect, test } from 'vitest';
import {
  createFastModeState,
  getCurrentModelStatus,
  getFastPayload,
  getStatusView,
  restoreFastModeState,
  syncFeatureState,
  type FastContext,
  type FastModel,
} from '../src/core.ts';

function context(model?: FastModel, oauth = false): FastContext {
  return {
    model,
    modelRegistry: {
      isUsingOAuth: () => oauth,
    },
  };
}

test('unsupported current model keeps fast enabled but inactive', () => {
  const ctx = context({
    provider: 'anthropic',
    api: 'anthropic-messages',
    id: 'claude-sonnet-4-5',
  });
  const state = createFastModeState(true);
  const modelStatus = syncFeatureState(ctx, state);

  expect(modelStatus.isSupported).toBe(false);
  expect(getFastPayload({ model: 'claude-sonnet-4-5' }, ctx, state, modelStatus)).toBe(undefined);
  expect(getStatusView(state, modelStatus)).toEqual({
    text: 'no fast',
    color: 'warning',
    state: 'unsupported',
    fallbackColor: 'warning',
  });
});

test('restores fast mode from latest session custom entry', () => {
  const state = restoreFastModeState(
    [
      { type: 'custom', customType: 'fast', data: { enabled: true } },
      { type: 'custom', customType: 'other', data: { enabled: false } },
      { type: 'custom', customType: 'fast', data: { enabled: false } },
    ],
    true,
  );

  expect(state.enabled).toBe(false);
});

test('uses launch default when session has no fast mode entry', () => {
  const state = restoreFastModeState([], true);

  expect(state.enabled).toBe(true);
});

test('status is muted when off and accent when enabled for a supported model', () => {
  const ctx = context({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-4-6' });
  const state = createFastModeState(false);
  const modelStatus = getCurrentModelStatus(ctx);

  expect(getStatusView(state, modelStatus)).toEqual({
    text: 'fast off',
    color: 'muted',
    state: 'off',
    fallbackColor: 'muted',
  });

  state.enabled = true;
  expect(getStatusView(state, modelStatus)).toEqual({
    text: 'fast on',
    color: 'accent',
    state: 'on',
    fallbackColor: 'accent',
  });
});

test('Claude fast mode appends its beta to the provider-computed betas', () => {
  const ctx = context({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5-5' });
  const state = createFastModeState(true);
  const modelStatus = syncFeatureState(ctx, state);
  const betas = ['mid-conversation-output-config-2026-07-01', 'fast-mode-2026-02-01'];

  expect(getFastPayload({ model: 'claude-opus-5-5', betas }, ctx, state, modelStatus)).toEqual({
    model: 'claude-opus-5-5',
    speed: 'fast',
    betas: ['mid-conversation-output-config-2026-07-01', 'fast-mode-2026-02-01'],
  });
  expect(
    getFastPayload({ model: 'claude-opus-5-5', betas: betas.slice(0, 1) }, ctx, state, modelStatus)
      ?.betas,
  ).toEqual(betas);
});

test('Claude fast mode preserves existing speed and does not replace payload', () => {
  const ctx = context({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-4-6' });
  const state = createFastModeState(true);
  const modelStatus = syncFeatureState(ctx, state);

  expect(
    getFastPayload({ model: 'claude-opus-4-6', speed: 'standard' }, ctx, state, modelStatus),
  ).toBe(undefined);
});

test.each(['gpt-5.4', 'gpt-5.5', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra'])(
  'OpenAI fast mode supports upstream priority tier for %s',
  (modelId) => {
    const model: FastModel = {
      provider: 'openai-codex',
      api: 'openai-codex-responses',
      id: modelId,
    };
    const ctx = context(model, true);
    const state = createFastModeState(true);
    const modelStatus = syncFeatureState(ctx, state);

    expect(modelStatus.isSupported).toBe(true);
    expect(getFastPayload({ model: modelId }, ctx, state, modelStatus)).toEqual({
      model: modelId,
      service_tier: 'priority',
    });
  },
);

test.each(['gpt-5.3-codex-spark', 'gpt-5.4-mini'])(
  'OpenAI model without an upstream priority tier stays unsupported: %s',
  (modelId) => {
    const model: FastModel = {
      provider: 'openai-codex',
      api: 'openai-codex-responses',
      id: modelId,
    };
    const ctx = context(model, true);
    const state = createFastModeState(true);
    const modelStatus = syncFeatureState(ctx, state);

    expect(modelStatus.isSupported).toBe(false);
    expect(getFastPayload({ model: modelId }, ctx, state, modelStatus)).toBe(undefined);
  },
);

test('OpenAI fast mode requires OAuth', () => {
  const model: FastModel = {
    provider: 'openai-codex',
    api: 'openai-codex-responses',
    id: 'gpt-5.4',
  };
  const state = createFastModeState(true);
  const apiKeyContext = context(model, false);
  const oauthContext = context(model, true);

  const apiKeyStatus = syncFeatureState(apiKeyContext, state);
  expect(apiKeyStatus.isSupported).toBe(false);
  expect(getFastPayload({ model: 'gpt-5.4' }, apiKeyContext, state, apiKeyStatus)).toBe(undefined);

  const oauthStatus = syncFeatureState(oauthContext, state);
  expect(oauthStatus.isSupported).toBe(true);
  expect(getFastPayload({ model: 'gpt-5.4' }, oauthContext, state, oauthStatus)).toEqual({
    model: 'gpt-5.4',
    service_tier: 'priority',
  });
});

test('OpenAI fast mode preserves existing service tier', () => {
  const ctx = context(
    { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-5.5' },
    true,
  );
  const state = createFastModeState(true);
  const modelStatus = syncFeatureState(ctx, state);

  expect(
    getFastPayload({ model: 'gpt-5.5', service_tier: 'default' }, ctx, state, modelStatus),
  ).toBe(undefined);
});

test.each([
  ['anthropic', 'claude-opus-5-5'],
  ['anthropic', 'claude-opus-5'],
  ['litellm', 'anthropic/claude-opus-5-5'],
])('Claude fast mode supports %s/%s with speed and beta', (provider, modelId) => {
  const ctx = context({ provider, api: 'anthropic-messages', id: modelId });
  const state = createFastModeState(true);
  const modelStatus = syncFeatureState(ctx, state);

  expect(modelStatus.isSupported).toBe(true);
  expect(getFastPayload({ model: modelId }, ctx, state, modelStatus)).toEqual({
    model: modelId,
    speed: 'fast',
    betas: ['fast-mode-2026-02-01'],
  });
});

test('LiteLLM Claude model without upstream fast mode stays unsupported', () => {
  const ctx = context({
    provider: 'litellm',
    api: 'anthropic-messages',
    id: 'anthropic/claude-sonnet-5',
  });
  const state = createFastModeState(true);
  const modelStatus = syncFeatureState(ctx, state);

  expect(modelStatus.isSupported).toBe(false);
  expect(getFastPayload({ model: 'anthropic/claude-sonnet-5' }, ctx, state, modelStatus)).toBe(
    undefined,
  );
});

test.each(['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'])(
  'OpenAI Codex fast mode supports %s with OAuth',
  (modelId) => {
    const ctx = context(
      { provider: 'openai-codex', api: 'openai-codex-responses', id: modelId },
      true,
    );
    const state = createFastModeState(true);
    const modelStatus = syncFeatureState(ctx, state);

    expect(getFastPayload({ model: modelId }, ctx, state, modelStatus)).toEqual({
      model: modelId,
      service_tier: 'priority',
    });
  },
);

test.each(['openai/gpt-6-luna', 'openai/gpt-5.6-terra'])(
  'OpenAI Responses fast mode supports API-key LiteLLM model %s',
  (modelId) => {
    const ctx = context(
      { provider: 'litellm-openai', api: 'openai-responses', id: modelId },
      false,
    );
    const state = createFastModeState(true);
    const modelStatus = syncFeatureState(ctx, state);

    expect(getFastPayload({ model: modelId }, ctx, state, modelStatus)).toEqual({
      model: modelId,
      service_tier: 'priority',
    });
  },
);

test('Claude Opus 4.7 stays unsupported because the API rejects fast mode', () => {
  const ctx = context({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-4-7' });
  const state = createFastModeState(true);
  const modelStatus = syncFeatureState(ctx, state);

  expect(modelStatus.isSupported).toBe(false);
  expect(getFastPayload({ model: 'claude-opus-4-7' }, ctx, state, modelStatus)).toBe(undefined);
});
