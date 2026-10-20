---
id: 0193
title: Street sound — a synthesized tuner layer (turbo, BOV, crackle, NOS, Doppler, crunch) and an adaptive street score with a MUSIC STYLE setting
status: in-progress
priority: P1
size: M
lens: player-feel
created: 2026-10-19
---

## Why
The operator asked for sound, effects and music in the spirit of street-tuner racing films. The
engine, the CC0 samples (0133) and the synthwave score (0010) are a good base. What's missing is the
tuner vocabulary: turbo spool, blow-off valves, backfire pops, a NOS moment that hits, cars that
rush past, crashes that crunch by how hard they were, and a beat that leans in when things get
tense.

## What
- **SFX (`src/sfx/tuner.js`, rules in `src/sfx/street-params.js`, a lazy chunk):**
  - Engine layer: turbo spool, blow-off valve on lift and shift, upshift chirp, rev-limiter bounce, overrun crackle and pops, and a launch burble on the grid.
  - Per-car character: V8, tuner, I6, rotary, rocket and electric.
  - NOS: valve click, then hiss, then a roaring whoosh, with a tunnel low-pass on the music while it burns and a purge puff at the end.
  - Tyres: a tuner squeal layer over the screech, plus a drift-hold tone.
  - Doppler pass-bys, wind rush, and tunnel and loop-ring reverb.
  - Metal crunch scaled by the rigid-body Δv.
  - Bass drops for big air, slow-mo takedowns and near-miss chains.
  - A countdown heartbeat, a GO hit, and level-up and run-over stingers.
  - A limiter after the master compressor.
- **Music (`src/street-score.js`, a lazy chunk):**
  - Original procedural drift phonk, trap and EDM race tracks, a pre-race build and a calm title loop.
  - A director picks one per bar, with intensity layers from speed, tier, NOS and the Patrol.
  - The music ducks under big moments and fades out on results and pause.
  - Settings → MUSIC STYLE: AUTO, SYNTHWAVE or STREET.
- **Delivery:** two PRs, SFX first (#127), then music and mix.
- **Rules:** no samples, nothing borrowed, instrumental only (docs/EASTER_EGGS.md, docs/AUDIO_CREDITS.md).

## Acceptance criteria
- [x] Every new sound is synthesized: 0 kB of new samples, no third-party hosts.
- [x] Parameter mappings are unit-tested: rpm/boost → spool, slip → squeal, speed → wind, Δv → crunch, style rules.
- [x] An e2e test drives a race (start → NOS → drift) and checks the layer and the director react with no console errors.
- [x] MUSIC STYLE is saved; AUTO is synthwave in the '88 eras and street in modern and future eras, plus Endless from tier 3.
- [x] The main bundle stays under 59 kB; the new code is in lazy chunks; the offline precache picks it up.
- [x] Street cues are level-matched to the synthwave score (rendered offline).

## Test plan
- Unit: `tests/unit/street-params.test.js`, `tuner.test.js`, `street-score.test.js`, `audio.test.js` (limiter and music chain).
- e2e: `tests/e2e/street-sound.spec.js`, `budget.spec.js`.
- By ear on a phone: NOS, a drift, a tunnel, a big crash, the grid countdown, and the title loop.
