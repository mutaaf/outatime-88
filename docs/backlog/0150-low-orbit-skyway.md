---
id: 0150
title: Low Orbit Skyway — a glass highway over Earth (level 6, 2061 era)
status: shipped
priority: P1
size: M
lens: world
created: 2026-10-18
pr: TBD
---

## Why
The user asked for a roadster-in-space track. This is an original homage with no trademarks:
a glass highway in low orbit with Earth below, a launch tower at the start, and a cherry-red
roadster with a white-suited mannequin drifting over the planet.

## What shipped
- **Level 6 "LOW ORBIT SKYWAY 2061":** appended so saved level indexes stay put; medals sit a
  step past level 5. It opens with `?level=orbit` (or `?level=6`), and named slugs now work for
  every level.
- **2061 era:** appended to the era list, so warps can land on it. Its 2D scene
  (`src/scenes/s2061.js`) paints:
  - starfield, galaxy band, sun glare;
  - Earth's limb with an atmosphere glow, clouds and night-side city lights;
  - an orbital station, a moon, satellites, a launch tower with its rocket, and blinking gantry
    beacons;
  - streaming dust motes.
  It has its own roadside props (light buoys, solar arrays, dish antennas, an asteroid hazard)
  and a floating lydian score.
- **Glass ribbon deck:** in 2D the toy track becomes see-through blue with neon cyan/violet
  edges (`era.deck`); boosters turn violet. In 3D the deck is a glossy, softly glowing blue
  ribbon.
- **3D Earth:** generated in a shader (`src/render3d/orbit.js`: oceans, continents, clouds, city
  lights past the terminator, an atmosphere rim) and drawn as a backdrop layer. A space sun
  replaces the synthwave sun, and the grid and mountains hide.
- **Low G:** airborne gravity in this era is 0.45×, so jumps hang about 2.2× longer.
- **Track book:** the level's bags open with a corkscrew, still hold every curve and set piece,
  and the sweepers and double-apex 180s hold about 1.6× longer, like orbital arcs.
- **Easter eggs:** the roadster drifts past for 12 s of every 40 s, and a rocket climbs off the
  limb on the final lap.

## Compatibility
- The daily challenge still draws from the first five levels (`DAILY_LEVELS`), so today's daily
  never moves.
- The live-room server (`src/worker/live-rules.js`, frozen) knows 5 levels, so lobbies offer the
  first `LEVEL_COUNT`. An operator PR raises it to 6.
- Leaderboard submissions already accept any level index under 50.
