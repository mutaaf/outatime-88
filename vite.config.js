import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { walk, precacheList, versionOf, bundleContent, publicContent } from './scripts/precache.mjs';

// Cloudflare Web Analytics is on for the mutaafaziz.com zone and auto-injects its beacon into
// every HTML response. Path exclusions need a paid plan, so the game's HTML opts out with
// `Cache-Control: no-transform` instead (AGENTS.md §3.3: no analytics). Workers static assets
// read `_headers` from the root of the assets directory (./dist), one level above outDir.
const HEADERS = ['/outatime/', '/outatime/index.html', '/outatime/pad.html', '/outatime/pad']
  .map((path) => `${path}\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n`)
  .join('') + '/outatime/sw.js\n  Cache-Control: no-cache\n';

// Offline play (tickets 0075, 0158): emit sw.js precaching EVERYTHING the game needs, built
// from the real bundle and public/ (scripts/precache.mjs), so new chunks and assets are
// offline-ready automatically. The version hashes every file's contents.
const offlineServiceWorker = {
  name: 'offline-service-worker',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const publicFiles = walk('public');
    const files = precacheList(Object.keys(bundle), publicFiles);
    const version = versionOf([
      ...Object.keys(bundle).sort().map((f) => [f, bundleContent(bundle[f])]),
      ...publicFiles.sort().map((f) => [f, publicContent('public', f)]),
    ]);
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
    // TV mode (ticket 0175): the phone controller is its own small page, not the game.
    rollupOptions: { input: { index: 'index.html', pad: 'pad.html' } },
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    // Durable Object classes import the Workers runtime module; unit tests get a stand-in.
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./tests/unit/fake-cf.js', import.meta.url)) },
  },
});
