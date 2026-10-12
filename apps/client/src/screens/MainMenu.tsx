import { CHARACTERS, MAP_INFO } from '@phantom/shared';
import { useApp, type Screen } from '../stores/app';
import { SKINS, useSettings } from '../stores/settings';
import { audio } from '../game/audio/AudioEngine';
import { MenuBackground } from '../components/MenuBackground';
import { Portrait } from '../components/Portrait';

export function ConnBadge() {
  const conn = useApp((s) => s.connection);
  const label = conn === 'connected' ? 'Online' : conn === 'connecting' ? 'Connecting…' : 'Offline';
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className={`dot ${conn === 'connected' ? 'ok' : conn === 'connecting' ? 'warn' : 'bad'}`} />
      {label}
    </span>
  );
}

export function MainMenu() {
  const go = useApp((s) => s.go);
  const info = useApp((s) => s.serverInfo);
  const conn = useApp((s) => s.connection);
  const room = useApp((s) => s.room);
  const st = useSettings();
  const char = CHARACTERS[st.character];
  const skin = SKINS.find((s) => s.id === st.skin) ?? SKINS[0];
  const nav = (s: Screen) => () => {
    audio.ensure();
    audio.ui('click');
    audio.startMusic();
    go(s);
  };
  const items: { s: Screen; label: string; sub: string; primary?: boolean; needsNet?: boolean }[] = [
    { s: room ? 'lobby' : 'play', label: room ? 'Return to lobby' : 'Play', sub: room ? `Room ${room.code}` : 'Browse rooms on this server', primary: true, needsNet: true },
    { s: 'create', label: 'Create room', sub: 'Host a private match', needsNet: true },
    { s: 'join', label: 'Join room', sub: 'Enter a room code', needsNet: true },
    { s: 'practice', label: 'Practice range', sub: 'Offline · aim & recoil training' },
    { s: 'settings', label: 'Settings', sub: 'Graphics · controls · audio' },
    { s: 'profile', label: 'Player profile', sub: 'Callsign · agent · weapon skin' },
  ];
  const lanUrl = info?.lanUrls?.[0];
  return (
    <div className="screen" onMouseDown={() => audio.ensure()}>
      <MenuBackground />
      <div className="mm">
        <div className="mm-top">
          <div className="brand">
            <div className="brand-mark" />
            <div className="brand-name">
              PHANTOM
              <small>TACTICAL OPERATIONS</small>
            </div>
          </div>
          <div className="panel player-card" onClick={nav('profile')} role="button" tabIndex={0}>
            <Portrait id={st.character} />
            <div>
              <div className="nm">{st.nickname || 'Agent'}</div>
              <div className="sub" style={{ color: char.color }}>
                {char.name} · <span className="dim">{skin.name}</span>
              </div>
            </div>
          </div>
        </div>
        <nav className="mm-nav">
          {items.map((it) => (
            <button
              key={it.label}
              className={`mm-item ${it.primary ? 'primary' : ''}`}
              onClick={nav(it.s)}
              onMouseEnter={() => audio.ui('hover')}
              disabled={it.needsNet && conn !== 'connected'}
              style={it.needsNet && conn !== 'connected' ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
            >
              {it.label}
              <small>{it.needsNet && conn !== 'connected' ? 'Server unreachable' : it.sub}</small>
            </button>
          ))}
        </nav>
        <div className="mm-side">
          <div className="panel mode-card">
            <h4>Tactical</h4>
            <p>Round-based attack & defend. Plant or defuse the phase device, manage your economy, switch sides at half.</p>
          </div>
          <div className="panel mode-card">
            <h4>Team deathmatch</h4>
            <p>Instant respawns, free loadouts, first team to the kill limit wins.</p>
          </div>
          <div className="panel mode-card">
            <h4>Maps</h4>
            <p>{MAP_INFO.map((m) => m.name).join(' · ')}</p>
          </div>
        </div>
        <div className="mm-foot">
          <ConnBadge />
          <span>{lanUrl ? `LAN: ${lanUrl}` : `Server: ${location.host}`}</span>
          <span>v{info?.version ?? '0.1.0'}</span>
        </div>
      </div>
    </div>
  );
}
