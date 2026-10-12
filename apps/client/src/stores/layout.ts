import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * Customisable HUD layout: on-screen touch buttons (absolute positions) and the HUD panels
 * (offsets from their default CSS position). Fractions of the viewport so a layout survives
 * rotation and different screen sizes.
 */
export type TouchId =
  | 'stick'
  | 'fire'
  | 'fireL'
  | 'ads'
  | 'jump'
  | 'crouch'
  | 'reload'
  | 'sprint'
  | 'swap'
  | 'use'
  | 'ab1'
  | 'ab2'
  | 'ab3'
  | 'ult'
  | 'leanL'
  | 'leanR'
  | 'walk'
  | 'drop'
  | 'buy'
  | 'scores'
  | 'map'
  | 'inspect'
  | 'pause';

export type PanelId = 'top' | 'compass' | 'vitals' | 'abilities' | 'ammo' | 'killfeed' | 'minimap' | 'practice' | 'effects';

export interface TouchBtn {
  /** centre, fraction of viewport width / height */
  x: number;
  y: number;
  /** diameter, fraction of viewport height */
  size: number;
  opacity: number;
  hidden: boolean;
}

export interface PanelCfg {
  /** offset from the default position, fraction of viewport width / height */
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  hidden: boolean;
}

const B = (x: number, y: number, size: number, hidden = false): TouchBtn => ({ x, y, size, opacity: 0.75, hidden });

export const DEFAULT_BUTTONS: Record<TouchId, TouchBtn> = {
  stick: B(0.14, 0.7, 0.32),
  fire: B(0.86, 0.63, 0.18),
  fireL: B(0.07, 0.5, 0.12),
  ads: B(0.94, 0.4, 0.115),
  jump: B(0.94, 0.84, 0.13),
  crouch: B(0.8, 0.88, 0.115),
  reload: B(0.75, 0.46, 0.1),
  sprint: B(0.3, 0.5, 0.09),
  swap: B(0.84, 0.3, 0.1),
  use: B(0.68, 0.6, 0.095),
  ab1: B(0.55, 0.88, 0.095),
  ab2: B(0.62, 0.88, 0.095),
  ab3: B(0.69, 0.88, 0.095),
  ult: B(0.62, 0.74, 0.1),
  leanL: B(0.36, 0.5, 0.085, true),
  leanR: B(0.64, 0.5, 0.085, true),
  walk: B(0.3, 0.85, 0.085, true),
  drop: B(0.5, 0.74, 0.085, true),
  buy: B(0.72, 0.07, 0.075),
  scores: B(0.79, 0.07, 0.075),
  map: B(0.86, 0.07, 0.075),
  inspect: B(0.65, 0.07, 0.075),
  pause: B(0.94, 0.07, 0.075),
};

export const TOUCH_LABELS: Record<TouchId, string> = {
  stick: 'Move stick',
  fire: 'Fire',
  fireL: 'Fire (left)',
  ads: 'Aim',
  jump: 'Jump',
  crouch: 'Crouch / slide',
  reload: 'Reload',
  sprint: 'Sprint lock',
  swap: 'Switch weapon',
  use: 'Interact',
  ab1: 'Ability 1',
  ab2: 'Ability 2',
  ab3: 'Ability 3',
  ult: 'Ultimate',
  leanL: 'Peek left',
  leanR: 'Peek right',
  walk: 'Walk',
  drop: 'Drop objective',
  buy: 'Buy menu',
  scores: 'Scoreboard',
  map: 'Map',
  inspect: 'Inspect',
  pause: 'Menu',
};

export const PANEL_LABELS: Record<PanelId, string> = {
  top: 'Score & timer',
  compass: 'Compass',
  vitals: 'Health & armor',
  abilities: 'Abilities',
  ammo: 'Weapon & ammo',
  killfeed: 'Kill feed',
  minimap: 'Minimap',
  practice: 'Practice stats',
  effects: 'Status effects',
};

const P = (): PanelCfg => ({ dx: 0, dy: 0, scale: 1, opacity: 1, hidden: false });
export const DEFAULT_PANELS: Record<PanelId, PanelCfg> = {
  top: P(),
  compass: P(),
  vitals: P(),
  abilities: P(),
  ammo: P(),
  killfeed: P(),
  minimap: P(),
  practice: P(),
  effects: P(),
};

interface LayoutState {
  buttons: Record<TouchId, TouchBtn>;
  panels: Record<PanelId, PanelCfg>;
  /** global multipliers */
  hudScale: number;
  buttonOpacity: number;
  setButton: (id: TouchId, p: Partial<TouchBtn>) => void;
  setPanel: (id: PanelId, p: Partial<PanelCfg>) => void;
  set: (p: Partial<Pick<LayoutState, 'hudScale' | 'buttonOpacity'>>) => void;
  reset: () => void;
}

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

export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      buttons: DEFAULT_BUTTONS,
      panels: DEFAULT_PANELS,
      hudScale: 1,
      buttonOpacity: 1,
      setButton: (id, p) => set((s) => ({ buttons: { ...s.buttons, [id]: { ...s.buttons[id], ...p } } })),
      setPanel: (id, p) => set((s) => ({ panels: { ...s.panels, [id]: { ...s.panels[id], ...p } } })),
      set: (p) => set(p),
      reset: () => set({ buttons: DEFAULT_BUTTONS, panels: DEFAULT_PANELS, hudScale: 1, buttonOpacity: 1 }),
    }),
    {
      name: 'phantom.layout.v1',
      storage: createJSONStorage(() => safeStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LayoutState>;
        return {
          ...current,
          ...p,
          // new buttons / panels added in later versions get their defaults
          buttons: { ...DEFAULT_BUTTONS, ...(p.buttons ?? {}) },
          panels: { ...DEFAULT_PANELS, ...(p.panels ?? {}) },
        };
      },
    },
  ),
);

/** Inline style for a HUD panel: CSS `translate`/`scale` compose with the panel's own transform. */
export function panelStyle(cfg: PanelCfg, hudScale: number): React.CSSProperties {
  return {
    translate: cfg.dx || cfg.dy ? `${(cfg.dx * 100).toFixed(2)}vw ${(cfg.dy * 100).toFixed(2)}vh` : undefined,
    scale: cfg.scale * hudScale !== 1 ? String(cfg.scale * hudScale) : undefined,
    opacity: cfg.opacity < 1 ? cfg.opacity : undefined,
    display: cfg.hidden ? 'none' : undefined,
  };
}

/** Props for a movable HUD panel root: `<div {...useHudSlot('vitals')} className=…>` */
export function useHudSlot(id: PanelId, extra?: React.CSSProperties) {
  const cfg = useLayout((s) => s.panels[id]);
  const hudScale = useLayout((s) => s.hudScale);
  return { 'data-hud': id, style: { ...extra, ...panelStyle(cfg, hudScale) } };
}

/** Coarse pointer + touch support → phone / tablet. */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}
