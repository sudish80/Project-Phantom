import { useEffect, useRef, useState } from 'react';
import { CHARACTERS, WEAPONS, type TeamId } from '@phantom/shared';
import { useHud, hudFx } from '../stores/hud';
import { keyLabel, useSettings, useTouchMode } from '../stores/settings';
import { useGameUi } from '../stores/gameUi';
import { ABILITY_ICONS } from './icons';
import { Compass } from './Compass';
import { KillBanner } from './KillBanner';
import { useHudSlot } from '../stores/layout';
import { OpticOverlay } from './Optics';
import { useAim } from '../stores/aim';

const ALLY = 'var(--ally)';
const ENEMY = 'var(--enemy)';

function fmtTime(t: number) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Crosshair() {
  const c = useSettings((s) => s.crosshair);
  const spread = useAim((s) => s.spread);
  const alive = useHud((s) => s.alive);
  const scoped = useAim((s) => s.scoped);
  const adsT = useAim((s) => s.adsT);
  const lowered = useAim((s) => s.lowered);
  if (!alive || scoped || lowered || adsT > 0.35) return null;
  const gap = c.gap + (c.dynamic ? Math.min(30, spread * 260) : 0);
  const t = c.thickness, len = c.size;
  const outline = c.outline ? '0 0 0 1px rgba(0,0,0,0.8)' : 'none';
  const style = { '--cc': c.color } as React.CSSProperties;
  const bar = (x: number, y: number, w: number, h: number) => (
    <i style={{ left: x, top: y, width: w, height: h, boxShadow: outline }} />
  );
  return (
    <div className="crosshair" style={style}>
      {len > 0 && (
        <>
          {bar(-t / 2, -gap - len, t, len)}
          {bar(-t / 2, gap, t, len)}
          {bar(-gap - len, -t / 2, len, t)}
          {bar(gap, -t / 2, len, t)}
        </>
      )}
      {c.dot && bar(-t / 2, -t / 2, t, t)}
    </div>
  );
}

function HitMarker() {
  const ref = useRef<HTMLDivElement>(null);
  const vig = useRef<HTMLDivElement>(null);
  const [inds, setInds] = useState<{ id: number; angle: number }[]>([]);
  const showInd = useSettings((s) => s.damageIndicators);
  useEffect(() => {
    let id = 0;
    return hudFx.on((e) => {
      if (e.type === 'hitmarker' && ref.current) {
        const el = ref.current;
        el.className = 'hitmarker';
        void el.offsetWidth;
        el.className = `hitmarker show${e.kill ? ' kill' : e.head ? ' head' : ''}`;
      } else if (e.type === 'damage') {
        if (vig.current) {
          vig.current.style.opacity = String(Math.min(1, 0.3 + e.amount / 60));
          setTimeout(() => vig.current && (vig.current.style.opacity = '0'), 160);
        }
        const myId = ++id;
        setInds((l) => [...l.slice(-4), { id: myId, angle: e.angle }]);
        setTimeout(() => setInds((l) => l.filter((x) => x.id !== myId)), 1200);
      }
    });
  }, []);
  return (
    <>
      <div ref={vig} className="dmg-vignette" />
      <div ref={ref} className="hitmarker" />
      {showInd && (
        <div className="dmg-ind">
          {inds.map((d) => (
            <i key={d.id} style={{ transform: `rotate(${(-d.angle * 180) / Math.PI}deg)` }} />
          ))}
        </div>
      )}
    </>
  );
}

function TopBar() {
  const h = useHud();
  const slot = useHudSlot('top');
  const m = h.match;
  if (!m) return null;
  const my = h.team;
  const other: TeamId = my === 'alpha' ? 'bravo' : 'alpha';
  const planted = m.charge.status === 'planted';
  const urgent = (m.phase === 'live' || m.phase === 'planted') && h.timeLeft < 10;
  const phaseLabel: Record<string, string> = {
    buy: m.mode === 'tdm' || m.mode === 'royale' ? 'Warmup' : 'Buy phase',
    live: m.mode === 'tdm' ? `First to ${m.killLimit}` : m.mode === 'royale' ? (m.zone?.shrinking ? 'Zone closing' : 'Zone holds') : h.attackers === my ? 'Attack' : 'Defend',
    planted: 'Device planted', roundEnd: 'Round over', matchEnd: 'Match over', warmup: 'Warmup', practice: 'Practice',
  };
  const pips = (team: TeamId, color: string) => {
    const c = h.aliveCounts[team];
    return (
      <div className="alive-row">
        {Array.from({ length: c.total }, (_, i) => (
          <span key={i} className={`alive-pip ${i < c.alive ? '' : 'dead'}`} style={{ '--c': color } as React.CSSProperties} />
        ))}
      </div>
    );
  };
  if (m.mode === 'practice') return null;
  return (
    <div className="hud-top" {...slot}>
      {(m.mode === 'tactical' || m.mode === 'royale') && pips(my, ALLY)}
      <div className="score-box ally">{h.scores[my]}</div>
      <div className="timer-box">
        {planted ? <div className="charge-icon" /> : <div className={`t ${urgent ? 'urgent' : ''}`}>{fmtTime(h.timeLeft)}</div>}
        <div className="ph">
          {m.mode === 'tactical' && m.phase !== 'matchEnd' ? `R${m.round} · ` : ''}
          {phaseLabel[m.phase] ?? ''}
        </div>
      </div>
      <div className="score-box enemy">{h.scores[other]}</div>
      {(m.mode === 'tactical' || m.mode === 'royale') && pips(other, ENEMY)}
    </div>
  );
}

