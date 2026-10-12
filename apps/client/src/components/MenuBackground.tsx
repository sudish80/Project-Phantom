import { useEffect, useRef } from 'react';

/**
 * Lightweight animated environmental backdrop (2D canvas — no GPU required):
 * layered industrial silhouettes, drifting dust, slow light sweeps and scan lines.
 */
export function MenuBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const layers = [0, 1, 2].map((li) => {
      const blocks: { x: number; w: number; h: number; lights: number[] }[] = [];
      let x = -50;
      while (x < 2600) {
        const bw = 40 + r() * 160;
        blocks.push({ x, w: bw, h: (0.15 + r() * 0.35) * (1 - li * 0.25), lights: Array.from({ length: Math.floor(r() * 6) }, () => r()) });
        x += bw + r() * 30;
      }
      return blocks;
    });
    const dust = Array.from({ length: 90 }, () => ({ x: r(), y: r(), s: 0.5 + r() * 1.8, v: 0.002 + r() * 0.01 }));
    const draw = (now: number) => {
      const t = now / 1000;
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b0c0f');
      sky.addColorStop(0.55, '#16151a');
      sky.addColorStop(1, '#2a1b16');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // glow near horizon
      const glow = g.createRadialGradient(w * 0.68, h * 0.72, 0, w * 0.68, h * 0.72, w * 0.6);
      glow.addColorStop(0, 'rgba(255,77,46,0.22)');
      glow.addColorStop(1, 'rgba(255,77,46,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);
      layers.forEach((blocks, li) => {
        const par = (li + 1) * 6;
        const off = (t * par) % 2400;
        const base = h * (0.95 - li * 0.08);
        const shade = 14 + li * 8;
        g.fillStyle = `rgb(${shade},${shade},${shade + 3})`;
        for (const b of blocks) {
          const x = ((b.x - off + 2400) % 2400) - 100;
          if (x > w + 50) continue;
          const bh = b.h * h;
          g.fillRect(x, base - bh, b.w, bh + h);
          b.lights.forEach((l, i) => {
            const on = Math.sin(t * 0.7 + l * 30) > -0.6;
            if (!on) return;
            g.fillStyle = li === 2 ? 'rgba(255,90,54,0.9)' : 'rgba(255,190,130,0.5)';
            g.fillRect(x + l * b.w, base - bh + 8 + i * 14, 3, 2);
            g.fillStyle = `rgb(${shade},${shade},${shade + 3})`;
          });
        }
      });
      // light sweep
      const sx = ((t * 0.06) % 1.6 - 0.3) * w;
      const sweep = g.createLinearGradient(sx - 200, 0, sx + 200, 0);
      sweep.addColorStop(0, 'rgba(255,255,255,0)');
      sweep.addColorStop(0.5, 'rgba(255,240,220,0.035)');
      sweep.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sweep;
      g.fillRect(0, 0, w, h);
      // dust
      for (const d of dust) {
        d.x += d.v * 0.016;
        d.y -= d.v * 0.006;
        if (d.x > 1) d.x -= 1;
        if (d.y < 0) d.y += 1;
        g.fillStyle = 'rgba(255,220,190,0.25)';
        g.fillRect(d.x * w, d.y * h, d.s, d.s);
      }
      // scanlines
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = (t * 20) % 4; y < h; y += 4) g.fillRect(0, y, w, 1);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return (
    <>
      <canvas ref={ref} className="menu-bg" />
      <div className="vignette" />
    </>
  );
}
