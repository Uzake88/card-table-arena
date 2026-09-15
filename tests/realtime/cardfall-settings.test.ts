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
  state?: {
    phase: string;
    cardsPerPlayer: number;
    players: Array<{ hand: unknown[] }>;
  };
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

async function join(client: RealtimeClient, roomCode: string, name: string, settings?: Record<string, unknown>) {
  const requestedPlayerId = randomUUID();
  client.socket.send(JSON.stringify({
    type: 'JOIN_ROOM',
    roomCode,
    playerId: requestedPlayerId,
    commandId: randomUUID(),
    name,
    gameId: 'cardfall',
    ...(settings ? { settings } : {}),
  }));
  const welcome = await client.waitFor((message) => message.type === 'WELCOME');
  await client.waitFor((message) => message.type === 'STATE');
  return { playerId: welcome.playerId!, sessionToken: welcome.sessionToken! };
}

describe('Cardfall authoritative table settings', { timeout: 20000 }, () => {
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

  it('passes the host-selected cards-per-player value to the server reducer', async () => {
    const host = await makeClient();
    const guest = await makeClient();
    const roomCode = `SET${randomUUID().slice(0, 5).toUpperCase()}`;
    const hostSession = await join(host, roomCode, 'Host', { cardsPerPlayer: 3 });
    await join(guest, roomCode, 'Guest');

    host.socket.send(JSON.stringify({
      type: 'START_GAME',
      roomCode,
      playerId: hostSession.playerId,
      sessionToken: hostSession.sessionToken,
      commandId: randomUUID(),
    }));
    const started = await host.waitFor((message) => message.type === 'STATE' && message.state?.phase === 'playing');

    expect(started.state?.cardsPerPlayer).toBe(3);
    expect(started.state?.players.every((player) => player.hand.length === 3)).toBe(true);
  });

  it('rejects a configured deal that exceeds the standard deck capacity', async () => {
    const roomCode = `CAP${randomUUID().slice(0, 5).toUpperCase()}`;
    const roomClients = await Promise.all(Array.from({ length: 6 }, () => makeClient()));
    const hostSession = await join(roomClients[0], roomCode, 'Host', { cardsPerPlayer: 10 });
    for (let index = 1; index < roomClients.length; index++) {
      await join(roomClients[index], roomCode, `Guest ${index}`);
    }

    roomClients[0].socket.send(JSON.stringify({
      type: 'START_GAME',
      roomCode,
      playerId: hostSession.playerId,
      sessionToken: hostSession.sessionToken,
      commandId: randomUUID(),
    }));
    const outcome = await roomClients[0].waitFor(
      (message) => message.type === 'ERROR' || (message.type === 'STATE' && message.state?.phase === 'playing'),
    );

    expect(outcome).toMatchObject({
      type: 'ERROR',
      message: expect.stringMatching(/Not enough cards/),
    });
  });
});
