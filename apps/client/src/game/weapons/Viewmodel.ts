import * as THREE from 'three';
import { CHARACTERS, WEAPONS, type CharacterId, type WeaponDef, type WeaponId } from '@phantom/shared';
import { softDotTexture } from '../rendering/textures';
import { buildWeapon, type WeaponModel } from './WeaponModel';
import { energyClock, paletteAt } from './EnergyMaterial';
import { gunMaterial } from './GunMaterials';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SightId } from './Sights';
import {
  CYCLE,
  EQUIP_CUES,
  INSPECT_CUES,
  INSPECT_DUR,
  TUBE_SHELLS,
  crossCues,
  cycleKind,
  reloadCues,
  reloadKind,
  tubeWindow,
  type CuePoint,
  type CycleKind,
  type HandlingCue,
  type ReloadKind,
} from './WeaponAnims';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** 0→1 over [a, b] with smoothstep easing */
const seg = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
/** ease out with a small overshoot (settles like a real weight) */
const easeOutBack = (x: number) => {
  const c1 = 1.5;
  const t = clamp01(x) - 1;
  return 1 + (c1 + 1) * t * t * t + c1 * t * t;
};

/**
 * Reload pose per reload type, applied with the tilt envelope: [x, y, z, pitch, yaw, roll].
 * The weapon comes up and in, canted so the magazine well / loading port faces the camera.
 */
const RELOAD_TILT: Record<ReloadKind, [number, number, number, number, number, number]> = {
  mag: [-0.09, 0.07, 0.05, 0.07, 0.3, -0.42],
  belt: [-0.08, 0.05, 0.03, 0.06, 0.3, -0.35],
  pistol: [-0.05, 0.09, 0.03, 0.3, 0.15, -0.2],
  topMag: [-0.06, 0.05, 0.03, -0.25, 0.2, 0.25],
  tube: [-0.07, 0.06, 0.04, 0.05, 0.3, -0.5],
  revolver: [-0.05, 0.05, 0.03, 0, 0.1, -0.45],
};

interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

const SPARKS = 28;
const TRAIL = 18;

export interface ViewmodelInput {
  speed: number;
  onGround: boolean;
  ads: boolean;
  crouch: number;
  lookDX: number;
  lookDY: number;
  reloadT: number;
  equipT: number;
  sprinting: boolean;
  lowered: boolean;
  headBob: boolean;
  /** peek lean blend, -1 full left .. +1 full right */
  lean: number;
  /** true while sliding */
  sliding: boolean;
  visible: boolean;
  /** eased aim-down-sights progress 0..1 driven by the game (shared with camera zoom and scope overlay) */
  adsT?: number;
}

function limb(from: THREE.Vector3, to: THREE.Vector3, thick: number, m: THREE.Material) {
  const len = from.distanceTo(to);
  // tapered forearm (wrist → elbow) instead of a square bar
  const geo = new THREE.CylinderGeometry(thick * 0.42, thick * 0.6, len, 14, 1).rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.lookAt(to);
  return mesh;
}

const capsule = (r: number, len: number, m: THREE.Material) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);

/**
 * Gloved hand: palm, four segmented fingers curled around a grip of width `gw`, thumb,
 * knuckle pad and cuff. `side` 1 = right (fingers wrap from the right), -1 = left.
 * Origin is the centre of the grip the hand holds; the grip runs along `axis` ('y' pistol grip,
 * 'z' handguard).
 */
function gloveHand(side: 1 | -1, gw: number, axis: 'y' | 'z', glove: THREE.Material, pad: THREE.Material) {
  const h = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.028, 0.082, 0.078, 2, 0.01), glove);
  palm.position.set(side * (gw / 2 + 0.014), 0, 0.012);
  h.add(palm);
  const kn = new THREE.Mesh(new RoundedBoxGeometry(0.01, 0.07, 0.03, 2, 0.004), pad);
  kn.position.set(side * (gw / 2 + 0.03), 0, -0.02);
  h.add(kn);
  // fingers wrap across the front of the grip to the opposite side
  for (let i = 0; i < 4; i++) {
    const y = 0.03 - i * 0.021;
    const prox = capsule(0.0085, gw * 0.55, glove);
    prox.rotation.z = Math.PI / 2;
    prox.position.set(side * gw * 0.15, y, -gw * 0.62);
    const dist = capsule(0.008, 0.018, glove);
    dist.position.set(-side * (gw / 2 + 0.006), y, -gw * 0.32);
    dist.rotation.x = Math.PI / 2;
    h.add(prox, dist);
  }
  // thumb along the opposite side
  const thumb = capsule(0.009, 0.045, glove);
  thumb.position.set(-side * (gw / 2 + 0.008), 0.035, -0.005);
  thumb.rotation.x = Math.PI / 2 - 0.4;
  h.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.031, 0.025, 14).rotateX(Math.PI / 2), pad);
  cuff.position.set(side * (gw / 2 + 0.012), -0.012, 0.06);
  h.add(cuff);
  if (axis === 'z') {
    // support hand under a handguard: rotate so fingers curl up the side
    h.rotation.z = -side * Math.PI / 2;
  }
  return h;
}

/**
 * First-person hands + weapon, rendered in a separate scene/camera on top of the world
 * (never clips into walls). Procedural animation: equip, reload (with magazine handling),
 * fire kick, ADS, sway, bob, inspect, melee swing, ability cast.
 */
