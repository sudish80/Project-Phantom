import * as THREE from 'three';
import { getSkin, WEAPONS, type EnergySpec, type WeaponDef, type WeaponId } from '@phantom/shared';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { energyMaterial } from './EnergyMaterial';
import { gunMaterial, mutedTone, WEAPON_FINISH } from './GunMaterials';
import { defaultSightFor, getSight, type SightDef, type SightId } from './Sights';

export interface WeaponModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  mag: THREE.Object3D | null;
  /** extra moving part (slide / bolt / pump / spin barrel) */
  action: THREE.Object3D | null;
  /** height of the sight line above the grip origin, used for ADS alignment */
  sightY: number;
  /** the optic mounted on this weapon */
  sight: SightDef;
  /** energy skin glow intensity (reactive); null for standard skins */
  boost: { value: number } | null;
  energy: EnergySpec | null;
}

interface Ctx {
  B: number;
  L: number;
  w: WeaponDef;
  body: THREE.Material;
  dark: THREE.Material;
  accent: THREE.Material;
  wood: THREE.Material;
  steel: THREE.Material;
}

interface Parts {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  mag: THREE.Object3D | null;
  action: THREE.Object3D | null;
  /** Y of the top rail surface (where an optic base sits) */
  railY: number;
  /** Z centre of the rail */
  railZ: number;
  /** usable rail length */
  railLen: number;
  /** sight-line height of the built-in iron sights (pistols / revolvers) */
  ironY?: number;
}

// ── primitive helpers (origin at the grip, barrel points -Z) ─────────────────

/** Parts machined/moulded with chamfered edges — real guns have no razor-sharp box corners. */
/** third-person / loot weapons skip chamfers & dense cylinders (seen small, many on screen) */
let lowDetail = false;

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const minDim = lowDetail ? 0 : Math.min(w, h, d);
  const r = Math.min(0.0045, minDim * 0.22);
  const geo = minDim > 0.003 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** cylinder whose axis points forward (-Z) */
/** materials that become blued steel when used for round parts (barrels, pins, gas tubes) */
const roundSwap = new Map<THREE.Material, THREE.Material>();
const sw = (m: THREE.Material) => roundSwap.get(m) ?? m;

function cyl(rt: number, rb: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, lowDetail ? seg : Math.max(seg * 2, 20)), sw(m));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** cylinder standing upright (Y) */
function cylY(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, Math.max(seg * 2, 16)), sw(m));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** cylinder across the weapon (X) — revolver cylinders, drums, rollers */
function cylX(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, Math.max(seg * 2, 24)), m);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** trigger guard / hand ring: a partial torus in the Y-Z plane */
function guard(r: number, tube: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 28, Math.PI * 1.35), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.PI / 2;
  mesh.rotation.z = -Math.PI * 0.18;
  mesh.castShadow = true;
  return mesh;
}

/** picatinny rail: a base strip with transverse ridges added directly to `root` */
function picatinny(root: THREE.Group, len: number, m: THREE.Material, x: number, y: number, z: number, width = 0.022) {
  root.add(box(width, 0.007, len, m, x, y, z));
  const n = Math.max(3, Math.floor(len / 0.017));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (i + 0.5) * (len / n);
    root.add(box(width + 0.003, 0.009, 0.007, m, x, y + 0.006, z + t));
  }
}

/**
 * Curved detachable magazine: one continuous bevelled body extruded from its side profile
 * (follows the real cartridge-stack curve), with reinforcing ribs and a floor plate.
 * Returns a group whose origin is the magwell mouth.
 */
function bananaMag(m: THREE.Material, B: number, len: number, curve: number, segs = 6, depth = B * 1.9) {
  const grp = new THREE.Group();
  const bw = B * 0.46;
  const steps = Math.max(8, segs * 3);
  const segLen = len / steps;
  const da = (curve * segs) / steps;
  const front: [number, number][] = [];
  const rear: [number, number][] = [];
  let a = 0, cy = 0, cz = 0;
  const pts: { y: number; z: number; a: number }[] = [{ y: 0, z: 0, a: 0 }];
  for (let i = 0; i < steps; i++) {
    a += da;
    cy -= Math.cos(a) * segLen;
    cz -= Math.sin(a) * segLen;
    pts.push({ y: cy, z: cz, a });
  }
  for (const p of pts) {
    // normal toward the front of the gun (-z) is (-cos a, sin a) in (z, y)
    const nz = -Math.cos(p.a), ny = Math.sin(p.a);
    front.push([-(p.z + (nz * depth) / 2), p.y + (ny * depth) / 2]);
    rear.push([-(p.z - (nz * depth) / 2), p.y - (ny * depth) / 2]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(front[0][0], front[0][1]);
  for (const [u, v] of front.slice(1)) shape.lineTo(u, v);
  for (const [u, v] of rear.reverse()) shape.lineTo(u, v);
  shape.closePath();
  const bevel = Math.min(bw * 0.18, 0.004);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: bw - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  geo.rotateY(Math.PI / 2);
  geo.translate(-(bw - bevel * 2) / 2, 0, 0);
  const body = new THREE.Mesh(geo, m);
  body.castShadow = true;
  grp.add(body);
  // stamped reinforcing ribs along each side
  for (const side of [-1, 1]) {
    for (let i = 2; i < pts.length - 2; i += 3) {
      const p = pts[i];
      const rib = box(0.002, segLen * 2.2, depth * 0.55, m, side * (bw / 2 + 0.0008), p.y, p.z);
      rib.rotation.x = p.a;
      grp.add(rib);
    }
  }
  // floor plate
  const last = pts[pts.length - 1];
  const base = box(bw * 1.18, B * 0.14, depth * 1.08, m, 0, last.y - B * 0.05, last.z);
  base.rotation.x = last.a;
  grp.add(base);
  return grp;
}

/** AR-pattern collapsible stock: buffer tube with a sliding buttstock */
function bufferStock(root: THREE.Group, body: THREE.Material, dark: THREE.Material, B: number, x: number, y: number, zFront: number, len: number) {
  const tubeLen = len * 0.72;
  root.add(cyl(B * 0.32, B * 0.32, tubeLen, dark, x, y, zFront + tubeLen / 2));
  const zc = zFront + tubeLen * 0.78;
  root.add(box(B * 0.62, B * 1.05, len * 0.5, body, x, y - B * 0.12, zc));
  root.add(box(B * 0.66, B * 1.35, B * 0.24, dark, x, y - B * 0.18, zc + len * 0.24));
}

/** wire / skeletal folding stock */
function skeletalStock(root: THREE.Group, m: THREE.Material, x: number, y: number, zFront: number, len: number) {
  const top = box(0.02, 0.02, len, m, x, y + 0.03, zFront + len / 2);
  const bot = box(0.02, 0.02, len, m, x, y - 0.05, zFront + len / 2);
  const plate = box(0.05, 0.16, 0.02, m, x, y - 0.01, zFront + len);
  root.add(top, bot, plate);
}

/** pump-action forend (also doubles as the shotgun `action`) */
function pumpForend(m: THREE.Material, B: number, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.add(box(B * 0.95, B * 0.72, B * 2.1, m, x, y, z));
  for (let i = 0; i < 4; i++) g.add(box(B * 1.0, B * 0.1, B * 0.14, m, x, y, z - B * 0.8 + i * B * 0.45));
  return g;
}

/** muzzle brake / compensator with side ports */
function brake(m: THREE.Material, r: number, len: number, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.add(cyl(r, r, len, m, x, y, z, 12));
  g.add(box(r * 2.2, r * 0.7, len * 0.4, m, x, y, z));
  g.add(box(r * 0.7, r * 2.2, len * 0.4, m, x, y, z));
  return g;
}

// ── shared sub-assemblies ────────────────────────────────────────────────────

function pistolGrip(root: THREE.Group, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, rake = 0.34) {
  const g = box(w, h, w * 1.35, m, x, y - h * 0.5, z);
  g.rotation.x = rake;
  root.add(g);
  return g;
}

/**
 * Post-and-notch iron sights. The front post's top is level with the tops of the rear ears
 * ("equal height, equal light"), and the returned sight line passes through both, so the
 * eye looks through the notch at the post instead of into a solid block.
 */
function ironSights(root: THREE.Group, m: THREE.Material, topY: number, zFront: number, zRear: number, B: number): number {
  const line = topY + B * 0.3;
  root.add(box(B * 0.12, B * 0.3, B * 0.18, m, 0, topY + B * 0.15, zFront)); // front post
  root.add(box(B * 0.58, B * 0.15, B * 0.16, m, 0, topY + B * 0.075, zRear)); // rear base (notch floor)
  for (const sx of [-1, 1]) root.add(box(B * 0.15, B * 0.15, B * 0.16, m, sx * B * 0.215, topY + B * 0.225, zRear)); // rear ears
  return line;
}

// ── per-weapon builders ──────────────────────────────────────────────────────

function buildEdge(c: Ctx): Parts {
  const { dark, accent, steel } = c;
  const g = new THREE.Group();
  const handle = box(0.032, 0.032, 0.13, dark, 0, 0, 0.02);
  const guardMesh = box(0.06, 0.014, 0.03, accent, 0, 0, -0.05);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.02, 0.24, 4, 1), steel);
  blade.rotation.x = -Math.PI / 2;
  blade.scale.set(1, 1, 0.22);
  blade.position.set(0, 0, -0.18);
  const edge = box(0.0035, 0.006, 0.22, accent, 0, 0.013, -0.17);
  const pommel = box(0.036, 0.036, 0.03, accent, 0, 0, 0.09);
  g.add(handle, guardMesh, blade, edge, pommel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.3);
  g.add(muzzle);
  return { group: g, muzzle, mag: null, action: null, railY: 0.05, railZ: 0, railLen: 0 };
}

