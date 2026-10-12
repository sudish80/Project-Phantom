import type { ReticleKind } from '../game/weapons/Sights';
import { getSight } from '../game/weapons/Sights';
import { useHud } from '../stores/hud';
import { useAim } from '../stores/aim';

function Reticle({ kind, color, show, size }: { kind: ReticleKind; color: string; show: number; size?: number }) {
  if (kind === 'none' || show <= 0.02) return null;
  const common = { stroke: color, strokeWidth: 1.4, fill: 'none', vectorEffect: 'non-scaling-stroke' as const };
  const dot = (r = 2.2) => <circle cx={0} cy={0} r={r} fill={color} />;
  let body: React.ReactNode = null;
  switch (kind) {
    case 'dot':
      body = dot(3);
      break;
    case 'ringdot':
      body = (
        <>
          <circle cx={0} cy={0} r={18} {...common} opacity={0.9} />
          {dot(3)}
        </>
      );
      break;
    case 'chevron':
      body = (
        <>
          <path d="M -11 -8 L 0 4 L 11 -8" {...common} strokeWidth={2.2} />
          {dot(2)}
          <line x1={-16} y1={10} x2={16} y2={10} {...common} opacity={0.5} />
        </>
      );
      break;
    case 'cross':
    case 'illuminated':
      body = (
        <>
          <line x1={-34} y1={0} x2={-6} y2={0} {...common} />
          <line x1={6} y1={0} x2={34} y2={0} {...common} />
          <line x1={0} y1={-34} x2={0} y2={-6} {...common} />
          <line x1={0} y1={6} x2={0} y2={34} {...common} />
          {kind === 'illuminated' ? dot(2.8) : <circle cx={0} cy={0} r={1.4} fill={color} />}
        </>
      );
      break;
    case 'mildot':
      body = (
        <>
          <line x1={-50} y1={0} x2={-4} y2={0} {...common} />
          <line x1={4} y1={0} x2={50} y2={0} {...common} />
          <line x1={0} y1={-50} x2={0} y2={-4} {...common} />
          <line x1={0} y1={4} x2={0} y2={50} {...common} />
          {[-40, -28, -16].map((y) => (
            <line key={`t${y}`} x1={-4} y1={y} x2={4} y2={y} {...common} />
          ))}
          {[16, 28, 40].map((y) => (
            <line key={`b${y}`} x1={-4} y1={y} x2={4} y2={y} {...common} />
          ))}
          {[-40, -28, -16, 16, 28, 40].map((x) => (
            <circle key={`x${x}`} cx={x} cy={0} r={1.3} fill={color} />
          ))}
        </>
      );
      break;
    case 'bdc':
      body = (
        <>
          <line x1={-50} y1={0} x2={-4} y2={0} {...common} />
          <line x1={4} y1={0} x2={50} y2={0} {...common} />
          <line x1={0} y1={-50} x2={0} y2={-4} {...common} />
          {[12, 26, 42, 60].map((y, i) => (
            <line key={y} x1={-(16 - i * 3)} y1={y} x2={16 - i * 3} y2={y} {...common} />
          ))}
          <circle cx={0} cy={0} r={1.6} fill={color} />
        </>
      );
      break;
    case 'digital':
      body = (
        <>
          <path d="M -26 -26 L -34 -26 L -34 -18" {...common} />
          <path d="M 26 -26 L 34 -26 L 34 -18" {...common} />
          <path d="M -26 26 L -34 26 L -34 18" {...common} />
          <path d="M 26 26 L 34 26 L 34 18" {...common} />
          <line x1={-30} y1={0} x2={-8} y2={0} {...common} />
          <line x1={8} y1={0} x2={30} y2={0} {...common} />
          <line x1={0} y1={-30} x2={0} y2={-8} {...common} />
          <line x1={0} y1={8} x2={0} y2={30} {...common} />
          <circle cx={0} cy={0} r={3} fill={color} />
        </>
      );
      break;
    case 'smart':
      body = (
        <>
          <path d="M -30 -30 L -42 -30 L -42 -18" {...common} />
          <path d="M 30 -30 L 42 -30 L 42 -18" {...common} />
          <path d="M -30 30 L -42 30 L -42 18" {...common} />
          <path d="M 30 30 L 42 30 L 42 18" {...common} />
          <circle cx={0} cy={0} r={22} {...common} opacity={0.7} />
          {dot(2.6)}
        </>
      );
      break;
    case 'thermal':
      body = (
        <>
          <line x1={-40} y1={0} x2={-8} y2={0} {...common} strokeWidth={1.8} />
          <line x1={8} y1={0} x2={40} y2={0} {...common} strokeWidth={1.8} />
          <line x1={0} y1={-40} x2={0} y2={-8} {...common} strokeWidth={1.8} />
          <line x1={0} y1={8} x2={0} y2={40} {...common} strokeWidth={1.8} />
          <rect x={-16} y={-16} width={32} height={32} {...common} opacity={0.6} />
        </>
      );
      break;
    default:
      body = dot(2.4);
  }
  return (
    <svg
      className="optic-reticle"
      viewBox="-100 -100 200 200"
      style={
        size
          ? { color, opacity: show, width: `${size}vh`, height: `${size}vh`, clipPath: 'circle(50%)' }
          : { color, opacity: show, width: '22vh', height: '22vh' }
      }
      aria-hidden
    >
      <g style={{ filter: `drop-shadow(0 0 2px ${color})` }}>{body}</g>
    </svg>
  );
}

