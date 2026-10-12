import * as THREE from 'three';
import { CHARACTERS, type ChargeState, type EntitySnap, type TeamId } from '@phantom/shared';
import { CharacterModel } from '../player/CharacterModel';
import { smokeTexture, softDotTexture } from '../rendering/textures';

interface Visual {
  obj: THREE.Object3D;
  update: (e: EntitySnap, dt: number, t: number) => void;
  dispose: () => void;
  target: THREE.Vector3;
  hitFlash: number;
}

const ALLY = 0x36c2ff;
const ENEMY = 0xff4655;

function std(color: number, emissive = 0, metal = 0.5, rough = 0.4) {
  return new THREE.MeshStandardMaterial({ color, emissive: emissive ? color : 0, emissiveIntensity: emissive, metalness: metal, roughness: rough });
}

/**
 * Renders server-side ability entities (smokes, scanners, decoys, barriers, caltrops,
 * aid stations, turrets), practice targets and the objective device.
 */
export class EntityRenderer {
  readonly group = new THREE.Group();
  private visuals = new Map<number, Visual>();
  private device: THREE.Group;
  private deviceLight: THREE.Mesh;
  myTeam: TeamId = 'alpha';
  /** smoke spheres for camera-inside tests */
  smokes: { pos: THREE.Vector3; r: number; scale: number }[] = [];

