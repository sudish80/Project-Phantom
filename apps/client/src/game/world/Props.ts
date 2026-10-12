import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Prop, PropKind } from '@phantom/shared';
import { softDotTexture, textTexture } from '../rendering/textures';

type Part = [THREE.BufferGeometry, number];

function prep(g: THREE.BufferGeometry, color: number) {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}
const B = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const C = (r1: number, r2: number, h: number, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(r1, r2, h, seg).translate(x, y + h / 2, z);
const merge = (parts: Part[]) => mergeGeometries(parts.map(([g, c]) => prep(g, c)))!;

/** Emissive parts get their own geometry so they can glow at night. */
interface KindDef {
  geo: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
  glowColor?: number;
  tint?: boolean;
}

function defs(): Partial<Record<PropKind, KindDef>> {
  const dark = 0x2a2c30, metal = 0x6b6f75, wood = 0x6b5136;
  const wheel = (x: number, z: number) => [C(0.38, 0.38, 0.28, 0, 0, 0, 10).rotateZ(Math.PI / 2).translate(x, 0.38, z), 0x111111] as Part;
  return {
    car: { geo: merge([[B(4.3, 0.75, 1.85, 0, 0.35), 0xffffff], [B(2.3, 0.6, 1.7, -0.2, 1.1), 0x223040], wheel(1.4, 0.85), wheel(-1.4, 0.85), wheel(1.4, -0.85), wheel(-1.4, -0.85)]), tint: true, glow: B(0.1, 0.18, 1.5, 2.16, 0.75), glowColor: 0xfff2c0 },
    truck: { geo: merge([[B(2.2, 2.2, 2.4, 2.4, 0.4), 0xffffff], [B(5, 2.6, 2.5, -1.3, 0.4), 0x8a8f96], wheel(2.6, 1.1), wheel(-0.6, 1.1), wheel(-2.8, 1.1), wheel(2.6, -1.1), wheel(-0.6, -1.1), wheel(-2.8, -1.1)]), tint: true },
    bench: { geo: merge([[B(1.8, 0.08, 0.5, 0, 0.45), wood], [B(1.8, 0.45, 0.06, 0, 0.5, 0.25), wood], [B(0.08, 0.45, 0.45, -0.8), dark], [B(0.08, 0.45, 0.45, 0.8), dark]]) },
    bin: { geo: merge([[C(0.28, 0.25, 0.9), 0x2f4a36]]) },
    dumpster: { geo: merge([[B(1.8, 1.2, 1.2), 0x2c5a3a], [B(1.9, 0.12, 1.25, 0, 1.2), 0x1e3a26]]) },
    utilityBox: { geo: merge([[B(0.8, 1.2, 0.5), 0x7a8086]]) },
    trafficLight: { geo: merge([[C(0.08, 0.1, 5), dark], [B(0.08, 0.08, 3, 0, 4.9, -1.5), dark], [B(0.35, 1, 0.3, 0, 4.2, -2.9), 0x1a1a1a]]), glow: B(0.2, 0.2, 0.05, 0, 4.85, -2.75), glowColor: 0x40ff60 },
    busStop: { geo: merge([[B(3.2, 0.1, 1.4, 0, 2.4), metal], [B(0.08, 2.4, 0.08, -1.5, 0, 0.6), metal], [B(0.08, 2.4, 0.08, 1.5, 0, 0.6), metal], [B(3, 1.8, 0.04, 0, 0.4, 0.65), 0x8fb4c8], [B(2.6, 0.08, 0.4, 0, 0.45, 0.4), wood]]) },
    streetLight: { geo: merge([[C(0.09, 0.13, 6.2), dark], [B(0.08, 0.08, 1.6, 0, 6.1, -0.8), dark]]), glow: B(0.5, 0.12, 0.3, 0, 6.0, -1.5), glowColor: 0xffd9a0 },
    waterTank: { geo: merge([[C(1.3, 1.3, 2.4, 0, 1.6), 0x6b5848], [C(1.35, 0.2, 0.6, 0, 4), 0x4a3a2e], [B(0.12, 1.6, 0.12, 0.9, 0, 0.9), dark], [B(0.12, 1.6, 0.12, -0.9, 0, 0.9), dark], [B(0.12, 1.6, 0.12, 0.9, 0, -0.9), dark], [B(0.12, 1.6, 0.12, -0.9, 0, -0.9), dark]]) },
    acUnit: { geo: merge([[B(1.2, 0.9, 0.9), 0xa5aab0], [C(0.32, 0.32, 0.05, 0, 0.9), 0x333333]]) },
    antenna: { geo: merge([[C(0.04, 0.06, 4), metal], [B(1.2, 0.04, 0.04, 0, 3), metal], [B(0.8, 0.04, 0.04, 0, 3.5), metal]]), glow: new THREE.SphereGeometry(0.08, 6, 4).translate(0, 4.05, 0), glowColor: 0xff2020 },
    dish: { geo: merge([[C(0.05, 0.05, 0.7), metal], [new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, 1).rotateX(-1.1).translate(0, 0.9, 0), 0xdddddd]]) },
    chimney: { geo: merge([[B(0.7, 1.4, 0.7), 0x6b4a3e]]) },
    barrel: { geo: merge([[C(0.3, 0.3, 0.9), 0x2f5a8a]]), tint: true },
    storageTank: { geo: merge([[C(4.5, 4.5, 10), 0xc9ccd0], [new THREE.SphereGeometry(4.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 10, 0), 0xb8bbc0], [C(0.15, 0.15, 10, 4.6, 0, 0, 4), metal]]) },
    smokestack: { geo: merge([[C(1.2, 1.7, 40), 0x7a4a3a], [C(1.3, 1.3, 1.2, 0, 34), 0xdddddd], [C(1.3, 1.3, 1.2, 0, 30), 0xb83a2a]]) },
    pylon: {
      geo: merge([
        [B(0.25, 26, 0.25, -2, 0, -2).rotateZ(0.06).rotateX(-0.06), metal], [B(0.25, 26, 0.25, 2, 0, -2).rotateZ(-0.06).rotateX(-0.06), metal],
        [B(0.25, 26, 0.25, -2, 0, 2).rotateZ(0.06).rotateX(0.06), metal], [B(0.25, 26, 0.25, 2, 0, 2).rotateZ(-0.06).rotateX(0.06), metal],
        [B(10, 0.3, 0.3, 0, 20), metal], [B(7, 0.3, 0.3, 0, 24), metal], [B(4.4, 0.2, 0.2, 0, 8), metal], [B(4.4, 0.2, 0.2, 0, 14), metal],
      ]),
    },
    pallet: { geo: merge([[B(1.2, 0.15, 1, 0, 0), wood], [B(1.1, 0.8, 0.9, 0, 0.15), 0xb08a5a]]) },
    well: { geo: merge([[C(0.8, 0.8, 0.8, 0, 0, 0, 12), 0x8a8580], [B(0.1, 1.8, 0.1, -0.7, 0.8), wood], [B(0.1, 1.8, 0.1, 0.7, 0.8), wood], [B(1.8, 0.1, 1.2, 0, 2.6).rotateX(0.0), 0x7a3a2a]]) },
    fence: { geo: merge([[B(8, 0.08, 0.06, 0, 0.5), wood], [B(8, 0.08, 0.06, 0, 0.95), wood], ...[-4, -2, 0, 2, 4].map((x) => [B(0.1, 1.1, 0.1, x), wood] as Part)]) },
    umbrella: { geo: merge([[C(0.03, 0.03, 2.2), 0xdddddd], [new THREE.ConeGeometry(1.4, 0.5, 8).translate(0, 2.3, 0), 0xffffff]]), tint: true },
    boat: { geo: merge([[B(7, 1.2, 2.6, 0, -0.4), 0xe8e8e8], [B(2.4, 1.4, 2, -1, 0.8), 0x2a5a8a], [B(7.1, 0.25, 2.65, 0, 0.6), 0xb83a2a]]) },
    plane: {
      geo: merge([
        [C(1.4, 1.2, 22).rotateZ(Math.PI / 2).translate(0, 2.8, 0), 0xeeeeee], [B(4, 0.3, 26, 1, 2.6), 0xdddddd], [B(2, 0.2, 8, -9.5, 3.4), 0xdddddd],
        [B(2.5, 4, 0.3, -10, 3.4), 0xb83a2a], [C(0.25, 0.25, 2.2, 4, 0), 0x222222], [C(0.25, 0.25, 2.2, -2, 0, 3), 0x222222], [C(0.25, 0.25, 2.2, -2, 0, -3), 0x222222],
      ]),
    },
    wreck: { geo: merge([[C(1.4, 1.2, 9).rotateZ(Math.PI / 2 - 0.15).translate(0, 1.2, 0), 0x6a6a6a], [B(3, 0.3, 9, 2, 0.4, 2).rotateY(0.4), 0x555555], [B(2, 2.5, 0.3, -5, 0, 1), 0x7a2a2a]]) },
    utilityPole: { geo: merge([[C(0.13, 0.17, 8), 0x5a4330], [B(2, 0.12, 0.12, 0, 7.3), 0x5a4330]]) },
    laundry: { geo: merge([[B(6, 0.02, 0.02, 0, 0), 0x333333], ...[-2, -0.6, 0.8, 2].map((x, i) => [B(0.7, 0.8, 0.02, x, -0.8), [0xe0e0e0, 0x3a6ab0, 0xc04040, 0xd8c040][i]] as Part)]) },
    curtain: { geo: merge([[B(0.04, 1.6, 1.4, 0, -0.8), 0x8a3a3a]]), tint: true },
    guardTower: { geo: merge([[B(0.2, 5, 0.2, -1.6, 0, -1.6), wood], [B(0.2, 5, 0.2, 1.6, 0, -1.6), wood], [B(0.2, 5, 0.2, -1.6, 0, 1.6), wood], [B(0.2, 5, 0.2, 1.6, 0, 1.6), wood], [B(4, 0.15, 4, 0, 7.3), 0x4a3a2e], [B(3.6, 1, 0.08, 0, 5, 1.8), wood]]) },
    rock: { geo: merge([[new THREE.DodecahedronGeometry(1, 0).scale(1, 0.75, 0.9).translate(0, 0.35, 0), 0x77736e]]), tint: true },
    log: { geo: merge([[C(0.35, 0.4, 5).rotateZ(Math.PI / 2).translate(0, 0.38, 0), 0x5a4330]]) },
    bush: { geo: merge([[new THREE.IcosahedronGeometry(0.8, 0).scale(1, 0.7, 1).translate(0, 0.45, 0), 0x3d6b2c], [new THREE.IcosahedronGeometry(0.55, 0).translate(0.5, 0.5, 0.2), 0x4a7d34]]), tint: true },
    haybale: { geo: merge([[C(0.6, 0.6, 1.2).rotateZ(Math.PI / 2).translate(0, 0.6, 0), 0xc9a64a]]) },
    cone: { geo: merge([[new THREE.ConeGeometry(0.2, 0.7, 8).translate(0, 0.35, 0), 0xff6a1a]]) },
    beacon: { geo: new THREE.SphereGeometry(0.01, 3, 2), glow: new THREE.SphereGeometry(0.25, 8, 6), glowColor: 0xff2020 },
  };
}

