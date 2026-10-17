import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Cloudflare Web Analytics is on for the mutaafaziz.com zone and auto-injects its beacon into
// every HTML response. Path exclusions need a paid plan, so the game's HTML opts out with
// `Cache-Control: no-transform` instead (AGENTS.md §3.3: no analytics). Workers static assets
// read `_headers` from the root of the assets directory (./dist), one level above outDir.
const HEADERS = ['/outatime/', '/outatime/index.html']
  .map((path) => `${path}\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n`)
  .join('');

const noAnalyticsHeaders = {
  name: 'no-analytics-headers',
  apply: 'build',
  closeBundle() {
    writeFileSync('dist/_headers', HEADERS);
  },
};

// Served at https://mutaafaziz.com/outatime/ — the base path is an invariant (AGENTS.md §3.2).
export default defineConfig({
  base: '/outatime/',
  plugins: [noAnalyticsHeaders],
  build: {
    outDir: 'dist/outatime',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    // Durable Object classes import the Workers runtime module; unit tests get a stand-in.
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./tests/unit/fake-cf.js', import.meta.url)) },
  },
});
