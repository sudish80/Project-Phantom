import { CHARACTER_LIST, CHARACTERS, type CharacterId } from '@phantom/shared';
import { keyLabel, useSettings } from '../stores/settings';
import { audio } from '../game/audio/AudioEngine';
import { ABILITY_ICONS } from './icons';
import { Portrait } from './Portrait';

export function CharacterPicker({ value, onChange, compact = false }: { value: CharacterId; onChange: (c: CharacterId) => void; compact?: boolean }) {
  const def = CHARACTERS[value];
  const binds = useSettings((s) => s.binds);
  const keys = [binds.ab1, binds.ab2, binds.ab3, binds.ult];
  return (
    <div>
      <div className="agents">
        {CHARACTER_LIST.map((c) => (
          <button
            key={c.id}
            className={`agent ${value === c.id ? 'on' : ''}`}
            style={{ '--c': c.color } as React.CSSProperties}
            onClick={() => {
              audio.ensure();
              audio.ui('click');
              onChange(c.id);
            }}
            onMouseEnter={() => audio.ui('hover')}
            title={`${c.name} — ${c.role}`}
          >
            <Portrait id={c.id} className="" size={120} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
          <b style={{ fontSize: 22, letterSpacing: '0.14em', color: def.color }}>{def.name.toUpperCase()}</b>
          <span className="tag">{def.role}</span>
        </div>
        <div className="dim" style={{ fontSize: 13, margin: '4px 0 12px' }}>
          {def.tagline}
        </div>
        {!compact && (
          <div className="ability-list">
            {def.abilities.map((a, i) =>
              a ? (
                <div key={a.id} className="ability-row">
                  <span className="keycap">{keyLabel(keys[i])}</span>
                  <span
                    style={{ width: 22, height: 22, flex: 'none', background: def.color, WebkitMask: `${ABILITY_ICONS[a.id]} center / contain no-repeat`, mask: `${ABILITY_ICONS[a.id]} center / contain no-repeat` }}
                  />
                  <div>
                    <b style={{ letterSpacing: '0.06em' }}>
                      {a.name}
                      {a.key === 'ult' ? ` · ULT (${a.ultCost} pts)` : a.charges > 1 ? ` · ${a.charges} charges` : ''}
                    </b>
                    <div className="dim">{a.desc}</div>
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
}
