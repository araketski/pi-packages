import { describe, expect, it } from 'vitest';
import {
  applyFastHeaders,
  getModelEligibility,
  getFastPayload,
  type FastContext,
  type FastModel,
} from '../extensions/fast-mode/src/request.ts';

function context(model?: FastModel, oauth = false): FastContext {
  return { model, modelRegistry: { isUsingOAuth: () => oauth } };
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

describe('request eligibility and injection', () => {
  it.each(claude)('adds Claude fast speed and beta for %s', (id) => {
    const model = { provider: 'anthropic', api: 'anthropic-messages', id };
    const ctx = context(model);
    const payload = { model: id, messages: [] };
    const headers: Record<string, string | null> = {};
    expect(getModelEligibility(ctx).supported).toBe(true);
    expect(getFastPayload(payload, ctx, true)).toEqual({ ...payload, speed: 'fast' });
    expect(payload).toEqual({ model: id, messages: [] });
    applyFastHeaders(headers, ctx, true);
    expect(headers).toEqual({ 'anthropic-beta': 'fast-mode-2026-02-01' });
  });

  it.each(openai)('adds priority for OpenAI Responses model %s', (id) => {
    const ctx = context({ provider: 'proxy', api: 'openai-responses', id });
    expect(getFastPayload({ model: id }, ctx, true)).toEqual({
      model: id,
      service_tier: 'priority',
    });
  });

  it.each(openai)('requires OAuth for Codex Responses model %s', (id) => {
    const model = { provider: 'openai-codex', api: 'openai-codex-responses', id };
    expect(getModelEligibility(context(model)).supported).toBe(false);
    expect(getFastPayload({ model: id }, context(model), true)).toBeUndefined();
    expect(getFastPayload({ model: id }, context(model, true), true)).toEqual({
      model: id,
      service_tier: 'priority',
    });
  });

  it('matches proxy-prefixed IDs on the wire API, but requires the exact original payload model', () => {
    const ctx = context({
      provider: 'litellm',
      api: 'anthropic-messages',
      id: 'anthropic/claude-opus-5',
    });
    expect(getFastPayload({ model: 'anthropic/claude-opus-5' }, ctx, true)).toEqual({
      model: 'anthropic/claude-opus-5',
      speed: 'fast',
    });
    expect(getFastPayload({ model: 'claude-opus-5' }, ctx, true)).toBeUndefined();
    const openaiCtx = context({
      provider: 'litellm',
      api: 'openai-responses',
      id: 'openai/gpt-6-sol',
    });
    expect(getFastPayload({ model: 'openai/gpt-6-sol' }, openaiCtx, true)).toEqual({
      model: 'openai/gpt-6-sol',
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
    const headers: Record<string, string | null> = {};
    expect(getModelEligibility(ctx).supported).toBe(false);
    expect(getFastPayload({ model: id }, ctx, true)).toBeUndefined();
    applyFastHeaders(headers, ctx, true);
    expect(headers).toEqual({});
  });

  it('does not inject with no selected model or into disabled, invalid, or already configured payloads', () => {
    const ctx = context({ provider: 'anthropic', api: 'anthropic-messages', id: 'claude-opus-5' });
    expect(getModelEligibility(context()).supported).toBe(false);
    expect(getFastPayload({ model: 'claude-opus-5' }, context(), true)).toBeUndefined();
    expect(getFastPayload({ model: 'claude-opus-5' }, ctx, false)).toBeUndefined();
    for (const payload of [null, [], 'text', 5, { model: 'claude-opus-5', speed: null }]) {
      expect(getFastPayload(payload, ctx, true)).toBeUndefined();
    }
    const openaiCtx = context({ provider: 'openai', api: 'openai-responses', id: 'gpt-5.4' });
    expect(
      getFastPayload({ model: 'gpt-5.4', service_tier: 'default' }, openaiCtx, true),
    ).toBeUndefined();
    const headers: Record<string, string | null> = {
      'anthropic-beta': 'existing,fast-mode-2026-02-01',
    };
    applyFastHeaders(headers, ctx, false);
    expect(headers['anthropic-beta']).toBe('existing,fast-mode-2026-02-01');
  });

  it('merges outgoing Claude OAuth betas without mutating model headers or duplicating tokens', () => {
    const model: FastModel = {
      provider: 'proxy',
      api: 'anthropic-messages',
      id: 'anthropic/claude-opus-5-5',
      headers: { 'anthropic-beta': 'original' },
    };
    const ctx = context(model, true);
    const headers: Record<string, string | null> = {
      'Anthropic-Beta': 'user, fast-mode-2026-02-01,user',
    };
    applyFastHeaders(headers, ctx, true);
    applyFastHeaders(headers, ctx, true);
    expect(headers).toEqual({
      'Anthropic-Beta': 'user,fast-mode-2026-02-01,claude-code-20250219,oauth-2025-04-20',
    });
    expect(model.headers).toEqual({ 'anthropic-beta': 'original' });
  });
});
