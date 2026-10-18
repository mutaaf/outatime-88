import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Cloudflare Web Analytics is on for the mutaafaziz.com zone and auto-injects its beacon into
// every HTML response. Path exclusions need a paid plan, so the game's HTML opts out with
// `Cache-Control: no-transform` instead (AGENTS.md §3.3: no analytics). Workers static assets
// read `_headers` from the root of the assets directory (./dist), one level above outDir.
const HEADERS = ['/outatime/', '/outatime/index.html']
  .map((path) => `${path}\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n`)
  .join('') + '/outatime/sw.js\n  Cache-Control: no-cache\n';

// Offline + instant repeat loads (ticket 0075): emit sw.js with the boot files precached.
// The 3D chunk is left out (big, optional); it's cached the first time it's used.
const offlineServiceWorker = {
  name: 'offline-service-worker',
  apply: 'build',
  generateBundle(_options, bundle) {
    const files = Object.keys(bundle)
      .filter((f) => f.startsWith('assets/'))
      .filter((f) => !/\.(woff|ttf|map)$/.test(f))
      // audio (src/sfx, ticket 0132) loads after the first tap and is cached on first use
      .filter((f) => !/\.(mp3|wav|ogg|m4a)$/.test(f))
      // fonts: precache only the latin subsets; others are cached the first time they're used
      .filter((f) => !f.endsWith('.woff2') || /-latin-\d/.test(f))
      // …and so is the rest of the 3D view (src/render3d: view, garage preview, post-processing)
      .filter((f) => !(bundle[f].type === 'chunk' && bundle[f].moduleIds && bundle[f].moduleIds.some((m) => m.includes('node_modules/three') || m.includes('/src/render3d/'))))
      .sort();
    const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
    const source = readFileSync('scripts/sw-template.js', 'utf8')
      .replace('__VERSION__', version)
      .replace('__BASE__', '/outatime/')
      .replace('__PRECACHE__', JSON.stringify(files));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  },
};

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
  plugins: [noAnalyticsHeaders, offlineServiceWorker],
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
