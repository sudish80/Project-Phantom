import * as THREE from 'three';
import type { SurfaceMat } from '@phantom/shared';

/** Seeded RNG so procedural textures are identical every launch. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, colors: string[], size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size * (0.5 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
}

function blotches(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, color: string, maxR: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = maxR * (0.3 + r());
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

function toTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

function concrete(seed: number, base = '#8b8781') {
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, r, 40, 'rgba(60,55,50,0.18)', 90);
  blotches(g, S, S, r, 25, 'rgba(255,250,240,0.06)', 70);
  speckle(g, S, S, r, 9000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)', 'rgba(90,85,80,0.2)'], 1.5);
  // formwork seams + tie holes
  g.strokeStyle = 'rgba(30,28,26,0.35)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  g.beginPath();
  g.moveTo(0, S / 2);
  g.lineTo(S, S / 2);
  g.stroke();
  g.fillStyle = 'rgba(25,22,20,0.55)';
  for (const [x, y] of [[64, 64], [448, 64], [64, 320], [448, 320], [256, 192], [256, 448]]) {
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  // drip stains from top
  for (let i = 0; i < 14; i++) {
    const x = r() * S;
    const grd = g.createLinearGradient(x, 0, x, S * (0.3 + r() * 0.5));
    grd.addColorStop(0, 'rgba(40,35,30,0.25)');
    grd.addColorStop(1, 'rgba(40,35,30,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 4 + r() * 10, S);
  }
  return c;
}

function brick(seed: number) {
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = '#4a3a33';
  g.fillRect(0, 0, S, S);
  const bh = 32, bw = 96;
  for (let row = 0; row < S / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let x = -bw; x < S + bw; x += bw) {
      const v = 0.75 + r() * 0.35;
      g.fillStyle = `rgb(${Math.floor(128 * v)},${Math.floor(70 * v)},${Math.floor(55 * v)})`;
      g.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
    }
  }
  speckle(g, S, S, r, 6000, ['rgba(0,0,0,0.18)', 'rgba(255,220,200,0.07)'], 1.5);
  blotches(g, S, S, r, 18, 'rgba(20,15,12,0.25)', 80);
  return c;
}

function metal(seed: number, base = '#4c5259') {
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
    g.fillRect(0, y, S, 1);
  }
  g.strokeStyle = 'rgba(10,12,14,0.6)';
  g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    g.beginPath();
    g.moveTo(0, (i * S) / 2);
    g.lineTo(S, (i * S) / 2);
    g.stroke();
    g.beginPath();
    g.moveTo((i * S) / 2, 0);
    g.lineTo((i * S) / 2, S);
    g.stroke();
  }
  g.fillStyle = 'rgba(200,205,210,0.5)';
  for (let x = 12; x < S; x += 64) for (const y of [10, S / 2 - 10, S / 2 + 10, S - 10]) g.fillRect(x, y, 4, 4);
  blotches(g, S, S, r, 20, 'rgba(110,70,40,0.18)', 60);
  speckle(g, S, S, r, 3000, ['rgba(0,0,0,0.2)'], 1);
  return c;
}

function floor(seed: number) {
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = '#6f6c68';
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, r, 50, 'rgba(40,38,35,0.18)', 110);
  speckle(g, S, S, r, 12000, ['rgba(0,0,0,0.1)', 'rgba(255,255,255,0.05)'], 1.5);
  g.strokeStyle = 'rgba(30,28,26,0.5)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(0, (i * S) / 4);
    g.lineTo(S, (i * S) / 4);
    g.stroke();
    g.beginPath();
    g.moveTo((i * S) / 4, 0);
    g.lineTo((i * S) / 4, S);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = 'rgba(20,18,16,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    let x = r() * S, y = r() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * 60;
      y += (r() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

function asphalt(seed: number) {
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = '#26272b';
  g.fillRect(0, 0, S, S);
  speckle(g, S, S, r, 20000, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.3)', 'rgba(120,120,130,0.12)'], 1.6);
  blotches(g, S, S, r, 30, 'rgba(0,0,0,0.3)', 100);
  // puddle highlights (wet look)
  blotches(g, S, S, r, 10, 'rgba(70,60,110,0.2)', 80);
  g.fillStyle = 'rgba(230,200,60,0.55)';
  g.fillRect(S / 2 - 4, 0, 8, S * 0.4);
  return c;
}

function crate(seed: number) {
  const S = 256;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = '#6b5136';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) {
    g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.12})`;
    g.fillRect(0, y, S, 32);
    g.fillStyle = 'rgba(30,20,10,0.6)';
    g.fillRect(0, y, S, 2);
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(40,25,10,${r() * 0.25})`;
    g.fillRect(r() * S, r() * S, 10 + r() * 30, 1);
  }
  g.strokeStyle = '#3d2c1b';
  g.lineWidth = 20;
  g.strokeRect(10, 10, S - 20, S - 20);
  g.beginPath();
  g.moveTo(14, 14);
  g.lineTo(S - 14, S - 14);
  g.stroke();
  g.fillStyle = 'rgba(20,20,20,0.6)';
  g.font = 'bold 28px sans-serif';
  g.fillText('PHX', S / 2 + 10, S / 2 + 46);
  return c;
}

function container(seed: number, color: string) {
  const S = 512;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 24) {
    const grd = g.createLinearGradient(x, 0, x + 24, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.25)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 24, S);
  }
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, S, 18);
  g.fillRect(0, S - 18, S, 18);
  g.fillRect(0, 0, 14, S);
  g.fillRect(S - 14, 0, 14, S);
  blotches(g, S, S, r, 30, 'rgba(110,55,25,0.3)', 50);
  speckle(g, S, S, r, 4000, ['rgba(80,40,20,0.35)', 'rgba(0,0,0,0.2)'], 2);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = 'bold 34px sans-serif';
  g.fillText(`PHX ${Math.floor(100000 + r() * 899999)}`, 40, 80);
  g.font = '18px sans-serif';
  g.fillText('MAX GROSS 30,480 KG', 40, 110);
  return c;
}

function trim() {
  const S = 256;
  const { c, g } = canvas(S, S);
  g.fillStyle = '#1b1b1b';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#e8b41c';
  for (let i = -S; i < S * 2; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 32, 0);
    g.lineTo(i + 32 - S, S);
    g.lineTo(i - S, S);
    g.closePath();
    g.fill();
  }
  return c;
}


function windowsWall(seed: number, base: string, glass: boolean) {
  const S = 512;
  const { c, g } = canvas(S, S);
  const e = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  if (!glass) {
    blotches(g, S, S, r, 30, 'rgba(60,55,50,0.15)', 80);
    speckle(g, S, S, r, 6000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.06)'], 1.5);
  }
  e.g.fillStyle = '#000';
  e.g.fillRect(0, 0, S, S);
  // 4 m texture: two storeys x two bays of windows
  const cols = glass ? 6 : 2, rows = glass ? 6 : 2;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const w = glass ? S / cols - 8 : 90, h = glass ? S / rows - 10 : 120;
      const x = (i + 0.5) * (S / cols) - w / 2, y = (j + 0.5) * (S / rows) - h / 2;
      g.fillStyle = glass ? `rgb(${30 + r() * 20},${45 + r() * 25},${60 + r() * 30})` : '#2a3440';
      g.fillRect(x, y, w, h);
      if (!glass) {
        g.strokeStyle = '#d8d2c4';
        g.lineWidth = 6;
        g.strokeRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x + 6, y + 6, w * 0.4, h - 12);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(x, y, w, h * 0.35);
      }
      if (r() < (glass ? 0.28 : 0.35)) {
        const warm = r() < 0.7;
        e.g.fillStyle = warm ? `rgb(${230 + r() * 25},${180 + r() * 50},${110 + r() * 60})` : `rgb(${150},${200},${255})`;
        e.g.fillRect(x + 2, y + 2, w - 4, h - 4);
      }
    }
  if (glass) {
    g.fillStyle = 'rgba(120,130,140,0.9)';
    for (let i = 0; i <= cols; i++) g.fillRect(i * (S / cols) - 2, 0, 4, S);
    for (let j = 0; j <= rows; j++) g.fillRect(0, j * (S / rows) - 3, S, 6);
  }
  return { map: toTexture(c), emissive: toTexture(e.c) };
}

function roofTiles(seed: number) {
  const S = 256;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = '#7a3524';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16)
    for (let x = (y / 16) % 2 ? -16 : 0; x < S; x += 32) {
      const v = 0.8 + r() * 0.35;
      g.fillStyle = `rgb(${Math.floor(150 * v)},${Math.floor(68 * v)},${Math.floor(46 * v)})`;
      g.beginPath();
      g.ellipse(x + 16, y + 10, 15, 10, 0, 0, Math.PI);
      g.fill();
    }
  blotches(g, S, S, r, 12, 'rgba(30,30,20,0.25)', 50);
  return c;
}

function planks(seed: number, base: string) {
  const S = 256;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 32) {
    g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.15})`;
    g.fillRect(x, 0, 32, S);
    g.fillStyle = 'rgba(25,15,8,0.6)';
    g.fillRect(x, 0, 2, S);
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(40,25,10,${r() * 0.25})`;
    g.fillRect(r() * S, r() * S, 1, 10 + r() * 40);
  }
  return c;
}

function floorTiles(seed: number) {
  const S = 256;
  const { c, g } = canvas(S, S);
  const r = rng(seed);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const v = 0.85 + r() * 0.15;
      g.fillStyle = `rgb(${Math.floor(200 * v)},${Math.floor(196 * v)},${Math.floor(188 * v)})`;
      g.fillRect(x * 64, y * 64, 64, 64);
    }
  g.strokeStyle = 'rgba(80,75,70,0.6)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, S);
    g.moveTo(0, i * 64);
    g.lineTo(S, i * 64);
    g.stroke();
  }
  return c;
}

/** Materials that glow at night (window illumination); intensity driven by MapRenderer.setNight. */
export const nightMaterials: THREE.MeshStandardMaterial[] = [];

