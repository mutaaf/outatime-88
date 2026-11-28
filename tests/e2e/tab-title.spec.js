// Ticket 0309: the browser tab title says PAUSED while the game is paused (Escape, blur, hidden
// tab) and is the page's own title again on resume, on the results and on the title screen.
// One write per transition, never per frame.
import { test, expect } from '@playwright/test';
import { APP, watchPage, nextFrames, racing } from './helpers.js';

test.use({ viewport: { width: 1280, height: 720 } });

const PAUSED = '⏸ PAUSED · OUTATIME 88';

test.beforeEach(async ({ page }) => {
  // Count every write to document.title.
  await page.addInitScript(() => {
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
    window.__titleWrites = 0;
    Object.defineProperty(document, 'title', {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) { window.__titleWrites++; d.set.call(this, v); },
    });
  });
});

/** A campaign race past the lights, with the race-late chunk (which owns the title) in. */
async function race(page) {
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.ready());
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/race-late-[^/]*\.js/.test(e.name)));
  await nextFrames(page, 3);
}
const title = (page) => page.evaluate(() => document.title);
const writes = (page) => page.evaluate(() => window.__titleWrites);
const status = (page) => page.evaluate(() => window.__OT.GameState.status);

test('Escape: PAUSED in the tab, one write each way, the original back exactly on resume', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  const base = await title(page);
  expect(base).toBe('OUTATIME 88: Neon Time-Warp Street Racer');
  expect(await writes(page)).toBe(0);

  await page.keyboard.press('Escape');
  await expect.poll(() => status(page)).toBe('PAUSED');
  await expect.poll(() => title(page)).toBe(PAUSED);
  await nextFrames(page, 20);
  expect(await writes(page)).toBe(1); // change-only: twenty paused frames wrote nothing more

  await page.keyboard.press('Escape');
  await expect.poll(() => status(page)).toBe('PLAYING');
  await expect.poll(() => title(page)).toBe(base);
  await nextFrames(page, 20);
  expect(await writes(page)).toBe(2);

  // QUIT TO HOME from the pause sheet: the title screen shows the page's own title.
  await page.keyboard.press('Escape');
  await expect.poll(() => title(page)).toBe(PAUSED);
  await page.locator('#garageModal .quit-home').click();
  await expect.poll(() => status(page)).toBe('TITLE');
  await expect.poll(() => title(page)).toBe(base);

  // A race that ends from a pause: the results show it too.
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => title(page)).toBe(PAUSED);
  await page.evaluate(() => window.__OT.finishRun());
  await expect.poll(() => status(page)).not.toBe('PAUSED');
  await expect.poll(() => title(page)).toBe(base);
  expect(await writes(page)).toBe(6);
  expect(problems).toEqual([]);
});

test('blur and a hidden tab: PAUSED, written at the hide itself (a hidden tab gets no frames)', async ({ page }) => {
  const problems = watchPage(page);
  await race(page);
  const base = await title(page);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => status(page)).toBe('PAUSED');
  await expect.poll(() => title(page)).toBe(PAUSED);
  await page.locator('#btnSettingsDone').click();
  await expect.poll(() => status(page)).toBe('PLAYING');
  await expect.poll(() => title(page)).toBe(base);

  // The hide is read in the same task as the event: no frame runs in between.
  const hidden = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    return { title: document.title, status: window.__OT.GameState.status };
  });
  expect(hidden).toEqual({ title: PAUSED, status: 'PAUSED' });
  await page.evaluate(() => {
    delete document.hidden; delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await nextFrames(page, 10);
  expect(await title(page)).toBe(PAUSED); // coming back is not a tap on RESUME
  await page.locator('#btnSettingsDone').click();
  await expect.poll(() => title(page)).toBe(base);
  expect(await writes(page)).toBe(4);
  expect(problems).toEqual([]);
});

test('a hidden tab says PAUSED even when a slow ads script holds back onload (settings-ui listens after this chunk)', async ({ page }) => {
  const problems = watchPage(page);
  // A slow link: the async ads loader holds the load event (where settings-ui adds its hide
  // listener) until after race-late has fetched the title chunk.
  await page.route('**/ads/v1/ads.js', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({ contentType: 'text/javascript', body: '/* ads stub */' });
  });
  await race(page);
  const hidden = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    return { title: document.title, status: window.__OT.GameState.status };
  });
  expect(hidden).toEqual({ title: PAUSED, status: 'PAUSED' });
  expect(problems).toEqual([]);
});
