import { CHARACTERS } from '@phantom/shared';
import { useApp } from '../stores/app';
import { MenuBackground } from '../components/MenuBackground';
import { Portrait } from '../components/Portrait';

export function Results() {
  const app = useApp();
  const r = app.results;
  const me = app.me;
  if (!r) {
    app.go(app.room ? 'lobby' : 'menu');
    return null;
  }
  const mine = r.players.find((p) => p.id === me);
  const won = mine && r.winner === mine.team;
  const draw = r.winner === 'draw';
  const myTeam = mine?.team ?? 'alpha';
  const other = myTeam === 'alpha' ? 'bravo' : 'alpha';
  return (
    <div className="screen">
      <MenuBackground />
      <div className="results">
        <div className="result-head">
          <div className={`big ${draw ? '' : won ? 'win' : 'lose'}`}>{draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}</div>
          <div className="page-sub" style={{ fontSize: 18 }}>
            {r.scores[myTeam]} : {r.scores[other]} · {r.mode === 'tactical' ? `${r.rounds} rounds` : 'Team deathmatch'}
          </div>
        </div>
        <div className="panel card" style={{ maxWidth: 1000, margin: '0 auto' }}>
          <table className="sb-table">
            <thead>
              <tr>
                <th />
                <th>Player</th>
                <th>Team</th>
                <th>Score</th>
                <th>K</th>
                <th>D</th>
                <th>A</th>
                <th>Damage</th>
                <th>HS</th>
                {r.mode === 'tactical' && <th>Plants / Defuses</th>}
              </tr>
            </thead>
            <tbody>
              {r.players.map((p) => (
                <tr key={p.id} className={p.id === me ? 'me' : ''}>
                  <td style={{ width: 52 }}>
                    <Portrait id={p.character} size={40} />
                  </td>
                  <td>
                    <b>{p.name}</b> {p.id === r.mvp && <span className="tag accent">MVP</span>}
                    <div className="faint" style={{ fontSize: 12, color: CHARACTERS[p.character].color }}>
                      {CHARACTERS[p.character].name}
                    </div>
                  </td>
                  <td style={{ color: p.team === myTeam ? 'var(--ally)' : 'var(--enemy)' }}>{p.team === myTeam ? 'Yours' : 'Enemy'}</td>
                  <td>{p.score}</td>
                  <td>{p.kills}</td>
                  <td>{p.deaths}</td>
                  <td>{p.assists}</td>
                  <td>{p.damage}</td>
                  <td>{p.headshots}</td>
                  {r.mode === 'tactical' && (
                    <td>
                      {p.plants} / {p.defuses}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
          {app.room && (
            <button
              className="btn primary"
              onClick={() => {
                app.set({ results: null });
                app.go('lobby');
              }}
            >
              Back to lobby
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              app.set({ results: null });
              app.go('menu');
            }}
          >
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
