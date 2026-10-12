import { useState } from 'react';
import type { PracticeDifficulty } from '@phantom/shared';
import { useApp } from '../stores/app';
import { useSettings } from '../stores/settings';
import { audio } from '../game/audio/AudioEngine';
import { CharacterPicker } from '../components/CharacterPicker';
import { MenuBackground } from '../components/MenuBackground';
import { PageHead } from './PlayScreen';

export function PracticeSetup() {
  const app = useApp();
  const s = useSettings();
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('normal');
  const [infiniteAmmo, setInfinite] = useState(true);
  const [where, setWhere] = useState<'range' | 'frontier'>('range');
  const start = () => {
    audio.ensure();
    audio.ui('click');
    app.set({
      game: { kind: 'practice', start: { you: 'you', mode: 'practice', map: where, config: undefined as never, tick: 0 }, practice: { difficulty, infiniteAmmo, map: where } },
      results: null,
    });
    app.go('game');
  };
  return (
    <div className="screen">
      <MenuBackground />
      <div className="page">
        <PageHead title="Practice range" sub="Runs locally — no room or server needed" />
        <div className="grid-2 scroll" style={{ minHeight: 0 }}>
          <div className="panel card">
            <h3>Location</h3>
            <div className="grid-2" style={{ marginBottom: 20 }}>
              <button className={`choice ${where === 'range' ? 'on' : ''}`} onClick={() => setWhere('range')}>
                <b>Practice range</b>
                <span>Targets, recoil training</span>
              </button>
              <button className={`choice ${where === 'frontier' ? 'on' : ''}`} onClick={() => setWhere('frontier')}>
                <b>Explore Frontier</b>
                <span>Free-roam the open world offline (day/night cycle, dynamic weather)</span>
              </button>
            </div>
            <h3>Target difficulty</h3>
            <div className="grid-3">
              {(['easy', 'normal', 'hard'] as const).map((d) => (
                <button key={d} className={`choice ${difficulty === d ? 'on' : ''}`} onClick={() => setDifficulty(d)}>
                  <b>{d}</b>
                  <span>{d === 'easy' ? 'Slow movers' : d === 'normal' ? 'Medium strafe' : 'Fast, erratic'}</span>
                </button>
              ))}
            </div>
            <h3 style={{ marginTop: 20 }}>Ammunition</h3>
            <div className="toggle">
              <button className={infiniteAmmo ? 'on' : ''} onClick={() => setInfinite(true)}>
                Infinite
              </button>
              <button className={!infiniteAmmo ? 'on' : ''} onClick={() => setInfinite(false)}>
                Normal
              </button>
            </div>
            <div className="dim" style={{ fontSize: 13, marginTop: 20, lineHeight: 1.7 }}>
              Stationary targets at 10m and 45m, moving targets at 20–50m. Press <b>B</b> for any weapon (free), abilities recharge in 2s.
              Use the pause menu to reset targets or change difficulty. Same weapon, recoil and hit detection code as multiplayer.
            </div>
            <button className="btn primary block" style={{ marginTop: 20 }} onClick={start}>
              Enter range
            </button>
          </div>
          <div className="panel card">
            <h3>Agent</h3>
            <CharacterPicker value={s.character} onChange={(c) => s.set({ character: c })} />
          </div>
        </div>
      </div>
    </div>
  );
}
