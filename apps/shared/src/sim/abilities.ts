import { CHARACTERS } from '../characters';
import { dirFromAngles, type Vec3 } from '../math';
import type { Match, SimPlayer } from './match';

/** Point where the player's crosshair meets the world (clamped to `range`), projected to the floor. */
function aimGroundPoint(m: Match, p: SimPlayer, range: number): Vec3 {
  const o = m.eye(p);
  const d = dirFromAngles(p.yaw, p.pitch);
  const hit = m.world.raycast(o, d, range);
  const t = hit ? Math.max(0, hit.t - 0.3) : range;
  const pt = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
  const g = m.world.groundBelow({ x: pt.x, y: pt.y + 0.2, z: pt.z }, 60);
  return { x: pt.x, y: g ?? p.y, z: pt.z };
}

function forwardGround(m: Match, p: SimPlayer, dist: number): Vec3 {
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const o = { x: p.x, y: p.y + 0.6, z: p.z };
  const hit = m.world.raycast(o, { x: fx, y: 0, z: fz }, dist);
  const d = hit ? Math.max(0, hit.t - 0.5) : dist;
  const pt = { x: p.x + fx * d, y: p.y + 1, z: p.z + fz * d };
  const g = m.world.groundBelow(pt, 20);
  return { x: pt.x, y: g ?? p.y, z: pt.z };
}

type Impl = (m: Match, p: SimPlayer) => boolean;

