import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldData } from '@phantom/shared';
import { CHUNK } from './TerrainRenderer';

/** Shared wind uniforms (time, strength) for all swaying foliage. */
export const windUniforms = { uWTime: { value: 0 }, uWind: { value: 0.3 } };

function colored(g: THREE.BufferGeometry, color: number, jitter = 0.08, seed = 1) {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  let s = seed;
  for (let i = 0; i < n; i += 3) {
    s = (s * 16807) % 2147483647;
    const j = 1 + ((s / 2147483647) - 0.5) * jitter * 2;
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = c.r * j;
      col[(i + k) * 3 + 1] = c.g * j;
      col[(i + k) * 3 + 2] = c.b * j;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  return geo;
}

function at(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0, ry = 0) {
  g.rotateX(rx);
  g.rotateZ(rz);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** Procedural tree geometries (local origin at the base, ~unit scale per type). */
export function treeGeometries(): THREE.BufferGeometry[] {
  const bark = 0x5a4330, barkD = 0x3d2e22;
  const pine = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.16, 0.28, 3, 6), 0, 1.5, 0), bark),
    colored(at(new THREE.ConeGeometry(2.2, 3.4, 7), 0, 3.4, 0), 0x24452a, 0.12, 2),
    colored(at(new THREE.ConeGeometry(1.8, 3, 7), 0, 5.2, 0, 0, 0, 0.4), 0x2b5230, 0.12, 3),
    colored(at(new THREE.ConeGeometry(1.3, 2.6, 7), 0, 6.9, 0, 0, 0, 0.8), 0x31593a, 0.12, 4),
    colored(at(new THREE.ConeGeometry(0.8, 2, 6), 0, 8.4, 0), 0x386342, 0.12, 5),
  ])!;
  const broad = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.2, 0.32, 3.4, 6), 0, 1.7, 0), bark),
    colored(at(new THREE.CylinderGeometry(0.08, 0.12, 1.8, 5), 0.5, 3.5, 0, 0, -0.7), bark),
    colored(at(new THREE.IcosahedronGeometry(2, 0), 0, 5, 0), 0x4a7a32, 0.15, 6),
    colored(at(new THREE.IcosahedronGeometry(1.5, 0), 1.3, 4.3, 0.6), 0x55873a, 0.15, 7),
    colored(at(new THREE.IcosahedronGeometry(1.4, 0), -1.1, 4.6, -0.7), 0x3f6d2c, 0.15, 8),
    colored(at(new THREE.IcosahedronGeometry(1.2, 0), 0.2, 6.3, -0.3), 0x5f9142, 0.15, 9),
  ])!;
  const palmParts = [];
  let px = 0, py = 0;
  for (let i = 0; i < 6; i++) {
    palmParts.push(colored(at(new THREE.CylinderGeometry(0.15, 0.19, 1.3, 6), px, py + 0.65, 0, 0, -0.08 * i), 0x7a6046, 0.1, 10 + i));
    px += Math.sin(0.08 * i) * 1.3;
    py += Math.cos(0.08 * i) * 1.25;
  }
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.ConeGeometry(0.5, 3.4, 3, 1);
    leaf.scale(1, 1, 0.15);
    palmParts.push(colored(at(leaf, px, py + 0.2, 0, Math.PI / 2 + 0.35, 0, (i / 7) * Math.PI * 2), 0x3f7a35, 0.15, 20 + i));
  }
  const palm = mergeGeometries(palmParts)!;
  // shift leaves so they radiate from the crown
  const dead = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.12, 0.26, 5, 5), 0, 2.5, 0), barkD),
    colored(at(new THREE.CylinderGeometry(0.05, 0.09, 2, 4), 0.6, 4, 0, 0, -0.8), barkD),
    colored(at(new THREE.CylinderGeometry(0.05, 0.08, 1.8, 4), -0.5, 3.3, 0.3, 0.4, 0.9), barkD),
    colored(at(new THREE.CylinderGeometry(0.04, 0.07, 1.4, 4), 0.1, 5.2, -0.4, -0.7, 0.2), barkD),
  ])!;
  const sapling = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 5), 0, 0.6, 0), bark),
    colored(at(new THREE.ConeGeometry(0.8, 1.8, 6), 0, 1.7, 0), 0x3e6b34, 0.15, 30),
  ])!;
  return [pine, broad, palm, dead, sapling];
}

const TREE_HEIGHT = [9.4, 7.5, 8.2, 6, 2.6];

