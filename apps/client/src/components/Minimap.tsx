import { useEffect, useRef } from 'react';
import type { MinimapData } from '../game/engine/Game';
import { useHudSlot } from '../stores/layout';

/** Top-down minimap (pre-rendered geometry + live markers for allies / revealed enemies). */
export function Minimap({ source }: { source: () => MinimapData | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const slot = useHudSlot('minimap');
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const S = 200;
    c.width = S * 2;
    c.height = S * 2;
    g.scale(2, 2);
    let bg: HTMLCanvasElement | null = null;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const d = source();
      if (!d) return;
      if (d.map.world && d.image) {
        // open world: north-up map centred on the player, 300 m across
        const half = d.map.world.half;
        const span = 300;
        const me = d.me ?? { x: 0, z: 0, yaw: 0 };
        const sc = S / span;
        const X = (x: number) => S / 2 + (x - me.x) * sc;
        const Y = (z: number) => S / 2 - (z - me.z) * sc;
        g.clearRect(0, 0, S, S);
        const imgPx = d.image.width / (half * 2);
        g.drawImage(d.image, (me.x - span / 2 + half) * imgPx, (half - me.z - span / 2) * imgPx, span * imgPx, span * imgPx, 0, 0, S, S);
        if (d.zone) {
          g.strokeStyle = 'rgba(90,150,255,0.95)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(X(d.zone.cx), Y(d.zone.cz), d.zone.r * sc, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([4, 4]);
          g.strokeStyle = 'rgba(255,255,255,0.8)';
          g.beginPath();
          g.arc(X(d.zone.nextCx), Y(d.zone.nextCz), d.zone.nextR * sc, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
        }
        for (const p of d.players) {
          if (!p.alive) continue;
          g.fillStyle = p.ally ? '#36c2ff' : '#ff4655';
          g.beginPath();
          g.arc(X(p.x), Y(p.z), 3.5, 0, Math.PI * 2);
          g.fill();
        }
        if (d.marker) {
          g.fillStyle = '#ffb347';
          const mx = Math.max(6, Math.min(S - 6, X(d.marker.x))), my = Math.max(6, Math.min(S - 6, Y(d.marker.z)));
          g.fillRect(mx - 4, my - 4, 8, 8);
        }
        g.save();
        g.translate(S / 2, S / 2);
        g.rotate(Math.PI + me.yaw);
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(0, -7);
        g.lineTo(5, 5);
        g.lineTo(-5, 5);
        g.closePath();
        g.fill();
        g.restore();
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.font = 'bold 11px sans-serif';
        g.fillText('N', S / 2 - 3, 12);
        return;
      }
      const b = d.map.bounds;
      const scale = Math.min(S / (b.maxX - b.minX), S / (b.maxZ - b.minZ)) * 0.94;
      const ox = S / 2 - ((b.minX + b.maxX) / 2) * scale;
      const oz = S / 2 + ((b.minZ + b.maxZ) / 2) * scale;
      // map: +X right, -Z up (attackers at bottom)
      const X = (x: number) => ox + x * scale;
      const Y = (z: number) => oz - z * scale;
      if (!bg) {
        bg = document.createElement('canvas');
        bg.width = S * 2;
        bg.height = S * 2;
        const bgc = bg.getContext('2d')!;
        bgc.scale(2, 2);
        bgc.fillStyle = 'rgba(40,42,48,0.65)';
        bgc.fillRect(X(b.minX), Y(b.maxZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
        for (const s of d.map.solids) {
          if (s.hidden || s.maxY < 0.9 || s.minY > 3) continue;
          bgc.fillStyle = s.maxY > 4 ? 'rgba(170,170,175,0.85)' : 'rgba(120,120,128,0.8)';
          bgc.fillRect(X(s.minX), Y(s.maxZ), (s.maxX - s.minX) * scale, (s.maxZ - s.minZ) * scale);
        }
        bgc.font = 'bold 14px sans-serif';
        bgc.textAlign = 'center';
        bgc.textBaseline = 'middle';
        for (const site of d.map.sites) {
          bgc.strokeStyle = 'rgba(255,90,54,0.6)';
          bgc.strokeRect(X(site.zone.minX), Y(site.zone.maxZ), (site.zone.maxX - site.zone.minX) * scale, (site.zone.maxZ - site.zone.minZ) * scale);
          bgc.fillStyle = 'rgba(255,90,54,0.9)';
          bgc.fillText(site.id, X(site.center.x), Y(site.center.z));
        }
      }
      g.clearRect(0, 0, S, S);
      g.drawImage(bg, 0, 0, S, S);
      const tri = (x: number, z: number, yaw: number, color: string, size = 5) => {
        g.save();
        g.translate(X(x), Y(z));
        g.rotate(Math.PI + yaw);
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, -size * 1.4);
        g.lineTo(size, size);
        g.lineTo(-size, size);
        g.closePath();
        g.fill();
        g.restore();
      };
      for (const p of d.players) {
        if (!p.alive) {
          g.strokeStyle = p.ally ? '#36c2ff' : '#ff4655';
          g.beginPath();
          g.moveTo(X(p.x) - 3, Y(p.z) - 3);
          g.lineTo(X(p.x) + 3, Y(p.z) + 3);
          g.moveTo(X(p.x) + 3, Y(p.z) - 3);
          g.lineTo(X(p.x) - 3, Y(p.z) + 3);
          g.stroke();
          continue;
        }
        tri(p.x, p.z, p.yaw, p.ally ? '#36c2ff' : '#ff4655', 4);
        if (p.carrier) {
          g.fillStyle = '#ff4d2e';
          g.fillRect(X(p.x) + 4, Y(p.z) - 8, 4, 4);
        }
      }
      if (d.charge) {
        g.fillStyle = d.charge.status === 'planted' ? '#ff4d2e' : '#ffb347';
        g.save();
        g.translate(X(d.charge.x), Y(d.charge.z));
        g.rotate(Math.PI / 4);
        g.fillRect(-4, -4, 8, 8);
        g.restore();
      }
      if (d.me) tri(d.me.x, d.me.z, d.me.yaw, '#ffffff', 5);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [source]);
  return <canvas ref={ref} className="minimap" {...slot} />;
}
