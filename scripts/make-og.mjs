#!/usr/bin/env node
// Renders public/og.jpg (the 1200x630 link-preview card, ticket 0053) with the game's own
// card renderer, in a headless browser against the Vite dev server. Run after changing the
// card's look: `node scripts/make-og.mjs`. Needs Playwright's Chromium (npx playwright install chromium).
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5199/outatime/');
  const dataUrl = await page.evaluate(async () => {
    const m = await import('/outatime/src/share.js');
    const c = document.createElement('canvas');
    await m.drawPromoCard(c);
    return c.toDataURL('image/jpeg', 0.9);
  });
  writeFileSync('public/og.jpg', Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote public/og.jpg');
} finally {
  await browser.close();
  await server.close();
}
