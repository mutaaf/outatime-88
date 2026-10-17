// Live races (sprint 3) end to end: two real browsers, the real Worker + Durable Objects
// (wrangler dev, see playwright.config.js). Measures the headline goal: from a share link to
// racing in at most 3 taps.
import { test, expect } from '@playwright/test';
import { LIVE_PORT } from '../../playwright.config.js';
import { LENGTHS } from '../../src/worker/live-rules.js';

const BASE = `http://127.0.0.1:${LIVE_PORT}`;
const TEST_LEN = LENGTHS.findIndex((l) => l.test);
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

/** Records when this page's race actually went green (local clock + server-clock estimate). */
const recordGreen = () => {
  const iv = setInterval(() => {
    const ot = window.__OT;
    if (ot && ot.GameState.status === 'PLAYING' && ot.GameState.mode === 'LIVE' && !window.__green) {
      window.__green = { at: Date.now(), startAt: ot.live.room && ot.live.room.startAt };
    }
  }, 5);
  window.addEventListener('beforeunload', () => clearInterval(iv));
};

async function newPlayer(browser, viewport) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(recordGreen);
  return { ctx, page, problems: watch(page) };
}

test('share link → lobby → racing in ≤3 taps, synced start, matching results, one-tap rematch', async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await newPlayer(browser, { width: 1280, height: 720 });
  const guest = await newPlayer(browser, { width: 820, height: 1180 }); // iPad portrait

  // Host: FRIENDS → START A ROOM.
  await host.page.goto('/outatime/?debug');
  await host.page.locator('#btnOpenLive').click();
  await host.page.locator("#liveCreate").click();
  await expect(host.page.locator('#liveCode')).toHaveText(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  const code = await host.page.locator('#liveCode').innerText();
  await expect(host.page.locator('#liveQrWrap')).toBeVisible(); // desktop shows a scannable QR
  await expect(host.page).toHaveURL(new RegExp(`room=${code}`));
  await host.page.evaluate((len) => window.__OT.live.debugSend({ t: 'cfg', len }), TEST_LEN);

  // Guest: opens the invite link — straight into the lobby with suggested initials, no setup.
  let guestTaps = 0;
  const tap = async (loc) => { guestTaps++; await loc.click(); };
  await guest.page.goto(`/outatime/?room=${code}&debug`);
  await expect(guest.page.locator('#liveGrid li:not(.cpu)')).toHaveCount(2);
  await expect(guest.page.locator('#liveGrid li.you .live-name')).toHaveText(/^[A-Z]{3}/);
  await expect(guest.page.locator('#titleScreen')).toBeHidden();
  await tap(guest.page.locator('#liveReady'));
  await expect(host.page.locator('#liveGrid li .live-flag', { hasText: 'READY' })).toHaveCount(1);

  // Host taps START NOW; both screens count down to the same server instant.
  await host.page.locator('#liveStart').click();
  for (const p of [host.page, guest.page]) await expect(p.locator('#liveCountdown')).toBeVisible();
  await expect(guest.page.locator('#liveGridList li')).toHaveCount(6); // the grid is called out: 2 humans + 4 CPU
  const greens = await Promise.all([host.page, guest.page].map((p) =>
    p.waitForFunction(() => window.__green, null, { timeout: 15_000 }).then((h) => h.jsonValue())));
  expect(greens[0].startAt).toBe(greens[1].startAt);
  expect(Math.abs(greens[0].at - greens[1].at)).toBeLessThan(400);
  expect(guestTaps).toBeLessThanOrEqual(3);

  // Each sees the other's car on the road (interpolated ghost with initials).
  await guest.page.waitForFunction(() => window.__OT.live.ghosts.some((g) => !g.cpu && g.progress > 20), null, { timeout: 10_000 });

  // The shared race HUD ranks the whole room: you + 1 friend + 4 CPU cars.
  await expect.poll(() => guest.page.evaluate(() => window.__OT.GameState.totalRacers)).toBe(6);

  // Both drive to the flag; results land on both screens in the same order.
  for (const p of [host.page, guest.page]) await expect(p.locator('#livePodium li')).toHaveCount(6, { timeout: 30_000 });
  for (const p of [host.page, guest.page]) await expect(p.locator('#liveResTitle')).toHaveText(/RESULTS/, { timeout: 30_000 });
  const order = await Promise.all([host.page, guest.page].map((p) => p.locator('#livePodium li span').allInnerTexts()));
  expect(order[0]).toEqual(order[1]);

  // Rematch keeps the room together: one tap each, auto countdown, race 2.
  await host.page.locator('#liveRematch').click();
  await guest.page.locator('#liveRematch').click();
  for (const p of [host.page, guest.page]) {
    await p.waitForFunction(() => window.__OT.live.room && window.__OT.live.room.race === 2, null, { timeout: 15_000 });
  }

  expect(host.problems).toEqual([]);
  expect(guest.problems).toEqual([]);
  await host.ctx.close();
  await guest.ctx.close();
});

