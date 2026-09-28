import { describe, expect, it, vi } from 'vitest';
import { GitCache, parseGitStatus, type CommandRunner } from '../extensions/statusline/src/git-cache.js';

const porcelain = [
  '# branch.head feature', '# branch.ab +2 -1',
  '1 M. N... 100644 100644 100644 abc abc src/a.ts',
  '1 .M N... 100644 100644 100644 abc abc src/b.ts',
  'u UU N... 100644 100644 100644 100644 abc abc abc src/c.ts',
  '? file-1.txt', '? file-2.txt',
].join('\n');

describe('asynchronous Git/PR data', () => {
  it('counts porcelain v2 branch divergence and individual untracked files', () => {
    expect(parseGitStatus(porcelain)).toEqual({ branch: 'feature', staged: 1, unstaged: 1,
      conflict: 1, untracked: 2, ahead: 2, behind: 1 });
  });

  it('does not block rendering and fetches PR only when configured', async () => {
    const runner = vi.fn<CommandRunner>(async (program) => program === 'git'
      ? { exitCode: 0, stdout: porcelain }
      : { exitCode: 0, stdout: '[{"number":42}]' });
    const changed = vi.fn();
    const cache = new GitCache({ cwd: () => '/tmp/example', pr: true, runner, onChange: changed, intervalMs: 0 });
    expect(cache.get()).toEqual({});
    await cache.refresh();
    expect(cache.get()).toMatchObject({ git: { branch: 'feature', untracked: 2 }, pr: 42 });
    expect(runner.mock.calls.map(([program]) => program)).toEqual(['git', 'gh']);
    expect(changed).toHaveBeenCalledOnce();
    await cache.refresh();
    expect(changed).toHaveBeenCalledOnce();
    cache.dispose();
    expect(cache.get()).toEqual({});
  });

  it('discards a lookup started before a branch change and immediately refreshes the new branch', async () => {
    let release!: (value: { exitCode: number; stdout: string }) => void;
    let calls = 0;
    const cache = new GitCache({ cwd: () => '/tmp', pr: false, onChange: vi.fn(), intervalMs: 0,
      runner: () => ++calls === 1
        ? new Promise((resolve) => { release = resolve; })
        : Promise.resolve({ exitCode: 0, stdout: '# branch.head new' }),
    });
    const oldWork = cache.refresh();
    cache.invalidate();
    await cache.refresh();
    expect(cache.get().git?.branch).toBe('new');
    release({ exitCode: 0, stdout: '# branch.head old' });
    await oldWork;
    expect(cache.get().git?.branch).toBe('new');
    cache.dispose();
  });

  it('omits unavailable data, clears old PR on branch changes, and ignores late results after dispose', async () => {
    let current = porcelain;
    let ghOk = true;
    const runner: CommandRunner = async (program) => program === 'git'
      ? { exitCode: 0, stdout: current }
      : { exitCode: ghOk ? 0 : 1, stdout: '[{"number":7}]' };
    const cache = new GitCache({ cwd: () => '/tmp/example', pr: true, runner, onChange: vi.fn(), intervalMs: 0 });
    await cache.refresh();
    expect(cache.get().pr).toBe(7);
    current = current.replace('branch.head feature', 'branch.head next');
    ghOk = false;
    await cache.refresh();
    expect(cache.get().git?.branch).toBe('next');
    expect(cache.get().pr).toBeUndefined();
    cache.dispose();
    const unavailable = new GitCache({ cwd: () => '/tmp', pr: false, runner: async () => ({ exitCode: 128, stdout: '' }),
      onChange: vi.fn(), intervalMs: 0 });
    await unavailable.refresh();
    expect(unavailable.get()).toEqual({});
    unavailable.dispose();
    let release!: (value: { exitCode: number; stdout: string }) => void;
    const delayed = new GitCache({ cwd: () => '/tmp', pr: false, runner: () => new Promise((resolve) => { release = resolve; }),
      onChange: vi.fn(), intervalMs: 0 });
    const work = delayed.refresh();
    delayed.dispose();
    release({ exitCode: 0, stdout: porcelain });
    await work;
    expect(delayed.get()).toEqual({});
  });
});
