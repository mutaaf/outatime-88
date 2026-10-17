---
id: 0101
title: Era roadside props with real shading, and rival name tags that never pile up
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-17
pr: 0
---

## Why
After 0100 the backdrops looked real, but the foreground was still the old cartoon kit:
giant flat triangle trees and lollipop trees in every era, flat booster rollers, and at the
start the rivals' long name tags ("RIN • The Go-Rocket 5…") overlapped into an unreadable
smear.

## What
- `src/scenes/roadside.js` (inside the lazy stage chunk):
  - **Era props.** Each era has its own lamp, tree and low prop:
    - 1955: cream lamp posts, palms, hedges.
    - 1985: cobra street lamps, autumn maples, mailboxes.
    - 1885: telegraph poles, saguaros, fence posts.
    - 2015: holo lamps, neon pylons, bollards.
    - 2088: neon pylons, monoliths, bollards.
    - 2026: wet lamps with light pools, shaded palms, hydrants.
  - **The solid on-road hazard per era.** Each era has a different hazard: 1955 a topiary in a stone planter, 1985 a maple in a brick planter, 1885 a saguaro on a rock, 2015 a holo pillar, 2088 a neon monolith, 2026 a wet palm planter.
  - **Shading.** Each piece is painted once per era as a shaded sprite (gradients, a rim light in the era's horizon colour), plus a fog-coloured silhouette for distance tint and one soft contact-shadow sprite. Per frame it's drawImage only.
  - **Sizes.** Sprites are capped at 30 % of screen height and width.
  - **Collision.** Collision boxes are unchanged. The hazard keeps its close-shave ring.
- **Contact shadows.** Rivals and traffic get soft contact shadows.
- **Name tags.** Tags are queued while cars draw, then laid out once per frame:
  - short names (driver nickname or live initials), nearest first;
  - only cars close to you, fading in with nearness;
  - nudged up when they'd collide;
  - capped at 3 on phones and 5 on larger screens.
- **Booster rollers.** Restyled as a dark housing with a glowing wheel, held still in calm mode.
- **Bundle.** The old 1955 prop code left main.js (main 58.4 kB gz).

## Acceptance criteria
- [x] No triangle or lollipop trees in any era. Each era's roadside matches its backdrop.
- [x] No roadside sprite is taller or wider than 30 % of the screen (e2e asserts it).
- [x] At the start, tags are readable and never overlap (unit test). Phones show ≤ 3 tags.
- [x] Sim sizes and positions unchanged. The hazard reads as solid.
- [x] Lazy chunks only, quality-tier aware (fog tint off on low), no trademarks.

## Test plan
- `tests/unit/roadside.test.js`: tag layout covers no overlap, nearest first, the phone cap, distance fade, and leaving the pool untouched.
- `tests/e2e/backdrops.spec.js`: every era at phone size. Checks sprite size caps, tag count and no errors.
- `tests/e2e/budget.spec.js`: stage including roadside < 10 kB, era art ≤ 25 kB total.
- Manual: before/after screenshots on production at phone and iPad sizes, both orientations.

## Out of scope
- The classic hurdles (laser bar, light gate, barricade) keep their gameplay colours.
- The 3D view keeps its own props.
