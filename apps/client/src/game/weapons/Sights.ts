import type { WeaponCategory, WeaponDef, WeaponId } from '@phantom/shared';

export type SightId =
  | 'iron'
  | 'reddot'
  | 'holo'
  | 'reflex'
  | 'prism1'
  | 'scope2'
  | 'scope3'
  | 'scope4'
  | 'scope6'
  | 'scope8'
  | 'scope10'
  | 'variable'
  | 'magnifier'
  | 'hybrid'
  | 'thermal'
  | 'nightvision'
  | 'digital'
  | 'acog'
  | 'openreflex'
  | 'enclosed'
  | 'circledot'
  | 'chevron'
  | 'crosshair'
  | 'mildot'
  | 'bdc'
  | 'illuminated'
  | 'varireticle'
  | 'lowlight'
  | 'scout'
  | 'smart';

/** How the optic is drawn on the weapon. */
export type SightStyle = 'iron' | 'micro' | 'box' | 'tube' | 'prism' | 'scope' | 'magnifier' | 'hybrid' | 'electronic';

/** Reticle drawn in the optic overlay. */
export type ReticleKind =
  | 'none'
  | 'dot'
  | 'ringdot'
  | 'chevron'
  | 'cross'
  | 'mildot'
  | 'bdc'
  | 'illuminated'
  | 'thermal'
  | 'digital'
  | 'smart';

export type OpticEffect = 'thermal' | 'nightvision' | 'digital' | 'smart';

export interface SightDef {
  id: SightId;
  name: string;
  /** short label for the catalog columns */
  short: string;
  style: SightStyle;
  /** ADS magnification */
  zoom: number;
  /** true = magnified tube; the weapon hides and a scope vignette appears */
  tube: boolean;
  reticle: ReticleKind;
  /** reticle colour, hex string */
  color: string;
  /** optional glass tint (hex) drawn over the lens area */
  tint?: string;
  effect?: OpticEffect;
  desc: string;
}

