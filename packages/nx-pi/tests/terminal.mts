import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

interface InputStep {
  waitFor: string;
  input: string;
  check?: () => void;
}

/** Drive the real CLI through util-linux script's pseudo-terminal, not a mocked prompt. */
export function runInTerminal(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  steps: InputStep[],
): Promise<{ status: number | null; output: string }> {
  const command = [process.execPath, ...args]
    .map((value) => `'${value.replaceAll("'", "'\\''")}'`)
    .join(' ');
  return new Promise((resolve, reject) => {
    const child = spawn(
      'script',
      [
        '--quiet',
        '--return',
        '--flush',
        '--command',
        `stty cols 120 rows 40 && exec ${command}`,
        '/dev/null',
      ],
      {
        cwd,
        env: { ...env, CI: 'false', NX_INTERACTIVE: 'true', SHELL: '/bin/sh', TERM: 'xterm' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let output = '';
    let stepIndex = 0;
    let cursor = 0;
    let failure: Error | undefined;
    function abort(error: unknown): void {
      failure ??= error instanceof Error ? error : new Error(String(error));
      child.kill('SIGTERM');
    }
    const timer = setTimeout(() => {
      abort(new Error(`Interactive CLI timed out:\n${stripVTControlCharacters(output)}`));
    }, 30_000);
    function receive(chunk: Buffer): void {
      output += chunk.toString();
      const plain = stripVTControlCharacters(output);
      const step = steps[stepIndex];
      if (!step) return;
      const match = plain.indexOf(step.waitFor, cursor);
      if (match === -1) return;
      cursor = match + step.waitFor.length;
      stepIndex++;
      try {
        step.check?.();
        child.stdin.write(step.input);
      } catch (error) {
        abort(error);
      }
    }
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.on('error', abort);
    child.stdin.on('error', abort);
    child.on('close', (status) => {
      clearTimeout(timer);
      const plain = stripVTControlCharacters(output);
      // Wait for terminal teardown before the fixture's afterEach removes files.
      if (failure) {
        reject(failure);
      } else if (stepIndex !== steps.length) {
        reject(
          new Error(`CLI exited before expected prompt ${steps[stepIndex]?.waitFor}:\n${plain}`),
        );
      } else {
        resolve({ status, output: plain });
      }
    });
  });
}
