import type { WeaponDef, WeaponId } from '@phantom/shared';

/**
 * Per-weapon gunshot "voice". Each gun is synthesised from the same layers, but with its own
 * tuning, which is what makes real guns recognisable by ear:
 *  - bark:   the tonal band of the report (AK chesty ~900 Hz, AR snappy ~1.7 kHz, MP5 pop, P90 zip)
 *  - thump:  low-frequency weight of the calibre
 *  - crack:  supersonic bullet crack (rifle / sniper / MG rounds; not subsonic 9 mm or .45)
 *  - ring:   metallic resonance of the receiver / slide / cylinder
 *  - mech:   the action cycling (slide, AR buffer spring, AK carrier, roller-delayed bolt, pump…)
 *  - brake:  muzzle brake side-blast (harsher, wider report)
 */
export type MechKind =
  | 'slide'
  | 'heavySlide'
  | 'revolver'
  | 'ar'
  | 'ak'
  | 'roller'
  | 'bullpup'
  | 'piston'
  | 'bolt'
  | 'pump'
  | 'semiShotgun'
  | 'autoShotgun'
  | 'belt'
  | 'antiMateriel'
  | 'energy';

export interface GunVoice {
  /** muzzle blast: lowpass start frequency (Hz), length (s), level */
  blast: [hz: number, dur: number, gain: number];
  /** tonal report band: centre Hz, Q, level */
  bark: [hz: number, q: number, gain: number];
  /** low body: start Hz, length (s), level */
  thump: [hz: number, dur: number, gain: number];
  /** supersonic crack level (0 = subsonic) */
  crack: number;
  /** receiver ring partials (Hz) + decay (s) + level */
  ring: [freqs: number[], decay: number, gain: number];
  mech: MechKind;
  /** muzzle brake / compensator side blast 0..1 */
  brake: number;
  /** reverb tail length (s) and brightness multiplier */
  tail: [len: number, bright: number];
}