function windMaterial(base: THREE.MeshStandardMaterialParameters, height: number) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, ...base });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWTime; uniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float hf = clamp(position.y / ${height.toFixed(1)}, 0.0, 1.0); hf *= hf;
  float sway = sin(uWTime * 1.3 + ip.x * 0.13 + ip.z * 0.11) + 0.45 * sin(uWTime * 2.9 + ip.x * 0.37);
  float gust = 0.5 + 0.5 * sin(uWTime * 0.35 + ip.z * 0.02);
  transformed.x += sway * hf * (0.12 + uWind * 0.55 * gust);
  transformed.z += cos(uWTime * 1.1 + ip.z * 0.17) * hf * (0.08 + uWind * 0.35 * gust);`,
      );
  };
  m.customProgramCacheKey = () => `wind-${height}`;
  return m;
}

/** Canvas impostor textures for far trees. */
function impostorTexture(kind: number) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = kind === 3 ? '#3d2e22' : '#5a4330';
  g.fillRect(29, 70, 6, 58);
  const leaf = ['#2b5230', '#4f803a', '#3f7a35', 'rgba(0,0,0,0)', '#3e6b34'][kind];
  g.fillStyle = leaf;
  if (kind === 0 || kind === 4) {
    g.beginPath();
    g.moveTo(32, 2);
    g.lineTo(58, 100);
    g.lineTo(6, 100);
    g.fill();
  } else if (kind === 1) {
    g.beginPath();
    g.arc(32, 45, 28, 0, Math.PI * 2);
    g.arc(18, 62, 16, 0, Math.PI * 2);
    g.arc(46, 62, 16, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 2) {
    g.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.ellipse(32 + Math.cos(a) * 14, 20 + Math.sin(a) * 6, 16, 5, a, 0, Math.PI * 2);
    }
    g.fill();
  } else {
    g.strokeStyle = '#3d2e22';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(32, 80);
    g.lineTo(18, 40);
    g.moveTo(32, 70);
    g.lineTo(50, 35);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface ChunkTrees {
  center: THREE.Vector3;
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
}

/** Instanced, wind-animated trees with per-chunk culling and impostor LOD. */
export class Trees {
  readonly group = new THREE.Group();
  private chunks: ChunkTrees[] = [];
  private timer = 0;
  private mats: THREE.Material[] = [];

  constructor(w: WorldData, private quality: 'low' | 'medium' | 'high') {
    const geos = treeGeometries();
    const mats = TREE_HEIGHT.map((h) => windMaterial({}, h));
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    const cross = mergeGeometries([quad.clone(), quad.clone().rotateY(Math.PI / 2)])!;
    const impMats = [0, 1, 2, 3, 4].map((k) => new THREE.MeshLambertMaterial({ map: impostorTexture(k), alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mats.push(...mats, ...impMats);
    const buckets = new Map<string, { cx: number; cz: number; byKind: number[][] }>();
    const tr = w.trees;
    for (let i = 0; i < tr.length; i += 6) {
      const cx = Math.floor(tr[i] / CHUNK), cz = Math.floor(tr[i + 2] / CHUNK);
      const key = `${cx},${cz}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { cx, cz, byKind: [[], [], [], [], []] }));
      b.byKind[tr[i + 5]].push(i);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const b of buckets.values()) {
      const ch: ChunkTrees = { center: new THREE.Vector3((b.cx + 0.5) * CHUNK, 0, (b.cz + 0.5) * CHUNK), near: [], far: [] };
      b.byKind.forEach((list, kind) => {
        if (!list.length) return;
        const near = new THREE.InstancedMesh(geos[kind], mats[kind], list.length);
        const far = new THREE.InstancedMesh(cross, impMats[kind], list.length);
        list.forEach((i, n) => {
          const sc = tr[i + 3];
          p.set(tr[i], tr[i + 1] - 0.2, tr[i + 2]);
          q.setFromAxisAngle(up, tr[i + 4]);
          s.setScalar(sc);
          near.setMatrixAt(n, m4.compose(p, q, s));
          s.set(sc * (kind === 1 ? 6.5 : 4.8), sc * TREE_HEIGHT[kind], sc * 4.8);
          far.setMatrixAt(n, m4.compose(p, q, s));
        });
        near.computeBoundingSphere();
        far.computeBoundingSphere();
        near.castShadow = quality !== 'low';
        near.receiveShadow = quality === 'high';
        far.visible = false;
        ch.near.push(near);
        ch.far.push(far);
        this.group.add(near, far);
      });
      this.chunks.push(ch);
    }
  }

  update(dt: number, cam: THREE.Vector3) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.4;
    const nearDist = this.quality === 'low' ? 170 : this.quality === 'medium' ? 260 : 360;
    for (const ch of this.chunks) {
      const d = Math.hypot(ch.center.x - cam.x, ch.center.z - cam.z);
      const near = d < nearDist;
      for (const m of ch.near) {
        m.visible = near;
        m.castShadow = near && d < (this.quality === 'high' ? 110 : 70) && this.quality !== 'low';
      }
      for (const m of ch.far) m.visible = !near;
    }
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}

