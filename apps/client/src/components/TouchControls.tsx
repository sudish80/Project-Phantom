import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHARACTERS } from '@phantom/shared';
import type { Input } from '../game/engine/Input';
import { useSettings, type Action } from '../stores/settings';
import { useLayout, TOUCH_LABELS, type TouchId } from '../stores/layout';
import { useHud } from '../stores/hud';
import { useAim } from '../stores/aim';
import { useGameUi } from '../stores/gameUi';
import { ABILITY_ICONS } from './icons';

/** gyro: radians of view rotation per radian of device rotation = gyroSens (Game turns counts → rad) */
const RAD_PER_COUNT = 0.0016 * 2.4;
const DEADZONE = 0.12;

const code = (a: Action) => useSettings.getState().binds[a];

/** buttons that simply hold an action while pressed */
const HOLD: Partial<Record<TouchId, Action | 'Mouse0'>> = {
  fire: 'Mouse0',
  fireL: 'Mouse0',
  jump: 'jump',
  reload: 'reload',
  use: 'use',
  ab1: 'ab1',
  ab2: 'ab2',
  ab3: 'ab3',
  ult: 'ult',
  leanL: 'leanLeft',
  leanR: 'leanRight',
  walk: 'walk',
  drop: 'drop',
  scores: 'scoreboard',
};

const GLYPH: Partial<Record<TouchId, string>> = {
  fire: '◉',
  fireL: '◉',
  ads: '⌖',
  jump: '⤒',
  crouch: '⤓',
  reload: '↻',
  sprint: '»',
  swap: '⇄',
  use: '✋',
  leanL: '◁',
  leanR: '▷',
  walk: '⋯',
  drop: '⇣',
  buy: '$',
  scores: '☰',
  map: '◎',
  inspect: '👁',
  pause: 'Ⅱ',
};

interface Props {
  input: Input | null;
  /** HUD editor: buttons are dragged instead of pressed */
  editing?: boolean;
  selected?: TouchId | null;
  onSelect?: (id: TouchId) => void;
}