const V: Record<Exclude<WeaponId, 'edge'>, GunVoice> = {
  // ── sidearms ──
  // compact striker pistol: crisp, light, bright snap with a small ping
  wisp: { blast: [9500, 0.05, 0.75], bark: [3000, 3.2, 0.85], thump: [170, 0.1, 0.4], crack: 0, ring: [[3600, 5400, 7200], 0.12, 0.16], mech: 'slide', brake: 0, tail: [0.5, 1.25] },
  // 9 mm duty pistol: sharp "pak", polymer frame so little ring
  glock: { blast: [7400, 0.075, 1.05], bark: [1900, 1.6, 0.95], thump: [130, 0.14, 0.75], crack: 0, ring: [[2900], 0.04, 0.03], mech: 'slide', brake: 0, tail: [0.65, 0.95] },
  // .50 AE magnum: deep boom, heavy slide clack, long rolling tail
  deagle: { blast: [5200, 0.13, 1.6], bark: [780, 1.2, 0.7], thump: [85, 0.26, 1.15], crack: 0.35, ring: [[1750, 2650], 0.1, 0.07], mech: 'heavySlide', brake: 0, tail: [1.25, 0.8] },
  // big-bore revolver: round "boom" with the cylinder gap hiss and a steel ring
  magistrate: { blast: [5600, 0.12, 1.5], bark: [950, 1.4, 0.6], thump: [92, 0.24, 1.0], crack: 0, ring: [[2550, 3900, 5900], 0.16, 0.09], mech: 'revolver', brake: 0, tail: [1.1, 0.85] },

  // ── SMGs ──
  // roller-delayed 9 mm: clean, tight "pop" with a crisp double tick from the bolt
  mp5: { blast: [5600, 0.07, 1.0], bark: [1350, 2.0, 0.85], thump: [110, 0.13, 0.8], crack: 0, ring: [[3300, 4800], 0.05, 0.04], mech: 'roller', brake: 0, tail: [0.6, 0.8] },
  // 5.7 mm bullpup PDW: small, high-pitched supersonic "zip", buzzy
  p90: { blast: [12000, 0.045, 0.7], bark: [3900, 3.5, 1.0], thump: [190, 0.08, 0.3], crack: 0.9, ring: [[4400, 6100], 0.05, 0.1], mech: 'bullpup', brake: 0, tail: [0.45, 1.4] },
  // fictional rapid SMG: buzzy, mid-high with a short sine whine
  hornet: { blast: [8000, 0.05, 0.8], bark: [2400, 5, 0.8], thump: [150, 0.09, 0.45], crack: 0, ring: [[1650, 2475, 3300], 0.11, 0.2], mech: 'bullpup', brake: 0, tail: [0.5, 1.05] },

  // ── rifles ──
  // 7.62x39: loud chesty bark, loose rattling steel carrier, long rough tail
  ak47: { blast: [6200, 0.1, 1.45], bark: [900, 1.3, 0.75], thump: [95, 0.2, 0.95], crack: 0.7, ring: [[1250, 2100], 0.09, 0.09], mech: 'ak', brake: 0.25, tail: [1.2, 0.85] },
  // 5.56 carbine: sharp tight "snap", aluminium receiver ping + buffer-spring twang
  m4a1: { blast: [8600, 0.075, 1.2], bark: [1700, 1.8, 0.6], thump: [115, 0.15, 0.7], crack: 0.85, ring: [[3100, 4700], 0.06, 0.06], mech: 'ar', brake: 0, tail: [0.9, 1.1] },
  // 7.62 NATO battle rifle: big, heavy, harsh brake; short-stroke piston clunk
  scarl: { blast: [6000, 0.11, 1.55], bark: [1050, 1.4, 0.7], thump: [88, 0.22, 1.05], crack: 0.85, ring: [[1600, 2500], 0.07, 0.06], mech: 'piston', brake: 0.45, tail: [1.25, 0.9] },
  // fictional balanced rifle: between the AK and M4, rounder
  corsair: { blast: [7200, 0.085, 1.3], bark: [1300, 1.6, 0.65], thump: [105, 0.17, 0.8], crack: 0.75, ring: [[2300, 3500], 0.07, 0.06], mech: 'ar', brake: 0.15, tail: [1.0, 1.0] },
  // fictional heavy precision rifle: deep report, pronounced crack, long tail
  lancer: { blast: [6600, 0.1, 1.45], bark: [1150, 1.5, 0.65], thump: [90, 0.22, 1.0], crack: 1, ring: [[1900, 3200], 0.09, 0.07], mech: 'piston', brake: 0.3, tail: [1.35, 0.95] },

  // ── snipers ──
  // bolt-action: huge clean crack and boom, then the bolt worked by hand
  longwatch: { blast: [6000, 0.14, 1.75], bark: [850, 1.2, 0.7], thump: [70, 0.32, 1.3], crack: 1, ring: [[1500, 2600], 0.12, 0.06], mech: 'bolt', brake: 0.35, tail: [2.0, 0.85] },
  // Dragunov: semi-auto 7.62x54R, sharp crack, long-stroke piston clank
  svd: { blast: [6400, 0.12, 1.6], bark: [980, 1.3, 0.7], thump: [80, 0.26, 1.1], crack: 1, ring: [[1350, 2250], 0.1, 0.08], mech: 'piston', brake: 0.2, tail: [1.7, 0.85] },
  // .50 BMG anti-materiel: enormous, brake blast, recoiling-barrel clunk
  barrett: { blast: [4400, 0.2, 2.1], bark: [520, 1.0, 0.85], thump: [52, 0.45, 1.7], crack: 1, ring: [[900, 1600], 0.16, 0.08], mech: 'antiMateriel', brake: 1, tail: [2.6, 0.7] },

  // ── shotguns ──
  // 12-gauge pump: wide noisy boom then the shuck-shuck
  breacher: { blast: [4800, 0.16, 1.7], bark: [650, 0.9, 0.6], thump: [75, 0.3, 1.25], crack: 0, ring: [[1400], 0.06, 0.04], mech: 'pump', brake: 0, tail: [1.4, 0.75] },
  // semi-auto 12-gauge: boom + quick heavy bolt clack
  spas: { blast: [5000, 0.15, 1.65], bark: [700, 0.9, 0.6], thump: [78, 0.28, 1.2], crack: 0, ring: [[1650, 2700], 0.07, 0.05], mech: 'semiShotgun', brake: 0, tail: [1.3, 0.8] },
  // full-auto shotgun: thuddy, rounder, heavy open-bolt clatter
  aa12: { blast: [4300, 0.13, 1.5], bark: [560, 1.0, 0.6], thump: [70, 0.24, 1.15], crack: 0, ring: [[1100, 1900], 0.06, 0.05], mech: 'autoShotgun', brake: 0.2, tail: [1.1, 0.75] },

  // ── heavy ──
  // 5.56 belt-fed SAW: AR-like snap but heavier, with link rattle
  m249: { blast: [7600, 0.09, 1.35], bark: [1450, 1.6, 0.65], thump: [100, 0.18, 0.9], crack: 0.85, ring: [[2700, 4100], 0.06, 0.06], mech: 'belt', brake: 0, tail: [1.05, 1.0] },
  // fictional heavy MG: deep thud and chain-like rattle
  bulwark: { blast: [5600, 0.11, 1.5], bark: [820, 1.2, 0.7], thump: [82, 0.22, 1.1], crack: 0.7, ring: [[1150, 1850, 2900], 0.08, 0.07], mech: 'belt', brake: 0.3, tail: [1.2, 0.85] },
};

/** Voice for a weapon; unknown weapons fall back to a voice derived from their legacy sound params. */
export function gunVoice(w: WeaponDef): GunVoice {
  const v = (V as Partial<Record<WeaponId, GunVoice>>)[w.id];
  if (v) return v;
  const s = w.sound;
  const supersonic = w.category === 'rifle' || w.category === 'sniper' || w.category === 'heavy';
  return {
    blast: [7500 * s.pitch, 0.09 + s.tail * 0.05, 1.15 * s.punch + 0.35],
    bark: [1800 * s.pitch, 1.5, 0.55],
    thump: [120 * s.pitch, 0.18 + s.punch * 0.06, 0.6 + s.punch * 0.6],
    crack: supersonic ? 0.8 : 0,
    ring: [[2900 * s.pitch], 0.05, 0.04],
    mech: w.category === 'sidearm' ? 'slide' : w.category === 'sniper' ? 'bolt' : w.category === 'shotgun' ? 'pump' : 'ar',
    brake: 0,
    tail: [0.5 + s.tail * 1.2, s.pitch],
  };
}
