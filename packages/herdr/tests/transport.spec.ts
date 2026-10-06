import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { HerdrTransport, resolveLocalContext } from '../extensions/herdr/transport.ts';

const original = {
  pane_id: 'w1:p1',
  terminal_id: 'term_owned',
  workspace_id: 'w1',
  tab_id: 'w1:t1',
  focused: false,
  agent_status: 'unknown',
  revision: 1,
  label: 'initial',
};
const moved = { ...original, pane_id: 'w2:p4', workspace_id: 'w2', tab_id: 'w2:t1' };
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(handle?: (request: any, socket: Socket) => boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'ht-'));
  const path = join(dir, 'api.sock');
  const sockets = new Set<Socket>();
  const requests: any[] = [];
  let subscription: Socket;
  let panes = [original];
  const send = (socket: Socket, value: unknown) => socket.write(JSON.stringify(value) + '\n');
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const request = JSON.parse(buffer.slice(0, newline));
      buffer = '';
      requests.push(request);
      if (handle?.(request, socket)) return;
      if (request.method === 'events.subscribe') {
        subscription = socket;
        send(socket, { id: request.id, result: { type: 'subscription_started' } });
      } else if (request.method === 'session.snapshot')
        send(socket, {
          id: request.id,
          result: {
            type: 'session_snapshot',
            snapshot: {
              version: '0.9.1',
              protocol: 22,
              panes,
              workspaces: [],
              tabs: [],
              layouts: [],
              agents: [],
            },
          },
        });
      else if (request.method === 'pane.get' || request.method === 'pane.current')
        send(socket, {
          id: request.id,
          result: {
            type: request.method === 'pane.current' ? 'pane_current' : 'pane_info',
            pane: panes[0],
          },
        });
      else if (request.method === 'pane.rename') {
        panes = [{ ...panes[0], label: request.params.label }];
        send(socket, { id: request.id, result: { type: 'pane_info', pane: panes[0] } });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  });
  const context = resolveLocalContext({
    HERDR_ENV: '1',
    HERDR_SOCKET_PATH: path,
    HERDR_WORKSPACE_ID: 'w1',
    HERDR_TAB_ID: 'w1:t1',
    HERDR_PANE_ID: 'w1:p1',
  });
  const adapter = new HerdrTransport(context, { timeoutMs: 250 });
  cleanups.push(() => adapter.close());
  return {
    adapter,
    requests,
    send,
    event: (event: string, data: unknown) =>
      send(subscription, { event: event.replaceAll('.', '_'), data }),
    setPanes: (value: typeof panes) => {
      panes = value;
    },
    disconnect: () => subscription.destroy(),
  };
}
async function eventually(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw Error('condition not observed');
}

it('requires inherited local endpoint/context without config, remote or focus fallback', () => {
  expect(() => resolveLocalContext({ HERDR_ENV: '1' })).toThrow();
  expect(() => resolveLocalContext({ HERDR_ENV: '0', HERDR_SOCKET_PATH: '/api' })).toThrow();
});

it('waits for acknowledgement, buffers bootstrap events, then queries/renames explicit IDs', async () => {
  let ack: (() => void) | undefined;
  let emit: ((event: string, data: unknown) => void) | undefined;
  const f = await fixture((request, socket) => {
    if (request.method === 'events.subscribe') {
      ack = () =>
        socket.write(
          JSON.stringify({ id: request.id, result: { type: 'subscription_started' } }) + '\n',
        );
      emit = (event, data) =>
        socket.write(JSON.stringify({ event: event.replaceAll('.', '_'), data }) + '\n');
      return true;
    }
    if (request.method === 'session.snapshot') {
      emit!('pane.updated', {
        type: 'pane_updated',
        pane: { ...original, label: 'during-bootstrap' },
      });
      setTimeout(
        () =>
          socket.write(
            JSON.stringify({
              id: request.id,
              result: {
                type: 'session_snapshot',
                snapshot: {
                  version: '0.9.1',
                  protocol: 22,
                  panes: [original],
                  workspaces: [],
                  tabs: [],
                  layouts: [],
                  agents: [],
                },
              },
            }) + '\n',
          ),
        20,
      );
      return true;
    }
    return false;
  });
  const connecting = f.adapter.connect();
  await eventually(() => !!ack);
  expect(f.requests.map((r) => r.method)).toEqual(['events.subscribe']);
  ack!();
  await connecting;
  expect(f.adapter.view().panes[0].label).toBe('during-bootstrap');
  await f.adapter.currentPane();
  expect(f.requests.at(-1).params).toEqual({ caller_pane_id: 'w1:p1' });
  await f.adapter.renamePane('w1:p1', 'renamed');
  expect(f.adapter.view().panes[0].label).toBe('renamed');
  expect(f.requests.find((r) => r.method === 'pane.rename').params).toEqual({
    pane_id: 'w1:p1',
    label: 'renamed',
  });
  await expect(f.adapter.getPane('')).rejects.toMatchObject({ code: 'invalid_context' });
});

