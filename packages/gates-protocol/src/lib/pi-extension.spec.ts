import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { createGateObserver, createGateOwner } from '../index.js';
import type { GateContext } from '../index.js';

// @mara checks REQ-GATES-PENDING-STATE
// @mara checks REQ-GATES-SIGNAL-ONLY
it('coordinates independent loaded Pi extensions without starting a model turn', async () => {
  const cwd = mkdtempSync(join(process.env.HOME!, '.cache/gates-pi-extension-'));
  let owningContext: GateContext | undefined;
  let acquire: ((ctx: GateContext, gate: { id: string }) => void) | undefined;
  let view: (() => ReturnType<ReturnType<typeof createGateObserver>['view']>) | undefined;
  let finishDiscovery: (() => void) | undefined;
  let dispose: (() => void) | undefined;
  try {
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: cwd,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      settingsManager: SettingsManager.inMemory(),
      extensionFactories: [
        (pi) => {
          const owner = createGateOwner(pi, 'tmux-bash');
          pi.on('session_start', (_event, ctx) => {
            owningContext = ctx;
            owner.start(ctx);
            owner.reconcile(ctx, []);
          });
          pi.on('session_shutdown', () => {
            owner.close();
          });
          acquire = (ctx, gate) => owner.acquire(ctx, gate);
        },
        (pi) => {
          const observer = createGateObserver(pi);
          pi.on('session_start', (_event, ctx) => {
            observer.start(ctx);
          });
          pi.on('session_shutdown', () => {
            observer.close();
          });
          view = () => observer.view();
          finishDiscovery = () => observer.finishDiscovery();
        },
      ],
    });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd,
      agentDir: cwd,
      noTools: 'all',
      settingsManager: SettingsManager.inMemory(),
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(cwd),
    });
    dispose = () => session.dispose();
    await session.bindExtensions({});
    expect(owningContext).toBeDefined();
    finishDiscovery!();
    expect(view!().readiness).toBe('confirmed');
    acquire!(owningContext!, { id: 'job' });
    expect(view!().owners[0].gates).toEqual([{ id: 'job' }]);
    expect(session.sessionManager.buildSessionContext().messages).toEqual([]);
  } finally {
    dispose?.();
    rmSync(cwd, { recursive: true, force: true });
  }
});
