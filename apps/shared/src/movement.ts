import type { Box, CollisionWorld } from './collision';
import {
  AIR_ACCEL, CROUCH_EYE, CROUCH_HEIGHT, CROUCH_RATE, CROUCH_SPEED, DASH_SPEED, GRAVITY, GROUND_ACCEL, GROUND_DECEL,
  JUMP_COOLDOWN, JUMP_VELOCITY, LEAN_OFFSET, LEAN_PROBE, LEAN_RATE, MAX_FALL_SPEED, PLAYER_RADIUS, RUN_SPEED,
  SLIDE_BOOST, SLIDE_COOLDOWN, SLIDE_END_SPEED, SLIDE_FRICTION, SLIDE_MIN_SPEED, SLIDE_STEER_RATE, SLIDE_TIME, SPRINT_SPEED,
  STAND_EYE, STAND_HEIGHT, STEP_HEIGHT, WALK_SPEED,
} from './constants';

export interface MoveState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  crouch: number;
  jumpCd: number;
  dash: number;
  dashYaw: number;
  /** optional so lightweight unit-test states stay valid */
  lean?: number;
  slide?: number;
  slideCd?: number;
  slideYaw?: number;
}

export interface MoveIntent {
  fwd: number;
  right: number;
  yaw: number;
  jump: boolean;
  crouch: boolean;
  walk: boolean;
  sprint: boolean;
  /** raw sprint key (ignores the fire/ADS sprint block) — used to allow slide entry */
  sprintKey?: boolean;
  slide?: boolean;
  leanLeft?: boolean;
  leanRight?: boolean;
}

export interface MoveResult {
  jumped: boolean;
  landed: boolean;
  landSpeed: number;
}

export const heightFor = (crouch: number) => STAND_HEIGHT + (CROUCH_HEIGHT - STAND_HEIGHT) * crouch;
export const eyeFor = (crouch: number) => STAND_EYE + (CROUCH_EYE - STAND_EYE) * crouch;

export function playerBox(x: number, y: number, z: number, h: number, r = PLAYER_RADIUS): Box {
  return { minX: x - r, minY: y, minZ: z - r, maxX: x + r, maxY: y + h, maxZ: z + r };
}

export function isSprinting(s: MoveState, m: MoveIntent) {
  return m.sprint && m.fwd > 0 && s.crouch < 0.5 && !m.walk;
}

/** World-space lateral eye offset produced by a peek lean of `lean` at heading `yaw`. */
export function leanOffset(lean: number, yaw: number): { x: number; z: number } {
  const o = LEAN_OFFSET * lean;
  return { x: Math.cos(yaw) * o, z: -Math.sin(yaw) * o };
}

/**
 * Largest lean magnitude (0..1) whose offset head volume stays clear of solid geometry.
 * Cancels the lean when a wall blocks the peek so the camera never enters a wall.
 */
function clearLean(s: MoveState, lean: number, yaw: number, world: CollisionWorld): number {
  if (lean === 0) return 0;
  const headY = s.y + eyeFor(s.crouch);
  for (const mul of [1, 0.5, 0]) {
    const l = lean * mul;
    const o = leanOffset(l, yaw);
    const probe: Box = {
      minX: s.x + o.x - LEAN_PROBE, maxX: s.x + o.x + LEAN_PROBE,
      minY: headY - 0.22, maxY: headY + 0.22,
      minZ: s.z + o.z - LEAN_PROBE, maxZ: s.z + o.z + LEAN_PROBE,
    };
    if (world.overlaps(probe).length === 0) return l;
  }
  return 0;
}

/**
 * Deterministic character controller (axis-separated AABB sweep with step-up and
 * ground snapping). Run identically on server (authority) and client (prediction).
 */
