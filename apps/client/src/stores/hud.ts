import { create } from 'zustand';
import type { AbilityState, CharacterId, MatchPhase, PlayerFx, TeamId, ChargeState, GameMode, PlayerSnap, MatchSnap } from '@phantom/shared';
import type { WeaponId } from '@phantom/shared';
import type { OpticEffect, ReticleKind, SightId } from '../game/weapons/Sights';

export interface KillFeedEntry {
  id: number;
  killer: string | null;
  killerTeam: TeamId | null;
  victim: string;
  victimTeam: TeamId;
  weapon: string;
  head: boolean;
  mine: boolean;
  t: number;
}

export interface HudState {
  ready: boolean;
  you: string;
  mode: GameMode;
  team: TeamId;
  character: CharacterId;
  alive: boolean;
  hp: number;
  armor: number;
  shield: number;
  credits: number;
  weapon: WeaponId;
  slot: number;
  primary: WeaponId | null;
  secondary: WeaponId | null;
  mag: number;
  reserve: number;
  reloading: boolean;
  abilities: AbilityState[];
  ult: number;
  fx: PlayerFx;
  phase: MatchPhase;
  timeLeft: number;
  round: number;
  scores: Record<TeamId, number>;
  attackers: TeamId;
  charge: ChargeState | null;
  hasCharge: boolean;
  aliveCounts: Record<TeamId, { alive: number; total: number }>;
  killfeed: KillFeedEntry[];
  banner: { big: string; small: string; kind: 'win' | 'lose' | 'neutral'; until: number } | null;
  prompt: { text: string; progress?: number } | null;
  spectating: string | null;
  respawnT: number;
  inBuyZone: boolean;
  canBuy: boolean;
  smoke: number;
  scoped: boolean;
  /** mounted optic state for the HUD overlay */
  sight: SightId;
  reticle: ReticleKind;
  reticleColor: string;
  opticFx: OpticEffect | null;
  /** 0..1 ADS blend for the optic overlay */
  adsT: number;
  /** effective (variable-zoom aware) magnification currently applied */
  zoom: number;
  /** 0..1 fade for the scope tube vignette */
  scopeT: number;
  /** weapon lowered pose (sprint / slide) drives crosshair hiding */
  sprinting: boolean;
  sliding: boolean;
  spread: number;
  ping: number;
  fps: number;
  players: PlayerSnap[];
  match: MatchSnap | null;
  practice: MatchSnap['practice'] | null;
  lastHits: { dmg: number; zone?: string; dist?: number; t: number }[];
  underwater: number;
  heading: number;
  position: { x: number; y: number; z: number };
  openWorld: boolean;
  timeOfDay: number;
  weather: string;
  marker: { x: number; z: number } | null;
  set: (p: Partial<HudState>) => void;
}

export const useHud = create<HudState>()((set) => ({
  ready: false,
  you: '',
  mode: 'tactical',
  team: 'alpha',
  character: 'vanguard',
  alive: true,
  hp: 100,
  armor: 0,
  shield: 0,
  credits: 0,
  weapon: 'wisp',
  slot: 2,
  primary: null,
  secondary: 'wisp',
  mag: 0,
  reserve: 0,
  reloading: false,
  abilities: [],
  ult: 0,
  fx: { overdrive: 0, slow: 0, revealed: 0, spawnProt: 0, renewal: 0, heal: 0, shieldT: 0, echo: 0 },
  phase: 'warmup',
  timeLeft: 0,
  round: 0,
  scores: { alpha: 0, bravo: 0 },
  attackers: 'alpha',
  charge: null,
  hasCharge: false,
  aliveCounts: { alpha: { alive: 0, total: 0 }, bravo: { alive: 0, total: 0 } },
  killfeed: [],
  banner: null,
  prompt: null,
  spectating: null,
  respawnT: 0,
  inBuyZone: false,
  canBuy: false,
  smoke: 0,
  scoped: false,
  sight: 'iron',
  reticle: 'none',
  reticleColor: '#dfe3e8',
  opticFx: null,
  adsT: 0,
  zoom: 1,
  scopeT: 0,
  sprinting: false,
  sliding: false,
  spread: 0,
  ping: 0,
  fps: 0,
  players: [],
  match: null,
  practice: null,
  lastHits: [],
  underwater: 0,
  heading: 0,
  position: { x: 0, y: 0, z: 0 },
  openWorld: false,
  timeOfDay: 12,
  weather: 'clear',
  marker: null,
  set: (p) => set(p),
}));

/** Imperative channel for high-frequency, non-React HUD effects (hit markers, damage flashes). */
type HudFx =
  | { type: 'hitmarker'; head: boolean; kill: boolean }
  | { type: 'damage'; angle: number; amount: number }
  | { type: 'kill'; count: number; head: boolean; color: string; label: string | null };
const fxListeners = new Set<(e: HudFx) => void>();
export const hudFx = {
  emit: (e: HudFx) => fxListeners.forEach((l) => l(e)),
  on: (l: (e: HudFx) => void) => {
    fxListeners.add(l);
    return () => {
      fxListeners.delete(l);
    };
  },
};
