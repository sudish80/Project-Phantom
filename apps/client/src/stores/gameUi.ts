import { create } from 'zustand';

export type Overlay = null | 'capture' | 'pause' | 'buy' | 'settings' | 'map' | 'hudEdit';

interface GameUiState {
  overlay: Overlay;
  scoreboard: boolean;
  minimap: boolean;
  set: (p: Partial<Omit<GameUiState, 'set'>>) => void;
}

export const useGameUi = create<GameUiState>()((set) => ({
  overlay: 'capture',
  scoreboard: false,
  minimap: true,
  set: (p) => set(p),
}));
