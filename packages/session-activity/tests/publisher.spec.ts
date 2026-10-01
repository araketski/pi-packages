import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HerdrPublisher } from '../extensions/session-activity/publisher.ts';

const fixtures: { server: Server; dir: string; sockets: Set<Socket>; publisher: HerdrPublisher }[] =
  [];
afterEach(async () => {
  for (const h of fixtures.splice(0)) {
    h.publisher.dispose();
    h.sockets.forEach((socket) => socket.destroy());
    await new Promise<void>((done) => h.server.close(() => done()));
    rmSync(h.dir, { recursive: true, force: true });
  }
});
type Request = {
  id: string;
  method: string;
  params: { pane_id: string; source: string; seq: number; tokens: { activity: string | null } };
};
async function harness(reply: (req: Request, socket: Socket) => void, timeoutMs = 50) {
  const dir = mkdtempSync(join(tmpdir(), 'activity-socket-'));
  const path = join(dir, 'herdr.sock');
  const requests: Request[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let text = '';
    socket.on('data', (data) => {
      text += data.toString();
      if (!text.includes('\n')) return;
      const req = JSON.parse(text.split('\n')[0]!) as Request;
      requests.push(req);
      reply(req, socket);
    });
  });
  await new Promise<void>((done) => server.listen(path, done));
  const publisher = new HerdrPublisher(
    { HERDR_ENV: '1', HERDR_SOCKET_PATH: path, HERDR_PANE_ID: 'w-test:p-test' },
    { timeoutMs },
  );
  fixtures.push({ server, dir, sockets, publisher });
  return { publisher, requests, sockets, path };
}
const signal = () => new AbortController().signal;

// @mara checks REQ-SESSION-ACTIVITY-TRANSPORT
// @mara checks REQ-SESSION-ACTIVITY-ISOLATION
// @mara checks REQ-SESSION-ACTIVITY-CLEANUP
// @mara implements VER-SESSION-ACTIVITY-PUBLISHER
describe('direct Herdr metadata RPC', () => {
  it('publishes/clears only activity, validates fragmented replies, and advances sequencing', async () => {
    const h = await harness((req, socket) => {
      const response = JSON.stringify({ id: req.id, result: { accepted: true } }) + '\n';
      socket.write(response.slice(0, 5));
      setImmediate(() => socket.end(response.slice(5)));
    });
    expect(await h.publisher.publish('Running parser tests', signal())).toBe(true);
    expect(await h.publisher.clear(signal())).toBe(true);
    expect(h.requests.map((req) => req.method)).toEqual([
      'pane.report_metadata',
      'pane.report_metadata',
    ]);
    expect(h.requests[0]?.params).toEqual({
      pane_id: 'w-test:p-test',
      source: 'pi:session-activity',
      agent: 'pi',
      seq: expect.any(Number),
      tokens: { activity: 'Running parser tests' },
    });
    expect(h.requests[1]?.params.tokens).toEqual({ activity: null });
    expect(h.requests[1]!.params.seq).toBeGreaterThan(h.requests[0]!.params.seq);
    expect(h.requests[1]!.id).not.toBe(h.requests[0]!.id);
    expect(JSON.stringify(h.requests)).not.toMatch(/ttl_ms|state|title|report_agent/);
  });
  it.each(['error', 'malformed', 'wrong-id', 'empty', 'oversized', 'rejected'])(
    'rejects %s responses without retries',
    async (kind) => {
      const h = await harness((req, socket) => {
        if (kind === 'error')
          socket.end(JSON.stringify({ id: req.id, error: { code: 'unavailable' } }) + '\n');
        if (kind === 'malformed') socket.end('not json\n');
        if (kind === 'wrong-id') socket.end(JSON.stringify({ id: 'other', result: {} }) + '\n');
        if (kind === 'empty') socket.end();
        if (kind === 'oversized') socket.end('a'.repeat(65537));
        if (kind === 'rejected')
          socket.end(JSON.stringify({ id: req.id, result: { accepted: false } }) + '\n');
      });
      expect(await h.publisher.publish('Running tests', signal())).toBe(false);
      expect(h.requests).toHaveLength(1);
    },
  );
  it('bounds hung calls and allows later normal publication', async () => {
    const h = await harness((req, socket) => {
      if (h.requests.length > 1) socket.end(JSON.stringify({ id: req.id, result: {} }) + '\n');
    }, 20);
    expect(await h.publisher.publish('Running tests', signal())).toBe(false);
    expect(await h.publisher.publish('Inspecting code', signal())).toBe(true);
    expect(h.requests).toHaveLength(2);
  });
  it('cancels an in-flight publish then sends an ordered clear with a newer sequence', async () => {
    const h = await harness((req, socket) => {
      if (req.params.tokens.activity === null)
        socket.end(JSON.stringify({ id: req.id, result: {} }) + '\n');
    }, 100);
    const abort = new AbortController();
    const published = h.publisher.publish('Running tests', abort.signal);
    await new Promise((done) => setTimeout(done, 10));
    abort.abort();
    const cleared = h.publisher.clear(signal());
    expect(await published).toBe(false);
    expect(await cleared).toBe(true);
    expect(h.requests[1]!.params.seq).toBeGreaterThan(h.requests[0]!.params.seq);
    h.publisher.dispose();
    h.publisher.dispose();
    expect(await h.publisher.publish('Late update', signal())).toBe(false);
  });
  it('preserves sequence order across adapter replacement and coalesces queued writes', async () => {
    let release!: () => void;
    const h = await harness((req, socket) => {
      const finish = () => socket.end(JSON.stringify({ id: req.id, result: {} }) + '\n');
      if (h.requests.length === 1) release = finish;
      else finish();
    }, 500);
    const first = h.publisher.publish('First activity', signal());
    await new Promise((done) => setTimeout(done, 10));
    const stale = h.publisher.publish('Obsolete queued activity', signal());
    const clear = h.publisher.clear(signal());
    expect(await stale).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(await clear).toBe(true);
    expect(h.requests).toHaveLength(2);
    const replacement = new HerdrPublisher({
      HERDR_ENV: '1',
      HERDR_SOCKET_PATH: h.path,
      HERDR_PANE_ID: 'w-test:p-test',
    });
    try {
      expect(await replacement.publish('New run activity', signal())).toBe(true);
      expect(h.requests[2]!.params.seq).toBeGreaterThan(h.requests[1]!.params.seq);
    } finally {
      replacement.dispose();
    }
  });
  it('is unavailable without full caller context and never opens a socket', async () => {
    for (const env of [
      {},
      { HERDR_ENV: '1' },
      { HERDR_ENV: '0', HERDR_SOCKET_PATH: '/missing', HERDR_PANE_ID: 'p' },
    ]) {
      const publisher = new HerdrPublisher(env);
      expect(publisher.available).toBe(false);
      expect(await publisher.publish('Running tests', signal())).toBe(false);
      expect(await publisher.clear(signal())).toBe(false);
      publisher.dispose();
    }
  });
});
