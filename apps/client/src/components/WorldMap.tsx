import { useEffect, useRef } from 'react';
import type { MinimapData } from '../game/engine/Game';

/** Full-screen world map: named locations, roads, water, teammates, zone and a custom marker (click to place / right-click to clear). */
export function WorldMap({ source, setMarker, onClose }: { source: () => MinimapData | null; setMarker: (m: { x: number; z: number } | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const d = source();
      if (!d?.map.world || !d.image) return;
      const S = Math.min(c.clientWidth, c.clientHeight);
      if (c.width !== S * 2) {
        c.width = S * 2;
        c.height = S * 2;
      }
      g.setTransform(2, 0, 0, 2, 0, 0);
      const half = d.map.world.half;
      const X = (x: number) => ((x + half) / (half * 2)) * S;
      const Y = (z: number) => ((half - z) / (half * 2)) * S;
      g.drawImage(d.image, 0, 0, S, S);
      g.font = '600 13px Bahnschrift, sans-serif';
      g.textAlign = 'center';
      for (const p of d.map.world.pois) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(p.name.toUpperCase(), X(p.x) + 1, Y(p.z) + 1);
        g.fillStyle = p.kind === 'nature' || p.kind === 'landmark' ? '#d8f0c8' : '#fff4e0';
        g.fillText(p.name.toUpperCase(), X(p.x), Y(p.z));
      }
      if (d.zone) {
        g.strokeStyle = 'rgba(90,150,255,0.95)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(X(d.zone.cx), Y(d.zone.cz), (d.zone.r / (half * 2)) * S, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([6, 6]);
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.beginPath();
        g.arc(X(d.zone.nextCx), Y(d.zone.nextCz), (d.zone.nextR / (half * 2)) * S, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      for (const p of d.players) {
        if (!p.alive || !p.ally) continue;
        g.fillStyle = '#36c2ff';
        g.beginPath();
        g.arc(X(p.x), Y(p.z), 5, 0, Math.PI * 2);
        g.fill();
      }
      if (d.marker) {
        g.fillStyle = '#ffb347';
        g.save();
        g.translate(X(d.marker.x), Y(d.marker.z));
        g.rotate(Math.PI / 4);
        g.fillRect(-6, -6, 12, 12);
        g.restore();
      }
      if (d.me) {
        g.save();
        g.translate(X(d.me.x), Y(d.me.z));
        g.rotate(Math.PI + d.me.yaw);
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(0, -10);
        g.lineTo(7, 7);
        g.lineTo(-7, 7);
        g.closePath();
        g.fill();
        g.restore();
      }
      // scale bar
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(12, S - 30, (200 / (half * 2)) * S + 16, 20);
      g.fillStyle = '#fff';
      g.fillRect(20, S - 18, (200 / (half * 2)) * S, 3);
      g.textAlign = 'left';
      g.fillText('200 m', 22, S - 22);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source]);
  const toWorld = (e: React.MouseEvent) => {
    const d = source();
    if (!d?.map.world) return null;
    const r = ref.current!.getBoundingClientRect();
    const S = Math.min(r.width, r.height);
    const half = d.map.world.half;
    return { x: ((e.clientX - r.left) / S) * half * 2 - half, z: half - ((e.clientY - r.top) / S) * half * 2 };
  };
  return (
    <div className="overlay world-map" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="world-map-inner">
        <canvas
          ref={ref}
          className="world-map-canvas"
          onClick={(e) => setMarker(toWorld(e))}
          onContextMenu={(e) => {
            e.preventDefault();
            setMarker(null);
          }}
        />
        <div className="world-map-help">Click: place marker · Right-click: clear · [M] close</div>
      </div>
    </div>
  );
}
