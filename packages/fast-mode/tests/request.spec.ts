import { describe, expect, it } from 'vitest';
import {
  getModelEligibility,
  getFastPayload,
  type FastSelection,
  type FastModel,
} from '../extensions/fast-mode/src/request.ts';

// Compatibility inputs from the selected direct model, not routed identity.
function context(model?: FastModel, oauth = false): FastSelection | undefined {
  return model ? { model, oauth } : undefined;
}

const claude = ['claude-opus-4-6', 'claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5'];
const openai = [
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
];

describe('selected-model compatibility and outgoing request transformations', () => {
  it('preserves native Claude betas while adding fast service at the payload boundary', () => {
    const ctx = context(
      { provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5' },
      true,
    );
    const payload = { model: 'claude-opus-5', messages: [], betas: ['native-required', 'user'] };
    expect(getFastPayload(payload, ctx, true)).toEqual({
      ...payload,
      speed: 'fast',
      betas: [
        'native-required',
        'user',
        'claude-code-20250219',
        'oauth-2025-04-20',
        'fast-mode-2026-02-01',
      ],
    });
    expect(payload.betas).toEqual(['native-required', 'user']);
  });

  it('rejects incompatible or ambiguous payload shapes even with a matching selected ID', () => {
    const responses = context({ provider: 'openai', api: 'openai-responses', id: 'gpt-5.4' });
    for (const body of [{ messages: [] }, {}, { input: 'text' }, { input: [], messages: [] }]) {
      expect(getFastPayload({ model: 'gpt-5.4', ...body }, responses, true)).toBeUndefined();
    }
    const anthropic = context({
      provider: 'anthropic',
      api: 'anthropic-messages',
      id: 'claude-opus-5',
    });
    for (const body of [{ input: [] }, {}, { messages: 'text' }, { input: [], messages: [] }]) {
      expect(getFastPayload({ model: 'claude-opus-5', ...body }, anthropic, true)).toBeUndefined();
    }
  });

  it('rejects unavailable request authentication even with an allowlisted model', () => {
    const ctx = {
      model: { provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5' },
    } as FastSelection;
    expect(getModelEligibility(ctx).supported).toBe(false);
    expect(getFastPayload({ model: 'claude-opus-5' }, ctx, true)).toBeUndefined();
  });
  it.each(claude)('adds Claude fast speed and beta for %s', (id) => {
    const model = { provider: 'anthropic', api: 'anthropic-messages', id };
    const ctx = context(model);
    const payload = { model: id, messages: [] };
    expect(getModelEligibility(ctx).supported).toBe(true);
    expect(getFastPayload(payload, ctx, true)).toEqual({
      ...payload,
      speed: 'fast',
      betas: ['fast-mode-2026-02-01'],
    });
    expect(payload).toEqual({ model: id, messages: [] });
  });

  it.each(openai)('adds priority for OpenAI Responses model %s', (id) => {
    const ctx = context({ provider: 'proxy', api: 'openai-responses', id });
    expect(getFastPayload({ model: id, input: [] }, ctx, true)).toEqual({
      model: id,
      input: [],
      service_tier: 'priority',
    });
  });

  it.each(openai)('requires OAuth for Codex Responses model %s', (id) => {
    const model = { provider: 'openai-codex', api: 'openai-codex-responses', id };
    expect(getModelEligibility(context(model)).supported).toBe(false);
    expect(getFastPayload({ model: id, input: [] }, context(model), true)).toBeUndefined();
    expect(getFastPayload({ model: id, input: [] }, context(model, true), true)).toEqual({
      model: id,
      input: [],
      service_tier: 'priority',
    });
  });

  it('matches proxy-prefixed IDs on the wire API, but requires the exact original payload model', () => {
    const ctx = context({
      provider: 'litellm',
      api: 'anthropic-messages',
      id: 'anthropic/claude-opus-5',
    });
    expect(getFastPayload({ model: 'anthropic/claude-opus-5', messages: [] }, ctx, true)).toEqual({
      model: 'anthropic/claude-opus-5',
      messages: [],
      speed: 'fast',
      betas: ['fast-mode-2026-02-01'],
    });
    expect(getFastPayload({ model: 'claude-opus-5', messages: [] }, ctx, true)).toBeUndefined();
    const openaiCtx = context({
      provider: 'litellm',
      api: 'openai-responses',
      id: 'openai/gpt-6-sol',
    });
    expect(getFastPayload({ model: 'openai/gpt-6-sol', input: [] }, openaiCtx, true)).toEqual({
      model: 'openai/gpt-6-sol',
      input: [],
      service_tier: 'priority',
    });
  });

  it.each([
    ['anthropic-messages', 'claude-opus-4-7'],
    ['anthropic-messages', 'claude-sonnet-5'],
    ['openai-responses', 'gpt-5.4-mini'],
    ['openai-codex-responses', 'gpt-5.3-codex-spark'],
    ['other', 'claude-opus-5'],
  ])('does not inject for unsupported %s/%s', (api, id) => {
    const ctx = context({ provider: 'proxy', api, id }, true);
    expect(getModelEligibility(ctx).supported).toBe(false);
    expect(getFastPayload({ model: id, messages: [], betas: ['user'] }, ctx, true)).toBeUndefined();
  });

  it('does not inject with no selected model or into disabled, invalid, or already configured payloads', () => {
    const ctx = context({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5' });
    expect(getModelEligibility(context()).supported).toBe(false);
    expect(getFastPayload({ model: 'claude-opus-5' }, context(), true)).toBeUndefined();
    expect(getFastPayload({ model: 'claude-opus-5' }, ctx, false)).toBeUndefined();
    for (const payload of [
      null,
      [],
      'text',
      5,
      { model: 'claude-opus-5', messages: [], betas: null },
      { model: 'claude-opus-5', messages: [], betas: [42] },
    ]) {
      expect(getFastPayload(payload, ctx, true)).toBeUndefined();
    }
    const openaiCtx = context({ provider: 'openai', api: 'openai-responses', id: 'gpt-5.4' });
    expect(
      getFastPayload({ model: 'gpt-5.4', input: [], service_tier: 'default' }, openaiCtx, true),
    ).toBeUndefined();
    expect(
      getFastPayload({ model: 'claude-opus-5', messages: [], speed: null }, ctx, true),
    ).toEqual({
      model: 'claude-opus-5',
      messages: [],
      speed: null,
      betas: ['fast-mode-2026-02-01'],
    });
  });

  it('merges native and authored Claude betas without mutating model headers or the original payload', () => {
    const model: FastModel = {
      provider: 'proxy',
      api: 'anthropic-messages',
      id: 'anthropic/claude-opus-5-5',
      headers: { 'Anthropic-Beta': 'original' },
    };
    const ctx = context(model, true);
    const payload = {
      model: model.id,
      messages: [],
      speed: 'user-value',
      betas: ['native', 'user', ' fast-mode-2026-02-01', 'user'],
    };
    const expected = {
      ...payload,
      betas: ['native', 'user', 'fast-mode-2026-02-01', 'claude-code-20250219', 'oauth-2025-04-20'],
    };
    expect(getFastPayload(payload, ctx, true)).toEqual(expected);
    expect(getFastPayload(expected, ctx, true)).toEqual(expected);
    expect(getFastPayload(payload, ctx, false)).toBeUndefined();
    expect(payload.betas).toEqual(['native', 'user', ' fast-mode-2026-02-01', 'user']);
    expect(model.headers).toEqual({ 'Anthropic-Beta': 'original' });
  });
});
