import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { applyFastHeaders, getFastPayload, getModelEligibility, type FastContext, type FastModel } from './src/request.ts';
import { restoreFastState, type FastState } from './src/session.ts';

function toFastContext(ctx: ExtensionContext): FastContext {
  return {
    model: ctx.model as FastModel | undefined,
    modelRegistry: {
      isUsingOAuth: (model) => ctx.modelRegistry.isUsingOAuth(model as NonNullable<typeof ctx.model>),
    },
  };
}

export default function fastMode(pi: ExtensionAPI): void {
  const states = new WeakMap<object, FastState>();
  const state = (ctx: ExtensionContext) => {
    let current = states.get(ctx.sessionManager);
    if (!current) {
      current = { enabled: pi.getFlag('fast') === true };
      states.set(ctx.sessionManager, current);
    }
    return current;
  };
  const restore = (ctx: ExtensionContext) => {
    states.set(ctx.sessionManager, restoreFastState(ctx.sessionManager.getBranch(), pi.getFlag('fast') === true));
  };
  const announce = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const enabled = state(ctx).enabled;
    const eligibility = getModelEligibility(toFastContext(ctx));
    ctx.ui.notify(`Fast mode is ${enabled ? 'on' : 'off'}${enabled && !eligibility.supported ? ' (unavailable for current model)' : ''}.`, 'info');
  };
  const toggle = (ctx: ExtensionContext, value: boolean) => {
    const current = state(ctx);
    if (current.enabled === value) {
      announce(ctx);
      return;
    }
    current.enabled = value;
    pi.appendEntry('fast', { enabled: value });
    announce(ctx);
    if (value && !getModelEligibility(toFastContext(ctx)).supported && ctx.hasUI) {
      ctx.ui.notify('Current model does not support fast mode; it will apply after switching to a supported model.', 'warning');
    }
  };

  pi.registerFlag('fast', { description: 'Start with fast mode enabled', type: 'boolean', default: false });
  pi.on('session_start', (_event, ctx) => restore(ctx));
  pi.on('session_tree', (_event, ctx) => restore(ctx));
  pi.on('before_provider_headers', (event, ctx) => {
    applyFastHeaders(event.headers, toFastContext(ctx), state(ctx).enabled);
  });
  pi.on('before_provider_request', (event, ctx) => getFastPayload(event.payload, toFastContext(ctx), state(ctx).enabled));
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
  pi.registerShortcut('f3', { description: 'Toggle fast mode', handler: (ctx) => toggle(ctx, !state(ctx).enabled) });
}
