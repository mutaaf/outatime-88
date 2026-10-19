---
id: 0157
title: Painted cars everywhere, thrusters on each car's own pipes, and the Volt Roadster
status: shipped
pr: 86
priority: P1
size: L
lens: player-feel
created: 2026-10-18
---

## Why
Players said the 2D cars still look like "weird blocks": the race sprites, rivals and traffic
were low-poly boxes (traffic was flat rectangles), the loop view drew shaded boxes, and flames,
NOS and hover glows came out of fixed screen spots whatever car you drove. Kids also asked for
an electric roadster.

## What
- `src/car-shapes.js`: one table of bodies (roster, the new roadster, sedan/taxi/SUV/semi
  traffic) with tail-light style, exhaust tips and thrust kind.
- `src/car-paint.js`: a canvas painter that lofts rounded cross-sections into smooth shaded
  paint, glass with reflections, glowing tail/brake lights, plate, diffuser, exhaust tips,
  real tyres with rims and wells, contact shadow; any angle (race, garage, cards, loop).
- `src/car-sprite.js`: cached chase-cam sprites for every car (per-body frame so a semi fits),
  brake-light variants, exhaust anchors, `drawThrust` for NOS / plume / drift flare / hover
  pads / cold-gas puffs from those anchors; nose now points the way you steer.
- 2D race: rivals, friends, ghosts and traffic painted, turned by the road's heading and where
  they sit in your view; takedown wrecks tumble as the car itself; loop view paints cars
  pitched with the loop.
- 3D: per-car flame cones on each car's exhaust tips (NOS, warp fire, cold gas, jet); fire
  trails follow the car's track width.
- New car VOLT ROADSTER (electric: speed 9, accel 9, grip 5, flux 4, armor 3; 1,200 ⚡), with a
  motor-whine voice and a 3D body.

## Acceptance criteria
- Every car in 2D (player, rivals, traffic, loop view, wrecks) is painted, not boxes.
- Flames / NOS / hover leave each car from its own tips, in 2D and 3D.
- The roadster is in the garage, races with its own body, and boosts with cold-gas puffs.
- Main bundle stays under budget; new art is lazy.

## Test plan
- Unit: every body paints with detail and one anchor per tip; anchors in screen space; yaw
  direction; roster balance and maxHp for the roadster.
- E2E: roadster in garage and race with two nozzles lit on NOS; loop traffic and 3D loop specs.
