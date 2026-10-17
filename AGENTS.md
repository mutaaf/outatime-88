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
- Live races: `POST /outatime/api/room` (private room → code), `POST /outatime/api/quick`
  (quick race), WebSocket `/outatime/api/room/<CODE>` → the `RaceRoom` Durable Object (one per
  code) and `MatchIndex` (one, for quick races). Design, limits and Free-plan budget: `docs/LIVE.md`.
- PR previews: Cloudflare does not generate version URLs for Workers that implement Durable
  Objects, so since live races there is no per-PR preview link. CI runs the real Worker and
  Durable Objects locally (`wrangler dev`, tests/e2e/live.spec.js) instead; verify on
  production after merge.
- Deploy = merge to `main`. Rollback = revert the PR (or `npx wrangler rollback` by the operator).

## 3 · Invariants (breaking any of these fails review)

1. **It must boot.** The page renders a playable first screen with zero console errors on
   current Chrome, Safari, and Firefox, desktop and phone. The e2e smoke test guards this.
2. **Base path.** The app is served under `/outatime/`. Vite `base` and `build.outDir`
   (`dist/outatime/`) encode this. Never use root-absolute URLs (`/foo.png`); import
   assets or use `import.meta.env.BASE_URL`.
3. **Allowed runtime hosts:** **our own origin only** — everything (code, CSS, fonts via
   `@fontsource`) is bundled, and the one API is `/outatime/api/*` on the same origin (the
   leaderboard, identity and the live-race WebSocket `/outatime/api/room/<CODE>`, all
   src/worker/). No third-party host, ever. QR codes are drawn locally (`src/qr.js`). The e2e smoke test fails on any non-localhost request. No accounts and no
   personal data: see § Privacy model.
   No analytics, ads, trackers, fonts or scripts from CDNs. Everything else is bundled.
4. **Frame budget.** The render loop must hold 60fps on a mid-range laptop and stay
   playable on a recent phone. No per-frame allocations in hot paths (reuse vectors and
   arrays), no layout thrash from the HUD.
5. **Mobile.** Touch controls work on every phone and tablet viewport in both orientations
   (`tests/e2e/touch-layouts.spec.js`), touch targets ≥44px, no page scroll or zoom while
   playing, safe-area insets respected, any number of fingers at once. Touch input reaches the
   sim only through `InputState` (see `src/touch/`), sampled once per frame.
6. **Save data compatibility.** One key: `outatime_cruisn_88_save_v2` (`src/save.js`). Cars live in
   `garage` (owned/selected/paint) and `career` (counters) — normalised by `ensureGarage()`. Never rename it or
   change the meaning of an existing field. Add fields by adding defaults to `SaveStore.data`;
   `load()` merges saved data over defaults, so old saves keep working. A breaking change needs
   a versioned migration *from* the old key, plus a unit test with a real old-shape save.
   Identity (ticket 0090) adds two versioned keys that follow the same rules:
   `outatime88_identity_v1` (this device's racers and their credentials, also mirrored in
   IndexedDB `outatime88`/`kv`) and `outatime88_racer_saves_v1` (saves of racers who aren't
   playing right now on a shared device). The live save always stays under the main key.
7. **IP caution.** The title is an homage; the game itself must stay original. Do not add
   trademarked logos, brand marks, real film/TV character names or likenesses, real car-maker
   badges, or quoted film dialogue/music. Existing named homages in `src/data.js` are legacy
   debt being replaced (see the backlog), not precedent — new content uses invented names.
8. **Accessibility floor.** Respect `prefers-reduced-motion` for screen shake/flashes;
   every control has a keyboard path; text meets 4.5:1 contrast on HUD backgrounds.

## 3½ · Privacy model (ticket 0090 — players are kids; keep it this way)

- **No login, no PII.** A racer is a random 12-character public id issued by the Worker on
  first visit. The profile is 3-letter initials, a car id, friends (other public ids) and a
  small progression blob. No names, emails, ages, device identifiers, IMEI/MAC, fingerprints
  or location — ever. Browsers can't read IMEI/MAC, and fingerprinting is off the table.
- **Proof of racer** is a credential `pub.sig` (HMAC with a key that never leaves D1): an
  HttpOnly, Secure, SameSite=Lax first-party cookie scoped to `/outatime/`, mirrored by the
  client to localStorage + IndexedDB and sent as `x-ot-id` if the cookie is lost. It is a
  secret: never put it in a URL, log, room message or share card. Share `publicId()`.
- **IP is never identity and never kept.** It is used only transiently for rate limits:
  hashed with a rotating salt, code-redeem throttle rows are deleted after an hour, and score
  rows wipe their address hash once the 10-minute submit window has passed.
