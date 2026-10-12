import { useState } from 'react';
import { NAME_MAX, sanitizeName } from '@phantom/shared';
import { getSocket } from '../multiplayer/socket';
import { useApp } from '../stores/app';
import { SKINS, useSettings } from '../stores/settings';
import { CharacterPicker } from '../components/CharacterPicker';
import { MenuBackground } from '../components/MenuBackground';
import { PageHead } from './PlayScreen';

export function Profile() {
  const s = useSettings();
  const toast = useApp((x) => x.toast);
  const room = useApp((x) => x.room);
  const [name, setName] = useState(s.nickname);
  const st = s.stats;
  const kd = st.deaths ? (st.kills / st.deaths).toFixed(2) : st.kills.toFixed(2);
  return (
    <div className="screen">
      <MenuBackground />
      <div className="page">
        <PageHead title="Player profile" sub="Stored locally in this browser" />
        <div className="grid-2 scroll" style={{ minHeight: 0 }}>
          <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="panel card">
              <h3>Callsign</h3>
              <div className="row">
                <input className="input" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
                <button
                  className="btn primary"
                  onClick={() => {
                    const n = sanitizeName(name);
                    s.set({ nickname: n });
                    setName(n);
                    toast(room ? 'Saved — applies next time you join a room' : 'Callsign saved', 'ok');
                  }}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="panel card">
              <h3>Weapon skin</h3>
              <div className="faint" style={{ fontSize: 12, marginBottom: 10 }}>Energy skins glow, cycle colours, pulse when you fire and are visible to other players.</div>
              <div className="grid-3">
                {SKINS.map((k) => (
                  <button
                    key={k.id}
                    className={`choice ${s.skin === k.id ? 'on' : ''}`}
                    onClick={() => {
                      s.set({ skin: k.id });
                      if (room) getSocket().emit('room:update', { skin: k.id });
                    }}
                  >
                    <b>{k.name}</b>
                    {k.energy && <span className="tag accent" style={{ marginTop: 4 }}>Energy</span>}
                    <span style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      {k.energy ? (
                        <i className="skin-swatch" style={{ width: 70, height: 10, background: `linear-gradient(90deg, ${k.energy.colors.map((c) => '#' + c.toString(16).padStart(6, '0')).join(',')})` }} />
                      ) : (
                        <>
                          <i style={{ width: 22, height: 10, background: k.body ? `#${k.body.toString(16).padStart(6, '0')}` : '#2e3135' }} />
                          <i style={{ width: 22, height: 10, background: k.accent ? `#${k.accent.toString(16).padStart(6, '0')}` : '#ff5a36' }} />
                        </>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="panel card">
              <h3>Career (this browser)</h3>
              <div className="grid-3">
                {[
                  ['Matches', st.matches],
                  ['Wins', st.wins],
                  ['K/D', kd],
                  ['Kills', st.kills],
                  ['Deaths', st.deaths],
                  ['Assists', st.assists],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <div className="label">{l}</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="panel card">
            <h3>Preferred agent</h3>
            <CharacterPicker
              value={s.character}
              onChange={(c) => {
                s.set({ character: c });
                if (room) getSocket().emit('room:update', { character: c });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
