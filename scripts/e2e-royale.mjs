// Royale end-to-end: two clients create a Frontier Royale room, drop in, check loot / zone / skins / env sync.
// Usage: npm run build && node scripts/e2e-royale.mjs [screenshotDir]
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
const server = spawn(process.execPath, ['apps/server/dist/index.js', '--port', '3222'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes('online') && r()));
const browser = await chromium.launch(pickBrowser());
const mk = async (name, char, skin) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  await ctx.addInitScript(([n, c, s]) => localStorage.setItem('phantom.settings.v1', JSON.stringify({ state: { nickname: n, character: c, skin: s, quality: 'medium', shadows: 'low' }, version: 0 })), [name, char, skin]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:3222');
  return { page, errs };
};
const A = await mk('Alpha', 'bastion', 'inferno');
const B = await mk('Bravo', 'medic', 'aurora');
await A.page.getByRole('button', { name: /^Create room/ }).first().click();
await A.page.getByRole('button', { name: /^Royale/ }).click();
await A.page.locator('select').nth(0).selectOption('sunset');
await A.page.locator('select').nth(1).selectOption('dynamic');
await A.page.screenshot({ path: out + '/r0-create.png' });
await A.page.getByRole('button', { name: 'Create room', exact: true }).click();
const code = (await A.page.locator('.code-big').innerText()).trim();
await B.page.getByRole('button', { name: /^Join room/ }).click();
await B.page.locator('input.code').fill(code);
await B.page.getByRole('button', { name: 'Join', exact: true }).click();
await B.page.getByRole('button', { name: 'Ready up' }).click();
await A.page.getByText('Everyone is ready.').waitFor();
await A.page.screenshot({ path: out + '/r1-lobby.png' });
await A.page.getByRole('button', { name: 'Start match' }).click();
for (const P of [A, B]) {
  await P.page.getByText('CLICK TO PLAY').waitFor({ timeout: 120000 });
  await P.page.getByText('CLICK TO PLAY').click();
}
await A.page.waitForTimeout(4000);
await A.page.screenshot({ path: out + '/r2-drop-A.png' });
const info = await A.page.evaluate(() => {
  const g = window.__phantomGame;
  const m = g.latest.match;
  return { mode: m.mode, phase: m.phase, zone: m.zone && Math.round(m.zone.r), loot: g.loot.length, env: m.env, players: g.latest.players.map((p) => [p.name, p.skin, p.alive]) };
});
console.log(JSON.stringify(info));
// wait for warmup to end
await A.page.waitForTimeout(18000);
const phase = await A.page.evaluate(() => [window.__phantomGame.latest.match.phase, Math.round(window.__phantomGame.latest.match.zone.timer)]);
console.log('after warmup', phase);
await A.page.keyboard.press('KeyM');
await A.page.waitForTimeout(1200);
await A.page.screenshot({ path: out + '/r3-map-A.png' });
console.log('errors', A.errs.slice(0, 4), B.errs.slice(0, 4));
const ok = info.mode === 'royale' && info.loot > 50 && info.players.every((p) => p[2]) && phase[0] === 'live' && !A.errs.length && !B.errs.length;
console.log(ok ? 'ROYALE E2E OK' : 'ROYALE E2E FAIL', '— screenshots in', out);
if (!ok) process.exitCode = 1;
await browser.close();
server.kill();
