import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
} from '@earendil-works/pi-coding-agent';
import type { StatuslineStatus } from '@araketski/pi-statusline-protocol';
import { collectCore } from './builtins/core.js';
import { collectGit } from './builtins/git.js';
import { collectUsage } from './builtins/usage.js';

export interface GitData {
  git?: {
    branch?: string;
    conflict: number;
    staged: number;
    unstaged: number;
    untracked: number;
    ahead: number;
    behind: number;
  };
  pr?: number;
}

export function collectBuiltins(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  footerData: ReadonlyFooterDataProvider,
  keys: Set<string>,
  git: GitData,
): Map<string, StatuslineStatus> {
  const items = new Map<string, StatuslineStatus>();
  collectCore(items, keys, ctx, pi);
  collectGit(items, keys, footerData, git);
  collectUsage(items, keys, ctx);
  return items;
}
