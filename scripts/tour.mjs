// Visual tour of Frontier: teleports around and captures screenshots at different times of day and weather.
// Usage: npm run build && node scripts/tour.mjs [screenshotDir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Prefer a GPU browser (CHROMIUM_PATH, Chrome, Brave, Edge); fall back to Playwright's Chromium with SwiftShader. */
function pickBrowser() {
  const gpuArgs = ['--headless=new', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'];
  const cands = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/opt/brave.com/brave/brave', '/usr/bin/microsoft-edge'].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return { executablePath: c, args: gpuArgs };
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const p = path.join(base, d, 'chrome-linux64/chrome');
    if (d.startsWith('chromium-') && fs.existsSync(p)) return { executablePath: p, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  }
  return { args: [] };
}

const out = process.argv[2] ?? path.join(os.tmpdir(), 'phantom-shots');
fs.mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['apps/server/dist/index.js', '--port', '3221'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes('online') && r()));
const browser = await chromium.launch(pickBrowser());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => localStorage.setItem('phantom.settings.v1', JSON.stringify({ state: { nickname: 'Scout', character: 'specter', quality: 'high', shadows: 'high', skin: 'nebula', showNetStats: true }, version: 0 })));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.goto('http://127.0.0.1:3221');
await page.getByRole('button', { name: /^Practice range/ }).click();
await page.getByRole('button', { name: /Explore Frontier/ }).click();
await page.getByRole('button', { name: 'Enter range' }).click();
await page.getByText('CLICK TO PLAY').waitFor({ timeout: 120000 });
await page.getByText('CLICK TO PLAY').click();
const shot = async (name, x, z, yaw, pitch, time, weather, wait = 2500) => {
  await page.evaluate(([x, z, yaw, pitch, time, weather]) => {
    const g = window.__phantomGame;
    const m = g.conn.match;
    const p = m.players.get('you');
    if (x !== null) {
      p.x = x; p.z = z; p.y = m.groundY(x, z); p.vx = p.vy = p.vz = 0;
    }
    g.yaw = yaw; g.pitch = pitch;
    m.state.env.time = time; m.state.env.weather = weather;
  }, [x, z, yaw, pitch, time, weather]);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
};
// quick transitions: let the atmosphere converge
await shot('t1-city-noon', 20, -95, Math.PI, 0.05, 12.5, 'clear', 6000);
await shot('t2-forest-golden', -430, 160, 0.8, 0.02, 18.2, 'clear', 7000);
await shot('t3-lake-dawn', -300, 230, 0.6, -0.05, 6.6, 'clear', 7000);
await shot('t4-mountain', -60, 395, 0.4, 0.15, 11, 'overcast', 7000);
await shot('t5-harbor-night-storm', 280, -280, 2.3, 0.05, 22.5, 'storm', 9000);
await shot('t6-city-night-rain', 0, -62, Math.PI, 0.12, 23, 'rain', 8000);
await shot('t7-airfield-fog', 330, 60, -Math.PI / 2, 0, 8, 'fog', 8000);
await page.keyboard.press('KeyM');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/t8-worldmap.png` });
console.log('fps', await page.evaluate(() => window.__phantomGame.fps), 'errors', errs.slice(0, 6));
await browser.close();
server.kill();