- **Moving devices without accounts:** a 6-character link code (10 minutes, single use, shown
  as a QR) or a long-lived recovery code ("Save my racer", for a grown-up to write down).
  Both are stored only as salted hashes, and redemption is rate-limited.
- **Shared devices:** "Switch racer" keeps each sibling's racer and local save on one iPad.
  "Forget this device" removes the racer from every local store and clears the cookie.
- **For other features:** `src/identity.js` is the client API (publicId, profile, addFriends,
  saveProfileData…); `src/worker/identity.js` is the server side. Reuse them — don't invent
  another id.

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
src/backdrop.js     Main-bundle shim for the 2D era worlds (0100): lazy-loads src/scenes/stage.js, flat fallback
src/scenes/         Lazy: stage.js (layer cache, parallax, per-frame set pieces), s<era>.js (one scene per
                      era: build() paints layers once, anim()/front() draw live details allocation-free),
                      kit.js (painting helpers), eggs.js (pure easter-egg triggers), quality.js (tiers:
                      layers / live detail / weather / layer resolution, read ONLY via getQuality(),
                      which defaults to 'high'; plug the capability governor in with
                      setQualitySource(fn)). Nods: docs/EASTER_EGGS.md
src/era-palettes.js ERA_PALETTES: sky/horizon/fog/sun/ground + weather per era — the one palette table
                      both renderers read (lazy chunks only; never import it from main.js)
src/garage-ui.js    Garage showroom + NEW CAR reveal (lazy chunk with car-art.js turntable and garage.css)
src/scoring.js      Penalty rules (hits, wall scrapes) + the run log the Worker recomputes
src/cars.js         Car ratings (same 30-point budget each), unlock rules, carParams() → the physics
                      numbers a car drives with; career counters. Balance is unit-tested.
src/state.js        GameState — the one mutable state object every system reads/writes
src/save.js         SaveStore (localStorage persistence, see invariant 6)
src/identity.js     Zero-login identity client: who is playing, friends, link/recovery codes (0090)
src/racer-ui.js     Boots identity, syncs the save with the racer, friends from `from=` links
src/racer-panel.js  The RACER panel (switch, link a device, save my racer, forget) — lazy chunk
src/racer-saves.js  One local save per racer on a shared device; merges server bests
src/qr.js           On-device QR encoder (links, invites, share cards) — no QR service
src/worker/identity.js  Identity routes: /api/me, /link, /recovery, /use, /forget
src/worker/compete.js   Seasons, track/class/friends boards, rank movement, rivals, streaks,
                        hall of fame, ghost storage, pruning (0091); payload.js = versioned
                        run payloads (v1 plain, v2 penalty-recomputed) + car class
src/compete-ui.js   Rank card after a run, rival line on the title, podium board rows
src/ghost-codec.js  Compact ghost traces (distance + lane at 5 Hz), shared with the Worker
src/ghost.js        Ghost recorder (every race) and ghost racing on the HUD strip (0092)
src/audio.js        SoundEngine (Web Audio synth: engine, SFX, music loop); UI hooks via setAudioHooks
src/input.js        InputState + pollGamepad()
src/physics.js      RigidBody3D (impulses, suspension, gravity, wall rebound, static/sleep, reset() for pools)
src/materials.js    Per-object materials (mass, bounce, friction, static/knockable, damage) + impulse maths
src/world.js        World step: integrate awake bodies, Z-hash broadphase (broadphase.js), pair solver,
                      prop pool (cones/barrels). Bench: tests/unit/world.test.js, numbers in docs/PERF.md
src/projection.js   projectPoint() — world → screen road projection
src/contact.js      contactZ() — the tyre contact Z the physics uses (sim-owned; renderers never write sim state)
src/render-mode.js  2D/3D choice: resolveRenderMode() (URL ?view= → saved → auto=2D; never 3D without WebGL)
src/render-pose.js  bodyPose()/playerPose() — the ONLY way renderers read positions (see sim/render rule)
src/render3d-loader.js  Lazy entry points into the three.js chunk: loadView3D(), loadCarPreview()
src/render3d/       The 3D view (three.js, own chunk, never imported statically):
                      path.js (pure: track segments → 3D centreline) · view.js (scene, camera, road
                      chunks, instanced props, cars, flux trails, adaptive resolution) ·
                      meshes.js (low-poly cars/props/obstacles/sky) · post.js (lazy: bloom/vignette/
                      FXAA for HIGH/ULTRA) · surfaces.js (procedural PBR asphalt,
                      per-era PMREM environment from ERA_PALETTES) · preview.js (one car on a
                      showroom turntable; the garage uses it instead of src/car-art.js when 3D is on)
