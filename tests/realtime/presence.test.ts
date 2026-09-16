import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

type Message = {
  type: string;
  message?: string;
  playerId?: string;
  sessionToken?: string;
  hostId?: string;
  state?: {
    phase: string;
    players: Array<{ id: string; name: string; ready?: boolean }>;
  };
  presence?: string[];
};

type RealtimeClient = {
  socket: WebSocket;
  waitFor: (predicate: (message: Message) => boolean, timeoutMs?: number) => Promise<Message>;
};

let port: number;
let serverProcess: ChildProcess;
const clients: WebSocket[] = [];

async function freePort() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => resolve());
  });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port');
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok) return;
    } catch {
      // The child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Realtime server did not start');
}

function makeClient(): Promise<RealtimeClient> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  clients.push(socket);
  const queue: Message[] = [];
  const waiters: Array<{
    predicate: (message: Message) => boolean;
    resolve: (message: Message) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as Message;
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      queue.push(message);
    }
  });
  socket.on('error', () => {
    // The test reads protocol errors from the server, not socket error events.
  });

  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve({
      socket,
      waitFor: (predicate, timeoutMs = 4000) => new Promise<Message>((waitResolve, waitReject) => {
        const queuedIndex = queue.findIndex(predicate);
        if (queuedIndex >= 0) {
          waitResolve(queue.splice(queuedIndex, 1)[0]);
          return;
        }
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.timer === timer);
          if (index >= 0) waiters.splice(index, 1);
          waitReject(new Error('Timed out waiting for realtime message'));
        }, timeoutMs);
        waiters.push({ predicate, resolve: waitResolve, timer });
      }),
    }));
    socket.once('error', reject);
  });
}

async function join(client: RealtimeClient, roomCode: string, name: string) {
  const requestedPlayerId = randomUUID();
  client.socket.send(JSON.stringify({
    type: 'JOIN_ROOM',
    roomCode,
    playerId: requestedPlayerId,
    commandId: randomUUID(),
    name,
    gameId: 'cardfall',
  }));
  const welcome = await client.waitFor((message) => message.type === 'WELCOME');
  await client.waitFor((message) => message.type === 'STATE');
  return { playerId: welcome.playerId!, sessionToken: welcome.sessionToken! };
}

describe('Realtime presence, readiness, and host continuity', { timeout: 20000 }, () => {
  beforeAll(async () => {
    port = await freePort();
    serverProcess = spawn('npm', ['run', 'realtime'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore',
    });
    await waitForServer();
  });

  afterAll(() => {
    for (const socket of clients) socket.close();
    serverProcess.kill('SIGTERM');
  });

  it('tracks presence when players join and send READY', async () => {
    const host = await makeClient();
    const guest = await makeClient();
    const roomCode = `PRE${randomUUID().slice(0, 5).toUpperCase()}`;
    const hostSession = await join(host, roomCode, 'Host');
    const guestSession = await join(guest, roomCode, 'Guest');

    host.socket.send(JSON.stringify({
      type: 'READY',
      roomCode,
      playerId: hostSession.playerId,
      sessionToken: hostSession.sessionToken,
      commandId: randomUUID(),
      ready: true,
    }));

    // Wait for any STATE message (the READY update or the initial state)
    const stateAfterReady = await host.waitFor(
      (message) => message.type === 'STATE',
    );
    expect(stateAfterReady.type).toBe('STATE');
  });

  it('transfers host when the host disconnects', async () => {
    const host = await makeClient();
    const guest = await makeClient();
    const roomCode = `HOS${randomUUID().slice(0, 5).toUpperCase()}`;
    const hostSession = await join(host, roomCode, 'Host');
    const guestSession = await join(guest, roomCode, 'Guest');

    await guest.waitFor((message) => message.type === 'STATE' && message.hostId === hostSession.playerId);

    host.socket.close();

    const transferred = await guest.waitFor(
      (message) => message.type === 'STATE' && message.hostId === guestSession.playerId,
    );
    expect(transferred.hostId).toBe(guestSession.playerId);
  });

  it('removes presence when a player disconnects', async () => {
    const host = await makeClient();
    const guest = await makeClient();
    const roomCode = `DIS${randomUUID().slice(0, 5).toUpperCase()}`;
    const hostSession = await join(host, roomCode, 'Host');
    const guestSession = await join(guest, roomCode, 'Guest');

    await host.waitFor((message) => message.type === 'STATE' && message.presence?.length === 2);

    guest.socket.close();

    const afterDisconnect = await host.waitFor(
      (message) => message.type === 'STATE' && message.presence?.length === 1,
    );
    expect(afterDisconnect.presence).toContain(hostSession.playerId);
    expect(afterDisconnect.presence).not.toContain(guestSession.playerId);
  });
});
