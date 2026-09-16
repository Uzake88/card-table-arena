import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type PersistedRoom = {
  code: string;
  hostId: string;
  gameId: string;
  settings: Record<string, string | number | boolean>;
  state: unknown;
  version: number;
  sessions: Array<{ playerId: string; token: string }>;
};

const DATA_DIR = process.env.DATA_DIR || './data';
const DATA_FILE = `${DATA_DIR}/rooms.json`;

let cache: Map<string, PersistedRoom> | null = null;

function ensureDir() {
  if (!existsSync(DATA_FILE)) {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    if (!existsSync(DATA_FILE)) writeFileSync(DATA_FILE, '[]', 'utf-8');
  }
}

function load(): Map<string, PersistedRoom> {
  if (cache) return cache;
  ensureDir();
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedRoom[];
    cache = new Map(parsed.map((room) => [room.code, room]));
  } catch {
    cache = new Map();
  }
  return cache;
}

function flush() {
  if (!cache) return;
  ensureDir();
  const rooms = [...cache.values()];
  writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2), 'utf-8');
}

export function loadRooms(): Map<string, PersistedRoom> {
  return load();
}

export function saveRoom(room: PersistedRoom): void {
  const rooms = load();
  rooms.set(room.code, room);
  flush();
}

export function deleteRoom(code: string): void {
  const rooms = load();
  rooms.delete(code);
  flush();
}

export function persistCommandDedupe(_code: string, _commandId: string, _record: unknown): void {
  // Optional: persisted command dedupe could go here in the future
}
