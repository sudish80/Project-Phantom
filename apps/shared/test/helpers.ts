import { BTN, eyeFor, Match, type InputCmd, type SimPlayer } from '../src';

let seq = 1;
export function cmd(p: { yaw: number; pitch: number }, o: Partial<InputCmd> = {}, vt = 0): InputCmd {
  return { s: seq++, f: 0, r: 0, b: 0, y: p.yaw, p: p.pitch, sl: 0, vt, ...o };
}

/** Run `ticks` server ticks, feeding each player the command produced by `make` (2 inputs per tick). */
export function run(m: Match, ticks: number, make?: (p: SimPlayer) => Partial<InputCmd> | null) {
  for (let i = 0; i < ticks; i++) {
    for (const p of m.players.values()) {
      const o = make?.(p);
      if (o) m.pushInputs(p.id, [cmd(p, o, m.tick), cmd(p, o, m.tick)]);
    }
    m.update();
  }
}

export function aimAt(from: SimPlayer, to: { x: number; y: number; z: number }, height = 1.65) {
  const ex = from.x, ey = from.y + eyeFor(from.crouch), ez = from.z;
  const dx = to.x - ex, dy = to.y + height - ey, dz = to.z - ez;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  return { y: yaw, p: pitch };
}

export function skipBuy(m: Match) {
  while (m.state.phase === 'buy') m.update();
}

export function place(p: SimPlayer, x: number, z: number) {
  p.x = x;
  p.z = z;
  p.y = 0;
  p.vx = p.vy = p.vz = 0;
  p.onGround = true;
}

export { BTN };