function buildGlock(c: Ctx): Parts {
  const { B, dark, body, accent } = c;
  const g = new THREE.Group();
  const SW = B * 0.62;
  const topY = B * 1.15;
  // polymer frame (dust cover) + grip — reaches up to the slide rails (no gap)
  g.add(box(SW * 0.96, B * 0.92, B * 3.2, dark, 0, B * 0.36, -B * 1.5));
  pistolGrip(g, dark, 0, 0, B * 0.55, SW, B * 2.0, 0.42);
  g.add(guard(B * 0.55, B * 0.1, dark, 0, -B * 0.6, -B * 0.2));
  // trigger + takedown lever
  g.add(box(B * 0.12, B * 0.35, B * 0.12, accent, 0, -B * 0.45, -B * 0.25));
  g.add(box(B * 0.3, B * 0.14, B * 0.2, dark, SW * 0.5, -B * 0.02, -B * 0.4));
  // accessory rail under the dust cover
  picatinny(g, B * 1.8, dark, 0, -B * 0.32, -B * 1.5, SW * 0.7);
  // slide group (cycles on fire)
  const slide = new THREE.Group();
  slide.add(box(SW, B * 0.62, B * 4.0, body, 0, topY, -B * 1.55));
  // forward + rear cocking serrations
  for (let i = 0; i < 4; i++) slide.add(box(SW * 1.02, B * 0.5, B * 0.06, dark, 0, topY, -B * 0.55 + i * B * 0.18));
  slide.add(box(SW * 0.3, B * 0.14, B * 3.6, accent, 0, topY + B * 0.3, -B * 1.55));
  // ejection port
  slide.add(box(SW * 0.9, B * 0.04, B * 0.9, dark, -SW * 0.25, topY + B * 0.28, -B * 0.9));
  const ironY = ironSights(slide, dark, topY + B * 0.31, -B * 3.35, -B * 0.35, B);
  g.add(slide);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, topY, -B * 3.6);
  slide.add(muzzle);
  // magazine inside the grip
  const mag = new THREE.Group();
  mag.add(box(SW * 0.7, B * 1.7, B * 0.9, dark, 0, -B * 0.9, 0));
  mag.add(box(SW * 0.78, B * 0.2, B * 1.0, accent, 0, -B * 1.7, 0));
  mag.position.set(0, -B * 0.05, B * 0.5);
  g.add(mag);
  return { group: g, muzzle, mag, action: slide, railY: topY + B * 0.31, railZ: -B * 1.5, railLen: B * 2.2, ironY };
}

function buildDeagle(c: Ctx): Parts {
  const { B, dark, body, accent } = c;
  const g = new THREE.Group();
  const SW = B * 0.68;
  const topY = B * 1.2;
  // slide: long, tall, angular
  const slide = new THREE.Group();
  slide.add(box(SW, B * 0.8, B * 5.0, body, 0, topY, -B * 1.9));
  slide.add(box(SW * 0.5, B * 0.24, B * 4.6, dark, 0, topY + B * 0.5, -B * 1.9)); // flat top rib
  for (let i = 0; i < 3; i++) slide.add(box(SW * 1.03, B * 0.6, B * 0.05, dark, 0, topY, -B * 0.4 + i * B * 0.2));
  // huge squared barrel + ported muzzle
  slide.add(cyl(B * 0.26, B * 0.26, B * 1.4, dark, 0, topY + B * 0.05, -B * 4.4));
  slide.add(box(B * 0.7, B * 0.7, B * 0.3, dark, 0, topY + B * 0.05, -B * 5.0));
  const ironY = ironSights(slide, dark, topY + B * 0.62, -B * 4.5, -B * 0.3, B * 1.1);
  g.add(slide);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, topY + B * 0.05, -B * 5.1);
  slide.add(muzzle);
  // frame + grip — fills up to the underside of the slide
  g.add(box(SW * 0.96, B * 0.9, B * 3.6, dark, 0, B * 0.36, -B * 1.6));
  g.add(guard(B * 0.6, B * 0.11, dark, 0, -B * 0.62, -B * 0.25));
  pistolGrip(g, body, 0, -B * 0.05, B * 0.6, SW, B * 2.2, 0.4);
  g.add(box(SW * 1.1, B * 0.16, B * 1.7, dark, 0, B * 0.16, -B * 1.6)); // top rail
  g.add(box(B * 0.12, B * 0.4, B * 0.12, accent, 0, -B * 0.45, -B * 0.3));
  const mag = new THREE.Group();
  mag.add(box(SW * 0.7, B * 1.9, B * 0.95, dark, 0, -B * 1.0, 0));
  mag.position.set(0, -B * 0.05, B * 0.6);
  g.add(mag);
  return { group: g, muzzle, mag, action: slide, railY: topY + B * 0.62, railZ: -B * 1.8, railLen: B * 3.0, ironY };
}

function buildWisp(c: Ctx): Parts {
  const { B, dark, body, accent } = c;
  const g = new THREE.Group();
  const SW = B * 0.58;
  const topY = B * 1.1;
  const slide = new THREE.Group();
  slide.add(box(SW, B * 0.56, B * 3.1, body, 0, topY, -B * 1.2));
  slide.add(box(SW * 0.28, B * 0.1, B * 2.6, accent, 0, topY + B * 0.28, -B * 1.2));
  slide.add(box(SW * 1.02, B * 0.44, B * 0.06, dark, 0, topY, -B * 0.3));
  const ironY = ironSights(slide, dark, topY + B * 0.28, -B * 2.6, -B * 0.2, B * 0.9);
  g.add(slide);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, topY, -B * 2.9);
  slide.add(muzzle);
  g.add(box(SW, B * 0.44, B * 2.3, dark, 0, -B * 0.05, -B * 1.2));
  pistolGrip(g, dark, 0, 0, B * 0.45, SW, B * 1.7, 0.44);
  g.add(guard(B * 0.48, B * 0.09, dark, 0, -B * 0.56, -B * 0.18));
  g.add(box(B * 0.1, B * 0.32, B * 0.1, accent, 0, -B * 0.42, -B * 0.22));
  const mag = new THREE.Group();
  mag.add(box(SW * 0.68, B * 1.5, B * 0.85, dark, 0, -B * 0.8, 0));
  mag.position.set(0, -B * 0.05, B * 0.4);
  g.add(mag);
  return { group: g, muzzle, mag, action: slide, railY: topY + B * 0.28, railZ: -B * 1.2, railLen: B * 1.8, ironY };
}

