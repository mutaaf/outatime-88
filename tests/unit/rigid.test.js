// Rigid-body world v2 (ticket 0176): oriented boxes, impulses at the contact point, friction,
// drivers that lose the car and catch it, deterministic replays.
import { describe, it, expect } from 'vitest';
import { RigidBody3D } from '../../src/physics.js';
import { materialFor } from '../../src/materials.js';
import { RIGID, massProps, collide, resolve, contactAlong, applyImpulseAt, wallImpulse, integrate, createRigidWorld, worldHash } from '../../src/rigid.js';

const STEP = 1 / 120;
const LAT = RIGID.LAT;
// Bodies sit 10,000 down the road (worldZ 0 reads as 'unset' to RigidBody3D).
const Z0 = 10000;
const sedan = (z, offset, vz = 0, extra = {}) => new RigidBody3D({ kind: 'TRAFFIC', style: 'SEDAN', worldZ: Z0 + z, offset, vz, massKg: 1420, restitution: 0.38, halfW: 0.13, height: 34, halfL: 105, ...extra });
const semi = (z, offset, vz = 0) => new RigidBody3D({ kind: 'TRAFFIC', style: 'SEMI_TRUCK', worldZ: Z0 + z, offset, vz, massKg: 5800, restitution: 0.38, halfW: 0.16, height: 54, halfL: 160 });
const prop = (type, z, offset = 0) => {
  const m = materialFor(type);
  return new RigidBody3D({ kind: 'OBSTACLE', type, worldZ: Z0 + z, offset, massKg: m.massKg, restitution: m.restitution, friction: m.friction, halfW: m.halfW, height: m.height, halfL: m.halfL, knockable: m.knockable });
};
const momentum = (bs) => bs.reduce((p, b) => ({ x: p.x + b.massKg * b.vx * LAT, z: p.z + b.massKg * b.vz }), { x: 0, z: 0 });
const energy = (bs) => bs.reduce((e, b) => { massProps(b); return e + 0.5 * b.massKg * ((b.vx * LAT) ** 2 + b.vz ** 2) + 0.5 * (b.vYaw ** 2) / b.invI; }, 0);
const run = (world, bodies, seconds) => { for (let t = 0; t < seconds; t += STEP) world.step(bodies, STEP, STEP); };

describe('mass properties', () => {
  it('yaw inertia comes from the footprint: a semi is far harder to spin than a sedan', () => {
    const a = massProps(sedan(0, 0)), b = massProps(semi(0, 0));
    const w = 2 * 0.13 * LAT, l = 210;
    expect(1 / a.invI).toBeCloseTo((1420 * (w * w + l * l) * RIGID.yawInertia) / 12, 0);
    expect(1 / b.invI).toBeGreaterThan(8 / a.invI);
    expect(a.comY).toBeGreaterThan(0);
    expect(a.comY).toBeLessThan(a.height * 0.6);
  });
});

describe('contacts', () => {
  it('finds overlap between oriented boxes and none when apart or one flies over', () => {
    const a = sedan(0, 0), b = sedan(200, 0);
    const c = collide(a, b);
    expect(c).not.toBeNull();
    expect(c.nz).toBeCloseTo(1, 6);
    expect(c.depth).toBeCloseTo(10, 6);
    expect(collide(a, sedan(400, 0))).toBeNull();
    const high = sedan(200, 0); high.y = 60;
    expect(collide(a, high)).toBeNull();
    // A car spun 90° is long across the road: it reaches a car beside it it wouldn't straight.
    const spun = sedan(0, 0.42); spun.yaw = Math.PI / 2;
    expect(collide(sedan(0, 0), sedan(0, 0.42))).toBeNull();
    expect(collide(sedan(0, 0), spun)).not.toBeNull();
  });

  it('a rear-ender conserves momentum and never makes energy', () => {
    for (const e of [0, 0.38, 0.8]) {
      const a = sedan(0, 0, 3000), b = sedan(205, 0.03, 1000);
      const p0 = momentum([a, b]), e0 = energy([a, b]);
      resolve(a, b, collide(a, b), e);
      const p1 = momentum([a, b]);
      expect(p1.z).toBeCloseTo(p0.z, 3);
      expect(p1.x).toBeCloseTo(p0.x, 3);
      expect(energy([a, b])).toBeLessThanOrEqual(e0 + 1e-6);
      expect(b.vz).toBeGreaterThan(1000);
      expect(a.vz).toBeLessThan(3000);
    }
  });

  it('a heavy semi shoves a sedan aside and barely notices', () => {
    const t = semi(0, 0), c = sedan(0, 0.27);
    t.vx = 0.6; // the semi drifts into the sedan's lane
    resolve(t, c, collide(t, c), 0.3);
    expect(c.vx).toBeGreaterThan(0.6);
    expect(t.vx).toBeGreaterThan(0.4);
    expect(Math.abs(c.vx * 1420)).toBeCloseTo(Math.abs((0.6 - t.vx) * 5800), 0);
  });

  it('a glancing hit on a rear corner spins the car; a square hit does not', () => {
    const square = sedan(205, 0, 1000);
    resolve(sedan(0, 0, 3000), square, contactAlong(sedan(0, 0, 3000), square, 0, 1), 0.4);
    expect(Math.abs(square.vYaw)).toBeLessThan(1e-6);
    const pit = sedan(205, 0.2, 1000);
    const me = sedan(0, 0, 3000);
    resolve(me, pit, contactAlong(me, pit, 0, 1), 0.4);
    // Hit on its left rear: the tail is shoved forward on the left, so its nose swings right;
    // your right front is pushed back, so your nose swings right too.
    expect(pit.vYaw).toBeGreaterThan(0.3);
    expect(me.vYaw).toBeGreaterThan(0.3);
    expect(pit.vYaw).toBeLessThan(RIGID.maxSpin);
  });

  it('friction at the contact: a faster car scraping a slower one drags them toward each other', () => {
    const a = sedan(0, 0, 4000), b = sedan(0, 0.25, 2000);
    a.vx = 0.5;
    resolve(a, b, collide(a, b), 0.2);
    expect(a.vz).toBeLessThan(4000);
    expect(b.vz).toBeGreaterThan(2000);
  });
});

