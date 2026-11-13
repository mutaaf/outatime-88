---
id: 0270
title: EVENTS sheet car strip — 10 px floor and car names that read whole
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-11-13
pr:
---

## Why
Pillar 3 (readability) and invariant 8. 0262, 0263, 0267 and 0268 raised the type floor on
the garage, results, HUD and title, but the EVENTS sheet's "SELECT YOUR DRIVER" block was never
covered: the Scout's computed-font-size walk at 390x844 found 8-9 px text in it (`💚 100 HP +
ENDLESS WAVE SCALING`, `💚108HP`, `1230kg`, `LAND 15 TAKEDOWNS`, `BUY FOR ⚡ 900`, the crew
line "Rook & The Professor") and the car names are cut with an ellipsis ("'88 Flux Coupe
G…", "🔒 '70 Brawler 44…", "🔒 '99 Kestrel GT…"), so you cannot tell cars apart. Several are
Tailwind arbitrary sizes in index.html (`text-[9px]`, `text-[8px]`, lines ~456, 494), which a
CSS-only grep misses (docs/LESSONS.md 2026-11-12). Source:
https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101

## What
Raise every visible text node in the EVENTS sheet's driver/vehicle block to >= 10 px; let the
car-name line wrap to two lines (as 0262 did for the garage strip) instead of truncating; keep
locked cars' captions bright. Touches index.html classes and the CSS that styles that strip.

## Acceptance criteria
- [ ] At 360x640, 390x844, 844x390 and 1280x720 every visible text node inside the EVENTS sheet has computed font-size >= 10 px
- [ ] No car name in the strip is ellipsised or clipped (compare against the parent's content box, after `document.fonts.ready`)
- [ ] START RACE stays reachable (scrolls into view) and the sheet gains no horizontal scroll
- [ ] Garage sheet and title unchanged

## Test plan
New or extended e2e (events/level-select spec): open EVENTS at each viewport, walk visible text
nodes, assert size; measure each name alone in the same font and assert it fits. Break the
CSS temporarily to prove it bites.

## Out of scope
Changing the car roster, copy meaning or unlock rules.
