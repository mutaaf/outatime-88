# AGENTS.md — Operating manual for OUTATIME 88

Everything an agent (or human) needs to work on this game. Read it fully before changing
anything. `CLAUDE.md` points here.

## 1 · Product vision

OUTATIME 88 is a neon, 1985/88-flavoured time-travel arcade racer that runs in a browser
tab. It mashes up three feelings: open night streets with rival crews and police heat,
boost/near-miss/side-slam crash spectacle, and toy-car joy (loops, orange track, impossible
jumps). The hook: build speed, hit **88 mph**, and the car jumps eras — the world, music and
palette shift around you. Every name, car, rival and place in the game is our own invention;
the genre homage lives in the *feel*, never in borrowed trademarks (invariant 3.7).

It's for anyone with five minutes and a keyboard, phone, or gamepad. A run should feel
fast, loud, readable and generous: you are always one good drift away from a warp.

### The 10x pillars (north star — the Scout steers here, in this order)

1. **Original identity.** One cohesive invented universe: our own cars, crews, rivals,
   districts, eras and title treatment. A title screen with attitude. No trademarks.
2. **Game feel.** Speed you can *feel*: speed lines, FOV kick and camera shake building to
   88, a chromatic time-warp transition, crash slow-mo with sparks and debris, hit-stop and a
   score chain on near-misses, boost trails. Every effect honors `prefers-reduced-motion`.
   The warp is a climax you earn, not a constant: tension → release.
3. **Readability.** At 120 mph the player must parse the screen in a glance: one
   announcement channel (never two texts on top of each other), a compact phone HUD, clear
   threat telegraphs. Clutter is a bug.
4. **Sound.** A procedural synthwave score (bass/arp/drums) scheduled on the audio clock,
   intensifying with speed and changing per era; engine pitch tied to speed; a master
   compressor and buses so SFX never clip over music. Mute is remembered.
5. **Content & progression.** Distinct eras as playable districts with their own palette,
   props, hazards and music; a short campaign ladder with unlocks and local best times; a
   ghost of your best run to race; a **global leaderboard** (all-time and daily) with
   arcade initials. Progression stays local (localStorage); the leaderboard is the one
   server feature and lives on our own origin (invariant 3.3).
6. **Controls everywhere.** Touch steering that feels analog, gamepad hints and rumble,
   rebindable keys. Phone is a first-class platform, not a fallback.
7. **Code health that enables the above.** Keep carving `main.js` (track generation,
   renderer, HUD) into focused modules with tests; zero per-frame allocations in hot paths.

Depth over breadth: polish one moment until it sings before adding three.

## 2 · Live

- Production: https://mutaafaziz.com/outatime/ (served by the `outatime-88` Cloudflare
  Worker on the route `mutaafaziz.com/outatime*`; the rest of mutaafaziz.com is a different
  project and repo — never touch it from here).
- Leaderboard: `GET|POST /outatime/api/scores`, `POST /outatime/api/run`, backed by the D1
  database `outatime-88-leaderboard` (binding `DB`, auto-provisioned by `wrangler deploy`,
  tables self-created by the Worker). Only `/outatime/api/*` runs Worker code; everything else
  is static assets. Agents must not edit `src/worker/` or `wrangler.jsonc` (operator paths).
- Every PR gets a Cloudflare preview URL (posted on the PR by Workers Builds).
- Deploy = merge to `main`. Rollback = revert the PR (or `npx wrangler rollback` by the operator).

## 3 · Invariants (breaking any of these fails review)

1. **It must boot.** The page renders a playable first screen with zero console errors on
   current Chrome, Safari, and Firefox, desktop and phone. The e2e smoke test guards this.
2. **Base path.** The app is served under `/outatime/`. Vite `base` and `build.outDir`
   (`dist/outatime/`) encode this. Never use root-absolute URLs (`/foo.png`); import
   assets or use `import.meta.env.BASE_URL`.
