import * as THREE from 'three';

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

function make(size: number, seed: number, draw: (g: CanvasRenderingContext2D, r: () => number, S: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, rng(seed), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}

const speck = (g: CanvasRenderingContext2D, r: () => number, S: number, n: number, cols: string[], sz = 2) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    const s = sz * (0.4 + r());
    g.fillRect(r() * S, r() * S, s, s);
  }
};

const blot = (g: CanvasRenderingContext2D, r: () => number, S: number, n: number, col: string, rad: number) => {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, rr = rad * (0.4 + r());
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
        grd.addColorStop(0, col);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2);
      }
  }
};

/** Procedural, tileable terrain layer textures (original). */
export function terrainTextures() {
  const S = 256;
  return {
    grass: make(S, 1, (g, r) => {
      g.fillStyle = '#4c6b2d';
      g.fillRect(0, 0, S, S);
      blot(g, r, S, 14, 'rgba(110,140,50,0.35)', 50);
      blot(g, r, S, 10, 'rgba(40,60,20,0.35)', 40);
      for (let i = 0; i < 2600; i++) {
        const x = r() * S, y = r() * S;
        g.strokeStyle = r() < 0.5 ? 'rgba(120,160,60,0.5)' : 'rgba(40,70,25,0.5)';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
        g.stroke();
      }
    }),
    dirt: make(S, 2, (g, r) => {
      g.fillStyle = '#6e5539';
      g.fillRect(0, 0, S, S);
      blot(g, r, S, 16, 'rgba(60,40,25,0.4)', 40);
      blot(g, r, S, 10, 'rgba(150,120,80,0.25)', 30);
      speck(g, r, S, 5000, ['rgba(40,28,15,0.4)', 'rgba(160,130,95,0.35)', 'rgba(90,70,50,0.5)'], 2.2);
    }),
    rock: make(S, 3, (g, r) => {
      g.fillStyle = '#6d6a66';
      g.fillRect(0, 0, S, S);
      blot(g, r, S, 20, 'rgba(40,38,36,0.35)', 45);
      blot(g, r, S, 12, 'rgba(160,155,148,0.25)', 35);
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = 'rgba(30,28,26,0.55)';
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath();
        let x = r() * S, y = r() * S;
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (r() - 0.5) * 30;
          y += (r() - 0.3) * 20;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      speck(g, r, S, 3000, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.12)'], 1.6);
    }),
    sand: make(S, 4, (g, r) => {
      g.fillStyle = '#c8b28a';
      g.fillRect(0, 0, S, S);
      blot(g, r, S, 12, 'rgba(160,135,95,0.3)', 50);
      speck(g, r, S, 9000, ['rgba(120,100,70,0.35)', 'rgba(240,225,195,0.4)'], 1.3);
      for (let y = 0; y < S; y += 9) {
        g.strokeStyle = 'rgba(150,125,90,0.15)';
        g.beginPath();
        g.moveTo(0, y + r() * 4);
        for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.08 + y) * 2);
        g.stroke();
      }
    }),
    snow: make(S, 5, (g, r) => {
      g.fillStyle = '#e9eef5';
      g.fillRect(0, 0, S, S);
      blot(g, r, S, 14, 'rgba(180,195,220,0.35)', 50);
      speck(g, r, S, 2500, ['rgba(255,255,255,0.8)', 'rgba(170,185,210,0.4)'], 1.4);
    }),
    asphalt: make(S, 6, (g, r) => {
      g.fillStyle = '#3b3c3f';
      g.fillRect(0, 0, S, S);
      speck(g, r, S, 14000, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.3)', 'rgba(120,120,125,0.18)'], 1.5);
      blot(g, r, S, 10, 'rgba(0,0,0,0.25)', 40);
      for (let i = 0; i < 8; i++) {
        g.strokeStyle = 'rgba(20,20,22,0.5)';
        g.beginPath();
        let x = r() * S, y = r() * S;
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (r() - 0.5) * 40;
          y += (r() - 0.5) * 40;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }),
    paved: make(S, 7, (g, r) => {
      g.fillStyle = '#8e8a84';
      g.fillRect(0, 0, S, S);
      speck(g, r, S, 6000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], 1.4);
      g.strokeStyle = 'rgba(50,48,45,0.55)';
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
      blot(g, r, S, 6, 'rgba(60,55,50,0.2)', 40);
    }),
    macro: make(S, 8, (g, r) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, S, S);
      blot(g, r, S, 40, 'rgba(255,255,255,0.25)', 60);
      blot(g, r, S, 40, 'rgba(0,0,0,0.25)', 60);
    }),
  };
}