function buildMagistrate(c: Ctx): Parts {
  const { B, dark, body, accent, steel } = c;
  const g = new THREE.Group();
  // frame
  g.add(box(B * 0.5, B * 0.5, B * 2.4, dark, 0, -B * 0.05, -B * 1.0));
  // long barrel + full shroud with vent slots
  const barrelY = B * 1.0;
  g.add(cyl(B * 0.14, B * 0.14, B * 5.2, dark, 0, barrelY, -B * 2.6));
  g.add(box(B * 0.5, B * 0.62, B * 4.6, body, 0, barrelY, -B * 2.4));
  for (let i = 0; i < 5; i++) g.add(box(B * 0.54, B * 0.14, B * 0.16, accent, 0, barrelY, -B * 1.0 + i * B * 0.7));
  // top strap bridging the frame over the cylinder; the sights sit above it so the
  // cylinder never intrudes into the sight picture
  const strapTop = barrelY + B * 0.72;
  g.add(box(B * 0.42, B * 0.14, B * 1.7, dark, 0, strapTop - B * 0.07, -B * 0.62));
  g.add(box(B * 0.24, B * 0.2, B * 3.4, dark, 0, barrelY + B * 0.41, -B * 3.1)); // vent rib on the shroud
  g.add(box(B * 0.14, strapTop - (barrelY + B * 0.51), B * 0.42, dark, 0, (strapTop + barrelY + B * 0.51) / 2, -B * 4.55)); // front sight ramp
  const ironY = ironSights(g, dark, strapTop, -B * 4.55, B * 0.12, B);
  // revolver cylinder
  // cylinder + chambers form their own group: it swings out for the reload (the "mag" part)
  const cylinder = new THREE.Group();
  cylinder.add(cylX(B * 0.62, B * 0.95, steel, 0, barrelY - B * 0.05, -B * 0.75));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    cylinder.add(cylY(B * 0.1, B * 0.98, dark, Math.cos(a) * B * 0.38, barrelY - B * 0.05 + Math.sin(a) * B * 0.38, -B * 0.75, 8).rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  }
  g.add(cylinder);
  // hammer spur
  g.add(box(B * 0.16, B * 0.3, B * 0.2, steel, 0, barrelY + B * 0.15, B * 0.65));
  g.add(guard(B * 0.55, B * 0.1, dark, 0, -B * 0.55, -B * 0.15));
  g.add(box(B * 0.12, B * 0.36, B * 0.12, accent, 0, -B * 0.42, -B * 0.2));
  pistolGrip(g, body, 0, -B * 0.05, B * 0.75, B * 0.42, B * 2.1, 0.5);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, barrelY, -B * 5.2);
  g.add(muzzle);
  return { group: g, muzzle, mag: cylinder, action: null, railY: strapTop, railZ: -B * 0.62, railLen: B * 1.4, ironY };
}

function buildMP5(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // slim tubular receiver + cocking tube on top
  g.add(box(B * 0.9, B * 1.0, L * 0.9, body, 0, ry, -L * 0.25));
  g.add(cyl(B * 0.24, B * 0.24, L * 1.15, dark, 0, ry + B * 0.5, -L * 0.3, 12)); // cocking tube
  g.add(box(B * 0.24, B * 0.3, B * 0.4, dark, 0, ry + B * 0.62, -L * 0.55)); // cocking handle
  // barrel + slotted shroud
  g.add(cyl(B * 0.16, B * 0.16, B * 2.2, dark, 0, ry, -L * 0.9));
  g.add(box(B * 0.7, B * 0.7, B * 1.4, body, 0, ry - B * 0.05, -L * 0.85));
  // slim handguard + vertical foregrip
  g.add(box(B * 0.8, B * 0.7, B * 2.2, dark, 0, ry - B * 0.55, -L * 0.7));
  g.add(box(B * 0.5, B * 1.5, B * 0.6, dark, 0, ry - B * 1.35, -L * 0.85));
  ironSights(g, dark, ry + B * 0.62, -L * 0.85, -L * 0.05, B);
  // pistol grip + trigger
  pistolGrip(g, dark, 0, 0, L * 0.05, B * 0.55, B * 1.7, 0.4);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.55, -B * 0.1));
  g.add(box(B * 0.1, B * 0.34, B * 0.1, accent, 0, -B * 0.42, -B * 0.15));
  // retractable stock: twin rails + buttplate
  skeletalStock(g, dark, 0, ry + B * 0.15, L * 0.3, B * 2.0);
  // curved magazine
  const mag = bananaMag(dark, B, B * 2.2, 0.5);
  mag.position.set(0, ry - B * 0.55, -L * 0.22);
  g.add(mag);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry, -L * 0.9 - B * 1.1);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.62, railZ: -L * 0.15, railLen: L * 0.5 };
}

function buildP90(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 0.9;
  // main bullpup shell
  g.add(box(B * 1.3, B * 2.0, L * 1.5, body, 0, ry, -L * 0.15));
  // top-mounted translucent magazine
  const topMag = new THREE.Group();
  topMag.add(box(B * 1.0, B * 0.55, L * 1.1, dark, 0, ry + B * 1.15, -L * 0.1));
  topMag.add(box(B * 1.05, B * 0.14, L * 1.15, accent, 0, ry + B * 1.4, -L * 0.1));
  g.add(topMag);
  // thumbhole grip cut-out
  g.add(box(B * 1.32, B * 0.6, B * 0.7, dark, 0, ry + B * 0.2, L * 0.25));
  g.add(guard(B * 0.55, B * 0.1, dark, 0, ry - B * 0.7, B * 0.15));
  g.add(box(B * 0.5, B * 1.9, B * 0.5, dark, 0, ry - B * 1.1, L * 0.42)); // grip
  g.add(box(B * 0.1, B * 0.34, B * 0.1, accent, 0, ry - B * 0.75, B * 0.15));
  // short barrel + muzzle
  g.add(cyl(B * 0.16, B * 0.16, B * 1.4, dark, 0, ry, -L * 0.9));
  g.add(box(B * 0.5, B * 0.5, B * 0.3, dark, 0, ry, -L * 1.05));
  ironSights(g, dark, ry + B * 1.5, -L * 0.55, L * 0.4, B);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry, -L * 1.15);
  g.add(muzzle);
  return { group: g, muzzle, mag: topMag, action: null, railY: ry + B * 1.5, railZ: -L * 0.05, railLen: L * 0.8 };
}

function buildHornet(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // compact polymer receiver
  g.add(box(B * 1.0, B * 1.1, L * 0.95, body, 0, ry, -L * 0.2));
  g.add(box(B * 1.05, B * 0.14, L * 0.75, accent, 0, ry + B * 0.6, -L * 0.15));
  picatinny(g, L * 0.6, dark, 0, ry + B * 0.66, -L * 0.15);
  // barrel + handguard
  g.add(cyl(B * 0.15, B * 0.15, B * 1.8, dark, 0, ry, -L * 0.85));
  g.add(box(B * 0.85, B * 0.8, B * 2.0, dark, 0, ry - B * 0.1, -L * 0.75));
  g.add(box(B * 0.4, B * 1.2, B * 0.5, dark, 0, ry - B * 1.0, -L * 0.8)); // angled foregrip
  // straight-ish mag
  const mag = new THREE.Group();
  mag.add(box(B * 0.5, B * 2.2, B * 0.85, dark, 0, -B * 1.1, 0));
  mag.add(box(B * 0.56, B * 0.24, B * 0.95, accent, 0, -B * 2.2, 0));
  mag.position.set(0, ry - B * 0.5, -L * 0.2);
  g.add(mag);
  pistolGrip(g, dark, 0, 0, L * 0.1, B * 0.6, B * 1.8, 0.38);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.55, -B * 0.05));
  g.add(box(B * 0.1, B * 0.32, B * 0.1, accent, 0, -B * 0.42, -B * 0.1));
  bufferStock(g, body, dark, B, 0, ry + B * 0.05, L * 0.3, L * 0.85);
  ironSights(g, dark, ry + B * 0.66, -L * 0.8, -L * 0.15, B);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry, -L * 0.85 - B * 0.95);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.66, railZ: -L * 0.15, railLen: L * 0.6 };
}

