import * as THREE from 'three';
import { CHARACTERS, WEAPONS, type CharacterId, type WeaponId } from '@phantom/shared';
import { buildWeapon } from '../weapons/WeaponModel';

export interface AnimInput {
  speed: number;
  vy: number;
  onGround: boolean;
  crouch: number;
  pitch: number;
  alive: boolean;
  reloading: boolean;
  /** 0..1 pulse set when the character fires */
  fireKick: number;
  /** 0 none, 1 plant, 2 defuse */
  interact: number;
  /** 0..1 pulse when an ability is cast */
  cast: number;
  /** peek lean blend, -1 full left .. +1 full right */
  lean?: number;
  /** true while sliding */
  sliding?: boolean;
  pose?: 'victory' | 'defeat' | null;
}

const XRAY_MAT = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });

/**
 * Original procedural humanoid built from primitives, with a procedural animation
 * controller (locomotion, crouch, jump/fall, aim, fire, reload, ability, interact,
 * death, victory/defeat). Each archetype has a distinct silhouette.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private elL = new THREE.Group();
  private elR = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private knL = new THREE.Group();
  private knR = new THREE.Group();
  private handR = new THREE.Group();
  private weapon: THREE.Group | null = null;
  private weaponId: WeaponId | null = null;
  private weaponSkin = 'standard';
  private phase = 0;
  private deathT = 0;
  /** kill-effect dissolve progress (-1 = inactive) */
  private dissolveT = -1;
  private dissolveColor = new THREE.Color();
  dissolved = false;
  private landT = 0;
  private wasGround = true;
  private xray: THREE.Mesh[] = [];
  private bandMats: THREE.MeshStandardMaterial[] = [];
  private visorMat: THREE.MeshStandardMaterial;
  private mats: THREE.Material[] = [];
  /** fade for holograms (decoys) */
  readonly hologram: boolean;

  constructor(readonly character: CharacterId, teamColor: number, opts: { hologram?: boolean; xray?: boolean } = {}) {
    this.hologram = !!opts.hologram;
    const def = CHARACTERS[character];
    const accent = new THREE.Color(def.color).getHex();
    const heavy = def.build === 'heavy', light = def.build === 'light';
    const suit = this.m(character === 'medic' ? 0xd9dde2 : character === 'specter' ? 0x1d2430 : 0x262a30, 0.2, 0.75);
    const armor = this.m(character === 'medic' ? 0xf2f4f6 : character === 'bastion' ? 0x3d4a35 : 0x3a3f47, 0.5, 0.45);
    const acc = this.m(accent, 0.3, 0.4, 0.4);
    const dark = this.m(0x111214, 0.4, 0.6);
    this.visorMat = this.m(accent, 0.9, 0.15, 1.2);
    const band = this.m(teamColor, 0.2, 0.5, 0.8);
    this.bandMats.push(band);

    const W = heavy ? 1.2 : light ? 0.9 : 1;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = !this.hologram;
      parent.add(mesh);
      if (opts.xray !== false) {
        const x2 = new THREE.Mesh(geo, XRAY_MAT);
        x2.position.copy(mesh.position);
        x2.renderOrder = 20;
        x2.visible = false;
        parent.add(x2);
        this.xray.push(x2);
      }
      return mesh;
    };
    const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.95;
    // pelvis
    add(this.hips, B(0.34 * W, 0.18, 0.22 * W), suit, 0, 0, 0);
    add(this.hips, B(0.36 * W, 0.05, 0.24 * W), dark, 0, 0.08, 0);
    // torso
    this.hips.add(this.torso);
    this.torso.position.y = 0.08;
    add(this.torso, B(0.4 * W, 0.42, 0.24 * W), suit, 0, 0.24, 0);
    add(this.torso, B(0.42 * W, 0.3, 0.27 * W), armor, 0, 0.3, -0.005);
    add(this.torso, B(0.06, 0.18, 0.02), acc, 0.1 * W, 0.34, -0.14 * W);
    if (character === 'medic') {
      add(this.torso, B(0.16, 0.05, 0.02), this.m(0x4fe3c1, 0.2, 0.4, 1), 0, 0.33, -0.15);
      add(this.torso, B(0.05, 0.16, 0.02), this.m(0x4fe3c1, 0.2, 0.4, 1), 0, 0.33, -0.15);
      add(this.torso, B(0.16, 0.05, 0.02), this.m(0x4fe3c1, 0.2, 0.4, 1), 0, 0.33, 0.15);
      add(this.torso, B(0.05, 0.16, 0.02), this.m(0x4fe3c1, 0.2, 0.4, 1), 0, 0.33, 0.15);
    }
    // backpack
    if (heavy) add(this.torso, B(0.36, 0.42, 0.18), dark, 0, 0.28, 0.2);
    else if (character === 'specter') add(this.torso, B(0.22, 0.3, 0.08), dark, 0, 0.3, 0.15);
    else add(this.torso, B(0.26, 0.26, 0.1), dark, 0, 0.26, 0.16);
    if (character === 'specter') {
      // antenna rig
      add(this.torso, new THREE.CylinderGeometry(0.008, 0.008, 0.45), dark, 0.08, 0.6, 0.18);
      add(this.torso, new THREE.SphereGeometry(0.02, 6, 4), this.visorMat, 0.08, 0.83, 0.18);
    }
    // neck & head
    this.torso.add(this.head);
    this.head.position.y = 0.5;
    add(this.head, B(0.1, 0.08, 0.1), suit, 0, 0.0, 0);
    if (character === 'medic') {
      add(this.head, new THREE.SphereGeometry(0.135, 14, 10), armor, 0, 0.13, 0);
      add(this.head, B(0.2, 0.06, 0.02), this.visorMat, 0, 0.13, -0.12);
    } else if (character === 'specter') {
      add(this.head, B(0.2, 0.22, 0.22), suit, 0, 0.13, 0.01);
      const hood = add(this.head, new THREE.ConeGeometry(0.17, 0.32, 4), suit, 0, 0.2, 0.04);
      hood.rotation.y = Math.PI / 4;
      add(this.head, B(0.16, 0.05, 0.02), this.visorMat, 0, 0.12, -0.11);
    } else if (character === 'bastion') {
      add(this.head, B(0.25, 0.25, 0.26), armor, 0, 0.13, 0);
      add(this.head, B(0.22, 0.12, 0.03), dark, 0, 0.1, -0.135);
      add(this.head, B(0.18, 0.025, 0.01), this.visorMat, 0, 0.14, -0.152);
    } else {
      add(this.head, B(0.21, 0.23, 0.23), suit, 0, 0.13, 0);
      add(this.head, B(0.23, 0.08, 0.04), this.visorMat, 0, 0.15, -0.11);
      add(this.head, B(0.24, 0.05, 0.25), armor, 0, 0.24, 0);
    }
    add(this.head, B(0.24, 0.025, 0.24), band, 0, 0.055, 0);

    // arms
    const mkArm = (sh: THREE.Group, el: THREE.Group, side: number) => {
      this.torso.add(sh);
      sh.position.set(side * 0.25 * W, 0.42, 0);
      if (heavy || character === 'vanguard') add(sh, B(0.16 * W, 0.1, 0.18 * W), armor, side * 0.02, 0.03, 0);
      add(sh, B(0.1, 0.3, 0.1), suit, 0, -0.15, 0);
      add(sh, B(0.105, 0.04, 0.105), band, 0, -0.08, 0);
      sh.add(el);
      el.position.y = -0.3;
      add(el, B(0.09, 0.28, 0.09), armor, 0, -0.14, 0);
      add(el, B(0.08, 0.08, 0.08), dark, 0, -0.3, 0);
    };
    mkArm(this.shL, this.elL, -1);
    mkArm(this.shR, this.elR, 1);
    this.elR.add(this.handR);
    this.handR.position.y = -0.3;

    // legs
    const mkLeg = (hip: THREE.Group, kn: THREE.Group, side: number) => {
      this.hips.add(hip);
      hip.position.set(side * 0.1 * W, -0.05, 0);
      add(hip, B(0.14 * W, 0.45, 0.15 * W), suit, 0, -0.22, 0);
      add(hip, B(0.15 * W, 0.12, 0.16 * W), armor, 0, -0.1, -0.005);
      hip.add(kn);
      kn.position.y = -0.45;
      add(kn, B(0.12 * W, 0.42, 0.13 * W), armor, 0, -0.21, 0);
      add(kn, B(0.13 * W, 0.08, 0.22 * W), dark, 0, -0.43, -0.04);
    };
    mkLeg(this.hipL, this.knL, -1);
    mkLeg(this.hipR, this.knR, 1);

    if (this.hologram) {
      this.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.material !== XRAY_MAT) {
          const m = (mesh.material as THREE.MeshStandardMaterial).clone();
          m.transparent = true;
          m.opacity = 0.85;
          m.emissive = new THREE.Color(accent);
          m.emissiveIntensity = 0.25;
          mesh.material = m;
          this.mats.push(m);
        }
      });
    }
  }

  private m(color: number, metal: number, rough: number, emissive = 0) {
    const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, emissive: emissive ? color : 0, emissiveIntensity: emissive });
    this.mats.push(m);
    return m;
  }

  setTeamColor(c: number) {
    for (const m of this.bandMats) {
      m.color.setHex(c);
      m.emissive.setHex(c);
    }
  }

  setXray(on: boolean) {
    for (const x of this.xray) x.visible = on;
  }

  setWeapon(id: WeaponId | null, skin = 'standard') {
    if (id === this.weaponId && skin === this.weaponSkin) return;
    this.weaponId = id;
    this.weaponSkin = skin;
    if (this.weapon) {
      this.handR.remove(this.weapon);
      this.weapon = null;
    }
    if (!id) return;
    const wm = buildWeapon(id, skin, undefined, { lowDetail: true });
    wm.group.scale.setScalar(1.1);
    // hand points down (-Y) in elbow space; rotate so the barrel points along the forearm's forward
    wm.group.rotation.x = -Math.PI / 2;
    wm.group.position.set(0, -0.02, 0);
    wm.group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.weapon = wm.group;
    this.handR.add(wm.group);
  }

  /** Advance the procedural animation. */
  /** Start the kill effect: the body flares in `color` and dissolves into light. */
  dissolve(color: number) {
    if (this.dissolveT >= 0) return;
    this.dissolveT = 0;
    this.dissolveColor.setHex(color);
    for (const m of this.mats) {
      const sm = m as THREE.MeshStandardMaterial;
      if (sm.emissive && !sm.userData.baseEmissive) {
        sm.userData.baseEmissive = sm.emissive.clone();
        sm.userData.baseEI = sm.emissiveIntensity;
      }
    }
  }

  private resetDissolve() {
    if (this.dissolveT < 0 && !this.dissolved) return;
    this.dissolveT = -1;
    this.dissolved = false;
    this.root.scale.setScalar(1);
    for (const m of this.mats) {
      const sm = m as THREE.MeshStandardMaterial;
      if (sm.userData.baseEmissive) {
        sm.emissive.copy(sm.userData.baseEmissive as THREE.Color);
        sm.emissiveIntensity = sm.userData.baseEI as number;
      }
    }
    this.setOpacity(1);
  }

  update(dt: number, s: AnimInput) {
    const k = (a: number, b: number, rate = 12) => a + (b - a) * Math.min(1, dt * rate);
    if (s.alive) this.resetDissolve();
    else if (this.dissolveT >= 0 && !this.dissolved) {
      this.dissolveT += dt / 0.85;
      const p = Math.min(1, this.dissolveT);
      const glow = Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5) * 3;
      for (const m of this.mats) {
        const sm = m as THREE.MeshStandardMaterial;
        if (!sm.emissive) continue;
        sm.emissive.copy(this.dissolveColor);
        sm.emissiveIntensity = glow;
      }
      this.setOpacity(1 - p * p);
      this.root.scale.set(1 + p * 0.06, 1 + p * 0.12, 1 + p * 0.06);
      if (p >= 1) this.dissolved = true;
    }
    if (!s.alive) {
      this.deathT = Math.min(1, this.deathT + dt * 2.4);
      const e = 1 - Math.pow(1 - this.deathT, 3);
      this.body.rotation.x = e * 1.45;
      this.body.position.y = -e * 0.0;
      this.body.position.z = e * 0.55;
      this.shL.rotation.x = k(this.shL.rotation.x, -2.6);
      this.shR.rotation.x = k(this.shR.rotation.x, -2.4);
      this.hipL.rotation.x = k(this.hipL.rotation.x, 0.25);
      this.hipR.rotation.x = k(this.hipR.rotation.x, -0.1);
      return;
    }
    this.deathT = 0;
    this.body.rotation.x = k(this.body.rotation.x, 0, 20);
    this.body.position.z = k(this.body.position.z, 0, 20);

    const crouch = Math.max(s.crouch, s.interact ? 1 : 0);
    const run = Math.min(1, s.speed / 5.4);
    this.phase += dt * (s.speed * 1.9 + 0.001);
    const sw = Math.sin(this.phase);
    const amp = run * (0.75 - crouch * 0.35);

    if (s.onGround && !this.wasGround) this.landT = 1;
    this.wasGround = s.onGround;
    this.landT = Math.max(0, this.landT - dt * 4);

    let hipY = 0.95 - crouch * 0.4 - this.landT * 0.08 + Math.abs(Math.cos(this.phase)) * 0.03 * run;
    let thighL = sw * amp - crouch * 1.25, thighR = -sw * amp - crouch * 1.25;
    let kneeL = Math.max(0, -Math.cos(this.phase)) * amp * 1.3 + crouch * 2.2;
    let kneeR = Math.max(0, Math.cos(this.phase)) * amp * 1.3 + crouch * 2.2;
    if (!s.onGround) {
      // jump / fall
      const f = s.vy > 0 ? 0.6 : 0.35;
      thighL = k(this.hipL.rotation.x, 0.7 * f + 0.2);
      thighR = k(this.hipR.rotation.x, -0.2 * f);
      kneeL = 1.1 * f + 0.3;
      kneeR = 0.6 * f + 0.2;
      hipY = 0.95;
    }
    if (s.sliding) {
      // hips low, lead leg extended, trailing knee tucked
      hipY = 0.46;
      thighL = -0.7;
      thighR = -1.5;
      kneeL = 2.4;
      kneeR = 0.4;
    }
    this.hips.position.y = k(this.hips.position.y, hipY, 18);
    this.hipL.rotation.x = k(this.hipL.rotation.x, thighL, 18);
    this.hipR.rotation.x = k(this.hipR.rotation.x, thighR, 18);
    this.knL.rotation.x = k(this.knL.rotation.x, -kneeL, 18);
    this.knR.rotation.x = k(this.knR.rotation.x, -kneeR, 18);

    // torso lean & aim
    const lean = -run * 0.12 - crouch * 0.18;
    this.torso.rotation.x = k(this.torso.rotation.x, lean + s.pitch * 0.25 - (s.sliding ? 0.1 : 0));
    this.torso.rotation.y = k(this.torso.rotation.y, sw * 0.06 * run);
    this.head.rotation.x = k(this.head.rotation.x, s.pitch * 0.55 - lean * 0.5);

    // peek: roll the upper body (shoulders, arms, weapon all ride on the torso),
    // keeping the hips and legs planted
    const peek = s.lean ?? 0;
    this.torso.rotation.z = k(this.torso.rotation.z, -peek * 0.5, 12);
    this.torso.position.x = k(this.torso.position.x, peek * 0.1, 12);
    this.head.rotation.z = k(this.head.rotation.z, peek * 0.22, 12);

    // arms: two-handed weapon hold, aimed by pitch
    const melee = this.weaponId ? WEAPONS[this.weaponId].category === 'melee' : false;
    let shR = 1.35 + s.pitch * 0.9, elR = -0.25, shRz = 0.12;
    let shL = 1.25 + s.pitch * 0.9, elL = -0.9, shLz = -0.55;
    if (melee) {
      shL = 0.25 + sw * 0.4 * run;
      elL = -0.4;
      shLz = 0;
    }
    if (s.reloading) {
      const r = Math.sin(performance.now() / 160);
      shL = 0.7 + r * 0.25;
      elL = -1.4;
      shLz = -0.2;
    }
    if (s.interact) {
      shR = 0.9;
      shL = 0.9;
      elR = -0.8;
      elL = -0.8;
      shLz = -0.1;
      shRz = 0.1;
    }
    if (s.cast > 0) {
      shL = 1.6 * s.cast + shL * (1 - s.cast);
      elL = -0.1;
      shLz = -0.1;
    }
    if (s.pose === 'victory') {
      shR = 2.9;
      shL = 2.9;
      elR = -0.3;
      elL = -0.3;
      shLz = -0.3;
      shRz = 0.3;
    } else if (s.pose === 'defeat') {
      shR = 0.15;
      shL = 0.1;
      elR = -0.2;
      elL = -0.2;
      this.head.rotation.x = -0.6;
    }
    shR -= s.fireKick * 0.12;
    shL -= s.fireKick * 0.08;
    this.shR.rotation.x = k(this.shR.rotation.x, shR, 20);
    this.shR.rotation.z = k(this.shR.rotation.z, shRz, 20);
    this.elR.rotation.x = k(this.elR.rotation.x, elR, 20);
    this.shL.rotation.x = k(this.shL.rotation.x, shL, 20);
    this.shL.rotation.z = k(this.shL.rotation.z, shLz, 20);
    this.elL.rotation.x = k(this.elL.rotation.x, elL, 20);
  }

  /** World position of the weapon muzzle (approx. right hand + barrel). */
  muzzleWorld(out: THREE.Vector3) {
    this.handR.getWorldPosition(out);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion);
    return out.addScaledVector(fwd, this.weaponId ? WEAPONS[this.weaponId].look.length * 0.9 : 0.3);
  }

  setOpacity(o: number) {
    for (const m of this.mats) {
      m.transparent = o < 1 || this.hologram;
      (m as THREE.MeshStandardMaterial).opacity = this.hologram ? Math.min(0.85, o) : o;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material !== XRAY_MAT && !this.weapon?.getObjectById(mesh.id)) mesh.geometry.dispose();
    });
    this.mats.forEach((m) => m.dispose());
  }
}

