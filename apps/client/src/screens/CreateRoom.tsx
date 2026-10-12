import { useState } from 'react';
import { DEFAULT_ROOM_CONFIG, MAP_INFO, MAX_PLAYERS_LIMIT, MODE_MAPS, type RoomConfig } from '@phantom/shared';
import { createRoom } from '../multiplayer/socket';
import { useApp } from '../stores/app';
import { useSettings } from '../stores/settings';
import { audio } from '../game/audio/AudioEngine';
import { MenuBackground } from '../components/MenuBackground';
import { PageHead } from './PlayScreen';

export function RoomConfigForm({ cfg, set, disabled }: { cfg: RoomConfig; set: (p: Partial<RoomConfig>) => void; disabled?: boolean }) {
  const num = (k: keyof RoomConfig, min: number, max: number) => (
    <input className="input" type="number" min={min} max={max} value={cfg[k] as number} disabled={disabled} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<RoomConfig>)} />
  );
  return (
    <>
      <div className="field">
        <span className="label">Room name</span>
        <input className="input" maxLength={32} value={cfg.name} disabled={disabled} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="field">
        <span className="label">Game mode</span>
        <div className="grid-3">
          {(['tactical', 'tdm', 'royale'] as const).map((m) => (
            <button
              key={m}
              className={`choice ${cfg.mode === m ? 'on' : ''}`}
              disabled={disabled}
              onClick={() => set({ mode: m, map: MODE_MAPS[m].includes(cfg.map) ? cfg.map : MODE_MAPS[m][0] })}
            >
              <b>{m === 'tactical' ? 'Tactical' : m === 'tdm' ? 'Team deathmatch' : 'Royale'}</b>
              <span>{m === 'tactical' ? 'Rounds, economy, plant / defuse' : m === 'tdm' ? 'Respawns, free loadouts, kill limit' : 'Open world, loot, shrinking zone, last squad standing'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Map</span>
        <div className="grid-3">
          {MAP_INFO.filter((m) => MODE_MAPS[cfg.mode].includes(m.id)).map((m) => (
            <button key={m.id} className={`choice ${cfg.map === m.id ? 'on' : ''}`} disabled={disabled} onClick={() => set({ map: m.id })}>
              <b>{m.name}</b>
              <span>{m.description}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid-3">
        <div className="field">
          <span className="label">Max players</span>
          {num('maxPlayers', 2, MAX_PLAYERS_LIMIT)}
        </div>
        <div className="field">
          <span className="label">Players per team</span>
          {num('teamSize', 1, MAX_PLAYERS_LIMIT / 2)}
        </div>
        {cfg.mode === 'tactical' ? (
          <div className="field">
            <span className="label">Round limit (even)</span>
            {num('maxRounds', 2, 30)}
          </div>
        ) : cfg.mode === 'royale' ? null : (
          <div className="field">
            <span className="label">Kill limit</span>
            {num('killLimit', 5, 200)}
          </div>
        )}
        {cfg.mode === 'tdm' && (
          <div className="field">
            <span className="label">Match duration (min)</span>
            {num('timeLimitMin', 1, 30)}
          </div>
        )}
      </div>
      <div className="grid-2">
        <div className="field">
          <span className="label">Time of day</span>
          <select className="select" value={cfg.timeOfDay} disabled={disabled} onChange={(e) => set({ timeOfDay: e.target.value as RoomConfig['timeOfDay'] })}>
            <option value="map">Map default</option>
            <option value="dawn">Dawn</option>
            <option value="day">Midday</option>
            <option value="sunset">Golden hour</option>
            <option value="night">Night</option>
            <option value="cycle">Day/night cycle (1 h = 1 min)</option>
          </select>
        </div>
        <div className="field">
          <span className="label">Weather</span>
          <select className="select" value={cfg.weather} disabled={disabled} onChange={(e) => set({ weather: e.target.value as RoomConfig['weather'] })}>
            <option value="map">Map default</option>
            <option value="clear">Clear</option>
            <option value="overcast">Overcast</option>
            <option value="rain">Rain</option>
            <option value="storm">Storm</option>
            <option value="fog">Fog</option>
            <option value="dynamic">Dynamic (changes over time)</option>
          </select>
        </div>
      </div>
      <div className="grid-3">
        <div className="field">
          <span className="label">Visibility</span>
          <div className="toggle">
            {(['public', 'private'] as const).map((v) => (
              <button key={v} className={cfg.visibility === v ? 'on' : ''} disabled={disabled} onClick={() => set({ visibility: v })}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Friendly fire</span>
          <div className="toggle">
            {[false, true].map((v) => (
              <button key={String(v)} className={cfg.friendlyFire === v ? 'on' : ''} disabled={disabled} onClick={() => set({ friendlyFire: v })}>
                {v ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Team selection</span>
          <div className="toggle">
            {[true, false].map((v) => (
              <button key={String(v)} className={cfg.allowTeamSelect === v ? 'on' : ''} disabled={disabled} onClick={() => set({ allowTeamSelect: v })}>
                {v ? 'Free' : 'Auto'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function CreateRoom() {
  const go = useApp((s) => s.go);
  const toast = useApp((s) => s.toast);
  const nickname = useSettings((s) => s.nickname);
  const [cfg, setCfg] = useState<RoomConfig>({ ...DEFAULT_ROOM_CONFIG, name: nickname ? `${nickname}'s room` : DEFAULT_ROOM_CONFIG.name });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    audio.ensure();
    setBusy(true);
    const r = await createRoom(cfg);
    setBusy(false);
    if (r.ok) {
      audio.ui('click');
      go('lobby');
    } else toast(r.error ?? 'Could not create room', 'error');
  };
  return (
    <div className="screen">
      <MenuBackground />
      <div className="page">
        <PageHead title="Create room" sub="You will be the host" />
        <div className="panel card scroll" style={{ maxWidth: 900, width: '100%', alignSelf: 'center', minHeight: 0 }}>
          <RoomConfigForm cfg={cfg} set={(p) => setCfg({ ...cfg, ...p })} />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn primary" disabled={busy} onClick={submit}>
              {busy ? 'Creating…' : 'Create room'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
