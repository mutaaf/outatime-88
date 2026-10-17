// Zero-login identity (ticket 0090) end to end, against the real Worker handlers.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';
import { createBackend } from './backend.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';
const ID_KEY = 'outatime88_identity_v1';
const activePub = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').racers?.[0]?.pub, ID_KEY);
const pillReads = (page, text) => expect(page.locator('#racerPillName')).toHaveText(text, { timeout: 15000 });

async function open(context, backend, { save } = {}) {
  const page = await context.newPage();
  const problems = watchPage(page);
  await backend.attach(page);
  if (save) await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [SAVE_KEY, JSON.stringify(save)]);
  await page.goto(APP);
  return { page, problems };
}

test('a racer is issued silently and survives losing the cookie, then localStorage too', async ({ context }) => {
  const backend = createBackend();
  const { page, problems } = await open(context, backend, { save: { initials: 'CLD', bestScore: 5000 } });
  await pillReads(page, 'CLD');
  await expect.poll(() => activePub(page)).toMatch(/^[a-z2-7]{12}$/);
  const pub = await activePub(page);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'ot_id')).toMatchObject({ httpOnly: true, path: '/outatime/' });

  await context.clearCookies();
  await page.reload();
  await pillReads(page, 'CLD');
  expect(await activePub(page)).toBe(pub);
  expect((await context.cookies()).some((c) => c.name === 'ot_id')).toBe(true);

  // Cookie and localStorage both gone: IndexedDB still has the racer.
  await context.clearCookies();
  await page.evaluate((k) => localStorage.removeItem(k), ID_KEY);
  await page.reload();
  await expect.poll(() => activePub(page)).toBe(pub);
  expect(problems).toEqual([]);
});

test('a link code moves a racer to a second device (QR deep link, one tap)', async ({ browser }) => {
  const backend = createBackend();
  const ipad = await browser.newContext();
  const phone = await browser.newContext();
  const a = await open(ipad, backend, { save: { initials: 'CLD', bestScore: 5000 } });
  await pillReads(a.page, 'CLD');
  await a.page.locator('#btnRacer').click();
  await a.page.locator('[data-racer-link]').click();
  await expect(a.page.locator('[data-racer-code]')).toHaveText(/^[A-Z2-9]{3} [A-Z2-9]{3}$/);
  const code = (await a.page.locator('[data-racer-code]').innerText()).replace(/\s/g, '');
  await expect(a.page.locator('[data-racer-qr]')).toBeVisible();
  await expect(a.page.locator('[data-racer-countdown]')).toContainText('Expires in 9:5');

  const b = await phone.newPage();
  const problems = watchPage(b);
  await backend.attach(b, '198.51.100.20');
  await b.goto(`${APP}?link=${code}`);
  await expect(b.locator('#racerModal')).toBeVisible();
  await expect(b.locator('[data-racer-input]')).toHaveValue(code);
  expect(new URL(b.url()).search).toBe(''); // the code doesn't linger in the address bar
  await b.locator('.racer-join button[type=submit]').click();
  await b.waitForLoadState('load');
  await pillReads(b, 'CLD');
  expect(await activePub(b)).toBe(await activePub(a.page));
  // Single use: the same code on a third device fails politely.
  const third = await (await browser.newContext()).newPage();
  watchPage(third);
  await backend.attach(third, '198.51.100.30');
  await third.goto(`${APP}?link=${code}`);
  await third.locator('.racer-join button[type=submit]').click();
  await expect(third.locator('[data-racer-msg]')).toContainText(/expired|used/i);
  expect(problems).toEqual([]);
});

test('siblings on one device switch racers with one tap and keep their own saves', async ({ context }) => {
  const backend = createBackend();
  const { page, problems } = await open(context, backend, { save: { initials: 'CLD', bestScore: 5000, fluxCoins: 777 } });
  await pillReads(page, 'CLD');
  await page.locator('#btnRacer').click();
  await page.locator('.racer-chip-add').click();
  await page.waitForLoadState('load');
  await pillReads(page, 'RACER');
  await expect(page.locator('#titleBestScore')).toHaveText('0');

  await page.locator('#btnRacer').click();
  await expect(page.locator('.racer-chip')).toHaveCount(3); // CLD, the new racer, + NEW RACER
  await page.locator('.racer-chip', { hasText: 'CLD' }).click();
  await page.waitForLoadState('load');
  await pillReads(page, 'CLD');
  await expect(page.locator('#titleBestScore')).toHaveText('5,000');
  await expect(page.locator('#titleTotalWarps')).toContainText('777');
  expect(problems).toEqual([]);
});

test('forget this device takes two taps and starts a fresh racer', async ({ context }) => {
  const backend = createBackend();
  const { page } = await open(context, backend, { save: { initials: 'CLD', bestScore: 5000 } });
  await pillReads(page, 'CLD');
  const before = await activePub(page);
  await page.locator('#btnRacer').click();
  await page.locator('[data-racer-forget]').click();
  await expect(page.locator('[data-racer-forget]')).toContainText('TAP AGAIN');
  await page.locator('[data-racer-forget]').click();
  await page.waitForLoadState('load');
  await pillReads(page, 'RACER');
  await expect.poll(() => activePub(page)).not.toBe(before);
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).racers.map((r) => r.pub), ID_KEY)).not.toContain(before);
});

// The racer panel on every phone/tablet shape, both orientations: nothing overlaps or hangs
// off the side, and every control is a thumb-sized target.
const SHAPES = [
  [390, 844], [844, 390], [360, 640], [768, 1024], [1024, 768], [820, 1180], [1180, 820], [1024, 1366], [1366, 1024], [1280, 720],
];
for (const [width, height] of SHAPES) {
  test(`racer panel fits without overlaps at ${width}x${height}`, async ({ page }) => {
    const backend = createBackend();
    const problems = watchPage(page);
    await backend.attach(page);
    await page.setViewportSize({ width, height });
    await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ initials: 'CLD' })), SAVE_KEY);
    await page.goto(APP);
    await pillReads(page, 'CLD');
    await page.locator('#btnRacer').click();
    await page.locator('[data-racer-link]').click();
    await page.locator('[data-racer-save]').click();
    await expect(page.locator('[data-racer-rcode]')).toHaveText(/-/);
    const items = await page.evaluate(() => [...document.querySelectorAll('#racerModal button, #racerModal input, #racerModal canvas, #racerModal .racer-code')]
      .filter((el) => el.getClientRects().length)
      .map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName, text: (el.textContent || el.id || '').trim().slice(0, 20), x: r.x, y: r.y, w: r.width, h: r.height }; }));
    expect(items.length).toBeGreaterThan(6);
    for (const a of items) {
      expect(a.x, `${a.text} off the left`).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w, `${a.text} off the right`).toBeLessThanOrEqual(width + 0.5);
      if (a.tag === 'BUTTON' || a.tag === 'INPUT') expect(a.h, `${a.text} too small`).toBeGreaterThanOrEqual(44);
      for (const b of items) {
        if (a === b) continue;
        const hit = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        expect(hit, `${a.text} overlaps ${b.text}`).toBe(false);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(problems).toEqual([]);
  });
}

test('the settings gear also opens the racer panel, on top', async ({ page }) => {
  const backend = createBackend();
  watchPage(page);
  await backend.attach(page);
  await page.goto(APP);
  await page.locator('#btnOpenSettings').click();
  await page.locator('[data-open-racer]').click();
  await expect(page.locator('#racerModal')).toBeVisible();
  const top = await page.evaluate(() => {
    const r = document.querySelector('[data-racer-link]').getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#racerModal') !== null;
  });
  expect(top).toBe(true);
});
