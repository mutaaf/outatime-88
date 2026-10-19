// TV mode (ticket 0175) end to end: a TV page and a phone pad in two browser contexts, the
// real Worker + PadRoom Durable Object (wrangler dev, playwright.config.js). Pair by the QR
// link, start a race from the phone, steer with (simulated) tilt, and pause when the phone
// goes away. WebRTC is tried first; on CI runners the DataChannel may or may not connect, so
// the steering assertions hold on either path and the path used is recorded.
import { test, expect } from '@playwright/test';
import { LIVE_PORT } from '../../playwright.config.js';

const BASE = `http://127.0.0.1:${LIVE_PORT}`;
test.describe.configure({ mode: 'serial' });

function watch(page) {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) problems.push(`external: ${r.url()}`);
  });
  return problems;
}

test('TV pairs a phone by QR, the phone starts and steers the race, losing it pauses', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const probe = await request.post(`${BASE}/outatime/api/pad`);
  test.skip(probe.status() === 404 || probe.status() === 503, 'this Worker has no PadRoom yet (operator PR 0175)');

  const tvCtx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 720 } });
  const tv = await tvCtx.newPage();
  const tvProblems = watch(tv);
  await tv.goto('/outatime/?screen=tv&debug');
  await expect(tv.locator('#tvCode')).toHaveText(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  const code = await tv.locator('#tvCode').innerText();
  await expect(tv.locator('#tvQr')).toBeVisible();
  // The QR is drawn on the device and opens the phone controller for this code.
  const qrText = await tv.evaluate(async () => {
    const c = document.getElementById('tvQr');
    const ctx = c.getContext('2d');
    return { w: c.width, h: c.height, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) };
  });
  const { default: jsQR } = await import('jsqr');
  const decoded = jsQR(Uint8ClampedArray.from(qrText.data), qrText.w, qrText.h);
  expect(decoded && decoded.data).toBe(`${BASE}/outatime/?pad=${code}`);

  const padCtx = await browser.newContext({ baseURL: BASE, viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const phone = await padCtx.newPage();
  const padProblems = watch(phone);
  await phone.goto(`/outatime/?pad=${code}&debug`);
  await expect(phone).toHaveURL(/\/outatime\/pad(\.html)?\?pad=/);
  await phone.locator('#padGo').click();
  await expect(phone.locator('#padStatus')).toHaveText(/P1 · connected/, { timeout: 15_000 });
  await expect(tv.locator('#tvPair')).toBeHidden();
  await expect(tv.locator('#tvChip')).toHaveText(/P1 CONNECTED/);
  // Give WebRTC a moment; either path must work.
  await phone.waitForTimeout(1500);
  const path = await tv.evaluate(() => window.__OT_TV.path[0]);
  test.info().annotations.push({ type: 'tv-path', description: path });

  // ▶ on the phone starts the race on the TV.
  await phone.locator('#padStart').dispatchEvent('pointerdown');
  await expect.poll(() => tv.evaluate(() => window.__OT.GameState.status), { timeout: 20_000 }).toBe('PLAYING');
  await expect(phone.locator('#padStart')).toHaveText(/PAUSE/, { timeout: 5_000 });

  // Hold GAS: the TV car speeds up, and the phone's mini HUD follows.
  await phone.locator('#padGas').dispatchEvent('pointerdown');
  await tv.waitForFunction(() => window.__OT.GameState.speed > 25, null, { timeout: 10_000 });
  await expect.poll(async () => Number(await phone.locator('#padMph').innerText()), { timeout: 5_000 }).toBeGreaterThan(15);

  // Tilt right, then left: the TV's car moves that way.
  const x = () => tv.evaluate(() => window.__OT.GameState.playerX);
  await phone.evaluate(() => window.__PAD.setTilt(0)); // calibrated zero = 0 already
  await phone.evaluate(() => window.__PAD.setTilt(25));
  await tv.waitForFunction(() => window.__OT_TV.pads[0].s.steer > 0.6, null, { timeout: 5_000 });
  // The car carries its sideways momentum into each swerve (the handling model), and a loaded
  // runner steps the sim slowly, so wait for it to head the new way rather than a fixed 700 ms.
  const x0 = await x();
  await tv.waitForFunction((x0) => window.__OT.GameState.playerX > x0 + 0.02, x0, { timeout: 10_000 });
  await phone.evaluate(() => window.__PAD.setTilt(-25));
  await tv.waitForFunction(() => window.__OT_TV.pads[0].s.steer < -0.6, null, { timeout: 5_000 });
  const x2 = await tv.evaluate(() => new Promise((done) => {
    // The furthest right it gets before turning back.
    const g = window.__OT.GameState; let hi = g.playerX;
    const id = setInterval(() => { hi = Math.max(hi, g.playerX); if (g.playerX < hi - 0.02) { clearInterval(id); done(hi); } }, 5);
    setTimeout(() => { clearInterval(id); done(hi); }, 10_000);
  }));
  expect(await x()).toBeLessThan(x2);
  await phone.evaluate(() => window.__PAD.setTilt(0));

  // Pause and resume from the phone.
  await phone.locator('#padStart').dispatchEvent('pointerdown');
  await tv.waitForFunction(() => window.__OT.GameState.status === 'PAUSED');
  await expect(tv.locator('#tvBanner')).toHaveText(/PAUSED/);
  await phone.locator('#padStart').dispatchEvent('pointerdown');
  await tv.waitForFunction(() => window.__OT.GameState.status === 'PLAYING');

  // The phone goes away mid-race: the TV pauses instead of driving on.
  await padCtx.close();
  await tv.waitForFunction(() => window.__OT.GameState.status === 'PAUSED', null, { timeout: 8_000 });
  await expect(tv.locator('#tvBanner')).toHaveText(/DISCONNECTED/);

  expect(tvProblems).toEqual([]);
  expect(padProblems).toEqual([]);
  await tvCtx.close();
});

