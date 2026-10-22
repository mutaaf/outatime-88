// Ticket 0112: WARP READY must not rely on colour or glow alone. When a boost would fire the warp,
// the touch WARP button changes its label and grows an outer ring (both survive greyscale), the
// keyboard HUD's FLUX label reads WARP READY, and one rising tick plays through the SFX bus, once
// per fill. Reduced motion (the OS setting or the in-game calm setting) keeps the static marker
// and stops the pulse.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, simWait, touchReady } from './helpers.js';

const SAVE_KEY = 'outatime_cruisn_88_save_v2';

// Hold the meter at a level. sinceWarp stays 0 so neither the boost nor the 100%/88 mph auto
// warp can fire and spend it mid-test; the cue only looks at the meter.
const hold = (page, v) => page.evaluate((x) => {
  const g = window.__OT.GameState;
  clearInterval(window.__hold);
  const set = () => { g.fluxCharge = x; g.sinceWarp = 0; };
  set();
  window.__hold = setInterval(set, 10);
}, v);

// Count the cue's first note (playTone(740, 'triangle', …)); headless audio may never start,
// so count the call rather than listening for sound.
const spyCue = (page) => page.evaluate(() => {
  const a = window.__OT.audio();
  const orig = a.playTone.bind(a);
  window.__cues = 0;
  a.playTone = (f, type, ...rest) => { if (f === 740 && type === 'triangle') window.__cues++; return orig(f, type, ...rest); };
});
const cues = (page) => page.evaluate(() => window.__cues);

const boostState = (page) => page.evaluate(() => {
  const b = document.getElementById('tcBoost');
  const cs = getComputedStyle(b);
  return {
    ready: b.dataset.ready, label: b.querySelector('.tc-lbl').textContent, aria: b.getAttribute('aria-label'),
    outline: cs.outlineStyle, anim: cs.animationName, calm: b.classList.contains('tc-calm'),
  };
});

test.describe('touch, 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function race(page) {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, JSON.stringify({ bestScore: 5000, controls: { coachSeen: true } }));
        sessionStorage.setItem('seeded', '1');
      }
    }, SAVE_KEY);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await touchReady(page);
    await racing(page);
  }

  test('WARP button: label, ring and one tick on becoming ready, back when spent', async ({ page }) => {
    const problems = watchPage(page);
    await race(page);
    await spyCue(page);
    await hold(page, 40);
    await page.waitForFunction(() => document.getElementById('tcBoost').dataset.ready !== 'true');
    const off = await boostState(page);
    expect(off.label).toBe('WARP');
    expect(off.outline).toBe('none');

    await hold(page, 96);
    await page.waitForFunction(() => document.getElementById('tcBoost').dataset.ready === 'true');
    const on = await boostState(page);
    expect(on.label).toBe('▲ READY');
    expect(on.aria).toBe('WARP ready');
    expect(on.outline).toBe('solid'); // a shape change a greyscale screen still shows
    expect(on.anim).toBe('tc-ready');
    // Held ready for a second of play: exactly one cue.
    await simWait(page, 1);
    expect(await cues(page)).toBe(1);

    // Spent → back to WARP; the next fill cues again.
    await hold(page, 10);
    await page.waitForFunction(() => document.getElementById('tcBoost').dataset.ready === 'false');
    expect((await boostState(page)).label).toBe('WARP');
    await hold(page, 96);
    await page.waitForFunction(() => document.getElementById('tcBoost').dataset.ready === 'true');
    await simWait(page, 0.5);
    expect(await cues(page)).toBe(2);
    await page.evaluate(() => clearInterval(window.__hold));
    expect(problems).toEqual([]);
  });

  test('reduced motion: static ring and label, no pulse (OS setting and calm setting)', async ({ page }) => {
    const problems = watchPage(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await race(page);
    await hold(page, 96);
    await page.waitForFunction(() => document.getElementById('tcBoost').dataset.ready === 'true');
    let s = await boostState(page);
    expect(s.anim).toBe('none');
    expect(s.outline).toBe('solid');
    expect(s.label).toBe('▲ READY');

    // The in-game calm setting does the same with the OS setting off.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { window.__OT.GameState.reducedMotion = false; });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('tcBoost')).animationName === 'tc-ready');
    await page.evaluate(() => { window.__OT.GameState.reducedMotion = true; });
    await page.waitForFunction(() => document.getElementById('tcBoost').classList.contains('tc-calm'));
    s = await boostState(page);
    expect(s.anim).toBe('none');
    expect(s.outline).toBe('solid');
    await page.evaluate(() => clearInterval(window.__hold));
    expect(problems).toEqual([]);
  });
});

test('keyboard, 1280x720: HUD label reads WARP READY and the tick plays once', async ({ page }) => {
  const problems = watchPage(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${APP}?debug`);
  await page.evaluate(() => window.__OT.startRace({ mode: 'ARCADE' }));
  await racing(page);
  await spyCue(page);
  await hold(page, 40);
  await page.waitForFunction(() => document.getElementById('hudFluxLabel').textContent === 'FLUX');
  expect(await cues(page)).toBe(0);
  await hold(page, 93); // a boost fires the warp from 92 up, so the HUD says so from there too
  await page.waitForFunction(() => document.getElementById('hudFluxLabel').textContent.includes('WARP READY'));
  await simWait(page, 1);
  expect(await cues(page)).toBe(1);
  await page.evaluate(() => clearInterval(window.__hold));
  expect(problems).toEqual([]);
});
