import { useEffect, useState } from 'react';
import { ACTION_LABELS, keyLabel, touchModeActive, useSettings, type Action } from '../stores/settings';
import { audio } from '../game/audio/AudioEngine';
import { Crosshair } from './Hud';
import { useLayout } from '../stores/layout';
import { useGameUi } from '../stores/gameUi';

type Tab = 'graphics' | 'controls' | 'touch' | 'audio' | 'gameplay';
const TAB_LABEL: Record<Tab, string> = { graphics: 'graphics', controls: 'controls', touch: 'touch & HUD', audio: 'audio', gameplay: 'gameplay' };

function Row({ name, hint, children }: { name: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div>
        <div className="nm">{name}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div className="set-ctrl">{children}</div>
    </div>
  );
}

function Slider({ value, min, max, step, onChange, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val">{fmt ? fmt(value) : value}</span>
    </>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <div role="switch" aria-checked={on} tabIndex={0} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} onKeyDown={(e) => e.key === 'Enter' && onChange(!on)} />;
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="toggle">
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function BindButton({ action }: { action: Action }) {
  const code = useSettings((s) => s.binds[action]);
  const bind = useSettings((s) => s.bind);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') bind(action, e.code);
      setListening(false);
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        bind(action, 'Mouse' + e.button);
        setListening(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    };
  }, [listening, action, bind]);
  return (
    <button className={`bind-btn ${listening ? 'listening' : ''}`} onClick={() => setListening(true)}>
      {listening ? 'Press a key… (Esc cancels)' : keyLabel(code)}
    </button>
  );
}

