import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerStatus, type StatusHandle } from '@araketski/pi-statusline-protocol';
import {
  applyFastHeaders,
  getFastPayload,
  getModelEligibility,
  type FastContext,
  type FastModel,
} from './src/request.ts';
import { restoreFastState, type FastState } from './src/session.ts';

function toFastContext(ctx: ExtensionContext): FastContext {
  return {
    model: ctx.model as FastModel | undefined,
    modelRegistry: {
      isUsingOAuth: (model) =>
        ctx.modelRegistry.isUsingOAuth(model as NonNullable<typeof ctx.model>),
    },
  };
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
    const supported = getModelEligibility(toFastContext(ctx)).supported;
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
    const eligibility = getModelEligibility(toFastContext(ctx));
    ctx.ui.notify(
      `Fast mode is ${enabled ? 'on' : 'off'}${enabled && !eligibility.supported ? ' (unavailable for current model)' : ''}.`,
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
    if (value && !getModelEligibility(toFastContext(ctx)).supported && ctx.hasUI) {
      ctx.ui.notify(
        'Current model does not support fast mode; it will apply after switching to a supported model.',
        'warning',
      );
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
    applyFastHeaders(event.headers, toFastContext(ctx), state(ctx).enabled);
  });
  pi.on('before_provider_request', (event, ctx) => {
    updateStatus(ctx);
    return getFastPayload(event.payload, toFastContext(ctx), state(ctx).enabled);
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