function buildAK47(c: Ctx): Parts {
  const { B, L, dark, body, accent, wood } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // stamped receiver
  g.add(box(B * 1.0, B * 1.1, L * 0.8, body, 0, ry, -L * 0.05));
  // wooden handguard (lower + upper) and pistol grip/stock
  g.add(box(B * 0.9, B * 0.7, L * 0.5, wood, 0, ry - B * 0.15, -L * 0.55));
  g.add(box(B * 0.7, B * 0.4, L * 0.45, wood, 0, ry + B * 0.6, -L * 0.55));
  // long exposed barrel, gas block + gas tube above
  g.add(cyl(B * 0.13, B * 0.13, B * 3.0, dark, 0, ry + B * 0.05, -L * 0.9));
  g.add(box(B * 0.4, B * 0.5, B * 0.45, dark, 0, ry + B * 0.35, -L * 0.85));
  g.add(cyl(B * 0.1, B * 0.1, B * 1.6, dark, 0, ry + B * 0.62, -L * 0.6, 8));
  // front sight post + gas block sight
  g.add(box(B * 0.2, B * 0.6, B * 0.22, dark, 0, ry + B * 0.55, -L * 0.95));
  g.add(cylY(B * 0.05, B * 0.4, accent, 0, ry + B * 0.8, -L * 0.95, 6));
  // slant muzzle brake
  const mb = cyl(B * 0.17, B * 0.17, B * 0.4, dark, 0, ry + B * 0.05, -L * 0.9 - B * 1.5);
  mb.rotation.z = 0.12;
  g.add(mb);
  // curved banana mag
  const mag = bananaMag(wood, B, B * 2.6, 0.34);
  mag.position.set(0, ry - B * 0.55, -L * 0.1);
  g.add(mag);
  pistolGrip(g, wood, 0, 0, L * 0.12, B * 0.5, B * 1.7, 0.36);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.55, -B * 0.1));
  g.add(box(B * 0.1, B * 0.3, B * 0.1, accent, 0, -B * 0.42, -B * 0.15));
  // wooden buttstock
  const stock = box(B * 0.65, B * 1.0, L * 0.45, wood, 0, ry - B * 0.05, L * 0.5);
  stock.rotation.x = -0.08;
  g.add(stock);
  g.add(box(B * 0.6, B * 1.2, B * 0.22, dark, 0, ry - B * 0.1, L * 0.72));
  // rear sight block + dust cover
  g.add(box(B * 0.6, B * 0.3, B * 0.5, dark, 0, ry + B * 0.65, -L * 0.2));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry + B * 0.05, -L * 0.9 - B * 1.7);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.62, railZ: -L * 0.35, railLen: L * 0.45 };
}

function buildM4A1(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // upper + lower receiver
  g.add(box(B * 0.95, B * 0.95, L * 0.85, body, 0, ry, -L * 0.05));
  g.add(box(B * 0.9, B * 0.55, L * 0.55, dark, 0, ry - B * 0.55, -L * 0.05));
  // flat-top rail (no carry handle: it would sit in the sight line of any mounted optic)
  picatinny(g, L * 0.7, dark, 0, ry + B * 0.5, -L * 0.1);
  // barrel, delta ring, birdcage flash hider
  picatinny(g, L * 0.4, dark, 0, ry - B * 0.05, -L * 0.6, B * 0.6);
  g.add(box(B * 0.75, B * 0.75, B * 2.2, dark, 0, ry - B * 0.02, -L * 0.72)); // handguard
  g.add(cyl(B * 0.34, B * 0.34, B * 0.3, dark, 0, ry - B * 0.05, -L * 0.9)); // delta ring
  g.add(cyl(B * 0.11, B * 0.11, B * 1.4, dark, 0, ry - B * 0.02, -L * 0.9));
  const fh = cyl(B * 0.15, B * 0.15, B * 0.36, dark, 0, ry - B * 0.02, -L * 0.9 - B * 0.85);
  g.add(fh);
  // front sight/gas block + accent charging handle
  g.add(box(B * 0.18, B * 0.55, B * 0.18, dark, 0, ry + B * 0.35, -L * 0.88));
  g.add(box(B * 0.55, B * 0.14, B * 0.16, accent, 0, ry + B * 0.42, L * 0.12));
  // STANAG mag (slightly curved)
  const mag = bananaMag(dark, B, B * 2.3, 0.18, 5, B * 1.7);
  mag.position.set(0, ry - B * 0.5, -L * 0.12);
  g.add(mag);
  pistolGrip(g, dark, 0, 0, L * 0.05, B * 0.5, B * 1.5, 0.5);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.52, -B * 0.15));
  g.add(box(B * 0.1, B * 0.3, B * 0.1, accent, 0, -B * 0.4, -B * 0.2));
  // collapsible stock
  bufferStock(g, body, dark, B, 0, ry - B * 0.05, L * 0.4, L * 0.8);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry - B * 0.02, -L * 0.9 - B * 1.05);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.5, railZ: -L * 0.1, railLen: L * 0.7 };
}

function buildSCAR(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // monolithic boxy receiver
  g.add(box(B * 1.05, B * 1.15, L * 0.95, body, 0, ry, -L * 0.05));
  g.add(box(B * 1.1, B * 0.16, L * 0.9, accent, 0, ry + B * 0.62, -L * 0.05));
  picatinny(g, L * 0.85, dark, 0, ry + B * 0.68, -L * 0.05);
  // side-folding stock
  const stockArm = box(B * 0.3, B * 0.7, L * 0.5, body, 0, ry - B * 0.1, L * 0.55);
  g.add(stockArm);
  g.add(box(B * 0.6, B * 1.3, B * 0.22, dark, 0, ry - B * 0.15, L * 0.82));
  // barrel + handguard with vents, huge muzzle brake
  g.add(box(B * 0.9, B * 0.85, B * 2.6, dark, 0, ry - B * 0.1, -L * 0.72));
  for (let i = 0; i < 4; i++) g.add(box(B * 0.95, B * 0.12, B * 0.14, accent, 0, ry - B * 0.1, -L * 0.75 - i * B * 0.5));
  g.add(cyl(B * 0.13, B * 0.13, B * 2.2, dark, 0, ry - B * 0.02, -L * 0.9));
  g.add(brake(dark, B * 0.2, B * 0.5, 0, ry - B * 0.02, -L * 0.9 - B * 1.4));
  // tall gas block front sight
  g.add(box(B * 0.2, B * 0.75, B * 0.22, dark, 0, ry + B * 0.45, -L * 0.85));
  const mag = bananaMag(dark, B, B * 2.5, 0.2, 5, B * 1.9);
  mag.position.set(0, ry - B * 0.55, -L * 0.12);
  g.add(mag);
  pistolGrip(g, dark, 0, 0, L * 0.08, B * 0.55, B * 1.6, 0.42);
  g.add(guard(B * 0.52, B * 0.1, dark, 0, -B * 0.55, -B * 0.1));
  g.add(box(B * 0.12, B * 0.32, B * 0.12, accent, 0, -B * 0.42, -B * 0.15));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry - B * 0.02, -L * 0.9 - B * 1.6);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.68, railZ: -L * 0.05, railLen: L * 0.85 };
}

