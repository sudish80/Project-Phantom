import * as THREE from 'three';
import { WEAPONS, type EntitySnap, type Vec3, type WorldData, type ZoneState } from '@phantom/shared';
import type { Quality } from '../../stores/settings';
import { softDotTexture } from '../rendering/textures';
import { buildWeapon } from '../weapons/WeaponModel';
import { Ambient } from './Ambient';
import { Props } from './Props';
import { TerrainRenderer } from './TerrainRenderer';
import { Grass, Trees, windUniforms } from './Vegetation';
import { WaterRenderer } from './WaterRenderer';

const ZONE_VERT = `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ZONE_FRAG = `uniform float uTime; varying vec3 vW; varying vec2 vUv;
void main(){
  float grid = smoothstep(0.92, 1.0, abs(sin(vW.y * 0.6 - uTime * 1.5))) * 0.5 + smoothstep(0.96, 1.0, abs(sin(atan(vW.z, vW.x) * 120.0))) * 0.3;
  float fade = 1.0 - smoothstep(0.0, 0.25, vUv.y);
  gl_FragColor = vec4(vec3(0.35, 0.55, 1.0) * (0.8 + grid), 0.18 + grid * 0.35 + fade * 0.25);
}`;

const LOOT_COLORS: Record<string, number> = {
  wisp: 0xbfbfbf, magistrate: 0x5ab0ff, hornet: 0x5ab0ff, breacher: 0x5ab0ff, corsair: 0xb36bff, lancer: 0xb36bff, bulwark: 0xb36bff, longwatch: 0xffb347,
  glock: 0xbfbfbf, deagle: 0x5ab0ff, mp5: 0x5ab0ff, p90: 0x5ab0ff, ak47: 0xb36bff, m4a1: 0xb36bff, scarl: 0xb36bff, svd: 0xffb347, barrett: 0xffb347,
  spas: 0x5ab0ff, aa12: 0x5ab0ff, m249: 0xb36bff,
  light: 0x5ab0ff, heavy: 0xb36bff, ammo: 0xd8c040, medkit: 0x6fe39b,
};

/**
 * Open-world presentation layer: terrain, water, vegetation, grass, props, ambient life,
 * a pooled set of real lights assigned to the nearest lamps, road markings, the Royale
 * zone wall and loot.
 */
export class WorldRenderer {
  readonly group = new THREE.Group();
  readonly terrain: TerrainRenderer;
  readonly water: WaterRenderer;
  readonly trees: Trees;
  readonly grass: Grass;
  readonly props: Props;
  readonly ambient: Ambient;
  private lights: THREE.PointLight[] = [];
  private lightTimer = 0;
  private lampGlow: THREE.InstancedMesh | null = null;
  private zoneWall: THREE.Mesh;
  private zoneUniforms = { uTime: { value: 0 } };
  private lootBeams: THREE.InstancedMesh;
  private lootNear = new Map<number, THREE.Object3D>();
  private loot: EntitySnap[] = [];
  private t = 0;

  constructor(readonly w: WorldData, quality: Quality) {
    this.terrain = new TerrainRenderer(w, quality);
    this.water = new WaterRenderer(w);
    this.trees = new Trees(w, quality);
    this.grass = new Grass(w, this.terrain.grassMask, quality);
    this.props = new Props(w.props, quality === 'high');
    this.ambient = new Ambient(w.pois.filter((p) => p.kind === 'nature' || p.kind === 'village' || p.kind === 'harbor').map((p) => new THREE.Vector3(p.x, 0, p.z)));
    this.group.add(this.terrain.group, this.water.group, this.trees.group, this.props.group, this.ambient.group);
    if (this.grass.mesh) this.group.add(this.grass.mesh);
    this.buildRoadMarkings();

    const n = quality === 'high' ? 12 : quality === 'medium' ? 6 : 0;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 22, 1.8);
      this.lights.push(l);
      this.group.add(l);
    }
    // soft glow halos on every lamp (cheap, instanced)
    if (w.lamps.length) {
      const halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: softDotTexture(), color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), w.lamps.length);
      const m = new THREE.Matrix4();
      w.lamps.forEach((p, i) => halo.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
      halo.computeBoundingSphere();
      this.lampGlow = halo;
      this.group.add(halo);
    }

    const wall = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true);
    wall.translate(0, 0.5, 0);
    this.zoneWall = new THREE.Mesh(wall, new THREE.ShaderMaterial({ vertexShader: ZONE_VERT, fragmentShader: ZONE_FRAG, uniforms: this.zoneUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.zoneWall.visible = false;
    this.zoneWall.frustumCulled = false;
    this.group.add(this.zoneWall);

    const beam = new THREE.CylinderGeometry(0.12, 0.12, 1, 6, 1, true);
    beam.translate(0, 0.5, 0);
    this.lootBeams = new THREE.InstancedMesh(beam, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 600);
    this.lootBeams.count = 0;
    this.lootBeams.frustumCulled = false;
    this.group.add(this.lootBeams);
  }

  private buildRoadMarkings() {
    const pos: number[] = [];
    const quad = (ax: number, az: number, bx: number, bz: number, y1: number, y2: number, half: number) => {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * half, nz = (dx / l) * half;
      pos.push(ax - nx, y1, az - nz, bx - nx, y2, bz - nz, ax + nx, y1, az + nz, ax + nx, y1, az + nz, bx - nx, y2, bz - nz, bx + nx, y2, bz + nz);
    };
    for (const r of this.w.roads) {
      if (r.kind === 'dirt') continue;
      for (let i = 0; i < r.pts.length - 1; i += 2) {
        const a = r.pts[i], b = r.pts[i + 1];
        quad(a.x, a.z, b.x, b.z, a.y + 0.06, b.y + 0.06, 0.12);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xe8d36a, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  setLoot(list: EntitySnap[]) {
    this.loot = list;
    const ids = new Set(list.map((l) => l.id));
    for (const [id, o] of this.lootNear) {
      if (!ids.has(id)) {
        this.group.remove(o);
        this.lootNear.delete(id);
      }
    }
  }

  nearestLoot(p: Vec3, radius: number) {
    let best: EntitySnap | null = null, bd = radius;
    for (const l of this.loot) {
      const d = Math.hypot(l.x - p.x, l.z - p.z) + Math.abs(l.y - p.y) * 0.6;
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }

  private lootObject(e: EntitySnap) {
    const g = new THREE.Group();
    const item = e.item ?? 'ammo';
    const color = LOOT_COLORS[item] ?? 0xffffff;
    if (item in WEAPONS) {
      const wm = buildWeapon(item as keyof typeof WEAPONS, 'standard', undefined, { lowDetail: true });
      wm.group.rotation.y = Math.PI / 2;
      wm.group.position.y = 0.5;
      wm.group.scale.setScalar(1.3);
      g.add(wm.group);
    } else {
      const m = new THREE.Mesh(
        item === 'medkit' ? new THREE.BoxGeometry(0.5, 0.3, 0.4) : item === 'ammo' ? new THREE.BoxGeometry(0.6, 0.35, 0.35) : new THREE.BoxGeometry(0.5, 0.6, 0.15),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.3 }),
      );
      m.position.y = 0.4;
      g.add(m);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    g.position.set(e.x, e.y, e.z);
    return g;
  }

  update(dt: number, cam: THREE.Vector3, o: { night: number; wet: number; rain: number; wind: number; sunDir: THREE.Vector3; sunColor: THREE.Color; sunI: number; sky: THREE.Color; amb: THREE.Color; player: THREE.Vector3 | null; zone?: ZoneState }) {
    this.t += dt;
    windUniforms.uWTime.value = this.t;
    windUniforms.uWind.value = o.wind;
    this.terrain.update(dt, o.wet);
    this.water.update(dt, o.sunDir, o.sunColor, o.sky, o.rain, o.night);
    this.trees.update(dt, cam);
    this.grass.update(cam, o.player, o.sunColor, o.sunI, o.amb, o.wet);
    this.props.update(dt, this.t, o.night);
    // forest density estimate around the camera for leaves / fireflies
    let forest = 0;
    const tr = this.w.trees;
    for (let i = 0; i < tr.length; i += 6 * 7) if (Math.abs(tr[i] - cam.x) < 25 && Math.abs(tr[i + 2] - cam.z) < 25) forest += 0.25;
    this.ambient.update(dt, this.t, cam, { night: o.night, forest: Math.min(1, forest), rain: o.rain, wind: o.wind, ground: (x, z) => this.w.terrain.heightAt(x, z) });

    // light pool: real lights on the nearest lamps (brighter at night)
    if (this.lampGlow) (this.lampGlow.material as THREE.MeshBasicMaterial).opacity = 0.15 + o.night * 0.85;
    this.lightTimer -= dt;
    if (this.lightTimer <= 0 && this.lights.length) {
      this.lightTimer = 0.5;
      const near = this.w.lamps
        .map((p) => ({ p, d: (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 + (p.y - cam.y) ** 2 }))
        .filter((x) => x.d < 90 * 90)
        .sort((a, b) => a.d - b.d)
        .slice(0, this.lights.length);
      this.lights.forEach((l, i) => {
        const n = near[i];
        if (!n || o.night < 0.15) {
          l.intensity = 0;
          return;
        }
        l.position.set(n.p.x, n.p.y - 0.3, n.p.z);
        l.intensity = 9 * o.night;
      });
    }

    // royale zone wall
    const z = o.zone;
    this.zoneUniforms.uTime.value = this.t;
    if (z) {
      this.zoneWall.visible = true;
      this.zoneWall.position.set(z.cx, -30, z.cz);
      this.zoneWall.scale.set(Math.max(1, z.r), 320, Math.max(1, z.r));
    } else this.zoneWall.visible = false;

    // loot: beams for all, detailed models nearby
    const m = new THREE.Matrix4();
    let n = 0;
    const col = new THREE.Color();
    for (const l of this.loot) {
      const d = Math.hypot(l.x - cam.x, l.z - cam.z);
      if (n < 600 && d < 260) {
        m.makeScale(1, 4 + Math.min(20, d * 0.08), 1).setPosition(l.x, l.y, l.z);
        this.lootBeams.setMatrixAt(n, m);
        this.lootBeams.setColorAt(n, col.setHex(LOOT_COLORS[l.item ?? ''] ?? 0xffffff));
        n++;
      }
      const obj = this.lootNear.get(l.id);
      if (d < 40 && !obj) {
        const o2 = this.lootObject(l);
        this.lootNear.set(l.id, o2);
        this.group.add(o2);
      } else if (d > 55 && obj) {
        this.group.remove(obj);
        this.lootNear.delete(l.id);
      }
    }
    for (const obj of this.lootNear.values()) obj.rotation.y += dt * 0.8;
    this.lootBeams.count = n;
    this.lootBeams.instanceMatrix.needsUpdate = true;
    if (this.lootBeams.instanceColor) this.lootBeams.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.terrain.dispose();
    this.water.dispose();
    this.trees.dispose();
    this.props.dispose();
  }
}

/** Top-down colour map of the world for the minimap / full-screen map (hillshade + biomes + roads + water + buildings). */
export function renderWorldMap(w: WorldData, solids: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; hidden?: boolean }[], splat: (x: number, z: number) => number[], size = 1024) {
  const t = w.terrain;
  const half = w.half;
  const base = document.createElement('canvas');
  base.width = base.height = t.n;
  const bg = base.getContext('2d')!;
  const img = bg.createImageData(t.n, t.n);
  const cols = [[78, 112, 52], [118, 92, 62], [120, 116, 110], [214, 196, 152], [236, 241, 247], [70, 72, 76], [150, 146, 140], [92, 74, 52]];
  for (let iz = 0; iz < t.n; iz++)
    for (let ix = 0; ix < t.n; ix++) {
      const x = t.origin + ix * t.cell, z = t.origin + iz * t.cell;
      const s = splat(x, z);
      const tot = s.reduce((a, b) => a + b, 0) || 1;
      let r = 0, gg = 0, b = 0;
      s.forEach((wgt, i) => {
        r += cols[i][0] * wgt;
        gg += cols[i][1] * wgt;
        b += cols[i][2] * wgt;
      });
      const h = t.h[iz * t.n + ix];
      const shade = 0.78 + (t.sample(ix - 1, iz + 1) - t.sample(ix + 1, iz - 1)) * 0.06;
      let water = h < w.oceanLevel;
      if (!water) for (const lk of w.lakes) if (Math.hypot(x - lk.x, z - lk.z) < lk.r + 3 && h < lk.level) water = true;
      // canvas rows go north (+z) to south
      const k = ((t.n - 1 - iz) * t.n + ix) * 4;
      if (water) img.data.set([38, 92, 128, 255], k);
      else img.data.set([Math.min(255, (r / tot) * shade), Math.min(255, (gg / tot) * shade), Math.min(255, (b / tot) * shade), 255], k);
    }
  bg.putImageData(img, 0, 0);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  const sx = ((-half - t.origin) / t.cell), sw = (half * 2) / t.cell;
  g.drawImage(base, sx, t.n - 1 - (half - t.origin) / t.cell, sw, sw, 0, 0, size, size);
  const X = (x: number) => ((x + half) / (half * 2)) * size;
  const Y = (z: number) => ((half - z) / (half * 2)) * size;
  g.strokeStyle = 'rgba(40,110,150,0.95)';
  g.lineCap = 'round';
  for (let i = 0; i < w.river.length - 1; i++) {
    g.lineWidth = (w.river[i].width / (half * 2)) * size + 1;
    g.beginPath();
    g.moveTo(X(w.river[i].x), Y(w.river[i].z));
    g.lineTo(X(w.river[i + 1].x), Y(w.river[i + 1].z));
    g.stroke();
  }
  for (const r of w.roads) {
    g.strokeStyle = r.kind === 'dirt' ? 'rgba(150,120,80,0.9)' : 'rgba(225,215,170,0.95)';
    g.lineWidth = r.kind === 'highway' ? 3 : 2;
    g.beginPath();
    r.pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.z)) : g.moveTo(X(p.x), Y(p.z))));
    g.stroke();
  }
  g.fillStyle = 'rgba(60,60,66,0.9)';
  for (const s of solids) {
    if (s.hidden || s.maxY - s.minY < 2.4 || s.maxX - s.minX > 80) continue;
    g.fillRect(X(s.minX), Y(s.maxZ), Math.max(1, ((s.maxX - s.minX) / (half * 2)) * size), Math.max(1, ((s.maxZ - s.minZ) / (half * 2)) * size));
  }
  return c;
}
