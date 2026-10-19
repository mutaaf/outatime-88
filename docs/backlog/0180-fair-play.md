---
id: 0180
title: Fair play — mashing can't break the game, and the board catches runs that did
status: shipped
pr: 104
priority: P0
size: M
lens: tech-health
created: 2026-10-19
---

## Why
The user: "theres ways to hack the game like pressing jump continuously and other means i
think we need ways to limit and catch it". Playing as a cheater confirmed it: holding H made
the car fly for the whole race while farming points and healing to full.

## Audit (2026-10-19, main @ 2f8c017)
| # | Exploit | How | Effect |
|---|---------|-----|--------|
| 1 | **Infinite hover** | Mash or hold H/E/W/↑ in the air: every press (and every key auto-repeat) is a backflip that sets vertical speed to 240 | Stay airborne forever: skip obstacles, traffic, cones |
| 2 | **Trick farming** | Same presses: each trick scores `base × combo × trick-number`, so a long air grows quadratically; each trick also tops up the magnet | Millions of points, permanent magnet |
| 3 | **Heal farming** | Each backflip heals 8 HP | Unkillable in Endless |
| 4 | **Barrel-roll spam** | Space in the air (y > 38) is a 1,600 × combo barrel roll plus flux, unlimited; a held gamepad button fired it every 1/120 s | Points and warps on demand |
| 5 | **Gamepad hold** | Pad buttons are levels, not presses: holding A/X re-jumped every landing and re-fired boost every step | As 1 and 4, hands-free |
| 6 | **Juke chain** | Double-tap left/right every 0.5 s: each juke gives 0.5 s of invulnerability and +9 mph | Permanent invulnerability |
| 7 | **Hop NOS** | Airtime fills the NOS tank, own hops included | Endless NOS by hopping |
| 8 | **Console editing** | `?debug` exposed the whole game state (score, HP, speed) on the real site | Any score, one line |
| 9 | **Payload edits / replays** | Replays are blocked (one submit per signed run token); edited scores are bounded only by rates, the penalty recompute and the token clock | Forged scores up to the rate caps |
| 10 | **Autopilot farming** | The co-pilot's AUTOPILOT drives the whole race | AFK runs on the global board |
| 11 | **Run-token minting** | `/api/run` had no rate limit | Unlimited tokens (no score effect alone) |
| 12 | **Per-player submit rate** | Submits were limited per address only | A phone on many networks submits faster |

Checked and fine: pickups can't double-collect (`collected` flag); a continue is once per run;
hiding the tab pauses the race and the sim never catches up more than 0.1 s a frame (no time
skips); pausing only lengthens the wall clock; loops and set pieces can't be skipped; TV-pad
taps arrive as one-per-step flags and the relay is rate-limited (#96); steering-mode switches
mid-race change nothing the score depends on.

## What
- `src/fairplay.js` (shared by the race step and the Worker, like `src/scoring.js`):
  - **Jump:** only from the ground, or within 100 ms of rolling off it (coyote time). There's a
    250 ms cooldown after landing, and a press up to 120 ms early fires the moment it ends
    (buffer), so honest timing always works and mashing adds nothing.
  - **Tricks:** 350 ms apart, at most 3 per air (barrel rolls included); the backflip's hang
    and heal happen once per air.
  - **Jukes:** 0.9 s apart, with 0.35 s of invulnerability each.
  - **NOS:** your own hops no longer fill the tank (ramps and crests still do).
  - **Counters:** the run counts sim time, jumps, airs, tricks, airtime, top speed, jukes and
    autopilot time.
- **Input:** key auto-repeat no longer triggers tricks, jumps or boost; gamepad jump and boost
  act when the button goes down, not while it's held.
- **`?debug`:** keeps the graphics overlay on the real site, but the state hook only exists on
  local and preview hosts.
- **Server (op PR):** payload v4 = v3 plus `fp`.
  - Malformed counters are rejected.
  - Counters that break the rules flag the run: it's stored and still shows on the player's
    own device, but is hidden from everyone else's boards, ranks, champions and ghosts.
  - Autopilot runs are flagged `assist` and the results screen says they aren't ranked.
  - v1–v3 keep their old rules until 2026-11-16, then they're flagged too (so a cheater can't
    just downgrade).
  - New limits: per-player submits, and `/api/run` tokens per address.

## Acceptance criteria
- Mashing H for 6 s keeps landing (no air longer than 2 s) and heals at most once per air.
- Honest play is unchanged: a press just before landing still jumps.
- Unit tests craft each cheat's counters and the server rejects or flags every one.

## Test plan
- Unit: `tests/unit/fairplay.test.js` (caps, buffer, coyote, honest vs mashed, every server
  check); `tests/unit/worker-leaderboard.test.js` / `worker-compete.test.js` (v4, flag,
  shadow boards, rate limits) in the op PR.
- e2e: `tests/e2e/fairplay.spec.js` mashes H and Space and checks landings, heals and the
  posted counters.

## Shipped
- #104 (client caps and counters) and #107 (server: payload v4, unranked runs, rate limits).

## Not caught (honest limits)
The game runs on the player's device, so someone who rewrites the game code can still forge
counters that look honest. The server bounds what that buys: score rate, distance vs top speed
and sim time, penalties recomputed, one submit per token. A full server-side replay of the sim
would close it; that's a much bigger project.