function buildCorsair(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // futuristic angular receiver (original design)
  g.add(box(B * 0.95, B * 1.1, L * 0.9, body, 0, ry, -L * 0.05));
  const bevel = box(B * 0.9, B * 0.4, L * 0.5, accent, 0, ry + B * 0.55, -L * 0.15);
  bevel.rotation.x = 0.2;
  g.add(bevel);
  picatinny(g, L * 0.6, dark, 0, ry + B * 0.62, -L * 0.1);
  // shrouded barrel with a shroud fin
  g.add(box(B * 0.85, B * 0.8, B * 2.4, dark, 0, ry - B * 0.08, -L * 0.7));
  g.add(cyl(B * 0.12, B * 0.12, B * 2.0, dark, 0, ry, -L * 0.9));
  g.add(box(B * 0.12, B * 0.5, B * 1.6, accent, B * 0.42, ry + B * 0.15, -L * 0.8));
  g.add(box(B * 0.12, B * 0.5, B * 1.6, accent, -B * 0.42, ry + B * 0.15, -L * 0.8));
  g.add(cyl(B * 0.16, B * 0.16, B * 0.4, dark, 0, ry, -L * 0.9 - B * 1.2));
  const mag = bananaMag(dark, B, B * 2.4, 0.16, 5, B * 1.75);
  mag.position.set(0, ry - B * 0.5, -L * 0.12);
  g.add(mag);
  pistolGrip(g, dark, 0, 0, L * 0.08, B * 0.5, B * 1.55, 0.48);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.52, -B * 0.12));
  g.add(box(B * 0.1, B * 0.3, B * 0.1, accent, 0, -B * 0.4, -B * 0.18));
  bufferStock(g, body, dark, B, 0, ry - B * 0.05, L * 0.42, L * 0.8);
  ironSights(g, dark, ry + B * 0.62, -L * 0.85, -L * 0.05, B);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry, -L * 0.9 - B * 1.4);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.62, railZ: -L * 0.1, railLen: L * 0.6 };
}

function buildLancer(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // long, slab-sided precision receiver
  g.add(box(B * 0.9, B * 1.15, L * 1.0, body, 0, ry, -L * 0.1));
  g.add(box(B * 0.95, B * 0.14, L * 0.9, accent, 0, ry + B * 0.62, -L * 0.1));
  picatinny(g, L * 0.8, dark, 0, ry + B * 0.68, -L * 0.1);
  // heavy free-float barrel + big brake
  g.add(cyl(B * 0.14, B * 0.16, B * 2.8, dark, 0, ry, -L * 0.9));
  for (let i = 0; i < 5; i++) g.add(box(B * 0.2, B * 0.06, B * 0.05, dark, 0, ry + B * 0.14, -L * 1.05 - i * B * 0.35));
  g.add(brake(dark, B * 0.24, B * 0.55, 0, ry, -L * 0.9 - B * 1.5));
  g.add(box(B * 0.4, B * 0.5, B * 1.6, dark, 0, ry - B * 0.12, -L * 0.72));
  const mag = bananaMag(dark, B, B * 2.6, 0.14, 5, B * 1.8);
  mag.position.set(0, ry - B * 0.52, -L * 0.08);
  g.add(mag);
  pistolGrip(g, dark, 0, 0, L * 0.1, B * 0.52, B * 1.6, 0.44);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.54, -B * 0.1));
  g.add(box(B * 0.1, B * 0.3, B * 0.1, accent, 0, -B * 0.4, -B * 0.16));
  bufferStock(g, body, dark, B, 0, ry - B * 0.05, L * 0.45, L * 0.85);
  ironSights(g, dark, ry + B * 0.68, -L * 0.9, -L * 0.05, B);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry, -L * 0.9 - B * 1.7);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.68, railZ: -L * 0.1, railLen: L * 0.8 };
}

function buildSVD(c: Ctx): Parts {
  const { B, L, dark, body, accent, wood } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // long receiver with side scope rail
  g.add(box(B * 0.9, B * 1.0, L * 0.8, body, 0, ry, -L * 0.05));
  g.add(box(B * 0.5, B * 0.3, L * 0.5, dark, B * 0.5, ry + B * 0.3, -L * 0.05)); // side rail
  // long thin barrel, front sight, slant brake
  g.add(cyl(B * 0.11, B * 0.13, B * 3.4, dark, 0, ry + B * 0.02, -L * 1.0));
  g.add(box(B * 0.18, B * 0.55, B * 0.18, dark, 0, ry + B * 0.5, -L * 1.25));
  g.add(cyl(B * 0.13, B * 0.13, B * 0.4, dark, 0, ry + B * 0.02, -L * 1.0 - B * 1.6));
  // wooden handguard + thumbhole stock
  g.add(box(B * 0.8, B * 0.7, B * 1.6, wood, 0, ry - B * 0.1, -L * 0.7));
  const thole = box(B * 0.7, B * 1.6, L * 0.5, wood, 0, ry - B * 0.15, L * 0.55);
  g.add(thole);
  g.add(box(B * 0.72, B * 0.4, L * 0.6, wood, 0, ry + B * 0.2, L * 0.45)); // cheek comb — kept below the sight line
  g.add(box(B * 0.5, B * 0.35, B * 0.5, dark, 0, ry - B * 0.7, L * 0.5)); // cut-out
  // curved mag
  const mag = bananaMag(dark, B, B * 2.2, 0.32, 5, B * 1.6);
  mag.position.set(0, ry - B * 0.5, -L * 0.12);
  g.add(mag);
  g.add(guard(B * 0.48, B * 0.09, dark, 0, -B * 0.5, -B * 0.05));
  g.add(box(B * 0.1, B * 0.3, B * 0.1, accent, 0, -B * 0.4, -B * 0.1));
  // bolt handle (cycles)
  const bolt = box(B * 0.14, B * 0.14, B * 0.45, accent, B * 0.5, ry + B * 0.25, -L * 0.02);
  g.add(bolt);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry + B * 0.02, -L * 1.0 - B * 1.8);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: bolt, railY: ry + B * 0.5, railZ: -L * 0.05, railLen: B * 2.4 };
}

function buildBarrett(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // massive receiver with carry handle
  g.add(box(B * 1.15, B * 1.3, L * 0.9, body, 0, ry, -L * 0.05));
  g.add(box(B * 0.5, B * 0.35, L * 0.6, dark, 0, ry + B * 0.85, L * 0.05)); // carry handle
  picatinny(g, L * 0.7, dark, 0, ry + B * 0.7, -L * 0.05);
  // long barrel shroud + enormous muzzle brake
  g.add(box(B * 1.0, B * 0.9, B * 4.2, dark, 0, ry - B * 0.05, -L * 0.85));
  g.add(cyl(B * 0.16, B * 0.18, B * 3.0, dark, 0, ry, -L * 0.9));
  g.add(brake(dark, B * 0.34, B * 1.1, 0, ry, -L * 0.9 - B * 1.9));
  // box magazine ahead of the trigger
  const mag = new THREE.Group();
  mag.add(box(B * 0.9, B * 1.9, B * 1.1, dark, 0, -B * 0.95, 0));
  mag.add(box(B * 0.98, B * 0.24, B * 1.2, accent, 0, -B * 1.9, 0));
  mag.position.set(0, ry - B * 0.6, -L * 0.5);
  g.add(mag);
  // pistol grip + trigger
  pistolGrip(g, dark, 0, 0, L * 0.2, B * 0.6, B * 1.7, 0.35);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.55, B * 0.05));
  g.add(box(B * 0.12, B * 0.32, B * 0.12, accent, 0, -B * 0.42, 0));
  // skeletal stock + bipod stubs
  skeletalStock(g, dark, 0, ry - B * 0.05, L * 0.5, L * 0.85);
  g.add(box(B * 0.08, B * 1.1, B * 0.08, dark, B * 0.35, ry - B * 1.2, -L * 0.9));
  g.add(box(B * 0.08, B * 1.1, B * 0.08, dark, -B * 0.35, ry - B * 1.2, -L * 0.9));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry, -L * 0.9 - B * 2.6);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.7, railZ: -L * 0.05, railLen: L * 0.7 };
}

