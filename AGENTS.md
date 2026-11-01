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
- TV mode (ticket 0175, `docs/TV.md`): `?tv` on a TV shows a pairing code; phones open the
  second page `pad.html` (its own Vite entry) and pair through `POST /outatime/api/pad` and
  WebSocket `/outatime/api/pad/<CODE>` → the `PadRoom` Durable Object. Input goes phone → TV
  over a WebRTC DataChannel (no STUN/TURN: same network only) or the PadRoom relay.
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
   No analytics, ad networks, trackers, fonts or scripts from CDNs. Everything else is bundled.
   In a race the only ads are first-party sponsor boards bundled under `/outatime/ads/`, chosen
   by context only, reporting aggregate per-campaign counts (docs/ADS.md).
   **One exception (owner decision, 2026-10-30, "split by audience"):** index.html loads the
   Marquee ad loader from the same origin, relative to the base path (`../ads/v1/ads.js` →
   `mutaafaziz.com/ads/v1/ads.js`, the separate Marquee Worker; `data-app="outatime"`). Only
   menu-context slots are declared (`title` banner, `postrace` interstitial, `bonus` rewarded),
   and the glue is the lazy `src/ads.js`. Through Marquee, Google ads tagged child-directed
   (`data-tag-for-child-directed-treatment=1`) may appear **only outside gameplay**: the title,
   results / back to the title, and an opt-in rewarded video. Rewarded is **opt-in only** (the
   player taps "Watch a short ad for 2× coins"; the button shows only when the slot has fill).
   **No ad ever shows mid-race**: the app never calls Marquee while a race is on (PLAYING,
   PAUSED, GRID), never in a live room or TV mode, and Marquee itself refuses Google for any
   `gameplay` slot. Every call is fire-and-forget and a missing `window.marquee` is a no-op; the
   game never waits on an ad. Gameplay requests stay first-party. The e2e guard still fails on any
   non-localhost request; tests answer the same-origin `/ads/v1/ads.js` with a stub
   (`stubAds` in tests/e2e/helpers.js), which locally would 404. Allow-list nothing else.
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
- **Ads (2026-10-30):** Marquee counts are aggregate only (slot | campaign | source → n); no
  racer id, cookie, IP or device data is sent to it, and the racer credential never reaches it.
  Google ads are child-directed and menu-only (§3.3); nothing about the player picks an ad.
- **For other features:** `src/identity.js` is the client API (publicId, profile, addFriends,
  saveProfileData…); `src/worker/identity.js` is the server side. Reuse them — don't invent
  another id.

## 4 · System map

