---
id: 0018
title: Replace real-world place and route names (Mulholland, Wangan, Tokyo) with invented ones
status: ready
priority: P1
size: S
lens: authenticity
created: 2026-10-17
pr:
---

## Why
Pillar 1 and invariant 3.7. Ticket 0001 renamed drivers and cars, but a 2026-10-17 playthrough
still shows real-world street/route names on screen: the fork banner reads "WANGAN TURBO
TUNNEL", level 4 is "MULHOLLAND 2088 HEAT 5", level 3's subtitle says "Wangan Boost Tunnels",
and `LVL3_TOKYO_2015` leaks into ids. Several roster entries are also generic parodies
("SENTRY-2000 Talking Coupe", "The Go-Rocket 5", franchise "Orange Track League") that read
as nods to real properties. The invented universe should be cohesive, not borrowed.

## What
Rename player-visible strings only (never save-relevant ids: `LVL4_MULHOLLAND_2088` and
`LVL3_TOKYO_2015` keys are used by `src/progress.js` medals and save data, keep them):
level names/subtitles in `src/data.js`, fork labels and announcements in `src/main.js`
(~lines 232, 1511, 1516) and `index.html:243`, and the roster car/franchise strings at
`src/data.js` ~246, 262, 343. Pick names that fit the existing invented geography
(Clock Hollow, Cedar Ridge, Skyway).

## Acceptance criteria
- [ ] No player-visible string contains "Mulholland", "Wangan", "Tokyo", "Sentry-2000", or "Go-Rocket"
- [ ] Internal ids and the save key are unchanged; an old save still loads with its medals
- [ ] The IP denylist unit test includes the new words and passes
- [ ] Works at 390x844 and 1280x720 (new names fit their labels without wrapping or overlap)

## Test plan
Extend the existing IP denylist test in `tests/unit/` with these words, scanning `src/` and
`index.html`. Add a unit test loading an old-shape save and asserting medals survive.

## Out of scope
Renaming ids, reworking era content, new levels.
