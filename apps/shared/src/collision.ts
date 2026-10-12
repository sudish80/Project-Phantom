import type { Heightfield } from './terrain';
import type { SurfaceMat, Vec3 } from './types';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface Solid extends Box {
  mat: SurfaceMat;
  /** invisible collision only (e.g. map boundaries) */
  hidden?: boolean;
  /** pseudo-solid representing the heightfield under a query box */
  terrain?: boolean;
}

export interface RayHit {
  t: number;
  point: Vec3;
  normal: Vec3;
  solid: Solid;
}

export function boxesOverlap(a: Box, b: Box) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function pointInBox(p: Vec3, b: Box) {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY && p.z >= b.minZ && p.z <= b.maxZ;
}

/** Slab test. Returns entry distance and the hit face normal, or null. */
export function rayBox(o: Vec3, d: Vec3, b: Box, maxT: number): { t: number; nx: number; ny: number; nz: number } | null {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sign = 0;
  const os = [o.x, o.y, o.z];
  const ds = [d.x, d.y, d.z];
  const mins = [b.minX, b.minY, b.minZ];
  const maxs = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-9) {
      if (os[i] < mins[i] || os[i] > maxs[i]) return null;
      continue;
    }
    const inv = 1 / ds[i];
    let t1 = (mins[i] - os[i]) * inv;
    let t2 = (maxs[i] - os[i]) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis === -1) return { t: 0, nx: -d.x, ny: -d.y, nz: -d.z };
  return { t: tmin, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0 };
}

/**
 * Static + dynamic axis-aligned collision world, shared verbatim by the server
 * (authoritative simulation & hit detection) and the client (prediction).
 * A uniform XZ grid accelerates overlap queries and raycasts.
 */
const TERRAIN_SOLID: Solid = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, mat: 'terrain', terrain: true, hidden: true };

export class CollisionWorld {
  readonly statics: Solid[];
  readonly dynamics = new Map<string, Solid>();
  private grid = new Map<number, number[]>();
  private readonly cell = 4;

  readonly terrain: Heightfield | null;

  constructor(statics: Solid[], terrain: Heightfield | null = null) {
    this.statics = statics;
    this.terrain = terrain;
    statics.forEach((s, i) => {
      for (const k of this.cellsFor(s)) {
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(i);
      }
    });
  }

  private key(cx: number, cz: number) {
    return (cx + 512) * 1024 + (cz + 512);
  }

