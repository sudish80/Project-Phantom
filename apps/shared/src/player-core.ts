import type { CollisionWorld } from './collision';
import { BTN } from './constants';
import { isSprinting, stepMovement, type MoveIntent, type MoveResult } from './movement';
import type { InputCmd, PlayerCore } from './types';
import { MELEE, WEAPONS, type WeaponDef, type WeaponId } from './weapons';

export interface CoreEnv {
  canFire: boolean;
  infiniteAmmo: boolean;
  speedMul: number;
  fireRateMul: number;
  reloadMul: number;
  /** freeze movement (e.g. while planting) */
  frozen?: boolean;
}

export interface CoreResult extends MoveResult {
  fired: boolean;
  /** recoil shot-count at the moment of firing (before this shot's kick) */
  recoilAtFire: number;
  dryFire: boolean;
  reloadStarted: boolean;
  switched: boolean;
  weapon: WeaponId;
}

export function weaponInSlot(p: PlayerCore, slot: number): WeaponId | null {
  if (slot === 1) return p.primary;
  if (slot === 2) return p.secondary;
  if (slot === 3) return MELEE;
  return null;
}

export function currentWeapon(p: PlayerCore): WeaponDef {
  return WEAPONS[weaponInSlot(p, p.slot) ?? MELEE];
}

export function ammoIndex(slot: number) {
  return (slot - 1) * 2;
}

export function bestSlot(p: PlayerCore): 1 | 2 | 3 {
  return p.primary ? 1 : p.secondary ? 2 : 3;
}

export function equipSlot(p: PlayerCore, slot: 1 | 2 | 3) {
  const w = WEAPONS[weaponInSlot(p, slot) ?? MELEE];
  p.slot = slot;
  p.equipT = w.equipTime;
  p.reloadT = 0;
  p.ads = false;
  p.recoil = 0;
}

export function giveWeapon(p: PlayerCore, id: WeaponId) {
  const w = WEAPONS[id];
  if (w.slot === 1) p.primary = id;
  else if (w.slot === 2) p.secondary = id;
  const i = ammoIndex(w.slot);
  p.ammo[i] = w.mag;
  p.ammo[i + 1] = w.reserve;
}

export function refillAmmo(p: PlayerCore) {
  for (const slot of [1, 2] as const) {
    const id = weaponInSlot(p, slot);
    if (!id) continue;
    p.ammo[ammoIndex(slot)] = WEAPONS[id].mag;
    p.ammo[ammoIndex(slot) + 1] = WEAPONS[id].reserve;
  }
}

export function intentFromCmd(cmd: InputCmd): MoveIntent {
  const clampAxis = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v || 0);
  return {
    fwd: clampAxis(cmd.f),
    right: clampAxis(cmd.r),
    yaw: cmd.y,
    jump: (cmd.b & BTN.JUMP) !== 0,
    crouch: (cmd.b & BTN.CROUCH) !== 0,
    walk: (cmd.b & BTN.WALK) !== 0,
    sprint: (cmd.b & BTN.SPRINT) !== 0,
    slide: (cmd.b & BTN.SLIDE) !== 0,
    leanLeft: (cmd.b & BTN.LEAN_LEFT) !== 0,
    leanRight: (cmd.b & BTN.LEAN_RIGHT) !== 0,
  };
}

/**
 * Advance one player by one input command: weapon switching, reloading, fire cadence,
 * recoil, ammunition and movement. Shared by server and client prediction so both agree.
 */
