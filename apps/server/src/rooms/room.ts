import type { Server } from 'socket.io';
import {
  isSkinId, RECONNECT_GRACE_MS, sanitizeRoomConfig, type CharacterId, type ClientToServer, type RoomConfig, type RoomPlayer, type RoomState,
  type RoomSummary, type ServerToClient, type TeamId,
} from '@phantom/shared';
import { randomUUID } from 'node:crypto';
import { log } from '../log';
import { MatchRunner } from '../matches/match-runner';

export interface Member {
  id: string;
  token: string;
  name: string;
  team: TeamId;
  character: CharacterId;
  ready: boolean;
  socketId: string | null;
  connected: boolean;
  ping: number;
  skin: string;
  removeTimer: NodeJS.Timeout | null;
}

type IO = Server<ClientToServer, ServerToClient>;

export class Room {
  readonly members = new Map<string, Member>();
  hostId = '';
  status: 'lobby' | 'in-match' = 'lobby';
  runner: MatchRunner | null = null;
  readonly createdAt = Date.now();

  constructor(
    readonly code: string,
    public config: RoomConfig,
    private readonly io: IO,
    private readonly lanUrls: () => string[],
    private readonly onEmpty: (room: Room) => void,
  ) {}

  get size() {
    return this.members.size;
  }

  teamCount(team: TeamId) {
    let n = 0;
    for (const m of this.members.values()) if (m.team === team) n++;
    return n;
  }

  pickTeam(): TeamId | null {
    const a = this.teamCount('alpha');
    const b = this.teamCount('bravo');
    const cap = this.config.teamSize;
    if (a >= cap && b >= cap) return null;
    if (a >= cap) return 'bravo';
    if (b >= cap) return 'alpha';
    return a <= b ? 'alpha' : 'bravo';
  }

  uniqueName(name: string) {
    const taken = new Set([...this.members.values()].map((m) => m.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 100; i++) {
      const n = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(n.toLowerCase())) return n;
    }
    return `${name.slice(0, 10)} ${randomUUID().slice(0, 4)}`;
  }

  findByToken(token: string) {
    for (const m of this.members.values()) if (m.token === token) return m;
    return null;
  }

  addMember(name: string, token: string, character: CharacterId, socketId: string, skin = 'standard'): Member | string {
    if (this.members.size >= this.config.maxPlayers) return 'Room is full.';
    const team = this.pickTeam();
    if (!team) return 'Both teams are full.';
    const m: Member = {
      id: randomUUID().slice(0, 8),
      token,
      name: this.uniqueName(name),
      team,
      character,
      ready: false,
      socketId,
      connected: true,
      ping: 0,
      skin,
      removeTimer: null,
    };
    this.members.set(m.id, m);
    if (!this.hostId) this.hostId = m.id;
    if (this.runner) this.runner.addPlayer(m.id, m.name, m.team, m.character, m.skin);
    log.info(`[${this.code}] ${m.name} joined (${this.members.size}/${this.config.maxPlayers})`);
    return m;
  }

  reconnect(m: Member, socketId: string) {
    if (m.removeTimer) clearTimeout(m.removeTimer);
    m.removeTimer = null;
    m.socketId = socketId;
    m.connected = true;
    this.runner?.match.setConnected(m.id, true);
    if (!this.members.get(this.hostId)?.connected) this.hostId = m.id;
    log.info(`[${this.code}] ${m.name} reconnected`);
  }

  disconnect(m: Member) {
    m.connected = false;
    m.socketId = null;
    this.runner?.match.setConnected(m.id, false);
    if (this.hostId === m.id) this.transferHost();
    m.removeTimer = setTimeout(() => this.removeMember(m.id, 'timed out'), RECONNECT_GRACE_MS);
    log.info(`[${this.code}] ${m.name} disconnected (grace ${RECONNECT_GRACE_MS / 1000}s)`);
    this.broadcastState();
  }

  transferHost() {
    const next = [...this.members.values()].find((x) => x.connected && x.id !== this.hostId);
    if (next) {
      this.hostId = next.id;
      this.notice(`${next.name} is now the host.`);
    }
  }

  removeMember(id: string, reason: string) {
    const m = this.members.get(id);
    if (!m) return;
    if (m.removeTimer) clearTimeout(m.removeTimer);
    this.members.delete(id);
    this.runner?.match.removePlayer(id);
    log.info(`[${this.code}] ${m.name} left (${reason})`);
    if (this.hostId === id) {
      this.hostId = '';
      const next = [...this.members.values()].find((x) => x.connected) ?? [...this.members.values()][0];
      if (next) {
        this.hostId = next.id;
        this.notice(`${next.name} is now the host.`);
      }
    }
    if (this.members.size === 0) {
      this.close('empty');
      this.onEmpty(this);
      return;
    }
    this.broadcastState();
  }

