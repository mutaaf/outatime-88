// Renders the PWA / home-screen icons from src/favicon.svg (run by hand when the art changes:
// node scripts/make-icons.mjs). Output is committed under public/icons/.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('src/favicon.svg', 'utf8');
const inner = svg.replace(/<rect width="64" height="64" rx="12" fill="#05050d"\/>/, '');
const variants = [
  { file: 'icon-192.png', size: 192, art: svg, scale: 1 },
  { file: 'icon-512.png', size: 512, art: svg, scale: 1 },
  // Maskable and Apple: full-bleed dark square, art inside the 80% safe zone (the OS crops/rounds).
  { file: 'maskable-512.png', size: 512, art: inner, scale: 0.72, bg: '#05050d' },
  { file: 'apple-touch-icon.png', size: 180, art: inner, scale: 0.8, bg: '#05050d' },
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const v of variants) {
  await page.setViewportSize({ width: v.size, height: v.size });
  const box = Math.round(v.size * v.scale);
  await page.setContent(`<html><body style="margin:0;width:${v.size}px;height:${v.size}px;display:flex;align-items:center;justify-content:center;background:${v.bg || 'transparent'}">
    <div style="width:${box}px;height:${box}px">${v.art.replace('<svg ', `<svg width="${box}" height="${box}" `)}</div></body></html>`);
  await page.screenshot({ path: `public/icons/${v.file}`, omitBackground: !v.bg });
}
await browser.close();
