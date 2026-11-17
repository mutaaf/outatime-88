---
id: 0280
title: HUD speed and FLUX bars are told apart by more than colour
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-11-17
pr:
---

## Why
In the speed card (index.html `#hudSpeedCard`) the speed bar and the FLUX bar carry no label:
only the NOS bar has a "NOS" caption; the other two are a rainbow bar and a yellow one that a
player with red/green or yellow/blue colour deficiency can't name at a glance. Guideline: no
essential information conveyed by a fixed colour alone
(https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/,
https://learn.microsoft.com/en-gb/gaming/accessibility/xbox-accessibility-guidelines/103).
The game has no colour-vision handling today (grep: none in src/).

## What
Give each of the three bars a second channel: a short in-bar or end-cap caption (SPD, FLUX,
NOS, >= 10 px, 0267) or a distinct pattern/shape (tick marks, end icon), plus `role="meter"`
with `aria-valuenow` written change-only by `src/hud.js`. Do not grow the card on phones
(check hud.spec, hud-size.spec, touch-layouts.spec; lesson 2026-11-12).

## Acceptance criteria
- [x] Each bar has a visible text or shape marker readable with colours removed (e2e screenshot under `filter: grayscale(1)` still names all three, asserted via DOM text)
- [x] Captions >= 10 px, 4.5:1 contrast, no overlap at 1280x720, 390x844, 844x390, 320x568, LARGE HUD
- [x] Meters expose role + value to assistive tech
- [x] hud, hud-size, landscape-tips, touch-layouts specs green; main <= 58 kB

## Test plan
New `tests/e2e/hud-meters.spec.js`: captions present and visible per bar at the sizes above;
aria values change with speed; no overlap via `hudRects()`.

## Out of scope
A full colour-blind palette mode, rival colours (they carry letters), era palettes.