const SIGN_TEXT = ['VIEWPOINT', 'HOSPITAL', 'POLICE', 'MARKET', 'CAFE 24', 'PHARMACY', 'HARDWARE', 'NOODLES', 'ARCADE'];

/**
 * Instanced environment props (one draw call per kind + glow layer), plus a few
 * individually animated landmarks. Glow parts brighten at night.
 */
export class Props {
  readonly group = new THREE.Group();
  readonly glowMats: THREE.MeshBasicMaterial[] = [];
  private anim: ((dt: number, t: number, night: number) => void)[] = [];
  private smoke: { pos: THREE.Vector3; sprites: THREE.Sprite[] }[] = [];
  private disposables: { dispose: () => void }[] = [];

  constructor(props: Prop[], private shadows = true) {
    const D = defs();
    const byKind = new Map<PropKind, Prop[]>();
    for (const p of props) {
      if (!byKind.has(p.kind)) byKind.set(p.kind, []);
      byKind.get(p.kind)!.push(p);
    }
    const baseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 });
    this.disposables.push(baseMat);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const palette = [0xb83a2a, 0x2a5a8a, 0xdddddd, 0x222428, 0x8a8f96, 0x3a6a3a, 0xc9a64a, 0x5a3a7a];
    for (const [kind, list] of byKind) {
      const d = D[kind];
      if (!d) {
        this.special(kind, list);
        continue;
      }
      const inst = new THREE.InstancedMesh(d.geo, baseMat, list.length);
      const glow = d.glow ? new THREE.InstancedMesh(d.glow, this.glowMat(d.glowColor ?? 0xffffff), list.length) : null;
      list.forEach((p, i) => {
        pv.set(p.x, p.y, p.z);
        q.setFromAxisAngle(up, p.rot);
        s.setScalar(p.s);
        m4.compose(pv, q, s);
        inst.setMatrixAt(i, m4);
        glow?.setMatrixAt(i, m4);
        if (d.tint) {
          const v = p.v ?? 0;
          const col = kind === 'rock' ? new THREE.Color(0x77736e).multiplyScalar(0.8 + v * 0.4) : kind === 'bush' ? new THREE.Color(0xffffff).multiplyScalar(0.75 + v * 0.5) : new THREE.Color(palette[Math.floor(v * palette.length)]);
          inst.setColorAt(i, col);
        }
      });
      // instanced props span the whole world (one draw each), so only cast shadows on High
      inst.castShadow = this.shadows && !['bush', 'cone', 'laundry', 'curtain', 'rock'].includes(kind);
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
      if (glow) {
        glow.computeBoundingSphere();
        this.group.add(glow);
      }
      if (kind === 'smokestack') for (const p of list) this.addSmoke(new THREE.Vector3(p.x, p.y + 40 * p.s, p.z));
    }
  }

  private glowMat(color: number) {
    const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    m.userData.base = new THREE.Color(color);
    this.glowMats.push(m);
    return m;
  }

  private addSmoke(pos: THREE.Vector3) {
    const sprites: THREE.Sprite[] = [];
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0x9a9a9a, transparent: true, opacity: 0.35, depthWrite: false }));
      sp.userData.t = i / 10;
      sprites.push(sp);
      this.group.add(sp);
    }
    this.smoke.push({ pos, sprites });
  }

  /** Animated or unique landmark props. */
  private special(kind: PropKind, list: Prop[]) {
    for (const p of list) {
      const g = new THREE.Group();
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.rot;
      g.scale.setScalar(p.s);
      const mat = (c: number, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.4, emissive: e ? c : 0, emissiveIntensity: e });
      switch (kind) {
        case 'radar': {
          g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 6, 8).translate(0, 3, 0), mat(0x8a8f96)));
          const head = new THREE.Group();
          head.position.y = 6.5;
          const dish = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 0.3), mat(0xdddddd));
          head.add(dish);
          g.add(head);
          this.anim.push((dt) => (head.rotation.y += dt * 1.2));
          break;
        }
        case 'lighthouse': {
          g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.6, 24, 16).translate(0, 12, 0), mat(0xeeeeee)));
          for (const y of [6, 14]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(2.3 - y * 0.03, 2.4 - y * 0.03, 2.5, 16).translate(0, y, 0), mat(0xb83a2a)));
          g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 12).translate(0, 25, 0), new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false })));
          const beam = new THREE.Mesh(
            new THREE.ConeGeometry(4, 60, 16, 1, true).rotateZ(Math.PI / 2).translate(30, 25, 0),
            new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
          );
          const pivot = new THREE.Group();
          pivot.add(beam);
          g.add(pivot);
          this.anim.push((dt, _t, night) => {
            pivot.rotation.y += dt * 0.8;
            beam.visible = night > 0.3;
          });
          break;
        }
        case 'crane': {
          const yel = mat(0xc99a1b);
          g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 26, 1.4).translate(0, 13, 0), yel));
          const jib = new THREE.Group();
          jib.position.y = 26;
          jib.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 30).translate(0, 0, -10), yel), new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 4).translate(0, 0, 6), mat(0x333333)));
          const hook = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat(0x222222));
          jib.add(hook, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 14).translate(0, -7, -20), mat(0x222222)));
          hook.position.set(0, -14, -20);
          g.add(jib);
          const ph = Math.random() * 10;
          this.anim.push((_dt, t) => (jib.rotation.y = Math.sin(t * 0.06 + ph) * 0.9));
          break;
        }
        case 'conveyor': {
          g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 24).translate(0, 0.5, 0), mat(0x444444)));
          const tex = textTexture('▶ ▶ ▶ ▶', '#222', 256, 64, { bg: '#555', glow: false });
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(1, 4);
          const belt = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 24).rotateX(-Math.PI / 2).translate(0, 1.01, 0), new THREE.MeshStandardMaterial({ map: tex }));
          g.add(belt);
          this.anim.push((dt) => (tex.offset.y -= dt * 0.4));
          break;
        }
        case 'waterfall': {
          const tex = textTexture('', '#fff', 64, 64, { bg: '#9fc4dc', glow: false });
          const c = tex.image as HTMLCanvasElement;
          const gx = c.getContext('2d')!;
          for (let i = 0; i < 60; i++) {
            gx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`;
            gx.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 8 + Math.random() * 20);
          }
          tex.needsUpdate = true;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(2, 2);
          const fall = new THREE.Mesh(new THREE.PlaneGeometry(6, 9).translate(0, 4.5, 0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
          g.add(fall);
          this.anim.push((dt) => (tex.offset.y += dt * 1.4));
          break;
        }
        case 'billboard': {
          const tex = textTexture(['PHANTOM ENERGY', 'MERIDIAN BANK', 'NEON NIGHTS', 'DRINK FLUX'][Math.floor((p.v ?? 0) * 4)], '#ff2e88', 512, 128, { bg: '#100818' });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
          mesh.rotation.y = Math.PI;
          g.add(mesh);
          break;
        }
        case 'sign': {
          const text = SIGN_TEXT[Math.floor((p.v ?? 0) * 10) % SIGN_TEXT.length] ?? 'SHOP';
          const tex = textTexture(text, ['#7fffd4', '#ffffff', '#5ab0ff', '#ffcc33'][Math.floor((p.v ?? 0) * 4) % 4], 512, 128, { bg: '#151515' });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
          mesh.rotation.y = Math.PI;
          g.add(mesh);
          break;
        }
        default:
          break;
      }
      this.group.add(g);
    }
  }

  update(dt: number, t: number, night: number) {
    for (const f of this.anim) f(dt, t, night);
    const glowK = 0.35 + night * 1.6;
    for (const m of this.glowMats) m.color.copy(m.userData.base as THREE.Color).multiplyScalar(glowK);
    for (const s of this.smoke) {
      s.sprites.forEach((sp) => {
        sp.userData.t = (sp.userData.t + dt * 0.06) % 1;
        const k = sp.userData.t as number;
        sp.position.set(s.pos.x + k * 18, s.pos.y + k * 22, s.pos.z + Math.sin(k * 6) * 2);
        sp.scale.setScalar(3 + k * 14);
        (sp.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - k);
      });
    }
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.disposables.forEach((d) => d.dispose());
  }
}
