import type { ExtensionContext, TurnEndEvent } from '@earendil-works/pi-coding-agent';
import type { ActivityConfig } from './config.ts';
import { ActivityDigest } from './digest.ts';
import type { ActivityPublisher } from './publisher.ts';
import { generateActivity } from './summary.ts';

// @mara implements REQ-SESSION-ACTIVITY-CADENCE
// @mara implements REQ-SESSION-ACTIVITY-ASYNC
// @mara implements REQ-SESSION-ACTIVITY-CLEANUP
// @mara implements DES-SESSION-ACTIVITY-PUBLISHER
export class ActivityCoordinator {
  private active = false;
  private sessionId: string | undefined;
  private remaining = 0;
  private digest = new ActivityDigest();
  private previous: string | undefined;
  private operation: AbortController | undefined;
  private pending: ExtensionContext | undefined;
  constructor(
    private publisher: ActivityPublisher,
    private config: ActivityConfig,
    private generate: typeof generateActivity = generateActivity,
  ) {}
  start(ctx: ExtensionContext): void {
    if (this.active || ctx.mode !== 'tui' || !this.publisher.available) return;
    this.active = true;
    this.sessionId = ctx.sessionManager.getSessionId();
    this.remaining = 0;
    this.digest.reset();
    this.previous = undefined;
  }
  turn(ctx: ExtensionContext, message: TurnEndEvent['message']): void {
    if (
      !this.active ||
      ctx.mode !== 'tui' ||
      !this.publisher.available ||
      ctx.sessionManager.getSessionId() !== this.sessionId ||
      message.role !== 'assistant' ||
      message.stopReason === 'error' ||
      message.stopReason === 'aborted'
    )
      return;
    this.digest.add(message);
    if (this.remaining > 0) {
      this.remaining--;
      return;
    }
    this.remaining = this.config.intervalTurns - 1;
    this.schedule(ctx);
  }
  async reset(): Promise<boolean> {
    this.active = false;
    this.sessionId = undefined;
    this.operation?.abort();
    this.operation = undefined;
    this.pending = undefined;
    this.digest.reset();
    this.remaining = 0;
    this.previous = undefined;
    try {
      return await this.publisher.clear(new AbortController().signal);
    } catch {
      return false;
    }
  }
  private schedule(ctx: ExtensionContext): void {
    if (this.operation) {
      this.pending = ctx;
      return;
    }
    const operation = new AbortController();
    this.operation = operation;
    const id = this.sessionId;
    const mainSignal = ctx.signal;
    const cancel = () => operation.abort();
    mainSignal?.addEventListener('abort', cancel, { once: true });
    if (mainSignal?.aborted) cancel();
    const valid = () =>
      this.active &&
      this.operation === operation &&
      !operation.signal.aborted &&
      id === this.sessionId &&
      ctx.sessionManager.getSessionId() === id;
    const execute = async () => {
      const activity = await this.generate(
        ctx,
        this.config,
        this.digest.snapshot(),
        this.previous,
        operation.signal,
      );
      if (!valid() || !activity || activity === this.previous) return;
      if ((await this.publisher.publish(activity, operation.signal)) && valid())
        this.previous = activity;
    };
    void execute()
      .catch(() => {
        /* Background failures never reject into the chat run. */
      })
      .finally(() => {
        mainSignal?.removeEventListener('abort', cancel);
        if (this.operation !== operation) return;
        this.operation = undefined;
        const pending = this.pending;
        this.pending = undefined;
        if (pending && this.active) this.schedule(pending);
      })
      .catch(() => {
        /* Invalidated contexts may throw during cleanup. */
      });
  }
}
