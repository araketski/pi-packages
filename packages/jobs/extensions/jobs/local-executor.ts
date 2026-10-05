import { fork, type ChildProcess } from 'node:child_process';
import { isAbsolute } from 'node:path';
import type {
  ControlAuthority,
  ExecutionAdapter,
  ExecutionOutcome,
  ExecutionState,
  JobIdentity,
  JobReply,
} from '@araketski/pi-jobs-core';
import { createForegroundHandoff, type ForegroundResult } from './foreground.ts';
import {
  dead,
  readProcess,
  verifyGroupQuiescence,
  type ProcessEvidence,
} from './linux-evidence.mjs';

declare const localHandle: unique symbol;
/** Opaque adapter-owned handle. A snapshot, PID or object copy does not recreate it. */
export interface LocalHandle {
  readonly [localHandle]: true;
}
export interface LocalInput {
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  shell?: string;
  foregroundBudgetMs?: number;
  background?: boolean;
  stopGraceMs?: number;
}
export interface LocalEvidence {
  bootId?: string;
  supervisor?: ProcessEvidence;
  commandPid?: number;
  command?: ProcessEvidence;
  escaped: ProcessEvidence[];
  remainingLiveGroup: ProcessEvidence[];
  evidenceError?: string;
}
export interface LocalExecutor extends ExecutionAdapter<LocalHandle, LocalInput> {
  foreground(handle: LocalHandle): Promise<ForegroundResult>;
  /** Terminal/unknown observation, after output draining; not a delivery receipt. */
  completion(handle: LocalHandle): Promise<ExecutionState>;
  evidence(handle: LocalHandle): LocalEvidence;
  diagnostics(handle: LocalHandle): string[];
}
type RecordState = {
  child?: ChildProcess;
  authority: ControlAuthority;
  generation: string;
  identity: JobIdentity;
  state: ExecutionState;
  evidence: LocalEvidence;
  diagnostics: string[];
  foreground: ReturnType<typeof createForegroundHandoff>;
  completion: Promise<ExecutionState>;
  resolve: (state: ExecutionState) => void;
  hardTimer?: ReturnType<typeof setTimeout>;
  stopTimer?: ReturnType<typeof setTimeout>;
  stopped: boolean;
  closed: boolean;
};
const delayValid = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
const identityValid = (value: string) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value.trim() === value &&
  !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const failureText = (error: unknown): string => {
  try {
    return String(error);
  } catch {
    return 'Unprintable failure.';
  }
};
const denied = (reason: string): JobReply<never> => ({ status: 'denied', reason });
const clone = <T>(value: T): T => structuredClone(value);

