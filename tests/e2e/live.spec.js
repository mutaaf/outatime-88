// Live races (sprint 3) end to end: two real browsers, the real Worker + Durable Objects
// (wrangler dev, see playwright.config.js). Measures the headline goal: from a share link to
// racing in at most 3 taps.
import { test, expect } from '@playwright/test';
import { LIVE_PORT } from '../../playwright.config.js';
import { LENGTHS } from '../../src/worker/live-rules.js';

const BASE = `http://127.0.0.1:${LIVE_PORT}`;
const TEST_LEN = LENGTHS.findIndex((l) => l.test);
test.describe.configure({ mode: 'serial' });
// Room creation is throttled per IP (10 a minute, src/worker/live.js), so later tests reuse
// the first test's room where they can.
let sharedCode = null;

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
  sharedCode = code;

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
  // The first-run thumb guide never covers a live race (live races can't pause).
  await expect(guest.page.locator('#tcCoach')).toHaveCount(0);
  await expect(guest.page.locator('#tcGuide')).toHaveCount(0);
  // Quick chat: the guest's emote pops over their car on the host's screen, mid-race.
  expect(await guest.page.evaluate(() => window.__OT.live.emote(2))).toBe(true);
  await host.page.waitForFunction(() => window.__OT.live.ghosts.some((g) => !g.cpu && g.ghostTag.includes('🔥')), null, { timeout: 5_000 });

  // The shared race HUD ranks the whole room: you + 1 friend + 4 CPU cars.
  await expect.poll(() => guest.page.evaluate(() => window.__OT.GameState.totalRacers)).toBe(6);

  // Both cross the line; results land on both screens in the same order. Put each car just
  // short of the flag rather than leaving it to drive there: on a starved runner one page's sim
  // can crawl (or get boxed in behind traffic), and the room then waits out its 30 s finish
  // grace (LIVE.finishGraceMs), the same 30 s this check allows.
  for (const p of [host.page, guest.page]) {
    await p.evaluate(() => { const g = window.__OT.GameState; g.distance = Math.max(g.distance, g.raceLength - 15); g.speed = Math.max(g.speed, 90); });
  }
  for (const p of [host.page, guest.page]) await expect(p.locator('#livePodium li')).toHaveCount(6, { timeout: 30_000 });
  for (const p of [host.page, guest.page]) await expect(p.locator('#liveResTitle')).toHaveText(/RESULTS/, { timeout: 30_000 });
  const order = await Promise.all([host.page, guest.page].map((p) => p.locator('#livePodium li span').allInnerTexts()));
  expect(order[0]).toEqual(order[1]);
  // The top three stand on a podium with their cars.
  await expect(host.page.locator('#liveSteps li')).toHaveCount(3);
  await expect(host.page.locator('#liveSteps li canvas[data-car]')).toHaveCount(3);

  // Rematch keeps the room together: one tap each, auto countdown, race 2.
  await host.page.locator('#liveRematch').click();
  await guest.page.locator('#liveRematch').click();
  for (const p of [host.page, guest.page]) {
    await p.waitForFunction(() => window.__OT.live.room && window.__OT.live.room.race === 2, null, { timeout: 15_000 });
  }

  // A third friend opens the link mid-race: they watch it live and are on the next grid.
  await host.page.waitForFunction(() => window.__OT.live.room.state === 'RACING', null, { timeout: 15_000 });
  const late = await newPlayer(browser, { width: 1180, height: 820 });
  await late.page.goto(`/outatime/?room=${code}&debug`);
  await expect(late.page.locator('#liveSpec')).toBeVisible();
  await expect(late.page.locator('#liveSpec li')).toHaveCount(2);
  await expect(late.page.locator('#liveSpec li em').first()).toHaveText(/\d+%|🏁/);
  await expect(late.page.locator('#liveGrid li.you .live-flag')).toContainText('NEXT RACE');
  await expect(late.page.locator('#liveReady')).toBeDisabled();
  expect(late.problems).toEqual([]);
  await late.ctx.close();

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

test('RACE AGAIN takes you back to your crew’s room — or a fresh one if it closed', async ({ browser }) => {
  test.skip(!sharedCode, 'needs the first test’s room');
  const code = sharedCode;
  const a = await newPlayer(browser, { width: 1280, height: 720 });
  const b = await newPlayer(browser, { width: 390, height: 844 });
  await a.page.goto('/outatime/?debug');
  await a.page.locator('#btnOpenLive').click();
  await expect(a.page.locator('#liveAgain')).toBeHidden(); // no crew yet
  // b opens a friend's link; a is in that room too, then leaves to the menu.
  await b.page.goto(`/outatime/?room=${code}&debug`);
  await expect(b.page.locator('#liveGrid li.you')).toHaveCount(1);
  const bName = await b.page.locator('#liveGrid li.you .live-name').innerText();
  await a.page.evaluate((c) => window.__OT.live.join(c), code);
  await expect(a.page.locator('#liveGrid li.you')).toHaveCount(1);
  await expect(a.page.locator('#liveGrid li:not(.cpu)', { hasText: bName.replace(/\W/g, '') })).toHaveCount(1);
  await a.page.locator('.live-lobby .live-x').click();
  await a.page.locator('#btnOpenLive').click();
  await expect(a.page.locator('#liveAgain')).toContainText(bName.replace(/\W/g, ''));
  await a.page.locator('#liveAgain').click();
  await expect(a.page.locator('#liveCode')).toHaveText(code);
  await expect(a.page.locator('#liveGrid li.you')).toHaveCount(1);

  // A crew whose room has closed: one tap still lands you in a (new) room.
  await a.page.evaluate(() => localStorage.setItem('outatime_live_crew_v1', JSON.stringify({ code: 'BCDF', at: Date.now(), names: ['ZZZ'], races: 1 })));
  await a.page.locator('.live-lobby .live-x').click();
  await a.page.locator('#btnOpenLive').click();
  await a.page.locator('#liveAgain').click();
  await expect(a.page.locator('#liveCode')).toHaveText(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  await expect(a.page.locator('#liveCode')).not.toHaveText('BCDF');
  await expect(a.page.locator('#liveGrid li.you')).toHaveCount(1);
  expect(a.problems).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});

test('a mistyped code explains itself instead of doing nothing', async ({ browser }) => {
  const a = await newPlayer(browser, { width: 390, height: 844 });
  await a.page.goto('/outatime/?debug');
  await a.page.locator('#btnOpenLive').click();
  await a.page.locator('#liveCodeInput').fill('ABCD'); // vowels are never in a code
  await a.page.locator('.live-code-form button').click();
  await expect(a.page.locator('#liveCodeHint')).toContainText('4 letters');
  await expect(a.page.locator('.live-menu')).toBeVisible();
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
