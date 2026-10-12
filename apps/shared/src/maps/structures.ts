import type { SurfaceMat, Vec3 } from '../types';
import type { MapBuilder } from './builder';
import type { Prop } from './types';

/** Floor-to-floor height of enterable buildings. */
export const STOREY = 3.4;

export type Side = 'n' | 's' | 'e' | 'w';

export interface BuildingOpts {
  wall: SurfaceMat;
  floor: SurfaceMat;
  roof: SurfaceMat;
  door: Side;
  /** second door side (through-building routes) */
  door2?: Side;
  furniture: 'home' | 'office' | 'shop' | 'industrial' | 'military' | 'none';
  roofAccess: boolean;
  pitched?: boolean;
  /** open-plan single tall hall (factories, hangars) */
  hall?: boolean;
  /** big open front (hangar door) */
  openFront?: boolean;
  interiorLights?: boolean;
}

export interface BuildingResult {
  loot: Vec3[];
  roofY: number;
  lights: Vec3[];
}

type Rand = () => number;

/** Wall along X at depth z with optional door gap centred at gx (world). */
function wallXWithDoor(m: MapBuilder, x1: number, x2: number, z: number, y0: number, h: number, mat: SurfaceMat, door: number | null, doorW = 1.6, doorH = 2.5, t = 0.3) {
  if (door === null) return void m.box(x1, y0, z - t / 2, x2, y0 + h, z + t / 2, mat);
  const a = door - doorW / 2, b = door + doorW / 2;
  if (a > x1) m.box(x1, y0, z - t / 2, a, y0 + h, z + t / 2, mat);
  if (b < x2) m.box(b, y0, z - t / 2, x2, y0 + h, z + t / 2, mat);
  if (doorH < h) m.box(a, y0 + doorH, z - t / 2, b, y0 + h, z + t / 2, mat);
}

function wallZWithDoor(m: MapBuilder, z1: number, z2: number, x: number, y0: number, h: number, mat: SurfaceMat, door: number | null, doorW = 1.6, doorH = 2.5, t = 0.3) {
  if (door === null) return void m.box(x - t / 2, y0, z1, x + t / 2, y0 + h, z2, mat);
  const a = door - doorW / 2, b = door + doorW / 2;
  if (a > z1) m.box(x - t / 2, y0, z1, x + t / 2, y0 + h, a, mat);
  if (b < z2) m.box(x - t / 2, y0, b, x + t / 2, y0 + h, z2, mat);
  if (doorH < h) m.box(x - t / 2, y0 + doorH, a, x + t / 2, y0 + h, b, mat);
}

/** Slab with a rectangular hole (stairwell). */
function slabWithHole(m: MapBuilder, x1: number, z1: number, x2: number, z2: number, y: number, thick: number, mat: SurfaceMat, hole: { x1: number; z1: number; x2: number; z2: number } | null) {
  if (!hole) return void m.box(x1, y - thick, z1, x2, y, z2, mat);
  if (hole.z1 > z1) m.box(x1, y - thick, z1, x2, y, hole.z1, mat);
  if (hole.z2 < z2) m.box(x1, y - thick, hole.z2, x2, y, z2, mat);
  if (hole.x1 > x1) m.box(x1, y - thick, hole.z1, hole.x1, y, hole.z2, mat);
  if (hole.x2 < x2) m.box(hole.x2, y - thick, hole.z1, x2, y, hole.z2, mat);
}

/**
 * Enterable building: foundation, per-storey walls with doors, floors with a stairwell,
 * stairs to every storey (and the roof when `roofAccess`), interior partition with doorway,
 * furniture, interior light positions and loot spots.
 */
