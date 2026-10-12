import type { RoomConfig } from './types';
import { MAX_PLAYERS_LIMIT } from './constants';

export const TACTICAL = {
  buyTime: 25,
  roundTime: 100,
  plantTime: 4,
  defuseTime: 7,
  defuseCheckpoint: 3.5,
  detonateTime: 40,
  roundEndTime: 6,
  matchEndTime: 20,
  startCredits: 800,
  maxCredits: 9000,
  winReward: 3000,
  lossReward: 1900,
  lossStreakBonus: 500,
  lossRewardMax: 2900,
  killReward: 200,
  plantReward: 300,
  plantRadius: 0,
  defuseRadius: 2,
  pickupRadius: 1.5,
};

export const TDM = {
  warmupTime: 8,
  respawnTime: 3,
  spawnProtection: 2,
  buyWindow: 10,
  matchEndTime: 20,
  ultPerSeconds: 30,
};

export const ULT_POINTS = { kill: 1, round: 1, objective: 1 };

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  name: 'Phantom Room',
  maxPlayers: 10,
  teamSize: 5,
  mode: 'tactical',
  map: 'iron',
  maxRounds: 12,
  timeLimitMin: 8,
  killLimit: 40,
  friendlyFire: false,
  visibility: 'public',
  allowTeamSelect: true,
  timeOfDay: 'map',
  weather: 'map',
};

/** Battle-royale ("Royale") zone schedule: wait, then shrink to `radius` over `shrink` seconds; dps outside. */
export const ROYALE = {
  warmup: 20,
  startRadius: 660,
  stages: [
    { wait: 70, shrink: 50, radius: 380, dps: 2 },
    { wait: 55, shrink: 40, radius: 220, dps: 4 },
    { wait: 45, shrink: 35, radius: 120, dps: 7 },
    { wait: 35, shrink: 30, radius: 55, dps: 12 },
    { wait: 25, shrink: 25, radius: 0, dps: 20 },
  ],
  matchEndTime: 20,
  pickupRadius: 2.4,
};

export const MODE_MAPS: Record<'tactical' | 'tdm' | 'royale', ('iron' | 'harbor' | 'frontier')[]> = {
  tactical: ['iron', 'harbor'],
  tdm: ['iron', 'harbor', 'frontier'],
  royale: ['frontier'],
};

/** Clamp & sanitise a client-provided config. Never trust the client. */
export function sanitizeRoomConfig(input: Partial<RoomConfig> | undefined, base: RoomConfig = DEFAULT_ROOM_CONFIG): RoomConfig {
  const c = { ...base, ...(input ?? {}) } as RoomConfig;
  const int = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const maxPlayers = int(c.maxPlayers, 1, MAX_PLAYERS_LIMIT, base.maxPlayers);
  const mode = c.mode === 'tdm' || c.mode === 'royale' ? c.mode : 'tactical';
  const allowed = MODE_MAPS[mode];
  const map = allowed.includes(c.map as never) ? c.map : allowed[0];
  const tod = ['dawn', 'day', 'sunset', 'night', 'cycle', 'map'].includes(c.timeOfDay as string) ? c.timeOfDay : 'map';
  const weather = ['clear', 'overcast', 'rain', 'storm', 'fog', 'dynamic', 'map'].includes(c.weather as string) ? c.weather : 'map';
  let maxRounds = int(c.maxRounds, 2, 30, base.maxRounds);
  if (maxRounds % 2 === 1) maxRounds += 1;
  return {
    name: String(c.name ?? base.name).replace(/[^\p{L}\p{N} _\-'!.#]/gu, '').trim().slice(0, 32) || base.name,
    maxPlayers,
    teamSize: int(c.teamSize, 1, Math.ceil(MAX_PLAYERS_LIMIT / 2), base.teamSize),
    mode,
    map,
    maxRounds,
    timeLimitMin: int(c.timeLimitMin, 1, 30, base.timeLimitMin),
    killLimit: int(c.killLimit, 5, 200, base.killLimit),
    friendlyFire: Boolean(c.friendlyFire),
    visibility: c.visibility === 'private' ? 'private' : 'public',
    allowTeamSelect: c.allowTeamSelect !== false,
    timeOfDay: tod,
    weather,
  };
}

export function sanitizeName(name: unknown): string {
  const s = String(name ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
  return s || 'Agent';
}

export function otherTeam<T extends 'alpha' | 'bravo'>(t: T): 'alpha' | 'bravo' {
  return t === 'alpha' ? 'bravo' : 'alpha';
}
