import { describe, expect, it } from 'vitest';
import { BTN, CollisionWorld, getMap, INPUT_DT, newCore, RUN_SPEED, SPRINT_SPEED, stepPlayerCore, type CoreEnv } from '../src';
import { cmd } from './helpers';

const env: CoreEnv = { canFire: true, infiniteAmmo: false, speedMul: 1, fireRateMul: 1, reloadMul: 1 };
const world = new CollisionWorld(getMap('range').solids);
const view = { yaw: 0, pitch: 0 };
const speed = (p: { vx: number; vz: number }) => Math.hypot(p.vx, p.vz);

function sprinter() {
  const p = newCore();
  p.x = 0; p.z = 6; p.y = 0; p.onGround = true;
  p.primary = 'corsair'; p.slot = 1; p.ammo[0] = 30; p.ammo[1] = 90;
  for (let i = 0; i < 60; i++) stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT }), INPUT_DT, world, env);
  return p;
}

describe('sprint & slide', () => {
  it('reaches sprint speed', () => {
    expect(speed(sprinter())).toBeGreaterThan(SPRINT_SPEED - 0.5);
  });

  it('firing cancels the sprint immediately and the shot goes off', () => {
    const p = sprinter();
    const r = stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT | BTN.FIRE }), INPUT_DT, world, env);
    expect(r.fired).toBe(true);
    for (let i = 0; i < 10; i++) stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT }), INPUT_DT, world, env);
    expect(speed(p)).toBeLessThanOrEqual(RUN_SPEED + 0.05);
    // releasing and re-pressing sprint resumes it
    stepPlayerCore(p, cmd(view, { f: 1, b: 0 }), INPUT_DT, world, env);
    for (let i = 0; i < 30; i++) stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT }), INPUT_DT, world, env);
    expect(speed(p)).toBeGreaterThan(SPRINT_SPEED - 0.5);
  });

  it('aiming down sights cancels the sprint', () => {
    const p = sprinter();
    for (let i = 0; i < 10; i++) stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT | BTN.ADS }), INPUT_DT, world, env);
    expect(p.ads).toBe(true);
    expect(speed(p)).toBeLessThanOrEqual(RUN_SPEED * 0.8 + 0.05);
  });

  it('can slide right after shooting while sprint is held', () => {
    const p = sprinter();
    stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT | BTN.FIRE }), INPUT_DT, world, env);
    stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT | BTN.SLIDE }), INPUT_DT, world, env);
    expect(p.slide).toBeGreaterThan(0);
  });

  it('slide exit eases out instead of snapping to run speed', () => {
    const p = sprinter();
    stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT | BTN.SLIDE }), INPUT_DT, world, env);
    let steps = 0;
    while (p.slide > 0 && steps < 200) {
      stepPlayerCore(p, cmd(view, { f: 1, b: 0 }), INPUT_DT, world, env);
      steps++;
    }
    const exit = speed(p);
    stepPlayerCore(p, cmd(view, { f: 1, b: 0 }), INPUT_DT, world, env);
    // one step after the slide ends we lose at most ~0.25 m/s (no instant snap)
    expect(exit - speed(p)).toBeLessThan(0.3);
  });

  it('a slide ends when the player leaves the ground', () => {
    const p = sprinter();
    stepPlayerCore(p, cmd(view, { f: 1, b: BTN.SPRINT | BTN.SLIDE }), INPUT_DT, world, env);
    expect(p.slide).toBeGreaterThan(0);
    p.onGround = false;
    p.y = 3;
    stepPlayerCore(p, cmd(view, { f: 1, b: 0 }), INPUT_DT, world, env);
    expect(p.slide).toBe(0);
    expect(speed(p)).toBeGreaterThan(RUN_SPEED); // momentum kept
  });
});
