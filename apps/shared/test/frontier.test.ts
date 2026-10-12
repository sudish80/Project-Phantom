import { describe, expect, it } from 'vitest';
import { BTN, CollisionWorld, getMap, INPUT_DT, Match, newCore, ROYALE, stepPlayerCore, TICK_RATE, type CoreEnv } from '../src';
import { cmd, place, run } from './helpers';

const env: CoreEnv = { canFire: true, infiniteAmmo: false, speedMul: 1, fireRateMul: 1, reloadMul: 1 };

describe('frontier open world', () => {
  const map = getMap('frontier');
  const w = map.world!;
  const world = new CollisionWorld(map.solids, w.terrain);

  it('generates deterministic terrain, vegetation, buildings and points of interest', () => {
    expect(w.terrain.n).toBe(321);
    expect(w.trees.length / 6).toBeGreaterThan(2000);
    expect(w.pois.length).toBeGreaterThan(10);
    expect(w.lootSpots.length).toBeGreaterThan(100);
    expect(w.roads.length).toBeGreaterThan(8);
    // mountains in the north are much higher than the coast in the south-east
    const peak = Math.max(...[...Array(50)].map((_, i) => w.terrain.heightAt(-200 + i * 8, 420)));
    expect(peak).toBeGreaterThan(60);
    expect(w.terrain.heightAt(500, -500)).toBeLessThan(0.5);
  });

  it('lets players walk over gentle terrain but not up cliffs', () => {
    const p = newCore();
    p.x = -380; p.z = 100; p.y = w.terrain.heightAt(p.x, p.z) + 0.2;
    for (let i = 0; i < 60; i++) stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }), INPUT_DT, world, env);
    expect(p.onGround).toBe(true);
    expect(Math.abs(p.y - w.terrain.heightAt(p.x, p.z))).toBeLessThan(0.2);
    const x0 = p.x, z0 = p.z;
    for (let i = 0; i < 240; i++) stepPlayerCore(p, cmd({ yaw: Math.PI / 2, pitch: 0 }, { f: 1 }), INPUT_DT, world, env);
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeGreaterThan(5);
    expect(p.y).toBeGreaterThanOrEqual(w.terrain.heightAt(p.x, p.z) - 0.05);
  });

  it('bullets hit terrain', () => {
    const o = { x: 0, y: w.terrain.heightAt(0, 300) + 1.6, z: 300 };
    const hit = world.raycast(o, { x: 0, y: -0.3, z: 0.954 }, 200);
    expect(hit).toBeTruthy();
    expect(hit!.solid.mat === 'terrain' || hit!.solid.hidden).toBe(true);
  });

  it('city spawn points are clear and grounded', () => {
    for (const s of map.tdmSpawns) {
      const g = world.groundBelow({ x: s.x, y: s.y + 2, z: s.z });
      expect(g).not.toBeNull();
      expect(Math.abs(g! - s.y)).toBeLessThan(1);
    }
  });
});

describe('royale mode', () => {
  it('spawns squads at drop points, hands out loot and shrinks the zone', () => {
    const m = new Match({ mode: 'royale', map: 'frontier', seed: 9 });
    const a = m.addPlayer('a', 'A', 'alpha', 'vanguard');
    const b = m.addPlayer('b', 'B', 'bravo', 'medic');
    expect(m.state.phase).toBe('buy');
    expect(a.alive && b.alive).toBe(true);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(100);
    expect(m.loot.size).toBeGreaterThan(80);
    expect(m.buy('a', 'corsair').ok).toBe(false);
    // pick up a weapon placed at the player's feet
    m.dropLoot('lancer', a.x, a.y, a.z);
    run(m, 1, (p) => (p === a ? { b: BTN.USE } : {}));
    expect(a.primary).toBe('lancer');
    run(m, TICK_RATE * (ROYALE.warmup + 1), () => ({}));
    expect(m.state.phase).toBe('live');
    const z = m.state.zone!;
    expect(z.nextR).toBe(ROYALE.stages[0].radius);
    // stand far outside the next zone; after the first shrink the zone hurts
    run(m, TICK_RATE * (ROYALE.stages[0].wait + ROYALE.stages[0].shrink + 2), () => ({}));
    expect(m.state.zone!.r).toBeCloseTo(ROYALE.stages[0].radius, 0);
    const hp = b.hp;
    place(b, m.state.zone!.cx + 500, m.state.zone!.cz);
    b.y = m.groundY(b.x, b.z);
    run(m, TICK_RATE * 3, () => ({}));
    expect(b.hp).toBeLessThan(hp);
    // eliminating the other squad ends the match
    b.primary = 'hornet';
    m.killPlayer(b, a, 'lancer', false);
    run(m, 2, () => ({}));
    expect(m.state.phase).toBe('matchEnd');
    expect(m.result?.winner).toBe('alpha');
    expect([...m.loot.values()].some((l) => Math.hypot(l.x - b.x, l.z - b.z) < 2)).toBe(true);
  });

  it('synchronises time of day and weather', () => {
    const m = new Match({ mode: 'tdm', map: 'iron', timeOfDay: 'night', weather: 'storm' });
    expect(m.state.env.time).toBe(23);
    expect(m.state.env.weather).toBe('storm');
    const c = new Match({ mode: 'tdm', map: 'iron', timeOfDay: 'cycle' });
    const t0 = c.state.env.time;
    run(c, TICK_RATE * 60, () => ({}));
    expect((c.state.env.time - t0 + 24) % 24).toBeCloseTo(1, 1);
  });
});
