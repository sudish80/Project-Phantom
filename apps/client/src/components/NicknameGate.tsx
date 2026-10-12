import { useState } from 'react';
import { NAME_MAX, sanitizeName } from '@phantom/shared';
import { useSettings } from '../stores/settings';

/** Asks for a callsign the first time the game is opened. */
export function NicknameGate() {
  const nickname = useSettings((s) => s.nickname);
  const set = useSettings((s) => s.set);
  const [name, setName] = useState('');
  if (nickname) return null;
  const submit = () => {
    const n = sanitizeName(name);
    if (n) set({ nickname: n });
  };
  return (
    <div className="overlay" style={{ zIndex: 60 }}>
      <form
        className="panel card"
        style={{ width: 420 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h3>Choose your callsign</h3>
        <input className="input" autoFocus maxLength={NAME_MAX} placeholder="e.g. Nightjar" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="faint" style={{ fontSize: 12, margin: '8px 0 16px' }}>
          Shown to other players. Letters, numbers, spaces, - _ . only. You can change it later in Player Profile.
        </div>
        <button className="btn primary block" type="submit" disabled={!name.trim()}>
          Continue
        </button>
      </form>
    </div>
  );
}
