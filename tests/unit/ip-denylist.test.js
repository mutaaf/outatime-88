import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// AGENTS.md invariant 7: no trademarked characters, brands or car models in shipped code.
// "OUTATIME 88" (the title) is the one sanctioned homage and is not on this list.
const DENYLIST = [
  'McFly', 'Doc Brown', 'Toretto', "O'Conner", 'K.I.T.T', 'Knight Rider', 'Mach 5',
  'Speed Racer', 'Stark', 'Iron Man', 'J.A.R.V.I.S', 'Hot Wheels', 'Midnight Club',
  'Burnout', 'Back to the Future', 'DeLorean', 'Skyline', 'Charger', 'Trans Am', 'Hill Valley',
];

// Legacy save-data ids that must stay readable so old saves migrate (AGENTS.md invariant 6).
// Exact token + exact file only; never player-visible.
const ALLOWED = [{ file: join('src', 'save.js'), token: 'STARK_MK88' }];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(DENYLIST.map(escape).join('|'), 'gi');

function sourceFiles() {
  const files = readdirSync('src').filter((f) => /\.(js|css)$/.test(f)).map((f) => join('src', f));
  return [...files, 'index.html'];
}

describe('IP denylist', () => {
  it('src/ and index.html name no trademarked people, brands or cars', () => {
    const hits = [];
    for (const file of sourceFiles()) {
      let text = readFileSync(file, 'utf8');
      for (const a of ALLOWED) if (a.file === file) text = text.replaceAll(a.token, '');
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(PATTERN)) hits.push(`${file}:${i + 1}: ${m[0]}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
