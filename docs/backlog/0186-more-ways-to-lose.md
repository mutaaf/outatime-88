---
id: 0186
title: More ways to lose in Endless — telegraphed run-ending hazards, fuel, NOS heat, the Patrol, checkpoints
status: shipped
priority: P1
size: L
lens: player-feel
created: 2026-10-19
pr: 108
---

## Why
An Endless run could only end at HP 0 or when the Time Storm caught you, so a careful player
coasted forever and a run had no sharp moments. Endless runners stay tense because one mistake
can end the run, and stay fair because every danger is readable before it arrives.

## What
Endless solo runs only, after a gentle first stretch (≈50 s at 88 mph). Rules are pure and
seeded in `src/hazards.js`; `src/hazard-run.js` (glue) and `src/hazard-art.js` (2D art + HUD)
are lazy chunks.

- **Run-ending road hazards.** Each one has a roadside sign, a lane highlight, a sound and a call-out about
  1.6 s ahead (2.6 s and a how-to line the first time you ever meet it):
  - **Broken bridge** (tier 2): a gap across the road. You have to jump it.
  - **Wrong-way driver** (tier 2): oncoming headlights lock onto your lane 1.8 s out. Change lanes or jump.
  - **Low overpass** (tier 3): covers two lanes. Hold brake to duck under, or take the green lane.
  - **Crumbling road** (tier 3): two lanes crack and fall away. Steer into the green lane.
  - **Train crossing** (tier 4): the bells start 2.4 s out and the train fills the crossing just as
    you would arrive. Brake and let it pass.
  - **Missing guardrail** (tier 4): grinding that side drops you off the edge.
  - **Storm lightning**: once the Time Storm is close, glowing rings land in your lane. Steer out.
- **Resource fails:**
  - **Plutonium fuel:** the tank drains with road covered, and every PLUTONIUM core refills it. Dry means no throttle: you coast, and five seconds without a core ends the run.
  - **NOS heat:** burning heats the engine. One tank is fine; two back to back blow it.
  - **Stalling:** crawling below 25 mph for 4 s ends the run. Waiting at a crossing doesn't count.
- **The Patrol:** an original time-patrol hover car. A slip (a crash, grinding along a wall at speed for 0.6 s, or crawling; a slow-down within 3 s of a slip doesn't count twice)
  puts it on your tail for 8 s, or 5 s at full difficulty. A second slip in that window and you're caught.
  It shows rising behind the car with its timer.
- **Checkpoints** (from tier 3): a gate every 3,600 distance units with a clock. Spare time carries over,
  up to 8 s. A missed gate is TIME OUT.
- **Fair by design:**
  - The first time you ever meet a hazard kind, it costs speed but not the run ("PRACTICE LAP").
  - A shield saves you once. The magnet doesn't help.
  - A paid continue clears the next 3 s of road, part-fills the tank, cools the engine and calls off the Patrol.
- **Death card:** the results show the cause ("FELL THROUGH THE BROKEN BRIDGE") and a tip. Deaths by
  cause and the kinds you've met are kept in `save.endless.hz`.
- **Run goals:** survive N road hazards, jump N broken bridges, survive N train crossings.
- **3D:** hazards appear as the existing simple obstacle shapes (no new meshes).
- **TV mode:** the phone pad gets a JUMP button, so broken bridges can be cleared from the couch.

## Not changed
- Scoring and the server check: hazards only end runs, cut speed or stop the throttle. No new
  penalty kind and no `src/worker` change.
- Arcade, daily and live races: hazards stay off.

## Acceptance criteria
- Ignoring each hazard ends an Endless run, and the death card names the right cause and a tip.
- Doing what the call-out says (jump, duck, brake, change lanes, take the green lane) survives every hazard.
- Nothing can end the run in the first ≈50 s, and every hazard is telegraphed at least 1.6 s ahead.
- The first meeting of each kind is forgiven once, and a shield saves you once.
- Placement is seeded and deterministic.
- Main stays under budget, and so does the race step, which only gets hooks.

## Test plan
- Unit (`tests/unit/hazards.test.js`): lanes, unlocks, seeded placement, telegraph timing,
  each hazard's contact rule (hit and avoided), train window, fuel, heat, stall, Patrol,
  checkpoints, and save bookkeeping.
- e2e (`tests/e2e/hazards.spec.js`):
  - ignoring each kind, and the resource fails (fuel, heat, stall, Patrol, time-out);
  - reacting correctly survives;
  - the first meeting is forgiven, and a shield saves you;
  - hazards are laid down by themselves after the gentle stretch.
