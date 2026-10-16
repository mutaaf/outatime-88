---
id: 0001
title: Replace trademarked character, car and brand names with original ones
status: ready
priority: P0
size: M
lens: authenticity
created: 2026-10-16
pr:
---

## Why
The prototype's roster and UI name real film/TV characters and brands (Marty McFly & Doc
Brown, Dominic Toretto, Brian O'Conner, K.I.T.T., Speed Racer's Mach 5, Iron Man/J.A.R.V.I.S./
Stark, Hot Wheels, Burnout, Midnight Club, and others) and real car models. That's legal risk
for a public site and caps the game's identity at "fan mash-up". Original names that *evoke*
the 80s give us something we own and can build lore around. This is AGENTS.md invariant 7.

## What
- Audit `src/data.js` (`POP_CULTURE_ROSTER`, `MULTIVERSE_POOL`, `WORLD_LEVELS`, `ERAS`,
  `LIVERY_OPTIONS`, `UNDERGLOW_OPTIONS`, `RIVAL_NAMES`), `index.html` copy, and UI strings in
  `src/main.js` (announcements, coach text, button titles, `JarvisAI` copy).
- Replace each trademarked person, brand, or car-maker name with an invented one in the same spirit
  (e.g. a stainless gull-wing "Flux Coupe 88", a co-pilot AI with an original name). Keep
  ids/keys stable where saves reference them (`livery: 'STAINLESS'` is saved; check `SaveStore.data`).
- Keep the game title "OUTATIME 88" as the homage.
- Write the replacement mapping in the PR body.

## Acceptance criteria
- [ ] A unit test scans `src/` and `index.html` for a denylist (McFly, Doc Brown, Toretto, O'Conner, K.I.T.T, Knight Rider, Mach 5, Speed Racer, Stark, Iron Man, J.A.R.V.I.S, Hot Wheels, Midnight Club, Burnout, Back to the Future, DeLorean, Skyline, Charger, Trans Am, Hill Valley) and fails on any hit
- [ ] Existing saves still load (unit test with an old-shape save including `livery` and `selectedLevel`)
- [ ] Start screen and garage screenshots at 1280x720 and 390x844 read naturally with the new names

## Test plan
New `tests/unit/ip-denylist.test.js` reads source files and asserts zero denylist matches
(case-insensitive). Extend `save.test.js` with an old-save fixture. Existing e2e must stay green.

## Out of scope
Changing car art, physics or stats. Renaming the repo or title.
