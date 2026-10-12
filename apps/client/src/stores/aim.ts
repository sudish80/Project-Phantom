import { create } from 'zustand';

/** Per-frame aim state (ADS blend, scope blend, zoom, spread). Kept separate from the 20 Hz HUD store
 *  so crosshair / reticle / scope transitions are perfectly smooth without re-rendering the whole HUD. */
export interface AimState {
  adsT: number;
  scopeT: number;
  zoom: number;
  spread: number;
  scoped: boolean;
  lowered: boolean;
}

export const useAim = create<AimState>()(() => ({ adsT: 0, scopeT: 0, zoom: 1, spread: 0, scoped: false, lowered: false }));
