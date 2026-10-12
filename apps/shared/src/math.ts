export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Forward vector for a yaw/pitch pair (three.js convention: yaw 0 looks down -Z). */
export function dirFromAngles(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function dist3(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function distXZ(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function lerpAngle(a: number, b: number, t: number) {
  return a + wrapAngle(b - a) * t;
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Deterministic, seedable PRNG (mulberry32). Used for server-controlled combat randomness. */
export class Rng {
  private s: number;
  constructor(seed = Date.now()) {
    this.s = seed >>> 0;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
}

/** Rotate `dir` randomly inside a cone of half-angle `spread` (radians). */
export function applySpread(dir: Vec3, spread: number, r1: number, r2: number): Vec3 {
  if (spread <= 0) return dir;
  const angle = spread * Math.sqrt(r1);
  const theta = r2 * Math.PI * 2;
  // Build an orthonormal basis around dir.
  const up = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const ux = up.y * dir.z - up.z * dir.y;
  const uy = up.z * dir.x - up.x * dir.z;
  const uz = up.x * dir.y - up.y * dir.x;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const a = { x: ux / ul, y: uy / ul, z: uz / ul };
  const b = {
    x: dir.y * a.z - dir.z * a.y,
    y: dir.z * a.x - dir.x * a.z,
    z: dir.x * a.y - dir.y * a.x,
  };
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const ct = Math.cos(theta) * s;
  const st = Math.sin(theta) * s;
  return normalize({
    x: dir.x * c + a.x * ct + b.x * st,
    y: dir.y * c + a.y * ct + b.y * st,
    z: dir.z * c + a.z * ct + b.z * st,
  });
}

/** Distance along ray to sphere entry, or -1. */
export function raySphere(o: Vec3, d: Vec3, c: Vec3, r: number, maxT: number) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0 || t > maxT) return -1;
  return t;
}

/** True if the segment a->b passes within r of c. */
export function segmentNearPoint(a: Vec3, b: Vec3, c: Vec3, r: number) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz || 1;
  let t = ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / len2;
  t = clamp(t, 0, 1);
  const px = a.x + dx * t - c.x, py = a.y + dy * t - c.y, pz = a.z + dz * t - c.z;
  return px * px + py * py + pz * pz < r * r;
}
