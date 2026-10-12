import * as THREE from 'three';
import type { EnergySpec } from '@phantom/shared';

/** Global clock shared by every energy material (advanced once per frame). */
export const energyClock = { value: 0 };

const PATTERN_ID = { circuit: 0, waves: 1, hex: 2, veins: 3 } as const;

/** CPU version of the shader palette (particles / lights use the same colours). */
export function paletteAt(colors: number[], t: number, out = new THREE.Color()) {
  const n = colors.length;
  const f = ((t % 1) + 1) % 1 * n;
  const i = Math.floor(f);
  const a = new THREE.Color(colors[i % n]);
  const b = new THREE.Color(colors[(i + 1) % n]);
  const k = f - i;
  return out.copy(a).lerp(b, k * k * (3 - 2 * k));
}

export interface EnergyHandle {
  material: THREE.MeshStandardMaterial;
  boost: { value: number };
}

/**
 * MeshStandardMaterial extended with an animated emissive layer:
 * colour cycling gradient, moving surface pattern (shader animation) and travelling
 * energy pulses. `boost` makes the glow reactive (firing, reloading, abilities).
 * Works with the bloom pass for the glow halo.
 */
export function energyMaterial(spec: EnergySpec, kind: 'body' | 'accent', baseColor: number, boost = { value: 1 }): EnergyHandle {
  const material = new THREE.MeshStandardMaterial({
    color: kind === 'accent' ? 0x111111 : baseColor,
    metalness: kind === 'accent' ? 0.2 : 0.85,
    roughness: kind === 'accent' ? 0.35 : 0.28,
    emissive: 0x000000,
  });
  const cols = [...spec.colors];
  while (cols.length < 4) cols.push(cols[cols.length - 1]);
  const uniforms = {
    uTime: energyClock,
    uBoost: boost,
    uSpeed: { value: spec.speed },
    uPattern: { value: PATTERN_ID[spec.pattern] },
    uBase: { value: kind === 'accent' ? 1.6 : 0.08 },
    uPat: { value: kind === 'accent' ? 0.6 : 1.7 },
    uC: { value: cols.slice(0, 4).map((c) => new THREE.Color(c)) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vEPos;
uniform float uTime; uniform float uBoost; uniform float uSpeed; uniform int uPattern; uniform float uBase; uniform float uPat;
uniform vec3 uC[4];
vec3 ePalette(float t){
  float f = fract(t) * 4.0; int i = int(floor(f)); float k = smoothstep(0.0, 1.0, fract(f));
  vec3 a = uC[0]; vec3 b = uC[1];
  if (i == 1) { a = uC[1]; b = uC[2]; } else if (i == 2) { a = uC[2]; b = uC[3]; } else if (i == 3) { a = uC[3]; b = uC[0]; }
  return mix(a, b, k);
}
float eHex(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
float ePattern(vec3 p, float t){
  if (uPattern == 0) { // circuit traces with moving data packets
    vec2 g = fract(p.zy * vec2(1.6, 2.2));
    float line = smoothstep(0.08, 0.0, min(abs(g.x - 0.5), abs(g.y - 0.5)));
    float packet = smoothstep(0.85, 1.0, fract(p.z * 0.8 - t * 2.5 + floor(p.y * 2.2) * 0.37));
    return line * (0.35 + packet * 1.5);
  } else if (uPattern == 1) { // flowing waves
    float w = sin(p.z * 3.0 + sin(p.y * 4.0 + t * 3.0) * 1.2 - t * 4.0);
    return smoothstep(0.55, 1.0, w) * 1.2;
  } else if (uPattern == 2) { // hex lattice
    vec2 q = p.zy * 2.4; vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h; vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float edge = smoothstep(0.42, 0.48, eHex(gv));
    return edge * (0.6 + 0.4 * sin(t * 3.0 + q.x));
  }
  // veins
  float v = abs(sin(p.z * 2.3 + sin(p.y * 3.1 + t) * 1.5) * cos(p.x * 2.7 + p.y * 1.3 - t * 0.7));
  return pow(1.0 - v, 6.0) * 1.6;
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 ep = vEPos * 14.0;
  float et = uTime * uSpeed;
  vec3 ecol = ePalette(et + ep.z * 0.03 + ep.y * 0.02);
  float pulse = pow(max(0.0, 1.0 - abs(fract(ep.z * 0.06 - uTime * 0.55) - 0.5) * 7.0), 3.0);
  totalEmissiveRadiance += ecol * (uBase + ePattern(ep, uTime) * uPat + pulse * 2.2) * uBoost;
}`,
      );
  };
  material.customProgramCacheKey = () => `energy-${kind}`;
  return { material, boost };
}
