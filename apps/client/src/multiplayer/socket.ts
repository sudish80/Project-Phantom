import { io, type Socket } from 'socket.io-client';
import type { Ack, CharacterId, ClientToServer, RoomConfig, RoomState, ServerToClient } from '@phantom/shared';
import { useApp } from '../stores/app';
import { useSettings } from '../stores/settings';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

let socket: GameSocket | null = null;

/** Per-tab session token: survives refresh (sessionStorage) so you can reclaim your seat. */
export function sessionToken(): string {
  try {
    let t = sessionStorage.getItem('phantom.token');
    if (!t) {
      t = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
      sessionStorage.setItem('phantom.token', t);
    }
    return t;
  } catch {
    return 'anon' + Math.random().toString(36).slice(2);
  }
}

function rememberRoom(code: string | null) {
  try {
    if (code) sessionStorage.setItem('phantom.room', code);
    else sessionStorage.removeItem('phantom.room');
  } catch {
    /* ignore */
  }
}

function rememberedRoom(): string | null {
  try {
    return sessionStorage.getItem('phantom.room');
  } catch {
    return null;
  }
}

/**
 * Connects to the game server that served this page (same origin). In development
 * Vite proxies /socket.io to the Node server, so nothing is hard-coded to localhost.
 */
export function getSocket(): GameSocket {
  if (socket) return socket;
  const app = useApp.getState();
  socket = io({ transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 4000, timeout: 8000 });
  socket.on('connect', () => {
    useApp.getState().set({ connection: 'connected' });
    // Rejoin the room we were in (refresh / transient network loss).
    const code = useApp.getState().room?.code ?? rememberedRoom();
    if (code) {
      const s = useSettings.getState();
      socket!.emit('room:join', { code, name: s.nickname || 'Agent', character: s.character, skin: s.skin, token: sessionToken() }, (r) => {
        if (r.ok && r.data) {
          useApp.getState().set({ room: r.data, me: r.you ?? null });
          if (useApp.getState().screen === 'menu') useApp.getState().go('lobby');
          useApp.getState().toast('Reconnected to room ' + r.data.code, 'ok');
        } else {
          rememberRoom(null);
          if (useApp.getState().room) {
            useApp.getState().set({ room: null, game: null });
            useApp.getState().go('menu');
            useApp.getState().toast(r.error ?? 'Could not rejoin the room.', 'error');
          }
        }
      });
    }
  });
  socket.on('disconnect', (reason) => {
    useApp.getState().set({ connection: 'disconnected' });
    if (reason !== 'io client disconnect') useApp.getState().toast('Connection to the server lost. Reconnecting…', 'error');
  });
  socket.on('connect_error', () => useApp.getState().set({ connection: 'disconnected' }));
  socket.on('server:info', (info) => useApp.getState().set({ serverInfo: info }));
  socket.on('server:shutdown', (reason) => {
    const a = useApp.getState();
    a.toast(`Server shutting down: ${reason}`, 'error');
    rememberRoom(null);
    a.set({ room: null, game: null });
    a.go('menu');
  });
  socket.on('room:state', (room) => {
    const a = useApp.getState();
    if (!a.room || a.room.code === room.code) a.set({ room });
  });
  socket.on('room:notice', (t) => useApp.getState().toast(t));
  socket.on('room:kicked', (reason) => {
    const a = useApp.getState();
    rememberRoom(null);
    a.set({ room: null, game: null, me: null });
    a.go('menu');
    a.toast(reason, 'error');
  });
  socket.on('room:closed', () => {
    const a = useApp.getState();
    rememberRoom(null);
    if (a.room) {
      a.set({ room: null, game: null });
      a.go('menu');
      a.toast('The room was closed.', 'error');
    }
  });
  socket.on('game:start', (start) => {
    const a = useApp.getState();
    a.set({ game: { kind: 'online', start }, results: null });
    a.go('game');
  });
  socket.on('game:over', (results) => {
    useApp.getState().set({ results });
  });
  socket.on('net:ping', (t) => socket!.emit('net:pong', t));
  app.set({ connection: 'connecting' });
  return socket;
}

function ack<T>(fn: (cb: (r: Ack<T>) => void) => void, timeout = 6000): Promise<Ack<T>> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: 'The server did not respond. Check your connection.' }), timeout);
    fn((r) => {
      clearTimeout(t);
      resolve(r);
    });
  });
}

export async function createRoom(config: Partial<RoomConfig>) {
  const s = useSettings.getState();
  const sock = getSocket();
  if (!sock.connected) return { ok: false, error: 'Not connected to the game server.' } as Ack<RoomState>;
  const r = await ack<RoomState>((cb) => sock.emit('room:create', { name: s.nickname || 'Agent', character: s.character, skin: s.skin, token: sessionToken(), config }, cb));
  if (r.ok && r.data) {
    useApp.getState().set({ room: r.data, me: r.you ?? null });
    rememberRoom(r.data.code);
  }
  return r;
}

export async function joinRoom(code: string) {
  const s = useSettings.getState();
  const sock = getSocket();
  if (!sock.connected) return { ok: false, error: 'Not connected to the game server.' } as Ack<RoomState>;
  const r = await ack<RoomState>((cb) => sock.emit('room:join', { code, name: s.nickname || 'Agent', character: s.character as CharacterId, skin: s.skin, token: sessionToken() }, cb));
  if (r.ok && r.data) {
    useApp.getState().set({ room: r.data, me: r.you ?? null });
    rememberRoom(r.data.code);
  }
  return r;
}

export function leaveRoom() {
  getSocket().emit('room:leave');
  rememberRoom(null);
  useApp.getState().set({ room: null, me: null, game: null });
}

export function listRooms(): Promise<import('@phantom/shared').RoomSummary[]> {
  const sock = getSocket();
  return new Promise((resolve) => {
    if (!sock.connected) return resolve([]);
    const t = setTimeout(() => resolve([]), 4000);
    sock.emit('room:list', (rooms) => {
      clearTimeout(t);
      resolve(rooms);
    });
  });
}

export function startMatch() {
  return ack<unknown>((cb) => getSocket().emit('room:start', cb));
}

export function measurePing(): Promise<number> {
  const sock = getSocket();
  return new Promise((resolve) => {
    if (!sock.connected) return resolve(-1);
    const t0 = performance.now();
    sock.emit('net:ping', Date.now(), () => resolve(Math.round(performance.now() - t0)));
  });
}