function Abilities() {
  const h = useHud();
  const slot = useHudSlot('abilities');
  const binds = useSettings((s) => s.binds);
  const def = CHARACTERS[h.character];
  const color = def.color;
  const keys = [binds.ab1, binds.ab2, binds.ab3, binds.ult];
  return (
    <div className="hud-bc" {...slot}>
      {def.abilities.map((a, i) => {
        if (!a) return null;
        if (i === 3) {
          const cost = a.ultCost ?? 6;
          const ready = h.ult >= cost || h.mode === 'practice';
          return (
            <div key={a.id} className={`ab ult ${ready ? 'ready' : ''}`} style={{ '--c': color, '--m': ABILITY_ICONS[a.id] } as React.CSSProperties} title={`${a.name}: ${a.desc}`}>
              <span className="key">{keyLabel(keys[i])}</span>
              <div className="glyph" style={{ opacity: ready ? 1 : 0.35 }} />
              <div className="ult-pips">
                {Array.from({ length: cost }, (_, k) => (
                  <i key={k} className={k < h.ult ? 'on' : ''} />
                ))}
              </div>
            </div>
          );
        }
        const st = h.abilities[i];
        const charges = st?.charges ?? 0;
        const frac = st && st.cd > 0 ? st.cd / a.cooldown : 0;
        return (
          <div key={a.id} className={`ab ${charges > 0 ? 'ready' : 'empty'}`} style={{ '--c': color, '--m': ABILITY_ICONS[a.id] } as React.CSSProperties} title={`${a.name}: ${a.desc}`}>
            <span className="key">{keyLabel(keys[i])}</span>
            <div className="glyph" />
            {charges === 0 && frac > 0 && <div className="cd" style={{ height: `${frac * 100}%` }} />}
            {charges === 0 && st && st.cd > 0 && <div className="cdt">{Math.ceil(st.cd)}</div>}
            {a.charges > 1 && <span className="chg">{charges}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Vitals() {
  const h = useHud();
  const slot = useHudSlot('vitals', h.openWorld ? { bottom: 22 } : undefined);
  if (!h.alive) return null;
  return (
    <div className="hud-bl" {...slot}>
      <div>
        <div className="hp">
          <span className={`n ${h.hp <= 30 ? 'low' : ''}`}>{h.hp}</span>
          {h.armor > 0 && <span className="a">◆ {h.armor}</span>}
          {h.shield > 0 && <span className="s">⬡ {h.shield}</span>}
        </div>
        <div className="bar">
          <i style={{ width: `${h.hp}%`, background: h.hp <= 30 ? 'var(--enemy)' : undefined }} />
        </div>
        {h.mode === 'tactical' && (
          <div className="credits" style={{ marginTop: 8 }}>
            ¤ <b>{h.credits.toLocaleString()}</b>
          </div>
        )}
      </div>
    </div>
  );
}

function Ammo() {
  const h = useHud();
  const slot = useHudSlot('ammo');
  if (!h.alive) return null;
  const w = WEAPONS[h.weapon];
  const melee = w.category === 'melee';
  const infinite = h.practice?.infiniteAmmo;
  return (
    <div className="hud-br" {...slot}>
      <div className="slots">
        {h.primary && <span className={h.slot === 1 ? 'on' : ''}>1 {WEAPONS[h.primary].name}</span>}
        {h.secondary && <span className={h.slot === 2 ? 'on' : ''}>2 {WEAPONS[h.secondary].name}</span>}
        <span className={h.slot === 3 ? 'on' : ''}>3 Edge</span>
        {h.hasCharge && <span className="on" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>Device</span>}
      </div>
      {!melee && (
        <div className="ammo">
          <span className={`mag ${h.mag <= Math.ceil(w.mag * 0.25) ? 'low' : ''}`}>{h.reloading ? '—' : h.mag}</span>
          <span className="res">/ {infinite ? '∞' : h.reserve}</span>
        </div>
      )}
      <div className="wpn">{h.reloading ? 'Reloading…' : w.name}</div>
    </div>
  );
}

function KillFeed() {
  const feed = useHud((s) => s.killfeed);
  const team = useHud((s) => s.team);
  const slot = useHudSlot('killfeed');
  return (
    <div className="killfeed" {...slot}>
      {feed.map((k) => (
        <div key={k.id} className={`kf ${k.mine ? 'mine' : ''}`}>
          {k.killer && <span className={k.killerTeam === team ? 'ally' : 'enemy'}>{k.killer}</span>}
          <span className="w">{k.weapon}</span>
          {k.head && <span className="hs">◎</span>}
          <span className={k.victimTeam === team ? 'ally' : 'enemy'}>{k.victim}</span>
        </div>
      ))}
    </div>
  );
}

function Effects() {
  const fx = useHud((s) => s.fx);
  const alive = useHud((s) => s.alive);
  const slot = useHudSlot('effects');
  if (!alive) return null;
  const tags: [string, string][] = [];
  if (fx.overdrive > 0) tags.push([`Overdrive ${fx.overdrive.toFixed(1)}s`, '#ff5a36']);
  if (fx.echo > 0) tags.push([`Echo Sense ${fx.echo.toFixed(1)}s`, '#36c2ff']);
  if (fx.renewal > 0) tags.push([`Renewal −25% dmg ${fx.renewal.toFixed(1)}s`, '#4fe3c1']);
  if (fx.heal > 0) tags.push(['Healing', '#4fe3c1']);
  if (fx.slow > 0) tags.push(['Slowed', '#ff4655']);
  if (fx.revealed > 0) tags.push(['Revealed', '#ff4655']);
  if (fx.spawnProt > 0) tags.push(['Spawn protection', '#9fe870']);
  if (!tags.length) return null;
  return (
    <div className="fx-tags" {...slot}>
      {tags.map(([t, c]) => (
        <span key={t} style={{ '--c': c } as React.CSSProperties}>
          {t}
        </span>
      ))}
    </div>
  );
}

function PracticePanel() {
  const p = useHud((s) => s.practice);
  const hits = useHud((s) => s.lastHits);
  const touch = useTouchMode();
  const slot = useHudSlot('practice', { position: 'absolute', right: 18, top: 70, padding: '12px 16px', minWidth: 210, fontSize: 13 });
  if (!p) return null;
  const acc = p.shots ? Math.round((p.hits / p.shots) * 100) : 0;
  return (
    <div className="panel practice-panel" {...slot}>
      <div className="label">Practice</div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="dim">Difficulty</span>
        <b style={{ textTransform: 'uppercase' }}>{p.difficulty}</b>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="dim">Accuracy</span>
        <b>
          {acc}% <span className="faint">({p.hits}/{p.shots})</span>
        </b>
      </div>
      <div className="label" style={{ marginTop: 10 }}>Last hits</div>
      {hits.length === 0 && <div className="faint">Shoot a target</div>}
      {hits.map((h, i) => (
        <div key={i} className="row mono" style={{ justifyContent: 'space-between', opacity: 1 - i * 0.12 }}>
          <span style={{ color: h.zone === 'head' ? 'var(--warn)' : undefined }}>{h.zone?.toUpperCase()}</span>
          <span>{h.dmg}</span>
          <span className="faint">{h.dist}m</span>
        </div>
      ))}
      <div className="faint" style={{ marginTop: 10, fontSize: 11 }}>
        {touch ? '$ weapons · Ⅱ options' : '[B] weapons · [Esc] options'}
      </div>
    </div>
  );
}

export function Hud() {
  const h = useHud();
  const touch = useTouchMode();
  const showNet = useSettings((s) => s.showNetStats);
  const ui = useGameUi();
  if (!h.ready) return null;
  return (
    <div className="hud">
      <div className="smoke-overlay" style={{ opacity: h.smoke }} />
      <div className="underwater-overlay" style={{ opacity: h.underwater }} />
      <Compass />
      <OpticOverlay />
      <TopBar />
      <KillFeed />
      <Crosshair />
      <HitMarker />
      <KillBanner />
      <Vitals />
      {h.alive && !touch && <Abilities />}
      <Ammo />
      <Effects />
      <PracticePanel />
      {h.banner && (
        <div className={`banner ${h.banner.kind}`} key={h.banner.big + h.banner.small}>
          <div className="big">{h.banner.big}</div>
          {h.banner.small && <div className="small">{h.banner.small}</div>}
        </div>
      )}
      {h.prompt && ui.overlay === null && (
        <div className="prompt">
          {h.prompt.text}
          {h.prompt.progress !== undefined && (
            <div className="progress">
              <i style={{ width: `${Math.min(100, h.prompt.progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {!h.alive && (
        <div className="spectate">
          {h.mode === 'tdm' ? (
            <>
              Respawning in<b>{Math.max(0, h.respawnT).toFixed(1)}s</b>
            </>
          ) : h.spectating ? (
            <>
              Spectating<b>{h.spectating}</b>Click to cycle
            </>
          ) : (
            <>
              You were eliminated<b>Waiting for the next round</b>
            </>
          )}
        </div>
      )}
      {showNet && (
        <div className="netstat">
          {h.fps} fps · {h.ping} ms
        </div>
      )}
    </div>
  );
}