export function building(m: MapBuilder, props: Prop[], r: Rand, x: number, z: number, w: number, d: number, floors: number, y0: number, o: BuildingOpts): BuildingResult {
  const x1 = x - w / 2, x2 = x + w / 2, z1 = z - d / 2, z2 = z + d / 2;
  const res: BuildingResult = { loot: [], roofY: 0, lights: [] };
  const base0 = y0 + 0.25;
  m.box(x1 - 0.2, y0 - 2.5, z1 - 0.2, x2 + 0.2, base0, z2 + 0.2, o.floor);

  if (o.hall) {
    const H = floors * STOREY + 2;
    const doorX = o.openFront ? null : x;
    // front (south) may be a full-width hangar opening
    if (o.openFront) {
      m.box(x1, base0 + H - 2, z1 - 0.15, x2, base0 + H, z1 + 0.15, o.wall);
      m.box(x1, base0, z1 - 0.15, x1 + 1.2, base0 + H, z1 + 0.15, o.wall);
      m.box(x2 - 1.2, base0, z1 - 0.15, x2, base0 + H, z1 + 0.15, o.wall);
    } else wallXWithDoor(m, x1, x2, z1, base0, H, o.wall, doorX, 3.2, 3.4);
    wallXWithDoor(m, x1, x2, z2, base0, H, o.wall, o.door2 ? x : null, 2, 2.6);
    wallZWithDoor(m, z1, z2, x1, base0, H, o.wall, z, 2, 2.6);
    wallZWithDoor(m, z1, z2, x2, base0, H, o.wall, o.door2 === 'e' ? z : null, 2, 2.6);
    m.box(x1 - 0.3, base0 + H, z1 - 0.3, x2 + 0.3, base0 + H + 0.4, z2 + 0.3, o.roof);
    // mezzanine catwalk with stairs along the back wall
    const my = base0 + 4;
    m.platform(x1 + 0.2, z2 - 3.2, x2 - 0.2, z2 - 0.2, my, 'metal', 0.25);
    m.stairs(x1 + 0.3, z2 - 3.2 - 6, x1 + 2.3, z2 - 3.2, 4, '+z', 'metal', base0, true);
    // machinery / shelving
    for (let i = 0; i < Math.floor(w / 9); i++) {
      const mx = x1 + 5 + i * 9 + r() * 2;
      if (mx > x2 - 4) break;
      if (o.furniture === 'industrial') m.box(mx - 1.2, base0, z - 2.5, mx + 1.2, base0 + 2.2 + r() * 1.5, z + 1.5, 'metal');
      else m.box(mx - 0.4, base0, z - 4, mx + 0.4, base0 + 3, z + 4, 'wood');
      res.loot.push({ x: mx + 2, y: base0, z: z + 3 });
    }
    res.loot.push({ x: x + w * 0.3, y: my, z: z2 - 1.7 });
    for (let i = 0; i < 3; i++) res.lights.push({ x: x1 + ((i + 0.5) * w) / 3, y: base0 + H - 0.5, z });
    res.roofY = base0 + H + 0.4;
    return res;
  }

  const doorPos = (side: Side) => (side === 'n' || side === 's' ? x + (r() - 0.5) * (w * 0.3) : z + (r() - 0.5) * (d * 0.3));
  const doorAt: Partial<Record<Side, number>> = { [o.door]: doorPos(o.door) };
  if (o.door2) doorAt[o.door2] = doorPos(o.door2);
  // stairwell in the north-east corner
  const sw = { x1: x2 - 2.6, z1: z2 - 5.4, x2: x2 - 0.2, z2: z2 - 0.2 };
  const totalFloors = floors;
  for (let f = 0; f < totalFloors; f++) {
    const by = base0 + f * STOREY;
    const ground = f === 0;
    wallXWithDoor(m, x1, x2, z1, by, STOREY, o.wall, ground && doorAt.s !== undefined ? doorAt.s : null);
    wallXWithDoor(m, x1, x2, z2, by, STOREY, o.wall, ground && doorAt.n !== undefined ? doorAt.n : null);
    wallZWithDoor(m, z1 + 0.15, z2 - 0.15, x1, by, STOREY, o.wall, ground && doorAt.w !== undefined ? doorAt.w : null);
    wallZWithDoor(m, z1 + 0.15, z2 - 0.15, x2, by, STOREY, o.wall, ground && doorAt.e !== undefined ? doorAt.e : null);
    // stairs up from this floor
    const last = f === totalFloors - 1;
    // open flight rising southwards: enter at the north end (from the west), exit south onto the slab above
    if (!last || o.roofAccess) m.stairs(sw.x1 + 0.1, sw.z1, sw.x2 - 0.1, sw.z2 - 0.5, STOREY, '-z', 'concrete', by, true);
    // ceiling / next floor
    slabWithHole(m, x1, z1, x2, z2, by + STOREY, 0.25, last ? o.roof : o.floor, !last || o.roofAccess ? sw : null);
    // interior partition (along X at the middle) with doorway
    if (d > 9 && w > 7) wallXWithDoor(m, x1 + 0.15, sw.x1 - 0.1, z, by, STOREY - 0.25, 'plaster', x1 + (sw.x1 - x1) * (0.3 + r() * 0.4), 1.2, 2.3, 0.2);
    // furniture
    furnish(m, props, r, x1 + 0.6, z1 + 0.6, sw.x1 - 0.6, z2 - 0.6, by, o.furniture, res);
    if (o.interiorLights !== false) res.lights.push({ x: x - w * 0.15, y: by + STOREY - 0.4, z });
  }
  const roofY = base0 + totalFloors * STOREY;
  res.roofY = roofY;
  if (o.roofAccess) {
    // parapet
    const py = roofY;
    m.box(x1, py, z1 - 0.15, x2, py + 1, z1 + 0.15, o.wall);
    m.box(x1, py, z2 - 0.15, x2, py + 1, z2 + 0.15, o.wall);
    m.box(x1 - 0.15, py, z1, x1 + 0.15, py + 1, z2, o.wall);
    m.box(x2 - 0.15, py, z1, x2 + 0.15, py + 1, z2, o.wall);
    // stair bulkhead: walled on the west, open to the south where the flight arrives
    m.box(sw.x1 - 0.3, py, sw.z1, sw.x1, py + 2.6, sw.z2, o.wall);
    m.box(sw.x1 - 0.3, py + 2.6, sw.z1, sw.x2 + 0.15, py + 2.9, sw.z2 + 0.15, o.roof);
    roofProps(props, r, x, z, w, d, py, sw);
    res.loot.push({ x: x - w * 0.25, y: py, z: z - d * 0.25 });
  } else if (o.pitched) {
    // stepped pitched roof (collidable, readable silhouette)
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const inset = (i + 1) * (Math.min(w, d) / 2 / (steps + 0.5));
      m.box(x1 - 0.4 + (w > d ? 0 : inset), roofY + i * 0.55, z1 - 0.4 + (w > d ? inset : 0), x2 + 0.4 - (w > d ? 0 : inset), roofY + (i + 1) * 0.55, z2 + 0.4 - (w > d ? inset : 0), o.roof);
    }
    props.push({ kind: 'chimney', x: x2 - 1, y: roofY, z: z1 + 1.2, rot: 0, s: 1 });
  }
  return res;
}

