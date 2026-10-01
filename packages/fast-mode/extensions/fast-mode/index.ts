import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerStatus, type StatusHandle } from '@araketski/pi-statusline-protocol';
import { applyFastHeaders, getFastPayload, getModelEligibility } from './src/request.ts';
import { restoreFastState, type FastState } from './src/session.ts';

// Restore the supported direct-selection path. This is a compatibility hint,
// not an immutable physical request identity or evidence of a virtual route.
function selectedContext(ctx: ExtensionContext) {
  const model = ctx.model;
  if (!model) return undefined;
  const oauth =
    model.api === 'anthropic-messages' || model.api === 'openai-codex-responses'
      ? ctx.modelRegistry.isUsingOAuth(model)
      : false;
  return { model, oauth };
}

function hostEligibility(ctx: ExtensionContext) {
  return getModelEligibility(selectedContext(ctx));
}

export default function fastMode(pi: ExtensionAPI): void {
  const states = new WeakMap<object, FastState>();
  const statusHandles = new WeakMap<object, StatusHandle>();
  const state = (ctx: ExtensionContext) => {
    let current = states.get(ctx.sessionManager);
    if (!current) {
      current = { enabled: pi.getFlag('fast') === true };
      states.set(ctx.sessionManager, current);
    }
    return current;
  };
  const restore = (ctx: ExtensionContext) => {
    states.set(
      ctx.sessionManager,
      restoreFastState(ctx.sessionManager.getBranch(), pi.getFlag('fast') === true),
    );
  };
  const updateStatus = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const enabled = state(ctx).enabled;
    const supported = hostEligibility(ctx).supported;
    statusHandles
      .get(ctx.sessionManager)
      ?.update(
        !enabled
          ? { text: 'fast off', state: 'off' }
          : supported
            ? { text: 'fast on', state: 'on' }
            : { text: 'fast n/a', state: 'unsupported' },
      );
  };
  const announce = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const enabled = state(ctx).enabled;
    const eligibility = hostEligibility(ctx);
    ctx.ui.notify(
      `Fast mode is ${enabled ? 'on' : 'off'}${enabled && !eligibility.supported ? ` (unavailable: ${eligibility.reason})` : ''}.`,
      'info',
    );
  };
  const toggle = (ctx: ExtensionContext, value: boolean) => {
    const current = state(ctx);
    if (current.enabled === value) {
      announce(ctx);
      return;
    }
    current.enabled = value;
    pi.appendEntry('fast', { enabled: value });
    updateStatus(ctx);
    announce(ctx);
    if (value && !hostEligibility(ctx).supported && ctx.hasUI) {
      ctx.ui.notify(`${hostEligibility(ctx).reason}. Fast preference saved.`, 'warning');
    }
  };

  pi.registerFlag('fast', {
    description: 'Start with fast mode enabled',
    type: 'boolean',
    default: false,
  });
  pi.on('session_start', (_event, ctx) => {
    restore(ctx);
    statusHandles.get(ctx.sessionManager)?.dispose();
    if (ctx.hasUI) {
      statusHandles.set(
        ctx.sessionManager,
        registerStatus(pi, ctx.ui, {
          source: 'fast-mode',
          key: 'fast',
          color: { default: 'muted', byState: { on: 'accent', unsupported: 'warning' } },
        }),
      );
    }
    updateStatus(ctx);
  });
  pi.on('session_tree', (_event, ctx) => {
    restore(ctx);
    updateStatus(ctx);
  });
  pi.on('model_select', (_event, ctx) => updateStatus(ctx));
  pi.on('session_shutdown', (_event, ctx) => {
    statusHandles.get(ctx.sessionManager)?.dispose();
    statusHandles.delete(ctx.sessionManager);
    states.delete(ctx.sessionManager);
  });
  pi.on('before_provider_headers', (event, ctx) => {
    applyFastHeaders(event.headers, selectedContext(ctx), state(ctx).enabled);
  });
  pi.on('before_provider_request', (event, ctx) => {
    updateStatus(ctx);
    return getFastPayload(event.payload, selectedContext(ctx), state(ctx).enabled);
  });
  pi.registerCommand('fast', {
    description: 'Toggle or set fast mode; /fast status reports current state',
    handler: async (args, ctx) => {
      const action = args.trim();
      if (action === 'status') return announce(ctx);
      if (action === '' || action === 'on' || action === 'off') {
        toggle(ctx, action === '' ? !state(ctx).enabled : action === 'on');
        return;
      }
      if (ctx.hasUI) ctx.ui.notify('Usage: /fast [on|off|status]', 'warning');
    },
  });
  pi.registerShortcut('f3', {
    description: 'Toggle fast mode',
    handler: (ctx) => toggle(ctx, !state(ctx).enabled),
  });
}
