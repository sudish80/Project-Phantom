import { useState } from 'react';
import { ARMORS, WEAPON_LIST, WEAPONS, type ArmorId, type WeaponDef } from '@phantom/shared';
import { useHud } from '../stores/hud';
import { useApp } from '../stores/app';
import { touchModeActive, useSettings } from '../stores/settings';
import { audio } from '../game/audio/AudioEngine';
import { SIGHT_LIST, defaultSightFor, getSight, type SightId } from '../game/weapons/Sights';

const COLS: { title: string; cats: WeaponDef['category'][] }[] = [
  { title: 'Sidearms', cats: ['sidearm'] },
  { title: 'SMG · Shotgun', cats: ['smg', 'shotgun'] },
  { title: 'Rifles', cats: ['rifle'] },
  { title: 'Sniper · Heavy', cats: ['sniper', 'heavy'] },
];

export function BuyMenu({ buy, sell, onClose }: { buy: (item: string) => Promise<{ ok: boolean; error?: string }>; sell: (item: string) => Promise<{ ok: boolean; error?: string }>; onClose: () => void }) {
  const h = useHud();
  const toast = useApp((s) => s.toast);
  const settings = useSettings();
  const [hover, setHover] = useState<string | null>(null);
  const free = h.mode !== 'tactical';
  const opticWeapon = WEAPONS[h.weapon];
  const opticTarget = h.weapon;
  const mountedSight = settings.sights[opticTarget] ?? defaultSightFor(opticWeapon);
  const setSight = (id: SightId) => settings.set({ sights: { ...settings.sights, [opticTarget]: id } });
  const price = (p: number) => (free ? 0 : p);
  const owned = (id: string) => h.primary === id || h.secondary === id;
  const doBuy = async (item: string, isOwned: boolean) => {
    audio.ensure();
    const r = isOwned && !free ? await sell(item) : await buy(item);
    if (!r.ok) {
      audio.ui('error');
      toast(r.error ?? 'Purchase failed', 'error');
    } else audio.ui('click');
  };
  const detail = hover ? (hover in WEAPONS ? WEAPONS[hover as keyof typeof WEAPONS] : null) : null;
  const armorDetail = hover && hover in ARMORS ? ARMORS[hover as ArmorId] : null;
  const opticDetail = hover?.startsWith('optic:') ? getSight(hover.slice(6) as SightId) : null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel buy">
        <div className="buy-head">
          <div>
            <div className="page-title" style={{ fontSize: 24 }}>
              {free ? 'Loadout' : 'Buy'}
            </div>
            <div className="page-sub">
              {h.mode === 'tactical' ? (h.canBuy ? 'Click to buy · click an owned item to refund (this round only)' : 'Buying is only available in your spawn during the buy phase') : 'All weapons are free in this mode'}
            </div>
          </div>
          <div className="row">
            {!free && (
              <div className="credits" style={{ fontSize: 18 }}>
                ¤ <b style={{ fontSize: 28 }}>{h.credits.toLocaleString()}</b>
              </div>
            )}
            <button className="btn ghost small" onClick={onClose}>
              {touchModeActive(useSettings.getState().controlMode) ? 'Close' : 'Close [B]'}
            </button>
          </div>
        </div>
        <div className="buy-grid scroll" style={{ maxHeight: '58vh' }}>
          {COLS.map((col) => (
            <div key={col.title} className="buy-col">
              <h4>{col.title}</h4>
              {WEAPON_LIST.filter((w) => col.cats.includes(w.category)).map((w) => {
                const o = owned(w.id);
                const poor = !o && price(w.price) > h.credits;
                return (
                  <button
                    key={w.id}
                    className={`buy-item ${o ? 'owned' : ''} ${poor ? 'poor' : ''}`}
                    onMouseEnter={() => setHover(w.id)}
                    onClick={() => doBuy(w.id, o && w.price > 0)}
                  >
                    <span className="nm">{w.name}</span>
                    <span className="pr">{o ? 'OWNED' : free || w.price === 0 ? 'FREE' : `¤ ${w.price}`}</span>
                    <span className="st">
                      {w.category.toUpperCase()} · {w.damage.body} body / {w.damage.head} head · {w.mag || '—'} rnd
                    </span>
                  </button>
                );
              })}
              {col.title === 'Sidearms' && (
                <>
                  <h4 style={{ marginTop: 14 }}>Armor</h4>
                  {Object.values(ARMORS).map((a) => (
                    <button
                      key={a.id}
                      className={`buy-item ${h.armor >= a.value ? 'owned' : ''} ${!free && a.price > h.credits ? 'poor' : ''}`}
                      onMouseEnter={() => setHover(a.id)}
                      onClick={() => doBuy(a.id, h.armor >= a.value)}
                    >
                      <span className="nm">{a.name}</span>
                      <span className="pr">{h.armor >= a.value ? 'EQUIPPED' : free ? 'FREE' : `¤ ${a.price}`}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          ))}
          {opticWeapon.category !== 'melee' && (
            <div className="buy-col">
              <h4>Optic · {opticWeapon.name}</h4>
              {SIGHT_LIST.map((s) => (
                <button
                  key={s.id}
                  className={`buy-item ${s.id === mountedSight ? 'owned' : ''}`}
                  onMouseEnter={() => setHover(`optic:${s.id}`)}
                  onClick={() => {
                    audio.ensure();
                    setSight(s.id);
                    audio.ui('click');
                  }}
                >
                  <span className="nm">{s.short}</span>
                  <span className="pr">{s.id === mountedSight ? 'MOUNTED' : 'FREE'}</span>
                  <span className="st">
                    {s.zoom % 1 === 0 ? s.zoom : s.zoom.toFixed(1)}× · {s.style.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="buy-detail">
          {detail ? (
            <>
              <b style={{ color: 'var(--text)', letterSpacing: '0.1em' }}>{detail.name.toUpperCase()}</b> — {detail.desc}
              <div className="mono faint" style={{ marginTop: 6, fontSize: 12 }}>
                Fire rate {detail.fireRate.toFixed(1)}/s · {detail.auto ? 'Automatic' : 'Semi'} · Mag {detail.mag || '—'} / {detail.reserve} · Reload {detail.reloadTime}s ·
                Range {detail.falloff.start < 900 ? `${detail.falloff.start}-${detail.falloff.end}m falloff` : 'no falloff'} · Move speed {Math.round(detail.moveMul * 100)}%
              </div>
            </>
          ) : armorDetail ? (
            <>
              <b style={{ color: 'var(--text)' }}>{armorDetail.name.toUpperCase()}</b> — {armorDetail.desc}
            </>
          ) : opticDetail ? (
            <>
              <b style={{ color: 'var(--text)', letterSpacing: '0.1em' }}>{opticDetail.name.toUpperCase()}</b> — {opticDetail.desc}
              <div className="mono faint" style={{ marginTop: 6, fontSize: 12 }}>
                {opticDetail.zoom}× magnification · {opticDetail.tube ? 'Magnified tube' : 'Open sight'} · {opticDetail.effect ? `${opticDetail.effect} imaging` : `${opticDetail.reticle} reticle`}
              </div>
            </>
          ) : (
            touchModeActive(useSettings.getState().controlMode) ? 'Tap an item to buy it.' : 'Hover an item for details.'
          )}
        </div>
      </div>
    </div>
  );
}