test('a wrong or expired code tells the phone what to do', async ({ browser, request }) => {
  const probe = await request.post(`${BASE}/outatime/api/pad`);
  test.skip(probe.status() === 404 || probe.status() === 503, 'this Worker has no PadRoom yet (operator PR 0175)');
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await ctx.newPage();
  await phone.goto('/outatime/pad.html');
  await phone.locator('#padCodeIn').fill('zzzz');
  await phone.locator('#padForm button').click();
  await phone.locator('#padGo').click();
  await expect(phone.locator('#padJoinErr')).toHaveText(/isn.t on any TV|isn.t connected/, { timeout: 10_000 });
  await ctx.close();
});

test('without WebRTC the phone still drives through the relay', async ({ browser, request }) => {
  test.setTimeout(60_000);
  const probe = await request.post(`${BASE}/outatime/api/pad`);
  test.skip(probe.status() === 404 || probe.status() === 503, 'this Worker has no PadRoom yet (operator PR 0175)');
  const tvCtx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 720 } });
  const tv = await tvCtx.newPage();
  await tv.goto('/outatime/?screen=tv&debug');
  await expect(tv.locator('#tvCode')).toHaveText(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  const code = await tv.locator('#tvCode').innerText();
  const padCtx = await browser.newContext({ baseURL: BASE, viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const phone = await padCtx.newPage();
  await phone.addInitScript(() => { delete window.RTCPeerConnection; });
  await phone.goto(`/outatime/pad.html?pad=${code}&debug`);
  await phone.locator('#padGo').click();
  await expect(phone.locator('#padStatus')).toHaveText(/connected · relay/, { timeout: 15_000 });
  await phone.locator('#padStart').dispatchEvent('pointerdown');
  await tv.waitForFunction(() => window.__OT.GameState.status === 'PLAYING', null, { timeout: 20_000 });
  await phone.locator('#padGas').dispatchEvent('pointerdown');
  await phone.evaluate(() => window.__PAD.setTilt(25));
  await tv.waitForFunction(() => window.__OT_TV.pads[0].s.steer > 0.6 && window.__OT.GameState.speed > 20, null, { timeout: 10_000 });
  expect(await tv.evaluate(() => window.__OT_TV.path[0])).toBe('relay');
  // The relay sends on change, capped at 30 Hz.
  const hz = await tv.evaluate(() => new Promise((r) => setTimeout(() => r(window.__OT_TV.pads[0].s.hz), 1500)));
  expect(hz).toBeLessThanOrEqual(34);
  await padCtx.close();
  await tvCtx.close();
});

test('guessing a code never takes over the TV: the TV role needs the secret key', async ({ browser, request }) => {
  const probe = await request.post(`${BASE}/outatime/api/pad`);
  test.skip(probe.status() === 404 || probe.status() === 503, 'this Worker has no PadRoom yet (operator PR 0175)');
  expect((await probe.json()).key).toMatch(/^[0-9a-f]{32}$/);
  const tvCtx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 720 } });
  const tv = await tvCtx.newPage();
  await tv.goto('/outatime/?tv&debug');
  await expect(tv.locator('#tvCode')).toHaveText(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  const code = await tv.locator('#tvCode').innerText();
  // Another device on our own origin that knows only the code.
  const otherCtx = await browser.newContext({ baseURL: BASE });
  const other = await otherCtx.newPage();
  await other.goto('/outatime/pad.html');
  const replies = await other.evaluate((c) => Promise.all(['', 'key=' + '0'.repeat(32)].map((q) => new Promise((resolve) => {
    const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/outatime/api/pad/${c}?role=tv&${q}`);
    ws.onmessage = (e) => resolve(e.data);
    ws.onclose = () => resolve('closed');
  }))), code);
  expect(replies).toEqual(['{"t":"err","code":"BAD_KEY"}', '{"t":"err","code":"BAD_KEY"}']);
  // The real TV still owns its code: a reload of its tab keeps the same one.
  await tv.reload();
  await expect(tv.locator('#tvCode')).toHaveText(code);
  await otherCtx.close();
  await tvCtx.close();
});
