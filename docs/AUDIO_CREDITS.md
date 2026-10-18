# Audio credits (ticket 0132)

Every recorded sound in `src/sfx/audio/` is **CC0 1.0** (public domain). Nothing here needs
attribution, but we credit the creators anyway. Each pack's license text is kept in
`src/sfx/audio/licenses/`. The files were downloaded from the official sites (kenney.nl and
opengameart.org) on 2026-10-18 and are served only from the game's own `/outatime/assets/`.

**Processing.** Everything was downmixed to mono and peak-normalised to −1 dBFS.
- **One-shots:** MP3, 64 kbps, 44.1 kHz. MP3 because every browser, Safari included, decodes it in `decodeAudioData`.
- **Engine loops:** 16-bit WAV at 22.05 kHz, so they loop with no MP3 encoder gap. `engine-lo` was re-cut with a 0.2 s equal-power crossfade so its seam doesn't click.
- **`whoosh`:** trimmed to 2.4 s with fades.

Total size: about 372 kB. It loads after the first tap or key, and the service worker caches it the first time.

| File | Used for | Source file | Pack / page | License |
|---|---|---|---|---|
| engine-lo.wav | engine, low revs | Car_Engine_Loop.ogg | [Car Sound Effects Pack (Low Quality)](https://opengameart.org/content/car-sound-effects-pack-low-quality), OpenGameArt | CC0 |
| engine-hi.wav | engine, high revs | loop_0.wav | [racing car engine sound loops](https://opengameart.org/content/racing-car-engine-sound-loops), OpenGameArt (from a public-domain pdsounds.org recording) | CC0 |
| start.mp3 | engines firing up on the grid | Car_Engine_Start_Up.ogg | Car Sound Effects Pack (Low Quality), OpenGameArt | CC0 |
| horn.mp3 | HONK | Car_Horn.ogg | Car Sound Effects Pack (Low Quality), OpenGameArt | CC0 |
| crash.mp3 | crashes | impactMetal_heavy_000.ogg | [Impact Sounds](https://kenney.nl/assets/impact-sounds), Kenney | CC0 |
| crash2.mp3 | crashes, front-end hits, takedowns | impactMetal_heavy_002.ogg | Impact Sounds, Kenney | CC0 |
| bump.mp3 | door-to-door contact | impactPlate_medium_000.ogg | Impact Sounds, Kenney | CC0 |
| cone.mp3 | cone hits | impactSoft_medium_000.ogg | Impact Sounds, Kenney | CC0 |
| debris.mp3 | light debris | impactTin_medium_000.ogg | Impact Sounds, Kenney | CC0 |
| land.mp3 | landing thump | impactPunch_heavy_000.ogg | Impact Sounds, Kenney | CC0 |
| takedown.mp3 | takedowns | explosionCrunch_000.ogg | [Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds), Kenney | CC0 |
| roar.mp3 | ROAR special | lowFrequency_explosion_000.ogg | Sci-Fi Sounds, Kenney | CC0 |
| booster.mp3 | booster gates and pads | forceField_000.ogg | Sci-Fi Sounds, Kenney | CC0 |
| nos.mp3 | NOS burn (looped from 0.4 s) | thrusterFire_000.ogg | Sci-Fi Sounds, Kenney | CC0 |
| whoosh.mp3 | entering a loop, time warp | engineCircular_000.ogg | Sci-Fi Sounds, Kenney | CC0 |
| coin.mp3 | pickups | highUp.ogg | [Digital Audio](https://kenney.nl/assets/digital-audio), Kenney | CC0 |
| warp.mp3 | 88 MPH time warp | phaserUp3.ogg | Digital Audio, Kenney | CC0 |
| zone.mp3 | ZONE slow-mo | phaserDown2.ogg | Digital Audio, Kenney | CC0 |
| stunt.mp3 | stunts | powerUp7.ogg | Digital Audio, Kenney | CC0 |
| beep.mp3 | start lights; GO is the same tone an octave up | tone1.ogg | Digital Audio, Kenney | CC0 |
| checkpoint.mp3 | checkpoints | confirmation_002.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds), Kenney | CC0 |
| click.mp3 | menu buttons (never during a race) | click_001.ogg | Interface Sounds, Kenney | CC0 |

**Not recorded:**
- **Synthesized:** the tyre squeal and the wall scrub are made in `src/sfx/bank.js`. No CC0 tyre-screech recording we could verify was available on the allowed sources.
- **Unchanged:** the music score and fanfares stay procedural (`src/music.js`, `src/racestage.js`).
- **Fallback:** every recorded sound falls back to its old synth voice if its file can't be fetched or decoded.
