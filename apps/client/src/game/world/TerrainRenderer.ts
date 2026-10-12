import * as THREE from 'three';
import { Noise2D, smoothstep, type WorldData } from '@phantom/shared';
import { terrainTextures } from './terrainTextures';

export const CHUNK = 160;

/**
 * Chunked heightfield terrain with 3 LOD levels per chunk (plus skirts to hide seams)
 * and a splat shader that blends grass / soil / rock (triplanar on cliffs) / sand / snow /
 * asphalt / paving / mud with height-aware transitions, macro variation and wetness.
 */
export class TerrainRenderer {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms = { uWet: { value: 0 }, uTime: { value: 0 } };
  /** grass density per terrain sample (0..255) — used by the GPU grass field */
  readonly grassMask: Uint8Array;
  private noise: Noise2D;

  constructor(private w: WorldData, quality: 'low' | 'medium' | 'high') {
    this.noise = new Noise2D(w.seed + 5);
    const tex = terrainTextures();
    const T = this.uniforms as Record<string, THREE.IUniform>;
    for (const [k, v] of Object.entries(tex)) T['t' + k[0].toUpperCase() + k.slice(1)] = { value: v };
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    this.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, T);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec4 aSplat; attribute vec4 aSplat2; varying vec4 vSplat; varying vec4 vSplat2; varying vec3 vWPos; varying vec3 vWNrm;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvSplat = aSplat; vSplat2 = aSplat2; vWPos = (modelMatrix * vec4(position,1.0)).xyz; vWNrm = normal;',
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec4 vSplat; varying vec4 vSplat2; varying vec3 vWPos; varying vec3 vWNrm;
uniform sampler2D tGrass, tDirt, tRock, tSand, tSnow, tAsphalt, tPaved, tMacro; uniform float uWet;
vec3 tri(sampler2D t, vec3 p, vec3 n, float s){ vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
  return texture2D(t, p.zy * s).rgb * b.x + texture2D(t, p.xz * s).rgb * b.y + texture2D(t, p.xy * s).rgb * b.z; }`,
        )
        .replace(
          '#include <map_fragment>',
          `{
  vec2 uv = vWPos.xz;
  float macro = texture2D(tMacro, uv * 0.004).r * 0.8 + texture2D(tMacro, uv * 0.031).r * 0.4;
  vec3 g = texture2D(tGrass, uv * 0.22).rgb * mix(0.85, 1.12, macro);
  vec3 d = texture2D(tDirt, uv * 0.18).rgb;
  vec3 r = tri(tRock, vWPos, normalize(vWNrm), 0.09);
  vec3 s = texture2D(tSand, uv * 0.2).rgb;
  vec3 sn = texture2D(tSnow, uv * 0.15).rgb;
  vec3 as = texture2D(tAsphalt, uv * 0.12).rgb;
  vec3 pv = texture2D(tPaved, uv * 0.25).rgb;
  vec3 mud = d * vec3(0.55, 0.5, 0.45);
  // height-aware blend weights (texture luminance sharpens transitions naturally)
  vec4 w1 = vSplat * vec4(0.6 + dot(g, vec3(0.33)), 0.6 + dot(d, vec3(0.33)), 0.6 + dot(r, vec3(0.33)), 0.7 + dot(s, vec3(0.2)));
  vec4 w2 = vSplat2 * vec4(1.0, 1.0, 1.0, 1.0);
  w1 = pow(max(w1, 0.0), vec4(3.0)); w2 = pow(max(w2, 0.0), vec4(3.0));
  float tot = dot(w1, vec4(1.0)) + dot(w2, vec4(1.0)) + 1e-4;
  vec3 col = (g * w1.x + d * w1.y + r * w1.z + s * w1.w + sn * w2.x + as * w2.y + pv * w2.z + mud * w2.w) / tot;
  float snowW = w2.x / tot, paveW = (w2.y + w2.z) / tot;
  col *= mix(1.0, 0.62, uWet * (1.0 - snowW));
  diffuseColor.rgb *= col;
  vRough = mix(0.95 - paveW * 0.1, 0.22 + paveW * 0.05, uWet * (1.0 - snowW));
}`,
        )
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;')
        .replace('varying vec3 vWNrm;', 'varying vec3 vWNrm; float vRough = 0.95;');
    };
    this.material.customProgramCacheKey = () => 'terrain-splat';

    this.grassMask = new Uint8Array(w.terrain.n * w.terrain.n);
    this.computeGrassMask();
    this.build(quality);
  }

  /** splat weights: [grass, dirt, rock, sand], [snow, asphalt, paved, mud] */
  splat(x: number, z: number) {
    const t = this.w.terrain;
    const h = t.heightAt(x, z);
    const n = t.normalAt(x, z);
    const slope = Math.sqrt(1 - n.y * n.y) / Math.max(n.y, 0.05);
    const ix = Math.round((x - t.origin) / t.cell), iz = Math.round((z - t.origin) / t.cell);
    const k = Math.max(0, Math.min(t.n - 1, iz)) * t.n + Math.max(0, Math.min(t.n - 1, ix));
    const road = this.w.roadMask[k];
    const wet = this.w.wetMask[k] / 255;
    const sand = this.w.sandMask[k] / 255;
    const nz = this.noise.fbm(x * 0.02, z * 0.02, 3);
    const snow = smoothstep(92, 112, h + nz * 12) * (1 - smoothstep(1.1, 1.6, slope) * 0.6);
    const rock = Math.min(1, smoothstep(0.55, 1.0, slope) + smoothstep(115, 150, h) * 0.4 * (1 - snow));
    let dirt = Math.max(0, nz * 0.6 - 0.05) + (road === 2 ? 1.5 : 0) + (x > 220 && z > -60 && z < 200 ? 0.45 : 0) + smoothstep(140, 220, Math.abs(x + 420) + Math.abs(z - 20)) * 0;
    const grass = Math.max(0, 1 - rock - snow - sand * 1.2 - dirt * 0.6);
    dirt = Math.min(1.5, dirt);
    const asphalt = road === 1 ? 2 : 0;
    const paved = road === 3 ? 2 : 0;
    const mud = wet * 1.3 * (1 - sand);
    return [grass, dirt, rock * (1 - snow * 0.6), sand * 1.4, snow * 1.5, asphalt, paved, mud];
  }

  private computeGrassMask() {
    const t = this.w.terrain;
    for (let iz = 0; iz < t.n; iz++)
      for (let ix = 0; ix < t.n; ix++) {
        const x = t.origin + ix * t.cell, z = t.origin + iz * t.cell;
        const s = this.splat(x, z);
        const tot = s.reduce((a, b) => a + b, 0) || 1;
        const g = s[0] / tot;
        const below = t.heightAt(x, z) < 0.4;
        this.grassMask[iz * t.n + ix] = below ? 0 : Math.round(255 * Math.max(0, Math.min(1, (g - 0.35) * 1.8)));
      }
  }

  private buildChunk(cx: number, cz: number, step: number) {
    const t = this.w.terrain;
    const n = Math.round(CHUNK / step) + 1;
    const count = n * n + 4 * n;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), s1 = new Float32Array(count * 4), s2 = new Float32Array(count * 4);
    const idx: number[] = [];
    const ox = cx * CHUNK - CHUNK / 2, oz = cz * CHUNK - CHUNK / 2;
    const center = new THREE.Vector3(cx * CHUNK, 0, cz * CHUNK);
    const put = (i: number, x: number, z: number, yOff: number) => {
      const y = t.heightAt(x, z) + yOff;
      pos[i * 3] = x - center.x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z - center.z;
      const nn = t.normalAt(x, z);
      nor[i * 3] = nn.x;
      nor[i * 3 + 1] = nn.y;
      nor[i * 3 + 2] = nn.z;
      const s = this.splat(x, z);
      s1.set(s.slice(0, 4), i * 4);
      s2.set(s.slice(4, 8), i * 4);
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) put(j * n + i, ox + i * step, oz + j * step, 0);
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    // skirts
    let k = n * n;
    const edges: number[][] = [[], [], [], []];
    for (let i = 0; i < n; i++) {
      edges[0].push(i);
      edges[1].push((n - 1) * n + i);
      edges[2].push(i * n);
      edges[3].push(i * n + n - 1);
    }
    for (const e of edges) {
      const start = k;
      for (const v of e) {
        const x = pos[v * 3] + center.x, z = pos[v * 3 + 2] + center.z;
        put(k, x, z, -4);
        k++;
      }
      for (let i = 0; i < e.length - 1; i++) {
        const a = e[i], b = e[i + 1], c = start + i, d = start + i + 1;
        idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aSplat', new THREE.BufferAttribute(s1, 4));
    g.setAttribute('aSplat2', new THREE.BufferAttribute(s2, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return { g, center };
  }

  private build(quality: string) {
    const span = this.w.terrain.size / 2;
    const nC = Math.ceil(span / CHUNK);
    const steps = quality === 'high' ? [4, 8, 16] : [4, 8, 16];
    const dists = [0, 210, 420];
    for (let cz = -nC; cz < nC; cz++)
      for (let cx = -nC; cx < nC; cx++) {
        const lod = new THREE.LOD();
        steps.forEach((st, i) => {
          const { g, center } = this.buildChunk(cx + 0.5, cz + 0.5, st);
          const mesh = new THREE.Mesh(g, this.material);
          mesh.receiveShadow = true;
          lod.addLevel(mesh, dists[i]);
          lod.position.copy(center);
        });
        lod.autoUpdate = true;
        this.group.add(lod);
      }
  }

  update(dt: number, wet: number) {
    this.uniforms.uWet.value = wet;
    this.uniforms.uTime.value += dt;
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.material.dispose();
  }
}
