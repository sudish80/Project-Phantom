/** Cosmetic weapon skins. Energy skins drive animated emissive shaders, particles, light and trails on the client. */
export interface EnergySpec {
  /** colours cycled across the weapon over time */
  colors: number[];
  pattern: 'circuit' | 'waves' | 'hex' | 'veins';
  /** colour cycling speed */
  speed: number;
}

export interface WeaponSkin {
  id: string;
  name: string;
  body: number;
  accent: number;
  energy?: EnergySpec;
}

export const WEAPON_SKINS: WeaponSkin[] = [
  { id: 'standard', name: 'Standard Issue', body: 0, accent: 0 },
  { id: 'ember', name: 'Ember', body: 0x3a1d16, accent: 0xff5a1f },
  { id: 'glacier', name: 'Glacier', body: 0xc9d6df, accent: 0x36c2ff },
  { id: 'carbon', name: 'Carbon', body: 0x101112, accent: 0x9b9fa6 },
  { id: 'verdant', name: 'Verdant', body: 0x1e2a1f, accent: 0x9fe870 },
  { id: 'prism', name: 'Prism Flux', body: 0x0d0b14, accent: 0xb44dff, energy: { colors: [0x8a2be2, 0x2f6bff, 0xff3ea5, 0xff2d2d], pattern: 'circuit', speed: 0.18 } },
  { id: 'nebula', name: 'Nebula Drift', body: 0x07080f, accent: 0x5ad1ff, energy: { colors: [0x2a1b7a, 0x5ad1ff, 0xd06bff, 0x1fe0c4], pattern: 'veins', speed: 0.1 } },
  { id: 'inferno', name: 'Inferno Core', body: 0x120806, accent: 0xff6a1a, energy: { colors: [0xff2a00, 0xff9a1a, 0xffe14d, 0xff3d6e], pattern: 'waves', speed: 0.25 } },
  { id: 'aurora', name: 'Aurora Lattice', body: 0x081210, accent: 0x52ffb0, energy: { colors: [0x22ff9a, 0x26c6ff, 0x9a5cff, 0x52ffb0], pattern: 'hex', speed: 0.14 } },
];

export function getSkin(id: string | undefined): WeaponSkin {
  return WEAPON_SKINS.find((s) => s.id === id) ?? WEAPON_SKINS[0];
}

export function isSkinId(v: unknown): v is string {
  return typeof v === 'string' && WEAPON_SKINS.some((s) => s.id === v);
}
