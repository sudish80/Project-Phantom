import { useEffect, useState } from 'react';
import { hudFx } from '../stores/hud';

interface Banner {
  id: number;
  count: number;
  head: boolean;
  color: string;
  label: string | null;
}

/**
 * Kill confirmation emblem (original design): an angular blade-diamond with one pip per kill in
 * the streak, popping in at the bottom-centre of the screen. Multi-kill callouts (FIRST BLOOD,
 * DOUBLE / TRIPLE / QUADRA KILL, ACE) appear above a HEADSHOT tag.
 */
export function KillBanner() {
  const [b, setB] = useState<Banner | null>(null);
  useEffect(() => {
    let id = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = hudFx.on((e) => {
      if (e.type !== 'kill') return;
      const myId = ++id;
      setB({ id: myId, count: e.count, head: e.head, color: e.color, label: e.label });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setB((cur) => (cur?.id === myId ? null : cur)), 2300);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!b) return null;
  const n = Math.min(5, b.count);
  const ace = b.count >= 5;
  return (
    <div key={b.id} className={`kill-banner ${ace ? 'ace' : ''}`} style={{ '--kc': b.color } as React.CSSProperties}>
      <svg viewBox="-60 -60 120 120" className="kill-emblem" aria-hidden>
        <defs>
          <linearGradient id="kbg" x1="0" y1="-1" x2="0" y2="1">
            <stop offset="0" stopColor="var(--kc)" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--kc)" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <g className="kill-spin">
          <path d="M0 -52 L44 0 L0 52 L-44 0 Z" fill="none" stroke="var(--kc)" strokeWidth="2.5" opacity="0.55" />
        </g>
        <path d="M0 -40 L30 -6 L12 -6 L22 40 L0 18 L-22 40 L-12 -6 L-30 -6 Z" fill="url(#kbg)" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" />
        <text x="0" y="8" textAnchor="middle" className="kill-num">
          {b.count}
        </text>
      </svg>
      <div className="kill-pips">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} className={i < n ? 'on' : ''} />
        ))}
      </div>
      {b.label && <div className="kill-callout">{b.label}</div>}
      {b.head && <div className="kill-label">HEADSHOT</div>}
    </div>
  );
}