export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 20);
  private root = new THREE.Group();
  private sway = new THREE.Group();
  private kick = new THREE.Group();
  private holder = new THREE.Group();
  private model: WeaponModel | null = null;
  private armsL = new THREE.Group();
  private armsR = new THREE.Group();
  private weaponId: WeaponId | null = null;
  private skin = 'standard';
  private sightId: SightId = 'iron';
  private glove: THREE.MeshStandardMaterial;
  private sleeve: THREE.MeshStandardMaterial;
  private flash: THREE.Sprite;
  private flashT = 0;
  private kickZ = 0;
  private kickV = 0;
  private kickR = 0;
  private kickRV = 0;
  private swayX = 0;
  private swayY = 0;
  private bobPhase = 0;
  private adsT = 0;
  private inspectT = -1;
  private meleeT = -1;
  private castT = -1;
  private reloadDur = 1;
  private equipDur = 1;
  private magHome = new THREE.Vector3();
  private actionHome = new THREE.Vector3();
  /** magazine centre / bottom in weapon space at rest (for hand placement and revolver ejection) */
  private magCenter = new THREE.Vector3();
  private magBottom = 0;
  private actionCenter = new THREE.Vector3();
  private leftHome = new THREE.Vector3();
  private rightHome = new THREE.Vector3();
  /** shell / speedloader carried by the support hand during tube and revolver reloads */
  private handItem: THREE.Object3D | null = null;
  private reloadKindCur: ReloadKind = 'mag';
  private reloadCueList: CuePoint[] = [];
  private reloadLastP = 1;
  private reloadWasEmpty = false;
  private equipLastP = 1;
  private inspectLastP = 0;
  private cycleKindCur: CycleKind | null = null;
  /** manual bolt / pump cycle progress 0..1 (≥1 idle) */
  private manualT = 1;
  /** weapon-handling sound cues, fired in sync with the animation */
  onCue: ((cue: HandlingCue) => void) | null = null;
  private cue = (c: HandlingCue) => {
    if (c === 'eject' && this.reloadKindCur === 'revolver') this.ejectRevolver();
    this.onCue?.(c);
  };
  // energy skin effects
  private sparks: THREE.Points;
  private sparkPos = new Float32Array(SPARKS * 3);
  private sparkCol = new Float32Array(SPARKS * 3);
  private sparkLife = new Float32Array(SPARKS);
  private trail: THREE.Mesh;
  private trailPts: THREE.Vector3[] = [];
  private glow = 0;
  private reloading = false;
  private lowAmmo = false;
  private slideT = 0;
  readonly energyColor = new THREE.Color();
  energyIntensity = 0;
  // realism: ejected cases, flash petals + light, barrel smoke, slide lock
  private casings: { mesh: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3; t: number }[] = [];
  private casingIdx = 0;
  private casingGeo: Record<'pistol' | 'rifle' | 'magnum' | 'shell', THREE.BufferGeometry>;
  private pendingEject: { t: number }[] = [];
  private flashPetals: THREE.Mesh;
  private flashLight = new THREE.PointLight(0xffb060, 0, 1.6, 2);
  private smoke: { sp: THREE.Sprite; t: number; v: THREE.Vector3 }[] = [];
  private smokeIdx = 0;
  private heat = 0;
  private empty = false;
  private sprintT = 0;
  /** pistol slide / bolt carrier cycle: 0 = in battery, 1 = fully rearward */
  private cycleT = 1;
  private slidePos = 0;

  constructor(character: CharacterId) {
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.camera);
    this.camera.add(this.root);
    this.root.add(this.sway);
    this.sway.add(this.kick);
    this.kick.add(this.holder);
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x302820, 1.3);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-1, 2, 1);
    const rim = new THREE.DirectionalLight(0xff9a70, 0.8);
    rim.position.set(2, 0, -1);
    this.scene.add(hemi, key, rim);
    const accent = new THREE.Color(CHARACTERS[character].color).getHex();
    this.glove = gunMaterial('rubber', 0x24262a);
    this.sleeve = new THREE.MeshStandardMaterial({ color: character === 'medic' ? 0xdfe3e8 : 0x2b3038, roughness: 0.8, emissive: accent, emissiveIntensity: 0.04 });
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.flash.visible = false;
    this.flash.renderOrder = 10;
    this.holder.add(this.armsL, this.armsR);

    // muzzle flash petals: three crossed planes with a procedural star texture
    const fc = document.createElement('canvas');
    fc.width = fc.height = 128;
    const fg = fc.getContext('2d')!;
    const grd = fg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,250,220,1)');
    grd.addColorStop(0.25, 'rgba(255,190,90,0.9)');
    grd.addColorStop(1, 'rgba(255,120,30,0)');
    fg.fillStyle = grd;
    for (let i = 0; i < 6; i++) {
      fg.save();
      fg.translate(64, 64);
      fg.rotate((i / 6) * Math.PI * 2 + Math.random() * 0.3);
      fg.beginPath();
      fg.moveTo(0, -6);
      fg.lineTo(60, 0);
      fg.lineTo(0, 6);
      fg.fill();
      fg.restore();
    }
    fg.beginPath();
    fg.arc(64, 64, 22, 0, Math.PI * 2);
    fg.fill();
    const ftex = new THREE.CanvasTexture(fc);
    ftex.colorSpace = THREE.SRGBColorSpace;
    const fmat = new THREE.MeshBasicMaterial({ map: ftex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const petal = new THREE.PlaneGeometry(1, 1);
    const side1 = new THREE.PlaneGeometry(1.6, 0.6).rotateY(Math.PI / 2).translate(0, 0, -0.5);
    const side2 = side1.clone().rotateZ(Math.PI / 2);
    this.flashPetals = new THREE.Group() as unknown as THREE.Mesh;
    (this.flashPetals as unknown as THREE.Group).add(new THREE.Mesh(petal, fmat), new THREE.Mesh(side1, fmat), new THREE.Mesh(side2, fmat));
    this.flashPetals.visible = false;
    this.flashPetals.renderOrder = 10;
    this.scene.add(this.flashLight);

    // brass / shell casings
    const neck = (r: number, len: number) => {
      const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r * 1.05, 0), new THREE.Vector2(r * 1.05, len * 0.06), new THREE.Vector2(r * 0.92, len * 0.08), new THREE.Vector2(r, len * 0.1), new THREE.Vector2(r, len * 0.72), new THREE.Vector2(r * 0.62, len * 0.82), new THREE.Vector2(r * 0.62, len), new THREE.Vector2(r * 0.5, len)];
      return new THREE.LatheGeometry(pts, 14).rotateX(Math.PI / 2);
    };
    this.casingGeo = {
      pistol: new THREE.CylinderGeometry(0.0048, 0.0048, 0.019, 14).rotateX(Math.PI / 2),
      magnum: new THREE.CylinderGeometry(0.006, 0.006, 0.03, 14).rotateX(Math.PI / 2),
      rifle: neck(0.0055, 0.045),
      shell: new THREE.CylinderGeometry(0.0105, 0.0105, 0.06, 16).rotateX(Math.PI / 2),
    };
    const brass = gunMaterial('brass', 0xc8a14e);
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(this.casingGeo.rifle, brass);
      mesh.visible = false;
      mesh.renderOrder = 9;
      this.camera.add(mesh);
      this.casings.push({ mesh, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 });
    }
    // barrel smoke
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: 0x8e8e8e, transparent: true, opacity: 0, depthWrite: false }));
      sp.visible = false;
      this.camera.add(sp);
      this.smoke.push({ sp, t: 0, v: new THREE.Vector3() });
    }

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparks = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ size: 0.012, map: softDotTexture(), vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 11;
    this.sparks.visible = false;
    this.holder.add(this.sparks);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 12;
    this.trail.visible = false;
    this.camera.add(this.trail);
  }

  setLowAmmo(low: boolean) {
    this.lowAmmo = low;
  }

  setAspect(a: number) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(id: WeaponId, skin: string, sightId: SightId = 'iron') {
    if (id === this.weaponId && skin === this.skin && sightId === this.sightId) return;
    this.weaponId = id;
    this.skin = skin;
    this.sightId = sightId;
    if (this.model) this.holder.remove(this.model.group);
    this.model = buildWeapon(id, skin, sightId);
    if (this.model.mag) {
      this.model.group.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(this.model.mag);
      b.getCenter(this.magCenter);
      this.magBottom = b.min.y;
    }
    if (this.model.action) {
      this.model.group.updateMatrixWorld(true);
      new THREE.Box3().setFromObject(this.model.action).getCenter(this.actionCenter);
    }
    this.holder.add(this.model.group);
    this.model.muzzle.add(this.flash);
    this.model.muzzle.add(this.flashPetals);
    this.pendingEject = [];
    this.heat = 0;
    if (this.model.mag) this.magHome.copy(this.model.mag.position);
    if (this.model.action) this.actionHome.copy(this.model.action.position);
    this.buildArms();
    this.buildHandItem();
    this.inspectT = -1;
    this.reloadKindCur = reloadKind(WEAPONS[id]);
    this.cycleKindCur = cycleKind(WEAPONS[id]);
    this.manualT = 1;
    this.reloadLastP = 1;
    this.sparks.visible = !!this.model.energy;
    this.trailPts = [];
    this.sparkLife.fill(0);
    this.glow = 1.5; // equip flare
  }

  private buildArms() {
    this.armsL.clear();
    this.armsR.clear();
    this.armL = null;
    this.armR = null;
    const w = WEAPONS[this.weaponId!];
    const B = w.look.bulk, L = w.look.length;
    const gw = Math.max(0.026, B * 0.5);
    const pad = gunMaterial('rubber', 0x3a3d42);
    // firing hand on the pistol grip
    const gripR = new THREE.Vector3(0, -B * 0.75, B * 0.25);
    const right = gloveHand(1, gw, 'y', this.glove, pad);
    right.position.copy(gripR);
    this.rightHome.copy(gripR);
    right.rotation.x = 0.3;
    const wristR = gripR.clone().add(new THREE.Vector3(gw / 2 + 0.012, -0.03, 0.07));
    const shR = new THREE.Vector3(0.14, -0.34, 0.4);
    const limbR = limb(wristR, shR, 0.075, this.sleeve);
    this.armsR.add(right, limbR);
    this.armR = { mesh: limbR, wrist: wristR.clone(), shoulder: shR, len0: wristR.distanceTo(shR) };
    if (w.category === 'melee') return;
    if (w.category === 'sidearm') {
      // support hand cups the firing hand (thumbs forward)
      const left = gloveHand(-1, gw + 0.03, 'y', this.glove, pad);
      left.position.copy(gripR).add(new THREE.Vector3(-0.012, -0.008, -0.004));
      this.leftHome.copy(left.position);
      left.rotation.x = 0.3;
      const wl = gripR.clone().add(new THREE.Vector3(-gw / 2 - 0.03, -0.035, 0.07));
      const sh = new THREE.Vector3(-0.2, -0.36, 0.32);
      const lm = limb(wl, sh, 0.075, this.sleeve);
      this.armsL.add(left, lm);
      this.armL = { mesh: lm, wrist: wl, shoulder: sh, len0: wl.distanceTo(sh) };
    } else {
      // support hand under the handguard
      const gripL = new THREE.Vector3(0, -B * 0.42, -L * 0.42);
      const left = gloveHand(-1, B * 0.7, 'z', this.glove, pad);
      left.position.copy(gripL);
      this.leftHome.copy(gripL);
      const wl = gripL.clone().add(new THREE.Vector3(-0.02, -0.045, 0.06));
      const sh = new THREE.Vector3(-0.21, -0.36, 0.06);
      const lm = limb(wl, sh, 0.075, this.sleeve);
      this.armsL.add(left, lm);
      this.armL = { mesh: lm, wrist: wl, shoulder: sh, len0: wl.distanceTo(sh) };
    }
  }

  private armL: { mesh: THREE.Mesh; wrist: THREE.Vector3; shoulder: THREE.Vector3; len0: number } | null = null;
  private armR: { mesh: THREE.Mesh; wrist: THREE.Vector3; shoulder: THREE.Vector3; len0: number } | null = null;

  /**
   * The hands move with their arm groups, but the shoulders stay where they are: re-aim and
   * stretch each forearm from the (moved) wrist back to the fixed shoulder.
   */
  private fitArms() {
    const fit = (arm: typeof this.armL, group: THREE.Group) => {
      if (!arm) return;
      const sh = arm.shoulder.clone().sub(group.position);
      const dir = sh.clone().sub(arm.wrist);
      const len = Math.max(0.05, dir.length());
      arm.mesh.position.copy(arm.wrist).lerp(sh, 0.5);
      arm.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      arm.mesh.scale.set(1, 1, len / arm.len0);
    };
    fit(this.armL, this.armsL);
    fit(this.armR, this.armsR);
  }

  /** shotgun shell / revolver speedloader held by the support hand while reloading */
  private buildHandItem() {
    this.handItem = null;
    const w = WEAPONS[this.weaponId!];
    const kind = reloadKind(w);
    if (kind !== 'tube' && kind !== 'revolver') return;
    const B = w.look.bulk;
    const g = new THREE.Group();
    const brass = gunMaterial('brass', 0xc8a14e);
    if (kind === 'tube') {
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.05, 14).rotateX(Math.PI / 2), gunMaterial('polymer', 0x9a2a22));
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.014, 14).rotateX(Math.PI / 2), brass);
      head.position.z = 0.03;
      g.add(hull, head);
    } else {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(B * 0.55, B * 0.55, B * 0.35, 18).rotateX(Math.PI / 2), gunMaterial('anodized', 0x2a2c30));
      g.add(body);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = new THREE.Mesh(new THREE.CylinderGeometry(B * 0.09, B * 0.09, B * 0.5, 8).rotateX(Math.PI / 2), brass);
        r.position.set(Math.cos(a) * B * 0.36, Math.sin(a) * B * 0.36, -B * 0.3);
        g.add(r);
      }
    }
    g.position.copy(this.leftHome).add(new THREE.Vector3(0, B * 0.35, -B * 0.1));
    g.visible = false;
    this.armsL.add(g);
    this.handItem = g;
  }

  /** revolver ejector rod: six empties tumble out of the swung-out cylinder */
  private ejectRevolver() {
    const m = this.model;
    if (!m?.mag) return;
    const centre = this.magCenter.clone().add(m.mag.position).sub(this.magHome);
    this.holder.updateMatrixWorld(true);
    const wp = centre.applyMatrix4(this.holder.matrixWorld);
    this.camera.worldToLocal(wp);
    for (let i = 0; i < 6; i++) {
      const c = this.casings[this.casingIdx++ % this.casings.length];
      c.mesh.geometry = this.casingGeo.magnum;
      c.mesh.material = gunMaterial('brass', 0xc8a14e);
      const a = (i / 6) * Math.PI * 2;
      c.mesh.position.set(wp.x + Math.cos(a) * 0.012, wp.y + Math.sin(a) * 0.012, wp.z + 0.02);
      c.mesh.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.4, 0, 0);
      c.v.set((Math.random() - 0.5) * 0.3, -0.2 - Math.random() * 0.3, 0.25 + Math.random() * 0.2);
      c.w.set(Math.random() * 10 - 5, Math.random() * 6, Math.random() * 10 - 5);
      c.t = 0.9;
      c.mesh.visible = true;
    }
  }

  fire() {
    if (!this.weaponId) return;
    const w = WEAPONS[this.weaponId];
    this.inspectT = -1;
    if (w.category === 'melee') {
      this.meleeT = 0;
      this.glow = Math.min(4, this.glow + 2);
      return;
    }
    const p = w.sound.punch;
    this.glow = Math.min(4, this.glow + 1.2 + p);
    this.kickV += 1.2 * p + 0.4;
    this.kickRV += 2.2 * p + 0.6;
    this.flashT = 0.045;
    this.flash.visible = true;
    this.flash.scale.setScalar(0.12 + Math.random() * 0.08 + p * 0.06);
    this.flash.material.rotation = Math.random() * Math.PI;
    // star-shaped flash, random size/rotation every shot (shotguns / snipers are bigger)
    const big = w.category === 'shotgun' || w.category === 'sniper' ? 1.6 : w.category === 'sidearm' ? 0.7 : 1;
    this.flashPetals.visible = true;
    this.flashPetals.scale.setScalar((0.07 + Math.random() * 0.05) * big);
    this.flashPetals.rotation.z = Math.random() * Math.PI;
    this.flashLight.intensity = 3 * big;
    this.heat = Math.min(1.5, this.heat + 0.12 * big);
    this.cycleT = 0;
    // eject: semi/auto immediately; pump & bolt actions when the hand cycles the action
    if (this.cycleKindCur) this.manualT = 0;
    else if (this.reloadKindCur !== 'revolver') this.ejectCasing();
  }

  setEmpty(empty: boolean) {
    this.empty = empty;
  }

  private ejectCasing() {
    const w = WEAPONS[this.weaponId!];
    const m = this.model!;
    const c = this.casings[this.casingIdx++ % this.casings.length];
    const kind = w.category === 'shotgun' ? 'shell' : w.category === 'sidearm' ? (w.damage.body > 45 ? 'magnum' : 'pistol') : 'rifle';
    c.mesh.geometry = this.casingGeo[kind];
    c.mesh.material = kind === 'shell' ? gunMaterial('polymer', 0x9a2a22) : gunMaterial('brass', 0xc8a14e);
    // ejection port: right side of the receiver, a little behind the magazine well
    const B = w.look.bulk, L = w.look.length;
    const port = new THREE.Vector3(B * 0.45, m.sightY - B * (w.category === 'sidearm' ? 0.35 : 0.75), w.category === 'sidearm' ? -L * 0.25 : -L * 0.12);
    this.holder.updateMatrixWorld(true);
    port.applyMatrix4(this.holder.matrixWorld);
    this.camera.worldToLocal(port);
    c.mesh.position.copy(port);
    c.mesh.rotation.set(Math.random(), Math.random() * 3, 0);
    c.v.set(1.4 + Math.random() * 0.8, 1.1 + Math.random() * 0.6, 0.35 + Math.random() * 0.3);
    if (kind === 'shell') c.v.multiplyScalar(0.7);
    c.w.set(Math.random() * 30 - 15, Math.random() * 30, Math.random() * 20 - 10);
    c.t = 0.75;
    c.mesh.visible = true;
  }

  private puffSmoke() {
    const m = this.model;
    if (!m) return;
    const s = this.smoke[this.smokeIdx++ % this.smoke.length];
    const p = m.muzzle.getWorldPosition(new THREE.Vector3());
    this.camera.worldToLocal(p);
    s.sp.position.copy(p);
    s.v.set((Math.random() - 0.5) * 0.04, 0.06 + Math.random() * 0.05, -0.02);
    s.t = 1.4;
    s.sp.visible = true;
  }

  startReload(dur: number) {
    this.reloadDur = Math.max(0.1, dur);
    this.inspectT = -1;
    this.manualT = 1;
    this.reloadLastP = 0;
    this.reloadWasEmpty = this.empty;
    this.reloadCueList = this.weaponId ? reloadCues(WEAPONS[this.weaponId]) : [];
  }

  startEquip(dur: number) {
    this.equipDur = Math.max(0.1, dur);
    this.inspectT = -1;
    this.manualT = 1;
    this.equipLastP = -1;
  }

  inspect() {
    if (this.inspectT < 0) {
      this.inspectT = 0;
      this.inspectLastP = 0;
    }
  }

  cast() {
    this.castT = 0;
  }

  muzzleWorld(out: THREE.Vector3) {
    return this.model ? this.model.muzzle.getWorldPosition(out) : out.set(0.2, -0.1, -0.8);
  }

  update(dt: number, s: ViewmodelInput) {
    this.root.visible = s.visible && !!this.model;
    if (!this.model || !this.weaponId) return;
    const w = WEAPONS[this.weaponId];
    const k = (a: number, b: number, r: number) => a + (b - a) * Math.min(1, dt * r);

    // recoil springs: stiff, so integrate in small fixed sub-steps (semi-implicit Euler);
    // a single large step after a frame hitch would otherwise diverge and fling the gun away
    const steps = Math.min(40, Math.ceil(dt / 0.004));
    const h = dt / Math.max(1, steps);
    for (let i = 0; i < steps; i++) {
      this.kickV += (-this.kickZ * 260 - this.kickV * 22) * h;
      this.kickZ += this.kickV * h;
      this.kickRV += (-this.kickR * 220 - this.kickRV * 20) * h;
      this.kickR += this.kickRV * h;
    }
    if (!Number.isFinite(this.kickZ + this.kickV + this.kickR + this.kickRV)) this.kickZ = this.kickV = this.kickR = this.kickRV = 0;
    this.kick.position.z = this.kickZ * 0.06;
    this.kick.rotation.x = this.kickR * 0.05;

    // sway (lags behind look direction)
    this.swayX = k(this.swayX, THREE.MathUtils.clamp(-s.lookDX * 0.0018, -0.08, 0.08), 10);
    this.swayY = k(this.swayY, THREE.MathUtils.clamp(-s.lookDY * 0.0018, -0.08, 0.08), 10);
    this.sway.rotation.y = this.swayX;
    this.sway.rotation.x = this.swayY;

    // bob
    const moving = s.onGround && s.speed > 0.5;
    if (moving) this.bobPhase += dt * s.speed * 1.9;
    const bobAmt = s.headBob && moving ? Math.min(1, s.speed / 5.4) * (s.ads ? 0.2 : 1) : 0;
    const bx = Math.sin(this.bobPhase) * 0.012 * bobAmt;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.01 * bobAmt + Math.sin(performance.now() / 900) * 0.002;

    // ADS
    this.adsT = s.adsT ?? k(this.adsT, s.ads ? 1 : 0, 14);
    const hip = new THREE.Vector3(0.17, -0.19, -0.5);
    const sightY = this.model.sightY;
    // pistols are aimed at arm's length; long guns are shouldered
    const ads = new THREE.Vector3(0, -sightY, w.category === 'sidearm' ? -0.43 : -0.3);
    const pos = hip.clone().lerp(ads, this.adsT);
    // When aiming, the stock / cheek comb / buttplate end up a few centimetres from the eye
    // (where the shooter's cheek actually is). Push the near plane out so they never fill the
    // screen; sights and optics are always well beyond this distance.
    const near = 0.01 + 0.065 * this.adsT * this.adsT;
    if (Math.abs(this.camera.near - near) > 0.0005) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    let rx = 0, ry = 0, rz = 0;
    pos.x += bx;
    pos.y += by;

    // sprint / lowered pose — blended; snaps up fast when the player fires or aims
    const wantLow = (s.sprinting || s.lowered) && !s.ads;
    this.sprintT = k(this.sprintT, wantLow ? 1 : 0, wantLow ? 7 : 22);
    if (this.sprintT > 0.001) {
      const e = this.sprintT * this.sprintT * (3 - 2 * this.sprintT);
      const run = Math.sin(this.bobPhase) * 0.03 * e;
      pos.y -= 0.06 * e;
      pos.x += 0.04 * e;
      rx -= 0.35 * e;
      ry += 0.5 * e + run;
      rz += run * 0.6;
    }

    // peek lean: shift and cant the weapon with the body. Fades out as the optic
    // comes up so a scoped reticle stays centred on the aim direction.
    if (Math.abs(s.lean) > 0.001) {
      const l = s.lean * (1 - this.adsT * 0.85);
      pos.x += l * 0.09;
      pos.y -= Math.abs(l) * 0.02;
      rz += l * 0.16;
      ry += l * 0.06;
    }

    // sliding: tuck the weapon low and forward, rolling it out with the body
    this.slideT = k(this.slideT, s.sliding ? 1 : 0, 12);
    if (this.slideT > 0.001) {
      const st = this.slideT;
      pos.y -= st * 0.075;
      pos.z -= st * 0.06;
      pos.x += st * 0.03;
      rx -= st * 0.3;
      ry += st * 0.14;
      rz += st * 0.16;
    }

    const m = this.model;
    const P: Pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    // reset animated parts to rest; the active timeline below moves them
    if (m.mag) {
      m.mag.position.copy(this.magHome);
      m.mag.rotation.set(0, 0, 0);
      m.mag.visible = true;
    }
    if (m.action && w.id !== 'bulwark') {
      m.action.position.copy(this.actionHome);
      m.action.rotation.set(0, 0, 0);
    }
    this.armsL.position.set(0, 0, 0);
    this.armsR.position.set(0, 0, 0);
    if (this.handItem) this.handItem.visible = false;

    // equip: drawn from the holster (sidearms) or swung up off the sling (long guns)
    if (s.equipT > 0) {
      const p = clamp01(1 - s.equipT / this.equipDur);
      crossCues(EQUIP_CUES, this.equipLastP, p, false, this.cue);
      this.equipLastP = Math.max(this.equipLastP, p); // monotonic: corrections never replay a cue
      const r = 1 - easeOutBack(p);
      if (w.category === 'sidearm') {
        P.y -= r * 0.3;
        P.x += r * 0.06;
        P.rx -= r * 0.7;
        P.rz -= r * 0.9;
      } else if (w.category === 'melee') {
        P.y -= r * 0.3;
        P.rx -= r * 0.9;
      } else {
        P.y -= r * 0.28;
        P.x -= r * 0.12;
        P.ry += r * 0.8;
        P.rz += r * 0.6;
        P.rx -= r * 0.4;
      }
    }

    if (s.reloadT > 0) {
      const p = clamp01(1 - s.reloadT / this.reloadDur);
      crossCues(this.reloadCueList, this.reloadLastP, p, this.reloadWasEmpty, this.cue);
      this.reloadLastP = Math.max(this.reloadLastP, p); // server corrections can nudge reloadT back
      this.animateReload(p, w, P);
    } else if (m.action && w.category === 'sidearm' && this.reloadKindCur === 'pistol') {
      // pistol slide: snaps fully rearward in ~15 ms, springs back into battery over ~45 ms,
      // and stays locked open on an empty magazine until the reload drops it
      this.cycleT = Math.min(1, this.cycleT + dt / 0.06);
      const c = this.cycleT;
      let target = c < 0.25 ? c / 0.25 : 1 - (c - 0.25) / 0.75;
      target = Math.max(0, target);
      if (this.empty && c >= 0.25) target = 1;
      this.slidePos += (target - this.slidePos) * Math.min(1, dt * 60);
      m.action.position.z = this.actionHome.z + this.slidePos * w.look.bulk * 0.62;
    } else if (m.action && w.id === 'svd') {
      // semi-auto charging handle reciprocates with the bolt carrier
      this.cycleT = Math.min(1, this.cycleT + dt / 0.08);
      const c = this.cycleT;
      m.action.position.z = this.actionHome.z + Math.max(0, c < 0.3 ? c / 0.3 : 1 - (c - 0.3) / 0.7) * 0.07;
    } else if (m.action && w.id === 'bulwark') m.action.rotation.z += dt * Math.min(40, Math.abs(this.kickV) * 30);

    // manual bolt / pump cycle after each shot
    if (this.cycleKindCur && this.manualT < 1 && s.reloadT <= 0) {
      const def = CYCLE[this.cycleKindCur];
      const prev = this.manualT;
      this.manualT = Math.min(1, this.manualT + dt / def.dur);
      crossCues(def.cues, prev, this.manualT, false, this.cue);
      if (prev < def.eject && this.manualT >= def.eject) this.ejectCasing();
      this.animateCycle(this.manualT, w, P);
    }

    // inspect: turn the weapon to show the right side, roll over to the left, tap the magazine
    if (this.inspectT >= 0) {
      this.inspectT += dt;
      const p = this.inspectT / INSPECT_DUR;
      crossCues(INSPECT_CUES, this.inspectLastP, Math.min(1, p), false, this.cue);
      this.inspectLastP = p;
      if (p >= 1) this.inspectT = -1;
      else {
        // the weapon is held out and turned in front of the face (not swung around the grip)
        const out = seg(p, 0.02, 0.15) * (1 - seg(p, 0.88, 1));
        P.z -= out * 0.1;
        P.x -= out * 0.07;
        P.y += out * 0.04;
        // 1) muzzle swings left to show the ejection side, 2) rolls over to show the top/left side
        const a1 = seg(p, 0.05, 0.22) * (1 - seg(p, 0.4, 0.55));
        const a2 = seg(p, 0.45, 0.6) * (1 - seg(p, 0.8, 0.95));
        const yaw = a1 * 0.55 + a2 * 0.25;
        const pitch = a2 * 0.1;
        P.ry += yaw;
        P.rx += pitch;
        P.rz += a1 * 0.25 - a2 * 0.6;
        // rotate about the middle of the weapon, not the grip, so the stock never swings into the face
        const d = w.look.length * 0.45;
        P.x += d * Math.sin(yaw);
        P.z -= d * (1 - Math.cos(yaw)) + d * (1 - Math.cos(pitch));
        P.y -= d * Math.sin(pitch);
        const tap = Math.sin(clamp01((p - 0.47) / 0.07) * Math.PI);
        if (m.mag && this.reloadKindCur !== 'revolver') m.mag.position.y = this.magHome.y - tap * w.look.bulk * 0.12;
        this.armsL.position.y -= tap * 0.015;
      }
    }

    this.fitArms();
    pos.x += P.x;
    pos.y += P.y;
    pos.z += P.z;
    rx += P.rx;
    ry += P.ry;
    rz += P.rz;

    // melee swing
    if (this.meleeT >= 0) {
      this.meleeT += dt;
      const p = this.meleeT / 0.35;
      if (p >= 1) this.meleeT = -1;
      else {
        const e = Math.sin(p * Math.PI);
        ry += 1.2 - p * 2.4;
        rz += e * 0.8;
        pos.x -= e * 0.15;
        pos.z -= e * 0.12;
      }
    }

    // ability cast: weapon dips, off-hand gesture
    if (this.castT >= 0) {
      this.castT += dt;
      const p = this.castT / 0.45;
      if (p >= 1) this.castT = -1;
      else {
        const e = Math.sin(p * Math.PI);
        pos.y -= e * 0.12;
        rx -= e * 0.4;
      }
    }

    this.holder.position.copy(pos);
    this.holder.rotation.set(rx, ry, rz);

    this.reloading = s.reloadT > 0;
    this.updateEnergy(dt, s);

    // muzzle flash (petals + light on the weapon)
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flash.visible = false;
        this.flashPetals.visible = false;
      }
    }
    if (this.flashLight.intensity > 0) {
      this.model.muzzle.getWorldPosition(this.flashLight.position);
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 60);
    }
    // delayed ejection for pump / bolt actions
    for (const e of this.pendingEject) e.t -= dt;
    while (this.pendingEject.length && this.pendingEject[0].t <= 0) {
      this.pendingEject.shift();
      this.ejectCasing();
    }
    // casing ballistics (camera space)
    for (const c of this.casings) {
      if (!c.mesh.visible) continue;
      c.t -= dt;
      c.v.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      c.mesh.rotation.x += c.w.x * dt;
      c.mesh.rotation.y += c.w.y * dt;
      c.mesh.rotation.z += c.w.z * dt;
      if (c.t <= 0) c.mesh.visible = false;
    }
    // barrel smoke after sustained fire
    this.heat = Math.max(0, this.heat - dt * 0.35);
    if (this.heat > 0.35 && Math.random() < dt * this.heat * 14) this.puffSmoke();
    for (const s of this.smoke) {
      if (!s.sp.visible) continue;
      s.t -= dt;
      s.sp.position.addScaledVector(s.v, dt);
      const k = 1 - s.t / 1.4;
      s.sp.scale.setScalar(0.03 + k * 0.12);
      (s.sp.material as THREE.SpriteMaterial).opacity = Math.sin(Math.min(1, k * 3) * Math.PI * 0.5) * (1 - k) * 0.22;
      if (s.t <= 0) s.sp.visible = false;
    }
  }

  /** Reactive glow, colour-cycled sparks and motion glow trails for energy skins. */
  private updateEnergy(dt: number, s: ViewmodelInput) {
    const m = this.model;
    if (!m?.energy || !m.boost) {
      this.energyIntensity = 0;
      this.trail.visible = false;
      return;
    }
    const e = m.energy;
    const t = energyClock.value;
    this.glow = Math.max(0, this.glow - dt * 3.5);
    let b = 1 + this.glow;
    if (this.reloading) b += 0.7 + Math.sin(t * 16) * 0.6;
    if (this.lowAmmo) b *= 0.75 + 0.35 * Math.max(0, Math.sin(t * 9));
    // aiming puts the weapon right in front of the eye: keep the glow subtle so it never blinds
    if (s.ads) b = 0.35 + (b - 1) * 0.15;
    m.boost.value = b;
    paletteAt(e.colors, t * e.speed, this.energyColor);
    this.energyIntensity = b;

    // sparks drift around the weapon body
    const L = WEAPONS[this.weaponId!].look.length;
    const c = new THREE.Color();
    for (let i = 0; i < SPARKS; i++) {
      this.sparkLife[i] -= dt;
      const k = i * 3;
      if (this.sparkLife[i] <= 0) {
        this.sparkLife[i] = 0.6 + Math.random() * 1.2;
        this.sparkPos[k] = (Math.random() - 0.5) * 0.12;
        this.sparkPos[k + 1] = (Math.random() - 0.3) * 0.1;
        this.sparkPos[k + 2] = -Math.random() * L * 1.1 + 0.08;
      }
      this.sparkPos[k] += Math.sin(t * 3 + i) * dt * 0.02;
      this.sparkPos[k + 1] += dt * (0.03 + (i % 3) * 0.01);
      this.sparkPos[k + 2] += dt * 0.04 * (1 + this.glow);
      paletteAt(e.colors, t * e.speed + i * 0.07, c);
      const f = Math.min(1, this.sparkLife[i]) * (0.6 + 0.3 * b);
      this.sparkCol[k] = c.r * f;
      this.sparkCol[k + 1] = c.g * f;
      this.sparkCol[k + 2] = c.b * f;
    }
    (this.sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.sparks.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // glow trail from the muzzle when the weapon moves fast (equip, inspect, melee, flicks)
    this.holder.updateMatrixWorld(true);
    const tip = m.muzzle.getWorldPosition(new THREE.Vector3());
    this.camera.worldToLocal(tip);
    this.trailPts.unshift(tip);
    if (this.trailPts.length > TRAIL) this.trailPts.length = TRAIL;
    const speed = this.trailPts.length > 1 ? this.trailPts[0].distanceTo(this.trailPts[1]) / Math.max(dt, 1e-3) : 0;
    const pos = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.trail.geometry.attributes.color as THREE.BufferAttribute;
    const strength = THREE.MathUtils.clamp((speed - 0.25) * 1.2, 0, 1);
    this.trail.visible = strength > 0.02 || this.trail.visible;
    for (let i = 0; i < TRAIL; i++) {
      const p = this.trailPts[Math.min(i, this.trailPts.length - 1)];
      const wdt = 0.012 * (1 - i / TRAIL);
      pos.setXYZ(i * 2, p.x, p.y + wdt, p.z);
      pos.setXYZ(i * 2 + 1, p.x, p.y - wdt, p.z);
      paletteAt(e.colors, t * e.speed + i * 0.05, c);
      const a = strength * (1 - i / TRAIL) * 1.5;
      col.setXYZ(i * 2, c.r * a, c.g * a, c.b * a);
      col.setXYZ(i * 2 + 1, c.r * a, c.g * a, c.b * a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    if (strength <= 0.02) this.trail.visible = false;
  }

  /** Move the support hand so the glove sits at `target` (weapon space). */
  private leftHandTo(target: THREE.Vector3, k = 1) {
    this.armsL.position.lerp(target.clone().sub(this.leftHome), k);
  }

  private animateReload(p: number, w: WeaponDef, P: Pose) {
    const m = this.model!;
    const B = w.look.bulk, L = w.look.length;
    const kind = this.reloadKindCur;
    const applyTilt = (tilt: number) => {
      const T = RELOAD_TILT[kind];
      P.x += tilt * T[0];
      P.y += tilt * T[1];
      P.z += tilt * T[2];
      P.rx += tilt * T[3];
      P.ry += tilt * T[4];
      P.rz += tilt * T[5];
    };
    const pouch = this.leftHome.clone().add(new THREE.Vector3(-0.06, -0.36, 0.12));

    if (kind === 'revolver') {
      applyTilt(seg(p, 0, 0.12) * (1 - seg(p, 0.82, 1)));
      // cylinder swings out to the left, then is snapped closed
      const sw = seg(p, 0.1, 0.18) * (1 - seg(p, 0.68, 0.73));
      if (m.mag) {
        m.mag.position.x = this.magHome.x - sw * B * 0.85;
        m.mag.position.y = this.magHome.y - sw * B * 0.35;
      }
      // muzzle up to dump the empties, muzzle down to load
      const up = seg(p, 0.2, 0.26) * (1 - seg(p, 0.32, 0.4));
      P.rx += up * 0.75;
      P.y += up * 0.03;
      const dn = seg(p, 0.4, 0.5) * (1 - seg(p, 0.7, 0.8));
      P.rx -= dn * 0.35;
      // support hand: pouch → speedloader to the cylinder → back to the grip
      const cyl = this.magCenter.clone().add(m.mag ? m.mag.position.clone().sub(this.magHome) : new THREE.Vector3());
      const atCyl = cyl.clone().add(new THREE.Vector3(0, -B * 0.35, B * 0.9));
      if (p < 0.42) this.leftHandTo(pouch, seg(p, 0.26, 0.42));
      else if (p < 0.63) {
        this.leftHandTo(pouch);
        this.leftHandTo(atCyl, seg(p, 0.44, 0.6));
      } else {
        this.leftHandTo(atCyl);
        this.armsL.position.multiplyScalar(1 - seg(p, 0.64, 0.8));
      }
      if (this.handItem) this.handItem.visible = p > 0.4 && p < 0.62;
      return;
    }

    if (kind === 'tube') {
      applyTilt(seg(p, 0, 0.1) * (1 - seg(p, 0.86, 1)));
      // loading port under the receiver
      const port = new THREE.Vector3(0, m.sightY - B * 1.55, -L * 0.08);
      const approach = port.clone().add(new THREE.Vector3(-B * 0.2, -B * 0.6, B * 0.6));
      const [s0] = tubeWindow(0);
      const [, eN] = tubeWindow(TUBE_SHELLS - 1);
      let carrying = false;
      if (p < s0) this.leftHandTo(approach, seg(p, 0.03, s0));
      else if (p < eN) {
        const i = Math.min(TUBE_SHELLS - 1, Math.floor((p - s0) / (tubeWindow(1)[0] - s0)));
        const [a, b] = tubeWindow(i);
        const q = (p - a) / (b - a);
        if (q < 0.4) {
          this.leftHandTo(port);
          this.leftHandTo(pouch, smooth(q / 0.4));
        } else if (q < 0.75) {
          this.leftHandTo(pouch);
          this.leftHandTo(approach, smooth((q - 0.4) / 0.35));
          carrying = true;
        } else {
          this.leftHandTo(approach);
          this.leftHandTo(port, smooth((q - 0.75) / 0.25));
          carrying = q < 0.95;
        }
      } else {
        this.leftHandTo(port);
        this.armsL.position.multiplyScalar(1 - seg(p, eN, eN + 0.06));
      }
      if (this.handItem) this.handItem.visible = carrying;
      // empty: rack the pump / drop the bolt to chamber the first shell
      if (this.reloadWasEmpty && m.action && w.id === 'breacher') {
        const back = seg(p, 0.84, 0.88) * (1 - seg(p, 0.9, 0.94));
        m.action.position.z = this.actionHome.z + back * 0.09;
        this.armsL.position.z += back * 0.09;
      }
      return;
    }

    // detachable magazine (rifles, SMGs, pistols, P90 top mag, belt-fed box)
    const R = kind === 'belt' ? 0.22 : 0.1;
    applyTilt(seg(p, 0, 0.15) * (1 - seg(p, kind === 'belt' ? 0.86 : 0.8, 1)));
    // magazine path: out along `dir`, falls away; a fresh one is brought in along the same line
    const dir = kind === 'topMag' ? new THREE.Vector3(-0.35, 0.75, 0.3).normalize() : new THREE.Vector3(0, -1, kind === 'pistol' ? 0.1 : 0.06).normalize();
    let off = 0;
    let rot = 0;
    let visible = true;
    // a dropped magazine falls under gravity; a top magazine is lifted off and pulled away
    const top = kind === 'topMag';
    if (p >= R && p < R + 0.2) {
      const d = (p - R) / 0.2;
      off = top ? d * 0.12 : d * d * 0.42;
      rot = d * (top ? 0.25 : 0.5);
    } else if (p >= R + 0.2 && p < 0.42) visible = false;
    else if (p >= 0.42 && p < 0.6) {
      const u = seg(p, 0.42, 0.6);
      const from = top ? 0.14 : 0.32;
      off = from + (0.03 - from) * u;
      rot = (1 - u) * (top ? 0.2 : 0.35);
    } else if (p >= 0.6 && p < 0.67) off = 0.03 * (1 - seg(p, 0.6, 0.67));
    if (m.mag) {
      m.mag.position.addScaledVector(dir, off);
      m.mag.rotation.x = kind === 'topMag' ? -rot : rot;
      m.mag.visible = visible;
    }
    // seat jolt + bolt-release jolt
    const seat = Math.sin(clamp01((p - 0.66) / 0.06) * Math.PI);
    P.rx -= seat * 0.05;
    P.y += seat * 0.008;
    if (this.reloadWasEmpty && kind !== 'pistol') {
      const rel = Math.sin(clamp01((p - 0.76) / 0.06) * Math.PI);
      P.rz -= rel * 0.06;
      P.z += rel * 0.01;
    }
    // support hand: strip the mag, reach for the pouch, carry the new mag in, return
    const magNow = this.magCenter.clone().addScaledVector(dir, off);
    if (kind !== 'topMag') magNow.y = this.magBottom - off + B * 0.05; // palm under the baseplate
    if (p < 0.38) this.leftHandTo(pouch, seg(p, R, 0.38));
    else if (p < 0.42) this.leftHandTo(pouch);
    else if (p < 0.67) {
      this.leftHandTo(pouch);
      this.leftHandTo(magNow, seg(p, 0.42, 0.5));
    } else {
      const seated = this.magCenter.clone();
      seated.y = kind === 'topMag' ? seated.y : this.magBottom + B * 0.05;
      this.leftHandTo(seated);
      this.armsL.position.multiplyScalar(1 - seg(p, 0.67, 0.8));
    }
  }

  /** hand-cycled pump / bolt after a shot */
  private animateCycle(t: number, w: WeaponDef, P: Pose) {
    const m = this.model!;
    if (!m.action) return;
    const B = w.look.bulk;
    if (this.cycleKindCur === 'pump') {
      const back = seg(t, 0.25, 0.4) * (1 - seg(t, 0.5, 0.66));
      m.action.position.z = this.actionHome.z + back * 0.09;
      this.armsL.position.z += back * 0.09;
      P.rx += back * 0.04;
      P.y -= back * 0.008;
    } else {
      // bolt-action: hand leaves the grip, lifts the bolt, pulls it back, runs it home, locks it
      const reach = seg(t, 0.22, 0.34) * (1 - seg(t, 0.84, 0.97));
      const up = seg(t, 0.32, 0.4) * (1 - seg(t, 0.76, 0.84));
      const back = seg(t, 0.42, 0.52) * (1 - seg(t, 0.6, 0.7));
      const delta = new THREE.Vector3(up * B * 0.15, up * B * 0.3, back * 0.09);
      m.action.position.copy(this.actionHome).add(delta);
      // right hand leaves the grip and pinches the bolt knob (knob centre + its current travel)
      const knob = this.actionCenter.clone().add(delta).add(new THREE.Vector3(B * 0.3, -B * 0.2, B * 0.1));
      this.armsR.position.copy(knob.sub(this.rightHome).multiplyScalar(reach));
      P.rz += reach * 0.18;
      P.y -= reach * 0.02;
    }
  }

  render(renderer: THREE.WebGLRenderer) {
    if (!this.root.visible) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
