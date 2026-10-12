import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { CharacterId, WeaponId } from '@phantom/shared';
import type { SightId } from '../game/weapons/Sights';

export type Quality = 'low' | 'medium' | 'high';
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'crouch' | 'walk' | 'sprint' | 'slide' | 'leanLeft' | 'leanRight'
  | 'reload' | 'use' | 'buy' | 'drop'
  | 'ab1' | 'ab2' | 'ab3' | 'ult' | 'slot1' | 'slot2' | 'slot3' | 'scoreboard' | 'inspect' | 'minimap' | 'worldMap';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Move forward', back: 'Move backward', left: 'Strafe left', right: 'Strafe right', jump: 'Jump',
  crouch: 'Crouch', walk: 'Walk (slow modifier)', sprint: 'Sprint (hold, moving forward)', slide: 'Slide (while sprinting)',
  leanLeft: 'Peek left', leanRight: 'Peek right', reload: 'Reload', use: 'Interact (plant / defuse)', buy: 'Buy menu',
  drop: 'Drop objective', ab1: 'Ability 1', ab2: 'Ability 2', ab3: 'Ability 3', ult: 'Ultimate', slot1: 'Primary weapon',
  slot2: 'Sidearm', slot3: 'Melee', scoreboard: 'Scoreboard (hold)', inspect: 'Inspect weapon', minimap: 'Toggle minimap', worldMap: 'World map (open world)',
};

export const DEFAULT_BINDS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'ControlLeft', walk: 'AltLeft',
  sprint: 'ShiftLeft', slide: 'KeyC', leanLeft: 'KeyQ', leanRight: 'KeyE',
  reload: 'KeyR', use: 'KeyF', buy: 'KeyB', drop: 'KeyG', ab1: 'KeyZ', ab2: 'KeyV', ab3: 'KeyH', ult: 'KeyX',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', scoreboard: 'Tab', inspect: 'KeyY', minimap: 'KeyN', worldMap: 'KeyM',
};

export interface CrosshairSettings {
  color: string;
  size: number;
  gap: number;
  thickness: number;
  dot: boolean;
  outline: boolean;
  dynamic: boolean;
}

export interface ProfileStats {
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
}

export interface SettingsState {
  nickname: string;
  character: CharacterId;
  skin: string;
  sensitivity: number;
  adsSensitivity: number;
  invertY: boolean;
  fov: number;
  quality: Quality;
  shadows: 'off' | 'low' | 'high';
  renderScale: number;
  antialias: boolean;
  bloom: boolean;
  cameraShake: boolean;
  headBob: boolean;
  crouchMode: 'hold' | 'toggle';
  aimMode: 'hold' | 'toggle';
  shiftMode: 'walk' | 'sprint';
  crosshair: CrosshairSettings;
  /** mounted optic per weapon (client-side, free) */
  sights: Partial<Record<WeaponId, SightId>>;
  damageIndicators: boolean;
  showNetStats: boolean;
  showMinimap: boolean;
  volume: { master: number; music: number; sfx: number; ambient: number; ui: number };
  muted: boolean;
  binds: Record<Action, string>;
  /** input method: auto-detect, or force touch / mouse & keyboard */
  controlMode: 'auto' | 'touch' | 'mouse';
  touchSens: number;
  touchAdsSens: number;
  /** pushing the move stick fully forward sprints */
  autoSprint: boolean;
  /** dragging from the fire button also aims */
  fireDragAim: boolean;
  gyro: boolean;
  gyroSens: number;
  gyroAdsOnly: boolean;
  autoFullscreen: boolean;
  /** lighter graphics defaults were applied on first launch on a phone */
  mobileTuned: boolean;
  stats: ProfileStats;
  lastServer: string;
  set: (p: Partial<Omit<SettingsState, 'set' | 'reset' | 'bind'>>) => void;
  bind: (a: Action, code: string) => void;
  reset: (section?: 'graphics' | 'controls' | 'audio' | 'gameplay' | 'touch') => void;
}