function furnish(m: MapBuilder, props: Prop[], r: Rand, x1: number, z1: number, x2: number, z2: number, y: number, kind: BuildingOpts['furniture'], res: BuildingResult) {
  if (kind === 'none' || x2 - x1 < 2 || z2 - z1 < 2) return;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const put = (w: number, h: number, d: number, px: number, pz: number, mat: SurfaceMat) => m.box(px - w / 2, y, pz - d / 2, px + w / 2, y + h, pz + d / 2, mat);
  switch (kind) {
    case 'home':
      put(1.6, 0.75, 0.9, cx, z1 + (z2 - z1) * 0.3, 'wood'); // table
      put(2, 0.5, 1.4, x1 + 1.1, z2 - 0.8, 'fabric'); // bed
      put(0.5, 1.8, 1.6, x1 + 0.3, z1 + 1, 'wood'); // shelf
      put(2, 0.8, 0.8, cx + (r() - 0.5) * 2, z2 - 0.5, 'fabric'); // sofa
      props.push({ kind: 'curtain', x: x1 + 0.05, y: y + 1.2, z: cz, rot: Math.PI / 2, s: 1 });
      break;
    case 'office':
      for (let i = 0; i < 3; i++) put(1.4, 0.75, 0.7, x1 + 1 + i * 2.2, cz - 1.5, 'wood');
      put(0.45, 1.9, 2.2, x2 - 0.3, z1 + 1.5, 'metal'); // cabinets
      break;
    case 'shop':
      put(Math.min(5, x2 - x1 - 1), 1, 0.7, cx, z1 + 1.2, 'wood'); // counter
      for (let i = 0; i < 2; i++) put(0.6, 1.7, Math.min(4, z2 - z1 - 3), x1 + 1.5 + i * 2.6, cz + 1, 'wood'); // aisles
      break;
    case 'military':
      for (let i = 0; i < 3; i++) put(0.9, 0.55, 2, x1 + 0.7 + i * 1.6, z2 - 1.2, 'fabric'); // bunks
      put(1.8, 0.8, 0.8, cx, z1 + 0.6, 'metal'); // footlockers
      break;
    case 'industrial':
      put(2, 1.2, 1.2, cx, cz, 'metal');
      break;
  }
  res.loot.push({ x: cx + (r() - 0.5) * 1.5, y, z: cz + (r() - 0.5) * 1.5 });
}

function roofProps(props: Prop[], r: Rand, x: number, z: number, w: number, d: number, y: number, sw: { x1: number; z1: number }) {
  if (r() < 0.6) props.push({ kind: 'waterTank', x: x - w / 2 + 2, y, z: z - d / 2 + 2, rot: 0, s: 1 });
  const ac = 1 + Math.floor(r() * 3);
  for (let i = 0; i < ac; i++) props.push({ kind: 'acUnit', x: x - w / 4 + i * 1.6, y, z: z + d / 4 - 1, rot: 0, s: 1 });
  if (r() < 0.6) props.push({ kind: 'antenna', x: sw.x1 - 1, y, z: sw.z1 - 1, rot: 0, s: 1 + r() });
  if (r() < 0.4) props.push({ kind: 'dish', x: x + w / 4, y, z: z - d / 4, rot: r() * 6, s: 1 });
}

