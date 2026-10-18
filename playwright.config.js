import { defineConfig, devices, firefox, webkit } from '@playwright/test';
import { existsSync } from 'node:fs';

// Offline play must work in every major engine (ticket 0158): the offline specs also run in
// Firefox and WebKit (Safari's engine) wherever those browsers are installed
// (`npx playwright install firefox webkit`; CI installs them).
const has = (b) => { try { return existsSync(b.executablePath()); } catch { return false; } };
const OFFLINE_SPECS = /offline\.spec\.js/;
const engines = [
  has(firefox) && { name: 'firefox', testMatch: OFFLINE_SPECS, use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 }, launchOptions: {} } },
  has(webkit) && { name: 'webkit', testMatch: OFFLINE_SPECS, use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 720 }, launchOptions: {} } },
  has(webkit) && { name: 'webkit-iphone', testMatch: OFFLINE_SPECS, use: { ...devices['iPhone 15'], launchOptions: {} } },
].filter(Boolean);

const PORT = Number(process.env.E2E_PORT) || 4174;
export const LIVE_PORT = Number(process.env.E2E_LIVE_PORT) || 8788;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The service worker precaches the whole game (~2 MB, ticket 0158). Only the offline specs
    // need it (they opt back in with test.use({ serviceWorkers: 'allow' })), so every other test
    // skips that download and runs exactly as a first visit.
    serviceWorkers: 'block',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    ...engines,
  ],
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/outatime/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Live races (tests/e2e/live.spec.js) need the real Worker + Durable Objects: wrangler dev
      // runs them locally (no Cloudflare account), serving the same dist once the build lands.
      command: `node scripts/wait-for-build.mjs && npx wrangler dev --port ${LIVE_PORT} --ip 127.0.0.1 --var LIVE_TEST:1 --log-level warn`,
      url: `http://127.0.0.1:${LIVE_PORT}/outatime/`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
  ],
});