const defaults = {
  nickname: '',
  character: 'vanguard' as CharacterId,
  skin: 'standard',
  sensitivity: 1,
  adsSensitivity: 1,
  invertY: false,
  fov: 100,
  quality: 'medium' as Quality,
  shadows: 'low' as const,
  renderScale: 1,
  antialias: true,
  bloom: true,
  cameraShake: true,
  headBob: true,
  crouchMode: 'hold' as const,
  aimMode: 'hold' as const,
  shiftMode: 'walk' as const,
  crosshair: { color: '#41ffcc', size: 6, gap: 3, thickness: 2, dot: false, outline: true, dynamic: true },
  sights: {} as Partial<Record<WeaponId, SightId>>,
  damageIndicators: true,
  showNetStats: false,
  showMinimap: true,
  volume: { master: 0.8, music: 0.4, sfx: 0.9, ambient: 0.5, ui: 0.6 },
  muted: false,
  binds: DEFAULT_BINDS,
  controlMode: 'auto' as 'auto' | 'touch' | 'mouse',
  touchSens: 1,
  touchAdsSens: 0.8,
  autoSprint: true,
  fireDragAim: true,
  gyro: false,
  gyroSens: 1,
  gyroAdsOnly: false,
  autoFullscreen: true,
  mobileTuned: false,
  stats: { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, headshots: 0 },
  lastServer: '',
};

/** localStorage that never throws (private mode, quota, blocked storage). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      set: (p) => set(p),
      bind: (a, code) =>
        set((s) => {
          const binds = { ...s.binds };
          // swap if the key is already bound elsewhere
          for (const k of Object.keys(binds) as Action[]) if (binds[k] === code && k !== a) binds[k] = s.binds[a];
          binds[a] = code;
          return { binds };
        }),
      reset: (section) =>
        set((st) => {
          if (section === 'graphics') return { quality: defaults.quality, shadows: defaults.shadows, renderScale: 1, antialias: true, bloom: true, fov: 100, cameraShake: true, headBob: true };
          if (section === 'controls') return { binds: DEFAULT_BINDS, sensitivity: 1, adsSensitivity: 1, invertY: false, crouchMode: 'hold', aimMode: 'hold', shiftMode: 'walk' };
          if (section === 'audio') return { volume: defaults.volume, muted: false };
          if (section === 'touch')
            return { controlMode: 'auto', touchSens: 1, touchAdsSens: 0.8, autoSprint: true, fireDragAim: true, gyro: false, gyroSens: 1, gyroAdsOnly: false, autoFullscreen: true };
          if (section === 'gameplay') return { crosshair: defaults.crosshair, damageIndicators: true, showNetStats: false, showMinimap: true };
          return { ...defaults, nickname: st.nickname, character: st.character, skin: st.skin, stats: st.stats };
        }),
    }),
    {
      name: 'phantom.settings.v1',
      storage: createJSONStorage(() => safeStorage),
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        // v2 introduced peek/slide on Q/E/C/Shift; free those keys from the old ability/interact/walk defaults.
        if (version < 2 && p.binds) {
          p.binds = {
            ...DEFAULT_BINDS,
            ...p.binds,
            walk: DEFAULT_BINDS.walk, use: DEFAULT_BINDS.use, ab1: DEFAULT_BINDS.ab1,
            ab2: DEFAULT_BINDS.ab2, ab3: DEFAULT_BINDS.ab3,
          };
        }
        return p;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          crosshair: { ...defaults.crosshair, ...(p.crosshair ?? {}) },
          sights: { ...(p.sights ?? {}) },
          volume: { ...defaults.volume, ...(p.volume ?? {}) },
          binds: { ...DEFAULT_BINDS, ...(p.binds ?? {}) },
          stats: { ...defaults.stats, ...(p.stats ?? {}) },
        };
      },
    },
  ),
);

export function keyLabel(code: string) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Mouse')) return ['LMB', 'MMB', 'RMB', 'M4', 'M5'][Number(code.slice(5))] ?? code;
  const map: Record<string, string> = {
    Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT', AltRight: 'R-ALT', Tab: 'TAB', CapsLock: 'CAPS', Backquote: '`', Escape: 'ESC',
  };
  return map[code] ?? code.toUpperCase();
}

export { WEAPON_SKINS as SKINS } from '@phantom/shared';

/** True when the touch controls should be used (setting, or auto-detected phone / tablet). */
export function touchModeActive(mode: SettingsState['controlMode']) {
  if (mode === 'touch') return true;
  if (mode === 'mouse') return false;
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

export const useTouchMode = () => touchModeActive(useSettings((s) => s.controlMode));

/** First launch on a phone: lighter graphics so the game holds a playable frame rate. */
export function applyMobileDefaults() {
  const s = useSettings.getState();
  if (s.mobileTuned || !touchModeActive(s.controlMode)) return;
  s.set({ mobileTuned: true, quality: 'low', shadows: 'off', bloom: false, renderScale: 0.85, antialias: false, fov: 90 });
}
