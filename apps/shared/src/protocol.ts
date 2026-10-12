import type { CharacterId, InputCmd, MatchResult, RoomConfig, RoomState, RoomSummary, Snapshot, TeamId, GameMode, MapId } from './types';

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
  /** your member id (room create/join) */
  you?: string;
}

export interface JoinPayload {
  name: string;
  character: CharacterId;
  /** per-tab session token, used to reclaim a seat after refresh / disconnect */
  token: string;
  /** cosmetic weapon skin id */
  skin?: string;
}

export interface GameStartPayload {
  you: string;
  mode: GameMode;
  map: MapId;
  config: RoomConfig;
  tick: number;
}

export interface ServerInfo {
  name: string;
  version: string;
  lanUrls: string[];
  port: number;
  rooms: number;
}

/** Client → Server socket events. */
export interface ClientToServer {
  'room:list': (cb: (rooms: RoomSummary[]) => void) => void;
  'room:create': (p: JoinPayload & { config: Partial<RoomConfig> }, cb: (a: Ack<RoomState>) => void) => void;
  'room:join': (p: JoinPayload & { code: string }, cb: (a: Ack<RoomState>) => void) => void;
  'room:leave': () => void;
  'room:update': (p: { team?: TeamId; character?: CharacterId; ready?: boolean; skin?: string }) => void;
  'room:config': (p: Partial<RoomConfig>) => void;
  'room:kick': (p: { playerId: string }) => void;
  'room:start': (cb: (a: Ack) => void) => void;
  'room:return': () => void;
  'game:input': (cmds: InputCmd[]) => void;
  'game:buy': (p: { item: string }, cb: (a: Ack) => void) => void;
  'game:sell': (p: { item: string }, cb: (a: Ack) => void) => void;
  'net:ping': (t: number, cb: (t: number) => void) => void;
  'net:pong': (t: number) => void;
}

/** Server → Client socket events. */
export interface ServerToClient {
  'server:info': (i: ServerInfo) => void;
  'server:shutdown': (reason: string) => void;
  'room:state': (s: RoomState) => void;
  'room:kicked': (reason: string) => void;
  'room:closed': (reason: string) => void;
  'room:notice': (text: string) => void;
  'game:start': (p: GameStartPayload) => void;
  'game:snap': (s: Snapshot) => void;
  'game:over': (r: MatchResult) => void;
  'net:ping': (t: number) => void;
}
