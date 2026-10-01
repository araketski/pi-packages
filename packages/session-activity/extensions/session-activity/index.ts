import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { loadConfig } from './config.ts';
import { ActivityCoordinator } from './coordinator.ts';
import { HerdrPublisher, type ActivityPublisher } from './publisher.ts';
import { generateActivity } from './summary.ts';

// @mara implements REQ-SESSION-ACTIVITY-ISOLATION
// @mara implements REQ-SESSION-ACTIVITY-CLEANUP
// @mara implements DES-SESSION-ACTIVITY-PUBLISHER
export function registerSessionActivity(
  pi: ExtensionAPI,
  createPublisher: () => ActivityPublisher = () => new HerdrPublisher(),
  generate: typeof generateActivity = generateActivity,
): void {
  let coordinator: ActivityCoordinator | undefined;
  let publisher: ActivityPublisher | undefined;
  let rootId: string | undefined;
  const isRoot = (ctx: ExtensionContext) =>
    ctx.mode === 'tui' && rootId === ctx.sessionManager.getSessionId();
  const shutdown = async () => {
    const oldCoordinator = coordinator;
    const oldPublisher = publisher;
    coordinator = undefined;
    publisher = undefined;
    rootId = undefined;
    try {
      await oldCoordinator?.reset();
    } finally {
      oldPublisher?.dispose();
    }
  };
  pi.on('session_start', (_event, ctx) => {
    // Never let headless/nested sessions sharing the extension bus touch the root pane.
    if (ctx.mode !== 'tui') return;
    void shutdown().catch(() => {});
    const nextPublisher = createPublisher();
    if (!nextPublisher.available) {
      nextPublisher.dispose();
      return;
    }
    publisher = nextPublisher;
    rootId = ctx.sessionManager.getSessionId();
    const config = loadConfig((message) => {
      try {
        ctx.ui.notify(message, 'warning');
      } catch {
        /* Nonblocking diagnostics. */
      }
    });
    coordinator = new ActivityCoordinator(nextPublisher, config, generate);
    void coordinator.reset(); // Clear stale orderly-session metadata without blocking startup.
    if (!ctx.isIdle()) coordinator.start(ctx);
  });
  pi.on('agent_start', (_event, ctx) => {
    if (isRoot(ctx)) coordinator?.start(ctx);
  });
  pi.on('turn_end', (event, ctx) => {
    if (isRoot(ctx)) coordinator?.turn(ctx, event.message);
  });
  pi.on('agent_settled', (_event, ctx) => {
    if (isRoot(ctx)) void coordinator?.reset();
  });
  pi.on('session_tree', (_event, ctx) => {
    if (!isRoot(ctx)) return;
    void coordinator?.reset();
    if (!ctx.isIdle()) coordinator?.start(ctx);
  });
  pi.on('session_shutdown', async (_event, ctx) => {
    // Shutdown may await only bounded cleanup, not generation or normal agent work.
    if (isRoot(ctx)) await shutdown();
  });
}

export default function sessionActivity(pi: ExtensionAPI): void {
  registerSessionActivity(pi);
}