/** Renders character portraits once (offscreen) for menus & lobby. */
const portraitCache = new Map<string, string>();
export function characterPortrait(id: CharacterId, size = 256): string {
  const key = `${id}:${size}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const def = CHARACTERS[id];
    scene.background = null;
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    cam.position.set(-0.55, 1.62, -1.95);
    cam.lookAt(0, 1.38, 0);
    scene.add(new THREE.HemisphereLight(0xdde6ff, 0x221a14, 1.4));
    const key1 = new THREE.DirectionalLight(0xffffff, 2.2);
    key1.position.set(-2, 3, -3);
    const rim = new THREE.DirectionalLight(new THREE.Color(def.color).getHex(), 3);
    rim.position.set(2, 2, 2);
    scene.add(key1, rim);
    const model = new CharacterModel(id, new THREE.Color(def.color).getHex(), { xray: false });
    model.setWeapon(id === 'bastion' ? 'bulwark' : id === 'specter' ? 'longwatch' : id === 'medic' ? 'hornet' : 'corsair');
    for (let i = 0; i < 30; i++) model.update(1 / 30, { speed: 0, vy: 0, onGround: true, crouch: 0, pitch: 0.1, alive: true, reloading: false, fireKick: 0, interact: 0, cast: 0 });
    model.root.rotation.y = 0.35;
    scene.add(model.root);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    model.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    portraitCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}
