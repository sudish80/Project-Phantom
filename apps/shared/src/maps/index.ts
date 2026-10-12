import type { MapId } from '../types';
import { buildIronDistrict } from './iron';
import { buildNeonHarbor } from './harbor';
import { buildRange } from './range';
import { buildFrontier } from './frontier';
import type { MapDef } from './types';

export * from './types';
export { MapBuilder, CONTAINER } from './builder';
export { STOREY } from './structures';

const cache = new Map<MapId, MapDef>();

export function getMap(id: MapId): MapDef {
  let m = cache.get(id);
  if (!m) {
    m = id === 'harbor' ? buildNeonHarbor() : id === 'range' ? buildRange() : id === 'frontier' ? buildFrontier() : buildIronDistrict();
    cache.set(id, m);
  }
  return m;
}

export const MAP_INFO: { id: Exclude<MapId, 'range'>; name: string; description: string }[] = [
  { id: 'iron', name: 'Iron District', description: 'Industrial foundry district. Three lanes, catwalks, covered corridors.' },
  { id: 'harbor', name: 'Neon Harbor', description: 'Night-time port. Container alleys, warehouse route, crane overwatch.' },
  { id: 'frontier', name: 'Frontier', description: 'Open world (1.2 km): city, villages, airfield, industry, harbour, forests, river & peaks.' },
];