it('tracks stable terminal identity through move events and reconnect/resnapshot', async () => {
  const f = await fixture();
  await f.adapter.connect();
  f.setPanes([moved]);
  f.event('pane.moved', {
    type: 'pane_moved',
    previous_pane_id: original.pane_id,
    previous_workspace_id: 'w1',
    previous_tab_id: 'w1:t1',
    pane: moved,
  });
  await eventually(() => f.adapter.view().panes[0]?.pane_id === moved.pane_id);
  expect(f.adapter.view().panes[0].terminal_id).toBe(original.terminal_id);
  f.disconnect();
  await eventually(() => f.adapter.view().state === 'stale');
  await expect(f.adapter.getPane(moved.pane_id)).rejects.toMatchObject({ code: 'not_ready' });
  await f.adapter.reconnect();
  expect(f.adapter.view()).toMatchObject({ state: 'ready', panes: [moved] });
  expect(f.requests.filter((r) => r.method === 'session.snapshot')).toHaveLength(2);
  f.event('pane.closed', { type: 'pane_closed', pane_id: moved.pane_id, workspace_id: 'w2' });
  await eventually(() => f.adapter.view().panes.length === 0);
});

it('surfaces unsupported methods as normal structured server errors', async () => {
  const f = await fixture((request, socket) => {
    if (request.method !== 'pane.rename') return false;
    socket.write(
      JSON.stringify({
        id: request.id,
        error: { code: 'method_not_found', message: 'unsupported pane.rename' },
      }) + '\n',
    );
    return true;
  });
  await f.adapter.connect();
  await expect(f.adapter.renamePane('w1:p1', 'x')).rejects.toMatchObject({
    code: 'method_not_found',
    ambiguous: false,
  });
  expect(f.adapter.view().state).toBe('ready');
});

it.each(['wrong-id', 'wrong-result', 'invalid-json'])(
  'rejects malformed reply %s and leaves a stale view',
  async (failure) => {
    const f = await fixture((request, socket) => {
      if (request.method !== 'pane.get') return false;
      socket.write(
        failure === 'invalid-json'
          ? '{bad\n'
          : JSON.stringify({
              id: failure === 'wrong-id' ? 'other' : request.id,
              result: { type: 'pane_info', pane: {} },
            }) + '\n',
      );
      return true;
    });
    await f.adapter.connect();
    await expect(f.adapter.getPane('w1:p1')).rejects.toMatchObject({
      code: 'invalid_response',
      ambiguous: false,
    });
    expect(f.adapter.view().state).toBe('stale');
  },
);

it('does not repeat an applied mutation whose reply is lost', async () => {
  let applied = 0;
  const f = await fixture((request, socket) => {
    if (request.method !== 'pane.rename') return false;
    applied++;
    socket.destroy();
    return true;
  });
  await f.adapter.connect();
  await expect(f.adapter.renamePane('w1:p1', 'applied')).rejects.toMatchObject({
    code: 'disconnected',
    ambiguous: true,
  });
  f.setPanes([{ ...original, label: 'applied' }]);
  await f.adapter.reconnect();
  expect(f.adapter.view().panes[0].label).toBe('applied');
  expect(applied).toBe(1);
  expect(f.requests.filter((r) => r.method === 'pane.rename')).toHaveLength(1);
});

it('bounds request waits and validates events', async () => {
  const f = await fixture((request) => request.method === 'pane.rename');
  await f.adapter.connect();
  await expect(f.adapter.renamePane('w1:p1', 'x')).rejects.toMatchObject({
    code: 'timeout',
    ambiguous: true,
  });
  await f.adapter.reconnect();
  f.event('pane.moved', { type: 'pane_moved', pane: {} });
  await eventually(() => f.adapter.view().state === 'stale');
  expect(f.adapter.view().error?.code).toBe('invalid_response');
});