src/perf/           Graphics quality (ticket 0041), render-only — the sim is identical on every tier:
                      capabilities.js (probe WebGPU/WebGL2/GPU string/cores/memory/DPR/touch/
                      data-saver → tier, presets) · governor.js (p95 frame time → quality steps,
                      with hysteresis) · gfx.js (the controller both renderers read) ·
                      gfx-boot.js (lazy: Settings → GRAPHICS, ?debug overlay). See § Graphics tiers.
src/layout.js       Compact/full HUD decision + measured overlay slots (zero-overlap layout)
src/onboarding.js   First-run steer prompt (the race teaches; the title is one tap)
src/raceflow.js     Race rules: field, laps, length, rival pace, standings, gaps, finish timing
src/racecall.js     Race ceremony rules: start timeline, rocket start, callouts, finish order, headlines
src/racestage.js    Ceremony on screen: lineup cards, lights, flag, podium rows, beeps, fanfare, speech
src/sharelink.js    Challenge links (?track=&beat=&by=), share copy — pure
src/share-ui.js     Share button/sheet, challenge banner (lazy chunk)
src/share.js        Share card renderer, native share / copy / save (lazy chunk); scripts/make-og.mjs → public/og.jpg
src/hud.js          Race HUD writer (change-only DOM writes) + hudRects() for no-overlap checks
src/live/           Live races, a lazy chunk (loaded on RACE FRIENDS or a ?room= link):
                      controller.js (menu/lobby/countdown/results UI + race glue via hooks)
                      net.js (room socket, reconnect, clock sync) · ghosts.js (interpolation)
                      identity.js (seats follow the racer, 0090) · share.js · live.css
src/settings.js     Settings rules: defaults/normalise (SaveStore.data.settings), difficulty, motion, tilt maths
src/settings-ui.js  Settings panel, gears (title/HUD/garage), title TILT chip, iOS permission, registerControlsEditor()
src/touch/          Touch controls (ticket 0061), Roblox/Fortnite style:
                      touch-ui.js (one full-screen Pointer Events surface: thumbstick / D-pad /
                      tilt, action arc, shortcuts, look-drag; sample() writes InputState
                      .touchSteerVal/.touchUp/.touchDown/.lookYaw/.lookPitch/.lookZoom/.lookBack
                      once per frame) · stick.js (dead zone, curve, recentering, 8-way D-pad) ·
                      buttons.js (hit test, slide-between-buttons) · layouts.js (6 presets ×
                      device class × orientation, fit search, overlap rules) · settings.js
                      (SaveStore.data.controls, normalised when the kit loads) · mirror.js (2D
                      rear-view mirror) · bridge.js (the kit's entry: game hooks, race start,
                      back-gesture pause) · panel.js + editor.js (Controls panel, HUD layout
                      editor, thumb guide; lazy). The whole kit is one lazy chunk, loaded only
                      on touch devices or on a first touch.
