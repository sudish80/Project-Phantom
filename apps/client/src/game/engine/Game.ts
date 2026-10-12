import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  applySpread, BTN, CHARACTERS, CollisionWorld, computeSpread, copyCore, currentWeapon, dirFromAngles, envFor, eyeFor, getMap,
  hitboxes, INPUT_DT, INTERP_DELAY_TICKS, leanOffset, LEAN_ROLL, lerpAngle, newCore, pointInBox, rayBox, recoilOffset,
  stepPlayerCore, TACTICAL, TICK_MS,
  WALK_SPEED, WEAPONS, weaponInSlot, wrapAngle, type CoreResult, type GameEvent, type GameStartPayload, type InputCmd, type MapDef,
  type PlayerCore, type PlayerSnap, type Snapshot, type TeamId, type Vec3, type WeaponId,
} from '@phantom/shared';
import { defaultSightFor, getSight, type SightId } from '../weapons/Sights';
import { useApp } from '../../stores/app';
import { useGameUi } from '../../stores/gameUi';
import { hudFx, useHud, type KillFeedEntry } from '../../stores/hud';
import { useAim } from '../../stores/aim';
import { touchModeActive, useSettings } from '../../stores/settings';
import { EntityRenderer } from '../abilities/EntityRenderer';
import { audio, type AnnouncerLine } from '../audio/AudioEngine';
import { Effects } from '../effects/Effects';
import { CharacterModel } from '../player/CharacterModel';
import { MapRenderer } from '../rendering/MapRenderer';
import { Atmosphere } from '../rendering/Atmosphere';
import { WorldRenderer, renderWorldMap } from '../world/WorldRenderer';
import { energyClock, paletteAt } from '../weapons/EnergyMaterial';
import { getSkin, LOOT_NAMES, ROYALE, type EntitySnap, type ZoneState } from '@phantom/shared';
import { Viewmodel } from '../weapons/Viewmodel';
import type { GameConnection } from './connection';
import { Input } from './Input';

const ALLY = 0x36c2ff;
const ENEMY = 0xff4655;
const SENS_BASE = 0.0016;
/** touch drag: a full-width swipe (~800 CSS px) turns roughly 180° at sensitivity 1 */
const TOUCH_SENS_MUL = 2.4;
const VARIABLE_ZOOMS = [2, 3, 4, 6];

interface Remote {
  id: string;
  model: CharacterModel;
  kick: number;
  cast: number;
  stepDist: number;
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  team: TeamId;
  alive: boolean;
  character: string;
}

interface Interp {
  x: number; y: number; z: number; yaw: number; pitch: number; crouch: number;
  vx: number; vy: number; vz: number; onGround: boolean;
  lean: number; slide: number;
}

export interface MinimapData {
  map: MapDef;
  image?: HTMLCanvasElement | null;
  zone?: ZoneState | null;
  marker?: { x: number; z: number } | null;
  me: { x: number; z: number; yaw: number; team: TeamId } | null;
  players: { x: number; z: number; yaw: number; ally: boolean; alive: boolean; revealed: boolean; carrier: boolean }[];
  charge: { x: number; z: number; status: string } | null;
}

/**
 * Client game runtime: rendering, input, client-side prediction with server
 * reconciliation, interpolation of remote players, effects, audio and HUD feed.
 */