export const SIGHT_LIST: SightDef[] = [
  { id: 'iron', name: 'Iron Sights', short: 'Iron', style: 'iron', zoom: 1.05, tube: false, reticle: 'none', color: '#dfe3e8', desc: 'Basic front post and rear notch. No magnification, nothing to obscure the target.' },
  { id: 'reddot', name: 'Red Dot Sight', short: 'Red Dot', style: 'micro', zoom: 1.15, tube: false, reticle: 'dot', color: '#ff3b30', desc: 'Compact tube with a bright red dot. Fast, unobtrusive, easy to track.' },
  { id: 'holo', name: 'Holographic Sight', short: 'Holo', style: 'box', zoom: 1.2, tube: false, reticle: 'ringdot', color: '#ff5a36', desc: 'Large rectangular window projecting a circle-dot reticle.' },
  { id: 'reflex', name: 'Reflex Sight', short: 'Reflex', style: 'micro', zoom: 1.12, tube: false, reticle: 'dot', color: '#ff3b30', desc: 'Open, lightweight frame with an illuminated central dot.' },
  { id: 'prism1', name: '1× Prism Scope', short: '1× Prism', style: 'prism', zoom: 1.3, tube: false, reticle: 'cross', color: '#f2c14e', desc: 'Prism optic with an etched crosshair and virtually no magnification.' },
  { id: 'scope2', name: '2× Scope', short: '2×', style: 'scope', zoom: 2, tube: true, reticle: 'cross', color: '#e8e2d4', desc: 'Low-power tube scope. Mild zoom, fine crosshair.' },
  { id: 'scope3', name: '3× Scope', short: '3×', style: 'scope', zoom: 3, tube: true, reticle: 'chevron', color: '#e8e2d4', desc: 'Medium-low magnification with a chevron reticle for quick holds.' },
  { id: 'scope4', name: '4× Scope', short: '4×', style: 'scope', zoom: 4, tube: true, reticle: 'mildot', color: '#e8e2d4', desc: 'Classic 4× with turrets, big objective lens and a mil-dot crosshair.' },
  { id: 'scope6', name: '6× Scope', short: '6×', style: 'scope', zoom: 6, tube: true, reticle: 'bdc', color: '#e8e2d4', desc: 'Longer tube and stronger zoom, graduated bullet-drop reticle.' },
  { id: 'scope8', name: '8× Scope', short: '8×', style: 'scope', zoom: 8, tube: true, reticle: 'mildot', color: '#e8e2d4', desc: 'High magnification. Narrow field of view, detailed reticle.' },
  { id: 'scope10', name: '10× Scope', short: '10×', style: 'scope', zoom: 10, tube: true, reticle: 'mildot', color: '#e8e2d4', desc: 'Very high magnification for extreme range. Large objective, focus ring.' },
  { id: 'variable', name: 'Variable-Zoom Scope', short: 'Variable', style: 'scope', zoom: 4, tube: true, reticle: 'cross', color: '#e8e2d4', desc: 'Adjustable magnification between 2× and 6× (scroll wheel while aiming).' },
  { id: 'magnifier', name: 'Holographic Magnifier', short: 'Magnifier', style: 'magnifier', zoom: 3, tube: true, reticle: 'ringdot', color: '#ff5a36', desc: 'Flip-to-side 3× magnifier for a holographic sight.' },
  { id: 'hybrid', name: 'Hybrid Sight', short: 'Hybrid', style: 'hybrid', zoom: 4, tube: true, reticle: 'ringdot', color: '#ff5a36', desc: 'Reflex sight with an inline magnifier: fast up close, precise at range.' },
  { id: 'thermal', name: 'Thermal Optic', short: 'Thermal', style: 'electronic', zoom: 3, tube: true, reticle: 'thermal', color: '#ffd27a', tint: '#0b1a2a', effect: 'thermal', desc: 'Heat-signature imaging. Warm bodies glow against a cold world.' },
  { id: 'nightvision', name: 'Night-Vision Optic', short: 'Night Vis', style: 'electronic', zoom: 2.5, tube: true, reticle: 'cross', color: '#7dff7d', tint: '#04140a', effect: 'nightvision', desc: 'Image-intensifying optic. Green monochrome view with grain.' },
  { id: 'digital', name: 'Digital Scope', short: 'Digital', style: 'electronic', zoom: 3, tube: true, reticle: 'digital', color: '#5ad2ff', tint: '#04121a', effect: 'digital', desc: 'Electronic display with digital zoom and a HUD overlay.' },
  { id: 'acog', name: 'ACOG Prismatic', short: 'ACOG', style: 'prism', zoom: 4, tube: true, reticle: 'chevron', color: '#ffb347', desc: 'Compact fixed 4× prismatic optic with an illuminated chevron.' },
  { id: 'openreflex', name: 'Open Reflex Sight', short: 'Open Reflex', style: 'micro', zoom: 1.1, tube: false, reticle: 'ringdot', color: '#ff3b30', desc: 'Exposed lens and minimal housing for the widest possible view.' },
  { id: 'enclosed', name: 'Enclosed Red Dot', short: 'Enclosed', style: 'tube', zoom: 1.15, tube: false, reticle: 'dot', color: '#ff3b30', desc: 'Fully enclosed tube red dot. Protected optics, framed view.' },
  { id: 'circledot', name: 'Circle-Dot Reticle', short: 'Circle-Dot', style: 'micro', zoom: 1.2, tube: false, reticle: 'ringdot', color: '#ff3b30', desc: 'Central dot inside an illuminated circle for fast target acquisition.' },
  { id: 'chevron', name: 'Chevron Reticle', short: 'Chevron', style: 'prism', zoom: 1.25, tube: false, reticle: 'chevron', color: '#ffb347', desc: 'Inverted-V aiming marker with the point at the point of impact.' },
  { id: 'crosshair', name: 'Crosshair Reticle', short: 'Crosshair', style: 'prism', zoom: 1.25, tube: false, reticle: 'cross', color: '#e8e2d4', desc: 'Thin intersecting lines with a central intersection.' },
  { id: 'mildot', name: 'Mil-Dot Reticle', short: 'Mil-Dot', style: 'scope', zoom: 4, tube: true, reticle: 'mildot', color: '#e8e2d4', desc: 'Crosshair with regularly spaced dots for holdover and ranging.' },
  { id: 'bdc', name: 'Bullet-Drop Compensating', short: 'BDC', style: 'scope', zoom: 4, tube: true, reticle: 'bdc', color: '#e8e2d4', desc: 'Graduated marks below centre for estimating distance.' },
  { id: 'illuminated', name: 'Illuminated Crosshair', short: 'Illuminated', style: 'prism', zoom: 1.25, tube: false, reticle: 'illuminated', color: '#41ffcc', desc: 'Bright configurable crosshair that stays visible on any background.' },
  { id: 'varireticle', name: 'Variable-Reticle Optic', short: 'Var. Reticle', style: 'micro', zoom: 1.25, tube: false, reticle: 'ringdot', color: '#ff3b30', desc: 'Switchable dot, crosshair or chevron reticle with brightness control.' },
  { id: 'lowlight', name: 'Low-Light Reflex', short: 'Low-Light', style: 'micro', zoom: 1.12, tube: false, reticle: 'illuminated', color: '#ff5a36', desc: 'Reflex sight tuned for dim environments; reticle stays prominent.' },
  { id: 'scout', name: 'Scout Optic', short: 'Scout', style: 'scope', zoom: 2.5, tube: true, reticle: 'cross', color: '#9fe870', desc: 'Slim, long-eye-relief tube with modest magnification.' },
  { id: 'smart', name: 'Smart Scope', short: 'Smart', style: 'electronic', zoom: 4, tube: true, reticle: 'smart', color: '#41ffcc', tint: '#04141a', effect: 'smart', desc: 'Futuristic optic with a digital targeting frame, range readout and scan lines.' },
];

export const SIGHTS: Record<SightId, SightDef> = Object.fromEntries(SIGHT_LIST.map((s) => [s.id, s])) as Record<SightId, SightDef>;

const DEFAULT_BY_CATEGORY: Record<WeaponCategory, SightId> = {
  sidearm: 'iron',
  smg: 'reddot',
  rifle: 'holo',
  shotgun: 'iron',
  heavy: 'reddot',
  sniper: 'scope4',
  melee: 'iron',
};

const DEFAULT_OVERRIDE: Partial<Record<WeaponId, SightId>> = {
  longwatch: 'scope4',
  svd: 'scope4',
  barrett: 'scope8',
};

export function defaultSightFor(w: Pick<WeaponDef, 'id' | 'category'>): SightId {
  return DEFAULT_OVERRIDE[w.id] ?? DEFAULT_BY_CATEGORY[w.category];
}

export function isSightId(v: unknown): v is SightId {
  return typeof v === 'string' && v in SIGHTS;
}

export function getSight(id: SightId | undefined | null): SightDef {
  return SIGHTS[id ?? 'iron'] ?? SIGHTS.iron;
}