function buildLongwatch(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // long precision chassis
  g.add(box(B * 0.95, B * 1.1, L * 0.85, body, 0, ry, -L * 0.05));
  g.add(box(B * 1.0, B * 0.14, L * 0.8, accent, 0, ry + B * 0.6, -L * 0.05));
  picatinny(g, L * 0.75, dark, 0, ry + B * 0.66, -L * 0.05);
  // fluted heavy barrel + brake
  g.add(cyl(B * 0.13, B * 0.15, B * 3.6, dark, 0, ry, -L * 1.0));
  g.add(brake(dark, B * 0.2, B * 0.5, 0, ry, -L * 1.0 - B * 1.9));
  g.add(box(B * 0.8, B * 0.8, B * 2.6, dark, 0, ry - B * 0.1, -L * 0.8));
  const mag = bananaMag(dark, B, B * 2.3, 0.2, 5, B * 1.7);
  mag.position.set(0, ry - B * 0.5, -L * 0.12);
  g.add(mag);
  pistolGrip(g, dark, 0, 0, L * 0.12, B * 0.52, B * 1.5, 0.45);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.53, -B * 0.1));
  g.add(box(B * 0.1, B * 0.3, B * 0.1, accent, 0, -B * 0.4, -B * 0.16));
  bufferStock(g, body, dark, B, 0, ry - B * 0.05, L * 0.42, L * 0.8);
  // bolt handle
  const bolt = box(B * 0.14, B * 0.14, B * 0.45, accent, B * 0.48, ry + B * 0.28, -L * 0.02);
  g.add(bolt);
  ironSights(g, dark, ry + B * 0.66, -L * 0.9, -L * 0.05, B);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry, -L * 1.0 - B * 2.1);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: bolt, railY: ry + B * 0.66, railZ: -L * 0.05, railLen: L * 0.75 };
}

function buildSPAS(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // receiver
  g.add(box(B * 1.0, B * 1.15, L * 0.7, body, 0, ry, -L * 0.05));
  g.add(box(B * 1.05, B * 0.16, L * 0.6, accent, 0, ry + B * 0.6, -L * 0.05));
  picatinny(g, L * 0.5, dark, 0, ry + B * 0.66, -L * 0.05);
  // barrel with ventilated heat shield + tube magazine
  g.add(cyl(B * 0.17, B * 0.17, B * 3.2, dark, 0, ry + B * 0.15, -L * 0.9));
  const shield = new THREE.Group();
  for (let i = 0; i < 6; i++) shield.add(box(B * 0.55, B * 0.08, B * 0.08, dark, 0, ry + B * 0.42, -L * 0.6 - i * B * 0.42));
  shield.add(box(B * 0.06, B * 0.4, B * 2.4, dark, B * 0.24, ry + B * 0.3, -L * 0.9));
  shield.add(box(B * 0.06, B * 0.4, B * 2.4, dark, -B * 0.24, ry + B * 0.3, -L * 0.9));
  g.add(shield);
  g.add(cyl(B * 0.12, B * 0.12, B * 2.4, dark, 0, ry - B * 0.15, -L * 0.85)); // tube mag
  // pump forend (action)
  const pump = pumpForend(dark, B, 0, ry - B * 0.55, -L * 0.7);
  g.add(pump);
  // pistol grip + folding stock
  pistolGrip(g, dark, 0, 0, L * 0.1, B * 0.55, B * 1.7, 0.4);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.55, -B * 0.05));
  g.add(box(B * 0.12, B * 0.3, B * 0.12, accent, 0, -B * 0.42, -B * 0.1));
  skeletalStock(g, dark, 0, ry + B * 0.1, L * 0.3, L * 0.75);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry + B * 0.15, -L * 0.9 - B * 1.7);
  g.add(muzzle);
  return { group: g, muzzle, mag: null, action: pump, railY: ry + B * 0.66, railZ: -L * 0.05, railLen: L * 0.5 };
}

function buildAA12(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // boxy automatic shotgun body
  g.add(box(B * 1.25, B * 1.5, L * 1.4, body, 0, ry, -L * 0.15));
  g.add(box(B * 1.3, B * 0.16, L * 1.0, accent, 0, ry + B * 0.8, -L * 0.15));
  picatinny(g, L * 0.7, dark, 0, ry + B * 0.86, -L * 0.15);
  // thick barrel + vented shroud
  g.add(box(B * 0.9, B * 0.9, B * 2.6, dark, 0, ry, -L * 0.9));
  g.add(cyl(B * 0.2, B * 0.2, B * 2.6, dark, 0, ry, -L * 0.95));
  g.add(box(B * 0.4, B * 0.4, B * 0.3, dark, 0, ry, -L * 0.95 - B * 1.5));
  // drum magazine
  const mag = new THREE.Group();
  const drum = cylY(B * 1.0, B * 0.9, dark, 0, -B * 1.1, 0, 20);
  drum.rotation.x = Math.PI / 2;
  drum.rotation.z = Math.PI / 2;
  mag.add(drum);
  mag.add(box(B * 0.6, B * 0.6, B * 0.5, accent, 0, -B * 0.55, 0));
  mag.position.set(0, ry - B * 0.75, -L * 0.25);
  g.add(mag);
  pistolGrip(g, dark, 0, 0, L * 0.15, B * 0.55, B * 1.6, 0.35);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.55, -B * 0.05));
  g.add(box(B * 0.12, B * 0.3, B * 0.12, accent, 0, -B * 0.42, -B * 0.1));
  const stock = box(B * 0.9, B * 1.1, L * 0.5, body, 0, ry - B * 0.1, L * 0.55);
  g.add(stock);
  g.add(box(B * 0.95, B * 1.3, B * 0.2, dark, 0, ry - B * 0.15, L * 0.82));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry, -L * 0.95 - B * 1.7);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.86, railZ: -L * 0.15, railLen: L * 0.7 };
}

function buildBreacher(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // wooden-stocked pump action
  g.add(box(B * 1.0, B * 1.2, L * 0.75, body, 0, ry, -L * 0.05));
  g.add(box(B * 1.05, B * 0.16, L * 0.6, accent, 0, ry + B * 0.62, -L * 0.05));
  picatinny(g, L * 0.45, dark, 0, ry + B * 0.68, -L * 0.05);
  // barrel + tube magazine
  g.add(cyl(B * 0.18, B * 0.18, B * 3.0, dark, 0, ry + B * 0.18, -L * 0.9));
  g.add(cyl(B * 0.12, B * 0.12, B * 2.4, dark, 0, ry - B * 0.12, -L * 0.85));
  g.add(box(B * 0.3, B * 0.22, B * 0.3, dark, 0, ry + B * 0.18, -L * 0.9 - B * 1.55));
  // pump forend (action)
  const pump = pumpForend(body, B, 0, ry - B * 0.5, -L * 0.7);
  g.add(pump);
  pistolGrip(g, body, 0, 0, L * 0.1, B * 0.55, B * 1.7, 0.38);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.55, -B * 0.05));
  g.add(box(B * 0.12, B * 0.3, B * 0.12, accent, 0, -B * 0.42, -B * 0.1));
  // wooden buttstock
  const stock = box(B * 0.7, B * 1.15, L * 0.5, body, 0, ry - B * 0.05, L * 0.5);
  stock.rotation.x = -0.02;
  g.add(stock);
  g.add(box(B * 0.65, B * 1.35, B * 0.2, dark, 0, ry - B * 0.1, L * 0.74));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry + B * 0.18, -L * 0.9 - B * 1.7);
  g.add(muzzle);
  return { group: g, muzzle, mag: null, action: pump, railY: ry + B * 0.68, railZ: -L * 0.05, railLen: L * 0.45 };
}

