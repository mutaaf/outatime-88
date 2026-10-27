# Accessibility

## Play on mute (ticket 0206)

The Game Accessibility Guidelines' basic hearing item: don't rely on sound alone for
essential information (https://gameaccessibilityguidelines.com/basic/). Every sound that
tells the player something about the game state needs a visual twin. Pure flavour, like
the engine note, music, turbo or pass-bys, needs none, but it is listed so nothing is missed.

`tests/unit/sound-audit.test.js` keeps this table honest. Every `play*` method on
`SoundEngine` (src/audio.js), every cue method on the street-tuner layer (src/sfx/tuner.js)
and every source file that plays a sound must appear in it in backticks, and every row must
name its visual. When you add a sound, add its row here. If it has no visual, add the visual,
or link a ticket in the Visual twin column.

| Situation | Sound | Where | Visual twin |
|---|---|---|---|
| Start lights, red then green | `playBeep`, tuner `beep` | `racestage.js`, `main.js` (live countdown) | The lights card on the grid. The live lobby shows its countdown numbers |
| Engines start on the grid | `playStartUp` | `race-flow.js` | The grid and lineup cards |
| Each lineup card | `playTone` via `cardSting` | `racestage.js` | The card itself sliding in |
| Skipping the lineup | `playTone` (520 Hz tick) | `race-flow.js` | The lineup cards give way to the lights |
| Rocket start (perfect / good / early) | `playTone` (perfect only) | `race-flow.js` | Announcement (`fx.text`, +MPH or WAIT FOR GREEN), plus a spark burst on a perfect start |
| You gain a place | `playTone` (660 Hz) | `race-flow.js` | Callout announcement, and the place card changes |
| Final lap | `playTone` (784 Hz) + speech | `race-flow.js` | Priority-3 FINAL LAP announcement, and the lap counter |
| Finish: fanfare by place (win, podium, other) + "You win!" | `fanfare` + speech | `race-flow.js`, `racestage.js` | The flag and place card, podium rows and the results card |
| Live race: countdown, GO, you finished | `playBeep`, `playCheckpoint` via `hooks.beep` | `live/controller.js`, `main.js` | The lobby's countdown numbers, the GO callout, and the YOU WIN / YOU FINISHED callout |
| Spoken announcer line | speech | `main.js` | The same text in the announcement channel |
| WARP READY | `playTone` (rising tick) | `race-step.js` | WARP READY label, and the touch WARP button's READY + double border (0112) |
| Time warp at 88 | `playTimeWarp88` | `race-step.js` | Warp tunnel, era banner and palette change |
| NOS / boost burn starts | `playBoosterHit`, tuner `nosOpen` | `race-step.js` | Boost trail and the NOS meter draining |
| NOS burn ends | tuner `nosPurge` | `sfx/tuner.js` | The boost trail stops and the NOS meter stops draining |
| Nitro flux purge (boost below warp range) | `playBoosterHit` | `race-step.js` | NITRO FLUX PURGE announcement |
| Booster gate, drift slingshot, landed stunt combo, slipstream slingshot | `playBoosterHit` | `race-step.js` | Their own announcement each (BOOSTER GATE, TIER-N DRIFT SLINGSHOT, LANDED xN, SLIPSTREAM TURBO SLINGSHOT) |
| Slipstream charging / READY | tuner draft tone + READY ticks | `sfx/tuner.js` | src/slipstream.js: greener speed lines, an edge tint and a 2 Hz READY pulse (0197) |
| Phase-juke, close shave, tree graze | `playBoosterHit`, `playCoinPickup` | `race-step.js` | The chain score plate (0205) |
| Jump cleared, slide under | `playStunt` | `race-step.js` | The chain score plate (0205) |
| Air trick, ramp launch, two-wheel tilt, barrel roll | `playStunt` | `race-step.js` | Trick counter or announcement (MEGA TOY-TRACK LAUNCH!, 2-WHEEL TILT, FLUX BARREL ROLL) |
| Hop, side-slam | `playStunt` | `race-step.js` | The car itself hops or lurches sideways (your own input) |
| Coin, plutonium core, NOS can, repair | `playCoinPickup`, `playCheckpoint`, bank samples | `race-step.js` | Pickup burst + score plate (+PTS, 1.88GW, NOS REFILL, HP REPAIRED) |
| Power-up on / off | bank samples (`zone`, `booster`, `whoosh`) | `race-step.js` | Power-up announcement, its timer, and "… OFF" when it ends |
| Shield takes a hit | bank sample (`debris`) / `playCrash` | `race-step.js` | SHIELD SAVED YOU plate |
| Near miss on a rival | `playCoinPickup` | `race-step.js` | NEAR MISS! xN announcement |
| **Near miss on traffic** | `playCoinPickup` | `race-step.js` | **Fixed here:** a 🚗 NEAR MISS! +PTS (xN) plate beside the car. It had only the combo pill ticking up before |
| Checkpoint (campaign, Endless) | `playCheckpoint` | `race-step.js`, `hazard-run.js` | CHECKPOINT announcement with the time added |
| Mission / Endless goals done | `playCheckpoint` | `main.js`, `race-step.js` | Mission / ENDLESS LEVEL announcement |
| Endless tier up | `playLevelUp`, tuner `levelUp` | `race-step.js` | TIER N level-up banner |
| Crash, wall hit, barrel | `playCrash`, `crunch` (tuner `crunch`) | `race-step.js` | −HP pop and HP bar, sparks, speed drop (and a shake unless calm motion is on) |
| Bump with a rival | `playImpact` | `race-step.js` | The car's nose dives or it rolls on the hit |
| Cone, debris | `playImpact` | `race-step.js` | Props fly and spark. A cone shows its penalty label |
| Takedown | `playTakedown` | `race-step.js` | 💥 … WRECKED announcement |
| Abilities (ZONE, AGRO, ROAR, beam) | `playAbilityZone`, `playAbilityRoar`, `playBoosterHit` | `race-step.js` | Colour tint (calm motion keeps it soft) + announcement, and the roar wave |
| Loop ahead | `playWhoosh` | `race-step.js` | The loop on screen and the side-on loop cam |
| Touchdown after a loop ride | `playLand` | `render/scene.js` | The car back on the road out of the loop cam, with sparks |
| Endless hazard warning | `playHorn`, `playBeep`, bank samples (`horn`, `beep`, `zone`) | `hazard-run.js` | Hazard announcement (icon + what to do) and the hazard art (signs, JUMP!/DUCK! cue) |
| Level crossing bell | `playTone` (880/660 Hz) | `hazard-run.js` | The crossing posts' twin flashing lights |
| Lightning strikes | bank sample (`crash`) | `hazard-run.js` | The bolt and its wash (softened under calm motion, 0188) |
| Low fuel, engine hot, the Patrol | `playBeep`, `playTone` | `hazard-run.js` | LOW PLUTONIUM / ENGINE HOT / THE PATROL IS ON YOU announcements, and the fuel and heat gauges |
| Practice-lap bump | bank sample (`bump`) | `hazard-run.js` | CLOSE ONE — PRACTICE LAP announcement |
| Run over (fuel, stall, timeout, a hazard) | `playTone`, `playCrash`, tuner `runOver` | `hazard-run.js` | Cause announcement, then the continue offer or the results |
| Proximity tick (0191) | src/proximity-cue.js | `race-step.js` | The threat itself. It only ticks for a car or obstacle in your lane, ahead, under 0.8 s away |
| HONK | `playHorn` | `touch/bridge.js` | Your own button press, which carries no game state |
| Menus (garage buy, paint, roster pick) | `playCoinPickup`, `playCheckpoint`, `playStunt` | `garage-ui.js`, `main.js` | The menu change itself (owned badge, new paint, selected card) |
| Engine flavour: turbo, shifts, limiter, overrun pops, Doppler pass-bys, big-air drop | tuner `blowOff`, `chirp`, `pop`, `limiterTick`, `passBy`, `bassDrop` | `sfx/tuner.js` | None needed (flavour). The mph readout, the cars passing on screen and the car in the air carry the same facts |
| Generic voices used by the rows above | `playTone`, `playImpact` | `audio.js` | See each row |

Calls per file (the unit test counts `SoundEngine.*`, `sound.*`, `hooks.beep`, `RC.say`,
`RC.fanfare` and `.speak` calls in each file under `src/`). A new call changes the count, and
the test fails until its row is checked or added here and the count is updated:

<!-- sound-calls
garage-ui.js 4
hazard-run.js 16
live/controller.js 3
main.js 6
race-flow.js 8
race-step.js 53
racestage.js 4
render/scene.js 1
touch/bridge.js 1
-->

No larger gaps were found, so there are no follow-up tickets. Music is out of scope
(captions for the score are a separate question).

## High contrast (ticket 0214)

Windows High Contrast (`forced-colors: active`) drops our fills, gradients and glows. The block
at the end of `src/styles.css` gives every button, chip, toggle and tab a `ButtonText` edge, marks
a selected choice with a `Highlight` fill **and** a marker (a ✓ before the label, an underline on
the VIEW 2D/3D half, the switch knob's side), and draws focus as a 3px `Highlight` outline. Paint
and car-colour swatches opt out (`forced-color-adjust: none`): their colour is the content.
`prefers-contrast: more` thickens the edges, drops text glow and adds the same ✓. A selected
style that only changes the fill must be added to the `:is(...)` lists there.
Guarded by `tests/e2e/forced-colors.spec.js` (title, Settings, garage, pause).