/** Backend only. The caller supplies admission, settings resolution, storage and delivery. */
// @mara implements DES-JOBS-LOCAL-EXECUTOR
export function createLocalExecutor(options: { authority: () => ControlAuthority }): LocalExecutor {
  const records = new WeakMap<LocalHandle, RecordState>();
  const authorized = (record: RecordState, authority: ControlAuthority) =>
    authority === record.authority &&
    options.authority() === authority &&
    authority.generation === record.generation &&
    authority.runtimeId === record.identity.runtimeId &&
    authority.ownerId === record.identity.ownerId;
  const lookup = (handle: LocalHandle) => {
    const record = records.get(handle);
    if (!record) throw Error('Foreign local execution handle.');
    return record;
  };
  const update = (record: RecordState, state: ExecutionState) => {
    // Once command/group termination is proven, late control/IPC diagnostics cannot undo it.
    if (record.state.state === 'terminal' && state.state !== 'terminal') return;
    record.state = state;
    record.foreground.finish(clone(state));
    record.resolve(clone(state));
  };
  const stopRecord = async (
    record: RecordState,
    authority: ControlAuthority,
    graceMs: number,
  ): Promise<JobReply<{ requested: true }>> => {
    if (!authorized(record, authority)) return denied('Current owner-held authority is required.');
    if (!delayValid(graceMs)) return { status: 'invalid', reason: 'Invalid termination grace.' };
    if (record.state.state === 'terminal' || record.stopped)
      return { status: 'ok', value: { requested: true } };
    if (record.closed || !record.child?.connected)
      return {
        status: 'unknown',
        reason: 'Supervisor IPC unavailable; no PID signalling fallback.',
      };
    record.stopped = true;
    // A request is not terminal. Bound foreground cancellation even if the supervisor fails to report.
    record.stopTimer = setTimeout(
      () =>
        update(record, {
          state: 'unknown',
          reason: 'Owned-group termination has not been verified.',
        }),
      Math.min(graceMs + 1000, 2_147_483_647),
    );
    return await new Promise((resolve) => {
      record.child!.send({ kind: 'stop', graceMs }, (error: Error | null) => {
        if (error) {
          update(record, { state: 'unknown', reason: `Stop IPC failed: ${String(error)}` });
          resolve({ status: 'unknown', reason: String(error) });
        } else resolve({ status: 'ok', value: { requested: true } });
      });
    });
  };
  return {
    async launch(request, input, output, signal) {
      if (process.platform !== 'linux')
        return { status: 'unsupported', reason: 'The local adapter requires Linux procfs.' };
      const authority = options.authority();
      if (
        !authority ||
        request.authority !== authority ||
        !Object.values(request.identity).every(identityValid) ||
        request.identity.runtimeId !== authority.runtimeId ||
        request.identity.ownerId !== authority.ownerId ||
        !identityValid(authority.generation)
      )
        return denied('Launch requires the current owner-held runtime/owner/generation authority.');
      if (request.lifetime !== 'managed')
        return {
          status: 'unsupported',
          reason: 'Persistent lifetime belongs to the Herdr backend.',
        };
      if (signal?.aborted)
        return {
          status: 'invalid',
          reason: 'Foreground operation was already aborted; no command launched.',
        };
      const budgetMs = input.foregroundBudgetMs ?? 5000;
      const graceMs = input.stopGraceMs ?? 5000;
      if (
        typeof input.command !== 'string' ||
        !input.command.trim() ||
        typeof input.cwd !== 'string' ||
        !isAbsolute(input.cwd) ||
        !delayValid(budgetMs) ||
        !delayValid(graceMs) ||
        (request.hardTimeoutMs !== undefined &&
          (!delayValid(request.hardTimeoutMs) || request.hardTimeoutMs === 0))
      )
        return { status: 'invalid', reason: 'Invalid command, absolute cwd or execution timing.' };
      const handle = Object.freeze({}) as LocalHandle;
      let resolve!: (state: ExecutionState) => void;
      const completion = new Promise<ExecutionState>((r) => {
        resolve = r;
      });
      let record!: RecordState;
      const foreground = createForegroundHandoff({
        identity: clone(request.identity),
        budgetMs,
        background: input.background,
        signal,
        cancel: () => {
          void stopRecord(record, record.authority, graceMs).then((reply) => {
            if (reply.status !== 'ok') update(record, { state: 'unknown', reason: reply.reason });
          });
        },
      });
      record = {
        authority,
        generation: authority.generation,
        identity: clone(request.identity),
        state: { state: 'running' },
        evidence: { escaped: [], remainingLiveGroup: [] },
        diagnostics: [],
        foreground,
        completion,
        resolve,
        stopped: false,
        closed: false,
      };
      records.set(handle, record);
      let report: ExecutionState | undefined;
      let commandOutcome: ExecutionOutcome | undefined;
      let exitSignal: NodeJS.Signals | null | undefined;
      let ownedEscalation = false;
      let verificationTimer: ReturnType<typeof setTimeout> | undefined;
      let verificationDeadline: number | undefined;
      let finalResolve!: (state: ExecutionState) => void;
      const finalObservation = new Promise<ExecutionState>((r) => {
        finalResolve = r;
      });
      const acceptFinal = (state: ExecutionState) => {
        if (record.state.state === 'terminal' && state.state !== 'terminal') return;
        report = clone(state);
        clearTimeout(record.stopTimer);
        clearTimeout(record.hardTimer);
        clearTimeout(verificationTimer);
        record.state = clone(state);
        record.foreground.finish(clone(state));
        finalResolve(clone(state));
        // Unknown must not hide behind inherited output pipes. Terminal results wait for draining.
        if (state.state === 'unknown') update(record, state);
      };
      const surfaceSupervisorLoss = () => {
        // IPC EOF allows queued final reports to win, but does not wait for output EOF.
        if (!record.closed || record.child?.connected || report) return;
        if (ownedEscalation && exitSignal === 'SIGKILL' && record.evidence.supervisor) {
          const leader = record.evidence.supervisor;
          const confirmation = verifyGroupQuiescence(leader.group, leader.session);
          record.evidence.remainingLiveGroup = confirmation.members;
          try {
            const escaped = record.evidence.escaped.filter((p) => {
              const current = readProcess(p.pid);
              return current && current.startTicks === p.startTicks && !dead(current);
            });
            if (
              confirmation.state === 'quiescent' &&
              !escaped.length &&
              !record.evidence.evidenceError
            ) {
              acceptFinal(
                commandOutcome
                  ? { state: 'terminal', outcome: commandOutcome }
                  : {
                      state: 'unknown',
                      reason:
                        'Owned group is quiescent after escalation, but the command outcome was not observed.',
                    },
              );
              return;
            }
          } catch (error) {
            record.evidence.evidenceError = String(error);
          }
          verificationDeadline ??= Date.now() + 1000;
          if (Date.now() < verificationDeadline) {
            clearTimeout(verificationTimer);
            verificationTimer = setTimeout(surfaceSupervisorLoss, 25);
            return;
          }
        }
        acceptFinal({
          state: 'unknown',
          reason:
            record.evidence.evidenceError ??
            'Supervisor exited without verified command/descendant termination.',
        });
      };
      const drains: Promise<void>[] = [];
      // At most one awaited chunk per stream. The sink never needs a concurrent-write contract.
      let outputQueue = Promise.resolve();
      const drain = async (stream: AsyncIterable<Buffer>, name: 'stdout' | 'stderr') => {
        let failed = false;
        try {
          for await (const bytes of stream) {
            if (failed) continue;
            try {
              const append = outputQueue.then(() =>
                output.append({ stream: name, bytes: new Uint8Array(bytes) }),
              );
              outputQueue = append.catch(() => {});
              await append;
            } catch (error) {
              failed = true;
              record.diagnostics.push(
                `${name} output sink failed; subsequent bytes drained/discarded: ${failureText(error)}`,
              );
            }
          }
        } catch (error) {
          record.diagnostics.push(`${name} output drain failed: ${failureText(error)}`);
        }
      };
      try {
        const child = fork(new URL('./supervisor.mjs', import.meta.url), [], {
          detached: true,
          execArgv: [],
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          env: { ...process.env, NODE_OPTIONS: '' },
        });
        record.child = child;
        drains.push(drain(child.stdout!, 'stdout'), drain(child.stderr!, 'stderr'));
        child.on('message', (raw) => {
          const message = raw as {
            kind: string;
            execution?: ExecutionState;
            outcome?: ExecutionOutcome;
            reason?: string;
          } & Partial<LocalEvidence>;
          if (message.kind === 'finished' && message.execution) acceptFinal(message.execution);
          if (message.kind === 'uncertain')
            update(record, {
              state: 'unknown',
              reason: message.reason ?? 'Group quiescence is unverified.',
            });
          if (message.kind === 'escalating') {
            ownedEscalation = true;
            if (message.outcome) commandOutcome = message.outcome;
          }
          if (message.kind === 'outcome') commandOutcome = message.outcome;
          for (const key of [
            'bootId',
            'supervisor',
            'commandPid',
            'command',
            'escaped',
            'remainingLiveGroup',
            'evidenceError',
          ] as const) {
            if (message[key] !== undefined)
              Object.assign(record.evidence, { [key]: clone(message[key]) });
          }
        });
        child.on('error', (error) => {
          record.diagnostics.push(`Supervisor error: ${String(error)}`);
          if (!child.pid)
            acceptFinal({
              state: 'terminal',
              outcome: { kind: 'launch-failed', reason: String(error) },
            });
        });
        child.on('exit', (_code, signalName) => {
          record.closed = true;
          exitSignal = signalName;
          surfaceSupervisorLoss();
        });
        child.on('disconnect', surfaceSupervisorLoss);
        child.on('close', (_code, signalName) => {
          record.closed = true;
          exitSignal ??= signalName;
          surfaceSupervisorLoss();
          void Promise.all([Promise.all(drains), finalObservation]).then(([, state]) =>
            update(record, state),
          );
        });
        child.send(
          {
            kind: 'launch',
            input: {
              ...input,
              shell: input.shell ?? '/bin/bash',
              env: input.env ?? process.env,
              stopGraceMs: graceMs,
            },
          },
          (error: Error | null) => {
            if (error)
              update(record, { state: 'unknown', reason: `Launch IPC failed: ${String(error)}` });
          },
        );
        if (request.hardTimeoutMs !== undefined)
          record.hardTimer = setTimeout(() => {
            void stopRecord(record, record.authority, graceMs).then((reply) => {
              if (reply.status !== 'ok') update(record, { state: 'unknown', reason: reply.reason });
            });
          }, request.hardTimeoutMs);
      } catch (error) {
        update(record, {
          state: 'terminal',
          outcome: { kind: 'launch-failed', reason: String(error) },
        });
      }
      return { status: 'ok', value: handle };
    },
    observe: async (handle) => clone(lookup(handle).state),
    foreground: async (handle) => {
      const record = lookup(handle);
      const result = await record.foreground.result;
      if (result.kind === 'completed') await record.completion;
      return clone(result);
    },
    completion: (handle) => lookup(handle).completion.then(clone),
    async stop(handle, authority, graceMs) {
      const record = records.get(handle);
      return record
        ? await stopRecord(record, authority, graceMs)
        : denied('Foreign execution handle.');
    },
    evidence: (handle) => clone(lookup(handle).evidence),
    diagnostics: (handle) => [...lookup(handle).diagnostics],
  };
}
