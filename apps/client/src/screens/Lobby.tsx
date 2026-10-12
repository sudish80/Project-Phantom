import { useEffect, useState } from 'react';
import { CHARACTERS, MAP_INFO, type CharacterId, type RoomConfig, type TeamId } from '@phantom/shared';
import { getSocket, leaveRoom, startMatch } from '../multiplayer/socket';
import { useApp } from '../stores/app';
import { useSettings } from '../stores/settings';
import { audio } from '../game/audio/AudioEngine';
import { CharacterPicker } from '../components/CharacterPicker';
import { MenuBackground } from '../components/MenuBackground';
import { Portrait } from '../components/Portrait';
import { RoomConfigForm } from './CreateRoom';
import { ConnBadge } from './MainMenu';

function copy(text: string, toast: (t: string) => void) {
  const done = () => toast('Copied to clipboard');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallback());
  else fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch {
      toast(text);
    }
    ta.remove();
  }
}

export function Lobby() {
  const room = useApp((s) => s.room);
  const me = useApp((s) => s.me);
  const go = useApp((s) => s.go);
  const toast = useApp((s) => s.toast);
  const info = useApp((s) => s.serverInfo);
  const setSettings = useSettings((s) => s.set);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RoomConfig | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!room) go('menu');
  }, [room, go]);
  if (!room) return null;

  const mine = room.players.find((p) => p.id === me);
  const isHost = room.hostId === me;
  const cfg = room.config;
  const sock = getSocket();
  const lan = room.lanUrls[0] ?? info?.lanUrls?.[0] ?? null;
  const shareUrl = `${lan ?? location.origin}/?room=${room.code}`;
  const mapName = MAP_INFO.find((m) => m.id === cfg.map)?.name ?? cfg.map;
  const notReady = room.players.filter((p) => !p.isHost && !p.ready && p.connected);

  const setChar = (c: CharacterId) => {
    setSettings({ character: c });
    sock.emit('room:update', { character: c });
  };
  const setTeam = (t: TeamId) => sock.emit('room:update', { team: t });
  const toggleReady = () => {
    audio.ui('click');
    sock.emit('room:update', { ready: !mine?.ready });
  };
  const start = async () => {
    setStarting(true);
    const r = await startMatch();
    setStarting(false);
    if (!r.ok) {
      audio.ui('error');
      toast(r.error ?? 'Cannot start', 'error');
    }
  };

  const teamCol = (team: TeamId, label: string, color: string) => {
    const players = room.players.filter((p) => p.team === team);
    const empty = Math.max(0, cfg.teamSize - players.length);
    return (
      <div className="panel team-col">
        <div className="team-head" style={{ '--c': color } as React.CSSProperties}>
          <h3 style={{ color }}>{label}</h3>
          <div className="row">
            <span className="faint mono">
              {players.length}/{cfg.teamSize}
            </span>
            {cfg.allowTeamSelect && mine && mine.team !== team && players.length < cfg.teamSize && room.status === 'lobby' && (
              <button className="btn small" onClick={() => setTeam(team)}>
                Join
              </button>
            )}
          </div>
        </div>
        <div className="scroll" style={{ flex: 1 }}>
          {players.map((p) => (
            <div key={p.id} className={`slot ${p.id === me ? 'me' : ''}`}>
              <Portrait id={p.character} size={44} />
              <div className="grow">
                <div className="nm">
                  {p.name}
                  {p.id === me && <span className="faint"> (you)</span>}
                </div>
                <div className="sub" style={{ color: CHARACTERS[p.character].color }}>
                  {CHARACTERS[p.character].name}
                  {!p.connected && <span style={{ color: 'var(--warn)' }}> · reconnecting…</span>}
                </div>
              </div>
              {p.isHost && <span className="tag accent">Host</span>}
              {!p.isHost && <span className={`tag ${p.ready ? 'ok' : ''}`}>{p.ready ? 'Ready' : 'Not ready'}</span>}
              {p.connected && <span className="mono faint" style={{ fontSize: 11, width: 44, textAlign: 'right' }}>{p.ping} ms</span>}
              {isHost && p.id !== me && (
                <button className="btn small danger" title="Kick player" onClick={() => sock.emit('room:kick', { playerId: p.id })}>
                  Kick
                </button>
              )}
            </div>
          ))}
          {Array.from({ length: Math.min(empty, 5) }, (_, i) => (
            <div key={i} className="slot empty">
              Open slot
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="screen">
      <MenuBackground />
      <div className="page">
        <div className="page-head">
          <button
            className="btn ghost small"
            onClick={() => {
              leaveRoom();
              go('menu');
            }}
          >
            ← Leave
          </button>
          <div>
            <div className="label" style={{ marginBottom: 0 }}>
              Room code
            </div>
            <div className="code-big" onClick={() => copy(room.code, toast)} style={{ cursor: 'copy' }} title="Click to copy">
              {room.code}
            </div>
          </div>
          <div style={{ marginLeft: 12 }}>
            <div className="page-title" style={{ fontSize: 22 }}>
              {cfg.name}
            </div>
            <div className="page-sub">
              {cfg.mode === 'tactical' ? `Tactical · ${cfg.maxRounds} rounds` : cfg.mode === 'royale' ? 'Royale · last squad standing' : `Team deathmatch · ${cfg.killLimit} kills · ${cfg.timeLimitMin} min`} · {mapName} ·{' '}
              {cfg.timeOfDay !== 'map' ? `${cfg.timeOfDay} · ` : ''}
              {cfg.weather !== 'map' ? `${cfg.weather} · ` : ''}
              {cfg.visibility} · FF {cfg.friendlyFire ? 'on' : 'off'}
            </div>
          </div>
          <div className="grow" />
          <ConnBadge />
        </div>

        <div className="lobby">
          {teamCol('alpha', cfg.mode === 'tactical' ? 'TEAM ALPHA · ATTACK FIRST' : cfg.mode === 'royale' ? 'SQUAD ALPHA' : 'TEAM ALPHA', 'var(--ally)')}
          {teamCol('bravo', cfg.mode === 'tactical' ? 'TEAM BRAVO · DEFEND FIRST' : cfg.mode === 'royale' ? 'SQUAD BRAVO' : 'TEAM BRAVO', 'var(--enemy)')}
          <div className="row scroll" style={{ flexDirection: 'column', alignItems: 'stretch', minHeight: 0 }}>
            <div className="panel card">
              <h3>Invite players</h3>
              {lan ? (
                <>
                  <div className="dim" style={{ fontSize: 13 }}>
                    Players on the same Wi-Fi open:
                  </div>
                  <div className="mono" style={{ fontSize: 15, margin: '6px 0', wordBreak: 'break-all' }}>
                    {lan}
                  </div>
                  <div className="row wrap">
                    <button className="btn small" onClick={() => copy(shareUrl, toast)}>
                      Copy invite link
                    </button>
                    <button className="btn small ghost" onClick={() => copy(room.code, toast)}>
                      Copy code
                    </button>
                  </div>
                </>
              ) : (
                <div className="dim" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  This server is bound to <span className="mono">localhost</span>, so only this computer can join. Restart it with{' '}
                  <span className="mono">npm run start:lan</span> to accept players on your Wi-Fi.
                </div>
              )}
            </div>
            <div className="panel card">
              <h3>Your agent</h3>
              {mine && <CharacterPicker value={mine.character} onChange={setChar} compact />}
            </div>
            <div className="panel card">
              {room.status === 'in-match' ? (
                <div className="dim">A match is in progress…</div>
              ) : isHost ? (
                <>
                  <button className="btn primary block" disabled={starting} onClick={start}>
                    {starting ? 'Starting…' : 'Start match'}
                  </button>
                  <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                    {notReady.length ? `Waiting for ${notReady.map((p) => p.name).join(', ')} to ready up.` : room.players.length < 2 ? 'You can start alone to explore the map.' : 'Everyone is ready.'}
                  </div>
                  <button
                    className="btn block small"
                    style={{ marginTop: 10 }}
                    onClick={() => {
                      setDraft(cfg);
                      setEditing(true);
                    }}
                  >
                    Room settings
                  </button>
                </>
              ) : (
                <button className={`btn block ${mine?.ready ? '' : 'primary'}`} onClick={toggleReady}>
                  {mine?.ready ? 'Not ready' : 'Ready up'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {editing && draft && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setEditing(false)}>
          <div className="panel card scroll" style={{ width: 'min(860px, 94vw)', maxHeight: '90vh' }}>
            <h3>Room settings</h3>
            <RoomConfigForm cfg={draft} set={(p) => setDraft({ ...draft, ...p })} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  sock.emit('room:config', draft);
                  setEditing(false);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
