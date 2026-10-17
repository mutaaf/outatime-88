// Car roster specs, unlocks and the sim parameters they drive (ticket 0071).
// Pure rules over plain data and the save object, so balance and unlocks are unit-tested;
// main.js asks `carParams()` for the numbers the physics uses and persists the save.
//
// Balance rule: every car spends the same 30-point budget across five ratings (1..10), so
// no car is better at everything; each one trades something away. Upgrades are global and
// add the same amount to every car, so they never change the balance between cars.

export const STATS = ['speed', 'accel', 'grip', 'flux', 'armor'];
export const STAT_LABELS = {
  speed: 'TOP SPEED',
  accel: 'ACCELERATION',
  grip: 'HANDLING',
  flux: 'FLUX / BOOST',
  armor: 'DURABILITY',
};
export const STAT_BUDGET = 30;

// Unlock types: starter · coins (buy with ⚡ once listed) · medal (level id + medal) ·
// wins (1st-place finishes) · takedowns (career total) · streak (daily challenge days in
// a row) · rival (rivals beaten: finishing 1st ahead of the crew, or a leaderboard rival).
export const CAR_SPECS = {
  FLUX_COUPE_88: { cls: 'ALL-ROUNDER', stats: { speed: 6, accel: 6, grip: 6, flux: 8, armor: 4 }, unlock: { type: 'starter' } },
  PASS_RUNNER_86: { cls: 'DRIFTER', stats: { speed: 5, accel: 7, grip: 9, flux: 5, armor: 4 }, unlock: { type: 'starter' } },
  BULLDOG_VAN: { cls: 'TANK', stats: { speed: 4, accel: 4, grip: 4, flux: 8, armor: 10 }, unlock: { type: 'coins', cost: 500 } },
  IRON_SAINT_BRAWLER: { cls: 'BRAWLER', stats: { speed: 7, accel: 5, grip: 4, flux: 5, armor: 9 }, unlock: { type: 'takedowns', count: 15 } },
  BLUE_KESTREL: { cls: 'GRIP TUNER', stats: { speed: 7, accel: 7, grip: 7, flux: 5, armor: 4 }, unlock: { type: 'medal', level: 'LVL1_CLOCK_HOLLOW', medal: 'silver' } },
  NIGHT_SENTINEL: { cls: 'JUMPER', stats: { speed: 6, accel: 6, grip: 6, flux: 7, armor: 5 }, unlock: { type: 'coins', cost: 900 } },
  DUST_PURSUIT_V8: { cls: 'RAMMER', stats: { speed: 6, accel: 5, grip: 4, flux: 6, armor: 9 }, unlock: { type: 'streak', days: 3 } },
  GO_ROCKET_5: { cls: 'LAUNCHER', stats: { speed: 8, accel: 8, grip: 5, flux: 6, armor: 3 }, unlock: { type: 'wins', count: 3 } },
  TWIN_TURBINE: { cls: 'DRAG KING', stats: { speed: 9, accel: 6, grip: 5, flux: 7, armor: 3 }, unlock: { type: 'rival', count: 5 } },
  GRID_CYCLE: { cls: 'GLASS CANNON', stats: { speed: 9, accel: 8, grip: 6, flux: 5, armor: 2 }, unlock: { type: 'coins', cost: 1600 } },
  ARC_ROADSTER_88: { cls: 'SELF-HEALER', stats: { speed: 7, accel: 6, grip: 6, flux: 7, armor: 4 }, unlock: { type: 'medal', level: 'LVL4_MULHOLLAND_2088', medal: 'gold' } },
};

export const STARTER_CAR = 'FLUX_COUPE_88';

const MEDAL_RANK = { bronze: 0, silver: 1, gold: 2 };
const LEVEL_NAMES = {
  LVL1_CLOCK_HOLLOW: 'CLOCK HOLLOW',
  LVL2_RED_ROCK: 'RED ROCK',
  LVL3_TOKYO_2015: 'NEO-2015 SKYWAY',
  LVL4_MULHOLLAND_2088: 'MULHOLLAND 2088',
  LVL5_INFINITE_HW: 'ORANGE TRACK',
};
const MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇' };

/**
 * The numbers the physics uses for a car. Neutral (rating 5) is today's baseline, so a
 * rating of 5 changes nothing; each point away from 5 moves the parameter a few percent.
 */
export function carParams(car) {
  const s = (CAR_SPECS[car && car.id] || CAR_SPECS[STARTER_CAR]).stats;
  return {
    topMphBonus: 6 + (s.speed - 5) * 2.4,      // mph over the 92 base (top) / 128 (warp)
    accelMult: 0.8 + s.accel * 0.04,           // launch and 0-88 rate
    gripMult: 0.85 + s.grip * 0.03,            // steering response; resists curve pull
    slipMult: 1.25 - s.grip * 0.05,            // low grip = looser rear, wider drift angle
    fluxMult: 0.8 + s.flux * 0.04,             // passive flux charge and warp length
    maxHp: 80 + s.armor * 7,
    massKg: (car && car.massKg) || 1300,       // real mass: how hard you shove and get shoved
    damageMult: 1.25 - s.armor * 0.05,         // durability: how much a hit costs in HP
  };
}

/** Ratings shown in the garage: base + global upgrades, each upgrade worth half a point. */
export function displayStats(carId, upgrades = {}) {
  const s = (CAR_SPECS[carId] || CAR_SPECS[STARTER_CAR]).stats;
  const up = (k) => Math.max(0, ((upgrades[k] || 1) - 1) * 0.5);
  return {
    speed: Math.min(10, s.speed + up('engine')),
    accel: Math.min(10, s.accel + up('engine') * 0.5),
    grip: Math.min(10, s.grip + up('tires')),
    flux: Math.min(10, s.flux + up('flux')),
    armor: Math.min(10, s.armor + up('hover') * 0.5),
  };
}

