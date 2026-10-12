import type { Solid } from '../collision';
import { Rng, type Vec3 } from '../math';
import { Noise2D, smoothstep } from '../noise';
import { Heightfield } from '../terrain';
import type { SurfaceMat } from '../types';
import { MapBuilder } from './builder';
import { building, constructionSite, garage, tower, type BuildingOpts, type Side } from './structures';
import type { MapDef, Poi, Prop, RoadDef, WorldData } from './types';

/**
 * FRONTIER — procedurally generated (deterministic, seeded) open world of ~1.2 km².
 * Regions: NW forest & mountain lake, N snowy peaks, NE industrial works, W farming village,
 * central city, E airfield, SE military base, SW river forest & village, SE beach & harbour.
 * The same function runs on the server and in every browser, so terrain, buildings and
 * colliders are bit-identical without sending any geometry over the network.
 */

const SEED = 20261011;
const HALF = 600;
const ORIGIN = -640;
const CELL = 4;
const N = 321;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Flat {
  x: number;
  z: number;
  hw: number;
  hd: number;
  fall: number;
  level?: number;
}

const ZONES: Record<string, Flat> = {
  city: { x: 0, z: 0, hw: 190, hd: 190, fall: 70 },
  airport: { x: 400, z: 50, hw: 155, hd: 85, fall: 60 },
  industrial: { x: 360, z: 350, hw: 110, hd: 90, fall: 60 },
  military: { x: 330, z: -110, hw: 70, hd: 60, fall: 45 },
  ashford: { x: -400, z: 20, hw: 85, hd: 85, fall: 50 },
  millbrook: { x: -320, z: -320, hw: 70, hd: 70, fall: 45 },
  lakeview: { x: -250, z: 235, hw: 45, hd: 40, fall: 40 },
  harbor: { x: 300, z: -300, hw: 60, hd: 60, fall: 30, level: 2.2 },
};

const POIS: Poi[] = [
  { name: 'Meridian City', x: 0, z: 0, kind: 'city' },
  { name: 'Ashford', x: -400, z: 20, kind: 'village' },
  { name: 'Millbrook', x: -320, z: -320, kind: 'village' },
  { name: 'Lakeview', x: -250, z: 235, kind: 'village' },
  { name: 'Northgate Works', x: 360, z: 350, kind: 'industrial' },
  { name: 'Kestrel Airfield', x: 400, z: 50, kind: 'airport' },
  { name: 'Fort Talon', x: 330, z: -110, kind: 'military' },
  { name: 'Saltmarsh Harbor', x: 300, z: -300, kind: 'harbor' },
  { name: 'Pinecrest Woods', x: -450, z: 220, kind: 'nature' },
  { name: 'Mirror Lake', x: -330, z: 300, kind: 'nature' },
  { name: 'Frostpeak', x: -60, z: 470, kind: 'landmark' },
  { name: 'Copper Bay', x: 430, z: -230, kind: 'nature' },
  { name: 'Reedmarsh', x: -470, z: -180, kind: 'nature' },
  { name: 'Hollow Pines', x: -200, z: -470, kind: 'nature' },
];

const LAKES = [
  { x: -330, z: 300, r: 58, level: 0 },
  { x: -470, z: -180, r: 42, level: 0 },
];

const RIVER_PATH: [number, number][] = [
  [-300, 246], [-282, 200], [-252, 120], [-228, 40], [-202, -50], [-176, -140], [-140, -215], [-70, -272], [30, -318],
  [140, -368], [250, -428], [330, -500], [390, -570], [440, -640],
];

const ROADS: { pts: [number, number][]; width: number; kind: RoadDef['kind'] }[] = [
  { pts: [[-600, 22], [-480, 22], [-400, 20], [-300, 12], [-230, 8], [-190, 0]], width: 13, kind: 'highway' },
  { pts: [[190, 0], [250, 6], [300, 22], [330, 40]], width: 13, kind: 'highway' },
  { pts: [[120, 190], [190, 250], [260, 300], [300, 330]], width: 10, kind: 'asphalt' },
  { pts: [[120, -190], [180, -235], [240, -270], [270, -285]], width: 10, kind: 'asphalt' },
  { pts: [[-190, -120], [-230, -190], [-275, -260], [-300, -290]], width: 9, kind: 'asphalt' },
  { pts: [[-400, 100], [-360, 160], [-305, 205], [-265, 228]], width: 6, kind: 'dirt' },
  { pts: [[380, -20], [360, -60], [340, -80]], width: 9, kind: 'asphalt' },
  { pts: [[395, 270], [415, 190], [410, 120]], width: 9, kind: 'asphalt' },
  { pts: [[-365, -285], [-410, -240], [-440, -205]], width: 5, kind: 'dirt' },
  { pts: [[-470, 60], [-500, 160], [-480, 260], [-420, 330]], width: 5, kind: 'dirt' },
  { pts: [[-120, 190], [-90, 260], [-70, 330], [-60, 400]], width: 6, kind: 'dirt' },
  { pts: [[330, -250], [400, -185], [470, -120], [540, -60]], width: 9, kind: 'asphalt' },
];

function catmull(points: [number, number][], spacing: number) {
  const out: { x: number; z: number }[] = [];
  const P = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = points[points.length - 1];
  out.push({ x: last[0], z: last[1] });
  return out;
}