export function TouchControls({ input, editing = false, selected = null, onSelect }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const buttons = useLayout((s) => s.buttons);
  const setButton = useLayout((s) => s.setButton);
  const globalOpacity = useLayout((s) => s.buttonOpacity);
  const settings = useSettings();
  const hud = useHud();
  const [adsOn, setAdsOn] = useState(false);
  const [crouchOn, setCrouchOn] = useState(false);
  const [sprintLock, setSprintLock] = useState(false);
  const [pressed, setPressed] = useState<Partial<Record<TouchId, boolean>>>({});
  // floating stick centre (px) and knob offset (-1..1)
  const [stick, setStick] = useState<{ cx: number; cy: number; kx: number; ky: number } | null>(null);
  const roles = useRef(new Map<number, { kind: 'look' | 'stick' | 'button' | 'drag'; id?: TouchId; x: number; y: number; ox?: number; oy?: number }>());
  const sprintHeld = useRef(false);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ADS / crouch are toggles on touch: hold the virtual key while on
  useEffect(() => {
    if (!input || editing) return;
    if (adsOn) input.virtualDown('Mouse2');
    else input.virtualUp('Mouse2');
  }, [adsOn, input, editing]);
  useEffect(() => {
    if (!input || editing) return;
    if (crouchOn) input.virtualDown(code('crouch'));
    else input.virtualUp(code('crouch'));
  }, [crouchOn, input, editing]);
  // drop the aim toggle when the player dies or the weapon changes (like releasing the trigger)
  useEffect(() => {
    if (!hud.alive) setAdsOn(false);
  }, [hud.alive, hud.weapon]);

  // gyroscope aiming (landscape): rotationRate.beta ≈ yaw, gamma ≈ pitch
  useEffect(() => {
    if (!input || editing || !settings.gyro) return;
    let last = performance.now();
    const onMotion = (e: DeviceMotionEvent) => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = e.rotationRate;
      if (!r || useGameUi.getState().overlay !== null) return;
      if (settings.gyroAdsOnly && useAim.getState().adsT < 0.5) return;
      const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 90) as number;
      const sign = angle === 270 || angle === -90 ? -1 : 1;
      const k = ((settings.gyroSens * Math.PI) / 180) * dt / (RAD_PER_COUNT * Math.max(0.1, settings.touchSens));
      input.look(-(r.beta ?? 0) * sign * k, (r.gamma ?? 0) * sign * k);
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [input, editing, settings.gyro, settings.gyroSens, settings.gyroAdsOnly, settings.touchSens]);

  const px = (id: TouchId) => {
    const b = buttons[id];
    const d = b.size * size.h;
    return { left: b.x * size.w - d / 2, top: b.y * size.h - d / 2, d };
  };

  const setSprint = (on: boolean) => {
    if (!input || on === sprintHeld.current) return;
    sprintHeld.current = on;
    if (on) input.virtualDown(code('sprint'));
    else input.virtualUp(code('sprint'));
  };

  const updateStick = (cx: number, cy: number, x: number, y: number) => {
    const r = (buttons.stick.size * size.h) / 2;
    let kx = (x - cx) / r, ky = (y - cy) / r;
    const len = Math.hypot(kx, ky);
    if (len > 1) {
      kx /= len;
      ky /= len;
    }
    setStick({ cx, cy, kx, ky });
    if (!input) return;
    const l = Math.min(1, len);
    const live = l < DEADZONE ? 0 : (l - DEADZONE) / (1 - DEADZONE);
    const s = l > 0 ? live / l : 0;
    input.move.f = -ky * s;
    input.move.r = kx * s;
    const forward = input.move.f > 0.3 && Math.abs(input.move.r) < input.move.f;
    setSprint((settings.autoSprint && input.move.f > 0.88 && Math.abs(input.move.r) < 0.5) || (sprintLock && forward));
  };

  const releaseStick = () => {
    setStick(null);
    if (input) input.move.f = input.move.r = 0;
    setSprint(false);
  };

  // ── look surface: right side drags the view; the lower-left area spawns a floating stick ──
  const onSurfaceDown = (e: React.PointerEvent) => {
    if (editing || !input) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const inStickZone = e.clientX < size.w * 0.42 && e.clientY > size.h * 0.3;
    const hasStick = [...roles.current.values()].some((r) => r.kind === 'stick');
    if (inStickZone && !hasStick && !buttons.stick.hidden) {
      roles.current.set(e.pointerId, { kind: 'stick', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
      updateStick(e.clientX, e.clientY, e.clientX, e.clientY);
    } else roles.current.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
  };

  const onMove = (e: React.PointerEvent) => {
    const r = roles.current.get(e.pointerId);
    if (!r) return;
    if (r.kind === 'drag' && r.id) {
      const x = Math.min(0.98, Math.max(0.02, (e.clientX - (r.ox ?? 0)) / size.w));
      const y = Math.min(0.98, Math.max(0.02, (e.clientY - (r.oy ?? 0)) / size.h));
      setButton(r.id, { x, y });
      return;
    }
    if (!input) return;
    if (r.kind === 'stick') updateStick(r.ox!, r.oy!, e.clientX, e.clientY);
    else if (r.kind === 'look' || (r.kind === 'button' && (r.id === 'fire' || r.id === 'fireL') && settings.fireDragAim)) {
      input.look(e.clientX - r.x, e.clientY - r.y);
    }
    r.x = e.clientX;
    r.y = e.clientY;
  };

  const onUp = (e: React.PointerEvent) => {
    const r = roles.current.get(e.pointerId);
    roles.current.delete(e.pointerId);
    if (!r) return;
    if (r.kind === 'stick') releaseStick();
    if (r.kind === 'button' && r.id) buttonUp(r.id);
  };

  // ── buttons ──
  const buttonDown = (id: TouchId, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (editing) {
      onSelect?.(id);
      const b = buttons[id];
      roles.current.set(e.pointerId, { kind: 'drag', id, x: e.clientX, y: e.clientY, ox: e.clientX - b.x * size.w, oy: e.clientY - b.y * size.h });
      return;
    }
    if (!input) return;
    if (id === 'stick') {
      const p = px('stick');
      roles.current.set(e.pointerId, { kind: 'stick', x: e.clientX, y: e.clientY, ox: p.left + p.d / 2, oy: p.top + p.d / 2 });
      updateStick(p.left + p.d / 2, p.top + p.d / 2, e.clientX, e.clientY);
      return;
    }
    roles.current.set(e.pointerId, { kind: 'button', id, x: e.clientX, y: e.clientY });
    setPressed((p) => ({ ...p, [id]: true }));
    navigator.vibrate?.(8);
    const hold = HOLD[id];
    if (hold) {
      input.virtualDown(hold === 'Mouse0' ? 'Mouse0' : code(hold));
      return;
    }
    switch (id) {
      case 'ads':
        setAdsOn((v) => !v);
        break;
      case 'crouch':
        // sprinting → slide; otherwise toggle crouch
        if (useHud.getState().sprinting && !crouchOn) input.virtualTap(code('slide'));
        else setCrouchOn((v) => !v);
        break;
      case 'sprint':
        setSprintLock((v) => !v);
        break;
      case 'swap':
        input.wheelStep(1);
        setAdsOn(false);
        break;
      case 'buy':
        input.virtualTap(code('buy'));
        break;
      case 'map':
        input.virtualTap(code('worldMap'));
        break;
      case 'inspect':
        input.virtualTap(code('inspect'));
        break;
      case 'pause':
        useGameUi.getState().set({ overlay: 'pause' });
        break;
    }
  };

  const buttonUp = (id: TouchId) => {
    setPressed((p) => ({ ...p, [id]: false }));
    if (!input) return;
    const hold = HOLD[id];
    if (!hold) return;
    // the second fire button shares Mouse0: only release when neither is held
    if (hold === 'Mouse0') {
      const other = id === 'fire' ? 'fireL' : 'fire';
      if ([...roles.current.values()].some((r) => r.kind === 'button' && r.id === other)) return;
      input.virtualUp('Mouse0');
    } else input.virtualUp(code(hold));
  };

  // release everything if the controls unmount (menu opened, game left)
  useEffect(
    () => () => {
      if (!input) return;
      input.move.f = input.move.r = 0;
      for (const c of ['Mouse0', 'Mouse2']) input.virtualUp(c);
      for (const a of ['crouch', 'sprint', 'jump', 'reload', 'use', 'ab1', 'ab2', 'ab3', 'ult', 'leanLeft', 'leanRight', 'walk', 'drop', 'scoreboard'] as Action[]) input.virtualUp(code(a));
    },
    [input],
  );

  const def = CHARACTERS[hud.character];
  const abilityIdx: Partial<Record<TouchId, number>> = { ab1: 0, ab2: 1, ab3: 2, ult: 3 };
  const ids = Object.keys(buttons) as TouchId[];

  return (
    <div ref={rootRef} className={`touch-layer ${editing ? 'editing' : ''}`} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {!editing && <div className="touch-look" onPointerDown={onSurfaceDown} />}
      {ids.map((id) => {
        const b = buttons[id];
        if (b.hidden && !editing) return null;
        if (id === 'map' && !hud.openWorld && !editing) return null;
        if (id === 'buy' && !editing && hud.mode === 'royale') return null;
        const ai = abilityIdx[id];
        const ab = ai !== undefined ? def?.abilities[ai] : null;
        if (ai !== undefined && !ab && !editing) return null;
        const p = px(id);
        const opacity = editing ? (b.hidden ? 0.3 : 0.9) : b.opacity * globalOpacity;
        if (id === 'stick') {
          const free = stick && !editing;
          const cx = free ? stick.cx : p.left + p.d / 2;
          const cy = free ? stick.cy : p.top + p.d / 2;
          return (
            <div
              key={id}
              className={`tc-stick ${selected === id ? 'sel' : ''}`}
              style={{ left: cx - p.d / 2, top: cy - p.d / 2, width: p.d, height: p.d, opacity }}
              onPointerDown={(e) => buttonDown(id, e)}
            >
              <i className="tc-knob" style={{ translate: free ? `${stick.kx * p.d * 0.35}px ${stick.ky * p.d * 0.35}px` : undefined }} />
              {editing && <span className="tc-name">{TOUCH_LABELS[id]}</span>}
            </div>
          );
        }
        let state = '';
        if (id === 'ads' && adsOn) state = 'on';
        if (id === 'crouch' && crouchOn) state = 'on';
        if (id === 'sprint' && sprintLock) state = 'on';
        let cd: number | null = null;
        let ready = true;
        if (ab && ai !== undefined) {
          if (ai === 3) ready = hud.ult >= (ab.ultCost ?? 6) || hud.mode === 'practice';
          else {
            const st = hud.abilities[ai];
            ready = (st?.charges ?? 0) > 0;
            if (!ready && st && st.cd > 0) cd = Math.ceil(st.cd);
          }
        }
        return (
          <button
            key={id}
            type="button"
            className={`tc-btn tc-${id} ${state} ${pressed[id] ? 'down' : ''} ${selected === id ? 'sel' : ''} ${ready ? '' : 'cooling'}`}
            style={{ left: p.left, top: p.top, width: p.d, height: p.d, opacity, fontSize: p.d * 0.36, '--c': def?.color ?? '#ff4d2e' } as React.CSSProperties}
            onPointerDown={(e) => buttonDown(id, e)}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={TOUCH_LABELS[id]}
          >
            {ab ? <i className="tc-glyph" style={{ '--m': ABILITY_ICONS[ab.id] } as React.CSSProperties} /> : <span>{GLYPH[id]}</span>}
            {cd !== null && <b className="tc-cd">{cd}</b>}
            {editing && <span className="tc-name">{TOUCH_LABELS[id]}</span>}
          </button>
        );
      })}
    </div>
  );
}
