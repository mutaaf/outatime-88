import { describe, it, expect } from 'vitest';
import { RigidBody3D } from '../../src/physics.js';
import { MATERIALS, materialFor, impactVelocities } from '../../src/materials.js';
import { createZHash } from '../../src/broadphase.js';
import { createWorld, createPropPool, solvePair, WORLD } from '../../src/world.js';

const STEP = 1 / 120;
const body = (type, z, offset = 0, extra = {}) => {
  const m = materialFor(type);
  return new RigidBody3D({ kind: 'OBSTACLE', type, worldZ: z, offset, massKg: m.massKg, restitution: m.restitution, friction: m.friction, halfW: m.halfW, height: m.height, halfL: m.halfL, ...extra });
};
const car = (z, offset, vz) => new RigidBody3D({ kind: 'TRAFFIC', worldZ: z, offset, vz, massKg: 1420, restitution: 0.38, halfW: 0.13, height: 34, halfL: 105 });

describe('materials (ticket 0074)', () => {
  it('every obstacle and prop type has a full material', () => {
    for (const [type, m] of Object.entries(MATERIALS)) {
      for (const k of ['massKg', 'restitution', 'friction', 'halfW', 'height', 'halfL', 'damage', 'penalty']) expect(m[k], `${type}.${k}`).toBeDefined();
      expect(m.restitution).toBeGreaterThanOrEqual(0);
      expect(m.restitution).toBeLessThanOrEqual(1);
    }
    expect(materialFor('NOPE')).toBe(MATERIALS.HOLO_BARRIER);
  });

  it('a cone barely slows a car and flies off at nearly twice its speed; a barrel takes a real bite', () => {
    const v = 1700; // ~ world units/s at arcade pace
    const cone = impactVelocities(1400, v, MATERIALS.TRAFFIC_CONE.massKg, 0, 0.7);
    expect(cone.car / v).toBeGreaterThan(0.99);
    expect(cone.body / v).toBeGreaterThan(1.6);
    const barrel = impactVelocities(1400, v, MATERIALS.OIL_BARREL.massKg, 0, 0.55);
    expect(barrel.car / v).toBeLessThan(0.92);
    expect(barrel.car / v).toBeGreaterThan(0.8);
  });

  it('momentum is conserved and energy never grows in a car–prop impact', () => {
    for (const e of [0, 0.3, 0.7, 1]) {
      const r = impactVelocities(1400, 1500, 95, 100, e);
      expect(1400 * r.car + 95 * r.body).toBeCloseTo(1400 * 1500 + 95 * 100, 6);
      expect(1400 * r.car ** 2 + 95 * r.body ** 2).toBeLessThanOrEqual(1400 * 1500 ** 2 + 95 * 100 ** 2 + 1e-3);
    }
  });

  it('a static body (tree) never moves, and you bounce off it', () => {
    const tree = body('PINE_TREE_HAZARD', 1000, 0);
    expect(tree.isStatic).toBe(true);
    tree.applyImpulseAndTorque(1e6, 1e6, 1e6, 1);
    tree.stepSubPhysics(STEP, STEP);
    expect([tree.worldZ, tree.offset, tree.y]).toEqual([1000, 0, 0]);
    const r = impactVelocities(1400, 800, Infinity, 0, 0.2);
    expect(r).toEqual({ car: -160, body: 0 });
    // and a car hitting it in the world moves, the tree doesn't
    const t = car(1000 - 200, 0, 900);
    solvePair(t, tree);
    expect(tree.worldZ).toBe(1000);
    expect(t.vz).toBeLessThan(900);
  });
});

describe('sleeping props', () => {
  it('a knocked cone tumbles, lands and falls asleep; a hit wakes it', () => {
    const c = body('TRAFFIC_CONE', 0, 0);
    c.vz = 2500; c.vy = 400; c.vRot = 12; c.vx = 0.3;
    let t = 0;
    while (!c.sleeping && t < 8) { c.stepSubPhysics(STEP, STEP); t += STEP; }
    expect(c.sleeping).toBe(true);
    expect(c.y).toBe(0);
    expect(t).toBeLessThan(6);
    const z = c.worldZ;
    c.stepSubPhysics(STEP, STEP);
    expect(c.worldZ).toBe(z); // asleep: no integration
    c.applyImpulseAndTorque(0, 0, 400, 0);
    expect(c.sleeping).toBe(false);
  });
});