/** Distance from point to segment, and parameter t. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t };
}

export function buildFrontier(): MapDef {
  const noise = new Noise2D(SEED);
  const rng = new Rng(SEED);
  const r = () => rng.next();
  const coastCoord = (x: number, z: number) => (x - z) * 0.7071 + noise.fbm(x * 0.004 + 77, z * 0.004, 3) * 35;

  // ───────────── base terrain ─────────────
  const base = (x: number, z: number) => {
    let h = 8 + noise.fbm(x * 0.003, z * 0.003, 4) * 9 + noise.fbm(x * 0.012 + 50, z * 0.012, 3) * 2.5;
    const west = smoothstep(-80, -380, x);
    h += west * (6 + noise.fbm(x * 0.006 + 11, z * 0.006, 4) * 16);
    const north = smoothstep(140, 430, z) * (1 - smoothstep(170, 380, x));
    h += north * (24 + noise.ridged(x * 0.0042 + 3, z * 0.0042 - 7, 5) * 150);
    h += smoothstep(220, 480, z) * smoothstep(170, 380, x) * (noise.fbm(x * 0.006, z * 0.006, 3) * 8 + 4);
    const c = coastCoord(x, z);
    if (c > 370) {
      h = lerp(h, 2, smoothstep(370, 415, c));
      h = lerp(h, -1.4, smoothstep(428, 470, c));
    }
    return h;
  };

  const H = new Float32Array(N * N);
  const roadMask = new Uint8Array(N * N);
  const wetMask = new Uint8Array(N * N);
  const sandMask = new Uint8Array(N * N);
  const wx = (i: number) => ORIGIN + i * CELL;
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) H[iz * N + ix] = base(wx(ix), wx(iz));

  // ───────────── flatten settlement zones ─────────────
  for (const zf of Object.values(ZONES)) {
    if (zf.level === undefined) {
      let sum = 0, cnt = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        sum += base(zf.x + a * zf.hw * 0.6, zf.z + b * zf.hd * 0.6);
        cnt++;
      }
      zf.level = Math.max(3, sum / cnt);
    }
    const x0 = Math.floor((zf.x - zf.hw - zf.fall - ORIGIN) / CELL), x1 = Math.ceil((zf.x + zf.hw + zf.fall - ORIGIN) / CELL);
    const z0 = Math.floor((zf.z - zf.hd - zf.fall - ORIGIN) / CELL), z1 = Math.ceil((zf.z + zf.hd + zf.fall - ORIGIN) / CELL);
    for (let iz = Math.max(0, z0); iz <= Math.min(N - 1, z1); iz++)
      for (let ix = Math.max(0, x0); ix <= Math.min(N - 1, x1); ix++) {
        const dx = Math.abs(wx(ix) - zf.x) - zf.hw, dz = Math.abs(wx(iz) - zf.z) - zf.hd;
        const w = 1 - smoothstep(0, zf.fall, Math.max(dx, dz));
        if (w > 0) H[iz * N + ix] = lerp(H[iz * N + ix], zf.level, w);
      }
  }

  const hAt = (x: number, z: number) => {
    const ix = Math.round((x - ORIGIN) / CELL), iz = Math.round((z - ORIGIN) / CELL);
    return H[Math.max(0, Math.min(N - 1, iz)) * N + Math.max(0, Math.min(N - 1, ix))];
  };

  // ───────────── lakes ─────────────
  for (const lk of LAKES) {
    let minRim = Infinity;
    for (let a = 0; a < 16; a++) minRim = Math.min(minRim, hAt(lk.x + Math.cos((a / 16) * Math.PI * 2) * lk.r, lk.z + Math.sin((a / 16) * Math.PI * 2) * lk.r));
    lk.level = Math.max(1, Math.min(hAt(lk.x, lk.z), minRim) - 1);
    const R = lk.r + 45;
    for (let iz = 0; iz < N; iz++) {
      const z = wx(iz);
      if (Math.abs(z - lk.z) > R) continue;
      for (let ix = 0; ix < N; ix++) {
        const x = wx(ix);
        const d = Math.hypot(x - lk.x, z - lk.z) * (1 + noise.noise(x * 0.03, z * 0.03) * 0.12);
        if (d > R) continue;
        const i = iz * N + ix;
        if (d < lk.r) H[i] = lk.level - 2 * (1 - (d / lk.r) ** 2) - 0.2;
        else H[i] = Math.max(Math.min(H[i], lk.level + 0.3 + (d - lk.r) * 0.6), lk.level + 0.3 + (d - lk.r) * 0.04);
        if (d < lk.r + 12) wetMask[i] = Math.max(wetMask[i], Math.round(255 * (1 - Math.max(0, d - lk.r) / 12)));
      }
    }
  }

  // ───────────── river ─────────────
  const rpts = catmull(RIVER_PATH, 6);
  const river: WorldData['river'] = [];
  let lvl = LAKES[0].level - 0.15;
  rpts.forEach((p, i) => {
    let ground = Infinity;
    for (let a = -2; a <= 2; a++) ground = Math.min(ground, hAt(p.x + a * 3, p.z + a * 3));
    const inSea = coastCoord(p.x, p.z) > 430;
    lvl = inSea ? 0 : Math.max(0.05, Math.min(lvl - 0.002, ground - 1.0));
    river.push({ x: p.x, z: p.z, level: lvl, width: lerp(9, 22, i / rpts.length) });
  });
  const riverDist = new Float32Array(N * N).fill(1e9);
  const riverLevel = new Float32Array(N * N);
  const riverHW = new Float32Array(N * N);
  for (let i = 0; i < river.length - 1; i++) {
    const a = river[i], b = river[i + 1];
    const hw = a.width / 2;
    const pad = hw + 36;
    const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - ORIGIN) / CELL)), ix1 = Math.min(N - 1, Math.ceil((Math.max(a.x, b.x) + pad - ORIGIN) / CELL));
    const iz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - pad - ORIGIN) / CELL)), iz1 = Math.min(N - 1, Math.ceil((Math.max(a.z, b.z) + pad - ORIGIN) / CELL));
    for (let iz = iz0; iz <= iz1; iz++)
      for (let ix = ix0; ix <= ix1; ix++) {
        const sd = segDist(wx(ix), wx(iz), a.x, a.z, b.x, b.z);
        const k = iz * N + ix;
        if (sd.d < riverDist[k]) {
          riverDist[k] = sd.d;
          riverLevel[k] = lerp(a.level, b.level, sd.t);
          riverHW[k] = hw;
        }
      }
  }
  for (let k = 0; k < N * N; k++) {
    const d = riverDist[k];
    const hw = riverHW[k];
    if (d > hw + 36) continue;
    const L = riverLevel[k];
    if (d < hw) H[k] = Math.min(H[k], L - 1.1 - 0.5 * (1 - (d / hw) ** 2));
    else {
      const bank = L + 0.35 + (d - hw) * 0.28;
      H[k] = Math.min(H[k], bank);
      if (d < hw + 5) H[k] = Math.max(H[k], L + 0.3 + (d - hw) * 0.05);
    }
    if (d < hw + 10) wetMask[k] = Math.max(wetMask[k], Math.round(255 * (1 - Math.max(0, d - hw) / 10)));
  }
  const riverAt = (x: number, z: number) => {
    const ix = Math.round((x - ORIGIN) / CELL), iz = Math.round((z - ORIGIN) / CELL);
    const k = Math.max(0, Math.min(N - 1, iz)) * N + Math.max(0, Math.min(N - 1, ix));
    return { d: riverDist[k], level: riverLevel[k], hw: riverHW[k] };
  };

  // ───────────── roads ─────────────
  const m = new MapBuilder();
  const roads: RoadDef[] = [];
  const roadDist = new Float32Array(N * N).fill(1e9);
  const roadH = new Float32Array(N * N);
  const roadHW = new Float32Array(N * N);
  const roadKind = new Uint8Array(N * N);
  const bridgeCell = new Uint8Array(N * N);
  for (const rd of ROADS) {
    const pts = catmull(rd.pts, 5).map((p) => ({ x: p.x, z: p.z, y: hAt(p.x, p.z), bridge: false }));
    // smooth profile
    for (let pass = 0; pass < 6; pass++) {
      const prev = pts.map((p) => p.y);
      for (let i = 0; i < pts.length; i++) {
        let s = 0, c = 0;
        for (let j = -4; j <= 4; j++) {
          const q = prev[i + j];
          if (q !== undefined) {
            s += q;
            c++;
          }
        }
        pts[i].y = s / c;
      }
    }
    for (const p of pts) {
      const rv = riverAt(p.x, p.z);
      if (rv.d < rv.hw + 7) {
        p.bridge = true;
        p.y = Math.max(p.y, rv.level + 3.2);
      }
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < pts.length; i++) pts[i].y = Math.max(pts[i].y, pts[i - 1].y - 0.7);
      for (let i = pts.length - 2; i >= 0; i--) pts[i].y = Math.max(pts[i].y, pts[i + 1].y - 0.7);
    }
    roads.push({ pts, width: rd.width, kind: rd.kind });
    const hw = rd.width / 2;
    const kind = rd.kind === 'dirt' ? 2 : 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const pad = hw + 10;
      const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - pad - ORIGIN) / CELL)), ix1 = Math.min(N - 1, Math.ceil((Math.max(a.x, b.x) + pad - ORIGIN) / CELL));
      const iz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - pad - ORIGIN) / CELL)), iz1 = Math.min(N - 1, Math.ceil((Math.max(a.z, b.z) + pad - ORIGIN) / CELL));
      for (let iz = iz0; iz <= iz1; iz++)
        for (let ix = ix0; ix <= ix1; ix++) {
          const sd = segDist(wx(ix), wx(iz), a.x, a.z, b.x, b.z);
          const k = iz * N + ix;
          if (sd.d < roadDist[k]) {
            roadDist[k] = sd.d;
            roadH[k] = lerp(a.y, b.y, sd.t);
            roadHW[k] = hw;
            roadKind[k] = kind;
            bridgeCell[k] = a.bridge || b.bridge ? 1 : 0;
          }
        }
      if (a.bridge && b.bridge) {
        const y = (a.y + b.y) / 2;
        m.box(Math.min(a.x, b.x) - hw * 0.8, y - 0.7, Math.min(a.z, b.z) - hw * 0.8, Math.max(a.x, b.x) + hw * 0.8, y, Math.max(a.z, b.z) + hw * 0.8, 'concrete');
      }
    }
  }
  for (let k = 0; k < N * N; k++) {
    const d = roadDist[k];
    if (d > roadHW[k] + 10) continue;
    if (bridgeCell[k] && riverDist[k] < riverHW[k] + 3) continue; // keep the channel under bridges
    const w = 1 - smoothstep(roadHW[k], roadHW[k] + 10, d);
    H[k] = lerp(H[k], roadH[k] - 0.05, w);
    if (d < roadHW[k]) roadMask[k] = roadKind[k];
  }

  // ───────────── city street grid ─────────────
  const cityY = ZONES.city.level!;
  for (let iz = 0; iz < N; iz++)
    for (let ix = 0; ix < N; ix++) {
      const x = wx(ix), z = wx(iz);
      if (Math.abs(x) > 196 || Math.abs(z) > 196) continue;
      const k = iz * N + ix;
      const gx = Math.abs((((x + 180) % 60) + 60) % 60), gz = Math.abs((((z + 180) % 60) + 60) % 60);
      const dx = Math.min(gx, 60 - gx), dz = Math.min(gz, 60 - gz);
      const dd = Math.min(dx, dz);
      if (dd <= 6) roadMask[k] = 1;
      else if (dd <= 9) roadMask[k] = 3;
      else if (roadMask[k] === 0) roadMask[k] = 3; // paved plazas / lots
    }

  // ───────────── beach sand ─────────────
  for (let iz = 0; iz < N; iz++)
    for (let ix = 0; ix < N; ix++) {
      const c = coastCoord(wx(ix), wx(iz));
      if (c > 355) sandMask[iz * N + ix] = Math.round(255 * smoothstep(355, 395, c));
    }

  const terrain = new Heightfield(ORIGIN, CELL, N, H);
  const ground = (x: number, z: number) => terrain.heightAt(x, z);

  // ───────────── structures ─────────────
  const props: Prop[] = [];
  const lamps: Vec3[] = [];
  const loot: Vec3[] = [];
  const P = (kind: Prop['kind'], x: number, z: number, rot = 0, s = 1, y?: number, v?: number) => props.push({ kind, x, y: y ?? ground(x, z), z, rot, s, v: v ?? r() });
  const solidProp = (kind: Prop['kind'], x: number, z: number, w: number, h: number, d: number, rot = 0, mat: SurfaceMat = 'metal', s = 1) => {
    const y = ground(x, z);
    P(kind, x, z, rot, s, y);
    const sw = Math.abs(Math.cos(rot)) > 0.7 ? w : d, sd = Math.abs(Math.cos(rot)) > 0.7 ? d : w;
    const b = m.box(x - sw / 2, y - 0.5, z - sd / 2, x + sw / 2, y + h, z + sd / 2, mat);
    b.hidden = true;
  };
  const bld = (x: number, z: number, w: number, d: number, floors: number, o: BuildingOpts) => {
    const res = building(m, props, r, x, z, w, d, floors, ground(x, z), o);
    loot.push(...res.loot);
    lamps.push(...res.lights);
    return res;
  };
  const sides: Side[] = ['n', 's', 'e', 'w'];
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  // City blocks
  for (let bx = 0; bx < 6; bx++)
    for (let bz = 0; bz < 6; bz++) {
      const cx = -150 + bx * 60, cz = -150 + bz * 60;
      const ring = Math.max(Math.abs(cx), Math.abs(cz));
      const y = cityY;
      if (cx === -30 && cz === -30) {
        // Central park
        for (let i = 0; i < 14; i++) props.push({ kind: 'bush', x: cx + (r() - 0.5) * 36, y, z: cz + (r() - 0.5) * 36, rot: r() * 6, s: 1 + r() });
        solidProp('well', cx, cz, 3, 1, 3, 0, 'concrete', 2);
        for (let i = 0; i < 6; i++) P('bench', cx + Math.cos(i) * 8, cz + Math.sin(i) * 8, i + Math.PI / 2);
        for (let i = 0; i < 4; i++) lamps.push({ x: cx + (i % 2 ? 12 : -12), y: y + 4.5, z: cz + (i < 2 ? 12 : -12) });
        continue;
      }
      if (cx === 30 && cz === 30) {
        // Meridian Spire landmark + plaza
        tower(m, props, r, cx, cz, 26, 26, 120, y, 'facade');
        props.push({ kind: 'billboard', x: cx, y: y + 14, z: cz - 13.2, rot: 0, s: 2 });
        loot.push({ x: cx + 16, y, z: cz + 16 });
        continue;
      }
      if (ring <= 30) {
        tower(m, props, r, cx - 10, cz - 2, 18, 22, 55 + r() * 45, y, 'facade');
        tower(m, props, r, cx + 12, cz + 6, 16, 18, 40 + r() * 35, y, 'facade');
        loot.push({ x: cx + 1, y, z: cz - 15 });
        continue;
      }
      const special = `${bx},${bz}`;
      const office: BuildingOpts = { wall: 'plaster', floor: 'tile', roof: 'concrete', door: 's', door2: 'n', furniture: 'office', roofAccess: true };
      switch (special) {
        case '0,0':
          loot.push(...garage(m, r, cx, cz, 36, 34, 4, y));
          continue;
        case '5,0':
          loot.push(...constructionSite(m, props, r, cx, cz, 30, 24, 5, y));
          continue;
        case '0,5': // hospital
          bld(cx, cz, 34, 22, 3, { ...office, wall: 'plaster', furniture: 'home', door: 's', door2: 'e' });
          props.push({ kind: 'sign', x: cx, y: y + 11.3, z: cz - 11.3, rot: 0, s: 2, v: 1 });
          continue;
        case '5,5': // police
          bld(cx - 6, cz, 26, 18, 2, { ...office, wall: 'brick', door: 's' });
          props.push({ kind: 'sign', x: cx - 6, y: y + 7.6, z: cz - 9.3, rot: 0, s: 1.5, v: 2 });
          for (let i = 0; i < 3; i++) solidProp('car', cx + 14, cz - 10 + i * 6, 4.4, 1.5, 1.9, Math.PI / 2, 'metal');
          continue;
        case '2,0': // fire station
          bld(cx, cz, 24, 18, 2, { ...office, wall: 'brick', hall: true, openFront: true, furniture: 'industrial', roofAccess: false });
          solidProp('truck', cx - 4, cz, 7.5, 3, 2.5, Math.PI / 2, 'metal');
          continue;
        case '3,5': // school
          bld(cx, cz, 34, 16, 2, { ...office, wall: 'brick', furniture: 'office' });
          continue;
        case '5,2': // hotel tower
          tower(m, props, r, cx, cz, 22, 20, 46, y, 'facade');
          loot.push({ x: cx - 15, y, z: cz });
          continue;
        case '1,4': // abandoned block
          bld(cx, cz, 18, 16, 3, { wall: 'plaster', floor: 'concrete', roof: 'concrete', door: 'w', door2: 'e', furniture: 'home', roofAccess: true, interiorLights: false });
          for (let i = 0; i < 6; i++) P('pallet', cx + (r() - 0.5) * 30, cz + 12 + r() * 6, r() * 3);
          continue;
      }
      // generic block: two buildings with an alley
      const tall = ring <= 90;
      for (const side of [-1, 1]) {
        const x = cx + side * 11;
        if (tall && r() < 0.45) {
          tower(m, props, r, x, cz, 17, 34, 22 + r() * 26, y, r() < 0.5 ? 'facade' : 'concrete');
        } else {
          const floors = tall ? 3 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3);
          const isShop = floors <= 2;
          bld(x, cz + (r() - 0.5) * 4, 16, 26 + r() * 6, floors, {
            wall: isShop ? 'plaster' : pick(['plaster', 'brick', 'concrete'] as SurfaceMat[]), floor: 'tile', roof: 'concrete',
            door: side < 0 ? 'w' : 'e', door2: r() < 0.6 ? 's' : undefined, furniture: isShop ? 'shop' : 'home', roofAccess: true,
          });
          if (isShop) props.push({ kind: 'sign', x: x + side * 8.2, y: y + 3.2, z: cz, rot: side < 0 ? -Math.PI / 2 : Math.PI / 2, s: 1, v: 3 + Math.floor(r() * 5) });
        }
      }
      // alley clutter
      solidProp('dumpster', cx, cz + 6, 1.8, 1.4, 1.2, 0, 'metal');
      P('bin', cx + 0.8, cz - 8);
      if (r() < 0.4) P('laundry', cx, cz - 2, Math.PI / 2, 1, y + 6);
    }
  // City street furniture
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      const ix = i * 60, iz = j * 60;
      if (Math.abs(i) <= 3 && Math.abs(j) <= 3 && (i + j) % 2 === 0 && Math.abs(i) < 3 && Math.abs(j) < 3) P('trafficLight', ix + 7, iz + 7, 0, 1, cityY);
      // lamps along streets (both axes)
      if (j < 3) {
        P('streetLight', ix + 7.5, iz + 30, Math.PI / 2, 1, cityY);
        lamps.push({ x: ix + 6, y: cityY + 6.2, z: iz + 30 });
      }
      if (i < 3) {
        P('streetLight', ix + 30, iz + 7.5, 0, 1, cityY);
        lamps.push({ x: ix + 30, y: cityY + 6.2, z: iz + 6 });
      }
      if (r() < 0.35 && j < 3) solidProp('car', ix - 4, iz + 15 + r() * 25, 4.4, 1.5, 1.9, 0, 'metal');
      if (r() < 0.25 && i < 3) solidProp('car', ix + 18 + r() * 25, iz - 4, 4.4, 1.5, 1.9, Math.PI / 2, 'metal');
      if (r() < 0.2 && j < 3) P('busStop', ix + 8.5, iz + 20, Math.PI / 2, 1, cityY);
      if (r() < 0.4 && i < 3) P('bench', ix + 20, iz + 8.5, 0, 1, cityY);
      if (r() < 0.3) P('utilityBox', ix + 8, iz - 8, 0, 1, cityY);
      if (r() < 0.3) P('cone', ix + (r() - 0.5) * 8, iz + (r() - 0.5) * 8, 0, 1, cityY);
    }
  // street trees
  for (let i = 0; i < 70; i++) {
    const along = -170 + r() * 340, line = (Math.floor(r() * 7) - 3) * 60 + (r() < 0.5 ? 8.2 : -8.2);
    const [x, z] = r() < 0.5 ? [along, line] : [line, along];
    props.push({ kind: 'bush', x, y: cityY, z, rot: 0, s: 1.3 });
  }

  // ── Ashford (west farming village, white plaster + terracotta) ──
  {
    const zc = ZONES.ashford;
    const homes: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.3, rad = 26 + r() * 30;
      homes.push([zc.x + Math.cos(a) * rad, zc.z + Math.sin(a) * rad]);
    }
    for (const [x, z] of homes) {
      if (Math.abs(z - 20) < 10) continue; // keep the highway clear
      bld(x, z, 8 + r() * 3, 9 + r() * 3, 1 + Math.floor(r() * 2), { wall: 'plaster', floor: 'wood', roof: 'roofing', door: pick(sides), furniture: 'home', roofAccess: false, pitched: true });
      if (r() < 0.6) P('laundry', x + 6, z, r() * 3, 1);
      for (let i = 0; i < 3; i++) props.push({ kind: 'bush', x: x + (r() - 0.5) * 14, y: ground(x, z), z: z + 7 + r() * 3, rot: 0, s: 0.7 });
    }
    // farm: barn, silo, hay, fields with fences
    bld(zc.x - 55, zc.z - 50, 22, 14, 2, { wall: 'wood', floor: 'wood', roof: 'roofing', door: 'e', furniture: 'industrial', roofAccess: false, hall: true });
    solidProp('storageTank', zc.x - 38, zc.z - 60, 5, 14, 5, 0, 'metal', 1);
    for (let i = 0; i < 8; i++) solidProp('haybale', zc.x - 60 + r() * 30, zc.z - 25 + r() * 12, 1.6, 1.2, 1.2, r() * 3, 'wood');
    for (let i = 0; i < 6; i++) m.box(zc.x + 40 + i * 6, ground(zc.x + 40 + i * 6, zc.z - 60) - 0.3, zc.z - 60.05, zc.x + 40 + i * 6 + 5.6, ground(zc.x + 40 + i * 6, zc.z - 60) + 1.1, zc.z - 59.95, 'wood');
    for (let i = 0; i < 6; i++) m.box(zc.x + 40 + i * 6, ground(zc.x + 40 + i * 6, zc.z - 90) - 0.3, zc.z - 90.05, zc.x + 40 + i * 6 + 5.6, ground(zc.x + 40 + i * 6, zc.z - 90) + 1.1, zc.z - 89.95, 'wood');
    solidProp('well', zc.x, zc.z + 8, 1.6, 1, 1.6, 0, 'brick');
    solidProp('waterTank', zc.x + 20, zc.z - 20, 3, 9, 3, 0, 'metal', 1.6);
    for (let i = 0; i < 10; i++) P('utilityPole', zc.x - 80 + i * 18, zc.z + 9, 0);
    for (let i = 0; i < 4; i++) lamps.push({ x: zc.x - 30 + i * 20, y: ground(zc.x, zc.z) + 5, z: zc.z + 9 });
  }

  // ── Millbrook (south-west river village, brick) ──
  {
    const zc = ZONES.millbrook;
    for (let i = 0; i < 10; i++) {
      const x = zc.x - 45 + (i % 5) * 22 + (r() - 0.5) * 6, z = zc.z + (i < 5 ? -22 : 22) + (r() - 0.5) * 6;
      bld(x, z, 9, 10, 2, { wall: 'brick', floor: 'wood', roof: 'roofing', door: i < 5 ? 'n' : 's', furniture: 'home', roofAccess: false, pitched: true });
      P('fence', x, z + (i < 5 ? 7 : -7), 0, 1);
    }
    bld(zc.x, zc.z, 18, 12, 1, { wall: 'brick', floor: 'tile', roof: 'roofing', door: 'e', door2: 'w', furniture: 'office', roofAccess: false, hall: true });
    solidProp('well', zc.x + 18, zc.z, 1.6, 1, 1.6, 0, 'brick');
    for (let i = 0; i < 5; i++) lamps.push({ x: zc.x - 40 + i * 20, y: ground(zc.x, zc.z) + 5, z: zc.z });
  }

  // ── Lakeview (wooden cabins on Mirror Lake) ──
  {
    const zc = ZONES.lakeview;
    for (let i = 0; i < 6; i++) {
      const x = zc.x - 30 + (i % 3) * 24 + r() * 4, z = zc.z - 12 + Math.floor(i / 3) * 24 + r() * 4;
      bld(x, z, 7, 8, 1, { wall: 'wood', floor: 'wood', roof: 'wood', door: 's', furniture: 'home', roofAccess: false, pitched: true });
    }
    const pierY = LAKES[0].level + 0.6;
    m.box(-298, pierY - 0.3, 247, -292, pierY, 268, 'wood');
    P('boat', -288, 262, 0.4, 1, LAKES[0].level);
    P('waterfall', -300, 251, 0, 1, LAKES[0].level - 2);
  }

  // ── Northgate Works (industrial) ──
  {
    const zc = ZONES.industrial;
    const y = zc.level!;
    const ind: BuildingOpts = { wall: 'metal', floor: 'concrete', roof: 'metal', door: 's', door2: 'n', furniture: 'industrial', roofAccess: false, hall: true };
    bld(zc.x - 40, zc.z + 30, 50, 30, 3, ind);
    bld(zc.x + 40, zc.z + 35, 40, 24, 2, ind);
    bld(zc.x - 50, zc.z - 35, 36, 20, 2, { ...ind, wall: 'concrete', furniture: 'shop' });
    bld(zc.x + 45, zc.z - 40, 36, 20, 2, { ...ind, wall: 'concrete', furniture: 'shop' });
    for (let i = 0; i < 4; i++) solidProp('storageTank', zc.x + 5 + (i % 2) * 14, zc.z - 5 + Math.floor(i / 2) * 14, 10, 12, 10, 0, 'metal', 1.4);
    solidProp('smokestack', zc.x - 70, zc.z + 55, 4, 40, 4, 0, 'brick', 1);
    solidProp('smokestack', zc.x - 62, zc.z + 55, 4, 34, 4, 0, 'brick', 0.85);
    for (let i = 0; i < 6; i++) m.container(zc.x - 10 + (i % 3) * 7, zc.z - 70 + Math.floor(i / 3) * 3, true, (['containerRed', 'containerBlue', 'containerYellow', 'containerGreen'] as SurfaceMat[])[i % 4], y);
    m.container(zc.x - 3, zc.z - 70, true, 'containerGreen', y + 2.6);
    P('crane', zc.x + 20, zc.z - 72, 0.5, 1, y);
    P('conveyor', zc.x - 15, zc.z + 30, 0, 1, y);
    m.add({ kind: 'pipe', x1: zc.x - 15, y1: y + 6, z1: zc.z + 15, x2: zc.x + 20, y2: y + 6, z2: zc.z + 23, r: 0.6, color: 0x8a6a4a });
    m.add({ kind: 'pipe', x1: zc.x + 12, y1: y + 9, z1: zc.z - 5, x2: zc.x + 12, y2: y + 9, z2: zc.z + 23, r: 0.4, color: 0x6b6f75 });
    m.box(zc.x + 70, y, zc.z - 10, zc.x + 90, y + 4, zc.z + 10, 'metal'); // substation
    for (let i = 0; i < 8; i++) P('pylon', zc.x - 80 - i * 45, zc.z - 120 - i * 25, 0.5, 1);
    for (let i = 0; i < 6; i++) lamps.push({ x: zc.x - 60 + i * 24, y: y + 8, z: zc.z });
    for (let i = 0; i < 10; i++) P('barrel', zc.x - 30 + r() * 60, zc.z - 55 + r() * 15, r() * 3);
  }

  // ── Kestrel Airfield ──
  {
    const zc = ZONES.airport;
    const y = zc.level!;
    m.add({ kind: 'runway', x1: zc.x - 140, z1: zc.z + 50, x2: zc.x + 140, z2: zc.z + 78, y: y + 0.03 });
    for (let iz = 0; iz < N; iz++)
      for (let ix = 0; ix < N; ix++) {
        const x = wx(ix), z = wx(iz);
        if (x > zc.x - 145 && x < zc.x + 145 && z > zc.z + 46 && z < zc.z + 82) roadMask[iz * N + ix] = 1;
        if (x > zc.x - 100 && x < zc.x + 60 && z > zc.z - 30 && z < zc.z + 46) roadMask[iz * N + ix] = 3;
      }
    for (let i = 0; i < 3; i++) bld(zc.x - 90 + i * 40, zc.z - 50, 32, 26, 3, { wall: 'metal', floor: 'concrete', roof: 'metal', door: 's', furniture: 'industrial', roofAccess: false, hall: true, openFront: true });
    // terminal + control tower
    bld(zc.x + 60, zc.z - 45, 40, 18, 2, { wall: 'facade', floor: 'tile', roof: 'concrete', door: 's', door2: 'n', furniture: 'shop', roofAccess: true });
    bld(zc.x + 100, zc.z - 20, 9, 9, 5, { wall: 'concrete', floor: 'tile', roof: 'concrete', door: 's', furniture: 'office', roofAccess: true });
    P('radar', zc.x + 120, zc.z - 50, 0, 1);
    P('plane', zc.x - 20, zc.z + 20, 0.3, 1);
    solidProp('wreck', zc.x + 80, zc.z + 25, 10, 3, 6, 1.1, 'metal');
    for (let i = 0; i < 12; i++) lamps.push({ x: zc.x - 130 + i * 24, y: y + 0.5, z: zc.z + 46 });
    for (let i = 0; i < 4; i++) solidProp('truck', zc.x - 40 + i * 8, zc.z - 20, 7.5, 3, 2.5, 0, 'metal');
  }

  // ── Fort Talon (military) ──
  {
    const zc = ZONES.military;
    const y = zc.level!;
    const wall = (x1: number, z1: number, x2: number, z2: number) => m.box(x1, y - 0.5, z1, x2, y + 3.2, z2, 'concrete');
    wall(zc.x - 60, zc.z - 50, zc.x + 60, zc.z - 49);
    wall(zc.x - 60, zc.z + 49, zc.x - 6, zc.z + 50);
    wall(zc.x + 6, zc.z + 49, zc.x + 60, zc.z + 50); // gate gap facing north (road)
    wall(zc.x - 61, zc.z - 50, zc.x - 60, zc.z + 50);
    wall(zc.x + 60, zc.z - 50, zc.x + 61, zc.z + 50);
    for (const [gx, gz] of [[-55, -45], [55, -45], [-55, 45], [55, 45]]) {
      const x = zc.x + gx, z = zc.z + gz;
      m.platform(x - 2, z - 2, x + 2, z + 2, y + 5, 'metal');
      m.stairs(x - 1, z + (gz > 0 ? -2 - 5 : 2), x + 1, z + (gz > 0 ? -2 : 2 + 5), 5, gz > 0 ? '+z' : '-z', 'metal', y, true);
      P('guardTower', x, z, 0, 1, y);
      lamps.push({ x, y: y + 7.5, z });
    }
    const mil: BuildingOpts = { wall: 'concrete', floor: 'concrete', roof: 'metal', door: 'e', furniture: 'military', roofAccess: true };
    bld(zc.x - 30, zc.z - 15, 12, 30, 1, mil);
    bld(zc.x - 8, zc.z - 15, 12, 30, 1, mil);
    bld(zc.x + 32, zc.z - 20, 30, 20, 2, { ...mil, hall: true, roofAccess: false, furniture: 'industrial', openFront: true });
    // partially buried bunker
    const by = y - 1.8;
    m.box(zc.x + 15, by, zc.z + 22, zc.x + 35, by + 0.3, zc.z + 36, 'concrete');
    m.box(zc.x + 15, by, zc.z + 22, zc.x + 15.4, y + 1.2, zc.z + 36, 'concrete');
    m.box(zc.x + 34.6, by, zc.z + 22, zc.x + 35, y + 1.2, zc.z + 36, 'concrete');
    m.box(zc.x + 15, by, zc.z + 35.6, zc.x + 35, y + 1.2, zc.z + 36, 'concrete');
    m.box(zc.x + 15, y + 1.2, zc.z + 22, zc.x + 35, y + 1.8, zc.z + 36, 'concrete');
    m.box(zc.x + 19, by, zc.z + 22, zc.x + 35, y + 1.2, zc.z + 22.4, 'concrete');
    m.stairs(zc.x + 15.4, zc.z + 16, zc.x + 19, zc.z + 22.4, 1.8, '-z', 'concrete', by);
    loot.push({ x: zc.x + 25, y: by + 0.3, z: zc.z + 30 }, { x: zc.x + 30, y: by + 0.3, z: zc.z + 26 });
    for (let i = 0; i < 5; i++) solidProp('truck', zc.x - 40 + i * 8, zc.z + 30, 7.5, 3, 2.5, Math.PI / 2, 'metal');
  }

  // ── Saltmarsh Harbor & Copper Bay beach ──
  {
    const zc = ZONES.harbor;
    const y = zc.level!;
    // piers heading south-east into the sea
    for (const [ox, oz] of [[20, -40], [45, -15]]) {
      const x0 = zc.x + ox, z0 = zc.z + oz;
      for (let i = 0; i < 10; i++) m.box(x0 + i * 5, 0.9, z0 - i * 5 - 3, x0 + i * 5 + 5.5, 1.6, z0 - i * 5 + 3, 'wood');
      P('boat', x0 + 30, z0 - 36, 0.8, 1.2, 0);
      lamps.push({ x: x0 + 45, y: 4, z: z0 - 45 });
    }
    bld(zc.x - 25, zc.z + 20, 30, 18, 2, { wall: 'metal', floor: 'concrete', roof: 'metal', door: 's', door2: 'e', furniture: 'industrial', roofAccess: false, hall: true });
    for (let i = 0; i < 4; i++) bld(zc.x - 30 + i * 13, zc.z - 25, 6, 6, 1, { wall: 'wood', floor: 'wood', roof: 'wood', door: 's', furniture: 'home', roofAccess: false, pitched: true });
    for (let i = 0; i < 4; i++) m.container(zc.x + 15 + (i % 2) * 7, zc.z + 25 + Math.floor(i / 2) * 3, true, i % 2 ? 'containerBlue' : 'containerRed', y);
    P('crane', zc.x + 30, zc.z + 5, 2.2, 1, y);
    solidProp('lighthouse', zc.x + 95, zc.z - 95, 5, 26, 5, 0, 'plaster', 1);
    lamps.push({ x: zc.x + 95, y: 27, z: zc.z - 95 });
    // beach details along the coast
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const x = lerp(560, 30, t) + (r() - 0.5) * 16, z = lerp(-40, -560, t) + (r() - 0.5) * 16;
      if (Math.abs(x - zc.x) < 70 && Math.abs(z - zc.z) < 70) continue;
      if (r() < 0.5) P('umbrella', x, z, r() * 6);
      else solidProp('rock', x, z, 2, 1.2, 2, r() * 6, 'rock', 1 + r());
    }
    solidProp('guardTower', 430, -230, 3, 4.5, 3, 0, 'wood', 0.8);
    bld(470, -150, 14, 10, 1, { wall: 'plaster', floor: 'tile', roof: 'wood', door: 's', door2: 'w', furniture: 'shop', roofAccess: true, interiorLights: false });
  }

  // ── Frostpeak summit radio mast & mountain viewpoint ──
  let peak = { x: 0, z: 400, h: -Infinity };
  for (let iz = 0; iz < N; iz += 2)
    for (let ix = 0; ix < N; ix += 2) {
      const x = wx(ix), z = wx(iz);
      if (Math.abs(x) > HALF - 40 || Math.abs(z) > HALF - 40) continue;
      if (H[iz * N + ix] > peak.h) peak = { x, z, h: H[iz * N + ix] };
    }
  POIS.find((p) => p.name === 'Frostpeak')!.x = peak.x;
  POIS.find((p) => p.name === 'Frostpeak')!.z = peak.z;
  solidProp('antenna', peak.x, peak.z, 2, 30, 2, 0, 'metal', 6);
  lamps.push({ x: peak.x, y: peak.h + 32, z: peak.z });
  {
    const vx = -60, vz = 400, vy = ground(vx, vz);
    m.platform(vx - 4, vz - 4, vx + 4, vz + 4, vy + 0.4, 'wood');
    P('bench', vx, vz + 2, 0, 1, vy + 0.4);
    P('sign', vx - 3, vz - 3, 0, 1, vy, 0);
  }

  // ───────────── vegetation ─────────────
  const inZone = (x: number, z: number, pad = 0) => Object.values(ZONES).some((zf) => Math.abs(x - zf.x) < zf.hw + pad && Math.abs(z - zf.z) < zf.hd + pad);
  const treeList: number[] = [];
  const isWater = (x: number, z: number) => {
    if (coastCoord(x, z) > 418) return true;
    for (const lk of LAKES) if (Math.hypot(x - lk.x, z - lk.z) < lk.r + 3) return true;
    const rv = riverAt(x, z);
    return rv.d < rv.hw + 3;
  };
  const roadNear = (x: number, z: number) => {
    const ix = Math.round((x - ORIGIN) / CELL), iz = Math.round((z - ORIGIN) / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const k = Math.max(0, Math.min(N - 1, iz + b)) * N + Math.max(0, Math.min(N - 1, ix + a));
      if (roadMask[k]) return true;
    }
    return false;
  };
  for (let gz = -HALF + 4; gz < HALF; gz += 6)
    for (let gx = -HALF + 4; gx < HALF; gx += 6) {
      const x = gx + (r() - 0.5) * 5.5, z = gz + (r() - 0.5) * 5.5;
      const fn = noise.fbm(x * 0.008 + 200, z * 0.008, 3);
      let density = 0.03;
      let kind = 1;
      if (x < -150 && z > 80) {
        density = 0.42 + fn * 0.45;
        kind = 0;
      } else if (x < -150 && z < -120) {
        density = 0.32 + fn * 0.4;
        kind = r() < 0.5 ? 0 : 1;
      } else if (z > 150 && x < 200) {
        density = 0.22 + fn * 0.3;
        kind = 0;
      } else if (x < -100) {
        density = 0.08 + fn * 0.12;
        kind = 1;
      } else if (inZone(x, z, 40) && Math.abs(x - ZONES.industrial.x) < 200 && Math.abs(z - ZONES.industrial.z) < 200) {
        density = 0.015;
        kind = 3;
      }
      const c = coastCoord(x, z);
      if (c > 355 && c < 415) {
        density = 0.08;
        kind = 2;
      }
      if (r() > density) continue;
      if (inZone(x, z, 6) || isWater(x, z) || roadNear(x, z)) continue;
      const h = ground(x, z);
      if (h > 128 + noise.noise(x * 0.02, z * 0.02) * 10) continue;
      if (terrain.slopeAt(x, z) > 0.85) continue;
      if (h > 95 && kind !== 2) kind = 0;
      if (kind !== 2 && r() < 0.06) kind = 3;
      if (kind !== 2 && r() < 0.1) kind = 4;
      const s = kind === 0 ? 0.9 + r() * 0.8 : kind === 4 ? 0.5 + r() * 0.3 : 0.8 + r() * 0.6;
      treeList.push(x, h, z, s, r() * Math.PI * 2, kind);
      if (kind !== 4) {
        const t = 0.25 * s + 0.1;
        const b = m.box(x - t, h - 0.5, z - t, x + t, h + 5 * s, z + t, 'wood');
        b.hidden = true;
      }
      // undergrowth near trees
      if (r() < 0.25) props.push({ kind: 'bush', x: x + (r() - 0.5) * 4, y: h, z: z + (r() - 0.5) * 4, rot: r() * 6, s: 0.6 + r() * 0.7 });
      if (r() < 0.03 && kind !== 2) solidProp('log', x + 3, z + 2, 5, 0.8, 0.8, r() * 3, 'wood');
    }
  // boulders on slopes / mountains
  for (let i = 0; i < 700; i++) {
    const x = (r() - 0.5) * 2 * (HALF - 10), z = (r() - 0.5) * 2 * (HALF - 10);
    const h = ground(x, z);
    const slope = terrain.slopeAt(x, z);
    if (inZone(x, z, 4) || isWater(x, z) || roadNear(x, z)) continue;
    if (h < 25 && slope < 0.3 && r() < 0.7) continue;
    const s = 0.8 + r() * (h > 60 ? 3 : 1.5);
    props.push({ kind: 'rock', x, y: h, z, rot: r() * 6, s });
    if (s > 1.2) {
      const b = m.box(x - s * 0.8, h - 1, z - s * 0.8, x + s * 0.8, h + s * 0.9, z + s * 0.8, 'rock');
      b.hidden = true;
    }
  }

  // ───────────── boundary ─────────────
  m.box(-HALF - 2, -50, -HALF - 2, -HALF, 400, HALF + 2, 'concrete', true);
  m.box(HALF, -50, -HALF - 2, HALF + 2, 400, HALF + 2, 'concrete', true);
  m.box(-HALF, -50, -HALF - 2, HALF, 400, -HALF, 'concrete', true);
  m.box(-HALF, -50, HALF, HALF, 400, HALF + 2, 'concrete', true);

  // ───────────── spawns, drops, loot ─────────────
  const cityPts: { x: number; y: number; z: number; yaw: number }[] = [];
  for (let i = -2; i <= 2; i++)
    for (const j of [-2, 2]) {
      const x = i * 60, z = j * 60;
      cityPts.push({ x, y: cityY, z, yaw: Math.atan2(x, z) });
      cityPts.push({ x: z, y: cityY, z: x, yaw: Math.atan2(z, x) });
    }
  const drops: Vec3[] = POIS.filter((p) => p.kind !== 'landmark').map((p) => ({ x: p.x, y: ground(p.x, p.z), z: p.z }));
  for (const p of POIS.filter((q) => q.kind === 'nature')) for (let i = 0; i < 3; i++) loot.push({ x: p.x + (r() - 0.5) * 30, y: 0, z: p.z + (r() - 0.5) * 30 });
  for (const l of loot) if (l.y === 0) l.y = ground(l.x, l.z);
  const all = m.solids as Solid[];
  const world: WorldData = {
    terrain, roadMask, wetMask, sandMask, oceanLevel: 0, coast: 418, lakes: LAKES, river, roads,
    trees: new Float32Array(treeList), props, pois: POIS, lamps, lootSpots: loot, royaleDrops: drops, half: HALF, seed: SEED,
  };
  const whole = { minX: -HALF, maxX: HALF, minY: -60, maxY: 400, minZ: -HALF, maxZ: HALF };
  return {
    id: 'frontier',
    name: 'Frontier',
    description: 'A 1.2 km open world: city, villages, airfield, industry, harbour, forests, rivers and snowy peaks.',
    bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF },
    solids: all,
    spawnBarriers: [],
    attackSpawns: [{ x: -38, y: cityY, z: -40 }, { x: -22, y: cityY, z: -40 }],
    defendSpawns: [{ x: -38, y: cityY, z: -20 }],
    attackYaw: 0,
    defendYaw: Math.PI,
    attackZone: whole,
    defendZone: whole,
    sites: [],
    tdmSpawns: cityPts,
    decor: m.decor,
    env: {
      skyTop: 0x3a6db5, skyBottom: 0xbfd6ea, fog: 0xb8c8d8, fogDensity: 0.0022,
      sunColor: 0xfff1d6, sunIntensity: 2.6, sunDir: { x: -0.4, y: 0.8, z: 0.3 },
      hemiSky: 0xbcd4ff, hemiGround: 0x4a3f30, hemiIntensity: 1, wet: false, time: 9, weather: 'clear', timeMode: 'cycle', dynamicWeather: true,
    },
    materials: ['concrete', 'brick', 'metal', 'plaster', 'facade', 'roofing', 'wood', 'fabric', 'tile', 'rock'],
    world,
  };
}