// --- Save shape (invariant 6: new fields only, defaults merged by SaveStore.load) ---

export function garageDefaults() {
  return {
    owned: ['FLUX_COUPE_88', 'PASS_RUNNER_86'],
    selected: STARTER_CAR,
    paint: {},          // carId → livery id ('' = factory colours)
    revealed: [],       // unlocks already celebrated
  };
}

export function careerDefaults() {
  return { races: 0, wins: 0, takedowns: 0, warps: 0, rivalsBeaten: 0, dailyStreak: 0, lastDailyDay: '' };
}

/** Fills in garage/career fields on any save (old saves predate them). Mutates and returns. */
export function ensureGarage(save) {
  const g = Object.assign(garageDefaults(), save.garage || {});
  g.owned = Array.from(new Set([...(g.owned || []), 'FLUX_COUPE_88', 'PASS_RUNNER_86'])).filter((id) => CAR_SPECS[id]);
  if (!CAR_SPECS[g.selected] || !g.owned.includes(g.selected)) g.selected = STARTER_CAR;
  g.paint = g.paint && typeof g.paint === 'object' ? g.paint : {};
  g.revealed = Array.isArray(g.revealed) ? g.revealed : [];
  save.garage = g;
  save.career = Object.assign(careerDefaults(), save.career || {});
  return save;
}

export const isOwned = (save, id) => ensureGarage(save).garage.owned.includes(id);

/** Progress toward a car's unlock: { done, have, need, text } (text is the how-to line). */
export function unlockProgress(save, id) {
  const spec = CAR_SPECS[id];
  if (!spec) return { done: false, have: 0, need: 1, text: '' };
  ensureGarage(save);
  const u = spec.unlock;
  const c = save.career;
  switch (u.type) {
    case 'starter':
      return { done: true, have: 1, need: 1, text: 'STARTER CAR' };
    case 'coins': {
      const have = Math.min(u.cost, save.fluxCoins || 0);
      return { done: false, have, need: u.cost, text: `BUY FOR ⚡ ${u.cost.toLocaleString()}`, buyable: (save.fluxCoins || 0) >= u.cost };
    }
    case 'medal': {
      const got = (save.progress || {})[u.level];
      const done = Boolean(got && got.medal && MEDAL_RANK[got.medal] >= MEDAL_RANK[u.medal]);
      return { done, have: done ? 1 : 0, need: 1, text: `EARN ${MEDAL_ICON[u.medal]} ${u.medal.toUpperCase()} ON ${LEVEL_NAMES[u.level] || u.level}` };
    }
    case 'wins':
      return { done: c.wins >= u.count, have: Math.min(u.count, c.wins), need: u.count, text: `FINISH 1ST ${u.count} TIMES` };
    case 'takedowns':
      return { done: c.takedowns >= u.count, have: Math.min(u.count, c.takedowns), need: u.count, text: `LAND ${u.count} TAKEDOWNS` };
    case 'streak':
      return { done: c.dailyStreak >= u.days, have: Math.min(u.days, c.dailyStreak), need: u.days, text: `PLAY THE DAILY ${u.days} DAYS IN A ROW` };
    case 'rival':
      return { done: c.rivalsBeaten >= u.count, have: Math.min(u.count, c.rivalsBeaten), need: u.count, text: `BEAT ${u.count} RIVALS` };
    default:
      return { done: false, have: 0, need: 1, text: '' };
  }
}

/** Grants every milestone car whose goal is met. Returns the ids that just unlocked. */
export function grantEarnedCars(save) {
  ensureGarage(save);
  const fresh = [];
  for (const id of Object.keys(CAR_SPECS)) {
    if (save.garage.owned.includes(id) || CAR_SPECS[id].unlock.type === 'coins') continue;
    if (unlockProgress(save, id).done) {
      save.garage.owned.push(id);
      fresh.push(id);
    }
  }
  return fresh;
}

/** Buys a coin car. Returns true if bought (and spends the coins). */
export function buyCar(save, id) {
  ensureGarage(save);
  const spec = CAR_SPECS[id];
  if (!spec || spec.unlock.type !== 'coins' || save.garage.owned.includes(id)) return false;
  if ((save.fluxCoins || 0) < spec.unlock.cost) return false;
  save.fluxCoins -= spec.unlock.cost;
  save.garage.owned.push(id);
  return true;
}

/**
 * Folds one finished race into the career counters, then grants any car it earned.
 * run: { position, takedowns, warps, daily (bool), day ('YYYY-MM-DD'), rivalsBeaten }
 */
export function recordRace(save, run) {
  ensureGarage(save);
  const c = save.career;
  c.races += 1;
  if (run.position === 1) c.wins += 1;
  c.takedowns += Math.max(0, run.takedowns | 0);
  c.warps += Math.max(0, run.warps | 0);
  c.rivalsBeaten += Math.max(0, run.rivalsBeaten | 0);
  if (run.daily && run.day && run.day !== c.lastDailyDay) {
    c.dailyStreak = c.lastDailyDay && dayDiff(c.lastDailyDay, run.day) === 1 ? c.dailyStreak + 1 : 1;
    c.lastDailyDay = run.day;
  }
  return grantEarnedCars(save);
}

/** For a leaderboard/rival system: count one beaten rival and grant what it earned. */
export function noteRivalBeaten(save, n = 1) {
  ensureGarage(save);
  save.career.rivalsBeaten += Math.max(0, n | 0);
  return grantEarnedCars(save);
}

function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}
