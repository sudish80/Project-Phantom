import { useHud } from '../stores/hud';
import { useHudSlot } from '../stores/layout';

const LABELS: [number, string][] = [
  [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
];

/** Heading strip + clock/weather + marker bearing & distance (open world). */
export function Compass() {
  const h = useHud();
  const slot = useHudSlot('compass');
  if (!h.openWorld || !h.alive) return null;
  // yaw 0 looks -Z (south; +Z is north) → bearing 180°, yaw +90° looks west → 270°
  const bearing = ((180 + (h.heading * 180) / Math.PI) % 360 + 360) % 360;
  const W = 420, span = 140;
  const items: { x: number; label: string; major: boolean }[] = [];
  for (let d = 0; d < 360; d += 15) {
    let rel = d - bearing;
    if (rel > 180) rel -= 360;
    if (rel < -180) rel += 360;
    if (Math.abs(rel) > span / 2) continue;
    const lab = LABELS.find(([a]) => a === d);
    items.push({ x: W / 2 + (rel / span) * W, label: lab ? lab[1] : String(d), major: !!lab });
  }
  let marker: { x: number; dist: number } | null = null;
  if (h.marker) {
    const dx = h.marker.x - h.position.x, dz = h.marker.z - h.position.z;
    const mb = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
    let rel = mb - bearing;
    if (rel > 180) rel -= 360;
    if (rel < -180) rel += 360;
    marker = { x: W / 2 + (Math.max(-span / 2, Math.min(span / 2, rel)) / span) * W, dist: Math.round(Math.hypot(dx, dz)) };
  }
  const hh = Math.floor(h.timeOfDay), mm = Math.floor((h.timeOfDay % 1) * 60);
  const z = h.match?.zone;
  return (
    <div className="compass" {...slot}>
      <div className="compass-strip" style={{ width: W }}>
        {items.map((it) => (
          <span key={it.label + it.x.toFixed(0)} className={it.major ? 'major' : ''} style={{ left: it.x }}>
            {it.label}
          </span>
        ))}
        <i className="compass-center" />
        {marker && (
          <b className="compass-marker" style={{ left: marker.x }}>
            ◆<small>{marker.dist}m</small>
          </b>
        )}
      </div>
      <div className="compass-info">
        {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')} · {h.weather}
        {z && h.match?.mode === 'royale' && h.match.phase === 'live' && z.stage < 5 && (
          <span className="zone-tag">
            {' '}
            · Zone {z.shrinking ? 'closing' : 'shrinks in'} {Math.ceil(z.timer)}s
          </span>
        )}
      </div>
    </div>
  );
}