export function stepMovement(s: MoveState, m: MoveIntent, dt: number, world: CollisionWorld, speedMul = 1): MoveResult {
  const res: MoveResult = { jumped: false, landed: false, landSpeed: 0 };
  if (s.lean === undefined) s.lean = 0;
  if (s.slide === undefined) s.slide = 0;
  if (s.slideCd === undefined) s.slideCd = 0;
  if (s.slideYaw === undefined) s.slideYaw = 0;
  s.jumpCd = Math.max(0, s.jumpCd - dt);
  if (s.slideCd > 0) s.slideCd = Math.max(0, s.slideCd - dt);

  // Slide: only from a full sprint, on the ground, off cooldown.
  const slideReady = (m.sprintKey ?? m.sprint) && m.fwd > 0 && s.crouch < 0.5 && !m.walk;
  if (m.slide && s.slide <= 0 && s.slideCd <= 0 && s.onGround && slideReady && Math.hypot(s.vx, s.vz) >= SLIDE_MIN_SPEED * 0.85) {
    // kick the entry speed up a touch and align the slide with where we are facing
    const kick = Math.min(Math.hypot(s.vx, s.vz) * SLIDE_BOOST, SPRINT_SPEED * 1.25);
    s.vx = -Math.sin(m.yaw) * kick;
    s.vz = -Math.cos(m.yaw) * kick;
    s.slide = SLIDE_TIME;
    s.slideYaw = m.yaw;
    s.slideCd = SLIDE_TIME + SLIDE_COOLDOWN;
  }

  // Crouch transition (a slide forces the body low; standing up requires headroom).
  if (m.crouch || s.slide > 0) s.crouch = Math.min(1, s.crouch + dt * CROUCH_RATE);
  else if (s.crouch > 0) {
    const next = Math.max(0, s.crouch - dt * CROUCH_RATE);
    if (world.overlaps(playerBox(s.x, s.y + 0.01, s.z, heightFor(next) - 0.01)).length === 0) s.crouch = next;
  }

  // Peek lean: hold Q / E, both or neither returns to neutral. Cancel into walls.
  const leanTarget = (m.leanRight ? 1 : 0) - (m.leanLeft ? 1 : 0);
  const leanGoal = leanTarget === 0 ? 0 : clearLean(s, leanTarget, m.yaw, world);
  s.lean += Math.max(-dt * LEAN_RATE, Math.min(dt * LEAN_RATE, leanGoal - s.lean));

  // Desired horizontal velocity.
  const sy = Math.sin(m.yaw), cy = Math.cos(m.yaw);
  let wx = -sy * m.fwd + cy * m.right;
  let wz = -cy * m.fwd - sy * m.right;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) {
    wx /= wl;
    wz /= wl;
  }
  let max = RUN_SPEED;
  if (s.crouch > 0.5) max = CROUCH_SPEED;
  else if (m.walk) max = WALK_SPEED;
  else if (isSprinting(s, m)) max = SPRINT_SPEED;
  max *= speedMul;

  // Sliding off a ledge: the slide ends and the body keeps its momentum as a normal fall.
  if (s.slide > 0 && !s.onGround) s.slide = 0;

  if (s.slide > 0) {
    // Keep the entry momentum, bleed it off with friction and allow limited steering.
    s.slide = Math.max(0, s.slide - dt);
    if (wl > 0.01) {
      const desired = Math.atan2(-wx, -wz);
      let d = desired - s.slideYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.slideYaw += Math.max(-SLIDE_STEER_RATE * dt, Math.min(SLIDE_STEER_RATE * dt, d));
    }
    let sp = Math.hypot(s.vx, s.vz) - SLIDE_FRICTION * dt;
    // terrain slope: gravity pulls you faster downhill and slows you uphill
    if (world.terrain) {
      const fx = -Math.sin(s.slideYaw), fz = -Math.cos(s.slideYaw);
      const rise = world.terrain.heightAt(s.x + fx * 0.6, s.z + fz * 0.6) - world.terrain.heightAt(s.x - fx * 0.6, s.z - fz * 0.6);
      const grade = Math.max(-1, Math.min(1, rise / 1.2));
      sp -= GRAVITY * 0.55 * grade * dt;
      if (grade < -0.08) s.slide = Math.max(s.slide, 0.15); // keep sliding while going downhill
      sp = Math.min(sp, SPRINT_SPEED * 1.9);
    }
    if (s.slide <= 0 || sp <= SLIDE_END_SPEED) {
      s.slide = 0;
      sp = Math.max(0, sp);
    }
    s.vx = -Math.sin(s.slideYaw) * sp;
    s.vz = -Math.cos(s.slideYaw) * sp;
  } else if (s.dash > 0) {
    s.dash = Math.max(0, s.dash - dt);
    s.vx = -Math.sin(s.dashYaw) * DASH_SPEED;
    s.vz = -Math.cos(s.dashYaw) * DASH_SPEED;
    if (s.dash === 0) {
      s.vx *= RUN_SPEED / DASH_SPEED;
      s.vz *= RUN_SPEED / DASH_SPEED;
    }
  } else if (s.onGround) {
    let accel = (wl > 0.01 ? GROUND_ACCEL : GROUND_DECEL) * dt;
    // momentum carry: above the target speed while still pushing the same way (slide exit,
    // slide-jump landing) bleed speed off gently instead of snapping back to run speed
    const cur = Math.hypot(s.vx, s.vz);
    if (cur > max + 0.2 && wl > 0.01 && (s.vx * wx + s.vz * wz) / (cur || 1) > 0.7) accel = 14 * dt;
    const dx = wx * max - s.vx, dz = wz * max - s.vz;
    const dl = Math.hypot(dx, dz);
    if (dl <= accel) {
      s.vx = wx * max;
      s.vz = wz * max;
    } else {
      s.vx += (dx / dl) * accel;
      s.vz += (dz / dl) * accel;
    }
  } else if (wl > 0.01) {
    const cur = Math.hypot(s.vx, s.vz);
    const cap = Math.max(cur, max);
    s.vx += wx * AIR_ACCEL * dt;
    s.vz += wz * AIR_ACCEL * dt;
    const nl = Math.hypot(s.vx, s.vz);
    if (nl > cap) {
      s.vx *= cap / nl;
      s.vz *= cap / nl;
    }
  }

  if (m.jump && s.onGround && s.jumpCd <= 0 && s.dash <= 0) {
    s.vy = JUMP_VELOCITY;
    s.onGround = false;
    s.jumpCd = JUMP_COOLDOWN;
    s.slide = 0; // slide-jump: keep horizontal momentum, stand the pose up
    res.jumped = true;
  }

  s.vy = Math.max(-MAX_FALL_SPEED, s.vy - GRAVITY * dt);
  const h = heightFor(s.crouch);
  const wasGround = s.onGround;

  moveAxis(s, 'x', s.vx * dt, h, world, wasGround);
  moveAxis(s, 'z', s.vz * dt, h, world, wasGround);

  const preVy = s.vy;
  s.y += s.vy * dt;
  const hits = world.overlaps(playerBox(s.x, s.y, s.z, h));
  s.onGround = false;
  if (hits.length) {
    if (s.vy <= 0) {
      let top = -Infinity;
      for (const b of hits) top = Math.max(top, b.maxY);
      s.y = top;
      s.vy = 0;
      s.onGround = true;
    } else {
      let bottom = Infinity;
      for (const b of hits) bottom = Math.min(bottom, b.minY);
      s.y = bottom - h - 0.001;
      s.vy = 0;
    }
  } else if (wasGround && !res.jumped && s.vy <= 0) {
    // Snap down small drops (stairs) so we stay grounded.
    const probe = world.overlaps(playerBox(s.x, s.y - STEP_HEIGHT, s.z, h));
    if (probe.length) {
      let top = -Infinity;
      for (const b of probe) top = Math.max(top, b.maxY);
      if (top <= s.y + 0.001 && top > s.y - STEP_HEIGHT - 0.01 && !world.overlaps(playerBox(s.x, top, s.z, h)).length) {
        s.y = top;
        s.vy = 0;
        s.onGround = true;
      }
    }
  }
  if (!wasGround && s.onGround) {
    res.landed = true;
    res.landSpeed = -preVy;
  }
  return res;
}

