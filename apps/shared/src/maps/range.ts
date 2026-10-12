import { MapBuilder } from './builder';
import type { MapDef } from './types';

/** PRACTICE RANGE — booth, shooting lanes and a movement course. */
export function buildRange(): MapDef {
  const m = new MapBuilder();
  m.arena(-24, 24, -60, 14, 9, 'floor', 'concrete');
  // shooting booth counters
  m.box(-18, 0, -2.4, -2, 1.05, -1.8, 'metal');
  m.box(2, 0, -2.4, 18, 1.05, -1.8, 'metal');
  // lane dividers (low)
  for (const x of [-12, 12]) m.box(x - 0.2, 0, -50, x + 0.2, 1.2, -6, 'trim');
  // back cover walls for targets
  m.box(-6, 0, -46, -2, 2, -45.4, 'concrete');
  m.box(4, 0, -38, 8, 1.2, -37.4, 'concrete');
  // movement course on the side
  m.stairs(18, -10, 23.5, -4, 1.8, '-z');
  m.platform(18, -24, 23.5, -10, 1.8);
  m.crate(20, -28, 1.2); m.crate(21.5, -31, 1.2, 0); m.crate(21.5, -31, 1.2, 1.2);
  m.crate(-20, -20, 1.4); m.crate(-20, -26, 1.4); m.crate(-21, -32, 2);
  m.add({ kind: 'neon', x: 0, y: 6, z: -59.6, w: 10, h: 1.6, color: 0xff5a36, facing: 'z+', text: 'PRACTICE RANGE' });
  for (const [z, t] of [[-10, '10m'], [-20, '20m'], [-30, '30m'], [-45, '45m']] as const) m.add({ kind: 'rangeMarker', x: -10, z, text: t });
  for (const [x, z] of [[-18, 8], [18, 8], [-18, -30], [18, -30], [0, -55]]) m.add({ kind: 'lamp', x, z, h: 6, color: 0xffe6c4 });
  m.add({ kind: 'light', x: 0, y: 6, z: -25, color: 0xffffff, intensity: 10, distance: 40 });

  return {
    id: 'range',
    name: 'Practice Range',
    description: 'Warm up your aim and learn recoil patterns.',
    bounds: { minX: -24, maxX: 24, minZ: -60, maxZ: 14 },
    solids: m.solids,
    spawnBarriers: [],
    attackSpawns: [{ x: 0, y: 0, z: 4 }],
    defendSpawns: [{ x: 0, y: 0, z: 4 }],
    attackYaw: 0,
    defendYaw: 0,
    attackZone: { minX: -24, maxX: 24, minY: -5, maxY: 20, minZ: -60, maxZ: 14 },
    defendZone: { minX: -24, maxX: 24, minY: -5, maxY: 20, minZ: -60, maxZ: 14 },
    sites: [],
    tdmSpawns: [{ x: 0, y: 0, z: 4, yaw: 0 }],
    decor: m.decor,
    env: {
      skyTop: 0x1a1d24, skyBottom: 0x545a66, fog: 0x2a2d33, fogDensity: 0.006,
      sunColor: 0xffffff, sunIntensity: 2, sunDir: { x: 0.3, y: 1, z: 0.4 },
      hemiSky: 0xbfd0e0, hemiGround: 0x34302c, hemiIntensity: 1, wet: false, time: 13, weather: 'clear',
    },
    targets: [
      { x: -8, z: -10, patrol: 0 }, { x: -4, z: -10, patrol: 0 }, { x: 4, z: -10, patrol: 0 }, { x: 8, z: -10, patrol: 0, crouch: true },
      { x: 0, z: -20, patrol: 8 }, { x: -6, z: -28, patrol: 4 }, { x: 6, z: -30, patrol: 5 },
      { x: -4, z: -44, patrol: 0 }, { x: 6, z: -36, patrol: 0, crouch: true }, { x: 0, z: -50, patrol: 9 },
    ],
    materials: ['floor', 'concrete', 'metal', 'crate', 'trim'],
  };
}
