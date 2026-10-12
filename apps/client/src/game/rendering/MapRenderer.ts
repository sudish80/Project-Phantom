import * as THREE from 'three';
import type { Box, Decor, MapDef, SurfaceMat } from '@phantom/shared';
import type { Quality } from '../../stores/settings';
import { makeSurface, noiseNormalTexture, siteLetterTexture, softDotTexture, textTexture, windowsTexture } from './textures';

interface GeomArrays {
  pos: number[];
  nor: number[];
  uv: number[];
  idx: number[];
}

/** Append an axis-aligned box with per-face UVs (world-scaled or fitted). */
function pushBox(a: GeomArrays, b: Box, uvMode: 'world' | 'fit', scale: number, skipBottom: boolean) {
  const { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1 } = b;
  const faces: { n: [number, number, number]; v: [number, number, number][]; uv: (p: [number, number, number]) => [number, number] }[] = [];
  const fitU = (v: number, lo: number, hi: number) => (v - lo) / (hi - lo || 1);
  const W = (v: number) => v / scale;
  // +X
  faces.push({ n: [1, 0, 0], v: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], uv: (p) => (uvMode === 'world' ? [W(-p[2]), W(p[1])] : [fitU(-p[2], -z1, -z0), fitU(p[1], y0, y1)]) });
  // -X
  faces.push({ n: [-1, 0, 0], v: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], uv: (p) => (uvMode === 'world' ? [W(p[2]), W(p[1])] : [fitU(p[2], z0, z1), fitU(p[1], y0, y1)]) });
  // +Y
  faces.push({ n: [0, 1, 0], v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], uv: (p) => (uvMode === 'world' ? [W(p[0]), W(-p[2])] : [fitU(p[0], x0, x1), fitU(-p[2], -z1, -z0)]) });
  // -Y
  if (!skipBottom) faces.push({ n: [0, -1, 0], v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], uv: (p) => (uvMode === 'world' ? [W(p[0]), W(p[2])] : [fitU(p[0], x0, x1), fitU(p[2], z0, z1)]) });
  // +Z
  faces.push({ n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], uv: (p) => (uvMode === 'world' ? [W(p[0]), W(p[1])] : [fitU(p[0], x0, x1), fitU(p[1], y0, y1)]) });
  // -Z
  faces.push({ n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], uv: (p) => (uvMode === 'world' ? [W(-p[0]), W(p[1])] : [fitU(-p[0], -x1, -x0), fitU(p[1], y0, y1)]) });
  for (const f of faces) {
    const base = a.pos.length / 3;
    for (const v of f.v) {
      a.pos.push(v[0], v[1], v[2]);
      a.nor.push(...f.n);
      const uv = f.uv(v);
      a.uv.push(uv[0], uv[1]);
    }
    a.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function toGeometry(a: GeomArrays) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setIndex(a.idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const BARRIER_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vPos;
void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const BARRIER_FRAG = /* glsl */ `
uniform float uTime; uniform float uOpen; uniform vec3 uColor;
varying vec2 vUv; varying vec3 vPos;
void main(){
  float stripes = smoothstep(0.45,0.5,fract(vPos.y*2.0 - uTime*0.6)) * 0.25;
  float hex = smoothstep(0.92,1.0,abs(sin(vPos.x*3.0+vPos.z*3.0)) ) * 0.4;
  float edge = smoothstep(0.85,1.0,abs(vUv.y*2.0-1.0));
  float a = (0.05 + stripes*0.25 + hex*0.12 + edge*0.3) * (1.0 - uOpen);
  if (vPos.y > (1.0-uOpen)*7.0) discard;
  gl_FragColor = vec4(uColor * (0.7 + edge*0.6), a);
}`;

/** Builds and animates the visual representation of a MapDef. */
export class MapRenderer {
  readonly group = new THREE.Group();
  private animated: ((dt: number, t: number) => void)[] = [];
  private barrierMats: THREE.ShaderMaterial[] = [];
  private barrierOpen = 0;
  private barrierTarget = 0;
  private disposables: { dispose: () => void }[] = [];
  lightBudget: number;

  constructor(readonly map: MapDef, private quality: Quality) {
    this.lightBudget = quality === 'high' ? 10 : quality === 'medium' ? 5 : 0;
    this.buildGeometry();
    this.buildDecor();
    this.buildBarriers();
    if (!map.world) this.buildSkyline();
  }

  private buildGeometry() {
    // Large maps are merged per material *per 160 m chunk* so frustum culling still works.
    const chunked = !!this.map.world;
    const byMat = new Map<string, GeomArrays>();
    const wet = this.map.env.wet;
    const infos = new Map<SurfaceMat, ReturnType<typeof makeSurface>>();
    for (const s of this.map.solids) {
      if (s.hidden) continue;
      let info = infos.get(s.mat);
      if (!info) infos.set(s.mat, (info = makeSurface(s.mat, wet)));
      const key = chunked ? `${s.mat}|${Math.floor((s.minX + s.maxX) / 320)}|${Math.floor((s.minZ + s.maxZ) / 320)}` : s.mat;
      let a = byMat.get(key);
      if (!a) byMat.set(key, (a = { pos: [], nor: [], uv: [], idx: [] }));
      pushBox(a, s, info.uv, info.scale, s.minY <= 0.01);
    }
    for (const [key, arrays] of byMat) {
      const mat = key.split('|')[0] as SurfaceMat;
      const geo = toGeometry(arrays);
      const info = infos.get(mat)!;
      const mesh = new THREE.Mesh(geo, info.material);
      mesh.castShadow = mat !== 'floor' && mat !== 'asphalt';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = `map:${mat}`;
      this.group.add(mesh);
      this.disposables.push(geo, info.material);
    }
    for (const info of infos.values()) {
      const m = info.material as THREE.MeshStandardMaterial;
      m.userData.baseRough = m.roughness;
      this.materials.push(m);
    }
  }

  private materials: THREE.MeshStandardMaterial[] = [];

  /** Night lights up windows; wetness makes surfaces glossy. */
  setEnvironment(night: number, wet: number) {
    for (const m of this.materials) {
      if (m.emissiveMap) m.emissiveIntensity = night * 0.7;
      const base = m.userData.baseRough as number;
      m.roughness = base * (1 - wet * 0.6);
    }
  }

  private addLight(color: number, intensity: number, distance: number, pos: THREE.Vector3) {
    if (this.lightBudget <= 0) return;
    this.lightBudget--;
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.copy(pos);
    this.group.add(l);
  }

  private buildDecor() {
    const facingRot = { 'x+': Math.PI / 2, 'x-': -Math.PI / 2, 'z+': 0, 'z-': Math.PI };
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.7 });
    const glow = softDotTexture();
    this.disposables.push(poleMat);
    for (const d of this.map.decor as Decor[]) {
      switch (d.kind) {
        case 'neon': {
          const hex = '#' + d.color.toString(16).padStart(6, '0');
          const tex = textTexture(d.text ?? '', hex, 512, 128);
          const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat);
          plane.position.set(d.x, d.y, d.z);
          plane.rotation.y = facingRot[d.facing];
          const back = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.2, d.h + 0.2, 0.08), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.4, metalness: 0.6 }));
          back.position.copy(plane.position);
          back.rotation.y = plane.rotation.y;
          back.translateZ(-0.06);
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: d.color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
          halo.scale.set(d.w * 1.8, d.h * 3, 1);
          halo.position.copy(plane.position);
          this.group.add(back, plane, halo);
          const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), plane.rotation.y);
          this.addLight(d.color, 6, 10, plane.position.clone().addScaledVector(n, 1));
          const phase = Math.random() * 10;
          this.animated.push((_dt, t) => {
            const flick = Math.sin(t * 23 + phase) > 0.985 ? 0.4 : 1;
            mat.opacity = flick;
          });
          break;
        }
        case 'light':
          this.addLight(d.color, d.intensity, d.distance, new THREE.Vector3(d.x, d.y, d.z));
          {
            const bulb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: d.color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
            bulb.scale.setScalar(1.2);
            bulb.position.set(d.x, d.y, d.z);
            this.group.add(bulb);
          }
          break;
        case 'lamp': {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, d.h, 8), poleMat);
          pole.position.set(d.x, d.h / 2, d.z);
          pole.castShadow = true;
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false }));
          head.position.set(d.x, d.h, d.z);
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: d.color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
          halo.scale.setScalar(2.4);
          halo.position.set(d.x, d.h - 0.1, d.z);
          this.group.add(pole, head, halo);
          this.addLight(d.color, 5, 14, new THREE.Vector3(d.x, d.h - 0.4, d.z));
          break;
        }
        case 'fan': {
          const g = new THREE.Group();
          g.position.set(d.x, d.y, d.z);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.08, 8, 32), poleMat);
          ring.rotation.x = Math.PI / 2;
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 12), poleMat);
          const blades = new THREE.Group();
          const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.8, roughness: 0.35 });
          for (let i = 0; i < 5; i++) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(d.r * 0.9, 0.03, 0.28), bladeMat);
            b.position.x = d.r * 0.47;
            b.rotation.x = 0.35;
            const holder = new THREE.Group();
            holder.rotation.y = (i / 5) * Math.PI * 2;
            holder.add(b);
            blades.add(holder);
          }
          g.add(ring, hub, blades);
          this.group.add(g);
          this.animated.push((dt) => {
            blades.rotation.y += dt * d.speed;
          });
          break;
        }
        case 'pipe': {
          const a = new THREE.Vector3(d.x1, d.y1, d.z1), b = new THREE.Vector3(d.x2, d.y2, d.z2);
          const len = a.distanceTo(b);
          const m = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, len, 10), new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.4, metalness: 0.7 }));
          m.position.copy(a).lerp(b, 0.5);
          m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
          m.castShadow = true;
          this.group.add(m);
          break;
        }
        case 'water': {
          const nrm = noiseNormalTexture();
          nrm.repeat.set(20, 20);
          const mat = new THREE.MeshStandardMaterial({ color: 0x0a1424, roughness: 0.08, metalness: 0.9, normalMap: nrm, normalScale: new THREE.Vector2(0.4, 0.4) });
          const m = new THREE.Mesh(new THREE.PlaneGeometry(d.x2 - d.x1, d.z2 - d.z1), mat);
          m.rotation.x = -Math.PI / 2;
          m.position.set((d.x1 + d.x2) / 2, d.y, (d.z1 + d.z2) / 2);
          this.group.add(m);
          // dock wall down to the water
          const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, d.z2 - d.z1), new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.8 }));
          wall.position.set(d.x1 + 0.25, d.y + 0.5, (d.z1 + d.z2) / 2);
          this.group.add(wall);
          this.animated.push((dt) => {
            nrm.offset.x += dt * 0.01;
            nrm.offset.y += dt * 0.006;
          });
          break;
        }
        case 'siteMarker': {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: siteLetterTexture(d.site), transparent: true, depthWrite: false, opacity: 0.7 }));
          m.rotation.x = -Math.PI / 2;
          m.position.set(d.x, d.y + 0.01, d.z);
          this.group.add(m);
          break;
        }
        case 'beacon': {
          const mat = new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false });
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat);
          m.position.set(d.x, d.y, d.z);
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: d.color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
          halo.scale.setScalar(1.4);
          halo.position.copy(m.position);
          this.group.add(m, halo);
          const ph = Math.random() * 3;
          this.animated.push((_dt, t) => {
            const on = Math.sin(t * 3 + ph) > 0;
            halo.visible = on;
            mat.color.setHex(on ? d.color : 0x220000);
          });
          break;
        }
        case 'crane': {
          const g = new THREE.Group();
          g.position.set(d.x, 0, d.z);
          const mat = new THREE.MeshStandardMaterial({ color: 0xb98a1b, roughness: 0.6, metalness: 0.5 });
          const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, d.h, 1.4), mat);
          tower.position.y = d.h / 2;
          const jib = new THREE.Group();
          jib.position.y = d.h;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 24), mat);
          arm.position.z = -8;
          const counter = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 3), new THREE.MeshStandardMaterial({ color: 0x333333 }));
          counter.position.z = 5;
          const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, d.h * 0.6, 4), poleMat);
          cable.position.set(0, -d.h * 0.3, -16);
          const hook = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), poleMat);
          hook.position.set(0, -d.h * 0.6, -16);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
          tip.position.set(0, 0.7, -20);
          jib.add(arm, counter, cable, hook, tip);
          jib.rotation.y = d.yaw;
          g.add(tower, jib);
          this.group.add(g);
          this.animated.push((_dt, t) => {
            jib.rotation.y = d.yaw + Math.sin(t * 0.05) * 0.5;
          });
          break;
        }
        case 'runway': {
          const len = d.x2 - d.x1, wid = d.z2 - d.z1;
          const mat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
          const g2 = new THREE.Group();
          for (let x = d.x1 + 20; x < d.x2 - 20; x += 24) {
            const dash = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.8), mat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(x, d.y + 0.02, (d.z1 + d.z2) / 2);
            g2.add(dash);
          }
          for (const ex of [d.x1 + 6, d.x2 - 6])
            for (let i = 0; i < 6; i++) {
              const bar = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), mat);
              bar.rotation.x = -Math.PI / 2;
              bar.position.set(ex, d.y + 0.02, d.z1 + 3 + i * ((wid - 6) / 5));
              g2.add(bar);
            }
          const edge = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.4), mat);
          edge.rotation.x = -Math.PI / 2;
          edge.position.set((d.x1 + d.x2) / 2, d.y + 0.02, d.z1 + 0.6);
          const edge2 = edge.clone();
          edge2.position.z = d.z2 - 0.6;
          g2.add(edge, edge2);
          this.group.add(g2);
          break;
        }
        case 'rangeMarker': {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.9), new THREE.MeshBasicMaterial({ map: textTexture(d.text, '#ffb347', 256, 80), transparent: true, depthWrite: false }));
          m.rotation.x = -Math.PI / 2;
          m.position.set(d.x, 0.02, d.z);
          const line = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.08), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.4 }));
          line.rotation.x = -Math.PI / 2;
          line.position.set(0, 0.015, d.z);
          this.group.add(m, line);
          break;
        }
      }
    }
  }

  private buildBarriers() {
    for (const b of this.map.spawnBarriers) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: BARRIER_VERT,
        fragmentShader: BARRIER_FRAG,
        uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uColor: { value: new THREE.Color(0xff6a3d) } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const geo = new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
      geo.translate((b.minX + b.maxX) / 2, (b.maxY - b.minY) / 2, (b.minZ + b.maxZ) / 2);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 5;
      this.group.add(m);
      this.barrierMats.push(mat);
      // emitter rails at the base
      const rail = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1b1e, emissive: 0xff4d2e, emissiveIntensity: 0.15, metalness: 0.7 }));
      rail.position.set((b.minX + b.maxX) / 2, 0.1, (b.minZ + b.maxZ) / 2);
      this.group.add(rail);
    }
  }

  /** Distant city / industrial skyline as one InstancedMesh (outside the playable bounds). */
  private buildSkyline() {
    const b = this.map.bounds;
    const harbor = this.map.id === 'harbor';
    const count = this.quality === 'low' ? 40 : 90;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const tex = windowsTexture(harbor ? 5 : 8, harbor ? '#ff2e88' : '#ffb347');
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c0d12, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: harbor ? 1.1 : 0.5, roughness: 0.9 });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    let seed = 1;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + r() * 0.05;
      const dist = 110 + r() * 90;
      const w = 8 + r() * 18, h = (harbor ? 25 : 14) + r() * (harbor ? 70 : 30), d = 8 + r() * 18;
      m.compose(new THREE.Vector3(cx + Math.cos(ang) * dist, -2, cz + Math.sin(ang) * dist), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI), new THREE.Vector3(w, h, d));
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.group.add(inst);
    this.disposables.push(geo, mat);
  }

  setBarriers(on: boolean, instant = false) {
    this.barrierTarget = on ? 0 : 1;
    if (instant) this.barrierOpen = this.barrierTarget;
  }

  update(dt: number, t: number) {
    for (const f of this.animated) f(dt, t);
    this.barrierOpen += Math.sign(this.barrierTarget - this.barrierOpen) * Math.min(Math.abs(this.barrierTarget - this.barrierOpen), dt * 1.6);
    for (const m of this.barrierMats) {
      m.uniforms.uTime.value = t;
      m.uniforms.uOpen.value = this.barrierOpen;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Gradient sky dome (+ stars for night maps). */
export function createSky(top: number, bottom: number, stars: boolean) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:
      'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.25,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.8)),1.0);}',
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  sphere.renderOrder = -10;
  g.add(sphere);
  if (stars) {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
      pos[i * 3] = Math.cos(th) * Math.sin(ph) * 380;
      pos[i * 3 + 1] = Math.cos(ph) * 380;
      pos[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * 380;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfc8ff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
    g.add(pts);
  }
  return g;
}