export function SettingsPanel({ inGame = false }: { inGame?: boolean }) {
  const s = useSettings();
  const touchNow = touchModeActive(s.controlMode);
  const [tab, setTab] = useState<Tab>(touchNow ? 'touch' : 'graphics');
  const layout = useLayout();
  const set = s.set;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const fsSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        // Chromium: capture Ctrl+W etc. while in fullscreen so crouching can't close the tab
        await (navigator as any).keyboard?.lock?.().catch(() => {});
      }
    } catch {
      /* unsupported */
    }
  };
  return (
    <div className="settings">
      <div className="tabs">
        {(['graphics', 'controls', 'touch', 'audio', 'gameplay'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => (tab === 'touch' ? (s.reset('touch'), layout.reset()) : s.reset(tab))} style={{ color: 'var(--text-faint)' }}>
          Reset {TAB_LABEL[tab]}
        </button>
      </div>
      <div className="scroll" style={{ paddingRight: 8, minHeight: 0 }}>
        {tab === 'graphics' && (
          <>
            <Row name="Graphics quality" hint="Low disables shadows & dynamic lights. Antialias / shadows apply on next match.">
              <Choice value={s.quality} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} onChange={(v) => set({ quality: v })} />
            </Row>
            <Row name="Shadow quality">
              <Choice value={s.shadows} options={[['off', 'Off'], ['low', 'Low'], ['high', 'High']]} onChange={(v) => set({ shadows: v })} />
            </Row>
            <Row name="Render scale" hint="Lower for more FPS on weak GPUs.">
              <Slider value={s.renderScale} min={0.5} max={1.5} step={0.05} onChange={(v) => set({ renderScale: v })} fmt={pct} />
            </Row>
            <Row name="Bloom / glow" hint="Glow around neon, energy skins and lights. Disabled on Low quality.">
              <Switch on={s.bloom} onChange={(v) => set({ bloom: v })} />
            </Row>
            <Row name="Anti-aliasing">
              <Switch on={s.antialias} onChange={(v) => set({ antialias: v })} />
            </Row>
            <Row name="Field of view" hint="Horizontal degrees.">
              <Slider value={s.fov} min={70} max={120} step={1} onChange={(v) => set({ fov: v })} fmt={(v) => `${v}°`} />
            </Row>
            <Row name="Camera shake">
              <Switch on={s.cameraShake} onChange={(v) => set({ cameraShake: v })} />
            </Row>
            <Row name="Head bob">
              <Switch on={s.headBob} onChange={(v) => set({ headBob: v })} />
            </Row>
            <Row name="Fullscreen">
              <button className="btn small" disabled={!fsSupported} onClick={toggleFullscreen}>
                {fsSupported ? 'Toggle fullscreen' : 'Not supported'}
              </button>
            </Row>
          </>
        )}
        {tab === 'controls' && (
          <>
            <Row name="Mouse sensitivity">
              <Slider value={s.sensitivity} min={0.1} max={4} step={0.05} onChange={(v) => set({ sensitivity: v })} fmt={(v) => v.toFixed(2)} />
            </Row>
            <Row name="Scoped sensitivity multiplier">
              <Slider value={s.adsSensitivity} min={0.2} max={2} step={0.05} onChange={(v) => set({ adsSensitivity: v })} fmt={(v) => v.toFixed(2)} />
            </Row>
            <Row name="Invert mouse Y">
              <Switch on={s.invertY} onChange={(v) => set({ invertY: v })} />
            </Row>
            <Row name="Crouch">
              <Choice value={s.crouchMode} options={[['hold', 'Hold'], ['toggle', 'Toggle']]} onChange={(v) => set({ crouchMode: v })} />
            </Row>
            <Row name="Aim (right mouse)">
              <Choice value={s.aimMode} options={[['hold', 'Hold'], ['toggle', 'Toggle']]} onChange={(v) => set({ aimMode: v })} />
            </Row>
            <Row name="Shift behaviour" hint="Walking is silent; sprinting is loud and inaccurate.">
              <Choice value={s.shiftMode} options={[['walk', 'Walk'], ['sprint', 'Sprint']]} onChange={(v) => set({ shiftMode: v })} />
            </Row>
            <div className="label" style={{ marginTop: 18 }}>
              Key bindings — Fire: LMB · Aim: RMB · Weapon cycle: wheel · Pause: Esc
            </div>
            {(Object.keys(ACTION_LABELS) as Action[]).map((a) => (
              <Row key={a} name={ACTION_LABELS[a]}>
                <BindButton action={a} />
              </Row>
            ))}
          </>
        )}
        {tab === 'audio' && (
          <>
            {(['master', 'music', 'sfx', 'ambient', 'ui'] as const).map((k) => (
              <Row key={k} name={{ master: 'Master volume', music: 'Music', sfx: 'Effects', ambient: 'Ambience', ui: 'Interface' }[k]}>
                <Slider
                  value={s.volume[k]}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => {
                    set({ volume: { ...s.volume, [k]: v } });
                    audio.ensure();
                  }}
                  fmt={pct}
                />
              </Row>
            ))}
            <Row name="Mute all">
              <Switch on={s.muted} onChange={(v) => set({ muted: v })} />
            </Row>
            <Row name="Test sound">
              <button
                className="btn small"
                onClick={() => {
                  audio.ensure();
                  audio.stinger('win');
                }}
              >
                Play
              </button>
            </Row>
            <div className="hint faint" style={{ marginTop: 12, fontSize: 12 }}>
              Voice chat is not part of this release.
            </div>
          </>
        )}
        {tab === 'touch' && (
          <>
            <Row name="Control scheme" hint={`Auto uses touch controls on phones and tablets (this device: ${touchModeActive('auto') ? 'touch' : 'mouse & keyboard'}).`}>
              <Choice value={s.controlMode} options={[['auto', 'Auto'], ['touch', 'Touch'], ['mouse', 'Mouse & keys']]} onChange={(v) => set({ controlMode: v })} />
            </Row>
            <Row name="Edit HUD layout" hint={inGame ? 'Drag panels and buttons, resize them, hide what you do not need.' : 'Open from the in-game menu (Ⅱ / Esc) during a match or in the practice range.'}>
              <button className="btn small" disabled={!inGame} onClick={() => useGameUi.getState().set({ overlay: 'hudEdit' })}>
                Edit layout
              </button>
            </Row>
            <Row name="HUD size">
              <Slider value={layout.hudScale} min={0.6} max={1.5} step={0.05} onChange={(v) => layout.set({ hudScale: v })} fmt={pct} />
            </Row>
            <Row name="Touch button opacity">
              <Slider value={layout.buttonOpacity} min={0.2} max={1} step={0.05} onChange={(v) => layout.set({ buttonOpacity: v })} fmt={pct} />
            </Row>
            <Row name="Look sensitivity (touch)">
              <Slider value={s.touchSens} min={0.2} max={3} step={0.05} onChange={(v) => set({ touchSens: v })} fmt={(v) => v.toFixed(2)} />
            </Row>
            <Row name="Aim-down-sights sensitivity (touch)" hint="Multiplier while aiming; scopes also scale by zoom.">
              <Slider value={s.touchAdsSens} min={0.2} max={2} step={0.05} onChange={(v) => set({ touchAdsSens: v })} fmt={(v) => v.toFixed(2)} />
            </Row>
            <Row name="Auto-sprint" hint="Push the move stick all the way forward to sprint.">
              <Switch on={s.autoSprint} onChange={(v) => set({ autoSprint: v })} />
            </Row>
            <Row name="Aim while firing" hint="Dragging your thumb on the fire button also turns the view.">
              <Switch on={s.fireDragAim} onChange={(v) => set({ fireDragAim: v })} />
            </Row>
            <Row name="Gyroscope aiming" hint="Tilt the device to fine-tune aim (needs a gyroscope; iOS may ask for motion access).">
              <Switch
                on={s.gyro}
                onChange={(v) => {
                  set({ gyro: v });
                  const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
                  if (v && DM?.requestPermission) DM.requestPermission().catch(() => set({ gyro: false }));
                }}
              />
            </Row>
            {s.gyro && (
              <>
                <Row name="Gyroscope sensitivity">
                  <Slider value={s.gyroSens} min={0.2} max={3} step={0.05} onChange={(v) => set({ gyroSens: v })} fmt={(v) => v.toFixed(2)} />
                </Row>
                <Row name="Gyroscope only while aiming">
                  <Switch on={s.gyroAdsOnly} onChange={(v) => set({ gyroAdsOnly: v })} />
                </Row>
              </>
            )}
            <Row name="Fullscreen when playing" hint="Phones: enter fullscreen and lock landscape on Tap to Play.">
              <Switch on={s.autoFullscreen} onChange={(v) => set({ autoFullscreen: v })} />
            </Row>
          </>
        )}
        {tab === 'gameplay' && (
          <>
            <div className="row" style={{ justifyContent: 'center', height: 120, background: 'linear-gradient(135deg,#3a3f47,#1b1d21)', position: 'relative', marginBottom: 10 }}>
              <div style={{ position: 'absolute', inset: 0 }}>
                <div className="hud" style={{ position: 'absolute' }}>
                  <Crosshair />
                </div>
              </div>
            </div>
            <Row name="Crosshair color">
              <input type="color" value={s.crosshair.color} onChange={(e) => set({ crosshair: { ...s.crosshair, color: e.target.value } })} />
            </Row>
            <Row name="Crosshair line length">
              <Slider value={s.crosshair.size} min={0} max={16} step={1} onChange={(v) => set({ crosshair: { ...s.crosshair, size: v } })} />
            </Row>
            <Row name="Crosshair gap">
              <Slider value={s.crosshair.gap} min={0} max={16} step={1} onChange={(v) => set({ crosshair: { ...s.crosshair, gap: v } })} />
            </Row>
            <Row name="Crosshair thickness">
              <Slider value={s.crosshair.thickness} min={1} max={6} step={1} onChange={(v) => set({ crosshair: { ...s.crosshair, thickness: v } })} />
            </Row>
            <Row name="Center dot">
              <Switch on={s.crosshair.dot} onChange={(v) => set({ crosshair: { ...s.crosshair, dot: v } })} />
            </Row>
            <Row name="Outline">
              <Switch on={s.crosshair.outline} onChange={(v) => set({ crosshair: { ...s.crosshair, outline: v } })} />
            </Row>
            <Row name="Dynamic spread" hint="Crosshair expands with movement & firing.">
              <Switch on={s.crosshair.dynamic} onChange={(v) => set({ crosshair: { ...s.crosshair, dynamic: v } })} />
            </Row>
            <Row name="Damage direction indicators">
              <Switch on={s.damageIndicators} onChange={(v) => set({ damageIndicators: v })} />
            </Row>
            <Row name="Show minimap">
              <Switch on={s.showMinimap} onChange={(v) => set({ showMinimap: v })} />
            </Row>
            <Row name="Show FPS / ping">
              <Switch on={s.showNetStats} onChange={(v) => set({ showNetStats: v })} />
            </Row>
            {!inGame && (
              <Row name="Reset everything" hint="Restores all defaults (keeps nothing).">
                <button className="btn small danger" onClick={() => s.reset()}>
                  Reset all
                </button>
              </Row>
            )}
          </>
        )}
      </div>
    </div>
  );
}
