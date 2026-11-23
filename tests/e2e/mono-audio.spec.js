// MONO AUDIO (ticket 0303): Settings → Sound → Output STEREO | MONO, saved as settings.mono
// ('mono'; STEREO deletes the key). MONO downmixes at the master gain, live, on the same context.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing } from './helpers.js';

const KEY = 'outatime_cruisn_88_save_v2';
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
const seed = (page, settings) => page.addInitScript(([k, s]) => {
  if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ initials: 'CLD', onboarded: true, settings: s }));
}, [KEY, settings]);
const audioReady = (page) => page.waitForFunction(() => window.__OT && window.__OT.audio);
const master = (page) => page.evaluate(() => {
  const se = window.__OT.audio();
  se.init(); // the test runs with autoplay allowed
  const m = se.masterGain;
  return { count: m.channelCount, mode: m.channelCountMode, interp: m.channelInterpretation, mono: se.mono };
});

for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`OUTPUT row at ${vp.width}x${vp.height}: MONO saves, downmixes, survives a reload; STEREO clears it`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await seed(page, {});
    await page.goto(`${APP}?debug`);
    await audioReady(page);
    expect(await master(page)).toMatchObject({ count: 2, mode: 'max', mono: false }); // default: stereo, as today
    await page.locator('#btnOpenSettings').click();
    const row = page.locator('[data-setting="mono"]');
    const stereo = row.locator('[data-value="stereo"]');
    const mono = row.locator('[data-value="mono"]');
    await expect(row).toHaveAttribute('aria-label', 'Audio output');
    await expect(stereo).toHaveAttribute('aria-pressed', 'true');
    await mono.scrollIntoViewIfNeeded();
    const box = await mono.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(vp.width < 500 ? 32 : 24);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    // Keyboard path: focus the button and press Enter.
    await mono.focus();
    await page.keyboard.press('Enter');
    await expect(mono).toHaveAttribute('aria-pressed', 'true');
    await expect(stereo).toHaveAttribute('aria-pressed', 'false');
    expect((await saved(page)).settings.mono).toBe('mono');
    expect(await master(page)).toEqual({ count: 1, mode: 'explicit', interp: 'speakers', mono: true });

    await page.reload();
    await audioReady(page);
    expect(await master(page)).toMatchObject({ count: 1, mode: 'explicit', mono: true });
    await page.locator('#btnOpenSettings').click();
    await expect(mono).toHaveAttribute('aria-pressed', 'true');
    await stereo.click();
    await expect(stereo).toHaveAttribute('aria-pressed', 'true');
    expect('mono' in (await saved(page)).settings).toBe(false);
    expect(await master(page)).toMatchObject({ count: 2, mode: 'max', mono: false });
    expect(problems).toEqual([]);
  });
}

test('junk in settings.mono reads as STEREO', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, { mono: 'left-only' });
  await page.goto(`${APP}?debug`);
  await audioReady(page);
  expect(await master(page)).toMatchObject({ count: 2, mono: false });
  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('[data-setting="mono"] [data-value="stereo"]')).toHaveAttribute('aria-pressed', 'true');
  expect(problems).toEqual([]);
});

test('mid-race: MONO applies at once on the same running context, and back', async ({ page }) => {
  const problems = watchPage(page);
  await seed(page, {});
  await page.goto(`${APP}?debug`);
  await audioReady(page);
  await page.evaluate(() => { window.__OT.audio().init(); window.__ctx0 = window.__OT.audio().ctx; });
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await page.locator('#btnHudSettings').click(); // the race pauses under the panel
  await page.locator('[data-setting="mono"] [data-value="mono"]').click();
  expect(await master(page)).toMatchObject({ count: 1, mono: true });
  await page.locator('[data-setting="mono"] [data-value="stereo"]').click();
  expect(await master(page)).toMatchObject({ count: 2, mono: false });
  expect(await page.evaluate(() => window.__OT.audio().ctx === window.__ctx0)).toBe(true); // no restart
  expect(problems).toEqual([]);
});

test('MONO through the real Web Audio downmix: a hard-panned tone reaches both ears, near a centred one', async ({ page }) => {
  await page.goto(`${APP}?debug`);
  await audioReady(page);
  // The game's own setMono on a real master node in an offline render: RMS per ear for a tone
  // panned hard right and one centred, in MONO and in STEREO.
  const r = await page.evaluate(async () => {
    const se = window.__OT.audio();
    const render = async (pan, mono) => {
      const ctx = new OfflineAudioContext(2, 4800, 48000);
      const masterGain = ctx.createGain();
      se.setMono.call({ masterGain }, mono);
      masterGain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      osc.connect(p).connect(masterGain);
      osc.start();
      const buf = await ctx.startRendering();
      const rms = (c) => { const d = buf.getChannelData(c); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); };
      return [rms(0), rms(1)];
    };
    return { monoHard: await render(1, true), monoMid: await render(0, true), stereoHard: await render(1, false) };
  });
  const db = (a, b) => 20 * Math.log10(a / b);
  expect(r.stereoHard[0]).toBeLessThan(0.01); // stereo: hard right is silent in the left ear (the problem)
  expect(r.monoHard[0]).toBeGreaterThan(0.1); // mono: both ears get it…
  expect(r.monoHard[0]).toBeCloseTo(r.monoHard[1], 4); // …equally
  expect(Math.abs(db(r.monoHard[0], r.monoMid[0]))).toBeLessThan(3.1); // within the equal-power pan law
});
