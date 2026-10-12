import { MapBuilder } from './builder';
import type { MapDef } from './types';

/**
 * NEON HARBOR — a futuristic port at night. Container-yard mid, a covered
 * warehouse route to A, and an elevated crane platform overlooking B by the water.
 */
export function buildNeonHarbor(): MapDef {
  const m = new MapBuilder();
  // Floor & perimeter (east side is a dock railing above the water).
  m.box(-42, -1, -54, 40, 0, 54, 'asphalt');
  m.box(-41, 0, -53, -40, 9, 53, 'concrete');
  m.box(-40, 0, -53, 38, 9, -52, 'concrete');
  m.box(-40, 0, 52, 38, 9, 53, 'concrete');
  m.box(37.8, 0, -52, 38.2, 1.1, 52, 'trim');
  m.box(38.2, 0, -52, 39, 40, 52, 'concrete', true);
  m.box(-41, 9, -53, -40, 40, 53, 'concrete', true);
  m.box(-40, 9, -53, 38, 40, -52, 'concrete', true);
  m.box(-40, 9, 52, 38, 40, 53, 'concrete', true);

  // ── Attacker spawn ─────────────────────────────────────────
  m.wallX(-40, -30, -40, 7, 'concrete');
  m.wallX(-20, -6, -40, 7, 'concrete');
  m.wallX(6, 20, -40, 7, 'concrete');
  m.wallX(30, 38, -40, 7, 'concrete');
  m.barrier(-30, -20, -40);
  m.barrier(-6, 6, -40);
  m.barrier(20, 30, -40);
  m.container(-30, -48, true, 'containerGreen');
  m.crate(14, -47, 1.4);

  // ── Warehouse (covered route to A) ─────────────────────────
  m.wallX(-40, -30, -26, 7, 'brick');
  m.wallX(-26, -22, -26, 7, 'brick');
  m.wallX(-40, -36, 4, 7, 'brick');
  m.wallX(-31, -22, 4, 7, 'brick');
  m.wallZ(-26, -12, -22, 7, 'brick');
  m.wallZ(-8, 4, -22, 7, 'brick');
  m.box(-40, 6.4, -26.3, -21.7, 7, 4.3, 'metal');
  m.block(-35, -16, 1, 7, 3, 'metal');
  m.block(-29, -18, 1, 5, 3, 'metal');
  m.crate(-26, -4, 1.4); m.crate(-26, -4, 1.2, 1.4);
  m.crate(-37, -4, 1.2);
  m.crate(-33, -22, 1.4);

  // ── Container yard (mid) ───────────────────────────────────
  m.container(-12, -24, false, 'containerRed');
  m.container(-12, -24, false, 'containerBlue', 2.6);
  m.container(-3, -17, true, 'containerGreen');
  m.container(6, -26, false, 'containerYellow');
  m.container(13, -12, false, 'containerBlue');
  m.container(13, -12, false, 'containerRed', 2.6);
  m.container(-9, -6, true, 'containerYellow');
  m.container(2, -3, false, 'containerRed');
  m.container(9, 5, true, 'containerGreen');
  m.container(-7, 6, false, 'containerBlue');
  m.crate(-2, 10, 1.4);

  // ── East dock & crane platform ─────────────────────────────
  m.wallZ(-30, -18, 18, 4, 'brick');
  m.wallZ(-4, 8, 18, 4, 'brick');
  m.platform(30, -6, 37, 2, 3.6, 'metal');
  m.stairs(34, -14, 37, -6, 3.6, '+z');
  m.box(29.9, 3.6, -6, 30.1, 4.6, 2, 'trim');
  m.box(30, 3.6, 1.9, 37, 4.6, 2.1, 'trim');
  for (const [x, z] of [[30.4, -5.6], [30.4, 1.6]]) m.box(x - 0.2, 0, z - 0.2, x + 0.2, 3.3, z + 0.2, 'metal');
  m.container(25, -24, true, 'containerRed');
  m.crate(24, -8, 1.4);
  m.crate(26, 8, 1.2); m.crate(27.3, 8, 1.2);
  for (let z = -36; z <= 36; z += 12) m.block(36.8, z, 0.6, 0.6, 0.8, 'metal');

  // ── Mid-back dividers ──────────────────────────────────────
  m.block(0, 26, 14, 8, 7, 'brick');
  m.wallZ(12, 24, -17, 5, 'concrete');
  m.wallZ(28, 40, 15, 5, 'concrete');
  m.crate(-11, 16, 1.4);
  m.crate(9, 14, 1.4);

  // ── Site A ─────────────────────────────────────────────────
  m.container(-30, 22, true, 'containerRed');
  m.crate(-24, 28, 1.6);
  m.crate(-35, 30, 1.2); m.crate(-35, 30, 1.2, 1.2);
  m.block(-27, 16.5, 2, 2, 1.1, 'concrete');
  m.crate(-20, 33, 1.2);

  // ── Site B ─────────────────────────────────────────────────
  m.container(26, 26, false, 'containerBlue');
  m.crate(32, 22, 1.4);
  m.crate(21, 32, 1.2);
  m.block(31, 32, 3, 2, 1.8, 'metal');

  // ── Defender spawn ─────────────────────────────────────────
  m.wallX(-40, -28, 40, 7, 'concrete');
  m.wallX(-12, -4, 40, 7, 'concrete');
  m.wallX(4, 12, 40, 7, 'concrete');
  m.wallX(28, 38, 40, 7, 'concrete');
  m.crate(-20, 47, 1.4);
  m.container(24, 47, true, 'containerYellow');

  // ── Decor ──────────────────────────────────────────────────
  const pink = 0xff2e88, cyan = 0x2ee6ff, violet = 0xa36bff, amber = 0xffb347;
  m.add({ kind: 'water', x1: 38, z1: -120, x2: 160, z2: 120, y: -1.4 });
  m.add({ kind: 'siteMarker', site: 'A', x: -28, y: 0.02, z: 25 });
  m.add({ kind: 'siteMarker', site: 'B', x: 31, y: 0.02, z: 27 });
  m.add({ kind: 'neon', x: 0, y: 5.2, z: 22 - 0.05, w: 7, h: 1.4, color: pink, facing: 'z-', text: 'HARBOR 9' });
  m.add({ kind: 'neon', x: -22 + 0.35, y: 5, z: -2, w: 3.2, h: 1, color: cyan, facing: 'x+', text: 'DEPOT' });
  m.add({ kind: 'neon', x: -30, y: 5, z: -26 - 0.35, w: 4, h: 1, color: violet, facing: 'z-', text: 'WAREHOUSE' });
  m.add({ kind: 'neon', x: -17 + 0.35, y: 3.6, z: 18, w: 2.6, h: 0.9, color: amber, facing: 'x+', text: 'SITE A' });
  m.add({ kind: 'neon', x: 15 - 0.35, y: 3.6, z: 34, w: 2.6, h: 0.9, color: amber, facing: 'x-', text: 'SITE B' });
  m.add({ kind: 'neon', x: 7 + 0.05, y: 4.8, z: 26, w: 4, h: 1, color: cyan, facing: 'x+', text: 'NEON' });
  m.add({ kind: 'neon', x: -7 - 0.05, y: 4.8, z: 26, w: 4, h: 1, color: pink, facing: 'x-', text: 'DOCKS' });
  m.add({ kind: 'crane', x: 34, z: -1, h: 20, yaw: -0.4 });
  m.add({ kind: 'crane', x: 34, z: 44, h: 22, yaw: 0.9 });
  for (const [x, z, c] of [[-36, -10, cyan], [-28, -20, violet], [-34, 0, pink]] as const)
    m.add({ kind: 'light', x, y: 5.8, z, color: c, intensity: 8, distance: 14 });
  for (const [x, z] of [[-10, -34], [10, -34], [-16, 0], [16, -2], [30, -20], [30, 14], [-30, 34], [24, 38], [0, 46], [-30, -46], [30, -46]])
    m.add({ kind: 'lamp', x, z, h: 5.5, color: 0x9fe2ff });
  for (const [x, z] of [[-12, -24], [13, -12]]) m.add({ kind: 'beacon', x, y: 5.4, z, color: 0xff3b2f });
  m.add({ kind: 'pipe', x1: -39.4, y1: 5, z1: -26, x2: -39.4, y2: 5, z2: 4, r: 0.25, color: 0x5a5f66 });

  const attackSpawns = [];
  for (let i = 0; i < 16; i++) attackSpawns.push({ x: -4.8 + (i % 5) * 2.4, y: 0, z: -43.5 - Math.floor(i / 5) * 2.4 });
  const defendSpawns = [];
  for (let i = 0; i < 16; i++) defendSpawns.push({ x: -4.8 + (i % 5) * 2.4, y: 0, z: 43.5 + Math.floor(i / 5) * 2.4 });

  return {
    id: 'harbor',
    name: 'Neon Harbor',
    description: 'A rain-slick port at night: container alleys, a covered warehouse and a crane overwatch.',
    bounds: { minX: -40, maxX: 38, minZ: -52, maxZ: 52 },
    solids: m.solids,
    spawnBarriers: m.barriers,
    attackSpawns,
    defendSpawns,
    attackYaw: Math.PI,
    defendYaw: 0,
    attackZone: { minX: -40, maxX: 38, minY: -5, maxY: 20, minZ: -52, maxZ: -39.5 },
    defendZone: { minX: -40, maxX: 38, minY: -5, maxY: 20, minZ: 40, maxZ: 52 },
    sites: [
      { id: 'A', zone: { minX: -39, maxX: -18, minY: -1, maxY: 6, minZ: 13, maxZ: 36 }, center: { x: -28, y: 0, z: 25 } },
      { id: 'B', zone: { minX: 16, maxX: 37, minY: -1, maxY: 6, minZ: 16, maxZ: 38 }, center: { x: 31, y: 0, z: 27 } },
    ],
    tdmSpawns: [
      { x: -25, y: 0, z: -46, yaw: Math.PI }, { x: 25, y: 0, z: -46, yaw: Math.PI }, { x: 0, y: 0, z: -46, yaw: Math.PI },
      { x: -25, y: 0, z: 46, yaw: 0 }, { x: 15, y: 0, z: 46, yaw: 0 }, { x: 0, y: 0, z: 46, yaw: 0 },
      { x: -31, y: 0, z: -10, yaw: Math.PI }, { x: 27, y: 0, z: -14, yaw: Math.PI }, { x: 0, y: 0, z: -34, yaw: Math.PI },
      { x: -8, y: 0, z: 34, yaw: 0 }, { x: 26, y: 0, z: 16, yaw: 0 }, { x: -30, y: 0, z: 30, yaw: 0 },
    ],
    decor: m.decor,
    env: {
      skyTop: 0x05060d, skyBottom: 0x1d1033, fog: 0x120d1f, fogDensity: 0.018,
      sunColor: 0x8fa8ff, sunIntensity: 0.8, sunDir: { x: 0.4, y: 0.9, z: -0.3 },
      hemiSky: 0x5a4c9a, hemiGround: 0x101018, hemiIntensity: 0.75, wet: true, time: 22.5, weather: 'rain',
    },
    materials: ['asphalt', 'concrete', 'brick', 'metal', 'crate', 'trim', 'containerRed', 'containerBlue', 'containerYellow', 'containerGreen'],
  };
}
