import type { Box, Solid } from '../collision';
import type { Heightfield } from '../terrain';
import type { MapId, SurfaceMat, TimeOfDay, Vec3, WeatherKind } from '../types';

export type PropKind =
  | 'car' | 'truck' | 'bench' | 'bin' | 'dumpster' | 'utilityBox' | 'trafficLight' | 'busStop' | 'billboard' | 'streetLight'
  | 'waterTank' | 'acUnit' | 'antenna' | 'dish' | 'chimney' | 'beacon' | 'barrel' | 'storageTank' | 'smokestack' | 'pylon'
  | 'crane' | 'pallet' | 'well' | 'fence' | 'umbrella' | 'boat' | 'plane' | 'wreck' | 'radar' | 'lighthouse' | 'waterfall'
  | 'utilityPole' | 'laundry' | 'curtain' | 'conveyor' | 'guardTower' | 'sign' | 'rock' | 'log' | 'bush' | 'haybale' | 'cone';

export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number;
  /** colour / variant seed */
  v?: number;
}

export type TreeKind = 0 | 1 | 2 | 3 | 4; // pine, broadleaf, palm, dead, sapling

export interface RoadDef {
  pts: { x: number; y: number; z: number; bridge?: boolean }[];
  width: number;
  kind: 'highway' | 'asphalt' | 'dirt';
}

export interface Poi {
  name: string;
  x: number;
  z: number;
  kind: 'city' | 'village' | 'industrial' | 'airport' | 'military' | 'harbor' | 'nature' | 'landmark';
}

export interface WorldData {
  terrain: Heightfield;
  /** per terrain sample: 0 none, 1 asphalt, 2 dirt, 3 sidewalk/concrete */
  roadMask: Uint8Array;
  /** per terrain sample: 0..255 proximity to fresh water (mud) */
  wetMask: Uint8Array;
  /** per terrain sample: 0..255 beach sand */
  sandMask: Uint8Array;
  oceanLevel: number;
  /** coast coordinate function parameters: ocean where (x - z) * 0.7071 + noise > coast */
  coast: number;
  lakes: { x: number; z: number; r: number; level: number }[];
  river: { x: number; z: number; level: number; width: number }[];
  roads: RoadDef[];
  /** packed [x, y, z, scale, rot, kind] */
  trees: Float32Array;
  props: Prop[];
  pois: Poi[];
  /** positions of lamps / interior lights (client assigns a pool of real lights to the nearest) */
  lamps: Vec3[];
  lootSpots: Vec3[];
  royaleDrops: Vec3[];
  /** boundary half-size of the playable area */
  half: number;
  seed: number;
}

export type Facing = 'x+' | 'x-' | 'z+' | 'z-';

export type Decor =
  | { kind: 'light'; x: number; y: number; z: number; color: number; intensity: number; distance: number }
  | { kind: 'neon'; x: number; y: number; z: number; w: number; h: number; color: number; facing: Facing; text?: string }
  | { kind: 'fan'; x: number; y: number; z: number; r: number; speed: number }
  | { kind: 'pipe'; x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; r: number; color: number }
  | { kind: 'lamp'; x: number; z: number; h: number; color: number }
  | { kind: 'water'; x1: number; z1: number; x2: number; z2: number; y: number }
  | { kind: 'siteMarker'; site: string; x: number; y: number; z: number }
  | { kind: 'beacon'; x: number; y: number; z: number; color: number }
  | { kind: 'crane'; x: number; z: number; h: number; yaw: number }
  | { kind: 'rangeMarker'; x: number; z: number; text: string }
  | { kind: 'runway'; x1: number; z1: number; x2: number; z2: number; y: number };

export interface SiteDef {
  id: string;
  zone: Box;
  center: Vec3;
}

export interface TargetDef {
  x: number;
  z: number;
  /** half-width of horizontal patrol (0 = stationary) */
  patrol: number;
  crouch?: boolean;
}

export interface MapEnv {
  skyTop: number;
  skyBottom: number;
  fog: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  sunDir: Vec3;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  wet: boolean;
  /** default hour of day and weather when the room uses the map's defaults */
  time: number;
  weather: WeatherKind;
  /** default time-of-day mode */
  timeMode?: TimeOfDay;
  dynamicWeather?: boolean;
}

export interface MapDef {
  id: MapId;
  name: string;
  description: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  solids: Solid[];
  spawnBarriers: Solid[];
  attackSpawns: Vec3[];
  defendSpawns: Vec3[];
  attackYaw: number;
  defendYaw: number;
  attackZone: Box;
  defendZone: Box;
  sites: SiteDef[];
  tdmSpawns: { x: number; y: number; z: number; yaw: number }[];
  decor: Decor[];
  env: MapEnv;
  targets?: TargetDef[];
  materials: SurfaceMat[];
  /** open-world data (terrain, vegetation, roads…) */
  world?: WorldData;
}