  update(m: Member, p: { team?: unknown; character?: unknown; ready?: unknown; skin?: unknown }, isChar: (v: unknown) => v is CharacterId) {
    if (isSkinId(p.skin)) m.skin = p.skin;
    if (this.status !== 'lobby') {
      // allow character change only in lobby
      return;
    }
    if ((p.team === 'alpha' || p.team === 'bravo') && p.team !== m.team) {
      if (!this.config.allowTeamSelect) this.notice('Team selection is disabled by the host.', m);
      else if (this.teamCount(p.team) >= this.config.teamSize) this.notice('That team is full.', m);
      else {
        m.team = p.team;
        m.ready = false;
      }
    }
    if (isChar(p.character)) m.character = p.character;
    if (typeof p.ready === 'boolean') m.ready = p.ready;
    this.broadcastState();
  }

  setConfig(input: Partial<RoomConfig>) {
    const next = sanitizeRoomConfig(input, this.config);
    next.maxPlayers = Math.max(next.maxPlayers, this.members.size);
    this.config = next;
    this.broadcastState();
  }

  /** Validate & start. Returns an error string on failure. */
  start(): string | null {
    if (this.status !== 'lobby') return 'Match already in progress.';
    const connected = [...this.members.values()].filter((m) => m.connected);
    if (connected.length === 0) return 'No players connected.';
    const notReady = connected.filter((m) => m.id !== this.hostId && !m.ready);
    if (notReady.length) return `Waiting for: ${notReady.map((m) => m.name).join(', ')}`;
    this.runner = new MatchRunner(
      this.config,
      (snap) => this.io.to(this.code).emit('game:snap', snap),
      (result) => this.io.to(this.code).emit('game:over', result),
      () => this.endMatch(),
    );
    for (const m of this.members.values()) this.runner.addPlayer(m.id, m.name, m.team, m.character, m.skin);
    for (const m of this.members.values()) if (!m.connected) this.runner.match.setConnected(m.id, false);
    this.status = 'in-match';
    for (const m of this.members.values()) this.sendGameStart(m);
    this.runner.start();
    log.info(`[${this.code}] match started: ${this.config.mode} on ${this.config.map} with ${this.members.size} players`);
    this.broadcastState();
    return null;
  }

  sendGameStart(m: Member) {
    if (!m.socketId || !this.runner) return;
    this.io.to(m.socketId).emit('game:start', {
      you: m.id,
      mode: this.config.mode,
      map: this.config.map,
      config: this.config,
      tick: this.runner.match.tick,
    });
  }

  endMatch() {
    this.runner?.stop();
    this.runner = null;
    this.status = 'lobby';
    for (const m of this.members.values()) m.ready = false;
    log.info(`[${this.code}] match finished, back to lobby`);
    this.broadcastState();
  }

  close(reason: string) {
    this.runner?.stop();
    this.runner = null;
    for (const m of this.members.values()) if (m.removeTimer) clearTimeout(m.removeTimer);
    this.io.to(this.code).emit('room:closed', reason);
    log.info(`[${this.code}] room closed (${reason})`);
  }

  notice(text: string, to?: Member) {
    if (to?.socketId) this.io.to(to.socketId).emit('room:notice', text);
    else if (!to) this.io.to(this.code).emit('room:notice', text);
  }

  setPing(m: Member, ping: number) {
    m.ping = Math.round(ping);
    this.runner?.match.setPing(m.id, ping);
  }

  state(): RoomState {
    const players: RoomPlayer[] = [...this.members.values()].map((m) => ({
      id: m.id, name: m.name, team: m.team, character: m.character, ready: m.ready, connected: m.connected,
      isHost: m.id === this.hostId, ping: m.ping, skin: m.skin,
    }));
    return { code: this.code, config: this.config, players, hostId: this.hostId, status: this.status, lanUrls: this.lanUrls() };
  }

  summary(): RoomSummary {
    return {
      code: this.code, name: this.config.name, mode: this.config.mode, map: this.config.map, players: this.members.size,
      maxPlayers: this.config.maxPlayers, status: this.status, host: this.members.get(this.hostId)?.name ?? '',
    };
  }

  broadcastState() {
    this.io.to(this.code).emit('room:state', this.state());
  }
}
