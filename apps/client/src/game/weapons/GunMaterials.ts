import * as THREE from 'three';

/**
 * Physically based firearm finishes. Every finish is a MeshStandard/Physical material with a
 * procedural layer injected into the shader (no texture files):
 *  - micro surface detail (brushing, stippling, wood grain, casting texture) as bump mapping,
 *  - roughness variation (handled areas are slightly polished),
 *  - edge wear: high-curvature edges (detected from screen-space normal derivatives on the
 *    chamfered geometry) reveal brighter bare metal / lighter wood, like real carried guns.
 * Patterns are evaluated in weapon space (geometry is baked), so they stay locked to the gun.
 */
export type Finish = 'phosphate' | 'anodized' | 'blued' | 'polymer' | 'wood' | 'rubber' | 'cerakote' | 'brass' | 'chrome';

interface FinishSpec {
  metal: number;
  rough: number;
  /** procedural pattern id used in the shader */
  pattern: number;
  bump: number;
  scale: number;
  wear: number;
  wearColor: number;
  clearcoat?: number;
}

const SPECS: Record<Finish, FinishSpec> = {
  phosphate: { metal: 0.45, rough: 0.66, pattern: 0, bump: 0.02, scale: 500, wear: 0.9, wearColor: 0x9a9da3 },
  anodized: { metal: 0.55, rough: 0.46, pattern: 0, bump: 0.035, scale: 1400, wear: 0.65, wearColor: 0xb8bcc2 },
  blued: { metal: 0.95, rough: 0.28, pattern: 1, bump: 0.12, scale: 600, wear: 0.5, wearColor: 0xc9ccd2 },
  polymer: { metal: 0.0, rough: 0.7, pattern: 2, bump: 0.12, scale: 2600, wear: 0.25, wearColor: 0x5a5d62 },
  wood: { metal: 0.0, rough: 0.5, pattern: 3, bump: 0.35, scale: 1, wear: 0.6, wearColor: 0xc89a62, clearcoat: 0.35 },
  rubber: { metal: 0.0, rough: 0.9, pattern: 2, bump: 0.1, scale: 2200, wear: 0, wearColor: 0x333333 },
  cerakote: { metal: 0.25, rough: 0.58, pattern: 0, bump: 0.06, scale: 1500, wear: 0.55, wearColor: 0xa0a3a8 },
  brass: { metal: 1.0, rough: 0.3, pattern: 1, bump: 0.05, scale: 800, wear: 0.2, wearColor: 0xf2d38a },
  chrome: { metal: 1.0, rough: 0.12, pattern: 1, bump: 0.04, scale: 600, wear: 0.15, wearColor: 0xffffff },
};

const NOISE_GLSL = /* glsl */ `
float gh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh(i), gh(i + vec3(1,0,0)), f.x), mix(gh(i + vec3(0,1,0)), gh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gh(i + vec3(0,0,1)), gh(i + vec3(1,0,1)), f.x), mix(gh(i + vec3(0,1,1)), gh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float gfbm(vec3 p){ return gn(p) * 0.55 + gn(p * 2.03) * 0.28 + gn(p * 4.1) * 0.17; }
`;

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Create (or reuse) a finish material in the given base colour. */
export function gunMaterial(finish: Finish, color: number): THREE.MeshStandardMaterial {
  const key = `${finish}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = SPECS[finish];
  // double-sided: when aiming, the near clip cuts through the stock; back faces keep the cut looking solid
  const params = { color, metalness: s.metal, roughness: s.rough, side: THREE.DoubleSide };
  const m = s.clearcoat ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: s.clearcoat, clearcoatRoughness: 0.45 }) : new THREE.MeshStandardMaterial(params);
  const uniforms = {
    uPattern: { value: s.pattern },
    uBump: { value: s.bump },
    uScale: { value: s.scale },
    uWear: { value: s.wear },
    uWearColor: { value: new THREE.Color(s.wearColor) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGPos; varying vec3 vGNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGPos = position; vGNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGPos; varying vec3 vGNrm;
uniform int uPattern; uniform float uBump; uniform float uScale; uniform float uWear; uniform vec3 uWearColor;
${NOISE_GLSL}
float gHeight(vec3 p){
  if (uPattern == 1) return gn(vec3(p.x * uScale * 0.05, p.y * uScale * 0.05, p.z * uScale)) * 0.6 + gn(p * uScale * 0.2) * 0.4; // brushed along the barrel
  if (uPattern == 2) return smoothstep(0.35, 0.75, gn(p * uScale)) ;                                                   // stippling / texture
  if (uPattern == 3) { float g = sin((p.y * 260.0 + p.x * 120.0 + gfbm(p * vec3(14.0, 14.0, 1.6)) * 7.0)); return g * 0.5 + 0.5; } // wood grain (runs along the stock)
  return gfbm(p * uScale) ;                                                                                            // cast / parkerised
}
float gEdge(){
  vec3 dn = fwidth(normalize(vGNrm)); vec3 dp = fwidth(vGPos);
  float curv = length(dn) / max(length(dp), 1e-6);
  return smoothstep(110.0, 420.0, curv);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float gWearMask = 0.0;
{
  float edge = gEdge();
  float n = gfbm(vGPos * 180.0);
  gWearMask = clamp(edge * uWear * smoothstep(0.25, 0.75, n) * 1.6, 0.0, 1.0);
  if (uPattern == 3) {
    float grain = gHeight(vGPos);
    float fig = gfbm(vGPos * vec3(30.0, 30.0, 4.0));
    diffuseColor.rgb *= mix(0.55, 1.15, grain * 0.6 + fig * 0.4);
  } else {
    diffuseColor.rgb *= 0.965 + gfbm(vGPos * uScale * 0.03) * 0.07;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, uWearColor, gWearMask);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.94 + gn(vGPos * uScale * 0.3) * 0.12) - gWearMask * 0.25, 0.04, 1.0);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, ${s.metal > 0.3 ? '1.0' : `${Math.max(s.metal, 0.0).toFixed(2)}`}, gWearMask);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // derivative bump mapping (same approach as three.js perturbNormalArb)
  float h = gHeight(vGPos) * uBump * 0.0006;
  vec2 dHdxy = vec2(dFdx(h), dFdy(h));
  vec3 vSigmaX = dFdx(-vViewPosition), vSigmaY = dFdy(-vViewPosition);
  vec3 R1 = cross(vSigmaY, normal), R2 = cross(normal, vSigmaX);
  float fDet = dot(vSigmaX, R1);
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  normal = normalize(abs(fDet) * normal - vGrad);
}`,
      );
  };
  m.customProgramCacheKey = () => `gun-${finish}`;
  cache.set(key, m);
  return m;
}