export interface SurfaceInfo {
  material: THREE.Material;
  uv: 'world' | 'fit';
  scale: number;
}

export function makeSurface(mat: SurfaceMat, wet: boolean): SurfaceInfo {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  switch (mat) {
    case 'concrete':
      return { material: std({ map: cached('concrete', () => toTexture(concrete(11))), roughness: wet ? 0.55 : 0.92, metalness: 0 }), uv: 'world', scale: 4 };
    case 'brick':
      return { material: std({ map: cached('brick', () => toTexture(brick(5))), roughness: wet ? 0.6 : 0.9 }), uv: 'world', scale: 3 };
    case 'metal':
      return { material: std({ map: cached('metal', () => toTexture(metal(7))), roughness: 0.42, metalness: 0.75 }), uv: 'world', scale: 3 };
    case 'floor':
      return { material: std({ map: cached('floor', () => toTexture(floor(3))), roughness: 0.82, metalness: 0.05 }), uv: 'world', scale: 8 };
    case 'asphalt':
      return { material: std({ map: cached('asphalt', () => toTexture(asphalt(9))), roughness: wet ? 0.18 : 0.85, metalness: wet ? 0.35 : 0 }), uv: 'world', scale: 10 };
    case 'crate':
      return { material: std({ map: cached('crate', () => toTexture(crate(13))), roughness: 0.85 }), uv: 'fit', scale: 1 };
    case 'containerRed':
      return { material: std({ map: cached('cR', () => toTexture(container(21, '#8e2a22'))), roughness: 0.55, metalness: 0.45 }), uv: 'fit', scale: 1 };
    case 'containerBlue':
      return { material: std({ map: cached('cB', () => toTexture(container(22, '#1f4f7a'))), roughness: 0.55, metalness: 0.45 }), uv: 'fit', scale: 1 };
    case 'containerYellow':
      return { material: std({ map: cached('cY', () => toTexture(container(23, '#b9861f'))), roughness: 0.55, metalness: 0.45 }), uv: 'fit', scale: 1 };
    case 'containerGreen':
      return { material: std({ map: cached('cG', () => toTexture(container(24, '#2f5a3b'))), roughness: 0.55, metalness: 0.45 }), uv: 'fit', scale: 1 };
    case 'trim':
      return { material: std({ map: cached('trim', () => toTexture(trim())), roughness: 0.6, metalness: 0.3 }), uv: 'world', scale: 1.5 };
    case 'glass':
      return { material: std({ color: 0x88aacc, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.9 }), uv: 'fit', scale: 1 };
    case 'plaster': {
      const t = cached('plasterW', () => {
        const w = windowsWall(31, '#cfc6b4', false);
        return Object.assign(w.map, { userData: { emissive: w.emissive } });
      });
      const m = std({ map: t, emissiveMap: t.userData.emissive as THREE.Texture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.88 });
      nightMaterials.push(m);
      return { material: m, uv: 'world', scale: 6.8 };
    }
    case 'facade': {
      const t = cached('facadeW', () => {
        const w = windowsWall(41, '#2a3440', true);
        return Object.assign(w.map, { userData: { emissive: w.emissive } });
      });
      const m = std({ map: t, emissiveMap: t.userData.emissive as THREE.Texture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.15, metalness: 0.6 });
      nightMaterials.push(m);
      return { material: m, uv: 'world', scale: 20 };
    }
    case 'roofing':
      return { material: std({ map: cached('roofing', () => toTexture(roofTiles(51))), roughness: 0.8 }), uv: 'world', scale: 3 };
    case 'wood':
      return { material: std({ map: cached('wood', () => toTexture(planks(61, '#7a5a3a'))), roughness: 0.85 }), uv: 'world', scale: 2.5 };
    case 'fabric':
      return { material: std({ color: 0x5a6a8a, roughness: 1 }), uv: 'world', scale: 2 };
    case 'tile':
      return { material: std({ map: cached('tile', () => toTexture(floorTiles(71))), roughness: 0.4 }), uv: 'world', scale: 2.4 };
    case 'rock':
      return { material: std({ map: cached('concrete2', () => toTexture(concrete(77, '#6e6a64'))), roughness: 0.95 }), uv: 'world', scale: 3 };
    case 'snow':
      return { material: std({ color: 0xeef2f8, roughness: 0.9 }), uv: 'world', scale: 4 };
    case 'barrier':
    default:
      return { material: std({ color: 0x777777 }), uv: 'world', scale: 4 };
  }
}

