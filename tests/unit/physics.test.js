import { describe, it, expect } from 'vitest';
import { RigidBody3D } from '../../src/physics.js';

const step = (b, seconds, dt = 1 / 120) => { for (let t = 0; t < seconds; t += dt) b.stepSubPhysics(dt, dt); };

describe('RigidBody3D', () => {
  it('falls under gravity and settles on the ground', () => {
    const b = new RigidBody3D({ kind: 'OBSTACLE', y: 200 });
    b.vy = -1; // non-zero so gravity engages
    step(b, 3);
    expect(b.y).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('bounces off the side walls and stays within [-0.72, 0.72]', () => {
    const b = new RigidBody3D({ kind: 'RIVAL', offset: 0.6, vx: 5 });
    step(b, 1);
    expect(b.offset).toBeLessThanOrEqual(0.72);
    expect(b.offset).toBeGreaterThanOrEqual(-0.72);
  });

  it('lateral grip damps sideways velocity for vehicles', () => {
    const b = new RigidBody3D({ kind: 'TRAFFIC', vx: 0.5 });
    step(b, 1);
    expect(Math.abs(b.vx)).toBeLessThan(0.05);
  });

  it('heavier bodies take smaller velocity changes from the same impulse', () => {
    const light = new RigidBody3D({ massKg: 500 });
    const heavy = new RigidBody3D({ massKg: 2000 });
    light.applyImpulseAndTorque(100, 0, 0, 0);
    heavy.applyImpulseAndTorque(100, 0, 0, 0);
    expect(light.vx).toBeCloseTo(heavy.vx * 4, 10);
  });

  it('off-centre hits induce yaw spin', () => {
    const b = new RigidBody3D({});
    b.applyImpulseAndTorque(0, 0, 500, 0.5);
    expect(b.vYaw).not.toBe(0);
  });
});
