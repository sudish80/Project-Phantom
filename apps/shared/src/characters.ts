import type { CharacterId } from './types';

export type AbilityKey = 'ab1' | 'ab2' | 'ab3' | 'ult';

export interface AbilityDef {
  id: string;
  name: string;
  key: AbilityKey;
  desc: string;
  charges: number;
  cooldown: number;
  /** ultimate point cost (ultimates only) */
  ultCost?: number;
  duration?: number;
  range?: number;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  tagline: string;
  color: string;
  accent: string;
  build: 'light' | 'medium' | 'heavy';
  /** index 0..2 basic abilities (null = none), 3 = ultimate */
  abilities: [AbilityDef | null, AbilityDef | null, AbilityDef | null, AbilityDef];
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  vanguard: {
    id: 'vanguard', name: 'Vanguard', role: 'Entry', color: '#ff5a36', accent: '#ffb199', build: 'medium',
    tagline: 'First through the door. Creates openings with speed and cover.',
    abilities: [
      { id: 'surge', name: 'Surge', key: 'ab1', charges: 2, cooldown: 14, duration: 0.22, range: 4,
        desc: 'Burst forward in your movement direction (or facing direction) about 4 metres.' },
      { id: 'veil', name: 'Veil Canister', key: 'ab2', charges: 2, cooldown: 35, duration: 14, range: 30,
        desc: 'Launch a canister to where you aim. It expands into a vision-blocking cloud for 14s. Bullets still pass through.' },
      null,
      { id: 'overdrive', name: 'Overdrive', key: 'ult', charges: 1, cooldown: 0, ultCost: 6, duration: 8,
        desc: 'For 8s: +15% fire rate, +30% reload speed, +10% move speed. Kills during Overdrive restore 30 health.' },
    ],
  },
  specter: {
    id: 'specter', name: 'Specter', role: 'Recon', color: '#36c2ff', accent: '#9fe2ff', build: 'light',
    tagline: 'Information wins rounds. Sees what others try to hide.',
    abilities: [
      { id: 'seeker', name: 'Seeker Node', key: 'ab1', charges: 1, cooldown: 40, duration: 15, range: 15,
        desc: 'Place a scanner where you aim. Pulses 5 times, revealing enemies within 14m in its line of sight. Can be destroyed.' },
      { id: 'echo', name: 'Echo Sense', key: 'ab2', charges: 1, cooldown: 30, duration: 6, range: 20,
        desc: 'For 6s, enemies within 20m who are running (not walking or crouching) are revealed.' },
      { id: 'decoy', name: 'Phantom Decoy', key: 'ab3', charges: 1, cooldown: 30, duration: 5,
        desc: 'Send out a running hologram of yourself for 5s. It can be shot down.' },
      { id: 'overwatch', name: 'Overwatch', key: 'ult', charges: 1, cooldown: 0, ultCost: 7, duration: 4, range: 35,
        desc: 'Emit 3 wide pulses over 4s that reveal enemies within 35m to your whole team for 1.5s each.' },
    ],
  },
  bastion: {
    id: 'bastion', name: 'Bastion', role: 'Sentinel', color: '#9fe870', accent: '#d8f7bf', build: 'heavy',
    tagline: 'Holds the line. Turns any corner into a fortress.',
    abilities: [
      { id: 'barrier', name: 'Bulwark Barrier', key: 'ab1', charges: 1, cooldown: 40, duration: 25, range: 3,
        desc: 'Raise a 6m wide, 800 HP wall in front of you for 25s. Blocks movement and bullets.' },
      { id: 'caltrops', name: 'Caltrop Field', key: 'ab2', charges: 2, cooldown: 30, duration: 7, range: 18,
        desc: 'Deploy a 3.5m field where you aim. Enemies inside take 15 damage/s and are slowed 30%.' },
      { id: 'reinforce', name: 'Reinforce', key: 'ab3', charges: 1, cooldown: 45, duration: 15, range: 7,
        desc: 'You and allies within 7m gain a 30 point temporary shield for 15s.' },
      { id: 'sentry', name: 'Bastion Point', key: 'ult', charges: 1, cooldown: 0, ultCost: 7, duration: 25, range: 30,
        desc: 'Deploy a 350 HP sentry turret for 25s that fires at visible enemies within 30m.' },
    ],
  },
  medic: {
    id: 'medic', name: 'Medic', role: 'Support', color: '#f2f2f2', accent: '#4fe3c1', build: 'light',
    tagline: 'Keeps the team in the fight, round after round.',
    abilities: [
      { id: 'mend', name: 'Mend', key: 'ab1', charges: 2, cooldown: 25, duration: 3, range: 20,
        desc: 'Heal the ally in your crosshair (or yourself) for 60 health over 3s.' },
      { id: 'station', name: 'Aid Station', key: 'ab2', charges: 1, cooldown: 45, duration: 15, range: 4.5,
        desc: 'Drop a 120 HP station that heals allies within 4.5m for 12 health/s for 15s.' },
      { id: 'aegis', name: 'Aegis', key: 'ab3', charges: 1, cooldown: 35, duration: 8,
        desc: 'Give the ally in your crosshair (or yourself) a 40 point shield for 8s.' },
      { id: 'renewal', name: 'Renewal', key: 'ult', charges: 1, cooldown: 0, ultCost: 7, duration: 6, range: 25,
        desc: 'Fully heal allies within 25m and grant them 25% damage reduction for 6s.' },
    ],
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && v in CHARACTERS;
}
