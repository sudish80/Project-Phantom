import { Color } from 'three';
import { gunVoice, type MechKind } from './GunVoices';
import { CYCLE, cycleKind, reloadCues, type HandlingCue } from '../weapons/WeaponAnims';
import type { Vec3, WeaponDef } from '@phantom/shared';

type Bus = 'sfx' | 'ui' | 'ambient' | 'music';

const MAX_VOICES = 56;

/**
 * Procedural spatial audio. Every sound is synthesised at runtime with WebAudio
 * (original, licence-free), routed through master / music / sfx / ambient / ui buses,
 * with HRTF panning and inverse-distance attenuation for world sounds.
 */


/** how long each action's mechanical sound lasts after the shot (s) */
const MECH_LEN: Record<MechKind, number> = {
  slide: 0.06, heavySlide: 0.08, revolver: 0.2, ar: 0.12, ak: 0.1, roller: 0.04, bullpup: 0.04, piston: 0.08,
  bolt: 0.9, pump: 0.66, semiShotgun: 0.08, autoShotgun: 0.07, belt: 0.07, antiMateriel: 0.2, energy: 0,
};

export type AnnouncerLine = 'first-blood' | 'double-kill' | 'triple-kill' | 'quadra-kill' | 'penta-kill' | 'ace' | 'headshot';
const ANNOUNCER_TEXT: Record<AnnouncerLine, string> = {
  'first-blood': 'First blood',
  'double-kill': 'Double kill',
  'triple-kill': 'Triple kill',
  'quadra-kill': 'Quadra kill',
  'penta-kill': 'Penta kill',
  ace: 'Ace',
  headshot: 'Headshot',
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private noise!: AudioBuffer;
  private active = 0;
  private ambience: { stop: () => void } | null = null;
  private music: { stop: () => void } | null = null;
  private volumes = { master: 0.8, music: 0.4, sfx: 0.9, ambient: 0.5, ui: 0.6 };
  private muted = false;
  hrtf = true;

  /** Must be called from a user gesture at least once (browser autoplay policy). */
  ensure() {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      } catch {
        return;
      }
      const ctx = this.ctx!;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      for (const b of ['sfx', 'ui', 'ambient', 'music'] as Bus[]) {
        this.buses[b] = ctx.createGain();
        this.buses[b].connect(this.master);
      }
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      for (const l of Object.keys(ANNOUNCER_TEXT) as AnnouncerLine[]) this.loadVoice(l);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolumes(v: { master: number; music: number; sfx: number; ambient: number; ui: number }, muted: boolean) {
    this.volumes = v;
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    for (const b of ['sfx', 'ui', 'ambient', 'music'] as Bus[]) this.buses[b].gain.setTargetAtTime(this.volumes[b], t, 0.05);
  }

  setListener(pos: Vec3, fwd: Vec3) {
    this.listenerPos.x = pos.x;
    this.listenerPos.y = pos.y;
    this.listenerPos.z = pos.z;
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t);
      l.forwardY.setValueAtTime(fwd.y, t);
      l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      (l as any).setPosition(pos.x, pos.y, pos.z);
      (l as any).setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  /** Allocate a voice. Returns the input gain node, or null if muted/over budget. */
  private voice(bus: Bus, pos: Vec3 | null | undefined, dur: number, priority = 1, gain = 1): GainNode | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    if (this.active >= MAX_VOICES && priority < 2) return null;
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail: AudioNode = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 2.5;
      p.maxDistance = 120;
      p.rolloffFactor = 1.15;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else (p as any).setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      tail = p;
    }
    tail.connect(this.buses[bus]);
    this.active++;
    setTimeout(() => {
      this.active--;
      try {
        tail.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    }, dur * 1000 + 200);
    return g;
  }

  private noiseSrc(t: number, dur: number) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  private burst(out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.002) {
    if (!(peak > 0.0002) || !(dur > 0)) return; // exponential ramps can't target 0 — skip inaudible layers
    const ctx = this.ctx!;
    const src = this.noiseSrc(t, dur);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
  }

  private tone(out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.004) {
    if (!(peak > 0.0002) || !(dur > 0)) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ───────────────────────────── weapons ─────────────────────────────

  /**
   * Layered gunshot built from the weapon's own voice (see GunVoices.ts): supersonic crack,
   * muzzle blast, tonal bark, calibre thump, receiver ring, brake side-blast, the action cycling,
   * early wall reflections and an outdoor tail. Every shot gets a little random variation so
   * automatic fire doesn't sound like one sample on repeat. Distant shots arrive late (speed of
   * sound), lose their high frequencies, their crack and their mechanical detail.
   */
  gunshot(w: WeaponDef, pos?: Vec3 | null, local = false) {
    if (w.category === 'melee') return this.swing(pos);
    const ctx = this.ctx;
    if (!ctx) return;
    const gv = gunVoice(w);
    const dist = pos ? Math.hypot(pos.x - this.listenerPos.x, pos.y - this.listenerPos.y, pos.z - this.listenerPos.z) : 0;
    const [tailLen, bright] = gv.tail;
    const delay = Math.min(0.6, dist / 343);
    const mechLen = MECH_LEN[gv.mech];
    const v = this.voice('sfx', pos, Math.max(tailLen, mechLen) + delay + 0.3, local ? 3 : 2, local ? 0.6 : 1);
    if (!v) return;
    const out = ctx.createBiquadFilter();
    out.type = 'lowpass';
    out.frequency.value = Math.max(700, 18000 * Math.exp(-dist / 45));
    out.connect(v);
    const t = this.now + delay;
    const near = Math.max(0, 1 - dist / 70);
    const j = 1 + (Math.random() - 0.5) * 0.07; // per-shot pitch variation
    const lv = 0.92 + Math.random() * 0.16; // per-shot level variation
    const [bHz, bDur, bGain] = gv.blast;
    // 1. supersonic crack — tiny, very bright transient (fades with distance faster than the boom)
    if (gv.crack > 0) this.burst(out, t, 0.011, 'highpass', 5200 * j, 4200, 0.6, 0.95 * gv.crack * (0.3 + near * 0.7), 0.0005);
    // 2. muzzle blast — sharp attack, lowpass sweeping down as the gas expands
    this.burst(out, t, bDur, 'lowpass', bHz * j, 340, 0.7, bGain * lv, 0.0008);
    // 3. the gun's tonal "bark"
    const [kHz, kQ, kGain] = gv.bark;
    this.burst(out, t + 0.001, 0.035 + bDur * 0.25, 'bandpass', kHz * j, kHz * 0.72 * j, kQ, kGain * lv);
    // 4. calibre weight (felt more than heard)
    const [tHz, tDur, tGain] = gv.thump;
    this.tone(out, t, 'sine', tHz * j, Math.max(30, tHz * 0.36), tDur, tGain * (0.4 + near * 0.6), 0.002);
    // 5. muzzle brake: harsh, wide side-blast
    if (gv.brake > 0) {
      this.burst(out, t + 0.002, 0.05, 'bandpass', 1150 * j, 900, 1.1, 0.75 * gv.brake);
      this.burst(out, t + 0.004, 0.025, 'highpass', 3000, 2400, 0.7, 0.35 * gv.brake, 0.001);
    }
    // 6. receiver / slide / cylinder ring
    const [freqs, rDecay, rGain] = gv.ring;
    const ringLvl = rGain * (local ? 1 : near);
    freqs.forEach((f, i) => this.tone(out, t + 0.004, 'sine', f * j, f * j * 0.997, rDecay * (1 - i * 0.15), ringLvl / (1 + i * 0.6), 0.001));
    // 7. the action cycling
    const mechLvl = local ? 1 : near * 0.8;
    const cyc = cycleKind(w);
    if (cyc) {
      // bolt / pump worked by hand: the local viewmodel fires these cues in sync with its
      // animation; for other players schedule the same timeline at their position
      if (!local && near > 0.02) for (const c of CYCLE[cyc].cues) this.handling(c.cue, w, pos ?? null, delay + c.at * CYCLE[cyc].dur);
    } else if (mechLvl > 0.02) this.mech(out, t, gv.mech, mechLvl, j);
    // 8. early reflections off nearby walls, then a long diffuse outdoor tail
    const refl = bGain * 0.22;
    this.burst(out, t + 0.085, 0.08, 'lowpass', 2600 * bright * j, 500, 0.7, refl + 0.06 + gv.brake * 0.08, 0.004);
    this.burst(out, t + 0.21, 0.12, 'lowpass', 1600 * bright * j, 300, 0.7, refl * 0.55 + 0.04, 0.01);
    this.burst(out, t + 0.03, tailLen, 'lowpass', 1100 * bright, 140, 0.5, 0.12 + bGain * 0.12, 0.03);
  }

  /** Mechanical sound of the weapon's action after the shot. */
  private mech(out: AudioNode, t: number, kind: MechKind, lvl: number, j: number) {
    const click = (at: number, hz: number, q: number, g: number, d = 0.012) => this.burst(out, t + at, d, 'bandpass', hz * j, hz * 0.85 * j, q, g * lvl);
    const ping = (at: number, hz: number, g: number, d = 0.04) => this.tone(out, t + at, 'triangle', hz * j, hz * 0.96 * j, d, g * lvl, 0.001);
    const slideNoise = (at: number, d: number, f0: number, f1: number, g: number) => this.burst(out, t + at, d, 'bandpass', f0, f1, 2, g * lvl, d * 0.3);
    switch (kind) {
      case 'slide': // light slide: back + forward
        click(0.014, 3600, 4, 0.22);
        click(0.03, 2900, 4, 0.18);
        ping(0.031, 4300, 0.04);
        break;
      case 'heavySlide': // big steel slide slamming home
        click(0.02, 2300, 3, 0.32, 0.018);
        click(0.045, 1700, 3, 0.3, 0.02);
        ping(0.046, 2600, 0.07, 0.06);
        break;
      case 'revolver': // hammer drop is the shot; cylinder gap hiss + the cylinder indexing
        this.burst(out, t, 0.04, 'highpass', 6500, 5500, 0.7, 0.3 * lvl, 0.001);
        click(0.16, 3000, 6, 0.1, 0.008);
        click(0.175, 4200, 6, 0.07, 0.006);
        break;
      case 'ar': // bolt carrier + the AR buffer-spring "twang"
        click(0.012, 3300, 4, 0.2);
        this.tone(out, t + 0.018, 'sine', 820 * j, 520 * j, 0.09, 0.07 * lvl, 0.002);
        this.tone(out, t + 0.018, 'sine', 1640 * j, 1050 * j, 0.06, 0.03 * lvl, 0.002);
        break;
      case 'ak': // loose heavy carrier rattling in a stamped receiver
        click(0.016, 1300, 2.5, 0.32, 0.02);
        click(0.034, 950, 2.5, 0.28, 0.022);
        click(0.05, 1750, 3, 0.14, 0.015);
        ping(0.035, 1250, 0.05, 0.07);
        break;
      case 'roller': // roller-delayed: crisp, fast double tick
        click(0.008, 4300, 6, 0.2, 0.007);
        click(0.02, 3700, 6, 0.17, 0.007);
        break;
      case 'bullpup': // action next to the cheek: very present, high, plus a tiny whine
        click(0.007, 5000, 5, 0.24, 0.007);
        click(0.016, 4300, 5, 0.18, 0.007);
        this.tone(out, t + 0.005, 'sawtooth', 2600 * j, 2300 * j, 0.03, 0.025 * lvl, 0.001);
        break;
      case 'piston': // gas piston + heavy bolt clunk
        click(0.02, 1900, 3, 0.26, 0.018);
        click(0.04, 2500, 3.5, 0.2, 0.014);
        ping(0.042, 2100, 0.05, 0.05);
        break;
      case 'bolt': // bolt-action, worked by hand: lift, back, forward, down
        click(0.42, 2100, 3, 0.3, 0.02);
        slideNoise(0.46, 0.09, 1600, 2600, 0.12);
        click(0.56, 2800, 3.5, 0.32, 0.02);
        slideNoise(0.66, 0.08, 2600, 1500, 0.1);
        click(0.76, 1900, 3, 0.34, 0.025);
        click(0.84, 3300, 4, 0.24, 0.015);
        break;
      case 'pump': // shuck-shuck
        slideNoise(0.34, 0.1, 900, 1800, 0.22);
        click(0.45, 1400, 2.5, 0.38, 0.025);
        slideNoise(0.5, 0.09, 1800, 900, 0.2);
        click(0.6, 1100, 2.5, 0.42, 0.03);
        break;
      case 'semiShotgun':
        click(0.022, 1500, 2.5, 0.34, 0.022);
        click(0.045, 2200, 3, 0.22, 0.016);
        break;
      case 'autoShotgun': // open bolt slamming forward
        click(0.018, 900, 2, 0.36, 0.025);
        click(0.04, 1300, 2.5, 0.22, 0.02);
        break;
      case 'belt': // bolt + feed tray + rattling links
        click(0.012, 2600, 3.5, 0.22, 0.012);
        for (let i = 0; i < 3; i++) click(0.025 + i * 0.011 + Math.random() * 0.006, 4200 + Math.random() * 1600, 7, 0.08, 0.005);
        break;
      case 'antiMateriel': // recoiling barrel + bolt
        click(0.045, 700, 1.6, 0.42, 0.04);
        click(0.09, 1300, 2.5, 0.3, 0.03);
        ping(0.092, 1500, 0.06, 0.09);
        break;
      case 'energy':
        break;
    }
  }

  private listenerPos = { x: 0, y: 0, z: 0 };

  swing(pos?: Vec3 | null) {
    const v = this.voice('sfx', pos, 0.3, 1, 0.6);
    if (!v) return;
    this.burst(v, this.now, 0.22, 'bandpass', 3000, 500, 1.5, 0.6, 0.03);
  }

  /**
   * Another player's reload, heard in 3D: the same cue timeline the first-person animation uses
   * (empty-only cues like the bolt release are skipped — we don't know their magazine state).
   */
  reload(w: WeaponDef, pos?: Vec3 | null) {
    if (!this.ctx) return;
    for (const c of reloadCues(w)) if (!c.emptyOnly) this.handling(c.cue, w, pos ?? null, c.at * w.reloadTime);
  }

  /**
   * One weapon-handling sound (magazine, bolt, pump, cylinder, holster...). Sizes scale with the
   * weapon: a .50 cal's bolt is lower and heavier than a 9 mm's slide.
   */
  handling(cue: HandlingCue, w: WeaponDef, pos: Vec3 | null, at = 0) {
    const local = !pos;
    const v = this.voice('sfx', pos, at + 0.6, local ? 2 : 1, local ? 0.55 : 0.9);
    if (!v) return;
    const t = this.now + at;
    const size = Math.min(1.6, Math.max(0.7, w.look.bulk / 0.07));
    const f = 1 / Math.sqrt(size); // bigger parts ring lower
    const j = 1 + (Math.random() - 0.5) * 0.08;
    const click = (dt: number, hz: number, q: number, g: number, d = 0.012) => this.burst(v, t + dt, d, 'bandpass', hz * f * j, hz * 0.85 * f * j, q, g);
    const ping = (dt: number, hz: number, g: number, d = 0.05) => this.tone(v, t + dt, 'triangle', hz * f * j, hz * 0.97 * f * j, d, g, 0.001);
    const slideN = (dt: number, d: number, f0: number, f1: number, g: number) => this.burst(v, t + dt, d, 'bandpass', f0 * f, f1 * f, 2, g, d * 0.3);
    const rustle = (dt: number, d: number, g: number) => this.burst(v, t + dt, d, 'bandpass', 700 + Math.random() * 300, 2200, 0.8, g, d * 0.35);
    const thud = (dt: number, hz: number, g: number) => this.tone(v, t + dt, 'sine', hz * f, hz * 0.5 * f, 0.07, g, 0.002);
    switch (cue) {
      case 'magRelease':
        click(0, 3500, 6, 0.3, 0.008);
        ping(0.002, 2700, 0.04, 0.03);
        break;
      case 'magOut':
        slideN(0, 0.1, 1800, 1100, 0.22);
        click(0.08, 1300, 3, 0.18, 0.015);
        break;
      case 'pouch':
        rustle(0, 0.2, 0.16);
        this.burst(v, t + 0.12, 0.05, 'highpass', 2500, 2000, 0.8, 0.06, 0.01); // velcro / pouch flap
        break;
      case 'magIn':
        slideN(0, 0.07, 1300, 2200, 0.24);
        break;
      case 'magSeat':
        click(0, 1600, 3, 0.55, 0.02);
        click(0.004, 3200, 4, 0.3, 0.014);
        ping(0.006, 950, 0.1, 0.06);
        thud(0, 190, 0.25);
        break;
      case 'boltRelease':
        click(0, 2400, 4, 0.4, 0.012);
        click(0.045, 1300, 2.5, 0.55, 0.03);
        ping(0.047, 2100, 0.08, 0.07);
        thud(0.045, 160, 0.2);
        break;
      case 'slideRelease':
        click(0, 2800, 4, 0.5, 0.015);
        click(0.01, 1900, 3, 0.35, 0.02);
        ping(0.012, 2600, 0.05, 0.05);
        break;
      case 'coverOpen':
        click(0, 2000, 4, 0.3, 0.012);
        this.tone(v, t + 0.01, 'sine', 900 * f, 1300 * f, 0.12, 0.04, 0.005); // spring
        break;
      case 'beltLay':
        for (let i = 0; i < 6; i++) click(i * 0.022 + Math.random() * 0.01, 4200 + Math.random() * 2400, 7, 0.09, 0.005);
        break;
      case 'coverClose':
        click(0, 900, 2, 0.6, 0.04);
        click(0.006, 2200, 3, 0.3, 0.02);
        thud(0, 140, 0.3);
        break;
      case 'cylOpen':
        click(0, 3200, 6, 0.3, 0.008);
        slideN(0.03, 0.08, 1500, 2600, 0.1);
        break;
      case 'eject':
        click(0, 2200, 4, 0.25, 0.012); // ejector rod
        for (let i = 0; i < 6; i++) {
          const dt = 0.14 + i * 0.05 + Math.random() * 0.04; // brass hitting the floor
          const hz = 3800 + Math.random() * 1600;
          this.tone(v, t + dt, 'triangle', hz, hz * 0.98, 0.12, 0.05, 0.001);
          this.tone(v, t + dt, 'sine', hz * 1.52, hz * 1.5, 0.08, 0.025, 0.001);
        }
        break;
      case 'speedload':
        slideN(0, 0.06, 1500, 2400, 0.18);
        click(0.05, 2600, 4, 0.35, 0.012);
        break;
      case 'cylClose':
        click(0, 2200, 3, 0.55, 0.02);
        ping(0.004, 1800, 0.08, 0.08);
        click(0.09, 3600, 6, 0.12, 0.006); // cylinder indexing
        break;
      case 'shellIn':
        slideN(0, 0.05, 1200, 2000, 0.2);
        click(0.045, 2600, 4, 0.32, 0.01);
        thud(0.045, 220, 0.1);
        break;
      case 'pumpBack':
        slideN(0, 0.08, 900, 1800, 0.3);
        click(0.07, 1400, 2.5, 0.5, 0.025);
        break;
      case 'pumpFwd':
        slideN(0, 0.07, 1800, 900, 0.28);
        click(0.06, 1100, 2.5, 0.6, 0.03);
        thud(0.06, 150, 0.2);
        break;
      case 'boltUp':
        click(0, 2100, 3, 0.35, 0.02);
        break;
      case 'boltBack':
        slideN(0, 0.09, 1600, 2600, 0.15);
        click(0.08, 2800, 3.5, 0.38, 0.02);
        break;
      case 'boltFwd':
        slideN(0, 0.08, 2600, 1500, 0.12);
        click(0.07, 1900, 3, 0.42, 0.025);
        break;
      case 'boltDown':
        click(0, 3300, 4, 0.3, 0.015);
        break;
      case 'draw':
        if (w.category === 'sidearm') {
          this.burst(v, t, 0.1, 'bandpass', 900, 1500, 1.2, 0.18, 0.02); // holster
          click(0.08, 2400, 4, 0.18, 0.01);
        } else {
          rustle(0, 0.22, 0.18); // sling / cloth
          click(0.12, 1700, 3, 0.16, 0.02);
        }
        break;
      case 'ready':
        this.burst(v, t, 0.04, 'lowpass', 600, 300, 0.7, 0.3, 0.004); // hand slaps the grip
        click(0.01, 2000, 3, 0.2, 0.01);
        break;
      case 'cloth':
        rustle(0, 0.18, 0.12);
        break;
      case 'tap':
        this.burst(v, t, 0.03, 'lowpass', 700, 300, 0.7, 0.3, 0.003);
        click(0.004, 2200, 4, 0.12, 0.008);
        break;
      case 'magTap':
        click(0, 1500, 3, 0.4, 0.02);
        thud(0, 200, 0.12);
        break;
    }
  }

  dryFire() {
    const v = this.voice('sfx', null, 0.1, 2, 0.5);
    if (v) this.burst(v, this.now, 0.03, 'highpass', 4000, 3000, 2, 0.6);
  }

  // ───────────────────────────── movement ─────────────────────────────

  footstep(pos: Vec3 | null, metal: boolean, loud = 1) {
    const v = this.voice('sfx', pos, 0.2, pos ? 0 : 1, (pos ? 0.85 : 0.35) * loud);
    if (!v) return;
    const t = this.now;
    const p = 0.85 + Math.random() * 0.3;
    this.burst(v, t, 0.08, 'lowpass', 900 * p, 200, 0.7, 0.9);
    this.burst(v, t, 0.03, 'highpass', 3500 * p, 3000, 0.7, 0.25);
    if (metal) this.tone(v, t, 'triangle', 420 * p, 380 * p, 0.12, 0.12);
  }

  jump(pos: Vec3 | null) {
    const v = this.voice('sfx', pos, 0.2, 0, pos ? 0.6 : 0.3);
    if (v) this.burst(v, this.now, 0.15, 'bandpass', 600, 1200, 1, 0.5, 0.02);
  }

  land(pos: Vec3 | null, speed: number) {
    const v = this.voice('sfx', pos, 0.3, 1, Math.min(1, speed / 10) * (pos ? 1 : 0.6));
    if (!v) return;
    this.burst(v, this.now, 0.16, 'lowpass', 500, 80, 0.8, 1);
    this.tone(v, this.now, 'sine', 90, 40, 0.16, 0.6);
  }

  // ───────────────────────────── combat feedback ─────────────────────────────

  hit(head: boolean, kill: boolean) {
    const v = this.voice('ui', null, 0.4, 3, 0.7);
    if (!v) return;
    const t = this.now;
    if (kill) {
      this.tone(v, t, 'triangle', 660, 640, 0.3, 0.5);
      this.tone(v, t + 0.05, 'sine', 990, 980, 0.3, 0.35);
    } else if (head) {
      this.tone(v, t, 'sine', 2400, 2350, 0.25, 0.45);
      this.tone(v, t, 'triangle', 3600, 3500, 0.15, 0.15);
    } else this.burst(v, t, 0.04, 'bandpass', 3200, 2800, 2, 0.5);
  }

  /**
   * Kill confirm that escalates with the streak (1 → 5+). A tight transient, a struck bell whose
   * pitch and partials rise with each kill, a quick arpeggio of `streak` notes and a sub thump.
   * The 5th kill is an "ace" chord swell. Energy skins replace the bell with a synth voice tuned
   * to their colour palette; headshots add a bright ping.
   */
  killConfirm(streak: number, head: boolean, energy: number[] | null) {
    const n = Math.max(1, Math.min(5, streak));
    const v = this.voice('ui', null, 2.6, 3, 0.85);
    if (!v) return;
    const t = this.now;
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const base = 440 * Math.pow(2, (scale[n - 1] + 2) / 12);
    // transient "snap"
    this.burst(v, t, 0.03, 'highpass', 6000, 4000, 0.8, 0.6, 0.0005);
    this.tone(v, t, 'sine', 140, 50, 0.22, 0.55, 0.002);
    if (energy && energy.length) {
      // synth voice: detuned saws through a closing filter, pitch drawn from the skin's hues
      const ctx = this.ctx!;
      const hsl = new Color(energy[(n - 1) % energy.length]).getHSL({ h: 0, s: 0, l: 0 });
      const f = base * (0.85 + hsl.h * 0.3);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(7000, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.6);
      lp.connect(v);
      for (const det of [-9, 0, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 2, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + 0.75);
      }
      this.tone(v, t, 'sine', f * 4, f * 4, 0.35, 0.12);
    } else {
      // struck metal bell: fundamental + inharmonic partials (more partials as the streak grows)
      const partials = [1, 2.76, 5.4, 8.93, 13.3].slice(0, 2 + Math.min(3, n));
      partials.forEach((p, i) => this.tone(v, t, i === 0 ? 'triangle' : 'sine', base * p, base * p * 0.995, 0.9 - i * 0.12, 0.32 / (i + 1), 0.002));
    }
    // arpeggio flourish: one note per kill in the streak
    for (let i = 0; i < n; i++) this.tone(v, t + 0.07 + i * 0.055, 'triangle', base * Math.pow(2, scale[i] / 12) * 2, base * Math.pow(2, scale[i] / 12) * 2, 0.22, 0.09);
    if (head) {
      this.tone(v, t + 0.01, 'sine', 3800, 3700, 0.25, 0.18);
      this.burst(v, t + 0.01, 0.05, 'bandpass', 5200, 4800, 6, 0.25);
    }
    if (n >= 5) {
      // ace: rising swell into a wide major chord
      this.burst(v, t + 0.1, 0.9, 'bandpass', 400, 3200, 0.8, 0.22, 0.6);
      [1, 1.25, 1.5, 2, 2.5].forEach((m, i) => this.tone(v, t + 0.55 + i * 0.02, 'sawtooth', base * m, base * m * 1.003, 1.6, 0.05, 0.04));
      this.tone(v, t + 0.55, 'sine', base / 2, base / 2, 1.6, 0.25, 0.05);
    }
  }

  /**
   * Announcer callout ("Double kill!", ...). Plays pre-rendered voice clips from /voice/
   * (generated by tools/gen-announcer.py — browser speech synthesis is unavailable in many
   * browsers, e.g. Brave/Chromium on Linux report no voices). Falls back to speech synthesis
   * only if a clip failed to load.
   */
  announce(line: AnnouncerLine) {
    this.ensure();
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const buf = this.voiceClips.get(line);
    if (!buf) {
      this.loadVoice(line);
      this.speakFallback(ANNOUNCER_TEXT[line]);
      return;
    }
    this.announcerSrc?.stop();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1.15;
    src.connect(g).connect(this.buses.ui);
    src.start();
    this.announcerSrc = src;
    src.onended = () => {
      if (this.announcerSrc === src) this.announcerSrc = null;
    };
  }

  private voiceClips = new Map<AnnouncerLine, AudioBuffer>();
  private voiceLoading = new Set<AnnouncerLine>();
  private announcerSrc: AudioBufferSourceNode | null = null;

  private loadVoice(line: AnnouncerLine) {
    const ctx = this.ctx;
    if (!ctx || this.voiceClips.has(line) || this.voiceLoading.has(line)) return;
    this.voiceLoading.add(line);
    fetch(new URL(`voice/${line}.mp3`, document.baseURI).href)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((b) => void this.voiceClips.set(line, b))
      .catch(() => {})
      .finally(() => this.voiceLoading.delete(line));
  }

  private speakFallback(text: string) {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !synth.getVoices().length) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 0.7;
      u.volume = Math.min(1, this.volumes.master * this.volumes.ui * 1.6);
      synth.speak(u);
    } catch {
      // no speech available — the banner still shows the callout
    }
  }

  hurt(amount: number) {
    const v = this.voice('ui', null, 0.3, 3, Math.min(1, 0.3 + amount / 80));
    if (!v) return;
    this.tone(v, this.now, 'sine', 110, 50, 0.22, 0.8);
    this.burst(v, this.now, 0.1, 'lowpass', 700, 200, 0.8, 0.4);
  }

  impact(pos: Vec3, metal: boolean) {
    const v = this.voice('sfx', pos, 0.15, 0, 0.35);
    if (!v) return;
    if (metal) this.tone(v, this.now, 'triangle', 1800 + Math.random() * 900, 1500, 0.1, 0.25);
    this.burst(v, this.now, 0.05, 'bandpass', 2000, 900, 1, 0.4);
  }

  // ───────────────────────────── abilities & objective ─────────────────────────────

  ability(id: string, pos: Vec3 | null) {
    const v = this.voice('sfx', pos, 1.6, 2, pos ? 1 : 0.6);
    if (!v) return;
    const t = this.now;
    switch (id) {
      case 'surge':
        this.burst(v, t, 0.35, 'bandpass', 400, 3000, 1.2, 0.9, 0.02);
        break;
      case 'veil':
        this.tone(v, t, 'square', 300, 900, 0.12, 0.15);
        this.burst(v, t + 0.1, 1.4, 'lowpass', 3000, 600, 0.5, 0.5, 0.2);
        break;
      case 'overdrive':
      case 'renewal':
      case 'overwatch':
      case 'sentry':
        [0, 0.08, 0.16, 0.24].forEach((d, i) => this.tone(v, t + d, 'sawtooth', [220, 277, 330, 440][i] * (id === 'renewal' ? 1.5 : 1), [220, 277, 330, 440][i] * 1.01, 1.2 - d, 0.12, 0.05));
        this.tone(v, t, 'sine', 55, 45, 1.2, 0.6, 0.1);
        break;
      case 'seeker':
      case 'echo':
        this.tone(v, t, 'sine', 1400, 1400, 0.12, 0.4);
        this.tone(v, t + 0.15, 'sine', 1900, 1900, 0.12, 0.3);
        break;
      case 'decoy':
        this.tone(v, t, 'triangle', 600, 1600, 0.5, 0.3, 0.05);
        break;
      case 'barrier':
        this.tone(v, t, 'sawtooth', 80, 220, 0.8, 0.4, 0.1);
        this.burst(v, t, 0.8, 'lowpass', 300, 1200, 1, 0.4, 0.1);
        break;
      case 'caltrops':
        for (let i = 0; i < 6; i++) this.tone(v, t + i * 0.04, 'triangle', 2000 + Math.random() * 2000, 1800, 0.1, 0.12);
        break;
      default:
        this.tone(v, t, 'sine', 700, 1400, 0.4, 0.3, 0.05);
        this.tone(v, t + 0.1, 'sine', 1050, 2100, 0.4, 0.2, 0.05);
    }
  }

  abilityEnd(pos: Vec3 | null) {
    const v = this.voice('sfx', pos, 0.5, 1, 0.5);
    if (v) this.tone(v, this.now, 'sine', 900, 300, 0.35, 0.25);
  }

  pulse(pos: Vec3) {
    const v = this.voice('sfx', pos, 0.6, 1, 0.8);
    if (!v) return;
    this.tone(v, this.now, 'sine', 1200, 1180, 0.5, 0.35);
    this.tone(v, this.now, 'sine', 1800, 1790, 0.35, 0.15);
  }

  beep(pos: Vec3 | null, urgent: boolean) {
    const v = this.voice('sfx', pos, 0.2, 2, 0.6);
    if (v) this.tone(v, this.now, 'square', urgent ? 2400 : 2000, urgent ? 2400 : 2000, 0.08, 0.15);
  }

  plantTick() {
    const v = this.voice('sfx', null, 0.15, 2, 0.35);
    if (v) this.tone(v, this.now, 'triangle', 900, 900, 0.06, 0.3);
  }

  defuseTick() {
    const v = this.voice('sfx', null, 0.15, 2, 0.35);
    if (v) this.burst(v, this.now, 0.05, 'bandpass', 3000, 2500, 4, 0.4);
  }

  planted() {
    const v = this.voice('ui', null, 1.2, 3, 0.7);
    if (!v) return;
    [0, 0.25, 0.5].forEach((d) => {
      this.tone(v, this.now + d, 'square', 880, 880, 0.18, 0.12);
      this.tone(v, this.now + d + 0.12, 'square', 660, 660, 0.12, 0.1);
    });
  }

  defused() {
    const v = this.voice('ui', null, 1.2, 3, 0.7);
    if (!v) return;
    [1320, 990, 660].forEach((f, i) => this.tone(v, this.now + i * 0.14, 'triangle', f, f, 0.5, 0.25));
  }

  detonate(pos: Vec3) {
    const v = this.voice('sfx', pos, 3, 3, 1.4);
    if (!v) return;
    this.tone(v, this.now, 'sine', 120, 25, 2.5, 1, 0.01);
    this.burst(v, this.now, 2.5, 'lowpass', 2500, 60, 0.5, 1, 0.01);
    this.tone(v, this.now, 'sawtooth', 900, 60, 1.2, 0.2);
  }

  // ───────────────────────────── round / UI stingers ─────────────────────────────

  stinger(kind: 'roundStart' | 'buy' | 'win' | 'lose' | 'victory' | 'defeat' | 'switch') {
    const v = this.voice('ui', null, 2.5, 3, 0.6);
    if (!v) return;
    const t = this.now;
    const chord = (notes: number[], at: number, dur: number, type: OscillatorType = 'sawtooth', peak = 0.08) =>
      notes.forEach((f) => this.tone(v, t + at, type, f, f * 1.002, dur, peak, 0.03));
    switch (kind) {
      case 'roundStart':
        this.tone(v, t, 'sawtooth', 110, 440, 0.6, 0.15, 0.05);
        chord([440, 660], 0.55, 0.8, 'triangle', 0.15);
        break;
      case 'buy':
        chord([330, 495], 0, 0.6, 'triangle', 0.1);
        break;
      case 'win':
        chord([392, 494, 587], 0, 1.4);
        chord([523, 659, 784], 0.25, 1.6);
        break;
      case 'lose':
        chord([311, 370, 466], 0, 1.6);
        chord([233, 277, 349], 0.3, 1.8);
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(v, t + i * 0.15, 'triangle', f, f, 1.6 - i * 0.15, 0.2));
        chord([262, 392, 523], 0.6, 2, 'sawtooth', 0.07);
        break;
      case 'defeat':
        chord([220, 262, 330], 0, 2.2, 'sawtooth', 0.08);
        this.tone(v, t, 'sine', 55, 40, 2.2, 0.5, 0.2);
        break;
      case 'switch':
        chord([392, 523], 0, 0.8, 'triangle', 0.12);
        chord([440, 587], 0.3, 0.8, 'triangle', 0.12);
        break;
    }
  }

  ui(kind: 'hover' | 'click' | 'back' | 'error') {
    const v = this.voice('ui', null, 0.2, 2, 0.5);
    if (!v) return;
    const t = this.now;
    if (kind === 'hover') this.tone(v, t, 'sine', 1800, 1800, 0.03, 0.08);
    else if (kind === 'click') {
      this.tone(v, t, 'triangle', 900, 1400, 0.06, 0.25);
    } else if (kind === 'back') this.tone(v, t, 'triangle', 900, 500, 0.08, 0.2);
    else this.tone(v, t, 'square', 200, 160, 0.15, 0.15);
  }


  // ───────────────────────────── weather / world / new features ─────────────────────────────

  /** Knee slide: a short gritty scrape that fades as the slide bleeds speed. */
  slide(pos: Vec3 | null) {
    const v = this.voice('sfx', pos, 1.1, 2, pos ? 0.9 : 0.45);
    if (!v) return;
    const t = this.now;
    this.burst(v, t, 0.9, 'bandpass', 900, 380, 0.9, 0.55, 0.02);
    this.burst(v, t, 0.6, 'highpass', 3200, 2200, 0.7, 0.18, 0.01);
    this.tone(v, t, 'sine', 90, 55, 0.25, 0.25, 0.01);
  }

  thunder(distance = 1) {
    const v = this.voice('ambient', null, 4, 3, Math.max(0.3, 1.1 - distance * 0.25));
    if (!v) return;
    const t = this.now;
    this.burst(v, t, 0.25, 'lowpass', 2400, 300, 0.6, 0.9, 0.005);
    this.burst(v, t + 0.05, 3.2, 'lowpass', 400, 40, 0.7, 1, 0.08);
    this.tone(v, t, 'sine', 70, 30, 3, 0.5, 0.1);
  }

  pickup() {
    const v = this.voice('ui', null, 0.4, 3, 0.6);
    if (!v) return;
    this.tone(v, this.now, 'triangle', 660, 990, 0.12, 0.3);
    this.tone(v, this.now + 0.08, 'triangle', 990, 1320, 0.15, 0.25);
  }

  zoneWarning() {
    const v = this.voice('ui', null, 1.6, 3, 0.6);
    if (!v) return;
    [0, 0.4, 0.8].forEach((d) => this.tone(v, this.now + d, 'sawtooth', 220, 180, 0.3, 0.12, 0.02));
  }

  zoneDamage() {
    const v = this.voice('ui', null, 0.5, 2, 0.5);
    if (!v) return;
    this.burst(v, this.now, 0.35, 'bandpass', 1800, 600, 2, 0.5, 0.02);
    this.tone(v, this.now, 'square', 120, 90, 0.3, 0.08);
  }

  /** Short shimmer for energy-skin weapons (layered on top of the gunshot). */
  energyShot(colorHz = 1) {
    const v = this.voice('sfx', null, 0.4, 2, 0.35);
    if (!v) return;
    this.tone(v, this.now, 'sine', 1800 * colorHz, 600 * colorHz, 0.22, 0.25, 0.002);
    this.tone(v, this.now, 'triangle', 3600 * colorHz, 1400, 0.12, 0.08, 0.002);
  }

  private weatherLoop: { rain: GainNode; wind: GainNode; water: GainNode; hum: GainNode; stop: () => void } | null = null;

  /** Continuous weather / environment beds: rain, wind, nearby water and the energy-skin hum. */
  setWeatherBeds(rain: number, wind: number, water: number, energyHum: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.weatherLoop) {
      const mk = (type: BiquadFilterType, f: number, q: number) => {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const flt = ctx.createBiquadFilter();
        flt.type = type;
        flt.frequency.value = f;
        flt.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(flt).connect(g).connect(this.buses.ambient);
        src.start();
        return { src, g };
      };
      const rainN = mk('highpass', 1800, 0.5);
      const windN = mk('lowpass', 420, 0.8);
      const waterN = mk('bandpass', 700, 0.9);
      const hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 58;
      const humF = ctx.createBiquadFilter();
      humF.type = 'lowpass';
      humF.frequency.value = 260;
      const humG = ctx.createGain();
      humG.gain.value = 0;
      hum.connect(humF).connect(humG).connect(this.buses.sfx);
      hum.start();
      this.weatherLoop = {
        rain: rainN.g, wind: windN.g, water: waterN.g, hum: humG,
        stop: () => {
          for (const n of [rainN.src, windN.src, waterN.src, hum]) {
            try {
              n.stop();
            } catch {
              /* ignore */
            }
          }
        },
      };
    }
    const t = ctx.currentTime;
    const L = this.weatherLoop;
    L.rain.gain.setTargetAtTime(rain * 0.32, t, 0.6);
    L.wind.gain.setTargetAtTime(0.03 + wind * 0.18, t, 0.8);
    L.water.gain.setTargetAtTime(water * 0.16, t, 0.5);
    L.hum.gain.setTargetAtTime(energyHum * 0.035, t, 0.15);
  }

  stopWeatherBeds() {
    this.weatherLoop?.stop();
    this.weatherLoop = null;
  }

  // ───────────────────────────── loops ─────────────────────────────

  startAmbience(kind: 'iron' | 'harbor' | 'frontier' | 'range') {
    this.stopAmbience();
    const ctx = this.ctx;
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    out.connect(this.buses.ambient);
    const nodes: AudioScheduledSourceNode[] = [];
    // wind / room tone
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'harbor' ? 500 : 350;
    const ng = ctx.createGain();
    ng.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = kind === 'harbor' ? 0.17 : 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.1;
    lfo.connect(lfoG).connect(ng.gain);
    n.connect(lp).connect(ng).connect(out);
    n.start();
    lfo.start();
    nodes.push(n, lfo);
    // machinery hum / harbour drone
    for (const f of kind === 'iron' ? [55, 110.5, 166] : kind === 'harbor' ? [41, 82.3] : [60, 120]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = kind === 'range' ? 0.015 : 0.035;
      o.connect(g).connect(out);
      o.start();
      nodes.push(o);
    }
    // occasional distant events
    const timer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const v = this.voice('ambient', null, 3, 0, 0.25);
      if (!v) return;
      const t = this.now;
      if (kind === 'frontier') {
        // birdsong (daytime feel) — a few quick chirps
        const base = 2200 + Math.random() * 1600;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) this.tone(v, t + i * 0.13, 'sine', base, base * (1.2 + Math.random() * 0.3), 0.09, 0.12);
        if (Math.random() < 0.3) for (let i = 0; i < 8; i++) this.tone(v, t + 1 + i * 0.07, 'triangle', 4200, 4300, 0.04, 0.03);
      } else if (kind === 'iron') {
        this.tone(v, t, 'triangle', 180 + Math.random() * 120, 150, 1.6, 0.15);
        this.burst(v, t, 0.3, 'bandpass', 800, 300, 2, 0.3);
      } else if (kind === 'harbor') {
        if (Math.random() < 0.3) this.tone(v, t, 'sawtooth', 98, 96, 2.5, 0.06, 0.4);
        else this.burst(v, t, 1.2, 'bandpass', 300, 600, 1.5, 0.4, 0.4);
      }
    }, 5200);
    this.ambience = {
      stop: () => {
        clearInterval(timer);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        setTimeout(() => {
          nodes.forEach((x) => {
            try {
              x.stop();
            } catch {
              /* ignore */
            }
          });
          out.disconnect();
        }, 1200);
      },
    };
  }

  stopAmbience() {
    this.ambience?.stop();
    this.ambience = null;
  }

  /** Generative menu music: slow pads + plucked arpeggio, scheduled with a lookahead timer. */
  startMusic() {
    const ctx = this.ctx;
    if (!ctx || this.music) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.9, ctx.currentTime, 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    out.connect(lp).connect(this.buses.music);
    const chords = [
      [146.8, 220, 293.7, 349.2],
      [116.5, 174.6, 233.1, 293.7],
      [130.8, 196, 261.6, 329.6],
      [110, 164.8, 220, 277.2],
    ];
    let step = 0;
    let next = ctx.currentTime + 0.1;
    const bar = 4.8;
    const schedule = () => {
      while (next < ctx.currentTime + 1.5) {
        const c = chords[step % chords.length];
        for (const f of c) {
          for (const det of [-4, 4]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.detune.value = det;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, next);
            g.gain.exponentialRampToValueAtTime(0.022, next + 1.4);
            g.gain.exponentialRampToValueAtTime(0.0001, next + bar + 0.6);
            o.connect(g).connect(out);
            o.start(next);
            o.stop(next + bar + 0.7);
          }
        }
        for (let i = 0; i < 8; i++) {
          if (Math.random() < 0.35) continue;
          const f = c[(i * 3 + step) % c.length] * 2;
          const t = next + i * (bar / 8);
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
          o.connect(g).connect(out);
          o.start(t);
          o.stop(t + 1);
        }
        const sub = ctx.createOscillator();
        sub.frequency.value = c[0] / 2;
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.0001, next);
        sg.gain.exponentialRampToValueAtTime(0.06, next + 0.8);
        sg.gain.exponentialRampToValueAtTime(0.0001, next + bar);
        sub.connect(sg).connect(out);
        sub.start(next);
        sub.stop(next + bar + 0.1);
        next += bar;
        step++;
      }
    };
    schedule();
    const timer = setInterval(schedule, 500);
    this.music = {
      stop: () => {
        clearInterval(timer);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        setTimeout(() => out.disconnect(), 2500);
      },
    };
  }

  stopMusic() {
    this.music?.stop();
    this.music = null;
  }
}

export const audio = new AudioEngine();
