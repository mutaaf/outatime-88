import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// AGENTS.md invariant 7: no trademarked characters, brands, props or car models in shipped code.
// "OUTATIME 88" (the title) is the one sanctioned homage and is not on this list.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Matched as plain case-insensitive substrings (catches identifiers like drawDeLorean too).
const DENYLIST = [
  // ticket 0001
  'McFly', 'Doc Brown', 'Toretto', "O'Conner", 'K.I.T.T', 'Knight Rider', 'Mach 5',
  'Speed Racer', 'Stark', 'Iron Man', 'J.A.R.V.I.S', 'Hot Wheels', 'Midnight Club',
  'Burnout', 'Back to the Future', 'DeLorean', 'Skyline', 'Charger', 'Trans Am', 'Hill Valley',
  // also removed in 0001; guard against regressions
  "Cruis'n", 'OutRun', 'Temple Run', 'Temple-Run', 'Fast & Furious', 'Fast and Furious',
  'Ghostbusters', 'Ecto-1', 'Herbie', 'Bruce Wayne', 'Mad Max', 'A-Team', 'Initial D',
  'Flux Capacitor', 'Mr. Fusion', 'Time Circuits', 'Twin Pines', 'Lone Pine',
  'N.O.V.A', 'Toyota', 'Nissan', 'Plymouth', 'Cadillac', 'Ferrari', 'Testarossa', 'Pontiac',
  'Vandura', 'La Bomba',
  // ticket 0018: real places/routes and parody car names
  'Mulholland', 'Wangan', 'Tokyo', 'Sentry-2000', 'Go-Rocket',
];
// Short terms that are substrings of ordinary words ("Orbitron"): matched only when not
// flanked by letters.
const DENYLIST_WORDS = ['Tron', 'BMW', 'GMC', 'Honda', 'Akira', 'DMC'];

// Legacy save-data ids that must stay readable so old saves migrate (AGENTS.md invariant 6).
// Exact token + exact file only; never player-visible.
const ALLOWED = [
  { file: 'src/save.js', token: 'STARK_MK88' },
  // level ids keyed by progress medals and car unlocks in old saves (ticket 0018)
  ...['src/data.js', 'src/cars.js', 'src/progress.js'].flatMap((file) => [
    { file, token: 'LVL3_TOKYO_2015' },
    { file, token: 'LVL4_MULHOLLAND_2088' },
  ]),
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(
  [...DENYLIST.map(escape), ...DENYLIST_WORDS.map((w) => `(?<![a-z])${escape(w)}(?![a-z])`)].join('|'),
  'gi'
);

function sourceFiles() {
  const files = readdirSync(join(ROOT, 'src'), { recursive: true })
    .filter((f) => /\.(js|css)$/.test(f))
    .map((f) => join('src', f).split('\\').join('/'));
  return [...files, 'index.html'];
}

describe('IP denylist', () => {
  it('src/ and index.html name no trademarked people, brands or cars', () => {
    const hits = [];
    for (const file of sourceFiles()) {
      let text = readFileSync(join(ROOT, file), 'utf8');
      for (const a of ALLOWED) {
        if (a.file !== file) continue;
        expect(text, `stale allowlist entry ${a.token} in ${a.file}`).toContain(a.token);
        text = text.replaceAll(a.token, '');
      }
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(PATTERN)) hits.push(`${relative('.', file)}:${i + 1}: ${m[0]}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