function buildM249(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.0;
  // big receiver + feed tray cover
  g.add(box(B * 1.05, B * 1.4, L * 0.95, body, 0, ry, -L * 0.05));
  g.add(box(B * 1.1, B * 0.3, L * 0.9, dark, 0, ry + B * 0.75, -L * 0.05));
  picatinny(g, L * 0.6, dark, 0, ry + B * 0.92, -L * 0.1);
  // carry handle
  g.add(box(B * 0.4, B * 0.3, L * 0.5, dark, 0, ry + B * 1.25, -L * 0.3));
  // barrel + heat shield + carry handle
  g.add(cyl(B * 0.16, B * 0.16, B * 3.2, dark, 0, ry + B * 0.05, -L * 0.95));
  g.add(box(B * 0.55, B * 0.6, B * 2.4, dark, 0, ry + B * 0.1, -L * 0.9));
  for (let i = 0; i < 4; i++) g.add(box(B * 0.6, B * 0.08, B * 0.1, accent, 0, ry + B * 0.38, -L * 0.7 - i * B * 0.4));
  // ammo box magazine (belt-fed)
  const mag = new THREE.Group();
  mag.add(box(B * 1.3, B * 1.0, B * 1.5, dark, 0, -B * 0.5, 0));
  mag.add(box(B * 1.4, B * 0.16, B * 1.6, accent, 0, -B * 1.0, 0));
  mag.position.set(0, ry - B * 0.55, -L * 0.15);
  g.add(mag);
  // belt link
  g.add(box(B * 0.5, B * 0.2, B * 1.2, accent, 0, ry + B * 0.4, -L * 0.45));
  pistolGrip(g, dark, 0, 0, L * 0.12, B * 0.55, B * 1.7, 0.35);
  g.add(guard(B * 0.5, B * 0.1, dark, 0, -B * 0.55, -B * 0.05));
  // bipod
  g.add(box(B * 0.08, B * 1.4, B * 0.08, dark, B * 0.4, ry - B * 1.4, -L * 0.9));
  g.add(box(B * 0.08, B * 1.4, B * 0.08, dark, -B * 0.4, ry - B * 1.4, -L * 0.9));
  g.add(box(B * 0.5, B * 1.2, L * 0.4, body, 0, ry - B * 0.1, L * 0.5));
  g.add(box(B * 0.55, B * 1.35, B * 0.2, dark, 0, ry - B * 0.15, L * 0.75));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry + B * 0.05, -L * 0.95 - B * 1.7);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: null, railY: ry + B * 0.92, railZ: -L * 0.1, railLen: L * 0.6 };
}

function buildBulwark(c: Ctx): Parts {
  const { B, L, dark, body, accent } = c;
  const g = new THREE.Group();
  const ry = B * 1.05;
  // bulky armoured receiver
  g.add(box(B * 1.3, B * 1.7, L * 1.0, body, 0, ry, -L * 0.05));
  g.add(box(B * 1.35, B * 0.18, L * 0.95, accent, 0, ry + B * 0.9, -L * 0.05));
  picatinny(g, L * 0.6, dark, 0, ry + B * 1.0, -L * 0.05);
  // four-barrel rotary cluster (action)
  const spin = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    spin.add(cyl(B * 0.1, B * 0.1, B * 2.6, dark, Math.cos(a) * B * 0.28, Math.sin(a) * B * 0.28, 0));
  }
  spin.add(cyl(B * 0.44, B * 0.44, B * 0.5, dark, 0, 0, -B * 1.5, 16));
  spin.position.set(0, ry + B * 0.05, -L * 0.95);
  g.add(spin);
  g.add(box(B * 0.9, B * 0.9, B * 1.6, dark, 0, ry + B * 0.05, -L * 0.75));
  // drum magazine
  const mag = new THREE.Group();
  const drum = cylY(B * 1.35, B * 1.0, dark, 0, 0, 0, 24);
  drum.rotation.x = Math.PI / 2;
  drum.rotation.z = Math.PI / 2;
  mag.add(drum);
  mag.add(box(B * 0.8, B * 0.8, B * 0.4, accent, 0, 0, -B * 0.5));
  mag.position.set(0, ry - B * 1.0, -L * 0.2);
  g.add(mag);
  pistolGrip(g, dark, 0, 0, L * 0.12, B * 0.6, B * 1.8, 0.32);
  g.add(guard(B * 0.6, B * 0.12, dark, 0, -B * 0.65, -B * 0.05));
  g.add(box(B * 0.14, B * 0.36, B * 0.14, accent, 0, -B * 0.5, -B * 0.1));
  g.add(box(B * 1.1, B * 1.3, L * 0.45, body, 0, ry - B * 0.15, L * 0.5));
  g.add(box(B * 1.15, B * 1.5, B * 0.22, dark, 0, ry - B * 0.2, L * 0.76));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, ry + B * 0.05, -L * 0.95 - B * 2.0);
  g.add(muzzle);
  return { group: g, muzzle, mag, action: spin, railY: ry + B * 1.0, railZ: -L * 0.05, railLen: L * 0.6 };
}

const BUILDERS: Record<WeaponId, (c: Ctx) => Parts> = {
  edge: buildEdge,
  wisp: buildWisp,
  magistrate: buildMagistrate,
  hornet: buildHornet,
  corsair: buildCorsair,
  lancer: buildLancer,
  longwatch: buildLongwatch,
  breacher: buildBreacher,
  bulwark: buildBulwark,
  glock: buildGlock,
  deagle: buildDeagle,
  mp5: buildMP5,
  p90: buildP90,
  ak47: buildAK47,
  m4a1: buildM4A1,
  scarl: buildSCAR,
  svd: buildSVD,
  barrett: buildBarrett,
  spas: buildSPAS,
  aa12: buildAA12,
  m249: buildM249,
};

/**
 * Procedural, original weapon models assembled from primitives. Each weapon is built
 * from a distinct silhouette that follows its real-world counterpart (AK furniture,
 * M4 flat-top, P90 bullpup, SPAS heat shield, M82 muzzle brake, etc.). Origin is at the
 * grip, the barrel points down -Z.
 */
export function buildWeapon(id: WeaponId, skinId = 'standard', sightId?: SightId, opts: { lowDetail?: boolean } = {}): WeaponModel {
  lowDetail = !!opts.lowDetail;
  const w = WEAPONS[id];
  const sight = getSight(sightId ?? defaultSightFor(w));
  const skin = getSkin(skinId);
  const B = w.look.bulk, L = w.look.length;
  const boost = skin.energy ? { value: 1 } : null;
  // Realistic finishes: per-weapon phosphate / anodised / polymer / wood / blued steel.
  // Coloured skins become a cerakote coat on the receiver; energy skins use the animated shader.
  const fin = WEAPON_FINISH[id] ?? { body: 'phosphate', frame: 'polymer', furniture: 'polymer' };
  const painted = !skin.energy && skin.id !== 'standard';
  let body: THREE.Material, dark: THREE.Material, accent: THREE.Material, wood: THREE.Material, steel: THREE.Material;
  if (skin.energy) {
    body = energyMaterial(skin.energy, 'body', skin.body, boost!).material;
    dark = body;
    accent = energyMaterial(skin.energy, 'accent', skin.accent, boost!).material;
    wood = body;
    steel = body;
  } else {
    const bodyColor = painted ? skin.body || w.look.color : fin.bodyColor ?? mutedTone(w.look.color, 0x26282b, 0.35);
    body = gunMaterial(painted ? 'cerakote' : fin.body, bodyColor);
    dark = gunMaterial(fin.frame, fin.frameColor ?? 0x1b1c1f);
    accent = painted ? gunMaterial('cerakote', skin.accent) : gunMaterial(fin.body === 'polymer' ? 'polymer' : 'anodized', mutedTone(w.look.accent, fin.bodyColor ?? 0x2a2c30, 0.96));
    wood = fin.furniture === 'wood' ? gunMaterial('wood', fin.furnitureColor ?? 0x6e4226) : gunMaterial(fin.furniture, fin.furnitureColor ?? 0x1e1f22);
    steel = gunMaterial(id === 'edge' ? 'chrome' : 'blued', id === 'edge' ? 0xc4c8ce : 0x3a3d42);
    roundSwap.set(dark, gunMaterial('blued', 0x2a2c30));
  }

  const ctx: Ctx = { B, L, w, body, dark, accent, wood, steel };
  const parts = BUILDERS[id](ctx);
  roundSwap.clear();
  const g = parts.group;

  // optic on the weapon's rail. Pistols carry their own slide irons, so only mount
  // extra geometry there when a real optic is fitted.
  let sightY = parts.railY + B * 0.34;
  if (w.category !== 'melee') {
    if (w.category === 'sidearm' && sight.style === 'iron') sightY = parts.ironY ?? parts.railY + B * 0.3;
    else sightY = buildSight(g, sight, w, B, parts.railY, parts.railZ, parts.railLen, dark, accent, skin).sightY;
  }

  bake(g);
  lowDetail = false;
  return { group: g, muzzle: parts.muzzle, mag: parts.mag, action: parts.action, sightY, sight, boost, energy: skin.energy ?? null };
}

/**
 * Build the optic mounted on the weapon's rail and return the sight-line height used for ADS.
 * Housing style comes from the sight definition; the reticle itself is drawn in the HUD.
 */
