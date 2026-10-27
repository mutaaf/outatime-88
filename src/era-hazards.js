// Era signature hazards (ticket 0113): each era drops one original, knockable roadside prop on
// the road, so a warp changes what you dodge, not only the palette. They ride the existing prop
// pool (src/world.js createPropPool) and the knockable-prop physics (ticket 0074), cost a cone
// penalty and never HP, and are placed around the racing line like every other hazard.
// Pure, and only the lazy race step imports it (the table stays out of the startup bundle; the
// 2D art is src/scenes/era-props.js in the lazy stage chunk).

/**
 * One hazard per era id. `rate` is the share of prop patterns that become this era's spill.
 * Body numbers match src/materials.js (kg, lane units, world Z); `penalty` is always the cone
 * table the server already recomputes (src/scoring.js), `label` is the HUD's hit line.
 */
export const ERA_HAZARDS = {
  2026: { kind: 'SIDEWALK_SIGN', rate: 0.35, label: 'SIGN HIT', massKg: 9, restitution: 0.4, friction: 2.4, halfW: 0.05, height: 22, halfL: 26 },
  1985: { kind: 'SHOPPING_CART', rate: 0.35, label: 'CART HIT', massKg: 22, restitution: 0.5, friction: 1.4, halfW: 0.055, height: 20, halfL: 40 },
  1885: { kind: 'TUMBLEWEED', rate: 0.4, label: 'TUMBLEWEED', massKg: 2, restitution: 0.6, friction: 1.2, halfW: 0.05, height: 18, halfL: 30 },
  2015: { kind: 'DRONE_WRECK', rate: 0.35, label: 'DRONE HIT', massKg: 6, restitution: 0.45, friction: 2.0, halfW: 0.05, height: 12, halfL: 30 },
  2088: { kind: 'LIGHT_PYLON', rate: 0.35, label: 'PYLON HIT', massKg: 14, restitution: 0.5, friction: 2.2, halfW: 0.04, height: 26, halfL: 24 },
  1955: { kind: 'MILK_CRATE', rate: 0.35, label: 'CRATE HIT', massKg: 11, restitution: 0.35, friction: 2.6, halfW: 0.05, height: 16, halfL: 30 },
  2061: { kind: 'ICE_SHARD', rate: 0.35, label: 'ICE HIT', massKg: 5, restitution: 0.55, friction: 0.8, halfW: 0.045, height: 20, halfL: 28 },
};

const BY_KIND = {};
for (const id in ERA_HAZARDS) BY_KIND[ERA_HAZARDS[id].kind] = ERA_HAZARDS[id];

/** The era's hazard config, or null for an era without one. */
export const eraHazard = (era) => (era && ERA_HAZARDS[era.id]) || null;
/** The config for a prop kind (its material on hit), or null if it isn't an era prop. */
export const eraHazardKind = (kind) => BY_KIND[kind] || null;

export const SPILL = {
  lead: 1800,   // the spill sits this far past its pattern: ≥ 1 s of warning at 120 mph on TURBO
  rows: [[0, 0.62], [170, 0.44], [340, 0.56]], // [dz, |offset| on the side away from the line]
};

/** Deterministic hash → [0, 1): the spill roll never touches the race RNG. */
function unit(seed, k) {
  let t = (Math.imul(seed | 0, 0x2c1b3c6d) ^ Math.imul(k | 0, 0x297a2d39)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x85ebca6b) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/**
 * The era spill for a prop pattern the planner just made (src/cleanline.js planProps), or null
 * to keep that pattern. `line` is the race's racing line, `blocked(z0, z1)` the set-piece test.
 * Same seed, same pattern, same era → same spill, so dailies stay identical for everyone.
 * `force` skips the roll (tests). Returns [{ type, z, offset }] (every item clear of the line).
 */
export function eraSpill(line, plan, hz, blocked, force = false) {
  if (!hz || !plan.items.length) return null;
  const z = plan.items[0].z + SPILL.lead;
  if (z + 600 > plan.nextZ) return null;
  if (!force && unit(line.seed, Math.floor(z / 100)) >= hz.rate) return null;
  if (blocked && blocked(z - 600, z + 1000)) return null;
  const far = line.centreAt(z) >= 0 ? -1 : 1;
  const items = [];
  for (let k = 0; k < SPILL.rows.length; k++) {
    const zz = z + SPILL.rows[k][0];
    const o = far * SPILL.rows[k][1];
    if (line.isClear(zz, o, hz.halfW, hz.halfL)) items.push({ type: hz.kind, z: zz, offset: o });
  }
  return items.length ? items : null;
}

/** Body options for an era prop: knockable, from its config (ticket 0074 materials). */
export function eraBody(opts, hz) {
  opts.massKg = hz.massKg;
  opts.restitution = hz.restitution;
  opts.friction = hz.friction;
  opts.knockable = true;
  opts.halfW = hz.halfW;
  opts.height = hz.height;
  opts.clearanceY = 0;
  opts.halfL = hz.halfL;
  return opts;
}
