// Player guide (ticket 0261): /outatime/guide/ is a real page whose text is in the HTML itself
// (no script needed to read it), carries no scripts or ads, and EVENTS and Settings link to it.
import { test, expect } from '@playwright/test';
import { APP, watchPage } from './helpers.js';

test('the guide is static HTML: h1, canonical, no scripts, no ads', async ({ request }) => {
  const res = await request.get(`${APP}guide/`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<h1>OUTATIME 88 Player Guide</h1>');
  expect(html).toContain('<link rel="canonical" href="https://mutaafaziz.com/outatime/guide/" />');
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/marquee|ads\/v1/i);
  expect(html).not.toMatch(/—|&mdash;/);
  const words = html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
  expect(words.length).toBeGreaterThan(900);
});

for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  test(`EVENTS links to the guide, which links back to PLAY at ${vp.width}x${vp.height}`, async ({ page }) => {
    const problems = watchPage(page);
    await page.setViewportSize(vp);
    await page.goto(APP);
    await expect(page.locator('#btnOpenSettings')).toBeVisible();
    await page.locator('#btnOpenSettings').click();
    await expect(page.locator('#lnkGuideSettings')).toHaveAttribute('href', 'guide/');
    await page.locator('#btnSettingsDone').click();
    await page.locator('#btnOpenEvents').click();
    const chip = page.locator('#lnkGuide');
    await expect(chip).toBeInViewport();
    const box = await chip.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await chip.click();
    await expect(page).toHaveURL(/\/outatime\/guide\/$/);
    await expect(page.locator('h1')).toHaveText('OUTATIME 88 Player Guide');
    // Readable on a phone: nothing wider than the screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('a.play').first().click();
    await expect(page.locator('#btnStartRace')).toBeVisible();
    expect(problems).toEqual([]);
  });
}
