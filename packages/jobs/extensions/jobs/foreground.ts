import type { ExecutionState, JobIdentity } from '@araketski/pi-jobs-core';

export type ForegroundResult =
  | { kind: 'background'; identity: JobIdentity }
  | { kind: 'completed'; execution: Extract<ExecutionState, { state: 'terminal' }> }
  | { kind: 'unknown'; reason: string };

/** One synchronous latch; finishing an outer script is not an execution lifetime event. */
// @mara implements DES-JOBS-LOCAL-EXECUTOR
export function createForegroundHandoff(options: {
  identity: JobIdentity;
  budgetMs?: number;
  background?: boolean;
  signal?: AbortSignal;
  cancel: () => void;
}): { result: Promise<ForegroundResult>; finish(execution: ExecutionState): void } {
  let phase: 'foreground' | 'cancelling' | 'settled' = 'foreground';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (result: ForegroundResult) => void;
  const result = new Promise<ForegroundResult>((r) => {
    resolve = r;
  });
  const detach = () => {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  };
  const settle = (value: ForegroundResult) => {
    if (phase === 'settled') return;
    phase = 'settled';
    detach();
    resolve(value);
  };
  const abort = () => {
    if (phase !== 'foreground') return;
    phase = 'cancelling';
    detach();
    options.cancel();
  };
  const handoff = () => {
    if (phase === 'foreground') settle({ kind: 'background', identity: { ...options.identity } });
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  else if (options.background || options.budgetMs === 0) handoff();
  else timer = setTimeout(handoff, options.budgetMs ?? 5000);
  return {
    result,
    finish(execution) {
      if (execution.state === 'terminal') settle({ kind: 'completed', execution });
      else if (execution.state === 'unknown') settle({ kind: 'unknown', reason: execution.reason });
    },
  };
}
