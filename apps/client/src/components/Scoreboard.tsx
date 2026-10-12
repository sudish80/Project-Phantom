import { CHARACTERS, type TeamId } from '@phantom/shared';
import { useHud } from '../stores/hud';

export function Scoreboard() {
  const h = useHud();
  const m = h.match;
  if (!m) return null;
  const teams: TeamId[] = h.team === 'alpha' ? ['alpha', 'bravo'] : ['bravo', 'alpha'];
  return (
    <div className="overlay" style={{ background: 'rgba(5,6,8,0.35)', pointerEvents: 'none' }}>
      <div className="panel scoreboard">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="page-sub">
            {m.mode === 'tactical' ? `Tactical · Round ${m.round}/${m.maxRounds}` : m.mode === 'tdm' ? `Team Deathmatch · first to ${m.killLimit}` : 'Practice'}
          </div>
          <div className="mono faint">
            {m.scores[teams[0]]} : {m.scores[teams[1]]}
          </div>
        </div>
        {teams.map((t, i) => {
          const list = h.players.filter((p) => p.team === t).sort((a, b) => b.score - a.score);
          if (!list.length) return null;
          const color = i === 0 ? 'var(--ally)' : 'var(--enemy)';
          return (
            <div key={t} className="sb-team" style={{ '--c': color } as React.CSSProperties}>
              <div className="sb-team-head">
                <span>
                  {i === 0 ? 'YOUR TEAM' : 'ENEMY TEAM'}
                  {m.mode === 'tactical' ? (m.attackers === t ? ' · ATTACK' : ' · DEFEND') : ''}
                </span>
                <span>{m.scores[t]}</span>
              </div>
              <table className="sb-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Agent</th>
                    {m.mode === 'tactical' && i === 0 && <th>Credits</th>}
                    <th>K</th>
                    <th>D</th>
                    <th>A</th>
                    <th>Score</th>
                    <th>Ping</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className={`${p.id === h.you ? 'me' : ''} ${p.alive ? '' : 'dead'}`}>
                      <td>
                        {p.name}
                        {!p.connected && <span className="faint"> (disconnected)</span>}
                        {p.hasCharge && i === 0 && <span className="accent"> ◆</span>}
                      </td>
                      <td style={{ color: CHARACTERS[p.character].color }}>{CHARACTERS[p.character].name}</td>
                      {m.mode === 'tactical' && i === 0 && <td className="mono">{p.credits}</td>}
                      <td>{p.kills}</td>
                      <td>{p.deaths}</td>
                      <td>{p.assists}</td>
                      <td>{p.score}</td>
                      <td className="mono faint">{p.ping}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