test('a dropped connection slides back into the same seat', async ({ browser }) => {
  const a = await newPlayer(browser, { width: 1280, height: 720 });
  await a.page.goto('/outatime/?debug');
  await a.page.locator('#btnOpenLive').click();
  await a.page.locator("#liveCreate").click();
  await expect(a.page.locator('#liveGrid li.you')).toHaveCount(1);
  const before = await a.page.evaluate(() => window.__OT.live.room.players[0].id);
  await a.page.reload();
  await expect(a.page.locator('#liveGrid li.you')).toHaveCount(1);
  const after = await a.page.evaluate(() => window.__OT.live.room.players.map((p) => p.id));
  expect(after).toEqual([before]);
  expect(a.problems).toEqual([]);
  await a.ctx.close();
});

test('quick race drops you into a public room that starts by itself', async ({ browser }) => {
  const a = await newPlayer(browser, { width: 390, height: 844 });
  await a.page.goto('/outatime/?debug');
  await a.page.locator('#btnOpenLive').click();
  await a.page.locator("#liveQuick").click();
  await expect(a.page.locator('#liveStatus')).toContainText(/Quick race starts in \d+s/);
  await expect(a.page.locator('#liveStart')).toBeHidden();
  expect(a.problems).toEqual([]);
  await a.ctx.close();
});

const VIEWPORTS = [
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'iPad portrait', width: 820, height: 1180 },
  { name: 'iPad landscape', width: 1180, height: 820 },
  { name: 'small tablet landscape', width: 1024, height: 600 },
];

for (const vp of VIEWPORTS) {
  test(`lobby fits with no overlaps — ${vp.name}`, async ({ browser }) => {
    const a = await newPlayer(browser, { width: vp.width, height: vp.height });
    await a.page.goto('/outatime/?debug');
    await a.page.locator('#btnOpenLive').click();
    await a.page.locator("#liveCreate").click();
    await expect(a.page.locator('#liveCode')).toHaveText(/^[A-Z]{4}$/);
    await a.page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running')); // entrance pop
    const boxes = await a.page.evaluate(() => {
      const card = document.querySelector('.live-lobby');
      card.scrollTop = 0;
      const sel = ['#liveInvite', '.live-lobby .live-x', '#liveReady', '#liveStart', '#liveGrid li.you .live-edit', '#liveGrid li.you .live-car button'];
      const out = [];
      for (const s of sel) for (const el of document.querySelectorAll(s)) {
        if (!el.offsetParent) continue;
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        out.push({ s, x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight });
      }
      return out;
    });
    for (const b of boxes) {
      expect(b.x, b.s).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, b.s).toBeLessThanOrEqual(b.vw + 0.5);
      expect(Math.min(b.w, b.h), `${b.s} touch target`).toBeGreaterThanOrEqual(44); // invariant 3.5
    }
    // No two controls overlap (same scroll position, so compare after a final measure).
    // Scrolled-away parts of the middle are clipped by it, so only the visible part counts.
    const rects = await a.page.evaluate(() => {
      const body = document.querySelector('.live-lobby .live-body').getBoundingClientRect();
      return [...document.querySelectorAll('.live-lobby button')].filter((e) => e.offsetParent).map((e) => {
        const r = e.getBoundingClientRect();
        const clip = e.closest('.live-body') ? body : { top: -1e9, bottom: 1e9 };
        return { id: e.id || e.textContent.trim(), l: r.left, t: Math.max(r.top, clip.top), r: r.right, b: Math.min(r.bottom, clip.bottom) };
      }).filter((q) => q.b > q.t);
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const p = rects[i], q = rects[j];
        const overlap = Math.min(p.r, q.r) - Math.max(p.l, q.l) > 1 && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 1;
        expect(overlap, `${p.id} overlaps ${q.id}`).toBe(false);
      }
    }
    // The card never spills off screen; long content scrolls inside it.
    const card = await a.page.locator('.live-lobby').boundingBox();
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThanOrEqual(vp.height + 0.5);
    expect(a.problems).toEqual([]);
    await a.ctx.close();
  });
}
