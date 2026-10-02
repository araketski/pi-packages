import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { StatusHandle } from '@araketski/pi-statusline-protocol';

// @mara implements DES-SESSION-ACTIVITY-PUBLISHER
export interface ActivityPublisher {
  readonly available: boolean;
  publish(activity: string, signal: AbortSignal): Promise<boolean>;
  clear(signal: AbortSignal): Promise<boolean>;
  dispose(): void;
}
// @mara implements REQ-SESSION-ACTIVITY-STATUSLINE
// @mara implements DES-SESSION-ACTIVITY-PUBLISHER
export class DualActivityPublisher implements ActivityPublisher {
  private disposed = false;
  constructor(
    private status: StatusHandle,
    private herdr: ActivityPublisher,
  ) {}
  get available(): boolean {
    return !this.disposed;
  }
  publish(activity: string, signal: AbortSignal): Promise<boolean> {
    return this.send(activity, signal);
  }
  clear(signal: AbortSignal): Promise<boolean> {
    return this.send(null, signal);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Clear separately so a UI failure cannot prevent snapshot unsubscription.
    try {
      this.status.clear();
    } catch {
      /* Best-effort local cleanup. */
    }
    try {
      this.status.dispose();
    } catch {
      /* Best-effort local cleanup. */
    }
    try {
      this.herdr.dispose();
    } catch {
      /* Best-effort optional transport cleanup. */
    }
  }
  private async send(activity: string | null, signal: AbortSignal): Promise<boolean> {
    if (!this.available || signal.aborted) return false;
    let local = false;
    try {
      if (activity === null) this.status.clear();
      else this.status.update({ text: activity });
      local = true;
    } catch {
      /* A local failure must not suppress Herdr publication. */
    }
    let remote = false;
    try {
      if (this.herdr.available && !signal.aborted && !this.disposed) {
        remote = await (activity === null
          ? this.herdr.clear(signal)
          : this.herdr.publish(activity, signal));
      }
    } catch {
      /* Herdr failure must not suppress local publication. */
    }
    return local || remote;
  }
}

const sequenceKey = Symbol.for('@araketski/pi-session-activity/metadata-sequence');
function nextSequence(): number {
  // Preserve ordering across adapter instances and extension reloads in this process.
  const state = globalThis as unknown as Record<symbol, number | undefined>;
  const next = Math.max((state[sequenceKey] ?? 0) + 1, Date.now() * 1000);
  state[sequenceKey] = next;
  return next;
}
interface Job {
  activity: string | null;
  signal: AbortSignal;
  seq: number;
  resolve: (accepted: boolean) => void;
}

// @mara implements REQ-SESSION-ACTIVITY-TRANSPORT
// @mara implements REQ-SESSION-ACTIVITY-ISOLATION
// @mara implements REQ-SESSION-ACTIVITY-FAILURE
// @mara implements REQ-SESSION-ACTIVITY-CLEANUP
export class HerdrPublisher implements ActivityPublisher {
  private endpoint: string | undefined;
  private paneId: string | undefined;
  private disposed = false;
  private busy = false;
  private pending: Job | undefined;
  private cancelActive: (() => void) | undefined;
  private timeoutMs: number;
  constructor(env: NodeJS.ProcessEnv = process.env, options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 1000;
    if (env.HERDR_ENV === '1' && env.HERDR_SOCKET_PATH && env.HERDR_PANE_ID) {
      this.endpoint =
        process.platform === 'win32'
          ? `\\\\.\\pipe\\${env.HERDR_SOCKET_PATH}`
          : env.HERDR_SOCKET_PATH;
      this.paneId = env.HERDR_PANE_ID;
    }
  }
  get available(): boolean {
    return !this.disposed && !!this.endpoint && !!this.paneId;
  }
  publish(activity: string, signal: AbortSignal): Promise<boolean> {
    return this.enqueue(activity, signal);
  }
  clear(signal: AbortSignal): Promise<boolean> {
    return this.enqueue(null, signal);
  }
  dispose(): void {
    this.disposed = true;
    this.pending?.resolve(false);
    this.pending = undefined;
    this.cancelActive?.();
  }
  private enqueue(activity: string | null, signal: AbortSignal): Promise<boolean> {
    if (!this.available || signal.aborted) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      // At most one pending operation; the latest desired metadata wins.
      this.pending?.resolve(false);
      this.pending = { activity, signal, seq: nextSequence(), resolve };
      if (!this.busy) void this.drain();
    });
  }
  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.pending && !this.disposed) {
        const job = this.pending;
        this.pending = undefined;
        let success = false;
        try {
          success = await this.send(job);
        } catch {
          /* Best-effort, including synchronous socket failures. */
        }
        job.resolve(success);
      }
    } finally {
      this.busy = false;
    }
  }
  private send(job: Job): Promise<boolean> {
    if (!this.available || job.signal.aborted) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const id = `session-activity:${randomUUID()}`;
      const request = {
        id,
        method: 'pane.report_metadata',
        params: {
          pane_id: this.paneId,
          source: 'pi:session-activity',
          agent: 'pi',
          seq: job.seq,
          tokens: { activity: job.activity },
        },
      };
      const socket = createConnection(this.endpoint!);
      let done = false;
      let text = '';
      let bytes = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (accepted: boolean) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        job.signal.removeEventListener('abort', cancel);
        this.cancelActive = undefined;
        socket.destroy();
        resolve(accepted);
      };
      const cancel = () => finish(false);
      this.cancelActive = cancel;
      job.signal.addEventListener('abort', cancel, { once: true });
      socket.setEncoding('utf8');
      socket.on('error', cancel);
      socket.on('end', cancel);
      socket.on('close', cancel);
      socket.on('connect', () => {
        if (job.signal.aborted || this.disposed) finish(false);
        else socket.write(`${JSON.stringify(request)}\n`);
      });
      socket.on('data', (data: string) => {
        bytes += Buffer.byteLength(data);
        if (bytes > 65536) {
          finish(false);
          return;
        }
        text += data;
        const newline = text.indexOf('\n');
        if (newline < 0) return;
        try {
          const reply: unknown = JSON.parse(text.slice(0, newline));
          if (
            !reply ||
            typeof reply !== 'object' ||
            Array.isArray(reply) ||
            !('id' in reply) ||
            reply.id !== id ||
            'error' in reply ||
            !('result' in reply) ||
            !reply.result ||
            typeof reply.result !== 'object' ||
            Array.isArray(reply.result)
          ) {
            finish(false);
            return;
          }
          finish(!('accepted' in reply.result && reply.result.accepted === false));
        } catch {
          finish(false);
        }
      });
      timer = setTimeout(cancel, this.timeoutMs);
      timer.unref?.();
      if (job.signal.aborted) finish(false);
    });
  }
}
