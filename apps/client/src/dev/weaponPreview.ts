import * as THREE from 'three';
import { WEAPONS, type WeaponId } from '@phantom/shared';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildWeapon } from '../game/weapons/WeaponModel';

const W = 1500;
const H = 1000;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setClearColor(0x14181e);
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2a26, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(2, 5, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0x99bbff, 1.2);
fill.position.set(-4, 1, 2);
scene.add(fill);

const ids = Object.keys(WEAPONS) as WeaponId[];
const cols = 6;
const rows = Math.ceil(ids.length / cols);
const spacingX = 1.05;
const spacingY = 0.86;
const gridW = (cols - 1) * spacingX;
const gridH = (rows - 1) * spacingY;

const halfW = gridW / 2 + 0.62;
const halfH = gridH / 2 + 0.5;
const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 100);
cam.position.set(0, 0, 6);
cam.lookAt(0, 0, 0);

const worldToPx = (x: number, y: number) => [
  ((x + halfW) / (2 * halfW)) * W,
  ((halfH - y) / (2 * halfH)) * H,
];

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const m = buildWeapon(id);
  const g = m.group;
  const col = i % cols;
  const row = Math.floor(i / cols);
  const cx = (col - (cols - 1) / 2) * spacingX;
  const cy = -(row - (rows - 1) / 2) * spacingY;
  g.rotation.set(0.18, Math.PI / 2 - 0.5, 0);
  g.position.set(cx, cy, 0);
  scene.add(g);

  const [px, py] = worldToPx(cx, cy - 0.4);
  const label = document.createElement('div');
  label.textContent = `${WEAPONS[id].name}  (${id})`;
  label.style.cssText = `position:fixed;left:${px}px;top:${py}px;transform:translateX(-50%);color:#dfe6f0;font:600 13px monospace;text-shadow:0 1px 2px #000;white-space:nowrap;`;
  document.body.appendChild(label);
}

renderer.render(scene, cam);

// ── silhouette signatures: render each weapon alone and rasterise a coarse grid
const SW = 200;
const SH = 130;
const sigR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
sigR.setSize(SW, SH);
sigR.setClearColor(0x14181e);
const sigScene = new THREE.Scene();
sigScene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, 3));
const sigCam = new THREE.OrthographicCamera(-0.75, 0.75, 0.5, -0.5, 0.1, 100);
sigCam.position.set(0, 0, 6);
sigCam.lookAt(0, 0, 0);
const rt = new THREE.WebGLRenderTarget(SW, SH);
const buf = new Uint8Array(SW * SH * 4);
const GX = 24;
const GY = 16;
const sigs: Record<string, string> = {};
for (const id of ids) {
  const g = buildWeapon(id).group;
  g.rotation.set(0.18, Math.PI / 2 - 0.5, 0);
  sigScene.add(g);
  sigR.setRenderTarget(rt);
  sigR.render(sigScene, sigCam);
  sigR.readRenderTargetPixels(rt, 0, 0, SW, SH, buf);
  sigR.setRenderTarget(null);
  const data = buf;
  let s = '';
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      let sum = 0;
      let n = 0;
      const x0 = Math.floor((gx / GX) * SW);
      const x1 = Math.floor(((gx + 1) / GX) * SW);
      const y0 = Math.floor((gy / GY) * SH);
      const y1 = Math.floor(((gy + 1) / GY) * SH);
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * SW + x) * 4;
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
          n++;
        }
      }
      s += sum / n > 42 ? '1' : '0';
    }
  }
  sigs[id] = s;
  sigScene.remove(g);
}
(window as unknown as { __sigs: Record<string, string> }).__sigs = sigs;
(window as unknown as { __ready: boolean }).__ready = true;