function buildSight(
  g: THREE.Group,
  s: SightDef,
  w: WeaponDef,
  B: number,
  railY: number,
  railZ: number,
  railLen: number,
  dark: THREE.Material,
  accent: THREE.Material,
  skin: ReturnType<typeof getSkin>,
): { sightY: number } {
  const glow = skin.energy ? skin.energy.colors[0] : skin.accent || w.look.accent;
  const dotMat = new THREE.MeshBasicMaterial({ color: glow, toneMapped: false });
  // coated optical glass: mostly clear, faint coloured coating reflection
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb2c8, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, emissive: new THREE.Color(s.color).multiplyScalar(0.04), depthWrite: false });
  const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).getHex(), toneMapped: false, transparent: true, opacity: 0.5 });
  const top = railY;
  const zc = railZ;
  const mountLen = Math.min(railLen, B * 1.6);
  const rail = box(B * 0.72, B * 0.08, Math.max(mountLen, B * 0.5), dark, 0, top + B * 0.02, zc);
  g.add(rail);
  let sightY = top + B * 0.16;

  switch (s.style) {
    case 'iron': {
      g.add(box(B * 0.13, B * 0.34, B * 0.13, dark, 0, top + B * 0.22, -(mountLen * 0.5 + B * 0.5)));
      const rear = rectFrame(B * 0.34, B * 0.26, B * 0.1, B * 0.14, dark);
      rear.position.set(0, top + B * 0.2, zc + B * 0.4);
      g.add(rear);
      sightY = top + B * 0.22;
      break;
    }
    case 'micro': {
      g.add(box(B * 0.5, B * 0.12, B * 0.42, dark, 0, top + B * 0.08, zc));
      const frame = rectFrame(B * 0.42, B * 0.36, B * 0.12, B * 0.1, dark);
      frame.position.set(0, top + B * 0.34, zc);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(B * 0.4, B * 0.34), lensMat);
      lens.position.set(0, top + B * 0.34, zc + 0.02);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(B * 0.045, 12), dotMat);
      dot.position.set(0, top + B * 0.34, zc + 0.03);
      g.add(frame, lens); // reticle is projected by the HUD (collimated: always on the point of aim)
      void dot;
      sightY = top + B * 0.34;
      break;
    }
    case 'box': {
      g.add(box(B * 0.62, B * 0.14, B * 0.54, dark, 0, top + B * 0.09, zc));
      const frame = rectFrame(B * 0.56, B * 0.46, B * 0.14, B * 0.12, dark);
      frame.position.set(0, top + B * 0.42, zc);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(B * 0.5, B * 0.42), lensMat);
      lens.position.set(0, top + B * 0.42, zc + 0.02);
      const ring = new THREE.Mesh(new THREE.RingGeometry(B * 0.12, B * 0.148, 24), dotMat);
      ring.position.set(0, top + B * 0.42, zc + 0.035);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(B * 0.035, 10), dotMat);
      dot.position.set(0, top + B * 0.42, zc + 0.036);
      g.add(frame, lens);
      void ring;
      void dot;
      sightY = top + B * 0.42;
      break;
    }
    case 'tube': {
      const len = B * 0.74;
      const tube = cyl(B * 0.26, B * 0.26, len, dark, 0, top + B * 0.36, zc, 16);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(B * 0.2, 16), lensMat);
      lens.position.set(0, top + B * 0.36, zc + len / 2 - 0.01);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(B * 0.04, 10), dotMat);
      dot.position.set(0, top + B * 0.36, zc + len / 2);
      g.add(tube, lens, dot);
      sightY = top + B * 0.36;
      break;
    }
    case 'prism': {
      g.add(box(B * 0.56, B * 0.5, B * 0.52, dark, 0, top + B * 0.3, zc));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(B * 0.16, 14), lensMat);
      lens.position.set(0, top + B * 0.3, zc + 0.27);
      const ret = new THREE.Mesh(new THREE.RingGeometry(B * 0.05, B * 0.065, 16), dotMat);
      ret.position.set(0, top + B * 0.3, zc + 0.28);
      g.add(lens);
      void ret;
      sightY = top + B * 0.3;
      break;
    }
    case 'magnifier': {
      g.add(box(B * 0.5, B * 0.12, B * 0.42, dark, 0, top + B * 0.08, zc + B * 0.25));
      const microD = new THREE.Mesh(new THREE.CircleGeometry(B * 0.04, 10), dotMat);
      microD.position.set(0, top + B * 0.32, zc + B * 0.27);
      const magTube = cyl(B * 0.24, B * 0.24, B * 0.66, dark, B * 0.5, top + B * 0.36, zc - B * 0.1, 14);
      g.add(magTube);
      void microD;
      sightY = top + B * 0.34;
      break;
    }
    case 'hybrid': {
      g.add(box(B * 0.5, B * 0.12, B * 0.42, dark, 0, top + B * 0.08, zc + B * 0.28));
      const frame = rectFrame(B * 0.42, B * 0.36, B * 0.12, B * 0.1, dark);
      frame.position.set(0, top + B * 0.34, zc + B * 0.28);
      const ring = new THREE.Mesh(new THREE.RingGeometry(B * 0.1, B * 0.125, 20), dotMat);
      ring.position.set(0, top + B * 0.34, zc + B * 0.31);
      const tube = cyl(B * 0.22, B * 0.22, B * 0.5, dark, 0, top + B * 0.36, zc - B * 0.12, 14);
      g.add(frame, tube);
      void ring;
      sightY = top + B * 0.35;
      break;
    }
    case 'electronic': {
      g.add(box(B * 0.66, B * 0.56, B * 0.5, dark, 0, top + B * 0.34, zc - B * 0.02));
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(B * 0.46, B * 0.4), screenMat);
      screen.position.set(0, top + B * 0.34, zc + 0.26);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(B * 0.19, 18), lensMat);
      lens.position.set(0, top + B * 0.34, zc + 0.27);
      g.add(screen, lens);
      sightY = top + B * 0.34;
      break;
    }
    case 'scope':
    default: {
      const len = B * 1.5;
      const tube = cyl(B * 0.3, B * 0.3, len, dark, 0, top + B * 0.38, zc, 18);
      const obj = cyl(B * 0.4, B * 0.4, B * 0.3, dark, 0, top + B * 0.38, zc - len / 2, 18);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(B * 0.28, 18), lensMat);
      lens.position.set(0, top + B * 0.38, zc + len / 2 - 0.01);
      const turretTop = box(B * 0.18, B * 0.24, B * 0.18, dark, 0, top + B * 0.38 + B * 0.32, zc);
      const turretSide = box(B * 0.24, B * 0.18, B * 0.18, dark, B * 0.34, top + B * 0.38, zc);
      g.add(tube, obj, lens, turretTop, turretSide);
      sightY = top + B * 0.38;
      break;
    }
  }
  return { sightY };
}

/** Rectangular frame (four thin bars) used for red-dot / holo windows. */
function rectFrame(w: number, h: number, thick: number, depth: number, m: THREE.Material) {
  const g = new THREE.Group();
  g.add(box(w + thick, thick, depth, m, 0, h / 2, 0));
  g.add(box(w + thick, thick, depth, m, 0, -h / 2, 0));
  g.add(box(thick, h, depth, m, -w / 2, 0, 0));
  g.add(box(thick, h, depth, m, w / 2, 0, 0));
  return g;
}

/**
 * Bake static mesh transforms into geometry so the energy shader's pattern coordinates are
 * continuous across parts (weapon space). Moving sub-groups (mag / action) keep their own frame.
 */
function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...root.children]) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) continue;
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    const m = mesh.material as THREE.Material;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m)!.push(mesh);
  }
  // merge static parts per material: a rifle drops from ~80 draw calls to a handful
  for (const [m, meshes] of byMat) {
    if (meshes.length < 2 || (m as THREE.MeshBasicMaterial).transparent) continue;
    const geos = meshes.map((x) => {
      const g = x.geometry.index ? x.geometry.toNonIndexed() : x.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g;
    });
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    for (const x of meshes) {
      root.remove(x);
      x.geometry.dispose();
    }
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true;
    root.add(mesh);
  }
}