  private cellsFor(b: Box) {
    const keys: number[] = [];
    const x0 = Math.floor(b.minX / this.cell), x1 = Math.floor(b.maxX / this.cell);
    const z0 = Math.floor(b.minZ / this.cell), z1 = Math.floor(b.maxZ / this.cell);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) keys.push(this.key(x, z));
    return keys;
  }

  setDynamic(key: string, solid: Solid | null) {
    if (solid) this.dynamics.set(key, solid);
    else this.dynamics.delete(key);
  }

  clearDynamics(prefix?: string) {
    for (const k of [...this.dynamics.keys()]) if (!prefix || k.startsWith(prefix)) this.dynamics.delete(k);
  }

  overlaps(b: Box): Solid[] {
    const out: Solid[] = [];
    const seen = new Set<number>();
    for (const k of this.cellsFor(b)) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      for (const i of arr) {
        if (seen.has(i)) continue;
        seen.add(i);
        if (boxesOverlap(b, this.statics[i])) out.push(this.statics[i]);
      }
    }
    for (const s of this.dynamics.values()) if (boxesOverlap(b, s)) out.push(s);
    if (this.terrain) {
      const top = this.terrain.maxIn(b.minX, b.minZ, b.maxX, b.maxZ);
      if (b.minY < top) out.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, minY: top - 1000, maxY: top, mat: 'terrain', terrain: true });
    }
    return out;
  }

  /** March a ray against the heightfield (coarse steps + bisection). */
  private rayTerrain(o: Vec3, d: Vec3, maxT: number): { t: number; nx: number; ny: number; nz: number } | null {
    const tf = this.terrain;
    if (!tf) return null;
    const step = 1.25;
    let prevT = 0;
    let prevAbove = o.y - tf.heightAt(o.x, o.z);
    if (prevAbove < 0) return null; // origin under terrain (shouldn't happen)
    for (let t = step; t <= maxT + step; t += step) {
      const tt = Math.min(t, maxT);
      const x = o.x + d.x * tt, y = o.y + d.y * tt, z = o.z + d.z * tt;
      const above = y - tf.heightAt(x, z);
      if (above < 0) {
        let lo = prevT, hi = tt;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const a = o.y + d.y * mid - tf.heightAt(o.x + d.x * mid, o.z + d.z * mid);
          if (a < 0) hi = mid;
          else lo = mid;
        }
        const n = tf.normalAt(o.x + d.x * hi, o.z + d.z * hi);
        return { t: hi, nx: n.x, ny: n.y, nz: n.z };
      }
      // quick exit: ray climbing well above any terrain we might meet
      if (d.y > 0.2 && above > 200) return null;
      prevT = tt;
      prevAbove = above;
      if (tt >= maxT) break;
    }
    return null;
  }

  raycast(o: Vec3, d: Vec3, maxT: number): RayHit | null {
    let best: { t: number; nx: number; ny: number; nz: number } | null = null;
    let bestSolid: Solid | null = null;
    const test = (s: Solid) => {
      const h = rayBox(o, d, s, best ? best.t : maxT);
      if (h && (!best || h.t < best.t)) {
        best = h;
        bestSolid = s;
      }
    };
    // Walk the grid cells along the ray (2D DDA over XZ), testing candidates.
    const seen = new Set<number>();
    const cell = this.cell;
    let cx = Math.floor(o.x / cell);
    let cz = Math.floor(o.z / cell);
    const stepX = d.x > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(d.x) > 1e-9 ? Math.abs(cell / d.x) : Infinity;
    const tDeltaZ = Math.abs(d.z) > 1e-9 ? Math.abs(cell / d.z) : Infinity;
    let tMaxX = Math.abs(d.x) > 1e-9 ? ((d.x > 0 ? (cx + 1) * cell : cx * cell) - o.x) / d.x : Infinity;
    let tMaxZ = Math.abs(d.z) > 1e-9 ? ((d.z > 0 ? (cz + 1) * cell : cz * cell) - o.z) / d.z : Infinity;
    let t = 0;
    for (let iter = 0; iter < 400 && t <= maxT; iter++) {
      // test this cell and its neighbours (boxes can straddle cells; cheap insurance)
      const arr = this.grid.get(this.key(cx, cz));
      if (arr) {
        for (const i of arr) {
          if (seen.has(i)) continue;
          seen.add(i);
          test(this.statics[i]);
        }
      }
      if (best && (best as { t: number }).t <= t) break;
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
    }
    for (const s of this.dynamics.values()) test(s);
    if (this.terrain) {
      const th = this.rayTerrain(o, d, best ? (best as { t: number }).t : maxT);
      if (th && (!best || th.t < (best as { t: number }).t)) {
        best = th;
        bestSolid = TERRAIN_SOLID;
      }
    }
    if (!best || !bestSolid) return null;
    const b = best as { t: number; nx: number; ny: number; nz: number };
    return {
      t: b.t,
      point: { x: o.x + d.x * b.t, y: o.y + d.y * b.t, z: o.z + d.z * b.t },
      normal: { x: b.nx, y: b.ny, z: b.nz },
      solid: bestSolid,
    };
  }

  /** Line of sight test between two points (static + dynamic geometry). */
  lineOfSight(a: Vec3, b: Vec3) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const hit = this.raycast(a, { x: dx / len, y: dy / len, z: dz / len }, len);
    return !hit || hit.t >= len - 0.05;
  }

  /** Highest floor surface under a point (or null). */
  groundBelow(p: Vec3, maxDrop = 50): number | null {
    const hit = this.raycast({ x: p.x, y: p.y + 0.05, z: p.z }, { x: 0, y: -1, z: 0 }, maxDrop);
    return hit ? hit.point.y : null;
  }
}
