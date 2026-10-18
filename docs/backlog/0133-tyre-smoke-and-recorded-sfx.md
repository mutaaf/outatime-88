---
id: 0133
title: Tyre smoke and squeal; recorded CC0 sound effects and a sampled engine
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-18
pr: 81
---

## Why
The user asked for "tire smoke and screech for wheelspin" and "way better sounds like from a
open source repo". Physics v3 (0131) already computed wheelspin (`drive.spin`), but nothing
showed or played it. Every sound was a synth beep.

## What
- **One shared smoke level.** `src/smoke.js` (pure) turns wheelspin, lateral slip and drifts, hard braking at speed and wall grinding into a single smoke level. A squeal level uses the same inputs except the wall. A hysteresis gate stops the squeal chattering at the threshold.
- **Smoke pool.** It's a fixed-size pool and allocates nothing per frame. Puffs per second scale with the graphics tier's particle budget, and reduced motion cuts them further.
- **2D smoke** (`src/smoke2d.js`, a lazy chunk):
  - Puffs are anchored to the road and billow toward the chase camera from the rear tyres.
  - Each underglow tint gets one cached soft sprite.
- **3D smoke** (`src/render3d/view.js`): one Points draw over a fixed pool of world-space puffs spawned at the rear wheels. The car drives out of them while they rise, spread and fade.
- **Recorded sounds** (`src/sfx/bank.js`, a lazy chunk loaded after the first gesture):
  - 22 CC0 samples from Kenney and OpenGameArt, about 372 kB, listed in docs/AUDIO_CREDITS.md.
  - They are fetched and decoded in the background into AudioBuffers, played through a capped voice pool, and fall back to the synth sound by sound.
  - They are not precached by the service worker; it caches them the first time they're fetched.
- **Sampled engine.** Two recorded loops are pitched by the drivetrain's rpm and gear, crossfaded low → high at constant power, and shaded per car voice. The synth growl steps aside once they're decoded.
- **NOS** plays a looping thruster.
- **Procedural squeal and scrub.** The squeal is two wobbling tones over band-passed hiss, with pitch and level following the squeal level. A noise scrub plays while grinding a wall.
- **New moments with sound:**
  - engines start on the grid;
  - a whoosh into loops;
  - a recorded landing thump;
  - menu clicks, never during a race.

## Acceptance criteria
- [x] Wheelspin, drifts and slides, hard braking at speed and wall grinding make tyre smoke in 2D and 3D, from fixed pools (bounded), with fewer puffs on LOW and in calm mode
- [x] Tyres squeal with the same inputs (not on a wall, which scrubs), with hysteresis
- [x] Recorded CC0 samples replace the synth effects; every one is credited with its source and license
- [x] The sampled engine follows rpm and gear; the synth engine is the fallback
- [x] Audio loads only after the first interaction, from the game's own origin, is not in the main bundle, totals under 600 kB, and falls back to the synth when a fetch fails

## Test plan
- Unit tests (`tests/unit/tyre-smoke.test.js`): smoke and squeal levels, the hysteresis gate, the bounded pool, tier and calm-mode rates.
- Unit tests (`tests/unit/sfx-bank.test.js`): load, playback and fallback when a fetch fails or 404s, the voice cap, the squeal built lazily with no new nodes per frame, engine crossfade and pitch mapping.
- e2e (`tests/e2e/tyre-smoke.spec.js`): a 2D drift spawns puffs within the pool cap, which clear afterwards; audio requests wait for the first interaction, come from our own origin and return 200; the sampled engine takes over and the squeal follows a drift; 3D smoke puffs appear.
- e2e budget: audio stays under 600 kB and never ends up in the main bundle.
