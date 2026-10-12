import * as THREE from 'three';
import type { Impact, Vec3 } from '@phantom/shared';
import type { Quality } from '../../stores/settings';
import { softDotTexture } from '../rendering/textures';

const PARTICLE_VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FRAG = /* glsl */ `
uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor, t.a * vAlpha); if (gl_FragColor.a < 0.01) discard; }`;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number;
  r: number; g: number; b: number;
  grav: number; drag: number;
}

/**
 * Pooled world effects: tracers, impacts (surface-specific sparks/dust/chips, non-graphic
 * energy flecks on players), bullet decals, muzzle lights, ability pulses, detonation.
 */
export class Effects {
  readonly group = new THREE.Group();
  private max: number;
  private parts: Particle[] = [];
  private points: THREE.Points;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private tracers: { mesh: THREE.Mesh; t: number; max: number }[] = [];
  private tracerIdx = 0;
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  private lights: { light: THREE.PointLight; t: number }[] = [];
  private lightIdx = 0;
  private rings: { mesh: THREE.Mesh; t: number; max: number; r: number }[] = [];
  private flashes: { mesh: THREE.Mesh; t: number; max: number; r: number }[] = [];

  constructor(quality: Quality) {
    this.max = quality === 'low' ? 600 : quality === 'medium' ? 1400 : 2400;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(this.max * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(this.max * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(this.max), 1);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(this.max), 1);
    for (const a of [this.posAttr, this.colAttr, this.sizeAttr, this.alphaAttr]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { map: { value: softDotTexture() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    const tracerGeo = new THREE.BoxGeometry(0.018, 0.018, 1);
    tracerGeo.translate(0, 0, -0.5);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, t: 0, max: 0.06 });
    }
    const decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
    const decalMat = new THREE.MeshBasicMaterial({ map: softDotTexture(), color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < (quality === 'low' ? 60 : 180); i++) {
      const d = new THREE.Mesh(decalGeo, decalMat);
      d.visible = false;
      this.group.add(d);
      this.decals.push(d);
    }
    for (let i = 0; i < (quality === 'low' ? 0 : 3); i++) {
      const l = new THREE.PointLight(0xffb070, 0, 9, 2);
      this.group.add(l);
      this.lights.push({ light: l, t: 0 });
    }
  }

  private emit(p: Partial<Particle> & { x: number; y: number; z: number }) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({ vx: 0, vy: 0, vz: 0, life: 0, max: 0.5, size: 0.1, r: 1, g: 1, b: 1, grav: 0, drag: 0, ...p });
  }