/** Desaturate & darken a stylised accent colour into a believable finish tone. */
export function mutedTone(color: number, toward = 0x2a2c30, amount = 0.72) {
  return new THREE.Color(color).lerp(new THREE.Color(toward), amount).getHex();
}

/** Real-world-ish finish choices per weapon. */
export const WEAPON_FINISH: Record<string, { body: Finish; frame: Finish; furniture: Finish; bodyColor?: number; frameColor?: number; furnitureColor?: number }> = {
  glock: { body: 'phosphate', frame: 'polymer', furniture: 'polymer', bodyColor: 0x26282c, frameColor: 0x1c1d20 },
  deagle: { body: 'blued', frame: 'blued', furniture: 'rubber', bodyColor: 0x5c6068, frameColor: 0x50545c },
  wisp: { body: 'anodized', frame: 'polymer', furniture: 'polymer' },
  magistrate: { body: 'blued', frame: 'blued', furniture: 'wood', furnitureColor: 0x5a3a24 },
  mp5: { body: 'phosphate', frame: 'polymer', furniture: 'polymer', bodyColor: 0x24262a },
  p90: { body: 'polymer', frame: 'polymer', furniture: 'polymer', bodyColor: 0x2b2d2a },
  hornet: { body: 'anodized', frame: 'polymer', furniture: 'polymer' },
  ak47: { body: 'phosphate', frame: 'phosphate', furniture: 'wood', bodyColor: 0x2c2d30, furnitureColor: 0x5e3119 },
  m4a1: { body: 'anodized', frame: 'polymer', furniture: 'polymer', bodyColor: 0x232427 },
  scarl: { body: 'anodized', frame: 'polymer', furniture: 'polymer', bodyColor: 0x8c7a5c, frameColor: 0x1f2022 },
  corsair: { body: 'anodized', frame: 'polymer', furniture: 'polymer' },
  lancer: { body: 'anodized', frame: 'polymer', furniture: 'polymer' },
  svd: { body: 'phosphate', frame: 'phosphate', furniture: 'wood', bodyColor: 0x2b2c2f, furnitureColor: 0x55301a },
  barrett: { body: 'phosphate', frame: 'phosphate', furniture: 'rubber', bodyColor: 0x2a2c2e },
  longwatch: { body: 'cerakote', frame: 'polymer', furniture: 'polymer' },
  spas: { body: 'phosphate', frame: 'polymer', furniture: 'polymer', bodyColor: 0x26282b },
  aa12: { body: 'phosphate', frame: 'polymer', furniture: 'polymer' },
  breacher: { body: 'phosphate', frame: 'polymer', furniture: 'wood', furnitureColor: 0x6a4026 },
  m249: { body: 'phosphate', frame: 'polymer', furniture: 'polymer', bodyColor: 0x2a2c27 },
  bulwark: { body: 'cerakote', frame: 'polymer', furniture: 'polymer' },
  edge: { body: 'chrome', frame: 'rubber', furniture: 'rubber', bodyColor: 0xb9bcc2, frameColor: 0x1a1b1d },
};
