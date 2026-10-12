import { CHARACTERS } from '../characters';
import { CollisionWorld, pointInBox, rayBox, type Box, type Solid } from '../collision';
import {
  ARMOR_ABSORB, BTN, INPUT_BUDGET_CAP, INPUT_DT, KILL_PLANE_Y, LAG_COMP_MAX_TICKS, MAX_CMDS_PER_PACKET, MAX_HP,
  MAX_INPUT_QUEUE, TICK_DT, WALK_SPEED,
} from '../constants';
import { ROYALE, TACTICAL, TDM, ULT_POINTS, otherTeam } from '../game-rules';
import { getMap, type MapDef } from '../maps';
import { applySpread, clamp, dirFromAngles, raySphere, Rng, segmentNearPoint, type Vec3 } from '../math';
import { eyeFor, leanOffset, playerBox, stepMovement, type MoveState } from '../movement';
import { bestSlot, equipSlot, giveWeapon, newCore, refillAmmo, stepPlayerCore, type CoreEnv, type CoreResult } from '../player-core';
import type {
  AbilityState, CharacterId, EntitySnap, EntityType, GameEvent, GameMode, Impact, InputCmd, MapId, MatchResult, MatchSnap,
  PlayerSnap, PracticeDifficulty, Snapshot, TeamId, TimeOfDay, WeatherKind, WeatherSetting,
} from '../types';
import { ARMORS, computeSpread, DEFAULT_SIDEARM, falloffMul, recoilOffset, WEAPONS, type ArmorId, type WeaponId } from '../weapons';
import { isSkinId } from '../skins';
import { useAbility } from './abilities';
import { hitboxes, type HitZone } from './hitboxes';

export interface MatchOptions {
  mode: GameMode;
  map: MapId;
  maxRounds?: number;
  killLimit?: number;
  timeLimitSec?: number;
  friendlyFire?: boolean;
  seed?: number;
  practice?: { infiniteAmmo: boolean; difficulty: PracticeDifficulty };
  timeOfDay?: TimeOfDay | 'map';
  weather?: WeatherSetting;
}

const LOOT_TABLE: [string, number][] = [
  ['hornet', 10], ['breacher', 8], ['magistrate', 10], ['corsair', 7], ['lancer', 6], ['bulwark', 4], ['longwatch', 3],
  ['glock', 9], ['deagle', 7], ['mp5', 10], ['p90', 6], ['ak47', 8], ['m4a1', 8], ['scarl', 6], ['svd', 4], ['barrett', 2], ['spas', 8], ['aa12', 5], ['m249', 3],
  ['light', 11], ['heavy', 6], ['ammo', 14], ['medkit', 10],
];
export const LOOT_NAMES: Record<string, string> = { light: 'Light Plating', heavy: 'Heavy Plating', ammo: 'Ammo Cache', medkit: 'Med Kit' };
const TIME_PRESETS: Record<Exclude<TimeOfDay, 'cycle'>, number> = { dawn: 6.4, day: 12.5, sunset: 17.6, night: 23 };

export interface SimPlayer extends PlayerSnap {
  queue: InputCmd[];
  budget: number;
  prevButtons: number;
  lastButtons: number;
  lastMove: { f: number; r: number };
  damageLog: Map<string, number>;
  damageDealt: number;
  headshots: number;
  plants: number;
  defuses: number;
  boughtThisRound: string[];
  healRate: number;
  sinceSpawn: number;
  owPulses: number;
  owTimer: number;
  spawnIndex: number;
}

export interface SimEntity extends EntitySnap {
  pulses?: number;
  nextPulse?: number;
  cd?: number;
  lockT?: number;
  lockTarget?: string | null;
  move?: MoveState;
  baseX?: number;
  phase?: number;
  patrol?: number;
  respawn?: number;
  crouch?: boolean;
  solid?: Solid;
}

interface HistEntry {
  tick: number;
  pos: Map<string, { x: number; y: number; z: number; crouch: number; alive: boolean }>;
}

export interface TraceResult {
  t: number;
  point: Vec3;
  normal: Vec3;
  kind: 'none' | 'world' | 'player' | 'entity';
  mat: Impact['m'];
  player?: SimPlayer;
  zone?: HitZone;
  entity?: SimEntity;
}

/** Whether weapons may fire in the current phase. Shared with client prediction. */
export function combatAllowed(st: Pick<MatchSnap, 'mode' | 'phase'>) {
  const ph = st.phase;
  if (st.mode === 'practice') return true;
  if (st.mode === 'tdm' || st.mode === 'royale') return ph === 'live';
  return ph === 'live' || ph === 'planted' || ph === 'roundEnd';
}

