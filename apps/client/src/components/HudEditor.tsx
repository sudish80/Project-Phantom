import { useEffect, useRef, useState } from 'react';
import { TouchControls } from './TouchControls';
import { useLayout, PANEL_LABELS, TOUCH_LABELS, type PanelId, type TouchId } from '../stores/layout';
import { useTouchMode } from '../stores/settings';

type Sel = { kind: 'button'; id: TouchId } | { kind: 'panel'; id: PanelId } | null;

/**
 * Drag-and-drop HUD layout editor. HUD panels are moved by dragging the outline drawn over
 * them; touch buttons are dragged directly. The inspector sets size / opacity / visibility.
 */
export function HudEditor({ onDone }: { onDone: () => void }) {
  const touch = useTouchMode();
  const L = useLayout();
  const [sel, setSel] = useState<Sel>(null);
  const [rects, setRects] = useState<{ id: PanelId; r: DOMRect }[]>([]);
  const drag = useRef<{ id: PanelId; x: number; y: number; dx: number; dy: number; pid: number } | null>(null);

  // track where the (live) HUD panels currently are
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const out: { id: PanelId; r: DOMRect }[] = [];
      document.querySelectorAll<HTMLElement>('[data-hud]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) out.push({ id: el.dataset.hud as PanelId, r });
      });
      setRects((prev) => (prev.length === out.length && prev.every((p, i) => p.id === out[i].id && Math.abs(p.r.x - out[i].r.x) < 0.5 && Math.abs(p.r.y - out[i].r.y) < 0.5 && Math.abs(p.r.width - out[i].r.width) < 0.5) ? prev : out));
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPanelDown = (id: PanelId, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSel({ kind: 'panel', id });
    const c = L.panels[id];
    drag.current = { id, x: e.clientX, y: e.clientY, dx: c.dx, dy: c.dy, pid: e.pointerId };
  };
  const onPanelMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    L.setPanel(d.id, { dx: d.dx + (e.clientX - d.x) / window.innerWidth, dy: d.dy + (e.clientY - d.y) / window.innerHeight });
  };
  const onPanelUp = () => {
    drag.current = null;
  };

  const hiddenButtons = (Object.keys(L.buttons) as TouchId[]).filter((k) => L.buttons[k].hidden);
  const hiddenPanels = (Object.keys(L.panels) as PanelId[]).filter((k) => L.panels[k].hidden);

  let inspector: React.ReactNode = null;
  if (sel?.kind === 'button') {
    const b = L.buttons[sel.id];
    inspector = (
      <>
        <b>{TOUCH_LABELS[sel.id]}</b>
        <label>
          Size
          <input type="range" min={0.05} max={0.45} step={0.005} value={b.size} onChange={(e) => L.setButton(sel.id, { size: Number(e.target.value) })} />
        </label>
        <label>
          Opacity
          <input type="range" min={0.15} max={1} step={0.05} value={b.opacity} onChange={(e) => L.setButton(sel.id, { opacity: Number(e.target.value) })} />
        </label>
        <button className="btn small" onClick={() => L.setButton(sel.id, { hidden: !b.hidden })}>
          {b.hidden ? 'Show' : 'Hide'}
        </button>
      </>
    );
  } else if (sel?.kind === 'panel') {
    const c = L.panels[sel.id];
    inspector = (
      <>
        <b>{PANEL_LABELS[sel.id]}</b>
        <label>
          Size
          <input type="range" min={0.5} max={1.8} step={0.05} value={c.scale} onChange={(e) => L.setPanel(sel.id, { scale: Number(e.target.value) })} />
        </label>
        <label>
          Opacity
          <input type="range" min={0.15} max={1} step={0.05} value={c.opacity} onChange={(e) => L.setPanel(sel.id, { opacity: Number(e.target.value) })} />
        </label>
        <button className="btn small" onClick={() => L.setPanel(sel.id, { hidden: !c.hidden })}>
          {c.hidden ? 'Show' : 'Hide'}
        </button>
        <button className="btn small" onClick={() => L.setPanel(sel.id, { dx: 0, dy: 0, scale: 1, opacity: 1 })}>
          Default position
        </button>
      </>
    );
  }

  return (
    <div className="hud-editor" onPointerMove={onPanelMove} onPointerUp={onPanelUp} onPointerCancel={onPanelUp}>
      <div className="hud-editor-grid" onPointerDown={() => setSel(null)} />
      {rects.map(({ id, r }) => (
        <div
          key={id}
          className={`he-panel ${sel?.kind === 'panel' && sel.id === id ? 'sel' : ''}`}
          style={{ left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 }}
          onPointerDown={(e) => onPanelDown(id, e)}
        >
          <span>{PANEL_LABELS[id]}</span>
        </div>
      ))}
      {touch && <TouchControls input={null} editing selected={sel?.kind === 'button' ? sel.id : null} onSelect={(id) => setSel({ kind: 'button', id })} />}
      <div className="he-bar panel">
        <b>Edit HUD</b>
        <label>
          HUD size
          <input type="range" min={0.6} max={1.5} step={0.05} value={L.hudScale} onChange={(e) => L.set({ hudScale: Number(e.target.value) })} />
        </label>
        {touch && (
          <label>
            Buttons
            <input type="range" min={0.2} max={1} step={0.05} value={L.buttonOpacity} onChange={(e) => L.set({ buttonOpacity: Number(e.target.value) })} />
          </label>
        )}
        <button className="btn small" onClick={() => L.reset()}>
          Reset all
        </button>
        <button className="btn small primary" onClick={onDone}>
          Done
        </button>
      </div>
      <div className="he-inspector panel">
        {inspector ?? <span className="dim">{touch ? 'Drag a button or panel to move it. Tap to select.' : 'Drag a panel to move it. Click to select.'}</span>}
        {(hiddenPanels.length > 0 || (touch && hiddenButtons.length > 0)) && (
          <div className="he-hidden">
            <span className="faint">Hidden:</span>
            {hiddenPanels.map((id) => (
              <button key={id} className="btn small" onClick={() => setSel({ kind: 'panel', id })}>
                {PANEL_LABELS[id]}
              </button>
            ))}
            {touch &&
              hiddenButtons.map((id) => (
                <button key={id} className="btn small" onClick={() => setSel({ kind: 'button', id })}>
                  {TOUCH_LABELS[id]}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
