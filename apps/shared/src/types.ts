import type { Vec3 } from './math';
import type { WeaponId } from './weapons';

export type { Vec3 };
export type TeamId = 'alpha' | 'bravo';
export type GameMode = 'tactical' | 'tdm' | 'royale' | 'practice';
export type RoomMode = Exclude<GameMode, 'practice'>;
export type MapId = 'iron' | 'harbor' | 'frontier' | 'range';
export type PlayableMapId = Exclude<MapId, 'range'>;
export type CharacterId = 'vanguard' | 'specter' | 'bastion' | 'medic';
export type SurfaceMat =
  | 'concrete'
  | 'metal'
  | 'floor'
  | 'asphalt'
  | 'crate'
  | 'containerRed'
  | 'containerBlue'
  | 'containerYellow'
  | 'containerGreen'
  | 'trim'
  | 'brick'
  | 'barrier'
  | 'glass'
  | 'terrain'
  | 'plaster'
  | 'facade'
  | 'roofing'
  | 'wood'
  | 'fabric'
  | 'tile'
  | 'rock'
  | 'snow';

export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night' | 'cycle';
export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'storm' | 'fog';
export type WeatherSetting = WeatherKind | 'dynamic' | 'map';

/** Server-synchronised environment so every player sees the same conditions. */
export interface EnvState {
  /** hour of day 0..24 */
  time: number;
  weather: WeatherKind;
}

export interface ZoneState {
  cx: number;
  cz: number;
  r: number;
  nextCx: number;
  nextCz: number;
  nextR: number;
  /** seconds until the next shrink starts (or ends, while shrinking) */
  timer: number;
  shrinking: boolean;
  stage: number;
  dps: number;
}

export interface RoomConfig {
  name: string;
  maxPlayers: number;
  teamSize: number;
  mode: RoomMode;
  map: PlayableMapId;
  maxRounds: number;
  timeLimitMin: number;
  killLimit: number;
  friendlyFire: boolean;
  visibility: 'public' | 'private';
  allowTeamSelect: boolean;
  timeOfDay: TimeOfDay | 'map';
  weather: WeatherSetting;
}

export interface RoomPlayer {
  id: string;
  name: string;
  team: TeamId;
  character: CharacterId;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  ping: number;
  skin: string;
}

export interface RoomState {
  code: string;
  config: RoomConfig;
  players: RoomPlayer[];
  hostId: string;
  status: 'lobby' | 'in-match';
  lanUrls: string[];
}

export interface RoomSummary {
  code: string;
  name: string;
  mode: RoomMode;
  map: PlayableMapId;
  players: number;
  maxPlayers: number;
  status: 'lobby' | 'in-match';
  host: string;
}

/** One fixed-timestep client input command. Short keys keep packets small. */
export interface InputCmd {
  /** sequence number */
  s: number;
  /** forward axis -1..1 */
  f: number;
  /** strafe axis -1..1 */
  r: number;
  /** buttons bitmask (BTN) */
  b: number;
  /** base aim yaw (without recoil) */
  y: number;
  /** base aim pitch (without recoil) */
  p: number;
  /** requested weapon slot, 0 = no change */
  sl: number;
  /** server tick the client was rendering remote players at (lag compensation) */
  vt: number;
}

/** State the client predicts locally and the server reconciles. */
export interface PlayerCore {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  crouch: number;
  jumpCd: number;
  dash: number;
  dashYaw: number;
  /** peek lean blend, -1 full left .. +1 full right */
  lean: number;
  /** remaining slide time (0 = not sliding) */
  slide: number;
  /** slide cooldown (covers the slide itself plus the recovery window) */
  slideCd: number;
  /** heading locked in at slide start */
  slideYaw: number;
  primary: WeaponId | null;
  secondary: WeaponId | null;
  slot: 1 | 2 | 3;
  /** [mag1, reserve1, mag2, reserve2, mag3, reserve3] */
  ammo: number[];
  equipT: number;
  reloadT: number;
  fireCd: number;
  recoil: number;
  prevFire: boolean;
  ads: boolean;
  /** set when firing cancels a sprint; stays true until the sprint key is released */
  sprintBlocked: boolean;
}

export interface AbilityState {
  charges: number;
  cd: number;
}

export interface PlayerFx {
  overdrive: number;
  slow: number;
  revealed: number;
  spawnProt: number;
  renewal: number;
  heal: number;
  shieldT: number;
  echo: number;
}