/** Movement / weapon modifiers for a player. Identical on server and client prediction. */
export function envFor(st: Pick<MatchSnap, 'mode' | 'phase' | 'practice'>, p: Pick<PlayerSnap, 'alive' | 'interact' | 'fx'>): CoreEnv {
  return {
    canFire: p.alive && combatAllowed(st) && p.interact === 0,
    infiniteAmmo: st.mode === 'practice' && !!st.practice?.infiniteAmmo,
    speedMul: (p.fx.overdrive > 0 ? 1.1 : 1) * (p.fx.slow > 0 ? 0.7 : 1),
    fireRateMul: p.fx.overdrive > 0 ? 1.15 : 1,
    reloadMul: p.fx.overdrive > 0 ? 1.3 : 1,
  };
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Authoritative match simulation. Pure TypeScript with no Node/DOM dependencies so the
 * same rules run on the LAN server and in the browser (practice range).
 */
export class Match {
  readonly opts: Required<Omit<MatchOptions, 'seed' | 'practice' | 'timeOfDay' | 'weather'>> & Pick<MatchOptions, 'practice'>;
  readonly map: MapDef;
  readonly world: CollisionWorld;
  readonly rng: Rng;
  tick = 0;
  time = 0;
  players = new Map<string, SimPlayer>();
  entities = new Map<number, SimEntity>();
  events: GameEvent[] = [];
  state: MatchSnap;
  finished = false;
  result: MatchResult | null = null;
  private nextEntityId = 1;
  private history: HistEntry[] = [];
  private lossStreak: Record<TeamId, number> = { alpha: 0, bravo: 0 };
  private solidEntity = new Map<Solid, SimEntity>();
  /** static pickups (royale) — sent separately from per-tick entities */
  loot = new Map<number, SimEntity>();
  private lootDirty = true;
  private envCycle = false;
  private envDynamic = false;
  private nextWeatherT = 200;
  private teamDrop: Record<TeamId, Vec3> = { alpha: { x: 0, y: 0, z: 0 }, bravo: { x: 0, y: 0, z: 0 } };
  private zoneFrom = { cx: 0, cz: 0, r: 0 };
  private zoneEndT = 0;

  constructor(opts: MatchOptions) {
    this.opts = {
      mode: opts.mode,
      map: opts.mode === 'practice' ? (opts.map === 'frontier' ? 'frontier' : 'range') : opts.map === 'range' ? 'iron' : opts.map,
      maxRounds: Math.max(2, opts.maxRounds ?? 12),
      killLimit: opts.killLimit ?? 40,
      timeLimitSec: opts.timeLimitSec ?? 480,
      friendlyFire: opts.friendlyFire ?? false,
      practice: opts.practice ?? (opts.mode === 'practice' ? { infiniteAmmo: true, difficulty: 'normal' } : undefined),
    };
    this.map = getMap(this.opts.map);
    this.world = new CollisionWorld(this.map.solids, this.map.world?.terrain ?? null);
    this.rng = new Rng(opts.seed ?? (Date.now() ^ 0x5f3759df));
    this.state = {
      mode: this.opts.mode,
      map: this.opts.map,
      phase: 'warmup',
      timeLeft: 0,
      round: 0,
      maxRounds: this.opts.maxRounds,
      scores: { alpha: 0, bravo: 0 },
      attackers: 'alpha',
      charge: this.emptyCharge(),
      barriers: false,
      killLimit: this.opts.killLimit,
      winner: null,
      roundWinner: null,
      roundReason: null,
      friendlyFire: this.opts.friendlyFire,
      env: this.initEnv(opts.timeOfDay, opts.weather),
    };
    if (this.opts.mode === 'tactical') this.startRound();
    else if (this.opts.mode === 'royale') this.initRoyale();
    else if (this.opts.mode === 'tdm') {
      this.state.phase = 'buy';
      this.state.timeLeft = TDM.warmupTime;
      this.state.round = 1;
    } else {
      this.state.phase = 'practice';
      this.state.practice = { infiniteAmmo: this.opts.practice!.infiniteAmmo, difficulty: this.opts.practice!.difficulty, hits: 0, shots: 0 };
      this.spawnTargets();
    }
  }

  private emptyCharge() {
    return { status: 'none' as const, carrier: null, x: 0, y: 0, z: 0, site: null, timer: 0, plantProgress: 0, defuseProgress: 0, actor: null };
  }

  // ───────────────────────────── players ─────────────────────────────

  addPlayer(id: string, name: string, team: TeamId, character: CharacterId, skin = 'standard'): SimPlayer {
    const existing = this.players.get(id);
    if (existing) return existing;
    const mode = this.opts.mode;
    const p: SimPlayer = {
      ...newCore(),
      id, name, team, character,
      alive: false, hp: MAX_HP, armor: 0, shield: 0, yaw: 0, pitch: 0,
      credits: mode === 'tactical' ? TACTICAL.startCredits : 99999,
      kills: 0, deaths: 0, assists: 0, score: 0, ping: 0, ult: 0,
      abilities: this.freshAbilities(character),
      hasCharge: false, seq: 0, connected: true, respawnT: 0,
      fx: this.freshFx(), interact: 0, skin: isSkinId(skin) ? skin : 'standard',
      queue: [], budget: 0, prevButtons: 0, lastButtons: 0, lastMove: { f: 0, r: 0 },
      damageLog: new Map(), damageDealt: 0, headshots: 0, plants: 0, defuses: 0,
      boughtThisRound: [], healRate: 0, sinceSpawn: 0, owPulses: 0, owTimer: 0,
      spawnIndex: [...this.players.values()].filter((q) => q.team === team).length,
    };
    this.players.set(id, p);
    if (mode === 'tactical') {
      if (this.state.phase === 'buy') {
        this.spawnPlayer(p);
        if (team === this.state.attackers && this.state.charge.status === 'none') {
          p.hasCharge = true;
          this.state.charge.status = 'carried';
          this.state.charge.carrier = p.id;
        }
      } else p.respawnT = 0; // waits (spectates) until next round
    } else if (mode === 'royale') {
      if (this.state.phase === 'buy') this.spawnPlayer(p);
    } else {
      this.spawnPlayer(p);
    }
    return p;
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.hasCharge) this.dropCharge(p, false);
    if (this.state.charge.actor === id) this.state.charge.actor = null;
    this.players.delete(id);
  }

  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (p) {
      p.connected = connected;
      if (!connected) {
        p.queue = [];
        p.lastButtons = 0;
      }
    }
  }

  setPing(id: string, ping: number) {
    const p = this.players.get(id);
    if (p) p.ping = Math.round(clamp(ping, 0, 999));
  }

  private freshAbilities(character: CharacterId): AbilityState[] {
    return CHARACTERS[character].abilities.slice(0, 3).map((a) => ({ charges: a ? a.charges : 0, cd: 0 }));
  }

  private freshFx() {
    return { overdrive: 0, slow: 0, revealed: 0, spawnProt: 0, renewal: 0, heal: 0, shieldT: 0, echo: 0 };
  }

  sideOf(team: TeamId): 'attack' | 'defend' {
    return team === this.state.attackers ? 'attack' : 'defend';
  }

  private spawnPlayer(p: SimPlayer) {
    const mode = this.opts.mode;
    let pos: Vec3;
    let yaw: number;
    if (mode === 'tdm') {
      const enemies = [...this.players.values()].filter((q) => q.alive && q.team !== p.team);
      let best = this.map.tdmSpawns[0];
      let bestScore = -Infinity;
      for (const s of this.map.tdmSpawns) {
        let d = 60;
        for (const e of enemies) d = Math.min(d, Math.hypot(e.x - s.x, e.z - s.z));
        const score = d + this.rng.next() * 6;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      pos = best;
      yaw = best.yaw;
      p.fx.spawnProt = TDM.spawnProtection;
    } else if (mode === 'royale') {
      const d = this.teamDrop[p.team];
      const a = p.spawnIndex * 2.4;
      const x = d.x + Math.cos(a) * (3 + p.spawnIndex * 0.6), z = d.z + Math.sin(a) * (3 + p.spawnIndex * 0.6);
      pos = { x, y: this.groundY(x, z), z };
      yaw = this.rng.next() * Math.PI * 2;
    } else {
      const attack = this.sideOf(p.team) === 'attack';
      const list = attack ? this.map.attackSpawns : this.map.defendSpawns;
      pos = list[p.spawnIndex % list.length];
      yaw = attack ? this.map.attackYaw : this.map.defendYaw;
    }
    p.x = pos.x;
    p.y = pos.y + 0.05;
    p.z = pos.z;
    p.vx = p.vy = p.vz = 0;
    p.crouch = 0;
    p.dash = 0;
    p.lean = 0;
    p.slide = 0;
    p.slideCd = 0;
    p.slideYaw = 0;
    p.sprintBlocked = false;
    p.onGround = false;
    p.yaw = yaw;
    p.pitch = 0;
    p.alive = true;
    p.hp = MAX_HP;
    p.shield = 0;
    p.respawnT = 0;
    p.interact = 0;
    p.sinceSpawn = 0;
    p.damageLog.clear();
    const prot = p.fx.spawnProt;
    p.fx = this.freshFx();
    p.fx.spawnProt = prot;
    if (!p.secondary) giveWeapon(p, DEFAULT_SIDEARM);
    refillAmmo(p);
    equipSlot(p, bestSlot(p));
    p.equipT = 0;
    if (mode !== 'tactical') this.events.push({ type: 'respawn', player: p.id });
  }

  pushInputs(id: string, cmds: unknown): boolean {
    const p = this.players.get(id);
    if (!p || !Array.isArray(cmds)) return false;
    if (cmds.length > MAX_CMDS_PER_PACKET) return false;
    const lastSeq = p.queue.length ? p.queue[p.queue.length - 1].s : p.seq;
    let seq = lastSeq;
    for (const c of cmds as Partial<InputCmd>[]) {
      if (!c || !isFiniteNum(c.s) || !isFiniteNum(c.f) || !isFiniteNum(c.r) || !isFiniteNum(c.b) || !isFiniteNum(c.y) || !isFiniteNum(c.p)) return false;
      if (c.s <= seq) continue; // duplicate / out of order
      seq = c.s;
      p.queue.push({
        s: c.s, f: clamp(c.f, -1, 1), r: clamp(c.r, -1, 1), b: c.b | 0,
        y: c.y % (Math.PI * 2), p: clamp(c.p, -1.55, 1.55), sl: isFiniteNum(c.sl) ? c.sl | 0 : 0, vt: isFiniteNum(c.vt) ? c.vt : this.tick,
      });
    }
    while (p.queue.length > MAX_INPUT_QUEUE) p.queue.shift();
    return true;
  }

  // ───────────────────────────── simulation ─────────────────────────────

  update(): Snapshot {
    const dt = TICK_DT;
    this.tick++;
    this.time += dt;

    for (const p of this.players.values()) {
      p.budget = Math.min(INPUT_BUDGET_CAP, p.budget + dt);
      while (p.queue.length && p.budget >= INPUT_DT - 1e-6) {
        const cmd = p.queue.shift()!;
        p.budget -= INPUT_DT;
        this.processInput(p, cmd);
      }
    }
    this.updatePlayers(dt);
    this.updateEntities(dt);
    if (this.opts.mode === 'tactical') this.updateObjective(dt);
    this.updatePhase(dt);
    this.recordHistory();
    const snap = this.snapshot();
    this.events = [];
    return snap;
  }

  combatAllowed() {
    return combatAllowed(this.state);
  }

  coreEnv(p: SimPlayer): CoreEnv {
    return envFor(this.state, p);
  }

  private processInput(p: SimPlayer, cmd: InputCmd) {
    p.seq = cmd.s;
    p.yaw = cmd.y;
    p.pitch = cmd.p;
    p.lastMove = { f: cmd.f, r: cmd.r };
    const pressed = cmd.b & ~p.prevButtons;
    p.prevButtons = cmd.b;
    p.lastButtons = cmd.b;
    if (!p.alive || this.state.phase === 'matchEnd') return;

    const res = stepPlayerCore(p, cmd, INPUT_DT, this.world, this.coreEnv(p));
    if (res.jumped) this.events.push({ type: 'jump', player: p.id });
    if (res.landed && res.landSpeed > 4) this.events.push({ type: 'land', player: p.id, speed: res.landSpeed });
    if (res.reloadStarted) this.events.push({ type: 'reload', player: p.id });
    if (res.fired) {
      p.fx.spawnProt = 0;
      this.fire(p, cmd, res);
    }
    if (pressed & BTN.AB1) useAbility(this, p, 0);
    if (pressed & BTN.AB2) useAbility(this, p, 1);
    if (pressed & BTN.AB3) useAbility(this, p, 2);
    if (pressed & BTN.ULT) useAbility(this, p, 3);
    if (pressed & BTN.DROP && p.hasCharge) this.dropCharge(p, true);
    if (pressed & BTN.USE && this.loot.size) this.pickup(p);
    if (p.y < KILL_PLANE_Y) this.killPlayer(p, null, 'world', false);
  }

  private updatePlayers(dt: number) {
    const mode = this.opts.mode;
    for (const p of this.players.values()) {
      for (const k of Object.keys(p.fx) as (keyof SimPlayer['fx'])[]) p.fx[k] = Math.max(0, p.fx[k] - dt);
      if (!p.alive) {
        if (mode === 'tdm' && this.state.phase === 'live') {
          p.respawnT -= dt;
          if (p.respawnT <= 0) this.spawnPlayer(p);
        }
        continue;
      }
      p.sinceSpawn += dt;
      if (p.fx.heal > 0) p.hp = Math.min(MAX_HP, p.hp + p.healRate * dt);
      if (p.fx.shieldT <= 0) p.shield = 0;
      // ability cooldown regeneration
      const defs = CHARACTERS[p.character].abilities;
      p.abilities.forEach((a, i) => {
        const def = defs[i];
        if (!def || a.charges >= def.charges) {
          a.cd = 0;
          return;
        }
        a.cd -= dt;
        if (a.cd <= 0) {
          a.charges++;
          a.cd = a.charges < def.charges ? def.cooldown : 0;
        }
      });
      // Echo Sense: reveal running enemies nearby
      if (p.fx.echo > 0) {
        for (const e of this.players.values()) {
          if (!e.alive || e.team === p.team) continue;
          if (Math.hypot(e.x - p.x, e.z - p.z) < 20 && Math.hypot(e.vx, e.vz) > WALK_SPEED + 0.4) e.fx.revealed = Math.max(e.fx.revealed, 0.4);
        }
      }
      // Overwatch pulses
      if (p.owPulses > 0) {
        p.owTimer -= dt;
        if (p.owTimer <= 0) {
          p.owPulses--;
          p.owTimer = 2;
          this.events.push({ type: 'pulse', x: p.x, y: p.y + 1, z: p.z, r: 35, team: p.team });
          for (const e of this.players.values()) {
            if (e.alive && e.team !== p.team && Math.hypot(e.x - p.x, e.z - p.z) < 35) e.fx.revealed = Math.max(e.fx.revealed, 1.5);
          }
        }
      }
      if ((mode === 'tdm' || mode === 'royale') && this.state.phase === 'live') {
        if (Math.floor((this.time - dt) / TDM.ultPerSeconds) !== Math.floor(this.time / TDM.ultPerSeconds)) this.addUlt(p, 1);
      }
    }
  }

  addUlt(p: SimPlayer, n: number) {
    const cost = CHARACTERS[p.character].abilities[3].ultCost ?? 6;
    p.ult = Math.min(cost, p.ult + n);
  }

  // ───────────────────────────── combat ─────────────────────────────

  eye(p: { x: number; y: number; z: number; crouch: number; yaw?: number; lean?: number }): Vec3 {
    const o = leanOffset(p.lean ?? 0, p.yaw ?? 0);
    return { x: p.x + o.x, y: p.y + eyeFor(p.crouch), z: p.z + o.z };
  }

  private fire(p: SimPlayer, cmd: InputCmd, res: CoreResult) {
    const w = WEAPONS[res.weapon];
    const origin = this.eye(p);
    const rec = recoilOffset(w, res.recoilAtFire);
    const base = dirFromAngles(cmd.y + rec.dy, clamp(cmd.p + rec.dp, -1.55, 1.55));
    const spread = computeSpread(w, { speedH: Math.hypot(p.vx, p.vz), onGround: p.onGround, crouch: p.crouch, ads: p.ads, recoil: res.recoilAtFire });
    const rewind = clamp(Math.round(cmd.vt), this.tick - LAG_COMP_MAX_TICKS, this.tick);
    const hist = this.history.find((h) => h.tick === rewind);
    const hits: Impact[] = [];
    const dmgByVictim = new Map<SimPlayer, { dmg: number; head: boolean; zone: HitZone; dist: number }>();
    const dmgByEntity = new Map<SimEntity, { dmg: number; zone: HitZone; dist: number; head: boolean }>();
    if (this.state.practice) this.state.practice.shots++;

    for (let i = 0; i < w.pellets; i++) {
      const dir = applySpread(base, spread, this.rng.next(), this.rng.next());
      const tr = this.trace(origin, dir, w.range, p, hist);
      hits.push({ x: tr.point.x, y: tr.point.y, z: tr.point.z, nx: tr.normal.x, ny: tr.normal.y, nz: tr.normal.z, m: tr.mat });
      if (tr.kind === 'player' && tr.player && tr.zone) {
        const dmg = w.damage[tr.zone] * falloffMul(w, tr.t);
        const acc = dmgByVictim.get(tr.player) ?? { dmg: 0, head: false, zone: tr.zone, dist: tr.t };
        acc.dmg += dmg;
        acc.head ||= tr.zone === 'head';
        dmgByVictim.set(tr.player, acc);
      } else if (tr.kind === 'entity' && tr.entity) {
        const zone = tr.zone ?? 'body';
        const dmg = w.damage[zone] * falloffMul(w, tr.t);
        const acc = dmgByEntity.get(tr.entity) ?? { dmg: 0, zone, dist: tr.t, head: false };
        acc.dmg += dmg;
        acc.head ||= zone === 'head';
        dmgByEntity.set(tr.entity, acc);
      }
    }
    this.events.push({ type: 'shot', shooter: p.id, weapon: w.id, o: origin, hits });
    for (const [victim, d] of dmgByVictim) {
      if (d.head) p.headshots++;
      this.applyDamage(victim, d.dmg, p, w.id, d.head);
    }
    for (const [ent, d] of dmgByEntity) this.damageEntity(ent, d.dmg, p, d.zone, d.dist);
  }

  /** Hitscan trace against world, (lag-compensated) players and damageable entities. */
  trace(origin: Vec3, dir: Vec3, range: number, shooter: SimPlayer | null, hist?: HistEntry, teamFilter?: TeamId): TraceResult {
    const wall = this.world.raycast(origin, dir, range);
    let best: TraceResult = wall
      ? { t: wall.t, point: wall.point, normal: wall.normal, kind: 'world', mat: wall.solid.mat }
      : {
          t: range,
          point: { x: origin.x + dir.x * range, y: origin.y + dir.y * range, z: origin.z + dir.z * range },
          normal: { x: 0, y: 1, z: 0 },
          kind: 'none',
          mat: 'none',
        };
    if (wall) {
      const ent = this.solidEntity.get(wall.solid);
      if (ent) {
        best.kind = 'entity';
        best.entity = ent;
        best.mat = 'entity';
      }
    }
    const shooterTeam = teamFilter ?? shooter?.team;
    for (const q of this.players.values()) {
      if (q === shooter) continue;
      if (!this.opts.friendlyFire && shooterTeam && q.team === shooterTeam) continue;
      const h = hist?.pos.get(q.id);
      const alive = h ? h.alive && q.alive : q.alive;
      if (!alive) continue;
      const px = h ? h.x : q.x, py = h ? h.y : q.y, pz = h ? h.z : q.z, pc = h ? h.crouch : q.crouch;
      if (Math.abs(px - origin.x) + Math.abs(pz - origin.z) > range + 3) continue;
      for (const hb of hitboxes(px, py, pz, pc)) {
        const r = rayBox(origin, dir, hb.box, best.t);
        if (r && r.t < best.t) {
          best = {
            t: r.t, point: { x: origin.x + dir.x * r.t, y: origin.y + dir.y * r.t, z: origin.z + dir.z * r.t },
            normal: { x: r.nx, y: r.ny, z: r.nz }, kind: 'player', mat: 'player', player: q, zone: hb.zone,
          };
        }
      }
    }
    for (const e of this.entities.values()) {
      if (e.type === 'smoke' || e.type === 'caltrops' || e.type === 'barrier') continue;
      if (e.type !== 'target' && shooterTeam && e.team === shooterTeam) continue;
      if (e.hp <= 0) continue;
      const boxes = this.entityHitboxes(e);
      for (const hb of boxes) {
        const r = rayBox(origin, dir, hb.box, best.t);
        if (r && r.t < best.t) {
          best = {
            t: r.t, point: { x: origin.x + dir.x * r.t, y: origin.y + dir.y * r.t, z: origin.z + dir.z * r.t },
            normal: { x: r.nx, y: r.ny, z: r.nz }, kind: 'entity', mat: e.type === 'target' || e.type === 'decoy' ? 'player' : 'entity', entity: e, zone: hb.zone,
          };
        }
      }
    }
    return best;
  }

  private entityHitboxes(e: SimEntity): { zone: HitZone; box: Box }[] {
    if (e.type === 'target' || e.type === 'decoy') return hitboxes(e.x, e.y, e.z, e.crouch ? 1 : 0);
    const s = e.type === 'turret' ? 0.55 : e.type === 'station' ? 0.45 : 0.3;
    const cy = e.type === 'turret' ? e.y + 0.7 : e.type === 'station' ? e.y + 0.45 : e.y;
    return [{ zone: 'body', box: { minX: e.x - s, maxX: e.x + s, minY: cy - s, maxY: cy + s, minZ: e.z - s, maxZ: e.z + s } }];
  }

  applyDamage(victim: SimPlayer, amount: number, attacker: SimPlayer | null, weapon: WeaponId | 'ability' | 'world', head: boolean) {
    if (!victim.alive || amount <= 0) return;
    if (victim.fx.spawnProt > 0 && weapon !== 'world') return;
    if (attacker && attacker !== victim && attacker.team === victim.team && !this.opts.friendlyFire) return;
    let dmg = amount;
    if (victim.fx.renewal > 0) dmg *= 0.75;
    if (victim.shield > 0) {
      const s = Math.min(victim.shield, dmg);
      victim.shield -= s;
      dmg -= s;
    }
    if (victim.armor > 0) {
      const absorbed = Math.min(victim.armor, dmg * ARMOR_ABSORB);
      victim.armor -= absorbed;
      dmg -= absorbed;
    }
    const dealt = Math.min(victim.hp, dmg);
    victim.hp -= dmg;
    if (attacker && attacker !== victim) {
      attacker.damageDealt += dealt;
      victim.damageLog.set(attacker.id, this.time);
    }
    const kill = victim.hp <= 0;
    this.events.push({ type: 'hit', attacker: attacker?.id ?? '', victim: victim.id, dmg: Math.round(amount), head, kill });
    if (kill) this.killPlayer(victim, attacker, weapon, head);
    else victim.hp = Math.max(1, Math.round(victim.hp * 10) / 10);
    this.updateScore(attacker);
  }

  damageEntity(e: SimEntity, amount: number, attacker: SimPlayer | null, zone: HitZone, dist: number) {
    if (e.hp <= 0) return;
    e.hp -= amount;
    const kill = e.hp <= 0;
    if (e.type === 'target' && this.state.practice) this.state.practice.hits++;
    this.events.push({ type: 'hit', attacker: attacker?.id ?? '', victim: `e${e.id}`, dmg: Math.round(amount), head: zone === 'head', kill, entity: true, zone, dist: Math.round(dist * 10) / 10 });
    if (!kill) return;
    if (e.type === 'target') {
      e.hp = 0;
      e.respawn = 1.5;
    } else this.removeEntity(e, true);
  }

  killPlayer(victim: SimPlayer, killer: SimPlayer | null, weapon: WeaponId | 'ability' | 'world', head: boolean) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.interact = 0;
    victim.respawnT = this.opts.mode === 'tdm' ? TDM.respawnTime : 0;
    if (victim.hasCharge) this.dropCharge(victim, false);
    if (this.state.charge.actor === victim.id) this.state.charge.actor = null;
    if (this.opts.mode === 'royale') {
      if (victim.primary) this.dropLoot(victim.primary, victim.x, victim.y, victim.z);
      if (victim.armor >= 25) this.dropLoot(victim.armor >= 50 ? 'heavy' : 'light', victim.x + 0.8, victim.y, victim.z);
    }
    const assisters: string[] = [];
    for (const [id, t] of victim.damageLog) {
      if (killer && id === killer.id) continue;
      if (this.time - t > 10) continue;
      const a = this.players.get(id);
      if (a && a.team !== victim.team) {
        a.assists++;
        assisters.push(id);
      }
    }
    if (killer && killer !== victim) {
      if (killer.team === victim.team) killer.kills = Math.max(0, killer.kills - 1);
      else {
        killer.kills++;
        if (this.opts.mode === 'tactical') killer.credits = Math.min(TACTICAL.maxCredits, killer.credits + TACTICAL.killReward);
        this.addUlt(killer, ULT_POINTS.kill);
        if (killer.fx.overdrive > 0) killer.hp = Math.min(MAX_HP, killer.hp + 30);
        if (this.opts.mode === 'tdm' || this.opts.mode === 'royale') this.state.scores[killer.team]++;
      }
    } else if (this.opts.mode === 'tdm') {
      this.state.scores[otherTeam(victim.team)]++;
    }
    this.events.push({ type: 'kill', killer: killer?.id ?? null, victim: victim.id, weapon, head, assisters });
    for (const id of assisters) this.updateScore(this.players.get(id) ?? null);
    this.updateScore(killer);
    if (this.opts.mode === 'tdm' && (this.state.scores.alpha >= this.opts.killLimit || this.state.scores.bravo >= this.opts.killLimit)) {
      this.endMatch(this.state.scores.alpha > this.state.scores.bravo ? 'alpha' : 'bravo');
    }
  }

  private updateScore(p: SimPlayer | null) {
    if (!p) return;
    p.score = Math.round(p.damageDealt + p.kills * 100 + p.assists * 25 + p.plants * 50 + p.defuses * 50);
  }

  // ───────────────────────────── entities ─────────────────────────────

  spawnEntity(e: Omit<SimEntity, 'id'>): SimEntity {
    const ent = { ...e, id: this.nextEntityId++ } as SimEntity;
    this.entities.set(ent.id, ent);
    if (ent.type === 'barrier' && ent.hx && ent.hy && ent.hz) {
      const solid: Solid = {
        minX: ent.x - ent.hx, maxX: ent.x + ent.hx, minY: ent.y, maxY: ent.y + ent.hy * 2, minZ: ent.z - ent.hz, maxZ: ent.z + ent.hz, mat: 'barrier',
      };
      ent.solid = solid;
      this.world.setDynamic(`ent:${ent.id}`, solid);
      this.solidEntity.set(solid, ent);
    }
    return ent;
  }

  removeEntity(e: SimEntity, destroyed: boolean) {
    this.entities.delete(e.id);
    if (e.solid) {
      this.world.setDynamic(`ent:${e.id}`, null);
      this.solidEntity.delete(e.solid);
    }
    if (destroyed) this.events.push({ type: 'entityDestroyed', id: e.id, kind: e.type, x: e.x, y: e.y, z: e.z });
  }

  smokeBlocks(a: Vec3, b: Vec3) {
    for (const e of this.entities.values()) if (e.type === 'smoke' && segmentNearPoint(a, b, { x: e.x, y: e.y + 1.5, z: e.z }, e.r)) return true;
    return false;
  }

  canSee(a: Vec3, b: Vec3) {
    return this.world.lineOfSight(a, b) && !this.smokeBlocks(a, b);
  }

  private updateEntities(dt: number) {
    for (const e of [...this.entities.values()]) {
      if (e.type !== 'target') {
        e.t -= dt;
        if (e.t <= 0) {
          this.removeEntity(e, false);
          continue;
        }
      }
      const owner = this.players.get(e.owner);
      switch (e.type) {
        case 'scanner': {
          e.nextPulse = (e.nextPulse ?? 0) - dt;
          if (e.nextPulse <= 0 && (e.pulses ?? 0) > 0) {
            e.pulses = (e.pulses ?? 1) - 1;
            e.nextPulse = 3;
            const c = { x: e.x, y: e.y + 0.2, z: e.z };
            this.events.push({ type: 'pulse', x: c.x, y: c.y, z: c.z, r: e.r, team: e.team });
            for (const p of this.players.values()) {
              if (!p.alive || p.team === e.team) continue;
              const chest = { x: p.x, y: p.y + 1.2, z: p.z };
              if (Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) < e.r && this.canSee(c, chest)) p.fx.revealed = Math.max(p.fx.revealed, 2);
            }
          }
          break;
        }
        case 'decoy': {
          if (e.move) {
            const steps = 2;
            for (let i = 0; i < steps; i++) {
              stepMovement(e.move, { fwd: 1, right: 0, yaw: e.yaw, jump: false, crouch: false, walk: false, sprint: false }, dt / steps, this.world);
            }
            e.x = e.move.x;
            e.y = e.move.y;
            e.z = e.move.z;
            e.moving = Math.hypot(e.move.vx, e.move.vz) > 0.5;
          }
          break;
        }
        case 'caltrops': {
          for (const p of this.players.values()) {
            if (!p.alive || (p.team === e.team && !this.opts.friendlyFire)) continue;
            if (Math.hypot(p.x - e.x, p.z - e.z) < e.r && Math.abs(p.y - e.y) < 1.5) {
              p.fx.slow = Math.max(p.fx.slow, 0.25);
              this.applyDamage(p, 15 * dt, owner ?? null, 'ability', false);
            }
          }
          break;
        }
        case 'station': {
          for (const p of this.players.values()) {
            if (!p.alive || p.team !== e.team) continue;
            if (Math.hypot(p.x - e.x, p.z - e.z) < e.r && Math.abs(p.y - e.y) < 2) p.hp = Math.min(MAX_HP, p.hp + 12 * dt);
          }
          break;
        }
        case 'turret': {
          e.cd = Math.max(0, (e.cd ?? 0) - dt);
          const head = { x: e.x, y: e.y + 1.05, z: e.z };
          let target: SimPlayer | null = null;
          let bestD = 30;
          for (const p of this.players.values()) {
            if (!p.alive || p.team === e.team) continue;
            const chest = { x: p.x, y: p.y + 1.2, z: p.z };
            const d = Math.hypot(chest.x - head.x, chest.y - head.y, chest.z - head.z);
            if (d < bestD && this.canSee(head, chest)) {
              bestD = d;
              target = p;
            }
          }
          if (!target) {
            e.lockT = 0;
            e.lockTarget = null;
            break;
          }
          e.yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
          if (e.lockTarget !== target.id) {
            e.lockTarget = target.id;
            e.lockT = 0;
          }
          e.lockT = (e.lockT ?? 0) + dt;
          if (e.lockT > 0.6 && e.cd <= 0) {
            e.cd = 0.3;
            const aim = { x: target.x, y: target.y + 1.1, z: target.z };
            const d = Math.hypot(aim.x - head.x, aim.y - head.y, aim.z - head.z);
            const dir0 = { x: (aim.x - head.x) / d, y: (aim.y - head.y) / d, z: (aim.z - head.z) / d };
            const dir = applySpread(dir0, 0.03, this.rng.next(), this.rng.next());
            const tr = this.trace(head, dir, 32, null, undefined, e.team);
            this.events.push({
              type: 'shot', shooter: `e${e.id}`, weapon: 'hornet', o: head,
              hits: [{ x: tr.point.x, y: tr.point.y, z: tr.point.z, nx: tr.normal.x, ny: tr.normal.y, nz: tr.normal.z, m: tr.mat }],
            });
            if (tr.kind === 'player' && tr.player) this.applyDamage(tr.player, 9, owner ?? null, 'ability', false);
            else if (tr.kind === 'entity' && tr.entity) this.damageEntity(tr.entity, 9, owner ?? null, 'body', d);
          }
          break;
        }
        case 'target': {
          if (e.hp <= 0) {
            e.respawn = (e.respawn ?? 0) - dt;
            if (e.respawn <= 0) e.hp = e.maxHp;
            break;
          }
          if (e.patrol && e.patrol > 0) {
            const diff = this.state.practice?.difficulty ?? 'normal';
            const speed = diff === 'easy' ? 1.5 : diff === 'hard' ? 5 : 3;
            e.phase = (e.phase ?? 0) + (dt * speed) / e.patrol;
            let s = Math.sin(e.phase);
            if (diff === 'hard') s = Math.max(-1, Math.min(1, s * 1.4 + 0.3 * Math.sin(e.phase * 3.7)));
            const nx = (e.baseX ?? e.x) + s * e.patrol;
            e.moving = Math.abs(nx - e.x) > 0.001;
            e.yaw = nx > e.x ? -Math.PI / 2 : Math.PI / 2;
            e.x = nx;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private spawnTargets() {
    for (const t of this.map.targets ?? []) {
      this.spawnEntity({
        type: 'target', team: 'bravo', owner: '', x: t.x, y: 0, z: t.z, yaw: 0, hp: 150, maxHp: 150, t: 0, r: 0,
        baseX: t.x, patrol: t.patrol, phase: this.rng.next() * 6, crouch: !!t.crouch, moving: false,
      });
    }
  }

  // ───────────────────────────── objective ─────────────────────────────

  private siteAt(p: Vec3) {
    for (const s of this.map.sites) if (pointInBox({ x: p.x, y: p.y + 0.5, z: p.z }, s.zone)) return s.id;
    return null;
  }

  dropCharge(p: SimPlayer, thrown: boolean) {
    const c = this.state.charge;
    if (!p.hasCharge) return;
    p.hasCharge = false;
    c.status = 'dropped';
    c.carrier = null;
    c.plantProgress = 0;
    p.interact = 0;
    let x = p.x, z = p.z;
    if (thrown) {
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const eye = this.eye(p);
      const hit = this.world.raycast(eye, { x: fx, y: 0, z: fz }, 1.6);
      const d = hit ? Math.max(0, hit.t - 0.4) : 1.5;
      x += fx * d;
      z += fz * d;
    }
    const g = this.world.groundBelow({ x, y: p.y + 1, z }, 60);
    c.x = x;
    c.z = z;
    c.y = g ?? p.y;
    this.events.push({ type: 'chargeDrop', player: p.id });
    if (thrown) p.lastButtons &= ~BTN.USE;
  }

  private updateObjective(dt: number) {
    const c = this.state.charge;
    const phase = this.state.phase;
    if (phase !== 'live' && phase !== 'planted') return;
    const attackers = this.state.attackers;

    if (c.status === 'dropped') {
      for (const p of this.players.values()) {
        if (!p.alive || p.team !== attackers) continue;
        if (Math.hypot(p.x - c.x, p.z - c.z) < TACTICAL.pickupRadius && Math.abs(p.y - c.y) < 2) {
          if ((p.prevButtons & BTN.DROP) !== 0) continue; // don't instantly re-pick a thrown charge
          p.hasCharge = true;
          c.status = 'carried';
          c.carrier = p.id;
          this.events.push({ type: 'chargePickup', player: p.id });
          break;
        }
      }
    }

    if (c.status === 'carried' && phase === 'live') {
      const p = c.carrier ? this.players.get(c.carrier) : undefined;
      if (p) {
        c.x = p.x;
        c.y = p.y;
        c.z = p.z;
        const site = this.siteAt(p);
        const holding = (p.lastButtons & BTN.USE) !== 0 && p.alive && p.onGround && Math.hypot(p.vx, p.vz) < 0.6 && !!site;
        if (holding) {
          if (c.plantProgress === 0) this.events.push({ type: 'plantStart', player: p.id });
          c.plantProgress += dt;
          p.interact = 1;
          c.actor = p.id;
          if (c.plantProgress >= TACTICAL.plantTime) {
            c.status = 'planted';
            c.site = site;
            c.timer = TACTICAL.detonateTime;
            c.carrier = null;
            c.actor = null;
            c.plantProgress = TACTICAL.plantTime;
            p.hasCharge = false;
            p.interact = 0;
            p.plants++;
            this.updateScore(p);
            this.addUlt(p, ULT_POINTS.objective);
            for (const q of this.players.values()) if (q.team === attackers) q.credits = Math.min(TACTICAL.maxCredits, q.credits + TACTICAL.plantReward);
            this.state.phase = 'planted';
            this.state.timeLeft = TACTICAL.detonateTime;
            this.events.push({ type: 'planted', player: p.id, site: site! });
          }
        } else {
          c.plantProgress = 0;
          p.interact = 0;
          if (c.actor === p.id) c.actor = null;
        }
      }
    }

    if (c.status === 'planted') {
      c.timer -= dt;
      this.state.timeLeft = Math.max(0, c.timer);
      const canDefuse = (p: SimPlayer) =>
        p.alive && p.team !== attackers && (p.lastButtons & BTN.USE) !== 0 && p.onGround && Math.hypot(p.vx, p.vz) < 0.6 &&
        Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < TACTICAL.defuseRadius;
      let defuser = c.actor ? this.players.get(c.actor) : undefined;
      if (defuser && !canDefuse(defuser)) {
        defuser.interact = 0;
        defuser = undefined;
        c.actor = null;
      }
      if (!defuser) {
        for (const p of this.players.values()) {
          if (canDefuse(p)) {
            defuser = p;
            c.actor = p.id;
            this.events.push({ type: 'defuseStart', player: p.id });
            break;
          }
        }
      }
      if (defuser) {
        defuser.interact = 2;
        c.defuseProgress += dt;
        if (c.defuseProgress >= TACTICAL.defuseTime) {
          c.status = 'defused';
          defuser.interact = 0;
          defuser.defuses++;
          this.updateScore(defuser);
          this.addUlt(defuser, ULT_POINTS.objective);
          this.events.push({ type: 'defused', player: defuser.id });
          this.endRound(otherTeam(attackers), 'defused');
          return;
        }
      } else {
        c.defuseProgress = c.defuseProgress >= TACTICAL.defuseCheckpoint ? TACTICAL.defuseCheckpoint : 0;
      }
      if (c.timer <= 0) {
        c.status = 'detonated';
        this.events.push({ type: 'detonated', x: c.x, y: c.y, z: c.z });
        for (const p of this.players.values()) {
          if (p.alive && Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < 10) this.applyDamage(p, 250, null, 'world', false);
          p.interact = 0;
        }
        this.endRound(attackers, 'detonated');
      }
    }
  }

  // ───────────────────────────── rounds ─────────────────────────────

  private setBarriers(on: boolean) {
    this.state.barriers = on;
    this.world.clearDynamics('spawn:');
    if (on) this.map.spawnBarriers.forEach((b, i) => this.world.setDynamic(`spawn:${i}`, b));
  }

  private startRound() {
    const newHalf = this.state.round === this.opts.maxRounds / 2;
    this.state.round++;
    this.state.phase = 'buy';
    this.state.timeLeft = TACTICAL.buyTime;
    this.state.roundWinner = null;
    this.state.roundReason = null;
    this.state.charge = this.emptyCharge();
    for (const e of [...this.entities.values()]) this.removeEntity(e, false);
    this.setBarriers(true);
    const idx: Record<TeamId, number> = { alpha: 0, bravo: 0 };
    for (const p of this.players.values()) {
      if (!p.alive || newHalf) {
        p.primary = null;
        p.secondary = DEFAULT_SIDEARM;
        p.armor = 0;
      }
      p.hasCharge = false;
      p.boughtThisRound = [];
      p.abilities = this.freshAbilities(p.character);
      p.spawnIndex = idx[p.team]++;
      p.owPulses = 0;
      p.queue = [];
      this.spawnPlayer(p);
    }
    const attackers = [...this.players.values()].filter((p) => p.team === this.state.attackers);
    if (attackers.length) {
      const connected = attackers.filter((p) => p.connected);
      const pool = connected.length ? connected : attackers;
      const carrier = pool[this.rng.int(pool.length)];
      carrier.hasCharge = true;
      this.state.charge.status = 'carried';
      this.state.charge.carrier = carrier.id;
    }
    this.events.push({ type: 'buyPhase', round: this.state.round });
  }

  private endRound(winner: TeamId, reason: MatchSnap['roundReason'] & string) {
    if (this.state.phase === 'roundEnd' || this.state.phase === 'matchEnd') return;
    const loser = otherTeam(winner);
    this.state.scores[winner]++;
    this.state.roundWinner = winner;
    this.state.roundReason = reason;
    this.state.phase = 'roundEnd';
    this.state.timeLeft = TACTICAL.roundEndTime;
    this.lossStreak[winner] = 0;
    this.lossStreak[loser]++;
    const lossReward = Math.min(TACTICAL.lossRewardMax, TACTICAL.lossReward + (this.lossStreak[loser] - 1) * TACTICAL.lossStreakBonus);
    for (const p of this.players.values()) {
      p.credits = Math.min(TACTICAL.maxCredits, p.credits + (p.team === winner ? TACTICAL.winReward : lossReward));
      this.addUlt(p, ULT_POINTS.round);
      p.interact = 0;
    }
    this.events.push({ type: 'roundEnd', winner, reason });
    const need = this.opts.maxRounds / 2 + 1;
    const s = this.state.scores;
    if (s.alpha >= need) this.state.winner = 'alpha';
    else if (s.bravo >= need) this.state.winner = 'bravo';
    else if (this.state.round >= this.opts.maxRounds) this.state.winner = s.alpha === s.bravo ? 'draw' : s.alpha > s.bravo ? 'alpha' : 'bravo';
  }

  private endMatch(winner: TeamId | 'draw') {
    if (this.state.phase === 'matchEnd') return;
    this.state.winner = winner;
    this.state.phase = 'matchEnd';
    this.state.timeLeft = this.opts.mode === 'tdm' ? TDM.matchEndTime : this.opts.mode === 'royale' ? ROYALE.matchEndTime : TACTICAL.matchEndTime;
    this.events.push({ type: 'matchEnd', winner });
    this.result = this.buildResult();
  }

  private countAlive(team: TeamId) {
    let alive = 0, total = 0;
    for (const p of this.players.values()) {
      if (p.team !== team) continue;
      total++;
      if (p.alive) alive++;
    }
    return { alive, total };
  }

  private updatePhase(dt: number) {
    const st = this.state;
    const mode = this.opts.mode;
    this.updateEnv(dt);
    if (mode === 'practice') return;
    if (mode === 'royale') return this.updateRoyale(dt);
    if (st.phase !== 'planted') st.timeLeft = Math.max(0, st.timeLeft - dt);

    if (mode === 'tdm') {
      if (st.phase === 'buy' && st.timeLeft <= 0) {
        st.phase = 'live';
        st.timeLeft = this.opts.timeLimitSec;
        this.events.push({ type: 'roundStart', round: 1 });
      } else if (st.phase === 'live' && st.timeLeft <= 0) {
        this.endMatch(st.scores.alpha === st.scores.bravo ? 'draw' : st.scores.alpha > st.scores.bravo ? 'alpha' : 'bravo');
      } else if (st.phase === 'matchEnd' && st.timeLeft <= 0) this.finished = true;
      return;
    }

    switch (st.phase) {
      case 'buy':
        if (st.timeLeft <= 0) {
          st.phase = 'live';
          st.timeLeft = TACTICAL.roundTime;
          this.setBarriers(false);
          this.events.push({ type: 'roundStart', round: st.round });
        }
        break;
      case 'live':
      case 'planted': {
        const att = this.countAlive(st.attackers);
        const def = this.countAlive(otherTeam(st.attackers));
        if (def.total > 0 && def.alive === 0) this.endRound(st.attackers, 'elimination');
        else if (st.phase === 'live' && att.total > 0 && att.alive === 0) this.endRound(otherTeam(st.attackers), 'elimination');
        else if (st.phase === 'live' && st.timeLeft <= 0) this.endRound(otherTeam(st.attackers), 'time');
        break;
      }
      case 'roundEnd':
        if (st.timeLeft <= 0) {
          if (st.winner) this.endMatch(st.winner);
          else {
            if (st.round === this.opts.maxRounds / 2) {
              st.attackers = otherTeam(st.attackers);
              this.lossStreak = { alpha: 0, bravo: 0 };
              for (const p of this.players.values()) p.credits = TACTICAL.startCredits;
              this.events.push({ type: 'sideSwitch' });
            }
            this.startRound();
          }
        }
        break;
      case 'matchEnd':
        if (st.timeLeft <= 0) this.finished = true;
        break;
      default:
        break;
    }
  }

  // ───────────────────────────── economy ─────────────────────────────

  inBuyZone(p: SimPlayer) {
    const zone = this.sideOf(p.team) === 'attack' ? this.map.attackZone : this.map.defendZone;
    return pointInBox({ x: p.x, y: p.y + 0.5, z: p.z }, zone);
  }

  canBuy(p: SimPlayer): string | null {
    if (!p.alive) return 'You must be alive to buy.';
    if (this.opts.mode === 'practice') return null;
    if (this.opts.mode === 'royale') return 'No buying in Royale — loot weapons and gear from the world ([E] to pick up).';
    if (this.opts.mode === 'tdm') {
      if (this.state.phase === 'matchEnd') return 'Match is over.';
      if (this.state.phase !== 'buy' && p.sinceSpawn > TDM.buyWindow) return 'Loadout changes are only allowed shortly after spawning.';
      return null;
    }
    if (this.state.phase !== 'buy') return 'Buying is only allowed during the buy phase.';
    if (!this.inBuyZone(p)) return 'You must be inside your spawn zone to buy.';
    return null;
  }

  private priceOf(item: string) {
    if (this.opts.mode !== 'tactical') return 0;
    if (item in WEAPONS) return WEAPONS[item as WeaponId].price;
    if (item in ARMORS) return ARMORS[item as ArmorId].price;
    return 0;
  }

  buy(id: string, item: string): { ok: boolean; error?: string } {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: 'Unknown player.' };
    const why = this.canBuy(p);
    if (why) return { ok: false, error: why };
    if (item in ARMORS) {
      const a = ARMORS[item as ArmorId];
      if (p.armor >= a.value) return { ok: false, error: 'You already have equal or better armor.' };
      let refund = 0;
      for (const prev of ['light', 'heavy']) {
        if (p.boughtThisRound.includes(prev)) refund += this.priceOf(prev);
      }
      const cost = this.priceOf(item);
      if (p.credits + refund < cost) return { ok: false, error: 'Not enough credits.' };
      p.boughtThisRound = p.boughtThisRound.filter((x) => x !== 'light' && x !== 'heavy');
      p.credits += refund - cost;
      p.armor = a.value;
      p.boughtThisRound.push(item);
      this.events.push({ type: 'buy', player: p.id, item });
      return { ok: true };
    }
    if (!(item in WEAPONS)) return { ok: false, error: 'Unknown item.' };
    const w = WEAPONS[item as WeaponId];
    if (w.slot === 3) return { ok: false, error: 'Cannot buy melee weapons.' };
    const current = w.slot === 1 ? p.primary : p.secondary;
    if (current === w.id) return { ok: false, error: `You already own the ${w.name}.` };
    const refund = current && p.boughtThisRound.includes(current) ? this.priceOf(current) : 0;
    const cost = this.priceOf(w.id);
    if (p.credits + refund < cost) return { ok: false, error: 'Not enough credits.' };
    if (current && refund) p.boughtThisRound = p.boughtThisRound.filter((x) => x !== current);
    p.credits += refund - cost;
    giveWeapon(p, w.id);
    equipSlot(p, w.slot);
    p.boughtThisRound.push(w.id);
    this.events.push({ type: 'buy', player: p.id, item });
    return { ok: true };
  }

  sell(id: string, item: string): { ok: boolean; error?: string } {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: 'Unknown player.' };
    if (this.opts.mode !== 'tactical' || this.state.phase !== 'buy') return { ok: false, error: 'Refunds are only possible during the buy phase.' };
    if (!p.boughtThisRound.includes(item)) return { ok: false, error: 'Only items bought this round can be refunded.' };
    p.boughtThisRound = p.boughtThisRound.filter((x) => x !== item);
    p.credits += this.priceOf(item);
    if (item in ARMORS) p.armor = 0;
    else if (item in WEAPONS) {
      const w = WEAPONS[item as WeaponId];
      if (w.slot === 1 && p.primary === w.id) p.primary = null;
      if (w.slot === 2 && p.secondary === w.id) giveWeapon(p, DEFAULT_SIDEARM);
      equipSlot(p, bestSlot(p));
    }
    return { ok: true };
  }

  practiceCommand(id: string, cmd: string) {
    const pr = this.state.practice;
    const p = this.players.get(id);
    if (!pr || !p) return;
    if (cmd === 'reset') {
      pr.hits = 0;
      pr.shots = 0;
      for (const e of this.entities.values()) if (e.type === 'target') e.hp = e.maxHp;
      this.spawnPlayer(p);
    } else if (cmd === 'ammo:on') pr.infiniteAmmo = true;
    else if (cmd === 'ammo:off') pr.infiniteAmmo = false;
    else if (cmd.startsWith('difficulty:')) {
      const d = cmd.slice(11);
      if (d === 'easy' || d === 'normal' || d === 'hard') pr.difficulty = d;
    }
  }

  // ───────────────────────────── output ─────────────────────────────

  private recordHistory() {
    const pos = new Map<string, { x: number; y: number; z: number; crouch: number; alive: boolean }>();
    for (const p of this.players.values()) pos.set(p.id, { x: p.x, y: p.y, z: p.z, crouch: p.crouch, alive: p.alive });
    this.history.push({ tick: this.tick, pos });
    if (this.history.length > LAG_COMP_MAX_TICKS + 4) this.history.shift();
  }

  snapshot(): Snapshot {
    const players: PlayerSnap[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, name: p.name, team: p.team, character: p.character,
        x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, onGround: p.onGround, crouch: p.crouch, jumpCd: p.jumpCd,
        dash: p.dash, dashYaw: p.dashYaw, lean: p.lean, slide: p.slide, slideCd: p.slideCd, slideYaw: p.slideYaw,
        primary: p.primary, secondary: p.secondary, slot: p.slot, ammo: p.ammo.slice(),
        equipT: p.equipT, reloadT: p.reloadT, fireCd: p.fireCd, recoil: p.recoil, prevFire: p.prevFire, ads: p.ads,
        sprintBlocked: p.sprintBlocked,
        alive: p.alive, hp: Math.ceil(p.hp), armor: Math.ceil(p.armor), shield: Math.ceil(p.shield), yaw: p.yaw, pitch: p.pitch,
        credits: p.credits, kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score, ping: p.ping, ult: p.ult,
        abilities: p.abilities.map((a) => ({ charges: a.charges, cd: a.cd })), hasCharge: p.hasCharge, seq: p.seq,
        connected: p.connected, respawnT: p.respawnT, fx: { ...p.fx }, interact: p.interact, skin: p.skin,
      });
    }
    const entities: EntitySnap[] = [];
    for (const e of this.entities.values()) {
      entities.push({
        id: e.id, type: e.type as EntityType, team: e.team, owner: e.owner, x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: Math.ceil(e.hp),
        maxHp: e.maxHp, t: e.t, r: e.r, hx: e.hx, hy: e.hy, hz: e.hz, ch: e.ch, moving: e.moving,
      });
    }
    const sendLoot = this.loot.size > 0 && (this.lootDirty || this.tick % 60 === 0);
    if (this.lootDirty) this.state.lootRev = (this.state.lootRev ?? 0) + 1;
    this.lootDirty = false;
    return {
      tick: this.tick,
      time: this.time,
      players,
      entities,
      loot: sendLoot ? [...this.loot.values()].map((e) => ({ id: e.id, type: e.type, team: e.team, owner: '', x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: 1, maxHp: 1, t: 0, r: 0, item: e.item })) : undefined,
      match: {
        ...this.state, scores: { ...this.state.scores }, charge: { ...this.state.charge }, practice: this.state.practice ? { ...this.state.practice } : undefined,
        env: { ...this.state.env }, zone: this.state.zone ? { ...this.state.zone } : undefined,
      },
      events: this.events,
    };
  }

  buildResult(): MatchResult {
    const players = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, team: p.team, character: p.character, kills: p.kills, deaths: p.deaths, assists: p.assists,
      score: p.score, damage: Math.round(p.damageDealt), headshots: p.headshots, plants: p.plants, defuses: p.defuses,
    }));
    players.sort((a, b) => b.score - a.score);
    return {
      mode: this.opts.mode,
      map: this.opts.map,
      winner: this.state.winner ?? 'draw',
      scores: { ...this.state.scores },
      rounds: this.state.round,
      players,
      mvp: players[0]?.id ?? null,
    };
  }

  // ───────────────────────────── environment ─────────────────────────────

  private initEnv(tod: TimeOfDay | 'map' | undefined, weather: WeatherSetting | undefined) {
    const me = this.map.env;
    let time = me.time;
    this.envCycle = me.timeMode === 'cycle';
    if (tod && tod !== 'map') {
      if (tod === 'cycle') this.envCycle = true;
      else {
        time = TIME_PRESETS[tod];
        this.envCycle = false;
      }
    }
    let w: WeatherKind = me.weather;
    this.envDynamic = !!me.dynamicWeather;
    if (weather && weather !== 'map') {
      if (weather === 'dynamic') this.envDynamic = true;
      else {
        w = weather;
        this.envDynamic = false;
      }
    }
    this.nextWeatherT = 150 + this.rng.next() * 150;
    return { time, weather: w };
  }

  private updateEnv(dt: number) {
    const env = this.state.env;
    if (this.envCycle) env.time = (env.time + dt / 60) % 24; // one in-game hour per real minute
    if (this.envDynamic) {
      this.nextWeatherT -= dt;
      if (this.nextWeatherT <= 0) {
        const options: WeatherKind[] = ['clear', 'clear', 'overcast', 'rain', 'storm', 'fog'].filter((x) => x !== env.weather) as WeatherKind[];
        env.weather = options[this.rng.int(options.length)];
        this.nextWeatherT = 150 + this.rng.next() * 150;
      }
    }
  }

  // ───────────────────────────── royale ─────────────────────────────

  groundY(x: number, z: number) {
    const hit = this.world.raycast({ x, y: 400, z }, { x: 0, y: -1, z: 0 }, 500);
    return hit ? hit.point.y + 0.05 : (this.map.world?.terrain.heightAt(x, z) ?? 0) + 0.05;
  }

  private initRoyale() {
    const st = this.state;
    st.phase = 'buy';
    st.timeLeft = ROYALE.warmup;
    st.round = 1;
    const drops = this.map.world?.royaleDrops ?? this.map.attackSpawns;
    const a = drops[this.rng.int(drops.length)];
    const far = [...drops].sort((p, q) => Math.hypot(q.x - a.x, q.z - a.z) - Math.hypot(p.x - a.x, p.z - a.z)).slice(0, 3);
    const b = far[this.rng.int(far.length)] ?? a;
    this.teamDrop = { alpha: a, bravo: b };
    const ang = this.rng.next() * Math.PI * 2, off = this.rng.next() * 120;
    const cx = Math.cos(ang) * off, cz = Math.sin(ang) * off;
    st.zone = { cx, cz, r: ROYALE.startRadius, nextCx: cx, nextCz: cz, nextR: ROYALE.startRadius, timer: 0, shrinking: false, stage: 0, dps: 1 };
    const spots = [...(this.map.world?.lootSpots ?? [])];
    for (const sp of spots) {
      if (this.rng.next() > 0.72) continue;
      this.dropLoot(this.rollLoot(), sp.x, sp.y, sp.z);
    }
  }

  private rollLoot() {
    const total = LOOT_TABLE.reduce((s, [, w]) => s + w, 0);
    let x = this.rng.next() * total;
    for (const [id, w] of LOOT_TABLE) {
      x -= w;
      if (x <= 0) return id;
    }
    return 'ammo';
  }

  dropLoot(item: string, x: number, y: number, z: number) {
    const id = this.nextEntityId++;
    this.loot.set(id, { id, type: 'loot', team: 'alpha', owner: '', x, y: y + 0.05, z, yaw: this.rng.next() * 6, hp: 1, maxHp: 1, t: 0, r: 0, item });
    this.lootDirty = true;
  }

  private pickup(p: SimPlayer) {
    let best: SimEntity | null = null;
    let bd = ROYALE.pickupRadius;
    for (const e of this.loot.values()) {
      const d = Math.hypot(e.x - p.x, e.z - p.z) + Math.abs(e.y - p.y) * 0.6;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best || !best.item) return;
    const item = best.item;
    let name = LOOT_NAMES[item] ?? item;
    if (item in WEAPONS) {
      const w = WEAPONS[item as WeaponId];
      name = w.name;
      const old = w.slot === 1 ? p.primary : p.secondary;
      if (old === w.id) return;
      giveWeapon(p, w.id);
      equipSlot(p, w.slot);
      if (old) this.dropLoot(old, p.x, p.y, p.z);
    } else if (item === 'light' || item === 'heavy') {
      const v = ARMORS[item].value;
      if (p.armor >= v) return;
      p.armor = v;
    } else if (item === 'ammo') {
      let gained = false;
      for (const slot of [1, 2] as const) {
        const id = slot === 1 ? p.primary : p.secondary;
        if (!id) continue;
        const i = (slot - 1) * 2 + 1;
        if (p.ammo[i] < WEAPONS[id].reserve) {
          p.ammo[i] = WEAPONS[id].reserve;
          gained = true;
        }
      }
      if (!gained) return;
    } else if (item === 'medkit') {
      if (p.hp >= MAX_HP) return;
      p.hp = Math.min(MAX_HP, p.hp + 50);
    }
    this.loot.delete(best.id);
    this.lootDirty = true;
    this.events.push({ type: 'buy', player: p.id, item });
    this.events.push({ type: 'notice', to: p.id, text: `Picked up ${name}` });
  }

  private nextZone() {
    const z = this.state.zone!;
    const stage = ROYALE.stages[z.stage];
    if (!stage) return;
    const half = this.map.world?.half ?? 500;
    const slack = Math.max(0, (z.r - stage.radius) * 0.75);
    const ang = this.rng.next() * Math.PI * 2, d = Math.sqrt(this.rng.next()) * slack;
    z.nextR = stage.radius;
    z.nextCx = Math.max(-half + stage.radius, Math.min(half - stage.radius, z.cx + Math.cos(ang) * d));
    z.nextCz = Math.max(-half + stage.radius, Math.min(half - stage.radius, z.cz + Math.sin(ang) * d));
    z.timer = stage.wait;
  }

  private updateRoyale(dt: number) {
    const st = this.state;
    const z = st.zone!;
    if (st.phase === 'buy') {
      st.timeLeft = Math.max(0, st.timeLeft - dt);
      if (st.timeLeft <= 0) {
        st.phase = 'live';
        this.nextZone();
        st.timeLeft = z.timer;
        this.events.push({ type: 'roundStart', round: 1 });
      }
      return;
    }
    if (st.phase === 'matchEnd') {
      st.timeLeft = Math.max(0, st.timeLeft - dt);
      if (st.timeLeft <= 0) this.finished = true;
      return;
    }
    // zone schedule
    z.timer -= dt;
    if (!z.shrinking) {
      if (z.timer <= 0 && z.stage < ROYALE.stages.length) {
        z.shrinking = true;
        z.timer = ROYALE.stages[z.stage].shrink;
        this.zoneFrom = { cx: z.cx, cz: z.cz, r: z.r };
        this.events.push({ type: 'notice', to: null, text: 'The zone is closing in!' });
      }
    } else {
      const sg = ROYALE.stages[z.stage];
      const t = 1 - Math.max(0, z.timer) / sg.shrink;
      z.cx = this.zoneFrom.cx + (z.nextCx - this.zoneFrom.cx) * t;
      z.cz = this.zoneFrom.cz + (z.nextCz - this.zoneFrom.cz) * t;
      z.r = this.zoneFrom.r + (z.nextR - this.zoneFrom.r) * t;
      if (z.timer <= 0) {
        z.shrinking = false;
        z.dps = sg.dps;
        z.stage++;
        if (z.stage < ROYALE.stages.length) this.nextZone();
        else z.timer = 0;
      }
    }
    st.timeLeft = Math.max(0, z.timer);
    // damage outside the zone, once per second
    if (this.tick % 30 === 0) {
      for (const p of this.players.values()) {
        if (p.alive && Math.hypot(p.x - z.cx, p.z - z.cz) > z.r) this.applyDamage(p, z.dps, null, 'world', false);
      }
    }
    // win conditions
    const present = new Set<TeamId>(), alive = new Set<TeamId>();
    for (const p of this.players.values()) {
      present.add(p.team);
      if (p.alive) alive.add(p.team);
    }
    if (present.size >= 2 && alive.size <= 1) this.endMatch(alive.size ? [...alive][0] : 'draw');
    else if (present.size === 1 && alive.size === 0) this.endMatch('draw');
    else if (z.stage >= ROYALE.stages.length) {
      this.zoneEndT += dt;
      if (this.zoneEndT > 30) this.endMatch(st.scores.alpha === st.scores.bravo ? 'draw' : st.scores.alpha > st.scores.bravo ? 'alpha' : 'bravo');
    }
  }

  /** Utility for abilities: is a footprint free of players? */
  footprintFree(b: Box) {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const pb = playerBox(p.x, p.y, p.z, 1.8);
      if (pb.minX < b.maxX && pb.maxX > b.minX && pb.minZ < b.maxZ && pb.maxZ > b.minZ && pb.minY < b.maxY && pb.maxY > b.minY) return false;
    }
    return true;
  }

  /** Utility for abilities: find the ally under the player's crosshair. */
  aimAlly(p: SimPlayer, range: number): SimPlayer | null {
    const o = this.eye(p);
    const d = dirFromAngles(p.yaw, p.pitch);
    const wall = this.world.raycast(o, d, range);
    const maxT = wall ? wall.t : range;
    let best: SimPlayer | null = null;
    let bestT = maxT;
    for (const q of this.players.values()) {
      if (q === p || !q.alive || q.team !== p.team) continue;
      const c = { x: q.x, y: q.y + 1.1, z: q.z };
      const t = raySphere(o, d, c, 0.7, bestT);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = q;
      }
    }
    return best;
  }
}
