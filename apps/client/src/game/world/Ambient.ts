import * as THREE from 'three';
import { softDotTexture } from '../rendering/textures';

interface Flock {
  center: THREE.Vector3;
  radius: number;
  speed: number;
  phase: number;
  height: number;
}

/** Restrained ambient life: distant bird flocks, fireflies at night, falling leaves near trees, sunlit dust. */
export class Ambient {
  readonly group = new THREE.Group();
  private birds: THREE.InstancedMesh;
  private flocks: Flock[] = [];
  private perFlock = 9;
  private fx: { pts: THREE.Points; pos: Float32Array; vel: Float32Array; kind: 'firefly' | 'leaf' | 'dust' }[] = [];

  constructor(centers: THREE.Vector3[]) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.9, 0.15, -0.1, 0, 0, -0.2, 0, 0, 0.25, 0.9, 0.15, -0.1, 0, 0, -0.2], 3));
    wing.computeVertexNormals();
    for (const c of centers) this.flocks.push({ center: c.clone(), radius: 40 + Math.random() * 60, speed: 0.08 + Math.random() * 0.06, phase: Math.random() * 6, height: 55 + Math.random() * 40 });
    this.birds = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide }), this.flocks.length * this.perFlock);
    this.birds.frustumCulled = false;
    this.group.add(this.birds);
    this.addFx('firefly', 140, 0xd8ff6a, 0.25);
    this.addFx('leaf', 160, 0xa8742a, 0.18);
    this.addFx('dust', 220, 0xfff2d0, 0.06);
  }

  private addFx(kind: 'firefly' | 'leaf' | 'dust', n: number, color: number, size: number) {
    const pos = new Float32Array(n * 3).fill(-9999);
    const vel = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color, size, map: softDotTexture(), transparent: true, depthWrite: false,
        blending: kind === 'leaf' ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: kind !== 'firefly', opacity: 0.9,
      }),
    );
    pts.frustumCulled = false;
    this.group.add(pts);
    this.fx.push({ pts, pos, vel, kind });
  }

  update(dt: number, t: number, cam: THREE.Vector3, o: { night: number; forest: number; rain: number; wind: number; ground: (x: number, z: number) => number }) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let i = 0;
    for (const f of this.flocks) {
      for (let b = 0; b < this.perFlock; b++) {
        const a = t * f.speed + f.phase + b * 0.09;
        const r = f.radius + Math.sin(b * 1.7) * 6;
        p.set(f.center.x + Math.cos(a) * r, f.height + Math.sin(t * 0.5 + b) * 2 + (b % 3), f.center.z + Math.sin(a) * r);
        q.setFromEuler(new THREE.Euler(0, -a, Math.sin(t * 9 + b) * 0.5));
        s.set(1.2, 1 + Math.sin(t * 11 + b * 2) * 0.6, 1.2);
        this.birds.setMatrixAt(i++, m.compose(p, q, s));
      }
    }
    this.birds.instanceMatrix.needsUpdate = true;
    this.birds.visible = o.night < 0.6 && o.rain < 0.5;

    for (const fx of this.fx) {
      const n = fx.pos.length / 3;
      let want = 0;
      if (fx.kind === 'firefly') want = o.night > 0.5 && o.rain < 0.2 ? o.forest : 0;
      else if (fx.kind === 'leaf') want = o.forest * (o.night < 0.7 ? 1 : 0.3);
      else want = (1 - o.night) * (1 - o.rain) * 0.7;
      const active = Math.floor(n * Math.min(1, want));
      for (let k = 0; k < n; k++) {
        const j = k * 3;
        if (k >= active) {
          fx.pos[j + 1] = -9999;
          continue;
        }
        const far = Math.abs(fx.pos[j] - cam.x) > 22 || Math.abs(fx.pos[j + 2] - cam.z) > 22 || fx.pos[j + 1] < -1000;
        if (far || (fx.kind === 'leaf' && fx.pos[j + 1] < o.ground(fx.pos[j], fx.pos[j + 2]))) {
          fx.pos[j] = cam.x + (Math.random() - 0.5) * 40;
          fx.pos[j + 2] = cam.z + (Math.random() - 0.5) * 40;
          const g = o.ground(fx.pos[j], fx.pos[j + 2]);
          fx.pos[j + 1] = fx.kind === 'leaf' ? g + 4 + Math.random() * 6 : g + 0.4 + Math.random() * (fx.kind === 'dust' ? 3 : 2);
          fx.vel[j] = (Math.random() - 0.5) * 0.4;
          fx.vel[j + 1] = fx.kind === 'leaf' ? -0.6 - Math.random() * 0.5 : (Math.random() - 0.5) * 0.15;
          fx.vel[j + 2] = (Math.random() - 0.5) * 0.4;
        }
        const wob = fx.kind === 'leaf' ? Math.sin(t * 3 + k) * 0.8 : Math.sin(t * 1.3 + k) * 0.2;
        fx.pos[j] += (fx.vel[j] + wob + o.wind * (fx.kind === 'leaf' ? 1.2 : 0.2)) * dt;
        fx.pos[j + 1] += fx.vel[j + 1] * dt;
        fx.pos[j + 2] += (fx.vel[j + 2] + Math.cos(t * 1.7 + k) * 0.2) * dt;
      }
      (fx.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      if (fx.kind === 'firefly') (fx.pts.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 5) * 0.3;
    }
  }
}
