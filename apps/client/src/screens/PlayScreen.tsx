import { useEffect, useState } from 'react';
import { MAP_INFO, type RoomSummary } from '@phantom/shared';
import { joinRoom, listRooms } from '../multiplayer/socket';
import { useApp } from '../stores/app';
import { audio } from '../game/audio/AudioEngine';
import { MenuBackground } from '../components/MenuBackground';
import { ConnBadge } from './MainMenu';

export function PageHead({ title, sub, back = 'menu' }: { title: string; sub?: string; back?: Parameters<ReturnType<typeof useApp.getState>['go']>[0] }) {
  const go = useApp((s) => s.go);
  return (
    <div className="page-head">
      <button
        className="btn ghost small"
        onClick={() => {
          audio.ui('back');
          go(back);
        }}
      >
        ← Back
      </button>
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      <div className="grow" />
      <ConnBadge />
    </div>
  );
}

export function PlayScreen() {
  const go = useApp((s) => s.go);
  const toast = useApp((s) => s.toast);
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = async () => setRooms(await listRooms());
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);
  const join = async (code: string) => {
    setBusy(code);
    const r = await joinRoom(code);
    setBusy(null);
    if (r.ok) go('lobby');
    else toast(r.error ?? 'Could not join', 'error');
  };
  const mapName = (id: string) => MAP_INFO.find((m) => m.id === id)?.name ?? id;
  return (
    <div className="screen">
      <MenuBackground />
      <div className="page">
        <PageHead title="Play" sub="Rooms hosted on this server" />
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 320px', flex: 1, minHeight: 0 }}>
          <div className="panel card scroll" style={{ minHeight: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>Public rooms</h3>
              <button className="btn ghost small" onClick={refresh}>
                Refresh
              </button>
            </div>
            {rooms === null && <div className="faint">Loading…</div>}
            {rooms?.length === 0 && (
              <div className="faint" style={{ padding: '30px 0', textAlign: 'center', lineHeight: 1.8 }}>
                No public rooms yet.
                <br />
                Create one, or join a private room with its code.
              </div>
            )}
            {rooms?.map((r) => (
              <div key={r.code} className="slot" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="nm">{r.name}</div>
                  <div className="sub">
                    {r.mode === 'tactical' ? 'Tactical' : 'Team deathmatch'} · {mapName(r.map)} · host {r.host}
                  </div>
                </div>
                <div className="row">
                  <span className={`tag ${r.status === 'in-match' ? 'accent' : 'ok'}`}>{r.status === 'in-match' ? 'In match' : 'Lobby'}</span>
                  <span className="mono dim">
                    {r.players}/{r.maxPlayers}
                  </span>
                  <span className="mono">{r.code}</span>
                  <button className="btn small primary" disabled={r.players >= r.maxPlayers || busy !== null} onClick={() => join(r.code)}>
                    {busy === r.code ? '…' : 'Join'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <button className="btn primary" onClick={() => go('create')}>
              Create room
            </button>
            <button className="btn" onClick={() => go('join')}>
              Join with code
            </button>
            <button className="btn" onClick={() => go('practice')}>
              Practice range
            </button>
            <div className="panel card" style={{ fontSize: 13, lineHeight: 1.6 }}>
              <h3>Playing over Wi-Fi</h3>
              <div className="dim">
                Everyone must open the <b>host's LAN address</b> (shown in the host's terminal and lobby), not <span className="mono">localhost</span>. Private rooms don't
                appear here; share the 5-letter code instead.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
