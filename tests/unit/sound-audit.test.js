import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Play on mute (ticket 0206): docs/ACCESSIBILITY.md lists every sound that can tell the player
// something, with its visual twin. This fails when a sound is added and the table isn't updated.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOC = read('docs/ACCESSIBILITY.md');
const section = DOC.slice(DOC.indexOf('## Play on mute'));
const rows = section.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Situation') && !l.startsWith('|---'));
const named = new Set([...section.matchAll(/`([^`]+)`/g)].map((m) => m[1]));

function walk(dir) {
  const out = [];
  for (const f of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${f}`;
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p));
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('play-on-mute audit (docs/ACCESSIBILITY.md)', () => {
  it('names every SoundEngine play* method', () => {
    const methods = [...read('src/audio.js').matchAll(/^ {2}(play[A-Z]\w*)\(/gm)].map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(10);
    expect(methods.filter((m) => !named.has(m))).toEqual([]);
  });

  it('names every street-tuner cue', () => {
    const src = read('src/sfx/tuner.js');
    const body = src.slice(src.indexOf('const tuner = {'));
    const cues = [...body.matchAll(/^ {4}([a-z]\w*)\(/gm)].map((m) => m[1]).filter((m) => m !== 'setCharacter' && m !== 'frame');
    expect(cues).toContain('nosOpen');
    expect(cues.filter((m) => !named.has(m))).toEqual([]);
  });

  it('names every source file that plays a sound', () => {
    const plays = /\b(SoundEngine|sound)\??\.(play[A-Z]\w*|sample|crunch)\(|speechSynthesis\.speak\(|synth\.speak\(/;
    const files = walk('src').filter((p) => !/src\/(audio|music|street-score)\.js$|src\/sfx\//.test(p) && plays.test(read(p)));
    expect(files.length).toBeGreaterThan(5);
    expect(files.map((p) => relative('src', p)).filter((f) => !named.has(f))).toEqual([]);
  });

  it('gives every row a visual twin', () => {
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) {
      const cells = r.split('|').slice(1, -1).map((c) => c.trim());
      expect(cells.length, r).toBe(4);
      expect(cells[3].length, r).toBeGreaterThan(3);
    }
  });
});
