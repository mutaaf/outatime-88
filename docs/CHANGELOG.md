# Changelog

One line per shipped change, newest last: `YYYY-MM-DD · #<ticket> · <player-facing summary>`.

2026-10-16 · port from single-file prototype · Vite build, bundled fonts/CSS (no CDNs), first modules carved out, unit + e2e test suite, served at /outatime/
2026-10-16 · — · Product vision rewritten around the 10x pillars; backlog regroomed (0009–0015 added)
2026-10-16 · #0001 · Original roster: every driver, car, crew, rival and place now has an invented name (title OUTATIME 88 stays); old saves keep their livery
2026-10-16 · 0006 0010 · Procedural synthwave score per era that builds with speed (drums → bass → arps → lead at 86+), a growling engine that revs with speed, and a compressor so crashes never clip over the music
2026-10-16 · 0009 0014 0003 · Speed you can feel: speed lines and a push-in toward 88, a chromatic time-warp tunnel, crash slow-mo with spark showers, near-miss hit-stop chains; the warp is now earned (no more instant warps from boost); everything calms down under reduced motion
2026-10-16 · 0002 · Readable at speed: one announcement at a time (big moments preempt, repeats don't flicker), a coach that only teaches what you haven't learned yet in one short line, and a slim one-row phone HUD so the road is visible
2026-10-16 · 0011 · A campaign ladder: bronze/silver/gold targets on every level, your best on each card, the next target on the results screen, and new players unlock levels by earning bronze
2026-10-16 · 0017 · A title screen with attitude: chrome-and-neon OUTATIME 88 wordmark, one-line tagline, how-to-play tucked away, and START always on screen
2026-10-17 · 0004 · Under the hood: track generation now lives in its own tested module (continuous road, open lanes, deterministic per level), no change to how races play
2026-10-17 · 0021 · No more overlaps: a slim one-row HUD on phones in both orientations and small tablets, thumb-sized DRIFT / JUMP / WARP pads that never clip, and tips that never land on the HUD or on each other
2026-10-17 · 0022 · One-tap start: the title is now just the car, OUTATIME 88 and a big PLAY — tap anywhere to race; events, garage and sound are small icons, and new players get a steering prompt in the race instead of a manual
2026-10-17 · 0016 · Races have an ending: every time bonus is worth a bit less than the last, each level has a hard finish, a visible race clock turns red for the FINAL STRETCH, and medal targets are re-measured for the shorter, tenser runs
2026-10-17 · 0024 0025 · A global leaderboard: tap 🏆 on the title for all-time and today's best, enter three initials once and every run posts itself with your rank; scores are checked on the server so the board stays honest
2026-10-17 · 0023 · Daily challenge: one road and one twist a day (heat wave, glass chassis, flux storm, rush hour) — the same for everyone, with its own board
2026-10-17 · 0040 · Under the hood: physics no longer reads anything the renderer writes (tyre contact moved into its own tested module), so a second renderer can draw the same race
