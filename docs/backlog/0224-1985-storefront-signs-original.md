---
id: 0224
title: The 1985 strip-mall signs quote a real video chain's slogan and a real karate film — rename them
status: ready
priority: P1
size: S
lens: authenticity
created: 2026-10-29
pr:
---

## Why
Invariant 7 forbids real brand marks and quoted slogans. A scout play-through of the 1985
era (1280x720) shows a strip-mall sign "BLOCKBUSTED" on the backdrop and a roadside board
"BLOCKBUSTED · BE KIND · REWIND" (a one-letter change to a real chain, with that chain's real
rental slogan), next to "VIPER KAN DOJO · KARATE FOR KIDS · SAT" (a rival-dojo-plus-kids-karate
pairing from one film), under a "TRIPLE PINES MALL" pylon. `docs/EASTER_EGGS.md` calls the
first an "invented parody name", but the slogan is a quotation, and the combination is the
kind of reference a lesson from 2026-10-17 says reads as a quote by combination. Each of
these lines is in `src/scenes/s1985.js` and is not part of the operator-gated 0189.

## What
Replace the names and slogans with our own invention, keeping the layout, colours and
timing (the mall sign's lap-1 joke stays, with a new mall name). Suggested: "REWIND-O-RAMA"
with "NEW TAPES · FRIDAY NIGHTS", "IRON LOTUS DOJO" with "BELTS FOR EVERYONE · SAT" (no rival
dojo, no kids' tagline), mall "SIX ELMS MALL" → "FIVE ELMS" after lap 1. Touches
`src/scenes/s1985.js` (lines ~56, 57, 103, 136-139) and the 1985 rows of `docs/EASTER_EGGS.md`.

## Acceptance criteria
- [ ] None of "BLOCKBUSTED", "BE KIND", "REWIND" (as a slogan), "VIPER KAN", "KARATE FOR KIDS", "TRIPLE PINES" appears in `src/` or `docs/EASTER_EGGS.md`
- [ ] The mall sign still changes after lap 1; sign text still fits its board at 390x844 and 1280x720 (screenshot)
- [ ] Stage chunk stays within its 25 kB gz budget; no new hosts

## Test plan
Unit test that greps the s1985 sign tables for a banned-phrase list (add the list to an
existing data-integrity test), and asserts every sign string is non-empty and ≤ the board
width in glyphs. Screenshot the 1985 strip mall at both viewports.

## Out of scope
The 1955/2026 clock-tower references, the "ROOK & THE PROFESSOR" crew and "PROFESSOR BACKFLIP"
trick (ticket 0189, operator's call).