  tracer(from: Vec3, to: Vec3, color = 0xffd9a0, life = 0.07) {
    const tr = this.tracers[this.tracerIdx++ % this.tracers.length];
    const a = new THREE.Vector3(from.x, from.y, from.z), b = new THREE.Vector3(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    if (len < 0.5) return;
    tr.mesh.position.copy(a);
    tr.mesh.lookAt(b);
    tr.mesh.scale.set(1, 1, len);
    (tr.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (tr.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8;
    tr.mesh.visible = true;
    tr.t = life;
    tr.max = life;
  }

  muzzleLight(pos: Vec3, color = 0xffb070) {
    if (!this.lights.length) return;
    const l = this.lights[this.lightIdx++ % this.lights.length];
    l.light.position.set(pos.x, pos.y, pos.z);
    l.light.color.setHex(color);
    l.light.intensity = 6;
    l.t = 0.05;
  }

  impact(h: Impact) {
    const n = new THREE.Vector3(h.nx, h.ny, h.nz);
    const p = { x: h.x + h.nx * 0.02, y: h.y + h.ny * 0.02, z: h.z + h.nz * 0.02 };
    const rnd = (s: number) => (Math.random() - 0.5) * s;
    if (h.m === 'none') return;
    if (h.m === 'player' || h.m === 'entity') {
      // non-graphic energy flecks
      for (let i = 0; i < 8; i++)
        this.emit({ ...p, vx: n.x * 2 + rnd(4), vy: n.y * 2 + rnd(4) + 1, vz: n.z * 2 + rnd(4), max: 0.25, size: 0.07, r: 0.6, g: 0.95, b: 1, drag: 3 });
      return;
    }
    const metal = h.m === 'metal' || h.m === 'trim' || h.m.startsWith('container') || h.m === 'barrier';
    const wood = h.m === 'crate';
    if (metal) {
      for (let i = 0; i < 10; i++)
        this.emit({ ...p, vx: n.x * 4 + rnd(6), vy: n.y * 4 + rnd(6) + 2, vz: n.z * 4 + rnd(6), max: 0.3 + Math.random() * 0.2, size: 0.05, r: 1, g: 0.7, b: 0.3, grav: 14, drag: 1 });
    } else {
      const c = wood ? [0.45, 0.32, 0.2] : [0.55, 0.53, 0.5];
      for (let i = 0; i < 7; i++)
        this.emit({ ...p, vx: n.x * 1.5 + rnd(1.5), vy: n.y * 1.5 + rnd(1.5) + 0.6, vz: n.z * 1.5 + rnd(1.5), max: 0.6 + Math.random() * 0.4, size: 0.22, r: c[0], g: c[1], b: c[2], grav: 2, drag: 2.5 });
    }
    if (h.m !== 'barrier') {
      const d = this.decals[this.decalIdx++ % this.decals.length];
      d.position.set(h.x + h.nx * 0.01, h.y + h.ny * 0.01, h.z + h.nz * 0.01);
      d.lookAt(d.position.x + n.x, d.position.y + n.y, d.position.z + n.z);
      d.rotateZ(Math.random() * Math.PI);
      d.visible = true;
    }
  }

  dust(pos: Vec3, amount = 10) {
    for (let i = 0; i < amount; i++)
      this.emit({ x: pos.x + (Math.random() - 0.5) * 0.6, y: pos.y + 0.05, z: pos.z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 0.8, vz: (Math.random() - 0.5) * 2, max: 0.7, size: 0.3, r: 0.45, g: 0.43, b: 0.4, drag: 3 });
  }

  burst(pos: Vec3, color: number, count = 24, speed = 4) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.emit({ ...pos, vx: d.x, vy: d.y, vz: d.z, max: 0.6, size: 0.12, r: c.r, g: c.g, b: c.b, drag: 2, grav: 2 });
    }
  }

  ring(pos: Vec3, radius: number, color: number, life = 0.9) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.1, pos.z);
    this.group.add(m);
    this.rings.push({ mesh: m, t: 0, max: life, r: radius });
  }

  /**
   * Kill effect: a rising spiral of glowing motes in the killer's skin colours, a ground
   * shockwave, a brief light column and a flash (non-graphic — the body dissolves into light).
   */
  killEffect(pos: Vec3, colors: number[], head: boolean) {
    const cols = colors.map((c) => new THREE.Color(c));
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 6 + Math.random() * 0.4;
      const r = 0.25 + Math.random() * 0.35;
      const c = cols[i % cols.length];
      this.emit({
        x: pos.x + Math.cos(a) * r, y: pos.y + 0.1 + (i / 70) * 1.7, z: pos.z + Math.sin(a) * r,
        vx: -Math.sin(a) * 1.4, vy: 1.2 + Math.random() * 1.6, vz: Math.cos(a) * 1.4,
        max: 0.8 + Math.random() * 0.5, size: 0.07 + Math.random() * 0.06, r: c.r, g: c.g, b: c.b, drag: 1.6, grav: -0.6,
      });
    }
    if (head) this.burst({ x: pos.x, y: pos.y + 1.65, z: pos.z }, colors[0], 30, 3.5);
    this.ring(pos, 3.2, colors[0], 0.7);
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 3.2, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: colors[colors.length > 1 ? 1 : 0], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    col.position.set(pos.x, pos.y + 1.6, pos.z);
    this.group.add(col);
    this.flashes.push({ mesh: col, t: 0, max: 0.55, r: 0.6 });
    this.muzzleLight({ x: pos.x, y: pos.y + 1.2, z: pos.z }, colors[0]);
  }

  detonation(pos: Vec3) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(pos.x, pos.y + 1, pos.z);
    this.group.add(m);
    this.flashes.push({ mesh: m, t: 0, max: 1.6, r: 12 });
    this.burst({ x: pos.x, y: pos.y + 1, z: pos.z }, 0xffa060, 120, 12);
    this.ring(pos, 14, 0xff4d2e, 1.4);
    this.muzzleLight({ x: pos.x, y: pos.y + 2, z: pos.z }, 0xff6a3d);
  }

  update(dt: number) {
    let n = 0;
    const pos = this.posAttr.array as Float32Array, col = this.colAttr.array as Float32Array;
    const size = this.sizeAttr.array as Float32Array, alpha = this.alphaAttr.array as Float32Array;
    const alive: Particle[] = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const f = 1 - p.life / p.max;
      pos[n * 3] = p.x;
      pos[n * 3 + 1] = p.y;
      pos[n * 3 + 2] = p.z;
      col[n * 3] = p.r;
      col[n * 3 + 1] = p.g;
      col[n * 3 + 2] = p.b;
      size[n] = p.size * (0.6 + 0.4 * f) * 10;
      alpha[n] = f;
      n++;
      alive.push(p);
    }
    this.parts = alive;
    this.points.geometry.setDrawRange(0, n);
    this.posAttr.needsUpdate = this.colAttr.needsUpdate = this.sizeAttr.needsUpdate = this.alphaAttr.needsUpdate = true;

    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.t -= dt;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t.t / t.max) * 0.8;
      if (t.t <= 0) t.mesh.visible = false;
    }
    for (const l of this.lights) {
      if (l.t <= 0) continue;
      l.t -= dt;
      if (l.t <= 0) l.light.intensity = 0;
    }
    this.rings = this.rings.filter((r) => {
      r.t += dt;
      const p = r.t / r.max;
      if (p >= 1) {
        this.group.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      r.mesh.scale.setScalar(0.2 + p * r.r);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - p);
      return true;
    });
    this.flashes = this.flashes.filter((f) => {
      f.t += dt;
      const p = f.t / f.max;
      if (p >= 1) {
        this.group.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        return false;
      }
      f.mesh.scale.setScalar(1 + Math.sqrt(p) * f.r);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - p);
      return true;
    });
  }

  clearDecals() {
    for (const d of this.decals) d.visible = false;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
