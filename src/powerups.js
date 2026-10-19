// Runner power-ups (ticket 0177), Subway-Surfers style, Endless solo runs only:
//
//   MAGNET    every coin in nearby lanes flies to you for a few seconds
//   SHIELD    a bubble that eats one crash (traffic, barrier, rival or a hard wall hit): no HP
//             lost, no speed lost, no points lost; it pops on the hit or when its time runs out
//   DOUBLER   2× coin cash for a few seconds (cash only: points are untouched, so the
//             leaderboard's checks never see a difference)
//
// Each lasts longer with upgrade levels bought between runs with earned FLUX cash (in-game
// coins only: no money, no ads). Placement on the road is src/pickups.js powerupAt (seeded,
// slightly more often each Endless tier). Pure: race-step.js owns the hooks, runner-ui.js the
// shop, pickup-art.js the icons and HUD rings. Lives in the lazy race-step chunk.

export const POWER_KINDS = ['MAGNET', 'SHIELD', 'DOUBLER'];

export const POWER = {
  MAGNET: { secs: 8, perLv: 1.5, name: 'MAGNET', icon: '🧲', color: '#f43f5e' },
  SHIELD: { secs: 20, perLv: 4, name: 'SHIELD', icon: '🛡️', color: '#38bdf8' },
  DOUBLER: { secs: 10, perLv: 2, name: '2X COINS', icon: '2×', color: '#facc15' },
};

export const UPGRADE = { max: 5, cost: [600, 1000, 1600, 2400, 3400] }; // docs/BALANCE.md

export const isPower = (type) => Object.prototype.hasOwnProperty.call(POWER, type);

/** How long `kind` lasts (s) at upgrade level `lv`. */
export const powerSecs = (kind, lv) => POWER[kind].secs + POWER[kind].perLv * Math.max(0, Math.min(UPGRADE.max, lv | 0));

/** FLUX cash for the next level after `lv`, or 0 when maxed. */
export const upgradeCost = (lv) => ((lv | 0) >= UPGRADE.max ? 0 : UPGRADE.cost[Math.max(0, lv | 0)]);

/** The save's upgrade levels, repaired or created (save.endless.power). */
export function ensurePower(save) {
  const e = save.endless || (save.endless = { bestDistance: 0, bestTier: 0, runs: 0 });
  const p = e.power && typeof e.power === 'object' ? e.power : (e.power = {});
  for (const k of POWER_KINDS) {
    const v = p[k] | 0;
    p[k] = Math.max(0, Math.min(UPGRADE.max, v));
  }
  return p;
}

/** Buy the next level of `kind`. Returns { ok, cost, level } and spends save.fluxCoins. */
export function buyUpgrade(save, kind) {
  if (!isPower(kind)) return { ok: false, cost: 0, level: 0 };
  const p = ensurePower(save);
  const cost = upgradeCost(p[kind]);
  if (!cost || (save.fluxCoins | 0) < cost) return { ok: false, cost, level: p[kind] };
  save.fluxCoins -= cost;
  p[kind]++;
  return { ok: true, cost, level: p[kind] };
}

/** This run's power-up timers. `t` = seconds left, `dur` = full length (for the HUD rings). */
export function createPower() {
  return { t: { MAGNET: 0, SHIELD: 0, DOUBLER: 0 }, dur: { MAGNET: 1, SHIELD: 1, DOUBLER: 1 }, on: false, popped: 0 };
}

export function resetPower(st) {
  for (const k of POWER_KINDS) { st.t[k] = 0; st.dur[k] = 1; }
  st.on = false;
  st.popped = 0;
}

/** Picked one up: start (or refill) its timer for the upgraded length. */
export function activatePower(st, kind, lv) {
  const d = powerSecs(kind, lv);
  st.t[kind] = d;
  st.dur[kind] = d;
  st.on = true;
}

/** One sim step: count timers down. Returns the kind that just ran out (or ''). */
export function stepPower(st, dt) {
  if (!st.on) return '';
  let ended = '', any = false;
  for (const k of POWER_KINDS) {
    if (st.t[k] <= 0) continue;
    st.t[k] = Math.max(0, st.t[k] - dt);
    if (st.t[k] === 0) ended = k;
    else any = true;
  }
  st.on = any;
  return ended;
}

export const powerOn = (st, kind) => st.t[kind] > 0;

/** A crash while shielded: the shield takes it and is gone. True when it did. */
export function useShield(st) {
  if (!(st.t.SHIELD > 0)) return false;
  st.t.SHIELD = 0;
  st.popped++;
  st.on = st.t.MAGNET > 0 || st.t.DOUBLER > 0;
  return true;
}

/** Coin cash multiplier from power-ups (stacks on top of the Endless tier's coinMult). */
export const cashMult = (st) => (st.t.DOUBLER > 0 ? 2 : 1);
