import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Bundle budgets (AGENTS.md §5). The build runs before e2e, so dist/ is fresh here.
const DIR = 'dist/outatime/assets';
const gz = (f) => gzipSync(readFileSync(`${DIR}/${f}`), { level: 9 }).length / 1024;

/** The entry chunk plus every chunk it statically imports: what a first visit downloads before
 *  the title runs. The bundler can split shared modules (data, state, cars…) off the entry into
 *  small common chunks, so the entry file alone under-counts; this is the honest number. */
function startup() {
  const entry = readdirSync(DIR).filter((f) => /^index-.*\.js$/.test(f));
  expect(entry.length).toBe(1);
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const m of readFileSync(`${DIR}/${f}`, 'utf8').matchAll(/(?:from|import)\s*"\.\/([\w.-]+\.js)"/g)) walk(m[1]);
  };
  walk(entry[0]);
  return [...seen];
}

test('main bundle stays in budget and does not contain three.js', () => {
  const files = startup();
  const total = files.reduce((t, f) => t + gz(f), 0);
  // ≤ 58 kB (0170): main was 73.2 kB at startup after crawling up from 60, so the race step
  // moved to a lazy chunk and the budget came down to just above the result (today ~56.5).
  // Rule: new features ship as lazy chunks; main only gets the hooks that load them.
  // 58 → 59 (0183, 2026-10-19): TV mode, runner power-ups and handling v4 took main to ~57.9 on
  // CI; the analog gamepad (it runs every sim step) and the hooks for the lazy force-feel and
  // tilt-filter chunks add ~0.4. The features themselves are lazy.
  // 59 → 58 (0223, 2026-10-29): main was 58.98 with ~13 bytes free. Scoring and the fork cue moved
  // into the race chunks, the tilt sensor into its own chunk (src/tilt.js), the garage's ratings
  // and buying (src/car-shop.js) and the RACER panel's save parking out of startup: ~57.3 today.
  console.log(`[budget] main startup ${total.toFixed(2)} kB gzipped (limit 58)`); // the CI number, in the CI log
  expect(total).toBeLessThan(58);
  for (const f of files) expect(readFileSync(`${DIR}/${f}`, 'utf8')).not.toContain('WebGLRenderer');
});

test('the race step is a lazy chunk in its own budget (0170)', () => {
  const files = readdirSync(DIR);
  const step = files.filter((f) => /^race-step-.*\.js$/.test(f));
  expect(step.length).toBe(1);
  console.log(`[budget] race-step ${gz(step[0]).toFixed(2)} kB gzipped (limit 23)`); // the CI number, in the CI log
  expect(gz(step[0])).toBeLessThan(23); // today ~22.0 kB (0233 moved the lane guide and arrival stretch to race-late, the coach's obstacle cards in; 0231 resume beat; 0222 NOS tap toggle; 0223 moved scoring and the fork cue in; 0176: race start/finish, coach and HUD are race-flow): updateGame, traffic stepping
  for (const f of startup()) expect(readFileSync(`${DIR}/${f}`, 'utf8')).not.toContain('TOO SLOW FOR THE LOOP');
});

test('race start/finish, the coach and the race HUD are their own lazy chunk (0176)', () => {
  const files = readdirSync(DIR);
  const flow = files.filter((f) => /^race-flow-.*\.js$/.test(f));
  expect(flow.length).toBe(1);
  expect(gz(flow[0])).toBeLessThan(9); // today ~8.3 kB (0233: names only it reads are no longer exported, the coach's obstacle cards went to race-step)
  expect(startup()).not.toContain(flow[0]); // never part of what a first visit downloads
});

test('the lane guide and arrival stretch are their own small lazy chunk (0233)', () => {
  const files = readdirSync(DIR);
  const late = files.filter((f) => /^race-late-.*\.js$/.test(f));
  expect(late.length).toBe(1);
  expect(gz(late[0])).toBeLessThan(3); // today ~1.7 kB
  expect(startup()).not.toContain(late[0]);
  const step = files.filter((f) => /^race-step-.*\.js$/.test(f));
  expect(step.length).toBe(1);
  expect(readFileSync(`${DIR}/${late[0]}`, 'utf8')).toContain('lo:330,hi:880'); // the guide's GUIDE table is here…
  expect(readFileSync(`${DIR}/${step[0]}`, 'utf8')).not.toContain('lo:330,hi:880'); // …and not in the step chunk
});