describe('broadphase', () => {
  it('finds exactly the pairs all-pairs finds, testing far fewer', () => {
    const bodies = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) bodies.push(body(i % 3 ? 'TRAFFIC_CONE' : 'OIL_BARREL', rnd() * 60000, (rnd() - 0.5) * 1.3));
    for (let i = 0; i < 8; i++) bodies.push(car(rnd() * 60000, (rnd() - 0.5) * 1.2, 0));
    const touching = (a, b) => Math.abs(a.worldZ - b.worldZ) < a.halfL + b.halfL && Math.abs(a.offset - b.offset) < a.halfW + b.halfW;
    const brute = new Set();
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) if (touching(bodies[i], bodies[j])) brute.add(`${i}:${j}`);
    const hash = createZHash(WORLD.cellSize);
    hash.build(bodies);
    const found = new Set();
    const tested = hash.forEachPair(bodies, (a, b) => {
      if (touching(a, b)) {
        const i = bodies.indexOf(a), j = bodies.indexOf(b);
        found.add(`${Math.min(i, j)}:${Math.max(i, j)}`);
      }
    });
    expect(found).toEqual(brute);
    expect(tested).toBeLessThan((bodies.length * (bodies.length - 1)) / 2 / 10);
  });
});

describe('prop pool', () => {
  it('never holds more than its size and never allocates new bodies', () => {
    let made = 0;
    const pool = createPropPool(6, () => { made++; return body('TRAFFIC_CONE', 0); });
    for (let i = 0; i < 20; i++) pool.spawn({ kind: 'OBSTACLE', type: 'TRAFFIC_CONE', worldZ: i * 100, halfL: 32, halfW: 0.045, height: 18, massKg: 4 });
    expect(made).toBe(6);
    expect(pool.live.length).toBe(6);
    // the furthest-behind prop was the one recycled each time
    expect(Math.min(...pool.live.map((p) => p.worldZ))).toBe(1400);
    pool.retireBehind(2000, 300);
    expect(pool.live.length).toBe(3);
  });
});

describe('world step performance (ticket 0074)', () => {
  it('steps 200 props + 10 cars at 120 Hz (2 sub-steps) well inside a frame budget', () => {
    const bodies = [];
    for (let i = 0; i < 200; i++) bodies.push(body(i % 4 ? 'TRAFFIC_CONE' : 'OIL_BARREL', 3000 + i * 160, ((i % 7) - 3) * 0.18));
    for (let i = 0; i < 10; i++) bodies.push(car(i * 3300, ((i % 4) - 1.5) * 0.3, 1800));
    // knock a third of the props into motion so the solver has real work
    for (let i = 0; i < 200; i += 3) { bodies[i].vz = 2200; bodies[i].vy = 300; bodies[i].vRot = 10; }
    const world = createWorld();
    for (let i = 0; i < 30; i++) world.step(bodies, STEP, STEP); // warm up the JIT
    const steps = 120; // one simulated second
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) world.step(bodies, STEP, STEP);
    const msPerStep = (performance.now() - t0) / steps;
    console.log(`[bench] 210 bodies: ${msPerStep.toFixed(3)} ms/step, awake ${world.stats.awake}, pairs ${world.stats.pairsTested}/step×2`);
    // A 60 fps frame runs 2 steps; keep both under ~1/8 of a 16.7 ms frame even on CI.
    expect(msPerStep).toBeLessThan(1.0);
    expect(world.stats.pairsTested).toBeLessThan((210 * 209) / 2 / 5);
  });

  it('sleeping cuts the work once props settle', () => {
    const bodies = [];
    for (let i = 0; i < 120; i++) bodies.push(body('TRAFFIC_CONE', i * 200, 0));
    const world = createWorld();
    for (let i = 0; i < 120; i++) world.step(bodies, STEP, STEP);
    expect(world.stats.awake).toBe(0);
  });
});