src/worker/         Edge Worker for /outatime/api/* only (operator-owned, frozen):
                      index.js (routing) · scores.js (run tokens, submit, boards on D1)
                      token.js (HMAC run tokens) · plausible.js (anti-cheat bounds)
                      initials.js (3-letter filter) · schema.js (self-applied D1 schema)
                      live.js (room routes) · room.js (RaceRoom DO) · match.js (MatchIndex DO)
                      room-core.js (pure room state machine) · live-rules.js (shared with
                      the client: codes, lengths, CPU racers, finish order, frame limits)
scripts/sw-template.js  Service worker (built to dist/outatime/sw.js by vite.config.js). Never handles /outatime/api/*.
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

### URL parameters (deep links, ticket 0110)

The site launcher and share links open screens with these. One-shot params are stripped with
`history.replaceState` after use (a refresh lands on the title); invalid values are ignored.
Nothing can bypass unlocks or start a race without a tap (audio / iOS gesture rules).

| Param | Effect | Parser |
|---|---|---|
| `?play=friends` | opens RACE FRIENDS | `src/deeplink.js` (lazy; boot only runs a regex) |
| `?play=quick` | opens RACE FRIENDS with QUICK RACE focused (one tap joins) | `src/deeplink.js` |
| `?play=daily` | the title tap / Enter races today's daily | `src/deeplink.js` |
| `?board=week\|today\|all\|track\|friends\|daily` | opens the leaderboard on that tab | `src/deeplink.js` |
| `?level=N` | selects level N (1-based) if unlocked; locked → title note, never unlocked | `src/deeplink.js` |
| `?garage` | opens the garage | `src/deeplink.js` |
| `?room=CODE` | joins a live room (kept in the URL while in the room) | `src/live/controller.js` |
| `?track=&beat=&by=` | a friend's challenge banner | `src/sharelink.js` |
| `?view=2d\|3d` | render mode for this visit (not saved) | `src/render-mode.js` |
| `?gfx=low\|medium\|high\|ultra` | force a graphics tier | `src/perf/gfx-boot.js` |
| `?debug`, `?intro`, `?nosw` | test hooks only | `src/main.js` |

### Graphics tiers (ticket 0041)
Every device gets a tier — LOW / MEDIUM / HIGH / ULTRA — from `src/perf/capabilities.js`
(software GPU or ≤2 GB/≤2 cores → LOW; phones MEDIUM; big Apple/flagship tablets HIGH;
strong desktop GPUs with WebGL2 ULTRA; WebGL1 or data-saver never above MEDIUM). On AUTO the
first race is a warm-up: if the governor had to step down twice in the first 4 s the tier
drops one and is cached (`localStorage.ot_gfx_v1`, keyed to the GPU/cores signature), and a
tier that bottoms out the governor for 5 s is lowered for next time. Players can pin a tier in
Settings → GRAPHICS; `?gfx=low|medium|high|ultra` forces one for a visit; `?debug` shows the
tier, GPU, fps, p95 and (in 3D) draw calls in the corner.

The governor (`src/perf/governor.js`) samples frame intervals while racing and, when the
95th percentile runs over max(22 ms, 1.35 × refresh), steps down a ladder: resolution →
post-processing → shadows → effects → draw distance → everything optional. Stepping up waits
for a quiet spell that doubles each time an upgrade proves too much (it never flaps).

**Reading quality.** Renderers read the current effective preset and never mutate it:
- main.js keeps it in `gfxQ` (full quality until the lazy chunk lands). The 2D road draws at
  `pixelScale / gfxQ.res` into its buffer — the visible canvas and `roadCanvasHeight()` (which
  the sim's contact Z uses) stay full size, so resolution never changes the simulation.
- 2D era backdrops (`src/scenes/`, ticket 0100) read a tier name through
  `setBackdropQuality()` → `src/scenes/quality.js`: the device tier, one lower from governor
  step 4. Other 2D effects can use `gfxQ.glow` (allow additive glow/blur passes) and
  `gfxQ.particles` (multiply particle caps).
- The 3D view gets `quality` in `createView3D()` and `setQuality(q)` on every change: `dpr`,
  `ahead` (segments), `cars`, `shadows` (map size, 0 = off), `softShadows`, `post`, `env`,
  `reflections`, `glow`, `maxDraws` (the e2e suite fails a tier that draws more).

Cars: `buildCar(bodyStyle(shape), …)` builds each roster archetype (GULLWING, MUSCLE, TUNER_WING,
SCANNER, ROCKET, HEAVY_VAN, LIGHTCYCLE); bodies carry `shape` for it. LOW merges wheels into the
body (no extra draws), MEDIUM+ rolls them, the player's front wheels steer from
`GameState.steerInput` and its brake lights follow `GameState.braking` (both published by the sim
step for renderers). HIGH+ paints with clearcoat.

**Backend: WebGL2, not WebGPU (decided 2026-10-17).** Measured with three r186 + esbuild:
`WebGPURenderer` + one node material bundles to ~210 kB gz, against ~129 kB gz for
`WebGLRenderer` + `MeshStandardMaterial` — the WebGPU path alone is over the 3D chunk's 170 kB
budget, and the WebGL path would still have to ship as the fallback for browsers without
WebGPU. Effects would need a second (node-based) implementation, and the 3D view is fill-rate
bound on phones, which a new API does not change. The probe
records `webgpu` so the tier logic can revisit this once Safari's WebGPU is widespread.
Never feed quality into `updateGame()`: live races, ghosts and the server's score check rely on
every device running the same simulation.

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

Budgets (enforced by `tests/e2e/budget.spec.js`): main JS ≤ 60 kB gzipped (today ~59 kB; keep anything not needed on the first frame lazy — the touch kit (`bridge-*.js`, ~11 kB) loads only on touch devices and its Controls panel/editor (`panel-*.js`) on first open; it must never import three statically or src/live/ statically), live-race chunk (`controller-*.js`, loaded on RACE FRIENDS or a `?room=` link) ≤ 20 kB gzipped (today ~13 kB), 3D chunk (`view-*.js`: three.js + src/render3d, downloaded only when 3D is on) ≤ 170 kB gzipped (today ~154 kB), era backdrops + roadside (`stage-*.js` incl. roadside art and name tags < 10 kB, six `s<era>-*.js` < 5 kB each, shared kit chunk) ≤ 25 kB gzipped in total (today ~23 kB), CSS ≤ 25 kB gzipped (today ~17 kB), fonts woff2-only where possible. Frame-time baseline in `docs/PERF.md`.

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