3. **Allowed runtime hosts:** **our own origin only** — everything (code, CSS, fonts via
   `@fontsource`) is bundled, and the one API is `/outatime/api/*` on the same origin (the
   leaderboard Worker, src/worker/). No third-party host, ever. The e2e smoke test fails on
   any non-localhost request. The leaderboard stores 3-letter initials and a daily-salted IP
   hash for rate limiting — no accounts, no personal data.
   No analytics, ads, trackers, fonts or scripts from CDNs. Everything else is bundled.
4. **Frame budget.** The render loop must hold 60fps on a mid-range laptop and stay
   playable on a recent phone. No per-frame allocations in hot paths (reuse vectors and
   arrays), no layout thrash from the HUD.
5. **Mobile.** Touch controls work at 390x844, touch targets ≥44px, no page scroll or
   zoom while playing, safe-area insets respected.
6. **Save data compatibility.** One key: `outatime_cruisn_88_save_v2` (`src/save.js`). Never rename it or
   change the meaning of an existing field. Add fields by adding defaults to `SaveStore.data`;
   `load()` merges saved data over defaults, so old saves keep working. A breaking change needs
   a versioned migration *from* the old key, plus a unit test with a real old-shape save.
7. **IP caution.** The title is an homage; the game itself must stay original. Do not add
   trademarked logos, brand marks, real film/TV character names or likenesses, real car-maker
   badges, or quoted film dialogue/music. Existing named homages in `src/data.js` are legacy
   debt being replaced (see the backlog), not precedent — new content uses invented names.
8. **Accessibility floor.** Respect `prefers-reduced-motion` for screen shake/flashes;
   every control has a keyboard path; text meets 4.5:1 contrast on HUD backgrounds.

## 4 · System map

```
index.html          Markup: canvas, HUD, touch controls, start/garage/results modals (Tailwind classes)
src/main.js         Entry + the remaining glue (~3.9k lines, being carved by the Keeper):
                      JarvisAI assist modes · track generation (segments, biomes, decorations)
                      LiveTraffic (rivals, police, traffic AI) · race rules (damage, streaks,
                      takedowns, specials, time warp) · updateGame(dt) · HUD/radar updates
                      renderScene() + drawDeLorean() (2D-canvas pseudo-3D renderer)
                      UI (roster, level select, garage) · bindAllControls() · mainLoop()
src/data.js         Pure content tables: levels, eras, roster, upgrades, road/pace/camera config
src/state.js        GameState — the one mutable state object every system reads/writes
src/save.js         SaveStore (localStorage persistence, see invariant 6)
src/audio.js        SoundEngine (Web Audio synth: engine, SFX, music loop); UI hooks via setAudioHooks
src/input.js        InputState + pollGamepad()
src/physics.js      RigidBody3D (impulses, suspension, gravity, wall rebound)
src/projection.js   projectPoint() — world → screen road projection
src/contact.js      contactZ() — the tyre contact Z the physics uses (sim-owned; renderers never write sim state)
src/render-mode.js  2D/3D choice: resolveRenderMode() (URL ?view= → saved → auto=2D; never 3D without WebGL)
src/render-pose.js  bodyPose()/playerPose() — the ONLY way renderers read positions (see sim/render rule)
src/render3d-loader.js  Lazy entry points into the three.js chunk: loadView3D(), loadCarPreview()
src/render3d/       The 3D view (three.js, own chunk, never imported statically):
                      path.js (pure: track segments → 3D centreline) · view.js (scene, camera, road
                      chunks, instanced props, cars, flux trails, adaptive resolution) ·
                      meshes.js (low-poly cars/props/obstacles/sky) · preview.js (one car on a
                      turntable in any canvas — for the garage)
src/layout.js       Compact/full HUD decision + measured overlay slots (zero-overlap layout)
src/onboarding.js   First-run steer prompt (the race teaches; the title is one tap)
src/raceflow.js     Race rules: field, laps, length, rival pace, standings, gaps, finish timing
src/hud.js          Race HUD writer (change-only DOM writes) + hudRects() for no-overlap checks
src/settings.js     Settings rules: defaults/normalise (SaveStore.data.settings), difficulty, motion, tilt maths
src/settings-ui.js  Settings panel, gears (title/HUD/garage), title TILT chip, iOS permission, registerControlsEditor()
src/worker/         Edge Worker for /outatime/api/* only (operator-owned, frozen):
                      index.js (routing) · scores.js (run tokens, submit, boards on D1)
                      token.js (HMAC run tokens) · plausible.js (anti-cheat bounds)
                      initials.js (3-letter filter) · schema.js (self-applied D1 schema)
src/fonts.js        Self-hosted @fontsource imports
src/styles.css      Tailwind layers + the game's custom CSS (LED boxes, scanlines, buttons)
tests/unit/         Vitest: pure logic (save, input, physics, projection, data integrity)
tests/e2e/          Playwright: boot smoke, race advances, save round-trip, phone, perf probe
```

