// Live multiplayer rules (sprint 3), shared by the room Durable Object and the game client so
// both sides agree on room codes, race lengths, the CPU grid and the finish order.
// Pure: no I/O, no clocks, no Math.random — callers pass time and randomness in.
// Operator-owned (lives under src/worker/, a frozen path), because the server trusts it.

export const LIVE = {
  maxPlayers: 6,          // humans per room
  grid: 6,                // racers on the road: humans, then CPU cars fill the rest
  sendHz: 10,             // client state updates per second (incoming WS messages are billed 20:1)
  maxMsgBytes: 512,       // anything bigger is dropped
  rate: { perSec: 20, burst: 40 }, // per-socket token bucket; sustained abuse closes the socket
  countdownMs: 3600,      // host START → green light (3 · 2 · 1 · GO)
  autoStartMs: 5000,      // everyone ready → green light
  publicWaitMs: 15000,    // quick race: first joiner → green light, CPU cars fill the gaps
  finishGraceMs: 30000,   // after the first finisher the others get this long
  dropMs: 20000,          // a disconnected player keeps their seat this long between races
  idleMs: 10 * 60e3,      // a room nobody is connected to is wiped after this
  pace: 0,                // every live racer drives the same world speed (PACE_MODES index)
};

/**
 * Race lengths in race progress — the solo race's unit (GameState.distance, mph × seconds;
 * src/raceflow.js), so live races share its laps, HUD and finish line. A clean ~85 mph run
 * covers ~5,100 a minute; a solo level is ~5,200.
 */
export const LENGTHS = [
  { id: 'SPRINT', label: 'SPRINT', dist: 3600, capMs: 120000 },
  { id: 'CLASSIC', label: 'CLASSIC', dist: 5400, capMs: 170000 },
  { id: 'MARATHON', label: 'MARATHON', dist: 8400, capMs: 240000 },
  // e2e only: a few seconds long. Rooms accept it only when the Worker runs with
  // LIVE_TEST=1 (wrangler dev in CI); production rooms refuse it and the lobby never shows it.
  { id: 'TEST', label: 'TEST', dist: 220, capMs: 60000, test: true },
];
export const LEVEL_COUNT = 5; // WORLD_LEVELS.length; checked by a unit test

// Fastest anyone can legitimately gain progress: warp + booster tops out near 150 mph.
export const MAX_PROGRESS_PER_SEC = 175;

// Consonants only, so a code can never spell a word; no look-alikes in a 4-letter code.
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

export function makeCode(rand) {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return s;
}

export function cleanCode(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return CODE_RE.test(s) ? s : null;
}

export function cleanConfig(cfg, prev = { level: 0, len: 0 }, allowTest = false) {
  const out = { ...prev };
  if (cfg && Number.isInteger(cfg.level) && cfg.level >= 0 && cfg.level < LEVEL_COUNT) out.level = cfg.level;
  if (cfg && Number.isInteger(cfg.len) && cfg.len >= 0 && cfg.len < LENGTHS.length && (allowTest || !LENGTHS[cfg.len].test)) out.len = cfg.len;
  return out;
}

// ---- CPU racers: deterministic from the race seed, so every screen draws them identically
// and the server can rank them without simulating anything.

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CPU_NAMES = ['DEZ', 'KAI', 'VEX', 'ROX', 'JET', 'NIX', 'ZIP', 'MOX'];

/** CPU slot k (0-based among CPUs) → its driving profile. Speeds bracket a decent human. */
export function cpuProfile(seed, k) {
  const r = mulberry((seed ^ Math.imul(k + 1, 0x9E3779B1)) >>> 0);
  r();
  return {
    // Cruise pace, mph: ~64–91 across the grid. Measured on production 2026-10-17: gas-only
    // bots averaged ~55 mph and the old 72–95 field swept the podium; a kid driving cleanly
    // (~75–85) should be fighting for the middle and the top.
    v: 64 + 5.5 * k + r() * 5,
    tau: 2.2 + r() * 1.6,            // seconds to get up to speed
    amp: 55 + r() * 65,              // surge size in progress (so overtakes happen)
    w: 0.14 + r() * 0.12,            // surge rate, rad/s
    ph: r() * Math.PI * 2,
    lane: (r() - 0.5) * 0.9,
    lw: 0.25 + r() * 0.3,
    name: CPU_NAMES[(k + Math.floor(r() * CPU_NAMES.length)) % CPU_NAMES.length],
    car: 1 + Math.floor(r() * 11),
  };
}

/** Progress t seconds after the green light. Monotonic (surge slope < cruise). */
export function cpuZ(p, t) {
  if (t <= 0) return 0;
  const base = p.v * (t - p.tau * (1 - Math.exp(-t / p.tau)));
  const surge = p.amp * (Math.sin(p.w * t + p.ph) - Math.sin(p.ph)) * (1 - Math.exp(-t / p.tau));
  return Math.max(0, base + surge * 0.5);
}

export function cpuX(p, t) {
  return Math.max(-0.7, Math.min(0.7, p.lane + 0.25 * Math.sin(p.lw * t + p.ph)));
}

/** Milliseconds for a CPU to reach `dist` (bisection on the monotonic cpuZ). */
export function cpuFinishMs(p, dist) {
  let lo = 0, hi = 1;
  while (cpuZ(p, hi) < dist) hi *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (cpuZ(p, mid) < dist) lo = mid; else hi = mid;
  }
  return Math.round(hi * 1000);
}

/**
 * Final standings. entrants: [{ id, name, car, cpu, ms (finish time or null), z }]
 * Finishers by time, then everyone else by distance. Ties keep entry order.
 */
export function rankResults(entrants) {
  const rows = entrants.map((e, i) => ({ ...e, i }));
  rows.sort((a, b) => {
    const af = a.ms != null, bf = b.ms != null;
    if (af && bf) return a.ms - b.ms || a.i - b.i;
    if (af !== bf) return af ? -1 : 1;
    return (b.z || 0) - (a.z || 0) || a.i - b.i;
  });
  return rows.map(({ i, ...e }, n) => ({ ...e, place: n + 1 }));
}

/** Validates a client state frame [progress, x*1000, y, mph, flags]. Clean copy or null. */
export function cleanFrame(d, elapsedMs) {
  if (!Array.isArray(d) || d.length !== 5) return null;
  for (let i = 0; i < 5; i++) if (!Number.isFinite(d[i])) return null;
  const maxProgress = (Math.max(0, elapsedMs) / 1000) * MAX_PROGRESS_PER_SEC + 150;
  return [
    Math.round(Math.max(0, Math.min(maxProgress, d[0]))),
    Math.round(Math.max(-1500, Math.min(1500, d[1]))),
    Math.round(Math.max(0, Math.min(2000, d[2]))),
    Math.round(Math.max(0, Math.min(400, d[3]))),
    d[4] & 0xff,
  ];
}

/** Server-side bound on a reported finish time: never faster than physics, never far from the
 *  server's own clock. Returns the accepted time in ms. */
export function acceptFinish(clientMs, serverElapsedMs, dist) {
  const floor = (dist / MAX_PROGRESS_PER_SEC) * 1000;
  let ms = Number.isFinite(clientMs) ? Math.round(clientMs) : serverElapsedMs;
  if (ms < serverElapsedMs - 4000 || ms > serverElapsedMs + 1000) ms = serverElapsedMs;
  return Math.max(Math.ceil(floor), ms);
}
