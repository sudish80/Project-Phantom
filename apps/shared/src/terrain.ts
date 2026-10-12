/**
 * Regular-grid heightfield with bilinear interpolation. The exact same data is used by the
 * server (movement, hit detection) and the client (prediction + rendering).
 */
export class Heightfield {
  constructor(
    /** world coordinate of grid index 0 on both axes */
    readonly origin: number,
    /** metres between samples */
    readonly cell: number,
    /** samples per side */
    readonly n: number,
    readonly h: Float32Array,
  ) {}

  get size() {
    return (this.n - 1) * this.cell;
  }

  sample(ix: number, iz: number) {
    const n = this.n;
    ix = ix < 0 ? 0 : ix >= n ? n - 1 : ix;
    iz = iz < 0 ? 0 : iz >= n ? n - 1 : iz;
    return this.h[iz * n + ix];
  }

  heightAt(x: number, z: number) {
    const fx = (x - this.origin) / this.cell;
    const fz = (z - this.origin) / this.cell;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const a = this.sample(ix, iz), b = this.sample(ix + 1, iz);
    const c = this.sample(ix, iz + 1), d = this.sample(ix + 1, iz + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  /** Highest terrain point under a small footprint (corners + centre). */
  maxIn(minX: number, minZ: number, maxX: number, maxZ: number) {
    return Math.max(
      this.heightAt(minX, minZ),
      this.heightAt(maxX, minZ),
      this.heightAt(minX, maxZ),
      this.heightAt(maxX, maxZ),
      this.heightAt((minX + maxX) / 2, (minZ + maxZ) / 2),
    );
  }

  normalAt(x: number, z: number) {
    const e = this.cell * 0.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -dx, ny = 2 * e, nz = -dz;
    const l = Math.hypot(nx, ny, nz);
    return { x: nx / l, y: ny / l, z: nz / l };
  }

  /** slope as rise/run */
  slopeAt(x: number, z: number) {
    const n = this.normalAt(x, z);
    return Math.sqrt(1 - n.y * n.y) / Math.max(n.y, 1e-3);
  }
}
