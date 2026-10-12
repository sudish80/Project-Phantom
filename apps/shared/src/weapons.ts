export type WeaponId =
  | 'wisp'
  | 'magistrate'
  | 'hornet'
  | 'corsair'
  | 'lancer'
  | 'longwatch'
  | 'breacher'
  | 'bulwark'
  | 'edge'
  | 'glock'
  | 'deagle'
  | 'mp5'
  | 'p90'
  | 'ak47'
  | 'm4a1'
  | 'scarl'
  | 'svd'
  | 'barrett'
  | 'spas'
  | 'aa12'
  | 'm249';

export type WeaponCategory = 'sidearm' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'heavy' | 'melee';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  category: WeaponCategory;
  /** 1 primary, 2 sidearm, 3 melee */
  slot: 1 | 2 | 3;
  price: number;
  desc: string;
  damage: { head: number; body: number; leg: number };
  /** damage multiplier falls linearly from 1 at `start` to `min` at `end` metres */
  falloff: { start: number; end: number; min: number };
  range: number;
  fireRate: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reloadTime: number;
  equipTime: number;
  pellets: number;
  spread: { base: number; move: number; air: number; crouchMul: number; adsMul: number; perShot: number; max: number };
  /** recoil: vertical kick per shot (rad), cap, horizontal sway amplitude, recovery (shots/sec) */
  recoil: { v: number; maxV: number; h: number; recovery: number };
  ads: { zoom: number; moveMul: number; scope: boolean } | null;
  moveMul: number;
  /** viewmodel + audio styling */
  look: { length: number; bulk: number; barrel: number; color: number; accent: number };
  sound: { pitch: number; punch: number; tail: number };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  wisp: {
    id: 'wisp', name: 'Wisp', category: 'sidearm', slot: 2, price: 0,
    desc: 'Standard-issue compact sidearm. Accurate first shot, forgiving in a pinch.',
    damage: { head: 78, body: 26, leg: 22 }, falloff: { start: 30, end: 50, min: 0.85 }, range: 120,
    fireRate: 6.75, auto: false, mag: 12, reserve: 36, reloadTime: 1.75, equipTime: 0.75, pellets: 1,
    spread: { base: 0.004, move: 0.03, air: 0.12, crouchMul: 0.8, adsMul: 0.6, perShot: 0.006, max: 0.05 },
    recoil: { v: 0.012, maxV: 0.05, h: 0.006, recovery: 6 },
    ads: { zoom: 1.15, moveMul: 0.85, scope: false }, moveMul: 1,
    look: { length: 0.22, bulk: 0.05, barrel: 0.1, color: 0x3b3f45, accent: 0xff5a36 },
    sound: { pitch: 1.35, punch: 0.5, tail: 0.25 },
  },
  magistrate: {
    id: 'magistrate', name: 'Magistrate', category: 'sidearm', slot: 2, price: 800,
    desc: 'Heavy revolver-style sidearm. One clean headshot ends the duel.',
    damage: { head: 159, body: 55, leg: 47 }, falloff: { start: 30, end: 50, min: 0.85 }, range: 120,
    fireRate: 3.6, auto: false, mag: 6, reserve: 24, reloadTime: 2.25, equipTime: 1, pellets: 1,
    spread: { base: 0.003, move: 0.04, air: 0.15, crouchMul: 0.8, adsMul: 0.5, perShot: 0.02, max: 0.07 },
    recoil: { v: 0.05, maxV: 0.1, h: 0.012, recovery: 3 },
    ads: { zoom: 1.25, moveMul: 0.8, scope: false }, moveMul: 1,
    look: { length: 0.28, bulk: 0.06, barrel: 0.16, color: 0x2a2c30, accent: 0xd2a24c },
    sound: { pitch: 0.85, punch: 1, tail: 0.6 },
  },
  hornet: {
    id: 'hornet', name: 'Hornet', category: 'smg', slot: 1, price: 1600,
    desc: 'Rapid-fire submachine gun. Excellent on the move at close range.',
    damage: { head: 67, body: 27, leg: 22 }, falloff: { start: 15, end: 35, min: 0.75 }, range: 80,
    fireRate: 13.3, auto: true, mag: 30, reserve: 90, reloadTime: 2.25, equipTime: 0.75, pellets: 1,
    spread: { base: 0.008, move: 0.014, air: 0.1, crouchMul: 0.85, adsMul: 0.7, perShot: 0.002, max: 0.05 },
    recoil: { v: 0.006, maxV: 0.06, h: 0.016, recovery: 10 },
    ads: { zoom: 1.15, moveMul: 0.85, scope: false }, moveMul: 1,
    look: { length: 0.42, bulk: 0.07, barrel: 0.12, color: 0x34383d, accent: 0x36c2ff },
    sound: { pitch: 1.25, punch: 0.55, tail: 0.25 },
  },
  corsair: {
    id: 'corsair', name: 'Corsair', category: 'rifle', slot: 1, price: 2900,
    desc: 'Balanced assault rifle with a controllable spray and slight damage falloff.',
    damage: { head: 156, body: 39, leg: 33 }, falloff: { start: 15, end: 30, min: 0.82 }, range: 150,
    fireRate: 9.9, auto: true, mag: 30, reserve: 90, reloadTime: 2.5, equipTime: 1, pellets: 1,
    spread: { base: 0.0025, move: 0.045, air: 0.15, crouchMul: 0.8, adsMul: 0.7, perShot: 0.003, max: 0.045 },
    recoil: { v: 0.0095, maxV: 0.085, h: 0.018, recovery: 9 },
    ads: { zoom: 1.25, moveMul: 0.76, scope: false }, moveMul: 0.95,
    look: { length: 0.62, bulk: 0.08, barrel: 0.18, color: 0x2e3135, accent: 0xff5a36 },
    sound: { pitch: 1.0, punch: 0.8, tail: 0.45 },
  },
  lancer: {
    id: 'lancer', name: 'Lancer', category: 'rifle', slot: 1, price: 3100,
    desc: 'High-damage precision rifle. No falloff, punishing recoil.',
    damage: { head: 160, body: 40, leg: 34 }, falloff: { start: 999, end: 1000, min: 1 }, range: 160,
    fireRate: 9.25, auto: true, mag: 25, reserve: 75, reloadTime: 2.5, equipTime: 1, pellets: 1,
    spread: { base: 0.0025, move: 0.05, air: 0.16, crouchMul: 0.8, adsMul: 0.7, perShot: 0.004, max: 0.055 },
    recoil: { v: 0.013, maxV: 0.11, h: 0.026, recovery: 8 },
    ads: { zoom: 1.25, moveMul: 0.76, scope: false }, moveMul: 0.95,
    look: { length: 0.66, bulk: 0.085, barrel: 0.2, color: 0x24262a, accent: 0xe8e2d4 },
    sound: { pitch: 0.92, punch: 0.95, tail: 0.5 },
  },
  longwatch: {
    id: 'longwatch', name: 'Longwatch', category: 'sniper', slot: 1, price: 4600,
    desc: 'Bolt-action sniper rifle. Scope in and hold still for pinpoint accuracy.',
    damage: { head: 255, body: 150, leg: 120 }, falloff: { start: 999, end: 1000, min: 1 }, range: 250,
    fireRate: 0.65, auto: false, mag: 5, reserve: 10, reloadTime: 3.6, equipTime: 1.25, pellets: 1,
    spread: { base: 0.09, move: 0.2, air: 0.4, crouchMul: 0.9, adsMul: 0, perShot: 0, max: 0.4 },
    recoil: { v: 0.07, maxV: 0.07, h: 0.0, recovery: 2 },
    ads: { zoom: 3.5, moveMul: 0.5, scope: true }, moveMul: 0.9,
    look: { length: 0.85, bulk: 0.09, barrel: 0.32, color: 0x1f2a24, accent: 0x9fe870 },
    sound: { pitch: 0.6, punch: 1.4, tail: 1.2 },
  },
  breacher: {
    id: 'breacher', name: 'Breacher', category: 'shotgun', slot: 1, price: 1850,
    desc: 'Pump-action shotgun. Devastating within a few metres, useless beyond.',
    damage: { head: 34, body: 17, leg: 14 }, falloff: { start: 6, end: 16, min: 0.25 }, range: 40,
    fireRate: 1.1, auto: false, mag: 6, reserve: 18, reloadTime: 2.6, equipTime: 1, pellets: 12,
    spread: { base: 0.07, move: 0.01, air: 0.03, crouchMul: 1, adsMul: 0.85, perShot: 0, max: 0.09 },
    recoil: { v: 0.06, maxV: 0.06, h: 0.0, recovery: 3 },
    ads: { zoom: 1.1, moveMul: 0.8, scope: false }, moveMul: 0.95,
    look: { length: 0.6, bulk: 0.1, barrel: 0.22, color: 0x3a2f28, accent: 0xff9a3c },
    sound: { pitch: 0.7, punch: 1.3, tail: 0.7 },
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', category: 'heavy', slot: 1, price: 3200,
    desc: 'Heavy machine gun. Huge magazine, slow handling, suppressive fire.',
    damage: { head: 95, body: 34, leg: 29 }, falloff: { start: 20, end: 40, min: 0.85 }, range: 140,
    fireRate: 12, auto: true, mag: 80, reserve: 160, reloadTime: 4.8, equipTime: 1.25, pellets: 1,
    spread: { base: 0.012, move: 0.06, air: 0.2, crouchMul: 0.65, adsMul: 0.6, perShot: 0.0015, max: 0.06 },
    recoil: { v: 0.004, maxV: 0.05, h: 0.03, recovery: 7 },
    ads: { zoom: 1.2, moveMul: 0.7, scope: false }, moveMul: 0.85,
    look: { length: 0.75, bulk: 0.12, barrel: 0.22, color: 0x2d3127, accent: 0xff5a36 },
    sound: { pitch: 0.8, punch: 1.0, tail: 0.5 },
  },
  edge: {
    id: 'edge', name: 'Edge', category: 'melee', slot: 3, price: 0,
    desc: 'Tactical combat blade. Fast to equip, silent and quick.',
    damage: { head: 50, body: 50, leg: 50 }, falloff: { start: 999, end: 1000, min: 1 }, range: 2.4,
    fireRate: 1.6, auto: true, mag: 0, reserve: 0, reloadTime: 0, equipTime: 0.4, pellets: 1,
    spread: { base: 0, move: 0, air: 0, crouchMul: 1, adsMul: 1, perShot: 0, max: 0 },
    recoil: { v: 0, maxV: 0, h: 0, recovery: 10 },
    ads: null, moveMul: 1.08,
    look: { length: 0.3, bulk: 0.03, barrel: 0, color: 0xb9bcc2, accent: 0xff5a36 },
    sound: { pitch: 1.6, punch: 0.2, tail: 0.1 },
  },
  glock: {
    id: 'glock', name: 'G17', category: 'sidearm', slot: 2, price: 500,
    desc: 'Duty 9 mm pistol. Large magazine, low recoil, quick to draw.',
    damage: { head: 122, body: 30, leg: 25 }, falloff: { start: 25, end: 45, min: 0.8 }, range: 120,
    fireRate: 7.5, auto: false, mag: 17, reserve: 51, reloadTime: 1.6, equipTime: 0.6, pellets: 1,
    spread: { base: 0.005, move: 0.028, air: 0.12, crouchMul: 0.8, adsMul: 0.6, perShot: 0.005, max: 0.05 },
    recoil: { v: 0.011, maxV: 0.045, h: 0.007, recovery: 7 },
    ads: { zoom: 1.15, moveMul: 0.85, scope: false }, moveMul: 1,
    look: { length: 0.21, bulk: 0.05, barrel: 0.09, color: 0x2b2e33, accent: 0x9aa4b2 },
    sound: { pitch: 1.3, punch: 0.5, tail: 0.22 },
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', category: 'sidearm', slot: 2, price: 950,
    desc: 'Magnum semi-auto pistol. Massive single-shot damage, heavy kick.',
    damage: { head: 175, body: 62, leg: 53 }, falloff: { start: 35, end: 55, min: 0.8 }, range: 130,
    fireRate: 3.0, auto: false, mag: 7, reserve: 21, reloadTime: 2.4, equipTime: 1, pellets: 1,
    spread: { base: 0.004, move: 0.05, air: 0.18, crouchMul: 0.8, adsMul: 0.55, perShot: 0.025, max: 0.08 },
    recoil: { v: 0.06, maxV: 0.12, h: 0.016, recovery: 2.6 },
    ads: { zoom: 1.3, moveMul: 0.8, scope: false }, moveMul: 0.98,
    look: { length: 0.3, bulk: 0.065, barrel: 0.17, color: 0x1f2124, accent: 0xc9a24a },
    sound: { pitch: 0.8, punch: 1.15, tail: 0.7 },
  },
  mp5: {
    id: 'mp5', name: 'MP5', category: 'smg', slot: 1, price: 1500,
    desc: 'Classic submachine gun. Tight control and clean sights.',
    damage: { head: 72, body: 29, leg: 24 }, falloff: { start: 18, end: 38, min: 0.78 }, range: 90,
    fireRate: 12.5, auto: true, mag: 30, reserve: 90, reloadTime: 2.1, equipTime: 0.7, pellets: 1,
    spread: { base: 0.006, move: 0.012, air: 0.1, crouchMul: 0.85, adsMul: 0.7, perShot: 0.0018, max: 0.05 },
    recoil: { v: 0.006, maxV: 0.055, h: 0.014, recovery: 11 },
    ads: { zoom: 1.15, moveMul: 0.85, scope: false }, moveMul: 1,
    look: { length: 0.4, bulk: 0.068, barrel: 0.11, color: 0x2a2d31, accent: 0x6fd0ff },
    sound: { pitch: 1.28, punch: 0.5, tail: 0.22 },
  },
  p90: {
    id: 'p90', name: 'P90', category: 'smg', slot: 1, price: 2350,
    desc: 'Bullpup PDW. Fifty-round magazine and a blistering rate of fire.',
    damage: { head: 78, body: 26, leg: 21 }, falloff: { start: 14, end: 32, min: 0.72 }, range: 80,
    fireRate: 14.3, auto: true, mag: 50, reserve: 100, reloadTime: 2.8, equipTime: 0.8, pellets: 1,
    spread: { base: 0.01, move: 0.016, air: 0.11, crouchMul: 0.85, adsMul: 0.75, perShot: 0.0018, max: 0.055 },
    recoil: { v: 0.005, maxV: 0.05, h: 0.018, recovery: 12 },
    ads: { zoom: 1.2, moveMul: 0.82, scope: false }, moveMul: 0.98,
    look: { length: 0.38, bulk: 0.075, barrel: 0.1, color: 0x24262b, accent: 0x7ce0c0 },
    sound: { pitch: 1.35, punch: 0.45, tail: 0.2 },
  },
  ak47: {
    id: 'ak47', name: 'AK-47', category: 'rifle', slot: 1, price: 2700,
    desc: 'Hard-hitting assault rifle. Brutal per-shot damage, unforgiving recoil.',
    damage: { head: 158, body: 42, leg: 35 }, falloff: { start: 18, end: 36, min: 0.8 }, range: 150,
    fireRate: 9.5, auto: true, mag: 30, reserve: 90, reloadTime: 2.6, equipTime: 1, pellets: 1,
    spread: { base: 0.003, move: 0.05, air: 0.16, crouchMul: 0.8, adsMul: 0.72, perShot: 0.0035, max: 0.05 },
    recoil: { v: 0.012, maxV: 0.1, h: 0.024, recovery: 8 },
    ads: { zoom: 1.2, moveMul: 0.75, scope: false }, moveMul: 0.94,
    look: { length: 0.64, bulk: 0.085, barrel: 0.19, color: 0x3a2a1e, accent: 0xd6a85a },
    sound: { pitch: 0.95, punch: 0.95, tail: 0.5 },
  },
  m4a1: {
    id: 'm4a1', name: 'M4A1', category: 'rifle', slot: 1, price: 3100,
    desc: 'Modular carbine. Flat, predictable recoil for precise automatic fire.',
    damage: { head: 152, body: 37, leg: 31 }, falloff: { start: 20, end: 38, min: 0.84 }, range: 160,
    fireRate: 10.5, auto: true, mag: 30, reserve: 90, reloadTime: 2.3, equipTime: 0.95, pellets: 1,
    spread: { base: 0.0022, move: 0.042, air: 0.14, crouchMul: 0.78, adsMul: 0.65, perShot: 0.0028, max: 0.042 },
    recoil: { v: 0.0085, maxV: 0.08, h: 0.015, recovery: 9.5 },
    ads: { zoom: 1.25, moveMul: 0.78, scope: false }, moveMul: 0.95,
    look: { length: 0.6, bulk: 0.078, barrel: 0.18, color: 0x2c2f33, accent: 0x76b7ff },
    sound: { pitch: 1.05, punch: 0.78, tail: 0.42 },
  },
  scarl: {
    id: 'scarl', name: 'SCAR-H', category: 'rifle', slot: 1, price: 3400,
    desc: 'Battle rifle in 7.62 mm. Heavy rounds and heavy recoil, small magazine.',
    damage: { head: 160, body: 44, leg: 37 }, falloff: { start: 22, end: 40, min: 0.82 }, range: 160,
    fireRate: 8.4, auto: true, mag: 20, reserve: 60, reloadTime: 2.7, equipTime: 1.05, pellets: 1,
    spread: { base: 0.003, move: 0.05, air: 0.17, crouchMul: 0.8, adsMul: 0.7, perShot: 0.004, max: 0.052 },
    recoil: { v: 0.014, maxV: 0.11, h: 0.022, recovery: 7.5 },
    ads: { zoom: 1.3, moveMul: 0.74, scope: false }, moveMul: 0.92,
    look: { length: 0.68, bulk: 0.09, barrel: 0.2, color: 0x2a2620, accent: 0xb8a07a },
    sound: { pitch: 0.88, punch: 1, tail: 0.55 },
  },
  svd: {
    id: 'svd', name: 'SVD', category: 'sniper', slot: 1, price: 4300,
    desc: 'Semi-automatic marksman rifle. Scoped, one-shot to the torso, faster follow-ups than a bolt-action.',
    damage: { head: 210, body: 105, leg: 88 }, falloff: { start: 999, end: 1000, min: 1 }, range: 220,
    fireRate: 2.4, auto: false, mag: 10, reserve: 20, reloadTime: 3.1, equipTime: 1.2, pellets: 1,
    spread: { base: 0.012, move: 0.16, air: 0.35, crouchMul: 0.9, adsMul: 0, perShot: 0.02, max: 0.35 },
    recoil: { v: 0.05, maxV: 0.09, h: 0.01, recovery: 3 },
    ads: { zoom: 3.0, moveMul: 0.55, scope: true }, moveMul: 0.9,
    look: { length: 0.82, bulk: 0.088, barrel: 0.3, color: 0x2a241c, accent: 0xd0b070 },
    sound: { pitch: 0.68, punch: 1.25, tail: 1 },
  },
  barrett: {
    id: 'barrett', name: 'M82', category: 'sniper', slot: 1, price: 5000,
    desc: 'Anti-materiel rifle in .50 cal. One shot, one kill — if you can stand the weight.',
    damage: { head: 300, body: 200, leg: 160 }, falloff: { start: 999, end: 1000, min: 1 }, range: 300,
    fireRate: 0.55, auto: false, mag: 5, reserve: 10, reloadTime: 4.2, equipTime: 1.5, pellets: 1,
    spread: { base: 0.1, move: 0.22, air: 0.42, crouchMul: 0.9, adsMul: 0, perShot: 0, max: 0.42 },
    recoil: { v: 0.09, maxV: 0.09, h: 0, recovery: 1.6 },
    ads: { zoom: 4.5, moveMul: 0.45, scope: true }, moveMul: 0.85,
    look: { length: 0.95, bulk: 0.1, barrel: 0.36, color: 0x20242a, accent: 0xcfd6df },
    sound: { pitch: 0.5, punch: 1.6, tail: 1.5 },
  },
  spas: {
    id: 'spas', name: 'SPAS-12', category: 'shotgun', slot: 1, price: 2000,
    desc: 'Semi-automatic shotgun. Faster follow-up shots than a pump at mid range.',
    damage: { head: 40, body: 20, leg: 16 }, falloff: { start: 7, end: 18, min: 0.22 }, range: 45,
    fireRate: 2.2, auto: false, mag: 8, reserve: 24, reloadTime: 3, equipTime: 1.05, pellets: 12,
    spread: { base: 0.065, move: 0.01, air: 0.03, crouchMul: 1, adsMul: 0.82, perShot: 0, max: 0.085 },
    recoil: { v: 0.05, maxV: 0.06, h: 0, recovery: 3.5 },
    ads: { zoom: 1.1, moveMul: 0.8, scope: false }, moveMul: 0.95,
    look: { length: 0.62, bulk: 0.1, barrel: 0.23, color: 0x33302c, accent: 0xc06a3a },
    sound: { pitch: 0.72, punch: 1.25, tail: 0.65 },
  },
  aa12: {
    id: 'aa12', name: 'AA-12', category: 'shotgun', slot: 1, price: 3000,
    desc: 'Full-auto combat shotgun. Twenty shells of sustained close-range fire.',
    damage: { head: 30, body: 15, leg: 12 }, falloff: { start: 5, end: 14, min: 0.2 }, range: 40,
    fireRate: 5.5, auto: true, mag: 20, reserve: 20, reloadTime: 3.6, equipTime: 1.1, pellets: 8,
    spread: { base: 0.075, move: 0.012, air: 0.035, crouchMul: 1, adsMul: 0.85, perShot: 0.001, max: 0.095 },
    recoil: { v: 0.03, maxV: 0.055, h: 0.004, recovery: 4 },
    ads: { zoom: 1.08, moveMul: 0.8, scope: false }, moveMul: 0.92,
    look: { length: 0.58, bulk: 0.11, barrel: 0.2, color: 0x2c2e31, accent: 0x9aa0a8 },
    sound: { pitch: 0.78, punch: 1.1, tail: 0.5 },
  },
  m249: {
    id: 'm249', name: 'M249', category: 'heavy', slot: 1, price: 4200,
    desc: 'Squad automatic weapon. Hundred-round belt, punishing suppression, slow handling.',
    damage: { head: 92, body: 33, leg: 28 }, falloff: { start: 24, end: 44, min: 0.85 }, range: 150,
    fireRate: 12.5, auto: true, mag: 100, reserve: 100, reloadTime: 5.4, equipTime: 1.35, pellets: 1,
    spread: { base: 0.014, move: 0.06, air: 0.2, crouchMul: 0.6, adsMul: 0.58, perShot: 0.0012, max: 0.06 },
    recoil: { v: 0.004, maxV: 0.048, h: 0.028, recovery: 7 },
    ads: { zoom: 1.18, moveMul: 0.68, scope: false }, moveMul: 0.82,
    look: { length: 0.78, bulk: 0.12, barrel: 0.24, color: 0x282c26, accent: 0x8fae4a },
    sound: { pitch: 0.78, punch: 1, tail: 0.5 },
  },
};

