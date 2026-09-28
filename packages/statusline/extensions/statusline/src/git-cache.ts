import { execFile } from 'node:child_process';
import type { GitData } from './builtins.js';

export type CommandRunner = (
  program: 'git' | 'gh',
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
) => Promise<{ exitCode: number | null; stdout: string }>;

export function parseGitStatus(output: string): NonNullable<GitData['git']> {
  const snapshot = {
    branch: undefined as string | undefined,
    conflict: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    ahead: 0,
    behind: 0,
  };
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('# branch.head ')) {
      const branch = line.slice('# branch.head '.length);
      snapshot.branch = branch && branch !== '(detached)' ? branch : undefined;
    } else if (line.startsWith('# branch.ab ')) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line);
      if (match) {
        snapshot.ahead = Number(match[1]);
        snapshot.behind = Number(match[2]);
      }
    } else if (line.startsWith('u ')) snapshot.conflict++;
    else if (line.startsWith('? ')) snapshot.untracked++;
    else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.slice(2, 4);
      if (xy[0] && xy[0] !== '.') snapshot.staged++;
      if (xy[1] && xy[1] !== '.') snapshot.unstaged++;
    }
  }
  return snapshot;
}

const defaultRunner: CommandRunner = (program, args, cwd, signal) =>
  new Promise((resolve, reject) => {
    execFile(
      program,
      [...args],
      { cwd, signal, timeout: program === 'gh' ? 3000 : 1500, maxBuffer: 1_048_576 },
      (error, stdout) => {
        if (signal.aborted) {
          reject(error ?? new Error('aborted'));
          return;
        }
        resolve({ exitCode: error ? 1 : 0, stdout: String(stdout) });
      },
    );
  });

interface Options {
  cwd(): string;
  pr: boolean;
  runner?: CommandRunner;
  onChange(): void;
  intervalMs?: number;
}

export class GitCache {
  private data: GitData = {};
  private disposed = false;
  private revision = 0;
  private readonly controllers = new Set<AbortController>();
  private timer?: ReturnType<typeof setInterval>;
  private inflight?: Promise<void>;

  constructor(private readonly options: Options) {
    const interval = options.intervalMs ?? 8000;
    if (interval > 0) {
      this.timer = setInterval(() => {
        void this.refresh();
      }, interval);
      this.timer.unref?.();
      void this.refresh();
    }
  }

  get(): GitData {
    return this.disposed ? {} : { ...this.data };
  }

  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.inflight) return this.inflight;
    const revision = this.revision;
    const promise = this.doRefresh(revision)
      .catch(() => undefined)
      .finally(() => {
        if (this.inflight === promise) this.inflight = undefined;
      });
    this.inflight = promise;
    return promise;
  }

  private async command(
    program: 'git' | 'gh',
    args: readonly string[],
  ): Promise<{ exitCode: number | null; stdout: string }> {
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      return await (this.options.runner ?? defaultRunner)(
        program,
        args,
        this.options.cwd(),
        controller.signal,
      );
    } finally {
      this.controllers.delete(controller);
    }
  }

  private async doRefresh(revision: number): Promise<void> {
    const previous = JSON.stringify(this.data);
    const result = await this.command('git', [
      '--no-optional-locks',
      'status',
      '--porcelain=v2',
      '--branch',
      '--untracked-files=all',
    ]);
    if (this.disposed || revision !== this.revision) return;
    if (result.exitCode === null) return;
    if (result.exitCode !== 0) this.data = {};
    else {
      const git = parseGitStatus(result.stdout);
      const changedBranch = git.branch !== this.data.git?.branch;
      this.data = { git, pr: changedBranch ? undefined : this.data.pr };
      if (this.options.pr && git.branch) {
        try {
          const pr = await this.command('gh', [
            'pr',
            'list',
            '--state',
            'open',
            '--json',
            'number',
            '--limit',
            '1',
            '--head',
            git.branch,
          ]);
          if (this.disposed || revision !== this.revision) return;
          if (pr.exitCode === 0) {
            const values: unknown = JSON.parse(pr.stdout);
            const number = Array.isArray(values) && values[0]?.number;
            this.data.pr = Number.isSafeInteger(number) && number > 0 ? number : undefined;
          }
        } catch {
          /* transient gh failures leave existing same-branch PR alone */
        }
      }
    }
    if (!this.disposed && revision === this.revision && previous !== JSON.stringify(this.data))
      this.options.onChange();
  }

  invalidate(): void {
    if (this.disposed) return;
    this.revision++;
    for (const controller of this.controllers) controller.abort();
    this.inflight = undefined;
    this.data = {};
    this.options.onChange();
    void this.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.data = {};
  }
}
