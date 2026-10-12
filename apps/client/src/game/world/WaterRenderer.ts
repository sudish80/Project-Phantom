import * as THREE from 'three';
import type { WorldData } from '@phantom/shared';
import { noiseNormalTexture } from '../rendering/textures';

const VERT = /* glsl */ `
attribute float aDepth; attribute vec2 aFlow;
varying float vDepth; varying vec3 vWPos; varying vec2 vFlow;
#include <fog_pars_vertex>
uniform float uTime;
void main(){
  vDepth = aDepth; vFlow = aFlow;
  vec3 p = position;
  float wave = sin(p.x * 0.05 + uTime * 0.9) * 0.06 + sin(p.z * 0.07 - uTime * 1.2) * 0.05;
  p.y += wave * clamp(aDepth * 0.5, 0.0, 1.0);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime; uniform sampler2D uNormal; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uShallow;
uniform float uRain; uniform float uNight;
varying float vDepth; varying vec3 vWPos; varying vec2 vFlow;
#include <fog_pars_fragment>
void main(){
  vec2 uv = vWPos.xz * 0.05;
  vec2 flow = vFlow * uTime * 0.25;
  vec3 n1 = texture2D(uNormal, uv + vec2(uTime * 0.01, uTime * 0.006) + flow).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormal, uv * 2.3 - vec2(uTime * 0.013, -uTime * 0.008) + flow * 1.7).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3(n1.x + n2.x, 6.0 - uRain * 3.0, n1.y + n2.y));
  vec3 V = normalize(cameraPosition - vWPos);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 refl = mix(uSky * 0.8, uSky * 1.15, clamp(R.y, 0.0, 1.0));
  float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0) * 3.0 * (1.0 - uNight * 0.85);
  float d = clamp(vDepth / 3.5, 0.0, 1.0);
  vec3 body = mix(uShallow, uDeep, d) * (0.35 + 0.65 * (1.0 - uNight * 0.75));
  vec3 col = mix(body, refl, fres) + uSunCol * spec;
  // shoreline foam
  float foamN = texture2D(uNormal, vWPos.xz * 0.21 + uTime * 0.02).z;
  float foam = (1.0 - smoothstep(0.0, 0.55, vDepth)) * smoothstep(0.45, 0.8, foamN + sin(uTime * 1.6 + vDepth * 9.0) * 0.15);
  col = mix(col, vec3(0.92, 0.95, 1.0) * (0.4 + 0.6 * (1.0 - uNight)), foam * 0.8);
  float alpha = clamp(0.45 + d * 0.5 + fres * 0.3, 0.45, 0.96);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Ocean, lakes and river with animated normals, fresnel reflection, sun glints, depth tint and shoreline foam. */
export class WaterRenderer {
  readonly group = new THREE.Group();
  readonly uniforms: Record<string, THREE.IUniform>;
  private material: THREE.ShaderMaterial;

  constructor(private w: WorldData) {
    const nt = noiseNormalTexture();
    this.uniforms = {
      ...THREE.UniformsLib.fog,
      uTime: { value: 0 }, uNormal: { value: nt }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0.6, 0.7, 0.85) }, uDeep: { value: new THREE.Color(0x0b2a3a) }, uShallow: { value: new THREE.Color(0x2f7a7a) },
      uRain: { value: 0 }, uNight: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, fog: true });
    this.buildOcean();
    for (const lk of w.lakes) this.buildLake(lk);
    this.buildRiver();
  }

  private depthAt(x: number, z: number, level: number) {
    return Math.max(0, level - this.w.terrain.heightAt(x, z));
  }

  private gridMesh(cx: number, cz: number, size: number, seg: number, level: number, keep: (x: number, z: number) => boolean) {
    const pos: number[] = [], depth: number[] = [], flow: number[] = [], idx: number[] = [];
    const map = new Map<number, number>();
    const step = size / seg;
    const vi = (i: number, j: number) => {
      const key = j * (seg + 1) + i;
      let v = map.get(key);
      if (v === undefined) {
        const x = cx - size / 2 + i * step, z = cz - size / 2 + j * step;
        v = pos.length / 3;
        pos.push(x, level, z);
        depth.push(Math.abs(x) > 640 || Math.abs(z) > 640 ? 6 : this.depthAt(x, z, level));
        flow.push(0, 0);
        map.set(key, v);
      }
      return v;
    };
    for (let j = 0; j < seg; j++)
      for (let i = 0; i < seg; i++) {
        const x = cx - size / 2 + (i + 0.5) * step, z = cz - size / 2 + (j + 0.5) * step;
        if (!keep(x, z)) continue;
        const a = vi(i, j), b = vi(i + 1, j), c = vi(i, j + 1), d = vi(i + 1, j + 1);
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.renderOrder = 2;
    this.group.add(m);
    return m;
  }

  private buildOcean() {
    // fine grid near the coast, cells under high terrain skipped
    const t = this.w.terrain;
    this.gridMesh(260, -260, 1500, 150, this.w.oceanLevel, (x, z) => (Math.abs(x) > 640 || Math.abs(z) > 640 ? x - z > 300 : t.heightAt(x, z) < this.w.oceanLevel + 0.6));
  }

  private buildLake(lk: { x: number; z: number; r: number; level: number }) {
    const t = this.w.terrain;
    this.gridMesh(lk.x, lk.z, lk.r * 2 + 40, 48, lk.level, (x, z) => t.heightAt(x, z) < lk.level + 0.5);
  }

  private buildRiver() {
    const pts = this.w.river;
    const pos: number[] = [], depth: number[] = [], flow: number[] = [], idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let dx = q.x - o.x, dz = q.z - o.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const half = p.width / 2 + 3;
      for (const side of [-1, 1]) {
        const x = p.x - dz * half * side, z = p.z + dx * half * side;
        pos.push(x, p.level, z);
        depth.push(this.depthAt(x, z, p.level));
        flow.push(-dx * 0.6, -dz * 0.6);
      }
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.renderOrder = 2;
    this.group.add(m);
  }

  /** Water surface level at a point if the point is over water, else null (for underwater tint). */
  levelAt(x: number, z: number): number | null {
    const h = this.w.terrain.heightAt(x, z);
    if (h < this.w.oceanLevel) return this.w.oceanLevel;
    for (const lk of this.w.lakes) if (Math.hypot(x - lk.x, z - lk.z) < lk.r + 6 && h < lk.level) return lk.level;
    for (const p of this.w.river) if (Math.hypot(x - p.x, z - p.z) < p.width / 2 + 2 && h < p.level) return p.level;
    return null;
  }

  update(dt: number, sunDir: THREE.Vector3, sunCol: THREE.Color, sky: THREE.Color, rain: number, night: number) {
    this.uniforms.uTime.value += dt;
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    (this.uniforms.uSunCol.value as THREE.Color).copy(sunCol);
    (this.uniforms.uSky.value as THREE.Color).copy(sky);
    this.uniforms.uRain.value = rain;
    this.uniforms.uNight.value = night;
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.material.dispose();
  }
}
