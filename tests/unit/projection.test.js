import { describe, it, expect } from 'vitest';
import { projectPoint } from '../../src/projection.js';
import { ROAD_CFG } from '../../src/data.js';

const point = (x, y, z) => ({ world: { x, y, z }, camera: {}, screen: {} });

describe('projectPoint', () => {
  it('projects a point straight ahead to the screen centre', () => {
    const p = point(0, 0, 1000);
    projectPoint(p, 0, 0, 0, 0.84, 1280, 720);
    expect(p.screen.x).toBe(640);
    expect(p.screen.y).toBe(360);
  });

  it('scales inversely with distance and widens the road when closer', () => {
    const near = point(0, 0, 500);
    const far = point(0, 0, 2000);
    projectPoint(near, 0, 0, 0, 0.84, 1280, 720);
    projectPoint(far, 0, 0, 0, 0.84, 1280, 720);
    expect(near.screen.scale).toBeCloseTo(far.screen.scale * 4, 10);
    expect(near.screen.w).toBeGreaterThan(far.screen.w);
    expect(near.screen.w).toBe(Math.round(near.screen.scale * ROAD_CFG.roadWidth * 640));
  });

  it('clamps points behind the camera instead of dividing by zero', () => {
    const p = point(0, 0, -50);
    projectPoint(p, 0, 0, 0, 0.84, 1280, 720);
    expect(p.camera.z).toBe(1);
    expect(Number.isFinite(p.screen.x)).toBe(true);
  });

  it('puts points above the camera higher on screen', () => {
    const p = point(0, 100, 1000);
    projectPoint(p, 0, 0, 0, 0.84, 1280, 720);
    expect(p.screen.y).toBeLessThan(360);
  });
});
