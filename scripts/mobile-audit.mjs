// Mobile audit (local only, not shipped): plays the game on emulated phones/tablets and prints
// numbers + screenshots. node scripts/mobile-audit.mjs [baseURL] [outDir]
import { chromium, devices } from '@playwright/test';

const BASE = process.argv[2] || 'http://localhost:6017/outatime/';
const OUT = process.argv[3] || '/tmp/mobile-audit';
const PROFILES = [
  { name: 'iphone15', dev: devices['iPhone 15'], cpu: 1 },
  { name: 'iphoneSE', dev: devices['iPhone SE'], cpu: 2 },
  { name: 'pixel7', dev: devices['Pixel 7'], cpu: 1 },
  { name: 'lowend-android', dev: devices['Galaxy S5'], cpu: 4, net: true },
  { name: 'phone-landscape', dev: devices['iPhone 15 landscape'], cpu: 1 },
  { name: 'ipad-portrait', dev: devices['iPad (gen 7)'], cpu: 1 },
  { name: 'ipad-landscape', dev: devices['iPad (gen 7) landscape'], cpu: 1 },
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
for (const p of PROFILES) {
  if (only && !only.includes(p.name)) continue;
  const { defaultBrowserType, ...dev } = p.dev;
  const ctx = await browser.newContext({ ...dev, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
  if (p.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const r = { name: p.name, vw: dev.viewport.width, vh: dev.viewport.height };
  if (process.env.SEEN) await page.addInitScript(() => localStorage.setItem('outatime_cruisn_88_save_v2', JSON.stringify({ controls: { coachSeen: true } })));
  const t0 = Date.now();
  await page.goto(BASE + '?debug&intro');
  await page.locator('#btnStartRace').waitFor({ state: 'visible', timeout: 60000 });
  r.titleMs = Date.now() - t0;
  await page.screenshot({ path: `${OUT}/${p.name}-1-title.png` });
  const t1 = Date.now();
  await page.locator('#btnStartRace').tap();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${p.name}-2-after-start.png` });
  // Wait for GO without skipping, but tap any onboarding/coach overlay that blocks.
  let raced = false;
  for (let i = 0; i < 200; i++) {
    const st = await page.evaluate(() => ({ ph: window.__OT.GameState.racePhase, s: window.__OT.GameState.status }));
    if (st.ph === 'RACING' && st.s === 'PLAYING') { raced = true; break; }
    const coach = page.locator('#btnCoachGo').first();
    if (await coach.isVisible().catch(() => false)) { await coach.tap().catch(() => {}); r.coachTapped = true; }
    await page.waitForTimeout(100);
  }
  r.toGoMs = raced ? Date.now() - t1 : null;
  r.totalToRaceMs = raced ? Date.now() - t0 : null;
  await page.screenshot({ path: `${OUT}/${p.name}-3-go.png` });
  // Controls geometry.
  r.controls = await page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('[id^="tc"], .tc-btn, #touchStick, .touch-stick')) {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (b.width === 0 || cs.display === 'none' || cs.visibility === 'hidden') continue;
      out[el.id || el.className] = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    }
    return out;
  });
  r.settings = await page.evaluate(() => ({ autoGas: window.__OT.GameState.autoGas, steer: (window.__OT.controls() || {}).movement, gfxRes: window.__OT.gfx && window.__OT.gfx() && window.__OT.gfx().q && window.__OT.gfx().q.res, canvas: [document.getElementById('gameCanvas')?.width, document.getElementById('gameCanvas')?.height], dpr: devicePixelRatio }));
  // Steer with a touch on the left third while holding NOS on the right (multi-touch).
  const vw = dev.viewport.width, vh = dev.viewport.height;
  const sx = Math.round(vw * 0.18), sy = Math.round(vh * 0.8);
  const boost = r.controls.tcHorn;
  const pts = (x) => [{ x, y: sy, id: 1 }].concat(boost ? [{ x: boost[0] + boost[2] / 2, y: boost[1] + boost[3] / 2, id: 2 }] : []);
  const tIn = Date.now();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(sx) });
  for (let k = 1; k <= 6; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(sx + k * 8) });
  }
  const steerSeen = await page.evaluate(() => new Promise((res) => {
    const t = performance.now();
    const f = () => { const v = window.__OT.InputState.touchSteerVal; if (Math.abs(v) > 0.05 || performance.now() - t > 1000) res({ v, ms: performance.now() - t }); else requestAnimationFrame(f); };
    f();
  }));
  r.steerAfterDrag = +steerSeen.v.toFixed(2);
  r.steerLatencyMs = Date.now() - tIn;
  await page.waitForTimeout(800);
  r.nosHeld = await page.evaluate(() => ({ touchNos: window.__OT.InputState.touchNos, burning: window.__OT.GameState.nosBurning, x: +window.__OT.GameState.playerX.toFixed(3), yaw: +(window.__OT.GameState.carYaw || 0).toFixed(3) }));
  await page.screenshot({ path: `${OUT}/${p.name}-4-steer-nos.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // Frame pacing over 3 s + long tasks.
  r.frames = await page.evaluate(() => new Promise((res) => {
    const iv = []; let last = performance.now(); let lt = 0, ltMax = 0;
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { lt++; ltMax = Math.max(ltMax, e.duration); } });
    try { po.observe({ type: 'longtask', buffered: false }); } catch (e) { /* not supported */ }
    const end = last + 3000;
    const f = (t) => { iv.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { po.disconnect(); iv.sort((a, b) => a - b); const avg = iv.reduce((a, b) => a + b, 0) / iv.length; res({ fps: +(1000 / avg).toFixed(1), p95: +iv[Math.floor(iv.length * 0.95)].toFixed(1), max: +iv[iv.length - 1].toFixed(1), longTasks: lt, longMax: Math.round(ltMax), res: window.__OT.gfx && window.__OT.gfx() && window.__OT.gfx().q ? window.__OT.gfx().q.res : null }); } };
    requestAnimationFrame(f);
  }));
  await page.screenshot({ path: `${OUT}/${p.name}-5-race.png` });
  // HUD overlap with controls.
  r.hud = await page.evaluate(() => {
    const ids = ['hudPosCard', 'hudTrack', 'hudTimes', 'hudSpeedCard', 'btnHudSettings'];
    const rects = ids.map((id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { id, b: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], font: getComputedStyle(e).fontSize } : null; }).filter(Boolean);
    return rects;
  });
  // Backgrounding.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  r.afterHide = await page.evaluate(() => ({ status: window.__OT.GameState.status, wake: 'wakeLock' in navigator }));
  r.manifest = await page.evaluate(() => !!document.querySelector('link[rel=manifest]'));
  r.errors = errors;
  report.push(r);
  console.log(JSON.stringify(r));
  await ctx.close();
}
await browser.close();
