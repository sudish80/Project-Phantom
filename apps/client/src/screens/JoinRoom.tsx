import { useState } from 'react';
import { ROOM_CODE_LENGTH } from '@phantom/shared';
import { joinRoom } from '../multiplayer/socket';
import { useApp } from '../stores/app';
import { audio } from '../game/audio/AudioEngine';
import { MenuBackground } from '../components/MenuBackground';
import { PageHead } from './PlayScreen';

export function JoinRoom() {
  const go = useApp((s) => s.go);
  const info = useApp((s) => s.serverInfo);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    audio.ensure();
    setBusy(true);
    setErr(null);
    const r = await joinRoom(code.trim());
    setBusy(false);
    if (r.ok) {
      audio.ui('click');
      go('lobby');
    } else {
      audio.ui('error');
      setErr(r.error ?? 'Could not join');
    }
  };
  return (
    <div className="screen">
      <MenuBackground />
      <div className="page">
        <PageHead title="Join room" sub="Enter the code shared by the host" />
        <form
          className="panel card"
          style={{ maxWidth: 520, width: '100%', alignSelf: 'center' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === ROOM_CODE_LENGTH) submit();
          }}
        >
          <span className="label">Room code</span>
          <input
            className="input code"
            autoFocus
            maxLength={ROOM_CODE_LENGTH}
            value={code}
            placeholder="PH7K2"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          {err && (
            <div style={{ color: 'var(--enemy)', marginTop: 10, fontSize: 14 }} role="alert">
              {err}
            </div>
          )}
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy || code.length !== ROOM_CODE_LENGTH} type="submit">
            {busy ? 'Joining…' : 'Join'}
          </button>
          <div className="faint" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
            Connected to <span className="mono">{location.host}</span>. To play with someone on another computer, both of you must open the host's LAN address
            {info?.lanUrls?.[0] ? (
              <>
                {' '}
                (<span className="mono">{info.lanUrls[0]}</span>)
              </>
            ) : null}
            . Rooms live on one server; a code from a different server won't work here.
          </div>
        </form>
      </div>
    </div>
  );
}
