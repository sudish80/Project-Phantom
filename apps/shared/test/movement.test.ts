import { describe, expect, it } from 'vitest';
import { BTN, CollisionWorld, getMap, INPUT_DT, newCore, stepPlayerCore, type CoreEnv } from '../src';
import { cmd } from './helpers';

const env: CoreEnv = { canFire: true, infiniteAmmo: false, speedMul: 1, fireRateMul: 1, reloadMul: 1 };

describe('movement', () => {
  const world = new CollisionWorld(getMap('iron').solids);

  it('lands on the floor and stays grounded', () => {
    const p = newCore();
    p.y = 2;
    for (let i = 0; i < 120; i++) stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }), INPUT_DT, world, env);
    expect(p.onGround).toBe(true);
    expect(p.y).toBeCloseTo(0, 3);
  });

  it('cannot walk through a wall', () => {
    const p = newCore();
    // spawn south of the attacker wall segment at x in [-26,-6], z=-40 (thickness 0.6)
    p.x = -16; p.z = -45; p.y = 0; p.onGround = true;
    // yaw PI looks towards +Z
    for (let i = 0; i < 300; i++) stepPlayerCore(p, cmd({ yaw: Math.PI, pitch: 0 }, { f: 1 }), INPUT_DT, world, env);
    expect(p.z).toBeLessThan(-40.3);
  });

  it('jumps once and cannot jump in mid-air', () => {
    const p = newCore();
    p.x = 0; p.z = -48; p.y = 0; p.onGround = true;
    stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }, { b: BTN.JUMP }), INPUT_DT, world, env);
    expect(p.vy).toBeGreaterThan(0);
    let maxY = 0;
    for (let i = 0; i < 20; i++) {
      stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }, { b: BTN.JUMP }), INPUT_DT, world, env);
      maxY = Math.max(maxY, p.y);
    }
    expect(maxY).toBeLessThan(1.3);
    for (let i = 0; i < 120; i++) stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }), INPUT_DT, world, env);
    expect(p.onGround).toBe(true);
  });

  it('climbs the A catwalk stairs', () => {
    const p = newCore();
    p.x = -42.5; p.z = -31; p.y = 0; p.onGround = true;
    for (let i = 0; i < 240; i++) stepPlayerCore(p, cmd({ yaw: Math.PI, pitch: 0 }, { f: 1 }), INPUT_DT, world, env);
    expect(p.y).toBeGreaterThan(2.9);
    expect(p.z).toBeGreaterThan(-24);
  });

  it('leans left/right and returns to neutral, cancelling when both are held', () => {
    const p = newCore();
    p.x = 0; p.z = -48; p.y = 0; p.onGround = true;
    for (let i = 0; i < 30; i++) stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }, { b: BTN.LEAN_LEFT }), INPUT_DT, world, env);
    expect(p.lean).toBeLessThan(-0.9);
    // releasing returns to neutral
    for (let i = 0; i < 30; i++) stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }), INPUT_DT, world, env);
    expect(Math.abs(p.lean)).toBeLessThan(0.05);
    // both held -> neutral
    for (let i = 0; i < 30; i++) stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }, { b: BTN.LEAN_RIGHT }), INPUT_DT, world, env);
    expect(p.lean).toBeGreaterThan(0.9);
    for (let i = 0; i < 30; i++) stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }, { b: BTN.LEAN_LEFT | BTN.LEAN_RIGHT }), INPUT_DT, world, env);
    expect(Math.abs(p.lean)).toBeLessThan(0.05);
  });

  it('cancels a lean into a nearby wall so the eye never enters geometry', () => {
    const p = newCore();
    // stand beside the z=-40 wall with the wall face directly to the right
    p.x = -16; p.z = -39.3; p.y = 0; p.onGround = true;
    for (let i = 0; i < 40; i++) stepPlayerCore(p, cmd({ yaw: Math.PI / 2, pitch: 0 }, { b: BTN.LEAN_RIGHT }), INPUT_DT, world, env);
    expect(Math.abs(p.lean)).toBeLessThan(0.15);
  });

  it('slides only from a sprint, preserves momentum, slows and respects cooldown', () => {
    const p = newCore();
    p.x = 0; p.z = -48; p.y = 0; p.onGround = true;
    // yaw PI faces +Z up the long open mid lane
    const F = { yaw: Math.PI, pitch: 0 };
    // a run (no sprint) at ~5.4 m/s must not slide even above the min speed
    for (let i = 0; i < 60; i++) stepPlayerCore(p, cmd(F, { f: 1 }), INPUT_DT, world, env);
    stepPlayerCore(p, cmd(F, { f: 1, b: BTN.SLIDE }), INPUT_DT, world, env);
    expect(p.slide).toBe(0);
    // now sprint up to speed and slide
    for (let i = 0; i < 60; i++) stepPlayerCore(p, cmd(F, { f: 1, b: BTN.SPRINT }), INPUT_DT, world, env);
    const before = Math.hypot(p.vx, p.vz);
    expect(before).toBeGreaterThan(6);
    stepPlayerCore(p, cmd(F, { f: 1, b: BTN.SPRINT | BTN.SLIDE }), INPUT_DT, world, env);
    expect(p.slide).toBeGreaterThan(0);
    expect(p.slideCd).toBeGreaterThan(0);
    // momentum bleeds off over the slide
    for (let i = 0; i < 25; i++) stepPlayerCore(p, cmd(F, { f: 1, b: BTN.SPRINT }), INPUT_DT, world, env);
    expect(Math.hypot(p.vx, p.vz)).toBeLessThan(before);
    // immediately re-pressing does nothing until the cooldown elapses
    for (let i = 0; i < 30; i++) stepPlayerCore(p, cmd(F, { f: 1, b: BTN.SPRINT }), INPUT_DT, world, env);
    stepPlayerCore(p, cmd(F, { f: 1, b: BTN.SPRINT | BTN.SLIDE }), INPUT_DT, world, env);
    expect(p.slide).toBe(0);
  });

  it('applies fire rate and ammunition limits', () => {
    const p = newCore();
    p.x = 0; p.z = -48; p.y = 0; p.onGround = true;
    let shots = 0;
    // Wisp is semi-auto: alternating press/release every input for 2 seconds
    for (let i = 0; i < 120; i++) {
      const r = stepPlayerCore(p, cmd({ yaw: 0, pitch: 0 }, { b: i % 2 === 0 ? BTN.FIRE : 0 }), INPUT_DT, world, env);
      if (r.fired) shots++;
    }
    // 6.75 rounds/sec max over 2s => at most 14, magazine 12
    expect(shots).toBeLessThanOrEqual(12);
    expect(shots).toBeGreaterThan(8);
  });
});
