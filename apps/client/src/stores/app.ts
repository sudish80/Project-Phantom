import { create } from 'zustand';
import type { GameStartPayload, MatchResult, RoomState, ServerInfo, PracticeDifficulty } from '@phantom/shared';

export type Screen = 'menu' | 'play' | 'create' | 'join' | 'lobby' | 'game' | 'settings' | 'profile' | 'practice' | 'results';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
}

export interface ActiveGame {
  kind: 'online' | 'practice';
  start: GameStartPayload;
  practice?: { difficulty: PracticeDifficulty; infiniteAmmo: boolean; map?: 'range' | 'frontier' };
}

interface AppState {
  screen: Screen;
  prevScreen: Screen;
  connection: 'connecting' | 'connected' | 'disconnected';
  serverInfo: ServerInfo | null;
  room: RoomState | null;
  me: string | null;
  game: ActiveGame | null;
  results: MatchResult | null;
  toasts: Toast[];
  fatal: string | null;
  go: (s: Screen) => void;
  set: (p: Partial<AppState>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
}

let toastId = 1;

export const useApp = create<AppState>()((set, get) => ({
  screen: 'menu',
  prevScreen: 'menu',
  connection: 'connecting',
  serverInfo: null,
  room: null,
  me: null,
  game: null,
  results: null,
  toasts: [],
  fatal: null,
  go: (screen) => set({ prevScreen: get().screen, screen }),
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3800);
  },
}));
