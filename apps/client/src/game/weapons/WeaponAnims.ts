import type { WeaponDef } from '@phantom/shared';

/**
 * Weapon handling timelines. Each timeline lists sound cues at fractions of its duration; the
 * first-person viewmodel animates against the same fractions and fires the cues as it passes
 * them, so every click and clack lands on the frame where the part actually moves. Remote
 * players' reloads schedule the same cues in 3D (minus the empty-only ones).
 */
export type HandlingCue =
  | 'magRelease'
  | 'magOut'
  | 'pouch'
  | 'magIn'
  | 'magSeat'
  | 'boltRelease'
  | 'slideRelease'
  | 'coverOpen'
  | 'beltLay'
  | 'coverClose'
  | 'cylOpen'
  | 'eject'
  | 'speedload'
  | 'cylClose'
  | 'shellIn'
  | 'pumpBack'
  | 'pumpFwd'
  | 'boltUp'
  | 'boltBack'
  | 'boltFwd'
  | 'boltDown'
  | 'draw'
  | 'ready'
  | 'cloth'
  | 'tap'
  | 'magTap';

export interface CuePoint {
  at: number;
  cue: HandlingCue;
  /** only when the weapon was empty at the start of the reload (bolt / slide release, pump rack) */
  emptyOnly?: boolean;
}

export type ReloadKind = 'mag' | 'pistol' | 'topMag' | 'belt' | 'revolver' | 'tube';

export function reloadKind(w: WeaponDef): ReloadKind {
  if (w.id === 'magistrate') return 'revolver';
  if (w.id === 'p90') return 'topMag';
  if (w.id === 'breacher' || w.id === 'spas') return 'tube';
  if (w.category === 'heavy') return 'belt';
  if (w.category === 'sidearm') return 'pistol';
  return 'mag';
}

/** Shells animated during a tube reload (the reload time is fixed, so the count is too). */
export const TUBE_SHELLS = 4;
const TUBE_START = 0.12;
const TUBE_EACH = 0.17;
export const tubeWindow = (i: number): [number, number] => [TUBE_START + i * TUBE_EACH, TUBE_START + (i + 1) * TUBE_EACH];

export function reloadCues(w: WeaponDef): CuePoint[] {
  switch (reloadKind(w)) {
    case 'pistol':
      return [
        { at: 0.04, cue: 'cloth' },
        { at: 0.12, cue: 'magRelease' },
        { at: 0.14, cue: 'magOut' },
        { at: 0.36, cue: 'pouch' },
        { at: 0.6, cue: 'magIn' },
        { at: 0.66, cue: 'magSeat' },
        { at: 0.85, cue: 'slideRelease', emptyOnly: true },
      ];
    case 'topMag':
      return [
        { at: 0.04, cue: 'cloth' },
        { at: 0.12, cue: 'magRelease' },
        { at: 0.15, cue: 'magOut' },
        { at: 0.36, cue: 'pouch' },
        { at: 0.6, cue: 'magIn' },
        { at: 0.67, cue: 'magSeat' },
        { at: 0.8, cue: 'boltRelease', emptyOnly: true },
      ];
    case 'belt':
      return [
        { at: 0.04, cue: 'cloth' },
        { at: 0.1, cue: 'coverOpen' },
        { at: 0.22, cue: 'magRelease' },
        { at: 0.25, cue: 'magOut' },
        { at: 0.42, cue: 'pouch' },
        { at: 0.6, cue: 'magIn' },
        { at: 0.64, cue: 'magSeat' },
        { at: 0.71, cue: 'beltLay' },
        { at: 0.8, cue: 'coverClose' },
        { at: 0.88, cue: 'boltRelease', emptyOnly: true },
      ];
    case 'revolver':
      return [
        { at: 0.04, cue: 'cloth' },
        { at: 0.1, cue: 'cylOpen' },
        { at: 0.26, cue: 'eject' },
        { at: 0.4, cue: 'pouch' },
        { at: 0.6, cue: 'speedload' },
        { at: 0.72, cue: 'cylClose' },
      ];
    case 'tube': {
      const cues: CuePoint[] = [{ at: 0.04, cue: 'cloth' }];
      for (let i = 0; i < TUBE_SHELLS; i++) cues.push({ at: tubeWindow(i)[1] - 0.01, cue: 'shellIn' });
      if (w.id === 'breacher') cues.push({ at: 0.86, cue: 'pumpBack', emptyOnly: true }, { at: 0.92, cue: 'pumpFwd', emptyOnly: true });
      else cues.push({ at: 0.88, cue: 'boltRelease', emptyOnly: true });
      return cues;
    }
    default:
      return [
        { at: 0.04, cue: 'cloth' },
        { at: 0.1, cue: 'magRelease' },
        { at: 0.13, cue: 'magOut' },
        { at: 0.36, cue: 'pouch' },
        { at: 0.6, cue: 'magIn' },
        { at: 0.66, cue: 'magSeat' },
        { at: w.category === 'sniper' ? 0.8 : 0.76, cue: 'boltRelease', emptyOnly: true },
      ];
  }
}

/** Manually cycled actions after each shot. */
export type CycleKind = 'pump' | 'bolt';
export function cycleKind(w: WeaponDef): CycleKind | null {
  if (w.id === 'breacher') return 'pump';
  if (w.id === 'longwatch') return 'bolt';
  return null;
}
export const CYCLE: Record<CycleKind, { dur: number; eject: number; cues: CuePoint[] }> = {
  pump: { dur: 0.72, eject: 0.4, cues: [{ at: 0.36, cue: 'pumpBack' }, { at: 0.62, cue: 'pumpFwd' }] },
  bolt: {
    dur: 1.0,
    eject: 0.52,
    cues: [
      { at: 0.38, cue: 'boltUp' },
      { at: 0.5, cue: 'boltBack' },
      { at: 0.68, cue: 'boltFwd' },
      { at: 0.8, cue: 'boltDown' },
    ],
  },
};

export const EQUIP_CUES: CuePoint[] = [
  { at: 0.02, cue: 'draw' },
  { at: 0.72, cue: 'ready' },
];

export const INSPECT_DUR = 3.0;
export const INSPECT_CUES: CuePoint[] = [
  { at: 0.04, cue: 'cloth' },
  { at: 0.3, cue: 'tap' },
  { at: 0.5, cue: 'magTap' },
  { at: 0.62, cue: 'cloth' },
  { at: 0.9, cue: 'tap' },
];

/** Fire every cue whose time lies in (from, to]. */
export function crossCues(cues: CuePoint[], from: number, to: number, wasEmpty: boolean, fire: (c: HandlingCue) => void) {
  if (to <= from) return;
  for (const c of cues) if (c.at > from && c.at <= to && (!c.emptyOnly || wasEmpty)) fire(c.cue);
}