const IMPLS: Record<string, Impl> = {
  surge(_m, p) {
    const f = p.lastMove.f, r = p.lastMove.r;
    if (Math.abs(f) + Math.abs(r) > 0.1) {
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      const wx = -sy * f + cy * r;
      const wz = -cy * f - sy * r;
      p.dashYaw = Math.atan2(-wx, -wz);
    } else p.dashYaw = p.yaw;
    p.dash = 0.22;
    return true;
  },
  veil(m, p) {
    const pt = aimGroundPoint(m, p, 30);
    m.spawnEntity({ type: 'smoke', team: p.team, owner: p.id, x: pt.x, y: pt.y, z: pt.z, yaw: 0, hp: 1, maxHp: 1, t: 14, r: 4.5 });
    return true;
  },
  overdrive(_m, p) {
    p.fx.overdrive = 8;
    return true;
  },
  seeker(m, p) {
    const o = m.eye(p);
    const d = dirFromAngles(p.yaw, p.pitch);
    const hit = m.world.raycast(o, d, 15);
    let pos: Vec3;
    if (hit) pos = { x: hit.point.x + hit.normal.x * 0.2, y: hit.point.y + hit.normal.y * 0.2, z: hit.point.z + hit.normal.z * 0.2 };
    else {
      const g = m.world.groundBelow({ x: o.x + d.x * 15, y: o.y + d.y * 15, z: o.z + d.z * 15 }, 40);
      pos = { x: o.x + d.x * 15, y: (g ?? p.y) + 0.2, z: o.z + d.z * 15 };
    }
    m.spawnEntity({ type: 'scanner', team: p.team, owner: p.id, x: pos.x, y: pos.y, z: pos.z, yaw: p.yaw, hp: 40, maxHp: 40, t: 15.5, r: 14, pulses: 5, nextPulse: 0.6 });
    return true;
  },
  echo(_m, p) {
    p.fx.echo = 6;
    return true;
  },
  decoy(m, p) {
    m.spawnEntity({
      type: 'decoy', team: p.team, owner: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: 60, maxHp: 60, t: 5, r: 0, ch: p.character, moving: true,
      move: { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: 0, vz: p.vz, onGround: true, crouch: 0, jumpCd: 0, dash: 0, dashYaw: 0 },
    });
    return true;
  },
  overwatch(_m, p) {
    p.owPulses = 3;
    p.owTimer = 0;
    return true;
  },
  barrier(m, p) {
    const pt = forwardGround(m, p, 3);
    const alongX = Math.abs(Math.cos(p.yaw)) >= Math.abs(Math.sin(p.yaw));
    const hx = alongX ? 3 : 0.3, hz = alongX ? 0.3 : 3, hy = 1.6;
    if (!m.footprintFree({ minX: pt.x - hx, maxX: pt.x + hx, minY: pt.y, maxY: pt.y + hy * 2, minZ: pt.z - hz, maxZ: pt.z + hz })) return false;
    m.spawnEntity({ type: 'barrier', team: p.team, owner: p.id, x: pt.x, y: pt.y, z: pt.z, yaw: alongX ? 0 : Math.PI / 2, hp: 800, maxHp: 800, t: 25, r: 0, hx, hy, hz });
    return true;
  },
  caltrops(m, p) {
    const pt = aimGroundPoint(m, p, 18);
    m.spawnEntity({ type: 'caltrops', team: p.team, owner: p.id, x: pt.x, y: pt.y, z: pt.z, yaw: 0, hp: 1, maxHp: 1, t: 7, r: 3.5 });
    return true;
  },
  reinforce(m, p) {
    for (const q of m.players.values()) {
      if (!q.alive || q.team !== p.team) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) <= 7) {
        q.shield = Math.max(q.shield, 30);
        q.fx.shieldT = 15;
      }
    }
    return true;
  },
  sentry(m, p) {
    const pt = forwardGround(m, p, 2);
    m.spawnEntity({ type: 'turret', team: p.team, owner: p.id, x: pt.x, y: pt.y, z: pt.z, yaw: p.yaw, hp: 350, maxHp: 350, t: 25, r: 30, cd: 0.5 });
    return true;
  },
  mend(m, p) {
    const target = m.aimAlly(p, 20) ?? p;
    if (target.hp >= 100 && target === p) return false;
    target.fx.heal = 3;
    target.healRate = 20;
    return true;
  },
  station(m, p) {
    const pt = forwardGround(m, p, 1.5);
    m.spawnEntity({ type: 'station', team: p.team, owner: p.id, x: pt.x, y: pt.y, z: pt.z, yaw: p.yaw, hp: 120, maxHp: 120, t: 15, r: 4.5 });
    return true;
  },
  aegis(m, p) {
    const target = m.aimAlly(p, 20) ?? p;
    target.shield = Math.max(target.shield, 40);
    target.fx.shieldT = 8;
    return true;
  },
  renewal(m, p) {
    for (const q of m.players.values()) {
      if (!q.alive || q.team !== p.team) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) <= 25) {
        q.hp = 100;
        q.fx.renewal = 6;
      }
    }
    return true;
  },
};

/**
 * Server-validated ability activation. Checks liveness, phase, charges / ultimate points,
 * and refunds the charge if the ability could not be placed.
 */
export function useAbility(m: Match, p: SimPlayer, index: number): boolean {
  if (!p.alive || p.interact !== 0) return false;
  const phase = m.state.phase;
  if (phase === 'matchEnd' || phase === 'roundEnd') return false;
  const def = CHARACTERS[p.character].abilities[index];
  if (!def) return false;
  const impl = IMPLS[def.id];
  if (!impl) return false;
  if (index === 3) {
    const cost = def.ultCost ?? 6;
    if (p.ult < cost && m.opts.mode !== 'practice') return false;
    if (!impl(m, p)) return false;
    if (m.opts.mode !== 'practice') p.ult = 0;
  } else {
    const st = p.abilities[index];
    if (!st || st.charges <= 0) return false;
    if (!impl(m, p)) return false;
    st.charges--;
    if (st.cd <= 0) st.cd = m.opts.mode === 'practice' ? 2 : def.cooldown;
  }
  m.events.push({ type: 'ability', player: p.id, ability: def.id, x: p.x, y: p.y, z: p.z, team: p.team });
  return true;
}
