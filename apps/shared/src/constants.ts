export const GAME_VERSION = '0.1.0';
export const DEFAULT_PORT = 3000;

/** Server simulation rate (ticks per second). Snapshots are broadcast every tick. */
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;
/** Fixed timestep of client input commands. The server replays inputs with this exact dt. */
export const INPUT_RATE = 60;
export const INPUT_DT = 1 / INPUT_RATE;

export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.2;
export const STAND_EYE = 1.62;
export const CROUCH_EYE = 1.04;
export const PLAYER_RADIUS = 0.34;
export const CROUCH_RATE = 7;

export const RUN_SPEED = 5.4;
export const WALK_SPEED = 2.9;
export const CROUCH_SPEED = 2.1;
export const SPRINT_SPEED = 6.6;
export const DASH_SPEED = 17;

/** Peek / lean. `lean` is -1 (full left) .. +1 (full right) in PlayerCore. */
export const LEAN_OFFSET = 0.5;
export const LEAN_ROLL = 0.22;
export const LEAN_RATE = 9;
/** Head-clearance probe half-extents used to cancel a lean into solid geometry. */
export const LEAN_PROBE = 0.2;

/** Sprint slide. */
export const SLIDE_TIME = 1.1;
export const SLIDE_MIN_SPEED = SPRINT_SPEED * 0.7;
/** Entry speed multiplier applied when the slide starts (a short kick as the body drops). */
export const SLIDE_BOOST = 1.12;
export const SLIDE_FRICTION = 3.4;
export const SLIDE_END_SPEED = 2.8;
export const SLIDE_COOLDOWN = 0.45;
/** Only this fraction of normal ground steering is available mid-slide. */
export const SLIDE_STEER_RATE = 3.0;
export const GROUND_ACCEL = 55;
export const GROUND_DECEL = 42;
export const AIR_ACCEL = 9;
export const GRAVITY = 20;
export const JUMP_VELOCITY = 6.4;
export const JUMP_COOLDOWN = 0.3;
export const STEP_HEIGHT = 0.45;
export const MAX_FALL_SPEED = 40;
export const KILL_PLANE_Y = -25;

export const MAX_HP = 100;
export const MAX_ARMOR = 50;
export const ARMOR_ABSORB = 0.66;

export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PLAYERS_LIMIT = 16;
export const NAME_MAX = 16;

/** How far back (in ticks) the server rewinds players for lag compensation. */
export const LAG_COMP_MAX_TICKS = 10;
/** Remote entities are rendered this many ticks in the past for smooth interpolation. */
export const INTERP_DELAY_TICKS = 3;

export const MAX_INPUT_QUEUE = 40;
export const MAX_CMDS_PER_PACKET = 12;
export const INPUT_BUDGET_CAP = 0.3;

/** Input button bitmask. */
export const BTN = {
  JUMP: 1,
  CROUCH: 2,
  WALK: 4,
  SPRINT: 8,
  FIRE: 16,
  ADS: 32,
  RELOAD: 64,
  USE: 128,
  DROP: 256,
  AB1: 512,
  AB2: 1024,
  AB3: 2048,
  ULT: 4096,
  LEAN_LEFT: 8192,
  LEAN_RIGHT: 16384,
  SLIDE: 32768,
} as const;

export const RECONNECT_GRACE_MS = 60_000;
export const EMPTY_ROOM_TTL_MS = 30_000;
