import { describe, expect, it } from 'vitest';
import {
  SessionManager,
  type ExtensionContext,
  type SessionMessageEntry,
} from '@earendil-works/pi-coding-agent';
import { collectCore } from '../extensions/statusline/src/builtins/core.js';

type Assistant = Extract<SessionMessageEntry['message'], { role: 'assistant' }>;
function assistant(
  model = 'physical',
  provider = 'host',
  extra: Partial<Assistant> = {},
): Assistant {
  return {
    role: 'assistant',
    content: [],
    api: 'openai-responses',
    provider,
    model,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
    ...extra,
  };
}
function fixture(id = 'auto', provider = 'router') {
  const manager = SessionManager.inMemory('/tmp');
  const ctx = { model: { id, provider }, sessionManager: manager } as unknown as ExtensionContext;
  const text = () => {
    const items = new Map();
    collectCore(items, new Set(['model']), ctx, {} as never);
    return items.get('model')?.text;
  };
  return { manager, ctx, text };
}

// @mara checks REQ-STATUSLINE-BUILTINS
// @mara checks DES-STATUSLINE-BUILTIN-VALUES
describe('selected and observed request identity', () => {
  it('shows the latest observed route, not the next route or private router state', () => {
    const f = fixture();
    f.manager.appendModelChange('router', 'auto');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    expect(f.text()).toBe('auto');
    f.manager.appendCustomEntry('pi.virtual-model-state', {
      modelId: 'future',
      state: { model: 'future' },
    });
    expect(f.text()).toBe('auto');
    f.manager.appendMessage(assistant());
    expect(f.text()).toBe('auto → physical');
    f.manager.appendMessage(assistant('second'));
    expect(f.text()).toBe('auto → second');
    f.manager.appendMessage({ role: 'user', content: 'next request', timestamp: Date.now() });
    expect(f.text()).toBe('auto → second');
  });

  it('invalidates at each selection boundary, including switching away and back', () => {
    const f = fixture();
    f.manager.appendModelChange('router', 'auto');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    f.manager.appendMessage(assistant());
    expect(f.text()).toBe('auto → physical');
    f.ctx.model = { id: 'other', provider: 'router' } as never;
    expect(f.text()).toBe('other');
    f.manager.appendModelChange('router', 'other');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    f.manager.appendMessage(assistant('other-physical'));
    expect(f.text()).toBe('other → other-physical');
    f.ctx.model = { id: 'auto', provider: 'router' } as never;
    f.manager.appendModelChange('router', 'auto');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    expect(f.text()).toBe('auto');
    f.manager.appendMessage(assistant('fresh'));
    expect(f.text()).toBe('auto → fresh');
  });

  it('does not attribute restored ambiguous or mismatched selections', () => {
    const f = fixture();
    f.manager.appendMessage(assistant());
    expect(f.text()).toBe('auto');
    f.manager.appendModelChange('different-router', 'auto');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    f.manager.appendMessage(assistant());
    expect(f.text()).toBe('auto');
    f.ctx.model = undefined;
    expect(f.text()).toBe('unknown');
  });

  it('collapses identical identities but disambiguates equal IDs on different providers', () => {
    const f = fixture('same', 'host');
    f.manager.appendModelChange('host', 'same');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    f.manager.appendMessage(assistant('same'));
    expect(f.text()).toBe('same');
    f.manager.appendMessage(assistant('same', 'other-host'));
    expect(f.text()).toBe('host/same → other-host/same');
  });

  it.each([
    { model: '' },
    { provider: '' },
    { stopReason: 'pending' },
    { stopReason: 'error' },
    { stopReason: 'aborted' },
    { stopReason: 'deferred' },
  ] as Partial<Assistant>[])(
    'does not reuse an older identity after unavailable evidence %j',
    (extra) => {
      const f = fixture();
      f.manager.appendModelChange('router', 'auto');
      f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
      f.manager.appendMessage(assistant());
      f.manager.appendMessage(assistant('new', 'host', extra));
      expect(f.text()).toBe('auto');
    },
  );

  it('derives branch history afresh on navigation without reading abandoned entries', () => {
    const f = fixture();
    const selection = f.manager.appendModelChange('router', 'auto');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    const first = f.manager.appendMessage(assistant('first'));
    f.manager.appendMessage(assistant('abandoned'));
    expect(f.text()).toBe('auto → abandoned');
    f.manager.branch(first);
    expect(f.text()).toBe('auto → first');
    f.manager.branch(selection);
    expect(f.text()).toBe('auto');
    f.manager.appendMessage({ role: 'user', content: 'New branch request', timestamp: 1 });
    f.manager.appendMessage(assistant('new-branch'));
    expect(f.text()).toBe('auto → new-branch');
  });

  it('drops observations omitted from current context instead of reviving older responses', () => {
    const f = fixture();
    f.manager.appendModelChange('router', 'auto');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    const first = f.manager.appendMessage(assistant('first'));
    const last = f.manager.appendMessage(assistant('last'));
    f.manager.appendContextEdit(last, null);
    expect(f.text()).toBe('auto');
    f.manager.branch(last);
    expect(f.text()).toBe('auto → last');
    f.manager.appendCompaction('summary', first, 100);
    expect(f.text()).toBe('auto → last');
    f.manager.appendCompaction('retain none', null, 100);
    expect(f.text()).toBe('auto');
  });

  it('reads restored history and never carries evidence to another session manager', () => {
    const f = fixture();
    f.manager.appendModelChange('router', 'auto');
    f.manager.appendMessage({ role: 'user', content: 'Synthetic request', timestamp: 1 });
    f.manager.appendMessage(assistant('restored'));
    expect(f.text()).toBe('auto → restored');
    const restored = SessionManager.inMemory('/tmp', undefined, [
      f.manager.getHeader()!,
      ...f.manager.getEntries(),
    ]);
    f.ctx.sessionManager = restored;
    expect(f.text()).toBe('auto → restored');
    f.ctx.sessionManager = SessionManager.inMemory('/tmp');
    expect(f.text()).toBe('auto');
  });

  it('does not treat post-selection completion order as dispatch association', () => {
    const f = fixture();
    f.manager.appendModelChange('router', 'old');
    f.manager.appendMessage({ role: 'user', content: 'Old request', timestamp: 1 });
    f.manager.appendModelChange('router', 'auto');
    f.manager.appendMessage(assistant('old-route'));
    expect(f.text()).toBe('auto');
    // A fresh native user run establishes a usable interval for new responses.
    f.manager.appendMessage({ role: 'user', content: 'Fresh request', timestamp: 1 });
    f.manager.appendMessage(assistant('fresh-route'));
    expect(f.text()).toBe('auto → fresh-route');
  });

  it('omits custom-message-only and mid-continuation selection attribution', () => {
    const f = fixture();
    f.manager.appendModelChange('router', 'auto');
    f.manager.appendCustomMessageEntry('extension-run', 'Continue', true);
    f.manager.appendMessage(assistant());
    expect(f.text()).toBe('auto');
  });

  it('does not read model history when the model token is absent', () => {
    collectCore(new Map(), new Set(), {} as never, {} as never);
  });
});