  constructor() {
    this.device = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.32, 6), std(0x1d1f23, 0, 0.8, 0.35));
    body.position.y = 0.16;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshBasicMaterial({ color: 0xff4d2e, toneMapped: false }));
    core.position.y = 0.42;
    this.deviceLight = core;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xff4d2e, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(1.2);
    halo.position.y = 0.42;
    this.device.add(body, core, halo);
    this.device.visible = false;
    this.group.add(this.device);
  }

  private colorFor(team: TeamId) {
    return team === this.myTeam ? ALLY : ENEMY;
  }

  sync(list: EntitySnap[], ownerChar: (id: string) => string | undefined) {
    const seen = new Set<number>();
    for (const e of list) {
      seen.add(e.id);
      let v = this.visuals.get(e.id);
      if (!v) {
        v = this.create(e, ownerChar(e.owner));
        this.visuals.set(e.id, v);
        this.group.add(v.obj);
        v.obj.position.set(e.x, e.y, e.z);
      }
      v.target.set(e.x, e.y, e.z);
      (v as Visual & { last: EntitySnap }).last = e;
    }
    for (const [id, v] of this.visuals) {
      if (!seen.has(id)) {
        this.group.remove(v.obj);
        v.dispose();
        this.visuals.delete(id);
      }
    }
  }

  flash(id: number) {
    const v = this.visuals.get(id);
    if (v) v.hitFlash = 1;
  }

  /** Practice target kill effect: the dummy flares in `color` and dissolves into light. */
  dissolve(id: number, color: number) {
    const v = this.visuals.get(id) as (Visual & { model?: CharacterModel }) | undefined;
    v?.model?.dissolve(color);
  }

  objectFor(id: number) {
    return this.visuals.get(id)?.obj;
  }

  update(dt: number, t: number) {
    this.smokes = [];
    for (const v of this.visuals.values()) {
      const e = (v as Visual & { last: EntitySnap }).last;
      v.obj.position.lerp(v.target, Math.min(1, dt * 15));
      v.hitFlash = Math.max(0, v.hitFlash - dt * 6);
      v.update(e, dt, t);
    }
  }

  setDevice(c: ChargeState | null, t: number) {
    if (!c || (c.status !== 'dropped' && c.status !== 'planted')) {
      this.device.visible = false;
      return;
    }
    this.device.visible = true;
    this.device.position.set(c.x, c.y, c.z);
    const urgent = c.status === 'planted' && c.timer < 10;
    const on = c.status === 'planted' ? Math.sin(t * (urgent ? 30 : 10)) > 0 : true;
    this.deviceLight.visible = on;
    this.device.rotation.y = t * 0.6;
  }

  private create(e: EntitySnap, ownerChar?: string): Visual {
    const color = this.colorFor(e.team);
    const charColor = ownerChar && ownerChar in CHARACTERS ? new THREE.Color(CHARACTERS[ownerChar as keyof typeof CHARACTERS].color).getHex() : color;
    const g = new THREE.Group();
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
    const base: Visual = { obj: g, target: new THREE.Vector3(), hitFlash: 0, update: () => {}, dispose: () => disposables.forEach((d) => d.dispose()) };

    switch (e.type) {
      case 'smoke': {
        const tex = smokeTexture();
        const tint = new THREE.Color(charColor).lerp(new THREE.Color(0x9a9aa2), 0.75);
        const sprites: THREE.Sprite[] = [];
        for (let i = 0; i < 26; i++) {
          const m = track(new THREE.SpriteMaterial({ map: tex, color: tint, transparent: true, opacity: 0.95, depthWrite: false }));
          const s = new THREE.Sprite(m);
          const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
          const rr = Math.cbrt(Math.random()) * e.r * 0.75;
          s.position.set(Math.sin(ph) * Math.cos(th) * rr, 1.5 + Math.cos(ph) * rr * 0.8, Math.sin(ph) * Math.sin(th) * rr);
          s.userData.base = s.position.clone();
          s.userData.size = e.r * (1.1 + Math.random() * 0.6);
          sprites.push(s);
          g.add(s);
        }
        const shell = new THREE.Mesh(new THREE.SphereGeometry(e.r, 24, 16), track(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
        shell.position.y = 1.5;
        g.add(shell);
        let age = 0;
        base.update = (ent, dt) => {
          age += dt;
          const grow = Math.min(1, age / 0.8);
          const fade = Math.min(1, ent.t / 1.2);
          for (const s of sprites) {
            s.scale.setScalar(s.userData.size * grow);
            s.position.copy(s.userData.base).multiplyScalar(grow);
            s.position.y = 1.5 + (s.userData.base.y - 1.5) * grow;
            (s.material as THREE.SpriteMaterial).opacity = 0.9 * fade;
            s.material.rotation += dt * 0.05;
          }
          shell.scale.setScalar(Math.max(0.01, grow));
          (shell.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;
          this.smokes.push({ pos: new THREE.Vector3(g.position.x, g.position.y + 1.5, g.position.z), r: ent.r * grow, scale: fade });
        };
        break;
      }
      case 'scanner': {
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), track(std(charColor, 1.2)));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 6, 24), track(std(0x2a2d31, 0, 0.8)));
        const glow = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: softDotTexture(), color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })));
        glow.scale.setScalar(0.9);
        g.add(core, ring, glow);
        base.update = (_e, dt, t) => {
          core.rotation.y += dt * 2;
          ring.rotation.x = t * 1.5;
          glow.material.opacity = 0.4 + Math.sin(t * 6) * 0.2 + base.hitFlash;
        };
        break;
      }
      case 'decoy': {
        const model = new CharacterModel((e.ch ?? 'specter') as never, color, { hologram: true, xray: false });
        model.setWeapon('corsair');
        g.add(model.root);
        g.rotation.y = e.yaw;
        base.update = (ent, dt) => {
          g.rotation.y = ent.yaw;
          model.update(dt, { speed: ent.moving ? 5.4 : 0, vy: 0, onGround: true, crouch: 0, pitch: 0, alive: true, reloading: false, fireKick: 0, interact: 0, cast: 0 });
          model.setOpacity(Math.min(1, ent.t * 2) * (0.75 + 0.15 * Math.sin(performance.now() / 60)));
        };
        base.dispose = () => model.dispose();
        break;
      }
      case 'barrier': {
        const w = (e.hx ?? 3) * 2, h = (e.hy ?? 1.6) * 2, d = (e.hz ?? 0.3) * 2;
        const mat = track(new THREE.MeshStandardMaterial({ color: 0x1a2a20, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.82, metalness: 0.6, roughness: 0.3 }));
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        wall.position.y = h / 2;
        wall.castShadow = true;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.2, d + 0.1), track(std(0x22252a, 0, 0.8)));
        frame.position.y = 0.1;
        const top = frame.clone();
        top.position.y = h;
        g.add(wall, frame, top);
        let rise = 0;
        base.update = (ent, dt) => {
          rise = Math.min(1, rise + dt * 3);
          g.scale.y = rise;
          const hpF = ent.hp / ent.maxHp;
          mat.emissiveIntensity = 0.2 + (1 - hpF) * 0.6 + base.hitFlash;
          mat.opacity = 0.55 + hpF * 0.35;
        };
        break;
      }
      case 'caltrops': {
        const disc = new THREE.Mesh(new THREE.RingGeometry(e.r - 0.08, e.r, 48), track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.03;
        const fill = new THREE.Mesh(new THREE.CircleGeometry(e.r, 48), track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false })));
        fill.rotation.x = -Math.PI / 2;
        fill.position.y = 0.02;
        const spikeGeo = track(new THREE.ConeGeometry(0.05, 0.14, 4));
        const spikes = new THREE.InstancedMesh(spikeGeo, track(std(0x8a8f96, 0, 0.9, 0.3)), 40);
        const m = new THREE.Matrix4();
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (e.r - 0.2);
          m.makeRotationFromEuler(new THREE.Euler(Math.random() * 0.8, Math.random() * 3, Math.random() * 0.8));
          m.setPosition(Math.cos(a) * r, 0.06, Math.sin(a) * r);
          spikes.setMatrixAt(i, m);
        }
        g.add(disc, fill, spikes);
        base.update = (ent, _dt, t) => {
          (fill.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 8) * 0.05;
          g.visible = ent.t > 0;
        };
        break;
      }
      case 'station': {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.8, 8), track(std(0xe8ebee, 0, 0.3, 0.5)));
        pillar.position.y = 0.4;
        const cross = new THREE.Group();
        const cm = track(std(0x4fe3c1, 1.2));
        cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), cm), new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), cm));
        cross.position.y = 1.05;
        const ring = new THREE.Mesh(new THREE.RingGeometry(e.r - 0.06, e.r, 48), track(new THREE.MeshBasicMaterial({ color: 0x4fe3c1, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        g.add(pillar, cross, ring);
        base.update = (_e, dt) => {
          cross.rotation.y += dt * 1.5;
          pillar.scale.setScalar(1 + base.hitFlash * 0.1);
        };
        break;
      }
      case 'turret': {
        const legs = track(std(0x2a2d31, 0, 0.8, 0.4));
        for (let i = 0; i < 3; i++) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), legs);
          const a = (i / 3) * Math.PI * 2;
          leg.position.set(Math.cos(a) * 0.25, 0.35, Math.sin(a) * 0.25);
          leg.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
          g.add(leg);
        }
        const head = new THREE.Group();
        head.position.y = 0.95;
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.5), track(std(0x3d4a35, 0, 0.6, 0.4)));
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), legs);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.45;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        eye.position.set(0, 0.06, -0.26);
        head.add(housing, barrel, eye);
        g.add(head);
        base.update = (ent, dt) => {
          head.rotation.y += ((ent.yaw - head.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 10);
          head.position.y = 0.95 + base.hitFlash * 0.03;
        };
        break;
      }
      case 'target': {
        const model = new CharacterModel('bastion', 0xff9a3c, { xray: false });
        g.add(model.root);
        const plate = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), track(new THREE.MeshBasicMaterial({ color: 0xff4d2e })));
        plate.position.set(0, 1.25, -0.2);
        plate.rotation.y = Math.PI;
        g.add(plate);
        (base as Visual & { model?: CharacterModel }).model = model;
        base.update = (ent, dt) => {
          g.rotation.y = Math.PI;
          model.update(dt, { speed: ent.moving ? 3 : 0, vy: 0, onGround: true, crouch: 0, pitch: 0, alive: ent.hp > 0, reloading: false, fireKick: base.hitFlash, interact: 0, cast: 0 });
          plate.visible = ent.hp > 0;
          // once dissolved, the dummy stays hidden until it respawns
          model.root.visible = ent.hp > 0 || !model.dissolved;
        };
        base.dispose = () => model.dispose();
        break;
      }
    }
    return base;
  }

  dispose() {
    for (const v of this.visuals.values()) v.dispose();
    this.visuals.clear();
  }
}
