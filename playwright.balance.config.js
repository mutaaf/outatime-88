import { defineConfig, devices } from '@playwright/test';

// The Endless balance harness (tests/balance, docs/BALANCE.md): bots play seeded runs flat
// out against the production build. Separate from the e2e suite; `npm run balance`.
const PORT = Number(process.env.E2E_PORT) || 4174;

export default defineConfig({
  testDir: 'tests/balance',
  timeout: 30 * 60_000,
  workers: Number(process.env.BAL_WORKERS) || 4,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'block',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'balance', use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 } } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/outatime/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