export function stepPlayerCore(p: PlayerCore, cmd: InputCmd, dt: number, world: CollisionWorld, env: CoreEnv): CoreResult {
  const res: CoreResult = {
    jumped: false, landed: false, landSpeed: 0, fired: false, recoilAtFire: 0, dryFire: false,
    reloadStarted: false, switched: false, weapon: weaponInSlot(p, p.slot) ?? MELEE,
  };
  const b = cmd.b;

  // Weapon switching.
  if ((cmd.sl === 1 || cmd.sl === 2 || cmd.sl === 3) && cmd.sl !== p.slot && weaponInSlot(p, cmd.sl)) {
    equipSlot(p, cmd.sl);
    res.switched = true;
  }
  if (!weaponInSlot(p, p.slot)) equipSlot(p, bestSlot(p));
  const w = currentWeapon(p);
  res.weapon = w.id;
  const ai = ammoIndex(w.slot);

  p.equipT = Math.max(0, p.equipT - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt * env.reloadMul;
    if (p.reloadT <= 0) {
      p.reloadT = 0;
      const need = w.mag - p.ammo[ai];
      const take = env.infiniteAmmo ? need : Math.min(need, p.ammo[ai + 1]);
      p.ammo[ai] += take;
      if (!env.infiniteAmmo) p.ammo[ai + 1] -= take;
    }
  }

  const intent = intentFromCmd(cmd);
  if (env.frozen) {
    intent.fwd = 0;
    intent.right = 0;
    intent.jump = false;
  }
  // Firing cancels a sprint and keeps it cancelled until the sprint key is released.
  const sprintHeld = (b & BTN.SPRINT) !== 0;
  // firing or aiming down sights both drop out of a sprint immediately
  if (b & (BTN.FIRE | BTN.ADS)) p.sprintBlocked = true;
  if (!sprintHeld) p.sprintBlocked = false;
  intent.sprint = sprintHeld && !p.sprintBlocked;
  // a slide can still be started with sprint held right after shooting (as long as we are fast)
  intent.sprintKey = sprintHeld;
  const sprinting = isSprinting(p, intent);

  const canReload = w.mag > 0 && p.reloadT <= 0 && p.ammo[ai] < w.mag && (p.ammo[ai + 1] > 0 || env.infiniteAmmo) && p.equipT <= 0;
  if ((b & BTN.RELOAD) && canReload) {
    p.reloadT = w.reloadTime;
    res.reloadStarted = true;
  }

  p.ads = !!(b & BTN.ADS) && !!w.ads && p.reloadT <= 0 && p.equipT <= 0 && !sprinting && p.slide <= 0;

  const speedMul = env.speedMul * w.moveMul * (p.ads && w.ads ? w.ads.moveMul : 1);
  const mv = stepMovement(p, intent, dt, world, speedMul);
  res.jumped = mv.jumped;
  res.landed = mv.landed;
  res.landSpeed = mv.landSpeed;

  const fireHeld = (b & BTN.FIRE) !== 0;
  const triggered = w.auto ? fireHeld : fireHeld && !p.prevFire;
  const ready = env.canFire && p.equipT <= 0 && p.fireCd <= 0 && p.reloadT <= 0 && !sprinting;
  if (triggered && ready) {
    if (w.mag === 0 || p.ammo[ai] > 0) {
      res.fired = true;
      res.recoilAtFire = p.recoil;
      if (w.mag > 0 && !env.infiniteAmmo) p.ammo[ai]--;
      p.fireCd = 1 / (w.fireRate * env.fireRateMul);
      p.recoil += 1;
    } else if (!p.prevFire) {
      res.dryFire = true;
    }
  }
  if (!res.fired && p.fireCd <= 0) p.recoil = Math.max(0, p.recoil - dt * w.recoil.recovery);

  // Automatic reload when the magazine runs dry.
  if (w.mag > 0 && p.ammo[ai] === 0 && p.reloadT <= 0 && p.fireCd <= 0 && (p.ammo[ai + 1] > 0 || env.infiniteAmmo) && p.equipT <= 0) {
    p.reloadT = w.reloadTime;
    res.reloadStarted = true;
  }
  p.prevFire = fireHeld;
  return res;
}

export function copyCore(from: PlayerCore, to: PlayerCore) {
  to.x = from.x; to.y = from.y; to.z = from.z;
  to.vx = from.vx; to.vy = from.vy; to.vz = from.vz;
  to.onGround = from.onGround; to.crouch = from.crouch; to.jumpCd = from.jumpCd;
  to.dash = from.dash; to.dashYaw = from.dashYaw;
  to.lean = from.lean; to.slide = from.slide; to.slideCd = from.slideCd; to.slideYaw = from.slideYaw;
  to.primary = from.primary; to.secondary = from.secondary; to.slot = from.slot;
  to.ammo = from.ammo.slice();
  to.equipT = from.equipT; to.reloadT = from.reloadT; to.fireCd = from.fireCd;
  to.recoil = from.recoil; to.prevFire = from.prevFire; to.ads = from.ads;
  to.sprintBlocked = from.sprintBlocked;
}

export function newCore(): PlayerCore {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: false, crouch: 0, jumpCd: 0, dash: 0, dashYaw: 0,
    lean: 0, slide: 0, slideCd: 0, slideYaw: 0,
    primary: null, secondary: 'wisp', slot: 2, ammo: [0, 0, WEAPONS.wisp.mag, WEAPONS.wisp.reserve, 0, 0],
    equipT: 0, reloadT: 0, fireCd: 0, recoil: 0, prevFire: false, ads: false, sprintBlocked: false,
  };
}