const GRASS_VERT = /* glsl */ `
attribute vec3 aOffset;
uniform vec3 uCam; uniform float uR; uniform sampler2D uHeight; uniform sampler2D uMask; uniform float uOrigin; uniform float uSize;
uniform float uWTime; uniform float uWind; uniform vec3 uPlayer;
varying float vH; varying float vFlower; varying float vFade;
#include <fog_pars_vertex>
void main(){
  vec2 p = uCam.xz + mod(aOffset.xz - uCam.xz + uR, 2.0 * uR) - uR;
  vec2 uv = (p - uOrigin) / uSize;
  float h = texture2D(uHeight, uv).r;
  float m = texture2D(uMask, uv).r;
  float dist = length(p - uCam.xz);
  vFade = 1.0 - smoothstep(uR * 0.65, uR, dist);
  float rnd = fract(sin(dot(aOffset.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float scale = m * vFade * (0.45 + rnd * 0.7);
  vFlower = step(0.93, rnd) * step(0.5, m);
  vec3 pos = position;
  pos.y *= scale;
  pos.x *= 1.0 + vFlower;
  float a = rnd * 6.2831;
  pos.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * pos.xz;
  float hf = position.y;
  float sway = sin(uWTime * 2.1 + p.x * 0.35 + p.y * 0.27) * (0.08 + uWind * 0.3) + sin(uWTime * 4.3 + p.x) * 0.03;
  pos.x += sway * hf * hf;
  vec2 away = p - uPlayer.xz;
  float pd = length(away);
  pos.xz += (away / max(pd, 0.01)) * max(0.0, 1.3 - pd) * hf * 0.7 * scale;
  vH = hf / 0.6;
  vec3 world = vec3(p.x, h, p.y) + pos;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GRASS_FRAG = /* glsl */ `
uniform vec3 uLight; uniform vec3 uAmb; uniform float uWet;
varying float vH; varying float vFlower; varying float vFade;
#include <fog_pars_fragment>
void main(){
  if (vFade < 0.02) discard;
  vec3 base = mix(vec3(0.09, 0.2, 0.05), vec3(0.3, 0.52, 0.14), vH);
  vec3 flower = mix(vec3(0.95, 0.85, 0.25), vec3(0.85, 0.5, 0.9), fract(vH * 13.0));
  vec3 col = mix(base, flower, vFlower * smoothstep(0.7, 1.0, vH));
  col *= mix(1.0, 0.7, uWet);
  gl_FragColor = vec4(col * (uAmb * 1.2 + uLight * (0.35 + 0.5 * vH)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** GPU grass & wildflowers: a camera-following tile, height + density from textures, wind and player bending. */
export class Grass {
  readonly mesh: THREE.Mesh | null = null;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(w: WorldData, mask: Uint8Array, quality: 'low' | 'medium' | 'high') {
    const t = w.terrain;
    const halfData = new Uint16Array(t.n * t.n);
    for (let i = 0; i < t.h.length; i++) halfData[i] = THREE.DataUtils.toHalfFloat(t.h[i]);
    const ht = new THREE.DataTexture(halfData, t.n, t.n, THREE.RedFormat, THREE.HalfFloatType);
    ht.magFilter = ht.minFilter = THREE.LinearFilter;
    ht.needsUpdate = true;
    const mt = new THREE.DataTexture(new Uint8Array(mask), t.n, t.n, THREE.RedFormat, THREE.UnsignedByteType);
    mt.magFilter = mt.minFilter = THREE.LinearFilter;
    mt.needsUpdate = true;
    const R = quality === 'high' ? 46 : 32;
    this.uniforms = {
      ...THREE.UniformsLib.fog,
      uCam: { value: new THREE.Vector3() }, uR: { value: R }, uHeight: { value: ht }, uMask: { value: mt },
      uOrigin: { value: t.origin - t.cell / 2 }, uSize: { value: t.n * t.cell }, uPlayer: { value: new THREE.Vector3(0, -999, 0) },
      uLight: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.4, 0.4, 0.4) }, uWet: { value: 0 }, ...windUniforms,
    };
    if (quality === 'low') return;
    const count = quality === 'high' ? 60000 : 24000;
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.035, 0, 0, 0.035, 0, 0, -0.022, 0.3, 0, 0.022, 0.3, 0, 0, 0.6, 0], 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = blade.index;
    geo.attributes.position = blade.attributes.position;
    const offs = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      offs[i * 3] = (Math.random() - 0.5) * 2 * R;
      offs[i * 3 + 1] = Math.random();
      offs[i * 3 + 2] = (Math.random() - 0.5) * 2 * R;
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 3));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({ vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, uniforms: this.uniforms, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    (this as { mesh: THREE.Mesh | null }).mesh = mesh;
  }

  update(cam: THREE.Vector3, player: THREE.Vector3 | null, sun: THREE.Color, sunI: number, amb: THREE.Color, wet: number) {
    (this.uniforms.uCam.value as THREE.Vector3).copy(cam);
    if (player) (this.uniforms.uPlayer.value as THREE.Vector3).copy(player);
    (this.uniforms.uLight.value as THREE.Color).copy(sun).lerp(new THREE.Color(1, 1, 1), 0.6).multiplyScalar(Math.min(1.1, sunI * 0.4));
    (this.uniforms.uAmb.value as THREE.Color).copy(amb);
    this.uniforms.uWet.value = wet;
  }
}
