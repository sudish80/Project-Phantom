import type { Solid } from '../collision';
import type { SurfaceMat } from '../types';
import type { Decor } from './types';

export const CONTAINER = { length: 6.1, width: 2.44, height: 2.6 };

/** Helper for authoring blocky, modular map geometry. */
export class MapBuilder {
  solids: Solid[] = [];
  barriers: Solid[] = [];
  decor: Decor[] = [];

  box(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, mat: SurfaceMat, hidden = false) {
    const s: Solid = {
      minX: Math.min(x1, x2), minY: Math.min(y1, y2), minZ: Math.min(z1, z2),
      maxX: Math.max(x1, x2), maxY: Math.max(y1, y2), maxZ: Math.max(z1, z2), mat,
    };
    if (hidden) s.hidden = true;
    this.solids.push(s);
    return s;
  }

  block(cx: number, cz: number, sx: number, sz: number, h: number, mat: SurfaceMat, y0 = 0) {
    return this.box(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + h, cz + sz / 2, mat);
  }

  /** Wall running along X at depth z. */
  wallX(x1: number, x2: number, z: number, h: number, mat: SurfaceMat = 'concrete', t = 0.6, y0 = 0) {
    return this.box(x1, y0, z - t / 2, x2, y0 + h, z + t / 2, mat);
  }

  /** Wall running along Z at x. */
  wallZ(z1: number, z2: number, x: number, h: number, mat: SurfaceMat = 'concrete', t = 0.6, y0 = 0) {
    return this.box(x - t / 2, y0, z1, x + t / 2, y0 + h, z2, mat);
  }

  container(cx: number, cz: number, alongX: boolean, mat: SurfaceMat, y0 = 0) {
    const { length: l, width: w, height: h } = CONTAINER;
    return alongX ? this.block(cx, cz, l, w, h, mat, y0) : this.block(cx, cz, w, l, h, mat, y0);
  }

  crate(cx: number, cz: number, s = 1.2, y0 = 0, mat: SurfaceMat = 'crate') {
    return this.block(cx, cz, s, s, s, mat, y0);
  }

  /** Thin horizontal slab whose top is at y. */
  platform(x1: number, z1: number, x2: number, z2: number, y: number, mat: SurfaceMat = 'metal', thick = 0.3) {
    return this.box(x1, y - thick, z1, x2, y, z2, mat);
  }

  /** Solid staircase filling the rectangle, rising towards `dir` up to height h. */
  stairs(x1: number, z1: number, x2: number, z2: number, h: number, dir: '+x' | '-x' | '+z' | '-z', mat: SurfaceMat = 'metal', y0 = 0, open = false) {
    const n = Math.max(2, Math.ceil(h / 0.3));
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);
    for (let i = 0; i < n; i++) {
      const top = y0 + (h * (i + 1)) / n;
      // open stairs use thin treads so flights can be stacked with headroom underneath
      const yb = open ? Math.max(y0, top - 0.3) : y0;
      const a = i / n, b = (i + 1) / n;
      if (dir === '+x') this.box(minX + (maxX - minX) * a, yb, minZ, minX + (maxX - minX) * b, top, maxZ, mat);
      if (dir === '-x') this.box(maxX - (maxX - minX) * b, yb, minZ, maxX - (maxX - minX) * a, top, maxZ, mat);
      if (dir === '+z') this.box(minX, yb, minZ + (maxZ - minZ) * a, maxX, top, minZ + (maxZ - minZ) * b, mat);
      if (dir === '-z') this.box(minX, yb, maxZ - (maxZ - minZ) * b, maxX, top, maxZ - (maxZ - minZ) * a, mat);
    }
  }

  /** Perimeter walls + floor. */
  arena(minX: number, maxX: number, minZ: number, maxZ: number, h: number, floor: SurfaceMat, wall: SurfaceMat) {
    this.box(minX - 2, -1, minZ - 2, maxX + 2, 0, maxZ + 2, floor);
    this.box(minX - 1, 0, minZ - 1, minX, h, maxZ + 1, wall);
    this.box(maxX, 0, minZ - 1, maxX + 1, h, maxZ + 1, wall);
    this.box(minX, 0, minZ - 1, maxX, h, minZ, wall);
    this.box(minX, 0, maxZ, maxX, h, maxZ + 1, wall);
    // invisible ceiling-height extension so players can't climb out
    this.box(minX - 1, h, minZ - 1, maxX + 1, h + 30, minZ, 'concrete', true);
    this.box(minX - 1, h, maxZ, maxX + 1, h + 30, maxZ + 1, 'concrete', true);
    this.box(minX - 1, h, minZ, minX, h + 30, maxZ, 'concrete', true);
    this.box(maxX, h, minZ, maxX + 1, h + 30, maxZ, 'concrete', true);
  }

  barrier(x1: number, x2: number, z: number, h = 7) {
    this.barriers.push({ minX: x1, minY: 0, minZ: z - 0.15, maxX: x2, maxY: h, maxZ: z + 0.15, mat: 'barrier' });
  }

  add(d: Decor) {
    this.decor.push(d);
  }
}