/** Solid (non-enterable) tower with facade material and rooftop details. */
export function tower(m: MapBuilder, props: Prop[], r: Rand, x: number, z: number, w: number, d: number, h: number, y0: number, mat: SurfaceMat) {
  m.box(x - w / 2, y0 - 2.5, z - d / 2, x + w / 2, y0 + h, z + d / 2, mat);
  // setback crown
  if (h > 40) m.box(x - w / 2 + 2, y0 + h, z - d / 2 + 2, x + w / 2 - 2, y0 + h + 4, z + d / 2 - 2, mat);
  const top = y0 + h + (h > 40 ? 4 : 0);
  props.push({ kind: 'antenna', x, y: top, z, rot: 0, s: 2 + r() * 2 });
  if (r() < 0.5) props.push({ kind: 'waterTank', x: x + w / 4, y: top, z: z - d / 4, rot: 0, s: 1.2 });
  props.push({ kind: 'beacon', x, y: top + 6, z, rot: 0, s: 1 });
}

/** Open parking garage: slabs on pillars with stair ramps. */
export function garage(m: MapBuilder, r: Rand, x: number, z: number, w: number, d: number, levels: number, y0: number): Vec3[] {
  const loot: Vec3[] = [];
  m.box(x - w / 2, y0 - 2.5, z - d / 2, x + w / 2, y0 + 0.25, z + d / 2, 'concrete');
  const sw = { x1: x + w / 2 - 3, z1: z - d / 2 + 0.2, x2: x + w / 2 - 0.2, z2: z - d / 2 + 6.2 };
  for (let l = 0; l < levels; l++) {
    const by = y0 + 0.25 + l * 3.2;
    for (let px = -1; px <= 1; px++) for (let pz = -1; pz <= 1; pz++) {
      const cx = x + (px * w) / 2.6, cz = z + (pz * d) / 2.6;
      m.box(cx - 0.35, by, cz - 0.35, cx + 0.35, by + 3.2, cz + 0.35, 'concrete');
    }
    m.stairs(sw.x1, sw.z1, sw.x2, sw.z2 - 0.4, 3.2, '+z', 'concrete', by, true);
    slabWithHole(m, x - w / 2, z - d / 2, x + w / 2, z + d / 2, by + 3.2, 0.3, 'concrete', l < levels - 1 ? sw : sw);
    // low barrier walls
    m.box(x - w / 2, by + 3.2, z + d / 2 - 0.2, x + w / 2, by + 4.1, z + d / 2, 'concrete');
    m.box(x - w / 2, by + 3.2, z - d / 2, x - w / 2 + 0.2, by + 4.1, z + d / 2, 'concrete');
    loot.push({ x: x - w / 4 + r() * 2, y: by, z: z + r() * 4 });
  }
  return loot;
}

/** Unfinished building: floor slabs on columns with scaffolding stairs. */
export function constructionSite(m: MapBuilder, props: Prop[], r: Rand, x: number, z: number, w: number, d: number, levels: number, y0: number): Vec3[] {
  const loot: Vec3[] = [];
  m.box(x - w / 2, y0 - 2.5, z - d / 2, x + w / 2, y0 + 0.25, z + d / 2, 'concrete');
  const sw = { x1: x - w / 2 + 0.2, z1: z - d / 2 + 0.2, x2: x - w / 2 + 2.6, z2: z - d / 2 + 6.2 };
  for (let l = 0; l < levels; l++) {
    const by = y0 + 0.25 + l * STOREY;
    for (let px = 0; px <= 3; px++) for (let pz = 0; pz <= 2; pz++) {
      const cx = x - w / 2 + 0.3 + (px * (w - 0.6)) / 3, cz = z - d / 2 + 0.3 + (pz * (d - 0.6)) / 2;
      m.box(cx - 0.25, by, cz - 0.25, cx + 0.25, by + STOREY, cz + 0.25, 'concrete');
    }
    m.stairs(sw.x1, sw.z1, sw.x2, sw.z2 - 0.4, STOREY, '+z', 'metal', by, true);
    if (l < levels - 1) slabWithHole(m, x - w / 2, z - d / 2, x + w / 2 - (l === levels - 2 ? w * 0.4 : 0), z + d / 2, by + STOREY, 0.25, 'concrete', sw);
    loot.push({ x: x + r() * 3, y: by, z: z + r() * 3 });
  }
  props.push({ kind: 'crane', x: x + w / 2 + 4, y: y0, z, rot: r() * 6, s: 1 });
  for (let i = 0; i < 4; i++) props.push({ kind: 'pallet', x: x - w / 2 - 2 - r() * 4, y: y0, z: z + (r() - 0.5) * d, rot: r() * 3, s: 1 });
  return loot;
}
