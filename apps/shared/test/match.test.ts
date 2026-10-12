import { describe, expect, it } from 'vitest';
import { CHARACTERS, Match, TACTICAL, TICK_RATE } from '../src';
import { aimAt, BTN, place, run, skipBuy } from './helpers';

function duel(mode: 'tactical' | 'tdm' = 'tactical') {
  const m = new Match({ mode, map: 'iron', seed: 42, maxRounds: 4 });
  const a = m.addPlayer('a', 'Alice', 'alpha', 'vanguard');
  const b = m.addPlayer('b', 'Bob', 'bravo', 'bastion');
  return { m, a, b };
}

describe('match: combat', () => {
  it('blocks firing during the buy phase', () => {
    const { m, a, b } = duel();
    expect(m.state.phase).toBe('buy');
    place(a, 0, -20); place(b, 0, -10);
    run(m, 10, (p) => (p === a ? { ...aimAt(a, b), b: BTN.FIRE } : {}));
    expect(b.hp).toBe(100);
  });

  it('applies server-calculated headshot damage', () => {
    const { m, a, b } = duel();
    skipBuy(m);
    place(a, 0, -20); place(b, 0, -12);
    run(m, 2, () => ({}));
    run(m, 1, (p) => (p === a ? { ...aimAt(a, b, 1.7), b: BTN.FIRE } : {}));
    expect(b.hp).toBe(100 - 78);
  });

  it('kills, awards credits and ends the round by elimination', () => {
    const { m, a, b } = duel();
    skipBuy(m);
    const credits = a.credits;
    place(a, 0, -20); place(b, 0, -12);
    run(m, 2, () => ({}));
    let toggle = false;
    run(m, 30, (p) => {
      if (p !== a) return {};
      toggle = !toggle;
      return { ...aimAt(a, b, 1.7), b: toggle ? BTN.FIRE : 0 };
    });
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(m.state.phase).toBe('roundEnd');
    expect(m.state.roundWinner).toBe('alpha');
    expect(a.credits).toBe(credits + TACTICAL.killReward + TACTICAL.winReward);
  });

  it('enforces magazine size even if the client spams fire', () => {
    const { m, a } = duel('tdm');
    run(m, TICK_RATE * 9, () => ({})); // warmup
    a.primary = null;
    const shotsBefore = a.ammo[2];
    run(m, TICK_RATE * 3, (p) => (p === a ? { b: m.tick % 2 ? BTN.FIRE : 0, y: 0, p: -1.2 } : {}));
    expect(shotsBefore - a.ammo[2]).toBeLessThanOrEqual(12);
  });

  it('rejects malformed and excessive input packets', () => {
    const { m, a } = duel();
    expect(m.pushInputs('a', 'garbage')).toBe(false);
    expect(m.pushInputs('a', [{ s: 1, f: NaN }])).toBe(false);
    expect(m.pushInputs('a', new Array(100).fill({ s: 1, f: 0, r: 0, b: 0, y: 0, p: 0 }))).toBe(false);
    expect(a.queue.length).toBe(0);
  });

  it('limits simulation time per player (no speed hacking)', () => {
    const { m, a } = duel('tdm');
    run(m, TICK_RATE * 9, () => ({}));
    place(a, 0, -20);
    const z0 = a.z;
    // Send 3x the allowed number of inputs per tick for one second
    let s = 100000;
    for (let i = 0; i < TICK_RATE; i++) {
      const cmds = Array.from({ length: 6 }, () => ({ s: s++, f: 1, r: 0, b: 0, y: Math.PI, p: 0, sl: 0, vt: m.tick }));
      m.pushInputs('a', cmds);
      m.update();
    }
    expect(Math.abs(a.z - z0)).toBeLessThan(6.5);
  });
});

describe('match: economy', () => {
  it('validates purchases', () => {
    const { m, a } = duel();
    expect(m.buy('a', 'corsair').error).toMatch(/credits/i);
    expect(m.buy('a', 'magistrate').ok).toBe(true);
    expect(a.secondary).toBe('magistrate');
    expect(a.credits).toBe(0);
    expect(m.buy('a', 'magistrate').ok).toBe(false);
    expect(m.sell('a', 'magistrate').ok).toBe(true);
    expect(a.credits).toBe(800);
    expect(a.secondary).toBe('wisp');
    expect(m.sell('a', 'magistrate').ok).toBe(false);
    expect(m.buy('a', 'edge').ok).toBe(false);
  });

  it('refuses purchases outside the buy zone and outside the buy phase', () => {
    const { m, a } = duel();
    place(a, 0, 0);
    expect(m.buy('a', 'light').error).toMatch(/spawn/);
    skipBuy(m);
    expect(m.buy('a', 'light').error).toMatch(/buy phase/);
  });
});

