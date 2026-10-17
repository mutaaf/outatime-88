import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Bundle budgets (AGENTS.md §5). The build runs before e2e, so dist/ is fresh here.
const DIR = 'dist/outatime/assets';
const gz = (f) => gzipSync(readFileSync(`${DIR}/${f}`), { level: 9 }).length / 1024;

test('main bundle stays in budget and does not contain three.js', () => {
  const files = readdirSync(DIR);
  const main = files.filter((f) => /^index-.*\.js$/.test(f));
  expect(main.length).toBe(1);
  expect(gz(main[0])).toBeLessThan(60);
  expect(readFileSync(`${DIR}/${main[0]}`, 'utf8')).not.toContain('WebGLRenderer');
});

/** A chunk plus every chunk it statically imports (not the main bundle): what loading it downloads. */
function closure(entry) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f) || /^index-/.test(f)) return;
    seen.add(f);
    for (const m of readFileSync(`${DIR}/${f}`, 'utf8').matchAll(/(?:from|import)\s*"\.\/([\w.-]+\.js)"/g)) walk(m[1]);
  };
  walk(entry);
  return [...seen];
}

test('the lazy 3D view (three.js + src/render3d) stays in its own budget', () => {
  const view = readdirSync(DIR).filter((f) => /^view-.*\.js$/.test(f));
  expect(view.length).toBe(1);
  const files = closure(view[0]);
  const total = files.reduce((t, f) => t + gz(f), 0);
  expect(files.some((f) => readFileSync(`${DIR}/${f}`, 'utf8').includes('WebGLRenderer'))).toBe(true);
  expect(total).toBeLessThan(170);
});

test('live races are a lazy chunk in their own budget (solo players never download them)', () => {
  const files = readdirSync(DIR);
  const live = files.filter((f) => /^controller-.*\.js$/.test(f));
  expect(live.length).toBe(1);
  expect(gz(live[0])).toBeLessThan(20);
  const main = files.find((f) => /^index-.*\.js$/.test(f));
  expect(readFileSync(`${DIR}/${main}`, 'utf8')).not.toContain('liveRoot');
});

test('era backdrops are lazy chunks, each small (ticket 0100)', () => {
  const files = readdirSync(DIR);
  const scenes = files.filter((f) => /^s\d{4}-.*\.js$/.test(f));
  expect(scenes.length).toBe(6);
  const stage = files.filter((f) => /^stage-.*\.js$/.test(f));
  expect(stage.length).toBe(1);
  // the scenes' shared kit: whatever chunk the 2026 scene imports
  const shared = [...readFileSync(`${DIR}/${scenes[0]}`, 'utf8').matchAll(/from"\.\/([\w-]+\.js)"/g)].map((m) => m[1]);
  let total = gz(stage[0]);
  for (const f of scenes) { expect(gz(f), f).toBeLessThan(5); total += gz(f); }
  for (const f of new Set(shared)) { if (f === stage[0]) continue; expect(gz(f), f).toBeLessThan(6); total += gz(f); }
  expect(gz(stage[0]), 'stage + roadside').toBeLessThan(10);
  expect(total).toBeLessThan(25);
  const main = files.find((f) => /^index-.*\.js$/.test(f));
  expect(readFileSync(`${DIR}/${main}`, 'utf8')).not.toContain('GIANT ANTS ATE OHIO');
});
