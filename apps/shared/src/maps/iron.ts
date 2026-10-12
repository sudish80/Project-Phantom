import { MapBuilder } from './builder';
import type { MapDef } from './types';

/**
 * IRON DISTRICT — futuristic industrial district.
 * Attackers spawn south (-Z), defenders north (+Z). Three lanes (A long, Mid, B)
 * lead to two plant sites. Covered service corridors connect the lanes.
 */
export function buildIronDistrict(): MapDef {
  const m = new MapBuilder();
  m.arena(-44, 44, -56, 56, 10, 'floor', 'concrete');

  // ── Attacker spawn & barriers ──────────────────────────────
  m.wallX(-44, -40, -40, 7);
  m.wallX(-26, -6, -40, 7);
  m.wallX(6, 26, -40, 7);
  m.wallX(40, 44, -40, 7);
  m.barrier(-40, -26, -40);
  m.barrier(-6, 6, -40);
  m.barrier(26, 40, -40);
  m.crate(-20, -48, 1.4); m.crate(-18.6, -48, 1.4); m.crate(-19.3, -48, 1.2, 1.4);
  m.crate(20, -50, 1.4);
  m.container(34, -50, true, 'containerBlue');

  // ── Staging area ───────────────────────────────────────────
  m.container(0, -33.5, true, 'containerBlue');
  m.crate(-15, -34, 1.4); m.crate(-13.5, -34, 1.4);
  m.crate(15, -35, 1.6);
  m.block(-33, -35, 3, 1, 1.1, 'concrete');
  m.block(33, -33, 1, 3, 1.1, 'concrete');

  // ── Lane separating blocks with covered service corridors ───
  m.box(-24, 0, -30, -8, 7, -12, 'concrete');
  m.box(-24, 0, -7, -8, 7, 10, 'concrete');
  m.box(-24, 3.6, -12, -8, 4.4, -7, 'metal');
  m.box(8, 0, -30, 24, 7, -2, 'brick');
  m.box(8, 0, 3, 24, 7, 10, 'brick');
  m.box(8, 3.6, -2, 24, 4.4, 3, 'metal');

  // ── A long ─────────────────────────────────────────────────
  m.container(-30, -22, false, 'containerRed');
  m.container(-37, -8, true, 'containerYellow');
  m.crate(-28, 2, 1.2); m.crate(-28, 2, 1.2, 1.2); m.crate(-26.6, 2.2, 1.2);
  m.crate(-34, 8, 1.4);
  // catwalk with stairs
  m.stairs(-44, -30, -41, -24, 3, '+z');
  m.platform(-44, -24, -40, 6, 3);
  m.box(-40.1, 3, -24, -39.9, 4, -2, 'trim');
  m.box(-40.1, 3, 1, -39.9, 4, 6, 'trim');
  for (const z of [-20, -10, 0]) m.box(-40.5, 0, z - 0.2, -40.1, 2.7, z + 0.2, 'metal');

  // ── Mid ────────────────────────────────────────────────────
  m.box(-5, 0, -16, 1, 1.1, -15.4, 'concrete');
  m.crate(4, -22, 1.2); m.crate(4, -22, 1.2, 1.2); m.crate(5.3, -22, 1.2);
  m.box(-1.5, 0, -4, 1.5, 5, -1, 'concrete');
  m.crate(-5, 4, 1.4);
  m.crate(5.5, 7, 1.2);

  // ── B long ─────────────────────────────────────────────────
  m.container(30, -24, false, 'containerBlue');
  m.container(30, -24, false, 'containerGreen', 2.6);
  m.block(36, -8, 4, 4, 3.2, 'metal');
  m.container(28, 0, true, 'containerRed');
  m.stairs(41, -22, 44, -16, 2.4, '+z');
  m.platform(38, -16, 44, -4, 2.4);
  m.box(37.9, 2.4, -16, 38.1, 3.4, -4, 'trim');
  m.crate(26, 8, 1.4);

  // ── Site region dividers ───────────────────────────────────
  m.wallZ(12, 26, -16, 6);
  m.wallZ(28, 40, 16, 6);
  m.block(0, 27, 12, 10, 6, 'brick');
  m.crate(-10, 16, 1.4);
  m.crate(10, 18, 1.4); m.crate(11.4, 18, 1.2);
  m.box(-3, 0, 14, 3, 1.1, 14.6, 'concrete');

  // ── Site A ─────────────────────────────────────────────────
  m.crate(-30, 25, 2.4); m.crate(-30, 25, 1.2, 2.4);
  m.crate(-24, 31, 1.6);
  m.container(-36, 19, true, 'containerRed');
  m.platform(-44, 33, -37, 40, 2.1, 'metal');
  m.stairs(-37, 36.5, -33, 40, 2.1, '-x');
  m.box(-37.1, 2.1, 33, -36.9, 3.1, 36.5, 'trim');
  m.crate(-21, 20, 1.2);

  // ── Site B ─────────────────────────────────────────────────
  m.block(30, 26, 4, 4, 2.2, 'metal');
  m.container(25, 33, true, 'containerYellow');
  m.crate(36, 20, 1.4);
  m.crate(22, 22, 1.2);
  m.crate(37, 33, 1.6);

  // ── Defender spawn ─────────────────────────────────────────
  m.wallX(-44, -30, 40, 7);
  m.wallX(-14, -4, 40, 7);
  m.wallX(4, 14, 40, 7);
  m.wallX(30, 44, 40, 7);
  m.crate(-20, 48, 1.4);
  m.crate(20, 50, 1.4); m.crate(21.4, 50, 1.4);

  // ── Decor ──────────────────────────────────────────────────
  const orange = 0xff5a36, cyan = 0x36c2ff, amber = 0xffb347;
  m.add({ kind: 'siteMarker', site: 'A', x: -25, y: 0.02, z: 22 });
  m.add({ kind: 'siteMarker', site: 'B', x: 25, y: 0.02, z: 22 });
  m.add({ kind: 'neon', x: -8 + 0.05, y: 5, z: -20, w: 4, h: 1, color: orange, facing: 'x+', text: 'IRON-07' });
  m.add({ kind: 'neon', x: 8 - 0.05, y: 5, z: -14, w: 4, h: 1, color: cyan, facing: 'x-', text: 'SECTOR B' });
  m.add({ kind: 'neon', x: 0, y: 4.6, z: 22 - 0.05, w: 5, h: 1.1, color: orange, facing: 'z-', text: 'FOUNDRY' });
  m.add({ kind: 'neon', x: -16 + 0.35, y: 4.6, z: 18, w: 3, h: 1, color: amber, facing: 'x+', text: 'SITE A' });
  m.add({ kind: 'neon', x: 16 - 0.35, y: 4.6, z: 34, w: 3, h: 1, color: amber, facing: 'x-', text: 'SITE B' });
  m.add({ kind: 'neon', x: 0, y: 4.2, z: -1 + 0.05, w: 2.4, h: 0.8, color: cyan, facing: 'z+', text: 'MID' });
  m.add({ kind: 'fan', x: 36, y: 3.25, z: -8, r: 1.6, speed: 4 });
  m.add({ kind: 'fan', x: 30, y: 2.25, z: 26, r: 1.5, speed: 6 });
  m.add({ kind: 'pipe', x1: -43.4, y1: 6, z1: -40, x2: -43.4, y2: 6, z2: 40, r: 0.25, color: 0x6b6f75 });
  m.add({ kind: 'pipe', x1: 43.4, y1: 5.5, z1: -40, x2: 43.4, y2: 5.5, z2: 40, r: 0.3, color: 0x7a5a3a });
  m.add({ kind: 'pipe', x1: -24, y1: 6.2, z1: -30.4, x2: -8, y2: 6.2, z2: -30.4, r: 0.2, color: 0x8a8f96 });
  m.add({ kind: 'pipe', x1: 8, y1: 6.4, z1: -30.4, x2: 24, y2: 6.4, z2: -30.4, r: 0.2, color: 0x8a8f96 });
  for (const [x, z] of [[-34, -36], [0, -44], [34, -36], [-12, 0], [12, 12], [-30, 12], [32, 12], [0, 46], [-36, 46], [36, 46]])
    m.add({ kind: 'lamp', x, z, h: 5.5, color: 0xffd9a8 });
  m.add({ kind: 'light', x: -16, y: 3, z: -9.5, color: orange, intensity: 6, distance: 12 });
  m.add({ kind: 'light', x: 16, y: 3, z: 0.5, color: cyan, intensity: 6, distance: 12 });
  m.add({ kind: 'beacon', x: 0, y: 6.3, z: 27, color: 0xff3b2f });
  m.add({ kind: 'beacon', x: -36, y: 7.2, z: -40, color: 0xff3b2f });
  m.add({ kind: 'beacon', x: 36, y: 7.2, z: -40, color: 0xff3b2f });
  m.add({ kind: 'crane', x: 0, z: 52, h: 18, yaw: 0.6 });

  const attackSpawns = [];
  for (let i = 0; i < 16; i++) attackSpawns.push({ x: -4.8 + (i % 5) * 2.4, y: 0, z: -46 - Math.floor(i / 5) * 2.4 });
  const defendSpawns = [];
  for (let i = 0; i < 16; i++) defendSpawns.push({ x: -4.8 + (i % 5) * 2.4, y: 0, z: 46 + Math.floor(i / 5) * 2.4 });

  return {
    id: 'iron',
    name: 'Iron District',
    description: 'A futuristic foundry district of concrete blocks, catwalks and covered service corridors.',
    bounds: { minX: -44, maxX: 44, minZ: -56, maxZ: 56 },
    solids: m.solids,
    spawnBarriers: m.barriers,
    attackSpawns,
    defendSpawns,
    attackYaw: Math.PI,
    defendYaw: 0,
    attackZone: { minX: -44, maxX: 44, minY: -5, maxY: 20, minZ: -56, maxZ: -39.5 },
    defendZone: { minX: -44, maxX: 44, minY: -5, maxY: 20, minZ: 40, maxZ: 56 },
    sites: [
      { id: 'A', zone: { minX: -40, maxX: -17, minY: -1, maxY: 6, minZ: 15, maxZ: 36 }, center: { x: -25, y: 0, z: 22 } },
      { id: 'B', zone: { minX: 17, maxX: 40, minY: -1, maxY: 6, minZ: 15, maxZ: 36 }, center: { x: 25, y: 0, z: 22 } },
    ],
    tdmSpawns: [
      { x: -34, y: 0, z: -46, yaw: Math.PI }, { x: 34, y: 0, z: -46, yaw: Math.PI }, { x: 0, y: 0, z: -48, yaw: Math.PI },
      { x: -34, y: 0, z: 48, yaw: 0 }, { x: 34, y: 0, z: 48, yaw: 0 }, { x: 0, y: 0, z: 48, yaw: 0 },
      { x: -32, y: 0, z: -14, yaw: Math.PI }, { x: 32, y: 0, z: -12, yaw: Math.PI },
      { x: 0, y: 0, z: -26, yaw: Math.PI }, { x: -10, y: 0, z: 30, yaw: 0 }, { x: 10, y: 0, z: 14, yaw: Math.PI / 2 },
      { x: -28, y: 0, z: 34, yaw: Math.PI / 2 }, { x: 34, y: 0, z: 24, yaw: -Math.PI / 2 },
    ],
    decor: m.decor,
    env: {
      skyTop: 0x1a1d24, skyBottom: 0x6b5a4e, fog: 0x3a3532, fogDensity: 0.011,
      sunColor: 0xffd1a1, sunIntensity: 2.2, sunDir: { x: -0.5, y: 0.8, z: 0.35 },
      hemiSky: 0x9fb3c8, hemiGround: 0x3a3028, hemiIntensity: 0.9, wet: false, time: 17.4, weather: 'clear',
    },
    materials: ['floor', 'concrete', 'brick', 'metal', 'crate', 'trim', 'containerRed', 'containerBlue', 'containerYellow', 'containerGreen'],
  };
}