export const WEAPON_LIST = Object.values(WEAPONS);
export const DEFAULT_SIDEARM: WeaponId = 'wisp';
export const MELEE: WeaponId = 'edge';

export type ArmorId = 'light' | 'heavy';
export const ARMORS: Record<ArmorId, { id: ArmorId; name: string; value: number; price: number; desc: string }> = {
  light: { id: 'light', name: 'Light Plating', value: 25, price: 400, desc: '25 armor. Absorbs 66% of incoming damage.' },
  heavy: { id: 'heavy', name: 'Heavy Plating', value: 50, price: 1000, desc: '50 armor. Absorbs 66% of incoming damage.' },
};

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && v in WEAPONS;
}

/** Damage multiplier for distance. */
export function falloffMul(w: WeaponDef, dist: number) {
  const f = w.falloff;
  if (dist <= f.start) return 1;
  if (dist >= f.end) return f.min;
  return 1 - (1 - f.min) * ((dist - f.start) / (f.end - f.start));
}

/** Deterministic recoil offset for a (fractional) consecutive-shot count. Shared by client & server. */
export function recoilOffset(w: WeaponDef, shots: number): { dp: number; dy: number } {
  if (shots <= 0) return { dp: 0, dy: 0 };
  const raw = shots * w.recoil.v;
  const dp = Math.min(raw, w.recoil.maxV);
  const ramp = Math.min(1, shots / 4);
  const over = Math.max(0, raw - w.recoil.maxV) / Math.max(w.recoil.v, 1e-6);
  const dy = w.recoil.h * (Math.sin(shots * 0.85) * ramp + (over > 0 ? 0.8 * Math.sin(over * 0.45) : 0));
  return { dp, dy };
}

export interface SpreadInput {
  speedH: number;
  onGround: boolean;
  crouch: number;
  ads: boolean;
  recoil: number;
}

export function computeSpread(w: WeaponDef, s: SpreadInput): number {
  let sp = w.spread.base + w.spread.perShot * Math.max(0, s.recoil - 1);
  const moveFrac = Math.min(1, Math.max(0, (s.speedH - 0.6) / 5));
  sp += w.spread.move * moveFrac;
  if (!s.onGround) sp += w.spread.air;
  if (s.crouch > 0.5) sp *= w.spread.crouchMul;
  if (s.ads && w.ads) {
    if (w.ads.scope) {
      // Scoped sniper: perfect only when (almost) still.
      sp = moveFrac > 0.05 || !s.onGround ? w.spread.move * moveFrac + (s.onGround ? 0 : w.spread.air) : 0;
    } else sp *= w.spread.adsMul;
  }
  return Math.min(sp, w.spread.max + w.spread.base + w.spread.move + w.spread.air);
}