/** seconds to bring each weapon class fully onto the sights (lighter guns are faster) */
const ADS_TIME: Partial<Record<string, number>> = { sidearm: 0.17, smg: 0.19, rifle: 0.23, shotgun: 0.23, heavy: 0.32, sniper: 0.32 };

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 700);
  readonly map: MapDef;
  private world: CollisionWorld;
  private mapRender: MapRenderer;
  readonly input: Input;
  private vm: Viewmodel;
  private fx: Effects;
  private ents = new EntityRenderer();
  private remotes = new Map<string, Remote>();
  private snaps: Snapshot[] = [];
  latest: Snapshot | null = null;
  private self: PlayerSnap | null = null;
  private core: PlayerCore = newCore();
  private yaw = 0;
  private pitch = 0;
  private seq = 0;
  private pending: InputCmd[] = [];
  private outbox: InputCmd[] = [];
  private lastSend = 0;
  private acc = 0;
  private lastFrame = performance.now();
  private time = 0;
  private raf = 0;
  private tickOffset: number | null = null;
  private smooth = new THREE.Vector3();
  private needsSpawnSync = true;
  private pendingSlot = 0;
  private crouchToggle = false;
  private adsToggle = false;
  private stepDist = 0;
  /** latched click so taps shorter than a frame still fire */
  private firePress = false;
  /** latched slide tap so a quick C press still registers as an edge */
  private slidePress = false;
  private bobPhase = 0;
  private hudTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private killfeed: KillFeedEntry[] = [];
  private kfId = 1;
  private banner: { big: string; small: string; kind: 'win' | 'lose' | 'neutral'; until: number } | null = null;
  private killerId: string | null = null;
  private deathPos = new THREE.Vector3();
  private spectateIdx = 0;
  private shake = 0;
  private punch = 0;
  private beepT = 0;
  private interactTickT = 0;
  private lookDX = 0;
  private lookDY = 0;
  private zoom = 1;
  /** linear aim-down-sights progress 0..1 (timed per weapon class) */
  private adsP = 0;
  private opticZoomS = 1;
  private scopeAim = { adsT: 0, scopeT: 0, scoped: false };
  private varZoomIdx = 2;
  private lastOpticWeapon: WeaponId | null = null;
  private slideBlend = 0;
  private lastIntentSprint = false;
  /** kills in the current round (tactical) / current life (other modes) */
  private killStreak = 0;
  /** first kill of the round (tactical) / match (other modes) has happened */
  private firstBlood = false;
  private wasSliding = false;
  private disposed = false;
  private lastHits: { dmg: number; zone?: string; dist?: number; t: number }[] = [];
  private unsub: (() => void)[] = [];
  private sun: THREE.DirectionalLight;
  private pmrem: THREE.PMREMGenerator;
  private atmo: Atmosphere;
  private worldR: WorldRenderer | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private energyLight = new THREE.PointLight(0xffffff, 0, 4.5, 2);
  private loot: EntitySnap[] = [];
  private mapImage: HTMLCanvasElement | null = null;
  marker: { x: number; z: number } | null = null;
  private lastZoneStage = -1;
  private outsideZoneT = 0;
  private underwater = 0;
  private sunCenter = new THREE.Vector3();
  private shadowFrame = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly conn: GameConnection,
    readonly start: GameStartPayload,
    readonly kind: 'online' | 'practice',
  ) {
    const s = useSettings.getState();
    this.map = getMap(start.map);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: s.antialias && s.quality !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.map.env.wet ? 1.15 : 1.0;
    this.renderer.shadowMap.enabled = s.shadows !== 'off' && s.quality !== 'low';
    this.renderer.shadowMap.type = s.shadows === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.applyPixelRatio();

    const env = this.map.env;
    this.scene.background = new THREE.Color(env.skyBottom);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = env.wet ? 0.45 : 0.3;
    this.camera.rotation.order = 'YXZ';
    this.camera.far = this.map.world ? 1400 : 700;
    this.scene.add(this.camera);

    this.sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity);
    const b = this.map.bounds;
    const center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    if (this.renderer.shadowMap.enabled) {
      this.sun.castShadow = true;
      const size = this.map.world ? (s.quality === 'high' && s.shadows === 'high' ? 2048 : 1024) : s.shadows === 'high' && s.quality === 'high' ? 4096 : 2048;
      this.sun.shadow.mapSize.set(size, size);
      // open world: a 180 m shadow window that follows the player; arenas: whole map
      const half = this.map.world ? (s.quality === 'high' ? 80 : 55) : Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62;
      // the open world is mostly static: refresh the shadow map every few frames instead of every frame
      if (this.map.world) this.renderer.shadowMap.autoUpdate = false;
      Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: 400 });
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
    }
    this.scene.add(this.sun, this.sun.target);
    this.sunCenter = center;
    this.atmo = new Atmosphere(this.scene, this.sun, env, s.quality, center);
    this.atmo.onThunder = (delay) => setTimeout(() => audio.thunder(delay / 3), delay * 1000);

    this.mapRender = new MapRenderer(this.map, s.quality);
    this.scene.add(this.mapRender.group);
    this.world = new CollisionWorld(this.map.solids, this.map.world?.terrain ?? null);
    if (this.map.world) {
      this.worldR = new WorldRenderer(this.map.world, s.quality);
      this.scene.add(this.worldR.group);
      const wr = this.worldR;
      this.mapImage = renderWorldMap(this.map.world, this.map.solids, (x, z) => wr.terrain.splat(x, z), 1024);
    }
    this.fx = new Effects(s.quality);
    this.scene.add(this.fx.group, this.ents.group, this.energyLight);
    this.vm = new Viewmodel(s.character);
    this.vm.onCue = (cue) => audio.handling(cue, WEAPONS[weaponInSlot(this.core, this.core.slot) ?? 'edge'], null);
    audio.hrtf = s.quality !== 'low';
    if (s.bloom && s.quality !== 'low') {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const vmPass = new RenderPass(this.vm.scene, this.vm.camera);
      vmPass.clear = false;
      vmPass.clearDepth = true;
      this.composer.addPass(vmPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.input = new Input(canvas);
    this.input.setLockListener((locked) => {
      const ui = useGameUi.getState();
      if (locked) {
        if (ui.overlay === 'capture' || ui.overlay === 'pause') ui.set({ overlay: null });
      } else if (ui.overlay === null) ui.set({ overlay: 'pause' });
    });
    useGameUi.getState().set({ overlay: 'capture', scoreboard: false, minimap: s.showMinimap });
    // phones / tablets: on-screen touch controls instead of pointer lock
    this.input.setTouchMode(touchModeActive(s.controlMode));
    this.unsub.push(
      useSettings.subscribe((n, o) => {
        if (n.controlMode !== o.controlMode) this.input.setTouchMode(touchModeActive(n.controlMode));
      }),
    );

    conn.onSnapshot((snap) => this.onSnapshot(snap));
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.unsub.push(() => window.removeEventListener('resize', onResize));
    this.unsub.push(useSettings.subscribe((n, o) => {
      if (n.renderScale !== o.renderScale || n.quality !== o.quality) this.applyPixelRatio();
    }));
    this.resize();
    useHud.getState().set({ ready: false, you: start.you, mode: start.mode, killfeed: [], banner: null, lastHits: [] });
    audio.stopMusic();
    audio.startAmbience(this.map.id);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ───────────────────────────── setup helpers ─────────────────────────────

  private applyPixelRatio() {
    const s = useSettings.getState();
    const base = s.quality === 'low' ? 0.75 : s.quality === 'medium' ? 1 : Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(Math.max(0.4, base * s.renderScale));
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
  }

  requestLock() {
    audio.ensure();
    if (this.input.touch) {
      // no pointer lock on touch screens: just close the capture / pause overlay
      this.input.requestLock();
      const ui = useGameUi.getState();
      if (ui.overlay === 'capture' || ui.overlay === 'pause') ui.set({ overlay: null });
      return;
    }
    this.input.requestLock();
    // Browsers may refuse (e.g. right after Esc); fall back to the click-to-play prompt.
    setTimeout(() => {
      const ui = useGameUi.getState();
      if (!this.disposed && !this.input.locked && ui.overlay === null) ui.set({ overlay: 'capture' });
    }, 400);
  }

  exitLock() {
    this.input.exitLock();
  }

  get you() {
    return this.start.you;
  }

  // ───────────────────────────── networking ─────────────────────────────

  private estTick(now = performance.now()) {
    return this.tickOffset === null ? 0 : now / TICK_MS + this.tickOffset;
  }

  private renderTick() {
    return this.estTick() - INTERP_DELAY_TICKS;
  }

  private onSnapshot(s: Snapshot) {
    if (this.disposed) return;
    const sample = s.tick - performance.now() / TICK_MS;
    if (this.tickOffset === null || Math.abs(sample - this.tickOffset) > 6) this.tickOffset = sample;
    else this.tickOffset += (sample - this.tickOffset) * 0.06;
    this.latest = s;
    if (s.loot) {
      this.loot = s.loot;
      this.worldR?.setLoot(s.loot);
    }
    this.snaps.push(s);
    while (this.snaps.length > 40) this.snaps.shift();

    // dynamic collision (spawn barriers + barrier entities) mirrors the server
    this.world.clearDynamics();
    if (s.match.barriers) this.map.spawnBarriers.forEach((bb, i) => this.world.setDynamic(`spawn:${i}`, bb));
    for (const e of s.entities) {
      if (e.type === 'barrier' && e.hx && e.hy && e.hz)
        this.world.setDynamic(`ent:${e.id}`, { minX: e.x - e.hx, maxX: e.x + e.hx, minY: e.y, maxY: e.y + e.hy * 2, minZ: e.z - e.hz, maxZ: e.z + e.hz, mat: 'barrier' });
    }
    this.mapRender.setBarriers(s.match.barriers, !this.self);

    for (const ev of s.events) this.onEvent(ev, s);
    const me = s.players.find((p) => p.id === this.you);
    if (me) this.reconcile(me, s);
    this.ents.myTeam = me?.team ?? 'alpha';
    this.ents.sync(s.entities, (id) => s.players.find((p) => p.id === id)?.character);

    // create / drop remote models
    const ids = new Set<string>();
    for (const p of s.players) {
      if (p.id === this.you) continue;
      ids.add(p.id);
      let r = this.remotes.get(p.id);
      const ally = me ? p.team === me.team : false;
      if (!r || r.character !== p.character) {
        if (r) this.removeRemote(r);
        const model = new CharacterModel(p.character, ally ? ALLY : ENEMY);
        r = { id: p.id, model, kick: 0, cast: 0, stepDist: 0, pos: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw, pitch: p.pitch, team: p.team, alive: p.alive, character: p.character };
        this.remotes.set(p.id, r);
        this.scene.add(model.root);
      }
      r.model.setTeamColor(ally ? ALLY : ENEMY);
      r.team = p.team;
    }
    for (const r of [...this.remotes.values()]) if (!ids.has(r.id)) this.removeRemote(r);
    if (!useHud.getState().ready) useHud.getState().set({ ready: true });
  }

  private removeRemote(r: Remote) {
    this.scene.remove(r.model.root);
    r.model.dispose();
    this.remotes.delete(r.id);
  }

  private reconcile(me: PlayerSnap, s: Snapshot) {
    const wasAlive = this.self?.alive ?? false;
    this.self = me;
    if (!me.alive) {
      if (wasAlive) {
        this.deathPos.set(this.core.x, this.core.y, this.core.z);
        this.adsToggle = false;
      }
      this.pending = [];
      return;
    }
    if (!wasAlive || this.needsSpawnSync) {
      this.needsSpawnSync = false;
      copyCore(me, this.core);
      this.yaw = me.yaw;
      this.pitch = me.pitch;
      this.pending = this.pending.filter((c) => c.s > me.seq);
      this.smooth.set(0, 0, 0);
      this.vm.startEquip(WEAPONS[weaponInSlot(me, me.slot) ?? 'edge'].equipTime);
      this.killerId = null;
      this.spectateIdx = 0;
      return;
    }
    this.pending = this.pending.filter((c) => c.s > me.seq);
    const bx = this.core.x, by = this.core.y, bz = this.core.z;
    copyCore(me, this.core);
    const env = envFor(s.match, me);
    for (const c of this.pending) stepPlayerCore(this.core, c, INPUT_DT, this.world, env);
    const ex = bx - this.core.x, ey = by - this.core.y, ez = bz - this.core.z;
    const err = Math.hypot(ex, ey, ez);
    if (err > 2.5) this.smooth.set(0, 0, 0);
    else if (err > 0.001) this.smooth.add(new THREE.Vector3(ex, ey, ez));
  }

  private flushInputs(now: number) {
    if (!this.outbox.length) return;
    if (this.outbox.length >= 4 || now - this.lastSend > 30) {
      while (this.outbox.length) this.conn.sendInputs(this.outbox.splice(0, 8));
      this.lastSend = now;
    }
  }

  // ───────────────────────────── main loop ─────────────────────────────

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.time += dt;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    try {
      this.handleKeys();
      this.look();
      this.acc += dt;
      let steps = 0;
      while (this.acc >= INPUT_DT && steps < 8) {
        this.stepInput(dt);
        this.acc -= INPUT_DT;
        steps++;
      }
      if (steps === 8) this.acc = 0;
      this.flushInputs(now);
      this.updateRemotes(dt);
      this.updateCamera(dt);
      this.updateWorld(dt);
      if (this.map.world && this.renderer.shadowMap.enabled && ++this.shadowFrame % (useSettings.getState().quality === 'high' ? 2 : 3) === 0) this.renderer.shadowMap.needsUpdate = true;
      if (this.composer) this.composer.render(dt);
      else {
        this.renderer.render(this.scene, this.camera);
        this.vm.render(this.renderer);
      }
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.hudTimer = 1 / 20;
        this.pushHud();
      }
    } catch (err) {
      console.error('Frame error', err);
    }
    this.input.endFrame();
  };

  private handleKeys() {
    const ui = useGameUi.getState();
    const inp = this.input;
    const s = useSettings.getState();
    const m = this.latest?.match;
    // scoreboard (hold)
    const sb = inp.held('scoreboard');
    if (sb !== ui.scoreboard) ui.set({ scoreboard: sb });
    if (inp.press('minimap')) ui.set({ minimap: !ui.minimap });
    if (inp.press('worldMap') && this.map.world) {
      if (ui.overlay === 'map') {
        ui.set({ overlay: null });
        this.requestLock();
      } else if (ui.overlay === null) {
        ui.set({ overlay: 'map' });
        this.exitLock();
      }
    }
    if (inp.press('buy')) {
      if (ui.overlay === 'buy') {
        ui.set({ overlay: null });
        this.requestLock();
      } else if (ui.overlay === null && this.self?.alive && m && m.phase !== 'matchEnd') {
        ui.set({ overlay: 'buy' });
        this.exitLock();
      }
    }
    if (inp.pressCode('Escape') && ui.overlay === 'buy') ui.set({ overlay: 'capture' });
    if (ui.overlay !== null || !inp.locked) return;
    // touch buttons do their own toggling and hold the key while on
    if (s.crouchMode === 'toggle' && !inp.touch && inp.press('crouch')) this.crouchToggle = !this.crouchToggle;
    if (s.aimMode === 'toggle' && !inp.touch && inp.pressCode('Mouse2')) this.adsToggle = !this.adsToggle;
    if (inp.press('slide')) this.slidePress = true;
    if (inp.press('slot1')) this.selectSlot(1);
    if (inp.press('slot2')) this.selectSlot(2);
    if (inp.press('slot3')) this.selectSlot(3);
    if (inp.wheel !== 0) {
      const cw = currentWeapon(this.core);
      if (this.core.ads && cw.ads && getSight(this.sightFor(cw.id)).id === 'variable') {
        this.varZoomIdx = (this.varZoomIdx + (inp.wheel > 0 ? 1 : -1) + VARIABLE_ZOOMS.length) % VARIABLE_ZOOMS.length;
      } else {
        const order = [1, 2, 3].filter((sl) => weaponInSlot(this.core, sl));
        const i = order.indexOf(this.core.slot);
        const next = order[(i + (inp.wheel > 0 ? 1 : -1) + order.length) % order.length];
        if (next) this.selectSlot(next);
      }
    }
    if (inp.press('inspect') && this.core.reloadT <= 0 && this.core.equipT <= 0) {
      this.vm.inspect();
    }
    if (inp.pressCode('Mouse0')) {
      if (this.self && !this.self.alive) this.spectateIdx++;
      else this.firePress = true;
    }
  }

  private selectSlot(sl: number) {
    if (!weaponInSlot(this.core, sl)) return;
    this.pendingSlot = sl;
  }

  private look() {
    const s = useSettings.getState();
    const scoped = this.core.ads && !!currentWeapon(this.core).ads;
    const touch = this.input.touch;
    const base = touch ? s.touchSens * TOUCH_SENS_MUL : s.sensitivity;
    const sens = SENS_BASE * base * (scoped ? (touch ? s.touchAdsSens : s.adsSensitivity) / this.zoom : 1);
    const dx = this.input.dx, dy = this.input.dy;
    this.lookDX = dx;
    this.lookDY = dy;
    if (!this.input.locked) return;
    this.yaw = wrapAngle(this.yaw - dx * sens);
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens * (s.invertY ? -1 : 1), -1.5, 1.5);
  }

  private stepInput(frameDt: number) {
    const s = useSettings.getState();
    const ui = useGameUi.getState();
    const inp = this.input;
    const active = inp.locked && ui.overlay === null;
    let f = 0, r = 0, b = 0;
    if (active) {
      if (inp.held('forward')) f += 1;
      if (inp.held('back')) f -= 1;
      if (inp.held('right')) r += 1;
      if (inp.held('left')) r -= 1;
      // analog touch stick
      f = THREE.MathUtils.clamp(f + inp.move.f, -1, 1);
      r = THREE.MathUtils.clamp(r + inp.move.r, -1, 1);
      if (inp.held('jump')) b |= BTN.JUMP;
      if (s.crouchMode === 'toggle' && !inp.touch ? this.crouchToggle : inp.held('crouch')) b |= BTN.CROUCH;
      if (inp.held('sprint')) b |= BTN.SPRINT;
      if (inp.held('walk')) b |= s.shiftMode === 'walk' ? BTN.WALK : BTN.SPRINT;
      // peek lean — holding both cancels to neutral (handled in the sim)
      if (inp.held('leanLeft')) b |= BTN.LEAN_LEFT;
      if (inp.held('leanRight')) b |= BTN.LEAN_RIGHT;
      if (this.slidePress) b |= BTN.SLIDE;
      if (inp.heldCode('Mouse0') || this.firePress) b |= BTN.FIRE;
      if (s.aimMode === 'toggle' && !inp.touch ? this.adsToggle : inp.heldCode('Mouse2')) b |= BTN.ADS;
      if (inp.held('reload')) b |= BTN.RELOAD;
      if (inp.held('use')) b |= BTN.USE;
      if (inp.held('drop')) b |= BTN.DROP;
      if (inp.held('ab1')) b |= BTN.AB1;
      if (inp.held('ab2')) b |= BTN.AB2;
      if (inp.held('ab3')) b |= BTN.AB3;
      if (inp.held('ult')) b |= BTN.ULT;
    }
    if (this.self && !this.self.alive) b &= ~BTN.FIRE;
    const cmd: InputCmd = { s: ++this.seq, f, r, b, y: this.yaw, p: this.pitch, sl: this.pendingSlot, vt: Math.round(this.renderTick() * 100) / 100 };
    this.pendingSlot = 0;
    // latched taps fire for one command, then release so edges are seen
    this.firePress = false;
    this.slidePress = false;
    if (this.self?.alive && this.latest) {
      const env = envFor(this.latest.match, this.self);
      const res = stepPlayerCore(this.core, cmd, INPUT_DT, this.world, env);
      // sprinting = sprint held, moving forward, not crouched, and not blocked by firing / aiming
      this.lastIntentSprint = (b & BTN.SPRINT) !== 0 && !this.core.sprintBlocked && f > 0 && this.core.crouch < 0.5;
      const sliding = this.core.slide > 0;
      if (sliding && !this.wasSliding) audio.slide(null);
      this.wasSliding = sliding;
      this.onLocalStep(res, cmd, frameDt);
    }
    this.pending.push(cmd);
    if (this.pending.length > 240) this.pending.shift();
    this.outbox.push(cmd);
  }

  private onLocalStep(res: CoreResult, cmd: InputCmd, _frameDt: number) {
    const w = WEAPONS[res.weapon];
    const s = useSettings.getState();
    if (res.switched) {
      // draw / ready sounds come from the viewmodel's equip timeline
      this.vm.startEquip(WEAPONS[weaponInSlot(this.core, this.core.slot) ?? 'edge'].equipTime);
    }
    if (res.fired) {
      this.vm.fire();
      audio.gunshot(w, null, true);
      if (getSkin(s.skin).energy) audio.energyShot(1 + (this.core.slot - 1) * 0.15);
      this.predictShot(res, cmd);
      if (s.cameraShake) this.shake = Math.min(1, this.shake + w.sound.punch * 0.25);
      this.punch += w.category === 'melee' ? 0 : w.recoil.v * 0.6;
    }
    if (res.dryFire) audio.dryFire();
    if (res.reloadStarted) {
      const env = this.latest && this.self ? envFor(this.latest.match, this.self) : null;
      // reload sounds are cued by the viewmodel animation (in sync with each part moving)
      this.vm.startReload(w.reloadTime / (env?.reloadMul ?? 1));
    }
    if (res.jumped) audio.jump(null);
    if (res.landed) {
      audio.land(null, res.landSpeed);
      if (res.landSpeed > 6) this.fx.dust({ x: this.core.x, y: this.core.y, z: this.core.z });
      if (s.cameraShake) this.shake = Math.min(1, this.shake + res.landSpeed * 0.03);
    }
    const speed = Math.hypot(this.core.vx, this.core.vz);
    if (this.core.onGround && speed > WALK_SPEED + 0.4 && this.core.crouch < 0.5) {
      this.stepDist += speed * INPUT_DT;
      if (this.stepDist > 2.3) {
        this.stepDist = 0;
        audio.footstep(null, this.surfaceUnder(this.core) === 'metal');
      }
    }
  }

  private surfaceUnder(p: { x: number; y: number; z: number }) {
    const hit = this.world.raycast({ x: p.x, y: p.y + 0.1, z: p.z }, { x: 0, y: -1, z: 0 }, 0.5);
    const m = hit?.solid.mat;
    return m === 'metal' || m === 'trim' || m?.startsWith('container') ? 'metal' : 'other';
  }

  /** Immediate local visual for a shot (server remains authoritative for damage). */
  private predictShot(res: CoreResult, cmd: InputCmd) {
    const w = WEAPONS[res.weapon];
    const lo = leanOffset(this.core.lean, this.yaw);
    const eye = { x: this.core.x + lo.x, y: this.core.y + eyeFor(this.core.crouch), z: this.core.z + lo.z };
    const rec = recoilOffset(w, res.recoilAtFire);
    const base = dirFromAngles(cmd.y + rec.dy, THREE.MathUtils.clamp(cmd.p + rec.dp, -1.55, 1.55));
    const spread = computeSpread(w, { speedH: Math.hypot(this.core.vx, this.core.vz), onGround: this.core.onGround, crouch: this.core.crouch, ads: this.core.ads, recoil: res.recoilAtFire });
    const muzzle = this.vm.muzzleWorld(new THREE.Vector3());
    this.camera.updateMatrixWorld();
    const mw = this.camera.localToWorld(muzzle.clone());
    if (w.category !== 'melee') this.fx.muzzleLight(mw);
    const me = this.self;
    for (let i = 0; i < w.pellets; i++) {
      const dir = applySpread(base, spread, Math.random(), Math.random());
      const hit = this.world.raycast(eye, dir, w.range);
      let t = hit ? hit.t : w.range;
      let onPlayer = false;
      for (const r of this.remotes.values()) {
        if (!r.alive || (me && r.team === me.team && !this.latest?.match.friendlyFire)) continue;
        for (const hb of hitboxes(r.pos.x, r.pos.y, r.pos.z, 0)) {
          const h = rayBox(eye, dir, hb.box, t);
          if (h && h.t < t) {
            t = h.t;
            onPlayer = true;
          }
        }
      }
      const end = { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t };
      if (w.category === 'melee') continue;
      if (w.pellets === 1 || i % 3 === 0) this.fx.tracer(mw, end, 0xffe2b0, 0.05);
      if (onPlayer) this.fx.impact({ ...end, nx: -dir.x, ny: -dir.y, nz: -dir.z, m: 'player' });
      else if (hit && t === hit.t) {
        this.fx.impact({ ...end, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z, m: hit.solid.mat });
        if (i === 0) audio.impact(end, hit.solid.mat === 'metal' || hit.solid.mat.startsWith('container'));
      }
    }
  }

  // ───────────────────────────── interpolation ─────────────────────────────

  private interpolated(id: string): (Interp & { snap: PlayerSnap }) | null {
    if (!this.snaps.length) return null;
    const rt = this.renderTick();
    let a = this.snaps[0], b: Snapshot | null = null;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].tick <= rt) {
        a = this.snaps[i];
        b = this.snaps[i + 1] ?? null;
        break;
      }
    }
    const pa = a.players.find((p) => p.id === id);
    const pb = b?.players.find((p) => p.id === id);
    const latest = this.latest?.players.find((p) => p.id === id);
    if (!pa && !pb) return latest ? { ...latest, snap: latest } : null;
    if (!pa || !pb || !b) {
      const p = (pa ?? pb)!;
      return { ...p, snap: latest ?? p };
    }
    const t = THREE.MathUtils.clamp((rt - a.tick) / (b.tick - a.tick || 1), 0, 1);
    const teleport = Math.hypot(pb.x - pa.x, pb.z - pa.z) > 4;
    const L = (x: number, y: number) => (teleport ? y : x + (y - x) * t);
    return {
      x: L(pa.x, pb.x), y: L(pa.y, pb.y), z: L(pa.z, pb.z),
      yaw: lerpAngle(pa.yaw, pb.yaw, t), pitch: L(pa.pitch, pb.pitch), crouch: L(pa.crouch, pb.crouch),
      vx: L(pa.vx, pb.vx), vy: L(pa.vy, pb.vy), vz: L(pa.vz, pb.vz), onGround: t < 0.5 ? pa.onGround : pb.onGround,
      lean: L(pa.lean, pb.lean), slide: L(pa.slide, pb.slide),
      snap: latest ?? pb,
    };
  }

  private updateRemotes(dt: number) {
    const me = this.self;
    for (const r of this.remotes.values()) {
      const ip = this.interpolated(r.id);
      if (!ip) continue;
      const p = ip.snap;
      r.pos.set(ip.x, ip.y, ip.z);
      r.yaw = ip.yaw;
      r.pitch = ip.pitch;
      r.alive = p.alive;
      r.model.root.position.copy(r.pos);
      r.model.root.rotation.y = ip.yaw;
      r.model.setWeapon(weaponInSlot(p, p.slot), p.skin);
      r.kick = Math.max(0, r.kick - dt * 8);
      r.cast = Math.max(0, r.cast - dt * 2.5);
      const speed = Math.hypot(ip.vx, ip.vz);
      const phase = this.latest?.match.phase;
      r.model.update(dt, {
        speed, vy: ip.vy, onGround: ip.onGround, crouch: ip.crouch, pitch: ip.pitch, alive: p.alive, reloading: p.reloadT > 0,
        fireKick: r.kick, interact: p.interact, cast: r.cast, lean: ip.lean, sliding: p.slide > 0,
        pose: phase === 'matchEnd' && this.latest?.match.winner ? (this.latest.match.winner === p.team ? 'victory' : 'defeat') : null,
      });
      const enemy = me ? p.team !== me.team : true;
      r.model.setXray(enemy && p.alive && p.fx.revealed > 0);
      // hide the spectated player's own model
      r.model.root.visible = !(this.spectating() === r.id) && (p.alive || this.latest?.match.mode === 'tactical') && !(r.model.dissolved && !p.alive);
      // remote footsteps (walking is silent)
      if (p.alive && ip.onGround && speed > WALK_SPEED + 0.4 && ip.crouch < 0.5) {
        r.stepDist += speed * dt;
        if (r.stepDist > 2.3) {
          r.stepDist = 0;
          audio.footstep({ x: ip.x, y: ip.y, z: ip.z }, this.surfaceUnder(ip) === 'metal', 1.2);
        }
      }
    }
  }

  private spectating(): string | null {
    const me = this.self;
    if (!me || me.alive || !this.latest) return null;
    if (this.latest.match.mode !== 'tactical') return null;
    const mates = this.latest.players.filter((p) => p.team === me.team && p.alive && p.id !== me.id);
    if (!mates.length) return null;
    return mates[this.spectateIdx % mates.length].id;
  }

  // ───────────────────────────── camera / world ─────────────────────────────

  private sightFor(id: WeaponId): SightId {
    const sights = useSettings.getState().sights;
    return sights[id] ?? defaultSightFor(WEAPONS[id]);
  }

  /**
   * Local player's kill confirmation: escalating sound, multi-kill callout (banner + announcer)
   * and the skin colours used by the kill effect.
   */
  private confirmKill(head: boolean, first: boolean): number[] {
    const n = this.killStreak;
    const skin = getSkin(useSettings.getState().skin);
    const colors = skin.energy ? skin.energy.colors : [0xff4d2e, 0xffc070, 0xffffff];
    const tactical = this.latest?.match.mode === 'tactical';
    const label = n >= 5 ? (tactical ? 'ACE' : 'PENTA KILL') : n === 4 ? 'QUADRA KILL' : n === 3 ? 'TRIPLE KILL' : n === 2 ? 'DOUBLE KILL' : first ? 'FIRST BLOOD' : null;
    audio.killConfirm(n, head, skin.energy ? skin.energy.colors : null);
    // the announcer says what the banner shows: the multi-kill callout, or "headshot"
    if (label) audio.announce(label.toLowerCase().replace(' ', '-') as AnnouncerLine);
    else if (head) audio.announce('headshot');
    hudFx.emit({ type: 'kill', count: n, head, color: '#' + new THREE.Color(colors[0]).getHexString(), label });
    return colors;
  }

  private updateCamera(dt: number) {
    const s = useSettings.getState();
    const me = this.self;
    this.smooth.multiplyScalar(Math.exp(-dt * 14));
    this.shake = Math.max(0, this.shake - dt * 4);
    this.punch = Math.max(0, this.punch - dt * this.punch * 12 - dt * 0.02);
    this.slideBlend += ((this.core.slide > 0 ? 1 : 0) - this.slideBlend) * Math.min(1, dt * 10);
    const w = currentWeapon(this.core);
    const optic = getSight(this.sightFor(w.id));
    if (this.lastOpticWeapon !== w.id) {
      this.lastOpticWeapon = w.id;
      this.varZoomIdx = 2;
    }
    const opticZoom = optic.id === 'variable' ? VARIABLE_ZOOMS[this.varZoomIdx] : optic.zoom;
    const aspect = this.camera.aspect;
    const slideKick = this.slideBlend * (this.core.ads ? 0 : 0.05);
    const vfov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(s.fov * (1 + slideKick)) / 2) / Math.max(aspect, 0.5)) * 180) / Math.PI;
    // ADS is a timed transition: the weapon rises to the eye first, then (for magnified tubes)
    // the scope image takes over. Camera zoom, viewmodel pose and scope overlay all follow the
    // same progress value so they can't get out of step.
    const aiming = !!(me?.alive && this.core.ads && w.ads);
    const adsTime = ADS_TIME[w.category] ?? 0.2;
    this.adsP = THREE.MathUtils.clamp(this.adsP + (aiming ? dt : -dt * 1.25) / adsTime, 0, 1);
    if (!me?.alive) this.adsP = 0;
    const easeP = this.adsP * this.adsP * (3 - 2 * this.adsP);
    const tubeP = optic.tube ? THREE.MathUtils.smoothstep(this.adsP, 0.55, 1) : easeP;
    // variable-zoom steps glide instead of snapping
    this.opticZoomS = this.adsP <= 0 ? opticZoom : this.opticZoomS + (opticZoom - this.opticZoomS) * Math.min(1, dt * 12);
    this.zoom = 1 + (this.opticZoomS - 1) * (w.ads ? tubeP : 0);
    this.scopeAim.adsT = easeP;
    this.scopeAim.scopeT = optic.tube ? THREE.MathUtils.smoothstep(this.adsP, 0.7, 0.95) : 0;
    this.scopeAim.scoped = optic.tube && this.adsP > 0.9;
    this.camera.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) / this.zoom) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();

    const speed = Math.hypot(this.core.vx, this.core.vz);
    let vmVisible = false;
    if (me?.alive) {
      vmVisible = true;
      const rec = recoilOffset(w, this.core.recoil);
      let bobY = 0, bobX = 0;
      if (s.headBob && this.core.onGround && speed > 0.5) {
        this.bobPhase += dt * speed * 1.9;
        bobY = Math.abs(Math.sin(this.bobPhase)) * 0.035 * Math.min(1, speed / 5.4);
        bobX = Math.cos(this.bobPhase) * 0.02 * Math.min(1, speed / 5.4);
      }
      const sh = this.shake * 0.012;
      const lo = leanOffset(this.core.lean, this.yaw);
      const sb = this.slideBlend;
      this.camera.position.set(
        this.core.x + this.smooth.x + lo.x + Math.cos(this.yaw) * bobX,
        this.core.y + this.smooth.y + eyeFor(this.core.crouch) + bobY - sb * 0.05,
        this.core.z + this.smooth.z + lo.z - Math.sin(this.yaw) * bobX,
      );
      this.camera.rotation.set(
        this.pitch + rec.dp + this.punch + (Math.random() - 0.5) * sh + sb * 0.03,
        this.yaw + rec.dy + (Math.random() - 0.5) * sh,
        this.core.lean * LEAN_ROLL + sb * 0.05,
      );
    } else if (me) {
      const spec = this.spectating();
      const ip = spec ? this.interpolated(spec) : null;
      if (ip) {
        const lo = leanOffset(ip.lean, ip.yaw);
        this.camera.position.set(ip.x + lo.x, ip.y + eyeFor(ip.crouch), ip.z + lo.z);
        this.camera.rotation.set(ip.pitch, ip.yaw, ip.lean * LEAN_ROLL);
      } else {
        // death cam: hover above the body and look at the killer if known
        const killer = this.killerId ? this.interpolated(this.killerId) : null;
        const p = this.deathPos;
        const target = killer ? new THREE.Vector3(killer.x, killer.y + 1.2, killer.z) : new THREE.Vector3(p.x, p.y, p.z - 5);
        const camPos = new THREE.Vector3(p.x, p.y + 3.2, p.z).add(new THREE.Vector3(Math.sin(this.time * 0.2) * 2, 0, Math.cos(this.time * 0.2) * 2));
        this.camera.position.lerp(camPos, Math.min(1, dt * 3));
        const m = new THREE.Matrix4().lookAt(this.camera.position, target, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        this.camera.quaternion.slerp(q, Math.min(1, dt * 4));
      }
    }

    const ws = WEAPONS[weaponInSlot(this.core, this.core.slot) ?? 'edge'];
    this.vm.setWeapon(ws.id, s.skin, this.sightFor(ws.id));
    // real sprint state (sprint held, moving forward, not blocked by firing/aiming) rather than a speed guess
    const sprinting = this.lastIntentSprint && this.core.onGround && !this.core.ads && speed > 4;
    this.vm.update(dt, {
      speed, onGround: this.core.onGround, ads: this.core.ads, crouch: this.core.crouch, lookDX: this.lookDX, lookDY: this.lookDY,
      reloadT: this.core.reloadT, equipT: this.core.equipT, sprinting, lowered: (me?.interact ?? 0) > 0, headBob: s.headBob,
      lean: this.core.lean, sliding: this.core.slide > 0,
      visible: vmVisible && !this.scopeAim.scoped,
      adsT: easeP,
    });
    // per-frame aim state for the crosshair / reticle / scope overlay
    const alive = !!me?.alive;
    useAim.setState({
      adsT: this.scopeAim.adsT,
      scopeT: this.scopeAim.scopeT,
      zoom: this.zoom,
      scoped: alive && this.scopeAim.scoped,
      spread: alive ? computeSpread(w, { speedH: speed, onGround: this.core.onGround, crouch: this.core.crouch, ads: this.core.ads, recoil: this.core.recoil }) : 0,
      lowered: alive && (sprinting || this.core.slide > 0),
    });

    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    audio.setListener(this.camera.position, fwd);
  }

  private updateWorld(dt: number) {
    const s = useSettings.getState();
    const cam = this.camera.position;
    const env = this.latest?.match.env;
    // open world: the shadow window follows the camera (snapped to avoid shimmering)
    if (this.map.world) this.sunCenter.set(Math.round(cam.x / 8) * 8, 0, Math.round(cam.z / 8) * 8);
    this.atmo.update(dt, this.time, env, cam);
    const night = this.atmo.night;
    this.renderer.toneMappingExposure = (this.map.env.wet ? 1.1 : 1.0) + night * 0.35;
    // the reflection probe is a neutral studio: dim it at night so wet streets don't glow
    this.scene.environmentIntensity = (this.map.env.wet ? 0.45 : 0.3) * (0.2 + 0.8 * (1 - night));
    this.mapRender.setEnvironment(night, this.atmo.wet);
    if (this.bloom) this.bloom.strength = 0.45 + night * 0.35;
    energyClock.value += dt;
    const skin = getSkin(s.skin);
    const ew = currentWeapon(this.core);
    this.vm.scene.environment = this.scene.environment;
    this.vm.scene.environmentIntensity = 0.55 + (1 - this.atmo.night) * 0.25;
    this.vm.setEmpty(ew.mag > 0 && this.core.ammo[(ew.slot - 1) * 2] === 0);
    this.vm.setLowAmmo(ew.mag > 0 && this.core.ammo[(ew.slot - 1) * 2] <= Math.ceil(ew.mag * 0.25));
    if (skin.energy && this.self?.alive) {
      const mz = this.vm.muzzleWorld(new THREE.Vector3());
      this.camera.updateMatrixWorld();
      this.energyLight.position.copy(this.camera.localToWorld(mz.multiplyScalar(0.7)));
      this.energyLight.color.copy(paletteAt(skin.energy.colors, energyClock.value * skin.energy.speed));
      this.energyLight.intensity = 0.25 + this.vm.energyIntensity * 0.45;
    } else this.energyLight.intensity = 0;
    const lvl = this.worldR?.water.levelAt(cam.x, cam.z) ?? null;
    this.underwater = lvl !== null && cam.y < lvl - 0.05 ? 1 : 0;
    let waterNear = 0;
    if (this.worldR && lvl !== null) waterNear = 1;
    else if (this.map.world) {
      const w = this.map.world;
      for (const lk of w.lakes) if (Math.hypot(cam.x - lk.x, cam.z - lk.z) < lk.r + 30) waterNear = 0.7;
      for (let i = 0; i < w.river.length; i += 4) if (Math.hypot(cam.x - w.river[i].x, cam.z - w.river[i].z) < 30) waterNear = 0.8;
    }
    audio.setWeatherBeds(this.atmo.rainAmt * (this.underwater ? 0.2 : 1), this.atmo.wind, waterNear, skin.energy && this.self?.alive ? 0.4 + this.vm.energyIntensity * 0.3 : 0);
    if (this.worldR) {
      this.worldR.update(dt, cam, {
        night, wet: this.atmo.wet, rain: this.atmo.rainAmt, wind: this.atmo.wind, sunDir: this.atmo.sunDir, sunColor: this.atmo.sunColor,
        sunI: this.sun.intensity, sky: this.atmo.horizon, amb: this.atmo.hemi.color.clone().multiplyScalar(this.atmo.hemi.intensity * 0.6),
        player: this.self?.alive ? new THREE.Vector3(this.core.x, this.core.y, this.core.z) : null, zone: this.latest?.match.zone,
      });
    }
    this.updateZoneFeedback(dt);
    this.mapRender.update(dt, this.time);
    this.ents.update(dt, this.time);
    this.fx.update(dt);
    const c = this.latest?.match.charge ?? null;
    this.ents.setDevice(c, this.time);
    if (c?.status === 'planted') {
      this.beepT -= dt;
      if (this.beepT <= 0) {
        const frac = Math.max(0, c.timer / TACTICAL.detonateTime);
        this.beepT = 0.12 + frac * 0.9;
        audio.beep({ x: c.x, y: c.y + 0.4, z: c.z }, c.timer < 10);
      }
    }
    if (this.self?.interact) {
      this.interactTickT -= dt;
      if (this.interactTickT <= 0) {
        this.interactTickT = 0.45;
        if (this.self.interact === 1) audio.plantTick();
        else audio.defuseTick();
      }
    }
  }

  private updateZoneFeedback(dt: number) {
    const z = this.latest?.match.zone;
    if (!z || !this.self?.alive) return;
    if (z.stage !== this.lastZoneStage) {
      if (this.lastZoneStage >= 0) audio.zoneWarning();
      this.lastZoneStage = z.stage;
    }
    if (z.shrinking && z.timer > ROYALE.stages[Math.min(z.stage, ROYALE.stages.length - 1)].shrink - 0.1) audio.zoneWarning();
    const outside = Math.hypot(this.core.x - z.cx, this.core.z - z.cz) > z.r;
    if (outside) {
      this.outsideZoneT -= dt;
      if (this.outsideZoneT <= 0) {
        this.outsideZoneT = 1;
        audio.zoneDamage();
      }
    } else this.outsideZoneT = 0;
  }

  // ───────────────────────────── events ─────────────────────────────

  private nameOf(id: string | null, s: Snapshot) {
    if (!id) return null;
    return s.players.find((p) => p.id === id)?.name ?? null;
  }

  private posOf(id: string, s: Snapshot): Vec3 | null {
    if (id === this.you) return { x: this.core.x, y: this.core.y + 1, z: this.core.z };
    const r = this.remotes.get(id);
    if (r) return { x: r.pos.x, y: r.pos.y + 1, z: r.pos.z };
    const p = s.players.find((q) => q.id === id);
    return p ? { x: p.x, y: p.y + 1, z: p.z } : null;
  }

  private setBanner(big: string, small: string, kind: 'win' | 'lose' | 'neutral', secs = 3) {
    this.banner = { big, small, kind, until: this.time + secs };
  }

  private onEvent(ev: GameEvent, s: Snapshot) {
    const me = s.players.find((p) => p.id === this.you);
    const myTeam = me?.team;
    switch (ev.type) {
      case 'shot': {
        if (ev.shooter === this.you) break;
        const w = WEAPONS[ev.weapon];
        let from: Vec3 = ev.o;
        const r = this.remotes.get(ev.shooter);
        if (r) {
          r.kick = 1;
          const mv = r.model.muzzleWorld(new THREE.Vector3());
          from = { x: mv.x, y: mv.y, z: mv.z };
          this.fx.muzzleLight(from);
        } else if (ev.shooter.startsWith('e')) {
          this.fx.muzzleLight(from, 0xff8a50);
        }
        if (w.category === 'melee') {
          audio.swing(from);
          break;
        }
        audio.gunshot(w, from);
        ev.hits.forEach((h, i) => {
          if (w.pellets === 1 || i % 3 === 0) this.fx.tracer(from, h, 0xffd9a0, 0.07);
          this.fx.impact(h);
        });
        break;
      }
      case 'hit': {
        if (ev.attacker === this.you) {
          hudFx.emit({ type: 'hitmarker', head: ev.head, kill: ev.kill });
          // the kill confirm sound plays from the kill event; entity kills (targets) keep the chime
          if (!ev.kill || ev.entity) audio.hit(ev.head, ev.kill);
          if (ev.entity && ev.kill && this.latest?.match.mode === 'practice') {
            const obj = this.ents.objectFor(Number(ev.victim.slice(1)));
            this.killStreak = this.killStreak >= 5 ? 1 : this.killStreak + 1;
            const first = !this.firstBlood;
            this.firstBlood = true;
            const colors = this.confirmKill(ev.head, first);
            if (obj) this.fx.killEffect({ x: obj.position.x, y: obj.position.y, z: obj.position.z }, colors, ev.head);
            this.ents.dissolve(Number(ev.victim.slice(1)), colors[0]);
          }
          if (ev.entity) {
            this.ents.flash(Number(ev.victim.slice(1)));
            this.lastHits = [{ dmg: ev.dmg, zone: ev.zone, dist: ev.dist, t: this.time }, ...this.lastHits].slice(0, 6);
          }
        }
        if (ev.victim === this.you && ev.dmg > 0) {
          const src = ev.attacker ? this.posOf(ev.attacker, s) : null;
          let angle = 0;
          if (src) angle = wrapAngle(Math.atan2(-(src.x - this.core.x), -(src.z - this.core.z)) - this.yaw);
          hudFx.emit({ type: 'damage', angle, amount: ev.dmg });
          audio.hurt(ev.dmg);
          if (useSettings.getState().cameraShake) this.shake = Math.min(1, this.shake + 0.3);
        }
        break;
      }
      case 'kill': {
        const victim = s.players.find((p) => p.id === ev.victim);
        const killer = ev.killer ? s.players.find((p) => p.id === ev.killer) : null;
        this.killfeed = [
          ...this.killfeed,
          {
            id: this.kfId++, killer: killer?.name ?? null, killerTeam: killer?.team ?? null, victim: victim?.name ?? '?', victimTeam: victim?.team ?? 'alpha',
            weapon: ev.weapon === 'ability' ? 'Ability' : ev.weapon === 'world' ? 'World' : WEAPONS[ev.weapon].name, head: ev.head,
            mine: ev.killer === this.you || ev.victim === this.you, t: this.time,
          },
        ].slice(-6);
        if (ev.victim === this.you) {
          this.killerId = ev.killer;
          this.deathPos.set(this.core.x, this.core.y, this.core.z);
          const ui = useGameUi.getState();
          if (ui.overlay === 'buy') ui.set({ overlay: null });
        }
        const vr = this.remotes.get(ev.victim);
        const first = !this.firstBlood && !!ev.killer && ev.killer !== ev.victim;
        if (first) this.firstBlood = true;
        if (ev.victim === this.you) this.killStreak = 0;
        if (ev.killer === this.you && ev.victim !== this.you) {
          this.killStreak++;
          const colors = this.confirmKill(ev.head, first);
          if (vr) {
            vr.model.dissolve(colors[0]);
            this.fx.killEffect({ x: vr.pos.x, y: vr.pos.y, z: vr.pos.z }, colors, ev.head);
          }
        } else if (vr) this.fx.burst({ x: vr.pos.x, y: vr.pos.y + 1, z: vr.pos.z }, vr.team === myTeam ? ALLY : ENEMY, 30, 3);
        break;
      }
      case 'ability': {
        const def = Object.values(CHARACTERS).flatMap((c) => c.abilities).find((a) => a?.id === ev.ability);
        if (ev.player === this.you) {
          this.vm.cast();
          audio.ability(ev.ability, null);
        } else {
          const r = this.remotes.get(ev.player);
          if (r) r.cast = 1;
          audio.ability(ev.ability, ev);
        }
        if (def?.key === 'ult') {
          const who = this.nameOf(ev.player, s);
          if (ev.player !== this.you && who) this.setBanner(def.name, `${who} activated their ultimate`, ev.team === myTeam ? 'neutral' : 'lose', 2);
        }
        break;
      }
      case 'pulse':
        this.fx.ring(ev, ev.r, ev.team === myTeam ? ALLY : ENEMY, 1.1);
        audio.pulse(ev);
        break;
      case 'reload':
        if (ev.player !== this.you) {
          const p = s.players.find((q) => q.id === ev.player);
          const pos = this.posOf(ev.player, s);
          if (p && pos) audio.reload(WEAPONS[weaponInSlot(p, p.slot) ?? 'wisp'], pos);
        }
        break;
      case 'jump':
        if (ev.player !== this.you) {
          const pos = this.posOf(ev.player, s);
          if (pos) audio.jump(pos);
        }
        break;
      case 'land':
        if (ev.player !== this.you) {
          const pos = this.posOf(ev.player, s);
          if (pos) audio.land(pos, ev.speed);
        }
        break;
      case 'planted': {
        audio.planted();
        const att = s.match.attackers === myTeam;
        this.setBanner('Device planted', `Site ${ev.site}${att ? ' — defend it' : ' — defuse it'}`, att ? 'neutral' : 'lose', 3);
        break;
      }
      case 'defused':
        audio.defused();
        this.setBanner('Device defused', '', s.match.attackers === myTeam ? 'lose' : 'win', 3);
        break;
      case 'detonated':
        audio.detonate(ev);
        this.fx.detonation(ev);
        this.shake = 1;
        break;
      case 'chargeDrop':
        if (myTeam === s.match.attackers) useApp.getState().toast(`${this.nameOf(ev.player, s) ?? 'Someone'} dropped the device`);
        break;
      case 'chargePickup':
        if (ev.player === this.you) useApp.getState().toast('You picked up the device. Hold E inside a site to plant.', 'ok');
        break;
      case 'buyPhase':
        this.needsSpawnSync = true;
        this.killStreak = 0;
        this.firstBlood = false;
        this.fx.clearDecals();
        audio.stinger('buy');
        this.setBanner(`Round ${ev.round}`, me?.team === s.match.attackers ? 'Attack — press B to buy' : 'Defend — press B to buy', 'neutral', 3);
        break;
      case 'roundStart':
        audio.stinger('roundStart');
        this.setBanner(s.match.mode === 'tdm' ? 'Fight' : `Round ${ev.round}`, s.match.mode === 'tdm' ? `First to ${s.match.killLimit} kills` : 'Barriers down', 'neutral', 2);
        break;
      case 'roundEnd': {
        const won = ev.winner === myTeam;
        audio.stinger(won ? 'win' : 'lose');
        const reasons: Record<string, string> = { elimination: 'Team eliminated', time: 'Time expired', detonated: 'Device detonated', defused: 'Device defused', kills: '' };
        this.setBanner(won ? 'Round won' : 'Round lost', reasons[ev.reason] ?? '', won ? 'win' : 'lose', 4);
        break;
      }
      case 'sideSwitch':
        audio.stinger('switch');
        this.setBanner('Switching sides', 'Credits reset', 'neutral', 3);
        break;
      case 'matchEnd': {
        const won = ev.winner === myTeam;
        const draw = ev.winner === 'draw';
        audio.stinger(draw ? 'switch' : won ? 'victory' : 'defeat');
        this.setBanner(draw ? 'Draw' : won ? 'Victory' : 'Defeat', `${s.match.scores.alpha} : ${s.match.scores.bravo}`, draw ? 'neutral' : won ? 'win' : 'lose', 30);
        if (this.kind === 'online') {
          const st = useSettings.getState();
          const mine = s.players.find((p) => p.id === this.you);
          if (mine) {
            st.set({
              stats: {
                ...st.stats, matches: st.stats.matches + 1, wins: st.stats.wins + (won ? 1 : 0), kills: st.stats.kills + mine.kills,
                deaths: st.stats.deaths + mine.deaths, assists: st.stats.assists + mine.assists,
              },
            });
          }
        }
        break;
      }
      case 'respawn':
        if (ev.player === this.you) this.needsSpawnSync = true;
        break;
      case 'buy':
        if (ev.player === this.you) {
          if (s.match.mode === 'royale') audio.pickup();
          else audio.ui('click');
        }
        break;
      case 'entityDestroyed':
        this.fx.burst(ev, 0x9fe2ff, 26, 3);
        audio.abilityEnd(ev);
        break;
      case 'notice':
        if (!ev.to || ev.to === this.you) useApp.getState().toast(ev.text);
        break;
      default:
        break;
    }
  }

  // ───────────────────────────── HUD bridge ─────────────────────────────

  private pushHud() {
    const s = this.latest;
    const me = this.self;
    if (!s || !me) return;
    const m = s.match;
    const w = currentWeapon(this.core);
    const optic = getSight(this.sightFor(w.id));
    const ai = (w.slot - 1) * 2;
    const counts = { alpha: { alive: 0, total: 0 }, bravo: { alive: 0, total: 0 } };
    for (const p of s.players) {
      counts[p.team].total++;
      if (p.alive) counts[p.team].alive++;
    }
    // interaction prompt
    let prompt: { text: string; progress?: number } | null = null;
    const c = m.charge;
    const feet = { x: this.core.x, y: this.core.y + 0.5, z: this.core.z };
    if (m.mode === 'tactical' && me.alive) {
      const inSite = this.map.sites.find((site) => pointInBox(feet, site.zone));
      if (me.interact === 1) prompt = { text: 'Planting…', progress: c.plantProgress / TACTICAL.plantTime };
      else if (me.interact === 2) prompt = { text: 'Defusing…', progress: c.defuseProgress / TACTICAL.defuseTime };
      else if (me.hasCharge && inSite && m.phase === 'live') prompt = { text: 'Hold [E] to plant the device — stay still' };
      else if (me.team !== m.attackers && c.status === 'planted' && Math.hypot(c.x - this.core.x, c.y - this.core.y, c.z - this.core.z) < 2.2)
        prompt = { text: `Hold [E] to defuse${c.defuseProgress >= TACTICAL.defuseCheckpoint ? ' (half done)' : ''}` };
      else if (me.hasCharge && m.phase === 'buy') prompt = { text: 'You carry the device. [G] to drop it' };
    }
    const zone = me.team === m.attackers ? this.map.attackZone : this.map.defendZone;
    const inBuyZone = pointInBox(feet, zone);
    const canBuy = m.mode === 'practice' || (m.mode === 'tdm' ? m.phase !== 'matchEnd' : m.phase === 'buy' && inBuyZone);
    if (!prompt && canBuy && m.phase === 'buy' && me.alive && m.mode !== 'royale') prompt = { text: 'Press [B] to open the buy menu' };
    if (!prompt && me.alive && this.loot.length) {
      const l = this.worldR?.nearestLoot({ x: this.core.x, y: this.core.y, z: this.core.z }, ROYALE.pickupRadius);
      if (l?.item) prompt = { text: `Press [E] to pick up ${WEAPONS[l.item as keyof typeof WEAPONS]?.name ?? LOOT_NAMES[l.item] ?? l.item}` };
    }
    if (!prompt && m.zone && me.alive && Math.hypot(this.core.x - m.zone.cx, this.core.z - m.zone.cz) > m.zone.r) prompt = { text: '⚠ Outside the zone — move to safety' };
    const camPos = this.camera.position;
    let smoke = 0;
    for (const sm of this.ents.smokes) {
      const d = camPos.distanceTo(sm.pos);
      if (d < sm.r) smoke = Math.max(smoke, Math.min(1, (sm.r - d) / 1.2) * sm.scale);
    }
    this.killfeed = this.killfeed.filter((k) => this.time - k.t < 7);
    const spec = this.spectating();
    useHud.getState().set({
      you: this.you,
      mode: m.mode,
      team: me.team,
      character: me.character,
      alive: me.alive,
      hp: me.hp,
      armor: me.armor,
      shield: me.shield,
      credits: me.credits,
      weapon: w.id,
      slot: this.core.slot,
      primary: this.core.primary,
      secondary: this.core.secondary,
      mag: this.core.ammo[ai] ?? 0,
      reserve: this.core.ammo[ai + 1] ?? 0,
      reloading: this.core.reloadT > 0,
      abilities: me.abilities,
      ult: me.ult,
      fx: me.fx,
      phase: m.phase,
      timeLeft: m.timeLeft,
      round: m.round,
      scores: m.scores,
      attackers: m.attackers,
      charge: m.charge,
      hasCharge: me.hasCharge,
      aliveCounts: counts,
      killfeed: this.killfeed,
      banner: this.banner && this.banner.until > this.time ? this.banner : null,
      prompt,
      spectating: spec ? (s.players.find((p) => p.id === spec)?.name ?? null) : null,
      respawnT: me.respawnT,
      inBuyZone,
      canBuy,
      smoke,
      scoped: me.alive && this.scopeAim.scoped,
      sight: optic.id,
      reticle: optic.reticle,
      reticleColor: optic.color,
      opticFx: optic.effect ?? null,
      adsT: this.scopeAim.adsT,
      zoom: this.zoom,
      scopeT: this.scopeAim.scopeT,
      sprinting: me.alive && this.core.onGround && Math.hypot(this.core.vx, this.core.vz) > 6 && !this.core.ads,
      sliding: me.alive && this.core.slide > 0,
      spread: me.alive ? computeSpread(w, { speedH: Math.hypot(this.core.vx, this.core.vz), onGround: this.core.onGround, crouch: this.core.crouch, ads: this.core.ads, recoil: this.core.recoil }) : 0,
      ping: this.conn.ping(),
      fps: this.fps,
      players: s.players,
      match: m,
      practice: m.practice ?? null,
      lastHits: this.lastHits.filter((h) => this.time - h.t < 8),
      underwater: this.underwater,
      heading: this.yaw,
      position: { x: this.core.x, y: this.core.y, z: this.core.z },
      openWorld: !!this.map.world,
      timeOfDay: this.atmo.timeOfDay,
      weather: m.env?.weather ?? 'clear',
      marker: this.marker,
    });
  }

  minimap(): MinimapData {
    const s = this.latest;
    const me = this.self;
    const players: MinimapData['players'] = [];
    if (s && me) {
      for (const p of s.players) {
        if (p.id === this.you) continue;
        const r = this.remotes.get(p.id);
        const ally = p.team === me.team;
        if (!ally && !(p.fx.revealed > 0)) continue;
        players.push({ x: r?.pos.x ?? p.x, z: r?.pos.z ?? p.z, yaw: r?.yaw ?? p.yaw, ally, alive: p.alive, revealed: p.fx.revealed > 0, carrier: p.hasCharge });
      }
    }
    const c = s?.match.charge;
    const showCharge = c && me && (c.status === 'planted' || (me.team === s!.match.attackers && c.status === 'dropped'));
    return {
      map: this.map,
      image: this.mapImage,
      zone: s?.match.zone ?? null,
      marker: this.marker,
      me: me ? { x: this.core.x, z: this.core.z, yaw: this.yaw, team: me.team } : null,
      players,
      charge: showCharge ? { x: c!.x, z: c!.z, status: c!.status } : null,
    };
  }

  buy(item: string) {
    return this.conn.buy(item);
  }

  sell(item: string) {
    return this.conn.sell(item);
  }

  practice(cmd: string) {
    this.conn.practice?.(cmd);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unsub.forEach((u) => u());
    this.input.dispose();
    this.conn.close();
    for (const r of this.remotes.values()) r.model.dispose();
    this.ents.dispose();
    this.fx.dispose();
    this.vm.dispose();
    this.mapRender.dispose();
    this.pmrem.dispose();
    this.scene.environment?.dispose();
    this.worldR?.dispose();
    this.atmo.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    audio.stopAmbience();
    audio.stopWeatherBeds();
  }
}