/** Max climbable terrain slope (rise per metre of horizontal travel) — steeper terrain acts as a cliff. */
const TERRAIN_MAX_SLOPE = 1.3;

function moveAxis(s: MoveState, axis: 'x' | 'z', d: number, h: number, world: CollisionWorld, grounded: boolean) {
  if (d === 0) return;
  if (axis === 'x') s.x += d;
  else s.z += d;
  const hits = world.overlaps(playerBox(s.x, s.y, s.z, h));
  if (!hits.length) return;
  const solids = hits.filter((b) => !b.terrain);
  const terrain = hits.find((b) => b.terrain);
  if (!solids.length && terrain) {
    // walking on the heightfield: follow gentle slopes, stop at cliffs
    const rise = terrain.maxY - s.y;
    if (rise <= Math.abs(d) * TERRAIN_MAX_SLOPE + 0.02 && !world.overlaps(playerBox(s.x, terrain.maxY + 0.001, s.z, h)).some((b) => !b.terrain)) {
      s.y = terrain.maxY + 0.001;
      return;
    }
    if (axis === 'x') {
      s.x -= d;
      s.vx = 0;
    } else {
      s.z -= d;
      s.vz = 0;
    }
    return;
  }
  if (grounded) {
    let top = -Infinity;
    for (const b of hits) top = Math.max(top, b.maxY);
    const rise = top - s.y;
    if (rise > 0 && rise <= STEP_HEIGHT && !world.overlaps(playerBox(s.x, top + 0.001, s.z, h)).length) {
      s.y = top + 0.001;
      return;
    }
  }
  const r = PLAYER_RADIUS;
  if (axis === 'x') {
    if (d > 0) {
      let m = Infinity;
      for (const b of solids) m = Math.min(m, b.minX);
      s.x = m - r - 0.001;
    } else {
      let m = -Infinity;
      for (const b of solids) m = Math.max(m, b.maxX);
      s.x = m + r + 0.001;
    }
    s.vx = 0;
  } else {
    if (d > 0) {
      let m = Infinity;
      for (const b of solids) m = Math.min(m, b.minZ);
      s.z = m - r - 0.001;
    } else {
      let m = -Infinity;
      for (const b of solids) m = Math.max(m, b.maxZ);
      s.z = m + r + 0.001;
    }
    s.vz = 0;
  }
  // pushed out of a solid: make sure we are not now inside the terrain
  const t = world.terrain;
  if (t) {
    const top = t.maxIn(s.x - r, s.z - r, s.x + r, s.z + r);
    if (s.y < top) s.y = top + 0.001;
  }
}
