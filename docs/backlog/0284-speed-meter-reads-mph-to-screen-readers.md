---
id: 0284
title: The speed meter tells screen readers the speed in mph, not a percentage of 160
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-11-18
pr:
---

## Why
Pillar 3 (readability) and the accessibility floor. Ticket 0280 made the HUD bars
`role="meter"`, but `src/hud.js` writes the bar's width as `aria-valuenow`, so the Speed
meter announces "62 percent" when the car does ~99 mph. The number that matters (88 mph is
the whole game) never reaches a screen reader. WAI-ARIA says a meter's `aria-valuetext`
should carry the human-readable value when the raw number is not meaningful
(https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/meter_role).
The 0280 lesson (LESSONS 2026-11-17) left this as a follow-up because main JS has one byte
of headroom (57.999 of 58 kB gz).

## What
Make the Speed meter announce "N mph" without adding bytes to the startup bundle: either
set `aria-valuemin="0" aria-valuemax="160"` and write the mph itself as `aria-valuenow` for
that one meter (the existing `width()` call already receives the value; pass the mph where it
has it, no new `setAttribute`), or move the whole meter-ARIA write out of `src/hud.js` into
a lazy chunk that main already loads after boot. Pick the one that leaves main's size
unchanged or smaller; if main grows, move something else lazy first (rule in AGENTS.md §5).
FLUX, NOS and HP keep a percentage (that is what their bars show).

## Acceptance criteria
- [ ] While racing at ~88 mph, the Speed meter's accessible value reads 88 (mph), and its
      max reads 160; FLUX/NOS/HP still read 0-100.
- [ ] `budget.spec.js` main JS ≤ 58 kB gz still passes.
- [ ] No extra DOM writes per frame: the write stays change-only (existing hud unit test
      for change-only writes passes).
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; no visual change.

## Test plan
Extend the 0280 hud unit test: feed a speed, assert the meter's `aria-valuenow` equals the
rounded mph and `aria-valuemax` is 160. E2E (in tests/e2e/hud-meters.spec.js, not
title.spec.js): at race speed read the attribute on the Speed meter.

## Out of scope
Spoken speed announcements while driving, changing the bar's look, HUD labels.