describe('match: abilities', () => {
  it('consumes charges and enforces cooldowns', () => {
    const { m, a } = duel();
    expect(a.abilities[0].charges).toBe(2);
    run(m, 1, (p) => (p === a ? { b: BTN.AB1 } : {}));
    run(m, 1, (p) => (p === a ? { b: 0 } : {}));
    run(m, 1, (p) => (p === a ? { b: BTN.AB1 } : {}));
    run(m, 1, (p) => (p === a ? { b: 0 } : {}));
    run(m, 1, (p) => (p === a ? { b: BTN.AB1 } : {}));
    expect(a.abilities[0].charges).toBe(0);
    expect(a.abilities[0].cd).toBeGreaterThan(10);
    // ultimate requires points
    run(m, 1, (p) => (p === a ? { b: BTN.ULT } : {}));
    expect(a.fx.overdrive).toBe(0);
    a.ult = CHARACTERS.vanguard.abilities[3].ultCost!;
    run(m, 1, (p) => (p === a ? { b: 0 } : {}));
    run(m, 1, (p) => (p === a ? { b: BTN.ULT } : {}));
    expect(a.fx.overdrive).toBeGreaterThan(7);
    expect(a.ult).toBe(0);
  });

  it('bastion barrier blocks movement', () => {
    const { m, b } = duel();
    place(b, 0, 46);
    run(m, 2, () => ({}));
    run(m, 1, (p) => (p === b ? { b: BTN.AB1, y: 0, p: 0 } : {}));
    const barrier = [...m.entities.values()].find((e) => e.type === 'barrier');
    expect(barrier).toBeTruthy();
    run(m, 60, (p) => (p === b ? { f: 1, y: 0, p: 0 } : {}));
    expect(b.z).toBeGreaterThan(barrier!.z);
  });
});

describe('match: objective & rounds', () => {
  it('plants, defuses and awards the round to defenders', () => {
    const { m, a, b } = duel();
    skipBuy(m);
    expect(a.hasCharge).toBe(true);
    place(a, -29, 22);
    run(m, Math.ceil(TICK_RATE * (TACTICAL.plantTime + 0.3)), (p) => (p === a ? { b: BTN.USE } : {}));
    expect(m.state.charge.status).toBe('planted');
    expect(m.state.phase).toBe('planted');
    place(b, m.state.charge.x + 0.5, m.state.charge.z);
    // moving resets defuse progress
    run(m, TICK_RATE * 2, (p) => (p === b ? { b: BTN.USE } : {}));
    expect(m.state.charge.defuseProgress).toBeGreaterThan(1.5);
    run(m, Math.ceil(TICK_RATE * (TACTICAL.defuseTime - 1.5)), (p) => (p === b ? { b: BTN.USE } : {}));
    expect(m.state.charge.status).toBe('defused');
    expect(m.state.roundWinner).toBe('bravo');
  });

  it('detonation awards the round to attackers', () => {
    const { m, a, b } = duel();
    skipBuy(m);
    place(a, -29, 22);
    place(b, 0, 46);
    run(m, Math.ceil(TICK_RATE * (TACTICAL.plantTime + 0.3)), (p) => (p === a ? { b: BTN.USE } : {}));
    place(a, 0, -50);
    run(m, TICK_RATE * (TACTICAL.detonateTime + 1), () => ({}));
    expect(m.state.scores.alpha).toBe(1);
    expect(m.state.roundReason).toBe('detonated');
  });

  it('runs a full match with side switch to completion', () => {
    const { m, a, b } = duel();
    let switched = false;
    for (let round = 0; round < 10 && !m.result; round++) {
      skipBuy(m);
      // attackers lose by timer each round
      run(m, TICK_RATE * (TACTICAL.roundTime + TACTICAL.roundEndTime + 1), () => ({}));
      if (m.state.attackers === 'bravo') switched = true;
    }
    expect(switched).toBe(true);
    expect(m.result).toBeTruthy();
    expect(m.state.phase).toBe('matchEnd');
    // 4-round match: first to 3. alpha defends rounds 3-4 after the switch, bravo defended rounds 1-2
    expect(m.state.scores.alpha + m.state.scores.bravo).toBe(4);
    expect(m.result!.winner).toBe('draw');
    expect(a.alive && b.alive).toBe(true);
    run(m, TICK_RATE * 21, () => ({}));
    expect(m.finished).toBe(true);
  });

  it('team deathmatch respawns and ends at the kill limit', () => {
    const m = new Match({ mode: 'tdm', map: 'iron', seed: 3, killLimit: 2 });
    const a = m.addPlayer('a', 'A', 'alpha', 'medic');
    const b = m.addPlayer('b', 'B', 'bravo', 'medic');
    run(m, TICK_RATE * 9, () => ({}));
    expect(m.state.phase).toBe('live');
    for (let k = 0; k < 2; k++) {
      b.fx.spawnProt = 0;
      m.killPlayer(b, a, 'wisp', false);
      expect(b.alive).toBe(false);
      if (m.state.phase === 'live') {
        run(m, TICK_RATE * 4, () => ({}));
        expect(b.alive).toBe(true);
      }
    }
    expect(m.state.phase).toBe('matchEnd');
    expect(m.result?.winner).toBe('alpha');
  });
});
