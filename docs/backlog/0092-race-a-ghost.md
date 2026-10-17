---
id: 0092
title: Race a ghost — your rival's best line, live on your HUD strip
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-17
pr: 41
---

## Why
"Beat BIF's score" is abstract; racing BIF's actual run, seeing them pull away on the strip and
catching them before the line is the most motivating loop in arcade racing (0012 wanted the
local version). The Worker already keeps one validated ghost per initials per track (0091).

## What
- Every finished campaign race records distance + lane at 5 Hz (drift-free grid) and posts
  it with the score; the Worker keeps it if it's that player's best on the track.
- Results: "👻 RACE BIF'S GHOST" (the player just above you on this track; "RACE YOUR BEST"
  at #1) starts the same track with the ghost loaded.
- In the race: a 👻 dot on the HUD track strip labelled with the live gap ("👻 BIF +1.2"),
  red when you're behind; the results card says "YOU BEAT BIF'S GHOST BY 0.8s!" or "…GHOST WON".
- Render-agnostic (HUD only), so it works the same in 2D and 3D.

## Acceptance criteria
- [x] Unit: recorder samples 5 Hz under any sim step, skips runs < 5 s; ghost finish time,
      signed gap, verdict; bad traces rejected
- [x] e2e (real handlers): a finished race stores a ghost; RACE YOUR BEST starts a race with
      the 👻 on the strip; the result is called at the line

## Test plan
`tests/unit/ghost.test.js`, `tests/e2e/compete.spec.js` (ghost case).

## Out of scope
Drawing the ghost car in the world (needs both renderers; a follow-up once 3D settles).
