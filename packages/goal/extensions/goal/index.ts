import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { GoalState, STATE_ENTRY } from './state.ts';

/** Internal seam for the next controls increment; no commands or model tools. */
export function bindGoalState(pi: ExtensionAPI): GoalState {
  const state = new GoalState((snapshot) => pi.appendEntry(STATE_ENTRY, snapshot));
  pi.on('session_start', (event, ctx) => state.restore(ctx.sessionManager, event.reason));
  pi.on('session_tree', (_event, ctx) => state.restore(ctx.sessionManager, 'tree'));
  pi.on('session_compact', (_event, ctx) => state.restore(ctx.sessionManager, 'compact'));
  pi.on('session_shutdown', () => state.detach());
  return state;
}

export default function (pi: ExtensionAPI): void {
  bindGoalState(pi);
}