export interface PlayerSnap extends PlayerCore {
  id: string;
  name: string;
  team: TeamId;
  character: CharacterId;
  alive: boolean;
  hp: number;
  armor: number;
  shield: number;
  yaw: number;
  pitch: number;
  credits: number;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  ping: number;
  ult: number;
  abilities: AbilityState[];
  hasCharge: boolean;
  seq: number;
  connected: boolean;
  respawnT: number;
  fx: PlayerFx;
  /** 0 none, 1 planting, 2 defusing */
  interact: number;
  skin: string;
}

export type EntityType = 'smoke' | 'scanner' | 'decoy' | 'barrier' | 'caltrops' | 'station' | 'turret' | 'target' | 'loot';

export interface EntitySnap {
  id: number;
  type: EntityType;
  team: TeamId;
  owner: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  t: number;
  r: number;
  /** box half extents for barriers */
  hx?: number;
  hy?: number;
  hz?: number;
  /** character of owner (decoys) */
  ch?: CharacterId;
  moving?: boolean;
  /** loot item id */
  item?: string;
}

export type ChargeStatus = 'none' | 'carried' | 'dropped' | 'planted' | 'defused' | 'detonated';

export interface ChargeState {
  status: ChargeStatus;
  carrier: string | null;
  x: number;
  y: number;
  z: number;
  site: string | null;
  timer: number;
  plantProgress: number;
  defuseProgress: number;
  actor: string | null;
}

export type MatchPhase = 'warmup' | 'buy' | 'live' | 'planted' | 'roundEnd' | 'matchEnd' | 'practice';
export type RoundReason = 'elimination' | 'time' | 'detonated' | 'defused' | 'kills';

export interface MatchSnap {
  mode: GameMode;
  map: MapId;
  phase: MatchPhase;
  timeLeft: number;
  round: number;
  maxRounds: number;
  scores: Record<TeamId, number>;
  attackers: TeamId;
  charge: ChargeState;
  barriers: boolean;
  killLimit: number;
  winner: TeamId | 'draw' | null;
  roundWinner: TeamId | null;
  roundReason: RoundReason | null;
  friendlyFire: boolean;
  practice?: { infiniteAmmo: boolean; difficulty: PracticeDifficulty; hits: number; shots: number };
  env: EnvState;
  zone?: ZoneState;
  /** loot list revision; the full list is sent only when it changes (and periodically) */
  lootRev?: number;
}

export type PracticeDifficulty = 'easy' | 'normal' | 'hard';

export interface Impact {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  /** surface material, or 'player' / 'entity' */
  m: SurfaceMat | 'player' | 'entity' | 'none';
}

export type GameEvent =
  | { type: 'shot'; shooter: string; weapon: WeaponId; o: Vec3; hits: Impact[] }
  | { type: 'hit'; attacker: string; victim: string; dmg: number; head: boolean; kill: boolean; entity?: boolean; zone?: string; dist?: number }
  | { type: 'kill'; killer: string | null; victim: string; weapon: WeaponId | 'ability' | 'world'; head: boolean; assisters: string[] }
  | { type: 'ability'; player: string; ability: string; x: number; y: number; z: number; team: TeamId }
  | { type: 'pulse'; x: number; y: number; z: number; r: number; team: TeamId }
  | { type: 'reload'; player: string }
  | { type: 'jump'; player: string }
  | { type: 'land'; player: string; speed: number }
  | { type: 'plantStart'; player: string }
  | { type: 'planted'; player: string; site: string }
  | { type: 'defuseStart'; player: string }
  | { type: 'defused'; player: string }
  | { type: 'detonated'; x: number; y: number; z: number }
  | { type: 'chargeDrop'; player: string }
  | { type: 'chargePickup'; player: string }
  | { type: 'roundStart'; round: number }
  | { type: 'buyPhase'; round: number }
  | { type: 'roundEnd'; winner: TeamId; reason: RoundReason }
  | { type: 'sideSwitch' }
  | { type: 'matchEnd'; winner: TeamId | 'draw' }
  | { type: 'respawn'; player: string }
  | { type: 'buy'; player: string; item: string }
  | { type: 'entityDestroyed'; id: number; kind: EntityType; x: number; y: number; z: number }
  | { type: 'notice'; to: string | null; text: string };

export interface Snapshot {
  tick: number;
  time: number;
  players: PlayerSnap[];
  entities: EntitySnap[];
  /** static pickups (royale); omitted when unchanged */
  loot?: EntitySnap[];
  match: MatchSnap;
  events: GameEvent[];
}

export interface PlayerResult {
  id: string;
  name: string;
  team: TeamId;
  character: CharacterId;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  damage: number;
  headshots: number;
  plants: number;
  defuses: number;
}

export interface MatchResult {
  mode: GameMode;
  map: MapId;
  winner: TeamId | 'draw';
  scores: Record<TeamId, number>;
  rounds: number;
  players: PlayerResult[];
  mvp: string | null;
}
