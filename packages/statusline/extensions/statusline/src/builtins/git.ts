import type { ReadonlyFooterDataProvider } from '@earendil-works/pi-coding-agent';
import type { StatuslineStatus } from '@araketski/pi-statusline-protocol';
import type { GitData } from '../builtins.js';
import { addStatus } from './shared.js';

export function collectGit(
  items: Map<string, StatuslineStatus>,
  keys: Set<string>,
  footerData: ReadonlyFooterDataProvider,
  data: GitData,
): void {
  const git = data.git;
  if (keys.has('branch')) {
    const branch = footerData.getGitBranch() || git?.branch;
    if (branch) {
      const counts = git
        ? [git.conflict, git.staged, git.unstaged, git.untracked, git.ahead, git.behind]
        : [];
      addStatus(
        items,
        keys,
        'branch',
        branch,
        counts.some((count) => count > 0) ? 'dirty' : 'clean',
      );
    }
  }
  if (keys.has('changes') && git) {
    const values: Array<[string, number]> = [
      ['!', git.conflict],
      ['+', git.staged],
      ['~', git.unstaged],
      ['?', git.untracked],
      ['↑', git.ahead],
      ['↓', git.behind],
    ];
    addStatus(
      items,
      keys,
      'changes',
      values
        .filter(([, count]) => count > 0)
        .map(([label, count]) => `${label}${count}`)
        .join(' '),
    );
  }
  if (keys.has('pr') && Number.isSafeInteger(data.pr) && (data.pr ?? 0) > 0)
    addStatus(items, keys, 'pr', `PR #${data.pr}`);
}
