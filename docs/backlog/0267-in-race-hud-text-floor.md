---
id: 0267
title: In-race HUD labels never drop below 10px
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-11-12
pr: 259
---

## Why
Scout played a race at 390x844 touch and 1280x720 keyboard and measured computed font sizes.
The labels a player glances at while at 100+ mph are tiny: the YOU dot on the rival bar is 8px
(`.hud-dot-you`, `clamp(8px, 1.3vmin, 13px)`, src/styles.css:418), the speed unit MPH, FLUX,
the PTS line, ROAR and the coach tip's GOT IT button are 9px, the NOS touch cap label is 9.4px,
and the desktop KEYS chip is 8.6px. Tickets 0262/0263 fixed the garage and results screens; the
HUD, the screen read most, was left. Xbox Accessibility Guideline 101 sets minimum text sizes
for HUD meters and says phones need more pixels than TVs for the same readable size:
https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101 (pillar 3
readability, pillar 6 phone first-class).

## What
Raise every in-race HUD text element to a computed font-size >= 10px (>= 11px for the YOU dot
and the coach GOT IT button) at all viewports: the `.hud-dot-you` clamp floor, the MPH / FLUX /
PTS labels, the ROAR label, `.tc-lbl`, `#btnDismissCoach`, the KEYS chip. Keep numbers' size
unchanged; let labels shorten or the HUD panel grow a few px rather than overlap. Touches
src/styles.css (and src/touch CSS if `.tc-lbl` lives there) only.

## Acceptance criteria
- [ ] During a race, every visible HUD text node (`#hud *`, `.tc-lbl`, `#btnDismissCoach`, the keys chip) has computed font-size >= 10px at 390x844 touch and 1280x720 keyboard
- [ ] No HUD panel overlaps another or a touch pad (rect check, state the player sees: race running, coach tip shown)
- [ ] Label contrast >= 4.5:1 on its plate
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
Extend the HUD/layout e2e (grep tests/e2e for `hud`): start a race, wait for the coach tip, walk
visible text nodes and assert size; reuse the existing overlap helper at both viewports.

## Out of scope
Title and garage chrome (0268); an in-game text-scale setting.
