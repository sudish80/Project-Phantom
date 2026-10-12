import type { Server, Socket } from 'socket.io';
import {
  isCharacterId, isSkinId, sanitizeName, sanitizeRoomConfig, type Ack, type ClientToServer, type RoomState, type ServerToClient,
} from '@phantom/shared';
import { log } from '../log';
import { RateLimiter } from '../networking/rate-limit';
import { generateRoomCode, normalizeCode } from './codes';
import { Room, type Member } from './room';

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFn = (v: unknown): v is (...a: any[]) => void => typeof v === 'function';

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private bySocket = new Map<string, { room: Room; member: Member }>();
  private pingTimer: NodeJS.Timeout;

  constructor(private readonly io: IO, private readonly lanUrls: () => string[]) {
    io.on('connection', (s) => this.attach(s));
    this.pingTimer = setInterval(() => io.emit('net:ping', Date.now()), 2000);
  }

  dispose() {
    clearInterval(this.pingTimer);
    for (const r of this.rooms.values()) r.close('server shutdown');
    this.rooms.clear();
  }

  publicRooms() {
    return [...this.rooms.values()].filter((r) => r.config.visibility === 'public').map((r) => r.summary());
  }

  private ctx(s: Sock) {
    return this.bySocket.get(s.id) ?? null;
  }

  private attach(s: Sock) {
    const general = new RateLimiter(20, 40);
    const inputs = new RateLimiter(90, 60);
    let violations = 0;

    /** Wrap a handler: rate-limit, catch errors, never crash the server on bad input. */
    const on = <A extends unknown[]>(event: string, fn: (...a: A) => void, limiter = general) => {
      s.on(event as any, (...args: any[]) => {
        if (!limiter.take()) {
          if (++violations > 400) {
            log.warn(`Disconnecting ${s.id}: excessive message rate`);
            s.disconnect(true);
          }
          const cb = args[args.length - 1];
          if (isFn(cb)) cb({ ok: false, error: 'Rate limited.' });
          return;
        }
        try {
          fn(...(args as A));
        } catch (err) {
          log.error(`Handler ${event} failed`, err);
          const cb = args[args.length - 1];
          if (isFn(cb)) cb({ ok: false, error: 'Server error.' });
        }
      });
    };

    on('room:list', (cb: unknown) => {
      if (isFn(cb)) cb(this.publicRooms());
    });

    on('room:create', (p: unknown, cb: unknown) => {
      if (!isFn(cb)) return;
      if (!isObj(p)) return cb({ ok: false, error: 'Invalid request.' });
      this.leave(s, 'switched room');
      const config = sanitizeRoomConfig(isObj(p.config) ? (p.config as object) : {});
      const code = generateRoomCode((c) => this.rooms.has(c));
      const room = new Room(code, config, this.io, this.lanUrls, (r) => this.rooms.delete(r.code));
      this.rooms.set(code, room);
      const token = typeof p.token === 'string' ? p.token.slice(0, 64) : s.id;
      const res = room.addMember(sanitizeName(p.name), token, isCharacterId(p.character) ? p.character : 'vanguard', s.id, isSkinId(p.skin) ? p.skin : 'standard');
      if (typeof res === 'string') return cb({ ok: false, error: res });
      room.hostId = res.id;
      this.bind(s, room, res);
      log.info(`[${code}] room created by ${res.name} (${config.mode}, ${config.map}, max ${config.maxPlayers})`);
      cb({ ok: true, data: room.state(), you: res.id } satisfies Ack<RoomState>);
      room.broadcastState();
    });

    on('room:join', (p: unknown, cb: unknown) => {
      if (!isFn(cb)) return;
      if (!isObj(p)) return cb({ ok: false, error: 'Invalid request.' });
      const code = normalizeCode(p.code);
      const room = this.rooms.get(code);
      if (!room) return cb({ ok: false, error: `Room "${code || '?'}" was not found. Check the code and server address.` });
      const token = typeof p.token === 'string' ? p.token.slice(0, 64) : '';
      const existing = token ? room.findByToken(token) : null;
      const current = this.ctx(s);
      if (current && current.room === room && existing === current.member) return cb({ ok: true, data: room.state(), you: existing.id });
      this.leave(s, 'switched room');
      let member: Member;
      if (existing) {
        if (existing.connected && existing.socketId && existing.socketId !== s.id) {
          // Same tab session connected twice (e.g. duplicated tab): kick the stale socket.
          this.io.sockets.sockets.get(existing.socketId)?.emit('room:kicked', 'Signed in from another tab.');
          this.bySocket.delete(existing.socketId);
        }
        room.reconnect(existing, s.id);
        member = existing;
      } else {
        const res = room.addMember(sanitizeName(p.name), token || s.id, isCharacterId(p.character) ? p.character : 'vanguard', s.id, isSkinId(p.skin) ? p.skin : 'standard');
        if (typeof res === 'string') return cb({ ok: false, error: res });
        member = res;
        if (room.status === 'in-match') room.notice(`${member.name} joined the match in progress.`);
      }
      this.bind(s, room, member);
      cb({ ok: true, data: room.state(), you: member.id });
      room.broadcastState();
      if (room.status === 'in-match') room.sendGameStart(member);
    });

    on('room:leave', () => this.leave(s, 'left'));

    on('room:update', (p: unknown) => {
      const c = this.ctx(s);
      if (!c || !isObj(p)) return;
      c.room.update(c.member, p, isCharacterId);
    });

    on('room:config', (p: unknown) => {
      const c = this.ctx(s);
      if (!c || !isObj(p)) return;
      if (c.room.hostId !== c.member.id) return c.room.notice('Only the host can change room settings.', c.member);
      if (c.room.status !== 'lobby') return;
      c.room.setConfig(p as object);
    });

    on('room:kick', (p: unknown) => {
      const c = this.ctx(s);
      if (!c || !isObj(p) || typeof p.playerId !== 'string') return;
      if (c.room.hostId !== c.member.id || p.playerId === c.member.id) return;
      const target = c.room.members.get(p.playerId);
      if (!target) return;
      if (target.socketId) {
        const ts = this.io.sockets.sockets.get(target.socketId);
        ts?.emit('room:kicked', 'You were removed from the room by the host.');
        ts?.leave(c.room.code);
        this.bySocket.delete(target.socketId);
      }
      c.room.removeMember(target.id, 'kicked');
    });

    on('room:start', (cb: unknown) => {
      if (!isFn(cb)) return;
      const c = this.ctx(s);
      if (!c) return cb({ ok: false, error: 'You are not in a room.' });
      if (c.room.hostId !== c.member.id) return cb({ ok: false, error: 'Only the host can start the match.' });
      const err = c.room.start();
      cb(err ? { ok: false, error: err } : { ok: true });
    });

    on('room:return', () => {
      const c = this.ctx(s);
      if (c) s.emit('room:state', c.room.state());
    });

    on(
      'game:input',
      (cmds: unknown) => {
        const c = this.ctx(s);
        if (!c || !c.room.runner) return;
        if (!c.room.runner.match.pushInputs(c.member.id, cmds)) violations++;
      },
      inputs,
    );

    const shop = (kind: 'buy' | 'sell') => (p: unknown, cb: unknown) => {
      if (!isFn(cb)) return;
      const c = this.ctx(s);
      if (!c || !c.room.runner) return cb({ ok: false, error: 'No match in progress.' });
      if (!isObj(p) || typeof p.item !== 'string') return cb({ ok: false, error: 'Invalid item.' });
      const m = c.room.runner.match;
      cb(kind === 'buy' ? m.buy(c.member.id, p.item) : m.sell(c.member.id, p.item));
    };
    on('game:buy', shop('buy'));
    on('game:sell', shop('sell'));

    on('net:ping', (t: unknown, cb: unknown) => {
      if (isFn(cb)) cb(typeof t === 'number' ? t : 0);
    });
    on('net:pong', (t: unknown) => {
      const c = this.ctx(s);
      if (c && typeof t === 'number') {
        const rtt = Date.now() - t;
        if (rtt >= 0 && rtt < 10_000) c.room.setPing(c.member, rtt);
      }
    });

    s.on('disconnect', () => {
      const c = this.ctx(s);
      this.bySocket.delete(s.id);
      if (c && c.member.socketId === s.id) c.room.disconnect(c.member);
    });
  }

  private bind(s: Sock, room: Room, member: Member) {
    this.bySocket.set(s.id, { room, member });
    s.join(room.code);
  }

  private leave(s: Sock, reason: string) {
    const c = this.ctx(s);
    if (!c) return;
    this.bySocket.delete(s.id);
    s.leave(c.room.code);
    c.room.removeMember(c.member.id, reason);
  }
}
