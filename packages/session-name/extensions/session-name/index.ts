import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { defaults, loadConfig } from './config.ts';
import { firstUserText, generateName, safeText } from './naming.ts';

// @mara implements REQ-SESSION-NAME-AUTO
// @mara implements REQ-SESSION-NAME-LIFECYCLE
// @mara implements REQ-SESSION-NAME-TITLE
// @mara implements DES-SESSION-NAME-ALGORITHM
export default function sessionName(pi: ExtensionAPI): void {
  let config = { ...defaults };
  let sessionId: string | undefined;
  let attempted = false;
  let operation: AbortController | undefined;
  let titleTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelNaming = () => {
    operation?.abort();
    operation = undefined;
  };
  const cancelTitle = () => {
    if (titleTimer !== undefined) clearTimeout(titleTimer);
    titleTimer = undefined;
  };
  const hasNameMetadata = (ctx: ExtensionContext) =>
    Boolean(pi.getSessionName()) ||
    ctx.sessionManager.getEntries().some((entry) => entry.type === 'session_info');
  const mirrorTitle = (ctx: ExtensionContext, name = pi.getSessionName()) => {
    if (
      !config.setTitle ||
      ctx.mode !== 'tui' ||
      sessionId !== ctx.sessionManager.getSessionId() ||
      !name
    )
      return;
    const title = safeText(name);
    if (!title) return;
    try {
      ctx.ui.setTitle(title);
    } catch {
      /* Terminal titles are best-effort. */
    }
  };

  pi.on('session_start', (_event, ctx) => {
    cancelNaming();
    cancelTitle();
    sessionId = ctx.sessionManager.getSessionId();
    attempted = hasNameMetadata(ctx);
    config = loadConfig((message) => {
      if (ctx.hasUI) ctx.ui.notify(message, 'warning');
    });
    if (config.setTitle && ctx.mode === 'tui') {
      // Pi updates its startup title after session_start; mirror on the next tick.
      titleTimer = setTimeout(() => {
        titleTimer = undefined;
        mirrorTitle(ctx);
      }, 0);
    }
  });

  pi.on('session_info_changed', (event, ctx) => {
    attempted = true;
    cancelNaming();
    mirrorTitle(ctx, event.name);
  });

  pi.on('session_tree', () => {
    attempted = true;
    cancelNaming();
  });
  pi.on('session_shutdown', () => {
    cancelNaming();
    cancelTitle();
    sessionId = undefined;
    attempted = true;
  });

  const nameSession = async (ctx: ExtensionContext, incomingPrompt: string) => {
    if (attempted || sessionId !== ctx.sessionManager.getSessionId() || hasNameMetadata(ctx))
      return;
    // before_agent_start runs before Pi persists the incoming user message.
    const prompt = firstUserText(ctx.sessionManager.getBranch()) ?? incomingPrompt;
    if (!safeText(prompt)) return;
    attempted = true;
    const current = new AbortController();
    operation = current;
    const capturedId = sessionId;
    try {
      const name = await generateName(ctx, config, prompt, current.signal);
      if (
        !name ||
        current.signal.aborted ||
        operation !== current ||
        sessionId !== capturedId ||
        ctx.sessionManager.getSessionId() !== capturedId ||
        hasNameMetadata(ctx)
      )
        return;
      operation = undefined;
      pi.setSessionName(name);
    } finally {
      if (operation === current) operation = undefined;
    }
  };

  pi.on('before_agent_start', (event, ctx) => {
    // Do not await: the main response and its transcript must be free to advance.
    void nameSession(ctx, event.prompt).catch(() => {
      // Background naming is best-effort and must not reject into the chat run.
    });
  });
}