describe('walls', () => {
  it('a car hitting the wall at an angle slides along it, not stops dead, and loses some speed', () => {
    const b = sedan(0, 0.7, 6000);
    b.vx = 1.2;
    b.yaw = 0.25;
    b.stun = 1; // no driver: just the car against the wall
    wallImpulse(b);
    expect(b.vx).toBeLessThan(1.2);           // the corner hit took its sideways speed
    expect(b.vYaw).toBeLessThan(0);            // and swung the nose away from the wall
    expect(b.offset).toBeLessThan(0.7);
    for (let t = 0; t < 0.5; t += STEP) integrate(b, STEP, STEP);
    expect(b.vx).toBeLessThanOrEqual(0.05);    // not into the wall any more
    expect(b.offset).toBeLessThan(RIGID.wallX);
    expect(b.vz).toBeGreaterThan(4000);        // still sliding along
    expect(b.vz).toBeLessThan(6000);           // but the scrape cost speed
  });
});

describe('drivers and tyres', () => {
  it('a big hit takes the car out of its driver hands; the skid stops and the driver straightens up', () => {
    const b = sedan(0, 0, 5000, { driveAccel: 900 });
    b.driveVz = 5000;
    applyImpulseAt(b, 1420 * LAT * 3, 0, 0, b.worldZ - 100);
    expect(b.stun).toBeGreaterThan(0.3);
    expect(Math.abs(b.vYaw)).toBeGreaterThan(0.5);
    for (let t = 0; t < 4; t += STEP) integrate(b, STEP, STEP);
    expect(b.stun).toBe(0);
    expect(Math.abs(b.vx)).toBeLessThan(0.1);
    expect(Math.abs(b.yaw)).toBeLessThan(0.2);
    expect(b.vz).toBeGreaterThan(3000); // driving again
  });

  it('a car in its driver hands keeps its lane-change speed and points where it goes', () => {
    const b = sedan(0, 0, 8000);
    b.driveVz = 8000;
    b.vx = 0.4;
    for (let t = 0; t < 0.15; t += STEP) integrate(b, STEP, STEP);
    expect(b.vx).toBeGreaterThan(0.1);
    expect(b.yaw).toBeGreaterThan(0);
  });
});

describe('props and wrecks', () => {
  it('a knocked cone tumbles, lands, slides to a stop and sleeps', () => {
    const c = prop('TRAFFIC_CONE', 0, 0);
    applyImpulseAt(c, 4 * LAT * 0.4, 4 * 9000, 10, -c.halfL, 4 * 500);
    c.vRot = 14;
    const w = createRigidWorld();
    let flew = false;
    for (let t = 0; t < 8 && !c.sleeping; t += STEP) { w.step([c], STEP, STEP); if (c.y > 5) flew = true; }
    expect(flew).toBe(true);
    expect(c.sleeping).toBe(true);
    expect(c.worldZ).toBeGreaterThan(Z0 + 500);
  });

  it('a launched wreck tumbles and settles back on its wheels', () => {
    const b = sedan(0, 0, 6000);
    b.takenDown = true;
    applyImpulseAt(b, 0, 0, 0, 0, 1420 * 520);
    b.vRot = 9;
    const w = createRigidWorld();
    let maxRot = 0;
    for (let t = 0; t < 6; t += STEP) { w.step([b], STEP, STEP); maxRot = Math.max(maxRot, Math.abs(b.rot)); }
    expect(maxRot).toBeGreaterThan(1.5);
    const rest = Math.abs(b.rot % (Math.PI * 2));
    expect(Math.min(rest, Math.PI * 2 - rest)).toBeLessThan(0.15);
    expect(b.y).toBe(0);
    expect(b.vz).toBeLessThan(6000); // it scrubbed off speed
  });

  it('a static tree never moves, whatever hits it', () => {
    const tree = prop('PINE_TREE_HAZARD', 200, 0);
    const car = sedan(0, 0, 3000);
    resolve(car, tree, collide(car, tree), 0.3);
    expect(tree.worldZ).toBe(Z0 + 200);
    expect(tree.vz).toBe(0);
    expect(car.vz).toBeLessThan(0);
  });
});

describe('determinism', () => {
  const scene = () => [
    sedan(0, -0.3, 6000), sedan(500, -0.28, 3000), semi(900, 0.3, 2500), sedan(1100, 0.32, 4000),
    prop('TRAFFIC_CONE', 1500, 0), prop('OIL_BARREL', 1600, 0.05), prop('HOLO_BARRIER', 2400, -0.3), prop('PINE_TREE_HAZARD', 3000, 0.6),
  ].map((b) => { if (b.kind === 'TRAFFIC') { b.driveVz = b.vz; b.driveAccel = 900; } return b; });

  it('the same inputs replay to the same state hash, every time', () => {
    const hashes = [];
    for (let k = 0; k < 3; k++) {
      const bodies = scene();
      const w = createRigidWorld();
      bodies[0].vx = 0.5; // swerve into the pack
      run(w, bodies, 3);
      hashes.push(worldHash(bodies));
      expect(w.stats.bodies).toBe(bodies.length);
    }
    expect(new Set(hashes).size).toBe(1);
  });


});
