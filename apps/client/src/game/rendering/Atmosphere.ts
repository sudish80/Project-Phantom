import * as THREE from 'three';
import type { EnvState, MapEnv, WeatherKind } from '@phantom/shared';
import type { Quality } from '../../stores/settings';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uDay; uniform float uSunset; uniform float uCloud; uniform float uTime;
uniform float uWind; uniform float uFlash; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunCol;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5453), b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5453);
  float c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5453), d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5453);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += n2(p) * a; p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  // sunset glow around the sun
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * pow(sd, 6.0) * (0.25 + uSunset * 0.9) * (1.0 - uCloud * 0.7);
  // sun & moon discs
  col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 6.0 * (1.0 - uCloud) * step(0.0, uSunDir.y + 0.05);
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9994, 0.9997, md) * (1.0 - uDay) * (1.0 - uCloud) * 1.6;
  col += vec3(0.2, 0.25, 0.4) * pow(md, 30.0) * (1.0 - uDay) * 0.4;
  // stars
  if (h > 0.0) {
    float st = hash(floor(d * 380.0));
    col += vec3(step(0.9975, st)) * (1.0 - uDay) * (1.0 - uCloud) * smoothstep(0.0, 0.3, h) * (0.6 + 0.4 * sin(uTime * 2.0 + st * 100.0));
  }
  // drifting clouds (two layers)
  if (h > -0.02) {
    vec2 uv = d.xz / (h + 0.12);
    float c1 = fbm(uv * 1.3 + vec2(uTime * 0.012, uTime * 0.004) * (0.4 + uWind));
    float c2 = fbm(uv * 3.1 - vec2(uTime * 0.02, 0.0) * (0.4 + uWind));
    float cov = smoothstep(0.62 - uCloud * 0.45, 0.95 - uCloud * 0.35, c1 * 0.75 + c2 * 0.35);
    vec3 lit = mix(vec3(0.07, 0.08, 0.11), vec3(1.0), uDay * 0.9 + 0.08) * mix(vec3(1.0), uSunCol, 0.35);
    vec3 shade = mix(lit * 0.55, lit, smoothstep(0.3, 0.9, c2));
    col = mix(col, shade * (1.0 - uCloud * 0.35), cov * smoothstep(-0.02, 0.15, h) * 0.95);
  }
  // overcast desaturation
  float g = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(g) * 0.85, uCloud * 0.55);
  col += vec3(0.7, 0.75, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface WeatherParams {
  cloud: number;
  rain: number;
  fog: number;
  wind: number;
}

const WEATHER: Record<WeatherKind, WeatherParams> = {
  clear: { cloud: 0.12, rain: 0, fog: 0, wind: 0.3 },
  overcast: { cloud: 0.85, rain: 0, fog: 0.35, wind: 0.5 },
  rain: { cloud: 0.9, rain: 0.6, fog: 0.45, wind: 0.6 },
  storm: { cloud: 1, rain: 1, fog: 0.55, wind: 1 },
  fog: { cloud: 0.6, rain: 0, fog: 1, wind: 0.1 },
};

const c = (h: number) => new THREE.Color(h);
const DAY_ZENITH = c(0x2e5fae), DAY_HORIZON = c(0xa9c6e2);
const SET_ZENITH = c(0x2a2f5a), SET_HORIZON = c(0xf08a4b);
const NIGHT_ZENITH = c(0x03050c), NIGHT_HORIZON = c(0x0e1324);

/**
 * Time of day + weather. Drives the sky, sun/moon light, hemisphere light, fog, rain,
 * lightning, wetness and a night factor other systems use (window lights, lamps, bloom).
 * Values ease toward the server-synchronised target so changes are never abrupt.
 */
export class Atmosphere {
  readonly sky: THREE.Mesh;
  readonly hemi: THREE.HemisphereLight;
  private uniforms: Record<string, THREE.IUniform>;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private cur: WeatherParams & { time: number };
  wet = 0;
  night = 0;
  wind = 0.3;
  rainAmt = 0;
  flash = 0;
  private nextFlash = 10;
  private baseFogDensity: number;
  readonly sunDir = new THREE.Vector3();
  readonly sunColor = new THREE.Color();
  readonly horizon = new THREE.Color();
  onThunder: ((delay: number) => void) | null = null;

  constructor(private scene: THREE.Scene, private sun: THREE.DirectionalLight, private env: MapEnv, quality: Quality, private sunCenter: THREE.Vector3) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uDay: { value: 1 }, uSunset: { value: 0 },
      uCloud: { value: 0 }, uTime: { value: 0 }, uWind: { value: 0.3 }, uFlash: { value: 0 }, uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(500, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(env.hemiSky, env.hemiGround, env.hemiIntensity);
    scene.add(this.hemi);
    this.baseFogDensity = env.fogDensity;
    scene.fog = new THREE.FogExp2(env.fog, env.fogDensity);
    const n = quality === 'low' ? 1200 : quality === 'medium' ? 3000 : 6000;
    this.rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this.resetDrop(i, new THREE.Vector3(), true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8c99ab, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.cur = { ...WEATHER[env.weather], time: env.time };
  }

  private resetDrop(i: number, cam: THREE.Vector3, randomY: boolean) {
    const x = cam.x + (Math.random() - 0.5) * 50, z = cam.z + (Math.random() - 0.5) * 50;
    const y = cam.y + (randomY ? Math.random() * 30 - 8 : 22);
    const k = i * 6;
    this.rainPos[k] = x;
    this.rainPos[k + 1] = y;
    this.rainPos[k + 2] = z;
    this.rainPos[k + 3] = x;
    this.rainPos[k + 4] = y - 0.45;
    this.rainPos[k + 5] = z;
  }

  update(dt: number, t: number, env: EnvState | undefined, cam: THREE.Vector3, indoorish = false) {
    const target = WEATHER[env?.weather ?? this.env.weather];
    const k = Math.min(1, dt * 0.25); // ~4 s transitions
    this.cur.cloud += (target.cloud - this.cur.cloud) * k;
    this.cur.rain += (target.rain - this.cur.rain) * k;
    this.cur.fog += (target.fog - this.cur.fog) * k;
    this.cur.wind += (target.wind - this.cur.wind) * k;
    const tt = env?.time ?? this.env.time;
    let dtime = tt - this.cur.time;
    if (dtime > 12) dtime -= 24;
    if (dtime < -12) dtime += 24;
    this.cur.time = (this.cur.time + dtime * Math.min(1, dt * 0.8) + 24) % 24;
    const W = this.cur;
    this.wind = W.wind;
    this.rainAmt = W.rain;
    this.wet = Math.max(this.env.wet ? 0.65 : 0, W.rain > 0.2 ? Math.min(1, this.wet + dt * 0.05 * W.rain) : Math.max(0, this.wet - dt * 0.004));

    // sun path: rises in the east (+x) at 6:00, sets in the west at 18:00
    const ang = ((W.time - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang), elev, 0.35).normalize();
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
    const sunset = Math.max(0, 1 - Math.abs(elev) / 0.35) * THREE.MathUtils.smoothstep(elev, -0.25, 0.02);
    this.night = 1 - day;
    this.sunColor.copy(c(0xff8a4a)).lerp(c(0xfff3dc), THREE.MathUtils.smoothstep(elev, 0.02, 0.45));
    const zen = NIGHT_ZENITH.clone().lerp(DAY_ZENITH, day).lerp(SET_ZENITH, sunset * 0.6);
    this.horizon.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, day).lerp(SET_HORIZON, sunset * 0.75);
    const grey = (col: THREE.Color, amt: number) => {
      const l = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
      return col.lerp(new THREE.Color(l, l, l * 1.05), amt);
    };
    grey(zen, W.cloud * 0.6);
    grey(this.horizon, W.cloud * 0.5 + W.fog * 0.3);

    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (W.rain > 0.85 && (env?.weather === 'storm' || this.env.weather === 'storm')) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 1;
        this.nextFlash = 6 + Math.random() * 14;
        this.onThunder?.(0.5 + Math.random() * 2.5);
      }
    }

    const u = this.uniforms;
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uMoonDir.value as THREE.Vector3).copy(this.sunDir).multiplyScalar(-1).setY(Math.max(0.25, -this.sunDir.y)).normalize();
    u.uDay.value = day;
    u.uSunset.value = sunset;
    u.uCloud.value = W.cloud;
    u.uTime.value = t;
    u.uWind.value = W.wind;
    u.uFlash.value = this.flash * 0.6;
    (u.uZenith.value as THREE.Color).copy(zen);
    (u.uHorizon.value as THREE.Color).copy(this.horizon);
    (u.uSunCol.value as THREE.Color).copy(this.sunColor);
    this.sky.position.copy(cam);

    // key light: sun by day, moon by night
    const moonUp = elev < -0.05;
    const dir = moonUp ? (u.uMoonDir.value as THREE.Vector3) : this.sunDir;
    this.sun.position.copy(this.sunCenter).addScaledVector(dir, 150);
    this.sun.target.position.copy(this.sunCenter);
    this.sun.color.copy(moonUp ? c(0x8ea6ff) : this.sunColor);
    this.sun.intensity = moonUp ? 0.35 * (1 - W.cloud * 0.6) : this.env.sunIntensity * 1.05 * THREE.MathUtils.smoothstep(elev, -0.05, 0.2) * (1 - W.cloud * 0.65);
    this.hemi.color.copy(this.horizon).lerp(zen, 0.4);
    this.hemi.groundColor.copy(c(this.env.hemiGround)).multiplyScalar(0.4 + day * 0.6);
    this.hemi.intensity = (0.32 + day * 0.85) * (indoorish ? 0.8 : 1) + this.flash * 2;

    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.horizon);
    fog.density = this.baseFogDensity * (1 + W.fog * 5 + W.rain * 1.4) + (this.night * 0.002);
    (this.scene.background as THREE.Color | null)?.copy?.(this.horizon);

    // rain streaks follow the camera, slanted by wind
    const mat = this.rain.material as THREE.LineBasicMaterial;
    mat.opacity = Math.min(0.32, W.rain * 0.35);
    this.rain.visible = W.rain > 0.03;
    if (this.rain.visible) {
      const n = this.rainPos.length / 6;
      const fall = 26 * dt, side = W.wind * 6 * dt;
      const active = Math.floor(n * Math.min(1, W.rain * 1.2));
      for (let i = 0; i < n; i++) {
        const k = i * 6;
        if (i >= active) {
          this.rainPos[k + 1] = this.rainPos[k + 4] = -1000;
          continue;
        }
        this.rainPos[k] += side;
        this.rainPos[k + 3] += side;
        this.rainPos[k + 1] -= fall;
        this.rainPos[k + 4] -= fall;
        if (this.rainPos[k + 1] < cam.y - 10 || Math.abs(this.rainPos[k] - cam.x) > 26 || Math.abs(this.rainPos[k + 2] - cam.z) > 26) this.resetDrop(i, cam, this.rainPos[k + 1] < -500);
        this.rainPos[k + 3] = this.rainPos[k] - W.wind * 0.25;
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  get timeOfDay() {
    return this.cur.time;
  }

  dispose() {
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.rain.geometry.dispose();
  }
}
