import { describe, expect, it } from 'vitest';
import { CollisionWorld, getMap, playerBox, pointInBox, STAND_HEIGHT, type MapId } from '../src';

describe.each(['iron', 'harbor', 'range'] as MapId[])('map %s', (id) => {
  const map = getMap(id);
  const world = new CollisionWorld(map.solids);
  const free = (p: { x: number; y: number; z: number }) => world.overlaps(playerBox(p.x, p.y + 0.05, p.z, STAND_HEIGHT)).length === 0;

  it('has collision-free spawn points inside their buy zones', () => {
    for (const s of map.attackSpawns) {
      expect(free(s), `attack spawn ${JSON.stringify(s)}`).toBe(true);
      expect(pointInBox({ x: s.x, y: 0.5, z: s.z }, map.attackZone)).toBe(true);
    }
    for (const s of map.defendSpawns) {
      expect(free(s), `defend spawn ${JSON.stringify(s)}`).toBe(true);
      expect(pointInBox({ x: s.x, y: 0.5, z: s.z }, map.defendZone)).toBe(true);
    }
    for (const s of map.tdmSpawns) expect(free(s), `tdm spawn ${JSON.stringify(s)}`).toBe(true);
  });

  it('has a floor everywhere players can stand', () => {
    for (const s of [...map.attackSpawns, ...map.defendSpawns]) expect(world.groundBelow({ x: s.x, y: 2, z: s.z })).toBeCloseTo(0, 3);
  });

  if (id !== 'range') {
    it('has two plant sites with open floor space', () => {
      expect(map.sites.length).toBe(2);
      for (const site of map.sites) expect(free(site.center), `site ${site.id} center`).toBe(true);
    });
  }
});
