---
id: 0151
title: Rivals that race — progressive racing AI
status: shipped
priority: P0
size: M
lens: player-feel
created: 2026-10-18
---

## Why
Rivals were pace-followers: a target speed with a rubber band, a fixed ±0.46 dodge around
hazards, NOS flags from a sine wave, and no idea that the road bends. The user: "the other
racers need to be way more intelligent as the game progresses".

## What
- `src/rival-ai.js` (lazy chunk, preloaded at boot; rivals fall back to the old simple driver
  until it lands): a driver profile per roster car class (skill, aggression, consistency, NOS
  craft, with a little per-seed character), ramped by a progression tier.
- Tier: `GameState.difficulty` (0..1) when the progression system sets it, otherwise
  0.12 × level + 0.045 × (wave − 1), capped at 1. The nemesis drives 0.15 tiers sharper.
- Speed: race pace + up to 9 mph at the top tier, a capped rubber band (push ≤ 14 mph behind
  you, ease ≤ 18 mph ahead, easing fades as the tier rises), corner limits from the handling
  model's grip (`cornerMph`) with a per-skill "nerve" and braking ahead of the bend, booster
  gates, loop entry speeds (never peels unless blocked), drafting (+5 mph), NOS.
- Line: the race's clean line plus an apex cut, hazard avoidance, passing on the side with room
  (inside line for skilled drivers), tucking into the wake when boxed in, one defensive move
  for aggressive drivers, mistakes (lift / run wide) that get rarer with the tier.
- The nemesis: picked per race (most aggressive near your pace), called out at ~7 s, 😈 in the
  HUD gaps, tighter rubber band so it stays in your mirrors.
- Callouts: "DOWN TO 3RD" now says who passed you and how (NOS / SLIPSTREAM / INSIDE LINE).

## Determinism
Brains are seeded from `GameState.lineSeed` (shared on live rooms and dailies) and use their own
PRNG; no Math.random, no wall clock. Live friends are humans (ghosts), not local AI. The
player's score rules and the server's checks are unchanged.

## Tests
`tests/unit/rival-ai.test.js` (corners, apex, passing without contact, hazard avoidance, NOS,
drafting, loops, tier ramp, mistakes vs tier, nemesis, determinism, footprint) and
`tests/e2e/rivals.spec.js` (a real race: on the road, order changes, spread, nemesis).