```
index.html          Markup: canvas, HUD, touch controls, start/garage/results modals (Tailwind classes)
src/main.js         Entry: what the title needs on its first frame — JarvisAI assist modes ·
                      LiveTraffic's data and init · UI (roster, level select, garage) ·
                      bindAllControls() · mainLoop(); exports what the race step and src/render/
                      read (RS = state both write, RACE_DEPS = shared modules)
src/render/         The 2D-canvas pseudo-3D renderer (0015), in the startup bundle (the title draws with it):
                      canvas.js (display canvas + pixel buffer, view size, era render config) ·
                      scene.js (renderScene(): the frame, the loop ride, the blit + speed feel) ·
                      road.js (backdrop + road deck; `road` = the visible segments this frame) ·
                      sprites.js (items, obstacles, cars + tags, wrecks, AR) · player.js (drawPlayerCar) ·
                      fx.js (car FX, speed lines, warp tunnel, sparks, the 3D overlay). Each file ≤ 500 lines
src/race-step.js    Lazy race step (0170): updateGame(dt), LiveTraffic.update, race rules (damage,
                      streaks, time warp), race start/finish, race HUD; takedowns + specials in src/race-specials.js;
                      imports only from ./main.js
src/race-specials.js Race-step chunk only (0227): side-slam takedown (triggerRivalTakedown), the crew specials
                      ZONE / AGRO / ROAR + their tint fade, the pulse beam, the obstacle shatter FX. Imported only by
                      race-step.js (so it merges into that chunk), which re-exports what main calls
src/data.js         Pure content tables: levels, eras, roster, upgrades, road/pace/camera config
src/backdrop.js     Main-bundle shim for the 2D era worlds (0100): lazy-loads src/scenes/stage.js, flat fallback
src/scenes/         Lazy: stage.js (layer cache, parallax, per-frame set pieces), s<era>.js (one scene per
                      era: build() paints layers once, anim()/front() draw live details allocation-free),
                      kit.js (painting helpers; strip() paints through a tee into the layer and a sign-free twin, records
                      each sign() box with a clean patch cropped from the twin, groups overlapping boxes, and stage
                      covers a group as it nears the screen edge: fadeEdgeSigns, 0237), eggs.js (pure easter-egg triggers), quality.js (tiers:
                      layers / live detail / weather / layer resolution, read ONLY via getQuality(),
                      which defaults to 'high'; plug the capability governor in with
                      setQualitySource(fn)). Nods: docs/EASTER_EGGS.md
src/era-palettes.js ERA_PALETTES: sky/horizon/fog/sun/ground + weather per era — the one palette table
                      both renderers read (lazy chunks only; never import it from main.js)
src/garage-ui.js    Garage showroom + NEW CAR reveal (lazy chunk with car-art.js turntable and garage.css)
src/missions.js     Run missions (0026): three distinct contracts per run (seeded on dailies), today's tally in the save
                      (solo/daily finishes; live rooms pay completions but have their own results)
src/formations.js   Traffic formations (0027), pure: SOLO/STAGGER → CONVOY/SLALOM → GATE → WALL unlocked by wave, drawn
                      from the race's traffic RNG. LiveTraffic has 6 cars: a passed car parks (idle, takenDown, inactive)
                      and the race step places the next formation whole once enough are parked; every car clear of the
                      racing line (src/cleanline.js trafficClear), so the line is always the open lane
src/hazards.js      Endless hazards (0186): pure rules — run-ending road hazards (bridge, wrong-way, low overpass,
                      crumbling lanes, train, missing guardrail, storm lightning), fuel, NOS heat, stall, the Patrol,
                      checkpoints, deaths by cause (save.endless.hz). Lazy, with src/hazard-run.js (glue, loaded by main after
                      the race step; the race step calls step/reset/onContinue/noteEnd through RS.hz) and src/hazard-art.js (2D art + HUD)
src/era-hazards.js  Era signature hazards (0113), pure, race-step chunk only: one knockable prop per era id (kind, rate,
                      body, HUD label; cone penalty, never HP). eraSpill() swaps some planProps patterns for the era's
                      spill on the far side of the line, rolled by a seed hash (the race RNG is untouched); 2D art is
                      src/scenes/era-props.js in the lazy stage chunk, 3D a coloured block (meshes.js ERA_PROP_3D)
src/fair-field.js   "Fair field" (0211), pure, race-flow chunk only: Settings → RIVALS scales the rubber band (FAIR_FIELD
                      0.4, close pack 1); race start sets GameState.catchUp (1 in rooms and dailies), read by rival-ai
                      fillWorld (w.band) and raceflow rivalTargetMph (the fallback driver)
src/arrival.js      Arrival stretch (0218), pure, race-late chunk only: the run's first warp queues an authored stretch for the
                      era it lands in (1985 today) on track.run; the race step builds it in place of the next biome, one ARRIVAL
                      feature (set-piece rules keep it clear), then the generator resumes unchanged. Solo races only
src/race-late.js    Race-late chunk (0233): what the race step first needs well after the lights, the opt-in lane guide
                      (src/lane-guide.js, 0219) and the arrival stretch (src/arrival.js). race-step.js import()s it as soon as it runs
                      and null-checks both until it lands; put cold, after-GO race code here, not in race-step
src/resume-beat.js  Resume beat (0231), pure, race-step chunk only: a solo race back from PAUSED holds the sim for 3 → 2 → 1
                      (0.3 s each, wall clock) while the road draws. main's loop calls raceStep.resumeHold() once per frame
                      (resumed = last frame PAUSED, not LIVE/TV, raceTime > 0); GameState.resumeBeat is the number shown (0 = none)
src/flash-budget.js Flash budget (0234), pure, race-step chunk only: allowFlash(ms, area) lets at most 3 flashes over 20% of the
                      screen through per second (race clock; layers within 100 ms are one flash). The warp flash (and the era
                      sky wash with it, GameState.warpLit) and the storm-bolt wash ask it; a refused one shows its calm strength
src/camera-fx.js    "Camera effects" (0216), pure, settings-panel chunk only: Settings → Camera effects sets GameState.cameraFx
                      (full 1 / gentle 0.4 / off 0); nosFeel, the 2D hit-shake and the 3D shake/warp kick multiply by it.
                      Speed lines, flashes and warp colours stay; calm motion still turns all of it off; the sim never reads it
src/nos-toggle.js   NOS TAP ON/OFF (0222), pure, race-step chunk only: Settings → NOS button (settings.nos 'hold' | 'toggle'); a press
                      (InputState.nosTap: keydown, touch NOS, pad LB edge) flips InputState.nosOn; a crash, a warp, not racing or
                      not burning (tank dry) turns it off, and main's loop clears it whenever the race isn't stepping (pause)
src/powerups.js     Runner power-ups (0177): magnet / shield / 2X timers, upgrade levels (FLUX cash only); lazy (race-step + runner-ui).
                      Road placement is pickups.js powerupAt (track.power = Endless tier, 0 off)
src/popups.js       Floating pickup / score labels (0114), pure layout: above the car's roofline (GameState.carBox from
                      drawPlayerCar), stacked newest-nearest, clamped to the canvas; drawn by the lazy src/pickup-art.js.
                      At most 2: a dodge chain is one growing plate (src/chain-plate.js, race step only; 0205) + one other
src/scoring.js      Penalty rules (hits, wall scrapes) + the run log the Worker recomputes
src/cars.js         Car ratings (same 30-point budget each), unlock rules, carParams() → the physics
                      numbers a car drives with; career counters. Balance is unit-tested. The garage's rating
                      bars and buying are src/car-shop.js (garage chunk only, 0223)
src/state.js        GameState — the one mutable state object every system reads/writes
src/save.js         SaveStore (localStorage persistence, see invariant 6)
src/identity.js     Zero-login identity client: who is playing, friends, link/recovery codes (0090)
src/racer-ui.js     Boots identity, syncs the save with the racer, friends from `from=` links
src/racer-panel.js  The RACER panel (switch, link a device, save my racer, forget) — lazy chunk
src/racer-saves.js  One local save per racer on a shared device (RACER panel chunk only; server bests merge in src/progress.js)
src/qr.js           On-device QR encoder (links, invites, share cards) — no QR service
src/worker/identity.js  Identity routes: /api/me, /link, /recovery, /use, /forget
src/worker/compete.js   Seasons, track/class/friends boards, rank movement, rivals, streaks,
                        hall of fame, ghost storage, pruning (0091); payload.js = versioned
                        run payloads (v1 plain, v2 penalty-recomputed) + car class
src/compete-ui.js   Rank card after a run, rival line on the title, podium board rows
src/results-ui.js   Results card text, initials/score posting, leaderboard modal, rival line — lazy chunk (0115),
                      preloaded after boot; main.js keeps the run rules and calls it via withResults()
src/ghost-codec.js  Compact ghost traces (distance + lane at 5 Hz), shared with the Worker
src/ghost.js        Ghost recorder (every race) and ghost racing on the HUD strip (0092)
src/audio.js        SoundEngine (Web Audio synth: engine, SFX, music loop); UI hooks via setAudioHooks;
                      wake() is the one place the context sleeps or resumes (mute, hidden tab, iOS 'interrupted', 0212);
                      the score (src/music.js) is a lazy chunk, loadMusic() preloads it after boot
src/sfx/tuner.js    Lazy (0193): the street-tuner layer, all synthesized — turbo spool, blow-off, shift chirp,
                      limiter, overrun pops, launch burble, NOS click/hiss/whoosh + purge, squeal layer, drift tone,
                      Doppler pass-bys, wind, tunnel reverb, crunch by Δv, bass drops, stingers; SoundEngine.updateEngine
                      calls frame() once per frame. Rules: src/sfx/street-params.js (pure, unit-tested)
src/street-score.js Lazy (0193): street tracks (phonk / trap / EDM / grid build / title loop) and the music director
                      (createMusic): picks synthwave or street per bar from Settings → MUSIC STYLE, intensity from
                      speed/tier/NOS/Patrol, musicIn → musicLP (mood filter) → musicDuck → musicBus, fades out off the road
src/input.js        InputState + pollGamepad() (deadzone + response curve, analog RT/LT pedals, one reused result; 0183)
src/keybinds.js     Rebindable keys (0013), pure, in the lazy settings-panel chunk: one rebindable key per driving
                      action + fixed arrows, conflicts refused; applyKeys sets InputState.keyMap (e.code → the default
                      code main.js acts on) and .boostKey; settings-ui loads the panel chunk at boot only when keys are rebound
src/onefilter.js    One Euro filter, steady at rest, lag-free on a swerve (0183); part of the lazy tilt chunk (src/tilt.js)
src/forcefeel.js    Lazy: gamepad dual rumble + phone pulses from tyre slip, wheelspin, walls, landings (0183)
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
                      Desktop race (0229): main's loop sets body.race-on while the race steps (the driver badge
                      fades out; back on pause/results); src/coach-dock.js dockDeskCoach (race-step chunk, re-exported
                      for race-flow's coach) puts the coach tip in the HUD row beside the place card
src/near-fade.js    Near-camera traffic (0200), pure: a car passing beside the camera eases to ≤ 22% of the view and 35% alpha;
                      depth = road-scaled car width / view width; car-sprite.js drawNear applies it to every non-player car
src/warp-cue.js     WARP READY cue (0112), pure: createReadyCue(min) is true once per fill (re-arms 5 below). The race step
                      sets GameState.warpReady (a boost would warp now: meter ≥ 92, cooldown over, racing) and plays a rising
                      tick on its edge; the HUD label, hints and the touch WARP button (READY + double border) read it
src/slipstream.js   Slipstream charge cue (0197), lazy (race flow + tuner): draftCharge → rising tone, greener speed
                      lines, an eased edge tint and a 2 Hz READY pulse; main only calls RS.wake from drawSpeedLines
src/focus-scope.js  Menu focus scope (0207), lazy via home.js: a shown menu takes focus, Tab/Shift+Tab loop inside, focus goes back to
                      its opener on close (never while racing); Ranks/share close on Escape. Watches each menu's `hidden` class
src/ads.js          Marquee ad glue (2026-10-30), lazy: onResults (2× COINS rewarded offer, opt-in, only with fill),
                      onMenuReturn (postrace interstitial from the session's 2nd race on; never live/TV), beforeAd/afterAd hold
                      the frame loop (main's adHeld, which also refuses race starts) and silence the mix. Main only has adCue()
src/onboarding.js   First-run steer prompt (the race teaches; the title is one tap)
src/play-hints.js   In-race prompts worded for the input in hand (0007), pure: pad X/RB/Y, phone BOOST, else keys;
                      InputState.lastInput is set only through setLastInput (src/input.js), which keeps body.input-pad
src/home-hooks.js   Home screen hooks (0185), pure: ranked, true reasons to play (best/next tier, daily +
                      real countdown + streak, next car, goals, rival, news, TV) and the first-visit test
src/home.js         Home flow (0185), lazy chunk + home.css: draws the hooks or the 3-beat pitch, the
                      attract-road AI driver, results → home (HOME, 20 s idle, Esc, pad B), pause QUIT,
                      and history (a race = one entry; Back = home from results, pause mid-race).
                      main.js showTitle() is the ONE way back to the title — reuse it, never hand-roll it
src/raceflow.js     Race rules: field, laps, length, rival pace, standings, gaps, finish timing
src/racecall.js     Race ceremony rules: start timeline, rocket start, callouts, finish order, headlines
src/racestage.js    Ceremony on screen: lineup cards, lights, flag, podium rows, beeps, fanfare, speech
src/sharelink.js    Challenge links (?track=&beat=&by=), share copy — pure
src/share-ui.js     Share button/sheet, challenge banner (lazy chunk)
src/share.js        Share card renderer, native share / copy / save (lazy chunk); scripts/make-og.mjs → public/og.jpg
src/hud.js          Race HUD writer (change-only DOM writes) + hudRects() for no-overlap checks
src/strip-marks.js  Track strip, lazy (race-flow chunk): stripMarks() letters (0167) and fanOut()/createStripFan(), which spread a
                      pack sideways in race order, YOU fixed, sizes from a ResizeObserver (0209)
src/live/           Live races, a lazy chunk (loaded on RACE FRIENDS or a ?room= link):
                      controller.js (menu/lobby/countdown/results UI + race glue via hooks)
                      net.js (room socket, reconnect, clock sync) · ghosts.js (interpolation)
                      identity.js (seats follow the racer, 0090) · share.js · live.css
src/settings.js     Settings rules: defaults/normalise (SaveStore.data.settings), difficulty, motion
src/tilt.js         Lazy (0223, fetched when tilt turns on): tilt maths (screenAngle/tiltAngle/tiltSteer), the One Euro
                      filter (src/onefilter.js) and the deviceorientation reader that writes InputState
src/tilt-text.js    The panel's tilt status sentences, pure; imported only by the lazy settings-panel chunk (0195)
src/settings-ui.js  Settings panel, gears (title/HUD/garage), title TILT chip, iOS permission, registerControlsEditor();
                      applyAll() sets html[data-hud-size] (0195: LARGE scales the race HUD's text by --hk in styles.css)
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
                      editor, thumb guide; lazy) · guide-tips.js (pure: where the thumb guide's
                      bubbles go — beside their pad, on screen, on no pad; 0166). The whole kit is one lazy chunk, loaded only
                      on touch devices or on a first touch.
src/worker/         Edge Worker for /outatime/api/* only (operator-owned, frozen):
                      index.js (routing) · scores.js (run tokens, submit, boards on D1)
                      token.js (HMAC run tokens) · plausible.js (anti-cheat bounds)
                      initials.js (3-letter filter) · schema.js (self-applied D1 schema)
                      live.js (room routes) · room.js (RaceRoom DO) · match.js (MatchIndex DO)
                      room-core.js (pure room state machine) · live-rules.js (shared with
                      the client: codes, lengths, CPU racers, finish order, frame limits)
scripts/sw-template.js  Service worker (built to dist/outatime/sw.js by vite.config.js; precache list from scripts/precache.mjs = the whole build, never hand-listed). Never handles /outatime/api/*. Offline rules: docs/backlog/0158.
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

### Road contract (sprint 4)

`src/track.js` exposes per-distance road data; everything that needs road geometry reads
these instead of segment internals (`z` = track Z in sim units):

| Function | Returns |
|---|---|
| `segmentAt(z)` | the segment under `z`, or null |
| `curvatureAt(z)` | signed heading change per sim unit (+ bends right) |
| `bankAt(z)` | road roll (+ leans right) |
| `pitchAt(z)` | road pitch in radians (+ climbs) |
| `featureAt(z)` | the set piece at `z` (`{ kind, z0, length, … }`) or null; see `src/setpieces.js` |

Owners: the track lead owns geometry, set pieces and hazard placement; the handling lead
owns car physics, input and NOS, and reads this contract.

### Handling (ticket 0120)

`src/handling.js` turns input into steering and steering into lateral motion. It's pure and
deterministic, called once per 120 Hz step from `updateGame`. Keys are digital and ramp
(`stepSteer`). Stick, tilt, wheel and touch are analog and share the same speed-sensitive lock.
`stepLateral` is grip-limited: corners pull ∝ curve·v², banks relieve it, and slip past grip is
a drift. Tune it with the constants `STEER` and `LATERAL` and keep `tests/unit/handling.test.js`
green. Car specs feed it through `handlingFor(carParams(car), tyreLevel)`. v4 (ticket 0181): the
tyres follow `tyreCurve` (linear to 75% of grip, round over to the peak, fall 10% past it), weight
transfer follows the chassis pitch (`weight`), counter-steer catches a slide (`catchAt`), and each
era's `grip` is the road surface (lateral only).

### Set pieces (sprint 4)

`segment.feature` marks a set piece; `featureAt(z)` reads it. Kinds (numbers in `src/setpieces.js`):
`BOOSTER` (gate: tops speed up to `boostTo`, what the next piece needs), `LOOP` (length 2πR, `minMph` over the top, read by handling.js `loopStep`),
`CORKSCREW` (`dir`), `GAP` (after a `JUMP_RAMP` segment, no road), `WALLRIDE` (`dir`, banked).
`stepSetPieces` is the track's sim (gates, gaps: time-only, never points; loop physics is handling's); `viewRoll` is the 2D roll;
`src/setpieces-2d.js` (lazy) draws loops ahead, speed signs and the side-on loop cam;
`src/render3d/path.js` gives every segment boundary a full frame so 3D loops/corkscrews/banks
are real geometry. Hazards and traffic stay out of set pieces (`hasSetPieceBetween`). Each
level's piece order lives in `BOOKS` in `src/track.js`.

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
| `npm run e2e:flake-guard` | Runs the e2e specs your branch adds or changes several times in a row with no retries (CI does this on every PR) |
| `npm run balance` | Endless/campaign balance harness: seeded bots play the real sim flat out (docs/BALANCE.md). Not part of the gate; re-run it before changing tuning constants. |

E2E tests must pass on a starved CI runner, where the 120 Hz sim steps slower than the wall clock
and a frame can take 100 ms+. Wait on the game, not the clock (`tests/e2e/helpers.js`):
`racing(page)` before moving the car (past the lights and stepping), `simWait(page, s)` for
"after s seconds of play", `nextFrames(page)` before reading anything the renderer works out per
frame, and `waitForFunction` on the state you expect rather than `waitForTimeout`. Gestures with a
time limit (flicks, swipes) send their input events as one burst. Frame-time tests carry
`{ tag: '@perf' }` and run alone, one at a time, after the rest (the `perf` project).

Budgets (enforced by `tests/e2e/budget.spec.js`): main JS ≤ 58 kB gzipped at startup — the entry chunk plus every chunk it statically imports (lowered 59 → 58 on 2026-10-29 by 0223, which took main from 58.98 to ~57.3 kB: modules only the race uses import directly into the race chunks instead of riding RACE_DEPS, the tilt sensor is `tilt-*.js`, the garage's ratings/buying `src/car-shop.js`; raised 58 → 59 on 2026-10-19 for the analog gamepad, 0183; brought down from 73.2 on 2026-10-18 by moving the race step to a lazy chunk, ticket 0170). **Rule: new features ship as lazy chunks; main only gets the hooks that load them.** Main holds what the title needs on its first frame (the 2D renderer, input binding, menus' entry points, track generation and the shared sim modules); the race step (`race-step-*.js`, ≤ 23 kB gzipped, today ~22.0 kB after 0233 moved the lane guide and arrival stretch to `race-late-*.js` (~1.7 kB): `updateGame` and traffic stepping; race start/finish, the coach and the race HUD are `race-flow-*.js`, ≤ 9 kB (today ~8.3 kB), and the rigid-body world `rigid-*.js`, ≤ 5 kB, both fetched alongside it and handed over before a race starts — the race step calls them through `RF`/`useRigid`, never a static import) loads in parallel with the title and every race start waits for it (`startNewRace` in main resolves once it is in); code it moves imports only from `./main.js` (shared-module bindings arrive through one `RACE_DEPS` object, state both sides write lives on `RS`), so the bundler doesn't split common chunks off the entry; a module that only the race chunks use (scoring.js, fork.js) is the exception and is imported there directly, since listing it in `RACE_DEPS` keeps it in main (0223). Other lazy chunks: Endless hazards (`hazard-run-*.js` + `hazards-*.js`, `hazard-art-*.js`, ~11 kB gzipped together), the car painter (`car-sprite-*.js`, with src/car-paint.js and src/car-shapes.js), the rival AI (`rival-ai-*.js`), offline (`offline-*.js`), the steering-mode switch (`steermode-ui-*.js`), set-piece art (`setpieces-2d-*.js`), the touch kit (`bridge-*.js`, touch devices only; its Controls panel `panel-*.js` on first open) — it must never import three statically or src/live/ statically; live-race chunk (`controller-*.js`, loaded on RACE FRIENDS or a `?room=` link) ≤ 20 kB gzipped (today ~13 kB), 3D chunk (`view-*.js` and its imports: three.js + src/render3d, downloaded only when 3D is on) ≤ 172 kB gzipped (today ~169 kB; raised from 170 on 2026-10-18 when the car shapes from 0157 put it at the edge), era backdrops + roadside (`stage-*.js` incl. roadside art, name tags and the kit < 10 kB, seven `s<era>-*.js` < 5 kB each, their shared chunks) < 30 kB gzipped in total (today ~29.6 kB; raised 29 → 30 on 2026-11-01 for 0237's edge-faded signs, ~750 B, after ~70 B of dedupes), CSS ≤ 25 kB gzipped (today ~17 kB), fonts woff2-only where possible. Frame-time baseline in `docs/PERF.md`.

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
