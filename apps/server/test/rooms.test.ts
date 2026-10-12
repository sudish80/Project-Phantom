import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { BTN, eyeFor, type Ack, type RoomState, type Snapshot, type GameStartPayload, type InputCmd } from '@phantom/shared';
import { setQuiet } from '../src/log';
import { createGameServer } from '../src/server';

setQuiet(true);
let game: ReturnType<typeof createGameServer>;
let url = '';
const sockets: Socket[] = [];

beforeAll(async () => {
  game = createGameServer({ port: 0, host: '127.0.0.1', staticDir: undefined });
  const port = await game.listen();
  url = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await game.close();
});

function client(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

function emitAck<T>(s: Socket, ev: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => s.emit(ev, ...args, (r: T) => resolve(r)));
}

function waitFor<T>(s: Socket, ev: string, pred: (v: T) => boolean = () => true, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      s.off(ev, h);
      reject(new Error(`timeout waiting for ${ev}`));
    }, ms);
    const h = (v: T) => {
      if (pred(v)) {
        clearTimeout(t);
        s.off(ev, h);
        resolve(v);
      }
    };
    s.on(ev, h);
  });
}

const tok = () => Math.random().toString(36).slice(2);

describe('rooms over Socket.IO', () => {
  it('serves health info', async () => {
    const r = await fetch(`${url}/api/health`);
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
  });

  it('creates a room with a short unique code and lists it', async () => {
    const a = await client();
    const res = await emitAck<Ack<RoomState>>(a, 'room:create', { name: 'Host', character: 'vanguard', token: tok(), config: { name: 'Test Room', maxPlayers: 4 } });
    expect(res.ok).toBe(true);
    expect(res.data!.code).toMatch(/^[A-Z0-9]{5}$/);
    expect(res.data!.players[0].isHost).toBe(true);
    const list = await emitAck<{ code: string }[]>(a, 'room:list');
    expect(list.some((r) => r.code === res.data!.code)).toBe(true);
    a.emit('room:leave');
  });

  it('rejects invalid codes and full rooms, de-duplicates names, assigns teams', async () => {
    const host = await client();
    const created = await emitAck<Ack<RoomState>>(host, 'room:create', { name: 'Ace', character: 'medic', token: tok(), config: { maxPlayers: 2, teamSize: 1 } });
    const code = created.data!.code;
    const b = await client();
    const bad = await emitAck<Ack>(b, 'room:join', { code: 'ZZZZZ', name: 'B', character: 'specter', token: tok() });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/not found/);
    const ok = await emitAck<Ack<RoomState>>(b, 'room:join', { code: code.toLowerCase(), name: 'Ace', character: 'specter', token: tok() });
    expect(ok.ok).toBe(true);
    const names = ok.data!.players.map((p) => p.name);
    expect(names).toContain('Ace 2');
    expect(new Set(ok.data!.players.map((p) => p.team)).size).toBe(2);
    const c = await client();
    const full = await emitAck<Ack>(c, 'room:join', { code, name: 'C', character: 'bastion', token: tok() });
    expect(full.ok).toBe(false);
    expect(full.error).toMatch(/full/i);
    host.emit('room:leave');
    b.emit('room:leave');
  });

  it('transfers host on leave, supports kick and reconnection by token', async () => {
    const host = await client();
    const created = await emitAck<Ack<RoomState>>(host, 'room:create', { name: 'H', character: 'medic', token: tok(), config: {} });
    const code = created.data!.code;
    const bTok = tok();
    let b = await client();
    await emitAck(b, 'room:join', { code, name: 'B', character: 'specter', token: bTok });
    // reconnection: drop B's socket, rejoin with the same token -> same seat
    const bId = (await emitAck<Ack<RoomState>>(b, 'room:join', { code, name: 'B', character: 'specter', token: bTok })).data!.players.find((p) => p.name === 'B')!.id;
    b.disconnect();
    await waitFor<RoomState>(host, 'room:state', (s) => s.players.some((p) => p.id === bId && !p.connected));
    b = await client();
    const re = await emitAck<Ack<RoomState>>(b, 'room:join', { code, name: 'B', character: 'specter', token: bTok });
    expect(re.data!.players.filter((p) => p.name.startsWith('B')).length).toBe(1);
    expect(re.data!.players.find((p) => p.id === bId)!.connected).toBe(true);
    // kick
    const c = await client();
    const cj = await emitAck<Ack<RoomState>>(c, 'room:join', { code, name: 'C', character: 'bastion', token: tok() });
    const cId = cj.data!.players.find((p) => p.name === 'C')!.id;
    const kicked = waitFor<string>(c, 'room:kicked');
    host.emit('room:kick', { playerId: cId });
    expect(await kicked).toMatch(/removed/);
    // host leaves -> B becomes host
    const st = waitFor<RoomState>(b, 'room:state', (s) => s.hostId === bId);
    host.emit('room:leave');
    expect((await st).hostId).toBe(bId);
    b.emit('room:leave');
  });

  it('only the host can start, and everyone must be ready', async () => {
    const host = await client();
    const created = await emitAck<Ack<RoomState>>(host, 'room:create', { name: 'H', character: 'medic', token: tok(), config: {} });
    const b = await client();
    await emitAck(b, 'room:join', { code: created.data!.code, name: 'B', character: 'specter', token: tok() });
    expect((await emitAck<Ack>(b, 'room:start')).error).toMatch(/host/);
    expect((await emitAck<Ack>(host, 'room:start')).error).toMatch(/Waiting/);
    host.emit('room:leave');
    b.emit('room:leave');
  });

  it('two clients play a match: movement sync and server-validated damage', async () => {
    const a = await client();
    const created = await emitAck<Ack<RoomState>>(a, 'room:create', { name: 'Alpha', character: 'vanguard', token: tok(), config: { mode: 'tdm', map: 'iron' } });
    const code = created.data!.code;
    const b = await client();
    await emitAck(b, 'room:join', { code, name: 'Bravo', character: 'bastion', token: tok() });
    b.emit('room:update', { ready: true });
    await waitFor<RoomState>(a, 'room:state', (s) => s.players.every((p) => p.isHost || p.ready));
    const startA = waitFor<GameStartPayload>(a, 'game:start');
    const startB = waitFor<GameStartPayload>(b, 'game:start');
    expect((await emitAck<Ack>(a, 'room:start')).ok).toBe(true);
    const [ga, gb] = await Promise.all([startA, startB]);
    expect(ga.you).not.toBe(gb.you);

    // B walks forward; A should observe B's position change in snapshots.
    let seqB = 1;
    const first = await waitFor<Snapshot>(a, 'game:snap');
    const b0 = first.players.find((p) => p.id === gb.you)!;
    const walk = setInterval(() => {
      const cmds: InputCmd[] = [0, 1].map(() => ({ s: seqB++, f: 1, r: 0, b: 0, y: b0.yaw, p: 0, sl: 0, vt: 0 }));
      b.emit('game:input', cmds);
    }, 33);
    await new Promise((r) => setTimeout(r, 700));
    clearInterval(walk);
    const later = await waitFor<Snapshot>(a, 'game:snap');
    const b1 = later.players.find((p) => p.id === gb.you)!;
    expect(Math.hypot(b1.x - b0.x, b1.z - b0.z)).toBeGreaterThan(1);
    expect(b1.seq).toBeGreaterThan(5);

    // Clients cannot assign damage: there is no such message. Shooting during warmup does nothing.
    const snapNow = await waitFor<Snapshot>(a, 'game:snap');
    const pa = snapNow.players.find((p) => p.id === ga.you)!;
    const pb = snapNow.players.find((p) => p.id === gb.you)!;
    const ex = pa.x, ey = pa.y + eyeFor(0), ez = pa.z;
    const dx = pb.x - ex, dy = pb.y + 1.2 - ey, dz = pb.z - ez;
    let seqA = 1;
    const fireOnce = () => a.emit('game:input', [
      { s: seqA++, f: 0, r: 0, b: BTN.FIRE, y: Math.atan2(-dx, -dz), p: Math.atan2(dy, Math.hypot(dx, dz)), sl: 2, vt: snapNow.tick },
      { s: seqA++, f: 0, r: 0, b: 0, y: Math.atan2(-dx, -dz), p: Math.atan2(dy, Math.hypot(dx, dz)), sl: 2, vt: snapNow.tick },
    ]);
    fireOnce();
    const s2 = await waitFor<Snapshot>(a, 'game:snap', (s) => s.players.find((p) => p.id === ga.you)!.seq >= seqA - 1);
    expect(s2.match.phase).toBe('buy');
    expect(s2.players.find((p) => p.id === gb.you)!.hp).toBe(100);

    // Purchases are validated by the server.
    const buy = await emitAck<Ack>(a, 'game:buy', { item: 'not-a-gun' });
    expect(buy.ok).toBe(false);
    a.emit('room:leave');
    b.emit('room:leave');
  });
});