test('the rigid-body world is its own small lazy chunk (0176)', () => {
  const files = readdirSync(DIR);
  const rigid = files.filter((f) => /^rigid-.*\.js$/.test(f));
  expect(rigid.length).toBe(1);
  expect(gz(rigid[0])).toBeLessThan(5); // today ~4.2 kB: oriented-box contacts, impulses, drivers, your hits
  for (const f of startup()) expect(readFileSync(`${DIR}/${f}`, 'utf8')).not.toContain('contactAlong');
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
  // ≤ 172 (0170): #86 (car shapes for 3D) brought it to ~169 kB locally and ~170 on CI, where gzip
  // sizes run ~1 kB higher; the race-step split adds a few bytes of import names to view-*.js.
  expect(total).toBeLessThan(172);
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
  expect(scenes.length).toBe(7); // six eras + the 2061 orbit (ticket 0155)
  const stage = files.filter((f) => /^stage-.*\.js$/.test(f));
  expect(stage.length).toBe(1);
  // the scenes' shared kit: whatever chunk the 2026 scene imports
  const shared = [...readFileSync(`${DIR}/${scenes[0]}`, 'utf8').matchAll(/from"\.\/([\w-]+\.js)"/g)].map((m) => m[1]);
  let total = gz(stage[0]);
  for (const f of scenes) { expect(gz(f), f).toBeLessThan(5); total += gz(f); }
  for (const f of new Set(shared)) { if (f === stage[0]) continue; expect(gz(f), f).toBeLessThan(6); total += gz(f); }
  expect(gz(stage[0]), 'stage + roadside').toBeLessThan(10);
  expect(total).toBeLessThan(29); // 25 → 29 for the seventh world, the 2061 orbit (ticket 0155)
  const main = files.find((f) => /^index-.*\.js$/.test(f));
  expect(readFileSync(`${DIR}/${main}`, 'utf8')).not.toContain('GIANT ANTS ATE OHIO');
});

test('the results/leaderboard UI and the music score are lazy chunks (ticket 0115)', () => {
  const files = readdirSync(DIR);
  const main = readFileSync(`${DIR}/${files.find((f) => /^index-.*\.js$/.test(f))}`, 'utf8');
  const results = files.filter((f) => /^results-ui-.*\.js$/.test(f));
  expect(results.length).toBe(1);
  expect(readFileSync(`${DIR}/${results[0]}`, 'utf8')).toContain('CLEAN RUN');
  expect(main).not.toContain('CLEAN RUN');
  expect(main).not.toContain('LEADERBOARD OFFLINE');
  const music = files.filter((f) => /^music-.*\.js$/.test(f));
  expect(music.length).toBe(1);
  expect(readFileSync(`${DIR}/${music[0]}`, 'utf8')).toContain('sawtooth');
  expect(main).not.toContain('kick:[1,0,0,0');
  expect(gz(results[0])).toBeLessThan(6);
});

test('the street sound layer and the street score are small lazy chunks (ticket 0193)', () => {
  const files = readdirSync(DIR);
  const tuner = files.filter((f) => /^tuner-.*\.js$/.test(f));
  const score = files.filter((f) => /^street-score-.*\.js$/.test(f));
  expect(tuner.length).toBe(1);
  expect(score.length).toBe(1);
  expect(gz(tuner[0])).toBeLessThan(6); // today ~4.2 kB: every voice synthesized, no samples
  expect(gz(score[0])).toBeLessThan(4); // today ~2.7 kB
  const start = startup();
  expect(start).not.toContain(tuner[0]);
  expect(start).not.toContain(score[0]);
  for (const f of start) expect(readFileSync(`${DIR}/${f}`, 'utf8')).not.toContain('blowOff');
});

test('recorded sound effects stay small and out of the main bundle (ticket 0133)', () => {
  const files = readdirSync(DIR).filter((f) => /\.(mp3|wav)$/.test(f));
  const total = files.reduce((t, f) => t + readFileSync(`${DIR}/${f}`).length, 0) / 1024;
  expect(files.length).toBeGreaterThan(10);
  expect(total).toBeLessThan(600);
  const main = readdirSync(DIR).find((f) => /^index-.*\.js$/.test(f));
  expect(readFileSync(`${DIR}/${main}`, 'utf8')).not.toMatch(/audio\/[\w-]+\.(mp3|wav)|data:audio/);
});

test('the home flow (hooks, pitch, results → home, history) is a lazy chunk (ticket 0185)', () => {
  const files = readdirSync(DIR);
  const home = files.filter((f) => /^home-.*\.js$/.test(f));
  expect(home.length).toBe(1);
  expect(readFileSync(`${DIR}/${home[0]}`, 'utf8')).toContain('LEVEL UP FOREVER.');
  for (const f of startup()) expect(readFileSync(`${DIR}/${f}`, 'utf8')).not.toContain('LEVEL UP FOREVER.');
  expect(gz(home[0])).toBeLessThan(6);
});