/** Text rendered into an emissive texture (neon signs, markers). */
export function textTexture(text: string, color: string, w = 512, h = 128, opts: { bg?: string; font?: string; glow?: boolean } = {}) {
  const { c, g } = canvas(w, h);
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = opts.font ?? `bold ${Math.floor(h * 0.62)}px Bahnschrift, 'Arial Narrow', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (opts.glow !== false) {
    g.shadowColor = color;
    g.shadowBlur = h * 0.18;
  }
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + h * 0.03);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.55;
  g.fillText(text, w / 2, h / 2 + h * 0.03);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function softDotTexture() {
  return cached('softdot', () => {
    const { c, g } = canvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function smokeTexture() {
  return cached('smoke', () => {
    const { c, g } = canvas(128, 128);
    const r = rng(77);
    for (let i = 0; i < 24; i++) {
      const x = 32 + r() * 64, y = 32 + r() * 64, rad = 18 + r() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function windowsTexture(seed: number, tint: string) {
  return cached(`win${seed}${tint}`, () => {
    const { c, g } = canvas(128, 256);
    const r = rng(seed);
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, 128, 256);
    for (let y = 6; y < 256; y += 12) {
      for (let x = 6; x < 128; x += 10) {
        if (r() < 0.32) {
          g.fillStyle = r() < 0.2 ? tint : `rgba(255,${200 + r() * 55},${150 + r() * 80},${0.4 + r() * 0.5})`;
          g.fillRect(x, y, 6, 7);
        }
      }
    }
    return toTexture(c);
  });
}

export function noiseNormalTexture() {
  return cached('waterN', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const img = g.createImageData(S, S);
    const r = rng(99);
    const h = new Float32Array(S * S);
    for (let i = 0; i < 40; i++) {
      const cx = r() * S, cy = r() * S, rad = 10 + r() * 50, amp = r() - 0.5;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          let dx = Math.abs(x - cx), dy = Math.abs(y - cy);
          dx = Math.min(dx, S - dx);
          dy = Math.min(dy, S - dy);
          const d = Math.hypot(dx, dy);
          if (d < rad) h[y * S + x] += amp * (1 - d / rad);
        }
    }
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
        const hy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
        const i = (y * S + x) * 4;
        img.data[i] = 128 + hx * 200;
        img.data[i + 1] = 128 + hy * 200;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const t = toTexture(c, false);
    return t;
  });
}

export function siteLetterTexture(letter: string) {
  return cached('site' + letter, () => {
    const { c, g } = canvas(256, 256);
    g.strokeStyle = 'rgba(255,90,54,0.8)';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(128, 128, 110, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,90,54,0.85)';
    g.font = 'bold 150px Bahnschrift, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 128, 136);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
