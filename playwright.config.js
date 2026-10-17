import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 4174;
export const LIVE_PORT = Number(process.env.E2E_LIVE_PORT) || 8788;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
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
