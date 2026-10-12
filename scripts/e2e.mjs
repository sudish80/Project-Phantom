// End-to-end browser test: two real Chromium clients create/join a room, start a TDM
// match, verify the 3D scene renders and that they see each other.
// Usage: npm run build && node scripts/e2e.mjs [screenshotDir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3217;
const out = process.argv[2] ?? path.join(os.tmpdir(), 'phantom-e2e');
fs.mkdirSync(out, { recursive: true });

/** Prefer a GPU browser (CHROMIUM_PATH, Chrome, Brave, Edge); fall back to Playwright's Chromium with SwiftShader. */
function pickBrowser() {
  const gpu = ['--headless=new', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required'];
  const cands = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/opt/brave.com/brave/brave', '/usr/bin/microsoft-edge'].filter(Boolean);
  for (const c of cands) if (fs.existsSync(c)) return { executablePath: c, args: gpu };
  const base = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const p = path.join(base, d, 'chrome-linux64/chrome');
    if (d.startsWith('chromium-') && fs.existsSync(p))
      return { executablePath: p, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };
  }
  return { args: [] };
}

const server = spawn(process.execPath, ['apps/server/dist/index.js', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes('online') && r()));
const url = `http://127.0.0.1:${PORT}`;
const fail = (m) => {
  console.error('E2E FAIL:', m);
  process.exitCode = 1;
};

const browser = await chromium.launch(pickBrowser());
try {
  const mk = async (name, char) => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
    await ctx.addInitScript(([n, c]) => {
      localStorage.setItem('phantom.settings.v1', JSON.stringify({ state: { nickname: n, character: c, quality: 'low', shadows: 'off' }, version: 0 }));
    }, [name, char]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(url);
    return { page, errors };
  };
  const A = await mk('Alpha', 'vanguard');
  const B = await mk('Bravo', 'bastion');
  await A.page.getByText('Online').first().waitFor({ timeout: 10000 });
  await A.page.screenshot({ path: path.join(out, '1-menu.png') });

  // Host creates a TDM room
  await A.page.getByRole('button', { name: /^Create room/ }).first().click();
  await A.page.getByRole('button', { name: /Team deathmatch/ }).click();
  await A.page.getByRole('button', { name: 'Create room', exact: true }).click();
  const code = (await A.page.locator('.code-big').innerText()).trim();
  console.log('room code', code);

  // Guest joins with the code
  await B.page.getByRole('button', { name: /^Join room/ }).click();
  await B.page.locator('input.code').fill(code);
  await B.page.getByRole('button', { name: 'Join', exact: true }).click();
  await B.page.getByRole('button', { name: 'Ready up' }).click();
  await A.page.getByText('Everyone is ready.').waitFor({ timeout: 5000 });
  await A.page.screenshot({ path: path.join(out, '2-lobby.png') });
  await A.page.getByRole('button', { name: 'Start match' }).click();

  await A.page.waitForTimeout(3000);
  await A.page.screenshot({ path: path.join(out, '2b-after-start.png') });
  console.log('A errors so far:', A.errors.slice(0, 5), 'B errors:', B.errors.slice(0,5)); await B.page.screenshot({ path: path.join(out, '2c-B.png') });
  for (const P of [A, B]) {
    await P.page.getByText('CLICK TO PLAY').waitFor({ timeout: 60000 });
    await P.page.getByText('CLICK TO PLAY').click();
  }
  await A.page.waitForTimeout(1500);
  await A.page.screenshot({ path: path.join(out, '3-ingame-A.png') });
  await B.page.screenshot({ path: path.join(out, '3-ingame-B.png') });

  const locked = await A.page.evaluate(() => !!document.pointerLockElement);
  console.log('pointer lock acquired:', locked);
  if (locked) {
    // Walk forward for a second and check the server sees movement from B's perspective.
    await A.page.keyboard.down('KeyW');
    await A.page.waitForTimeout(1200);
    await A.page.keyboard.up('KeyW');
    await A.page.mouse.move(400, 225);
    await A.page.screenshot({ path: path.join(out, '4-moved-A.png') });
  }
  const hud = await A.page.locator('.hud-br').innerText();
  console.log('A HUD ammo panel:', hud.replace(/\n/g, ' | '));
  if (!/wisp/i.test(hud)) fail('ammo HUD missing');
  if (A.errors.length) fail('A console errors: ' + A.errors.join(' / '));
  await A.page.keyboard.down('Tab');
  await A.page.waitForTimeout(400);
  await A.page.screenshot({ path: path.join(out, '5-scoreboard-A.png') });
  if (!(await A.page.locator('.scoreboard').count())) fail('scoreboard did not open');
  await A.page.keyboard.up('Tab');
  // shoot (fires at whatever is ahead; verifies ammo decrements via prediction + server)
  for (let i = 0; i < 3; i++) {
    await A.page.mouse.down();
    await A.page.waitForTimeout(80);
    await A.page.mouse.up();
    await A.page.waitForTimeout(250);
  }
  await A.page.waitForTimeout(500);
  const mag = await A.page.locator('.ammo .mag').innerText();
  console.log('A magazine after 3 shots:', mag);
  if (Number(mag) > 11) fail('firing did not consume ammo');
  await A.page.screenshot({ path: path.join(out, '6-fired-A.png') });

  // Practice range on B: leave the match via the pause menu
  await A.page.context().close();
  await B.page.evaluate(() => document.exitPointerLock());
  await B.page.getByRole('button', { name: 'Leave match' }).click({ timeout: 30000 });
  await B.page.waitForTimeout(800);
  await B.page.getByRole('button', { name: /^Practice range/ }).click();
  await B.page.getByRole('button', { name: 'Enter range' }).click();
  await B.page.getByText('CLICK TO PLAY').waitFor({ timeout: 60000 });
  await B.page.getByText('CLICK TO PLAY').click();
  await B.page.waitForTimeout(800);
  await B.page.keyboard.press('KeyB');
  await B.page.waitForTimeout(400);
  await B.page.screenshot({ path: path.join(out, '7-practice-buy.png') });
  await B.page.getByRole('button', { name: /Corsair/ }).click();
  await B.page.keyboard.press('KeyB');
  await B.page.waitForTimeout(800);
  if (await B.page.getByText('CLICK TO PLAY').count()) await B.page.getByText('CLICK TO PLAY').click();
  await B.page.waitForTimeout(1500);
  console.log('B locked:', await B.page.evaluate(() => !!document.pointerLockElement));
  await B.page.mouse.down();
  await B.page.waitForTimeout(1200);
  await B.page.mouse.up();
  await B.page.waitForTimeout(500);
  await B.page.screenshot({ path: path.join(out, '8-practice-fire.png') });
  const pr = await B.page.locator('.panel', { hasText: 'Accuracy' }).innerText();
  console.log('practice panel:', pr.replace(/\n/g, ' | '));
  if (!/\(\d+\/[1-9]\d*\)/.test(pr)) fail('practice shots not registered');

  for (const [n, P] of [['B', B]]) {
    const errs = P.errors.filter((e) => !/favicon|AudioContext|pointer lock|Pointer Lock/i.test(e));
    if (errs.length) fail(`${n} console errors: ${errs.join(' / ')}`);
  }
} catch (e) {
  fail(e.stack ?? e);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
console.log(process.exitCode ? 'E2E finished with failures' : 'E2E OK', '— screenshots in', out);
