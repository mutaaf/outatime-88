// What only the garage shows and does (0223: split off src/cars.js so it ships in the lazy
// garage chunk, not at startup): the five ratings, their bars with upgrades, and buying a car.
import { CAR_SPECS, STARTER_CAR, ensureGarage } from './cars.js';

export const STATS = ['speed', 'accel', 'grip', 'flux', 'armor'];
export const STAT_LABELS = {
  speed: 'TOP SPEED',
  accel: 'ACCELERATION',
  grip: 'HANDLING',
  flux: 'FLUX / BOOST',
  armor: 'DURABILITY',
};

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