Frame flow: `mainLoop(ts)` → fixed 1/120 s steps from `src/fixedstep.js`, each `updateGame(step)` + `syncContactZ()`
(never pass a frame-sized dt to the sim; anything that must happen once per frame — HUD, audio,
render — lives in `mainLoop`) → `updateLiveHud()` once → `renderScene()` blended between the last two steps. Inside a step: `updateGame(dt)` (input → player physics → traffic/rivals →
collisions/scoring → time-warp check). `renderScene()` draws sky/era backdrop → road
segments back-to-front → sprites/cars → player car → FX. Carving rule: move a cohesive
system into its own module with explicit imports, never change behavior in the same PR, and
let `npm run lint` (no-undef) prove nothing was left dangling.
**Sim/render rule:** renderers only read `GameState`, `track` and the traffic bodies; any
value the simulation needs is computed in the update step (see `src/contact.js`), so the
game plays identically whichever renderer is on. Renderers read positions through
`src/render-pose.js`: a fixed-timestep sim publishes interpolated transforms as
`renderZ/renderOffset/renderY/renderRot/renderYaw` on bodies and
`renderPlayerZ/renderPlayerX/renderPlayerY` on GameState, and both views pick them up.
New things the 3D view should draw: cars (incl. remote/ghost cars) go in
`collectCarsFor3D()` in main.js; obstacles/knockables in the `obstacles` getter passed to
`createView3D`. In 3D the 2D canvas stays on top (transparent) for screen-space FX.

## 5 · Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server at http://localhost:5173/outatime/ |
| `npm run build` | Production build into `dist/outatime/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Playwright e2e (builds first) |
| `npm run lint` | ESLint correctness rules (undefined identifiers, import misuse) |
| `npm run check` | **The gate**: backlog validator + lint + unit + build + e2e. CI runs exactly this. |
| `npm run check:fast` | Everything but e2e, for sandboxes that can't install Playwright browsers. CI still runs the full gate. |

Budgets (enforced by `tests/e2e/budget.spec.js`): main JS ≤ 60 kB gzipped (today ~45 kB; it must never import three statically), 3D chunk (`view-*.js`: three.js + src/render3d, downloaded only when 3D is on) ≤ 170 kB gzipped (today ~154 kB), CSS ≤ 25 kB gzipped (today ~17 kB), fonts woff2-only where possible. Frame-time baseline in `docs/PERF.md`.

## 6 · The agents

Three cloud routines run this repo with no human in the loop (see `agents/prompts/`):

| Agent | Job | Branch prefix |
|---|---|---|
| Scout | Plays the build, researches, grooms and refills `docs/backlog/` | `scout/` |
| Builder | Ships the top ready ticket test-first, merges on green, verifies live | `build/`, `fix/` |
| Keeper | Dependencies, perf budget, refactors, prompt tuning, red-main backstop | `keep/` |

The operator controls them via `agents/control.json` (pause, per-agent enable, focus,
caps) and their schedules at https://claude.ai/code/routines (frequency).

## 7 · Definition of done

- [ ] `npm run check` green locally and in CI
- [ ] Test added that fails without the change
- [ ] Screenshot checked at 1280x720 and 390x844
- [ ] No new runtime hosts, no new console errors, frame budget held
- [ ] Ticket marked `shipped` with PR number; `docs/CHANGELOG.md` line added
- [ ] Lesson appended to `docs/LESSONS.md` if one was learned