function ScopeTube({ radius, fx, opacity }: { radius: number; fx: string | null; opacity: number }) {
  const ring = `radial-gradient(circle at 50% 50%, transparent 0, transparent ${radius - 1.5}vh, rgba(0,0,0,0.97) ${radius}vh)`;
  return (
    <div className="scope-tube" style={{ background: ring, opacity, '--r': `${radius}vh` } as React.CSSProperties}>
      <div className={`scope-glass scope-glass-${fx ?? 'plain'}`} style={{ width: `${radius * 2}vh`, height: `${radius * 2}vh` }} />
    </div>
  );
}

function OpticEffect({ fx, amount }: { fx: string; amount: number }) {
  return <div className={`optic-fx optic-fx-${fx}`} style={{ opacity: amount }} aria-hidden><span className="optic-fx-grain" /></div>;
}

/**
 * Sight-aware ADS overlay: a scope tube and reticle for magnified optics, a floating
 * reticle for red dots / holos, and full-screen effects for thermal / night-vision /
 * digital / smart optics.
 */
export function OpticOverlay() {
  const hud = useHud();
  const aim = useAim();
  const h = { ...hud, adsT: aim.adsT, scopeT: aim.scopeT, zoom: aim.zoom, scoped: aim.scoped };
  const sight = getSight(h.sight);
  if (!h.alive) return null;
  const zoomed = h.scoped;
  const tube = sight.tube;
  // tube radius shrinks as magnification rises (uses the live, variable-zoom aware value)
  const radius = Math.max(13, Math.min(43, 40 * Math.sqrt(3 / Math.max(1, h.zoom))));
  const reticleOpacity = zoomed ? 1 : h.reticle === 'none' ? 0 : Math.min(1, h.adsT * 1.4);
  return (
    <div className="optic-overlay" style={{ pointerEvents: 'none' }}>
      {h.opticFx && h.adsT > 0.4 && <OpticEffect fx={h.opticFx} amount={Math.min(1, (h.adsT - 0.4) / 0.5)} />}
      {tube && h.scopeT > 0.01 && <ScopeTube radius={radius} fx={h.opticFx} opacity={h.scopeT} />}
      <Reticle kind={h.reticle} color={h.reticleColor} show={reticleOpacity} size={tube ? radius * 2 : undefined} />
    </div>
  );
}
