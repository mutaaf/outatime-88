import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// Ticket 0015: the 2D renderer lives in src/render/, not in main.js, so visual tickets stop
// colliding in one file. These guard the split itself; e2e render2d.spec.js guards the frame.
const src = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const main = src('main.js');
const renderFiles = readdirSync(new URL('../../src/render/', import.meta.url)).filter((f) => f.endsWith('.js'));
const lines = (s) => s.split('\n').length;

describe('2D renderer carve (0015)', () => {
  it('main.js no longer draws the frame', () => {
    for (const fn of ['renderScene', 'drawPlayerCar', 'drawCarFx', 'drawSpeedLines', 'drawWarpTunnel', 'drawSparks', 'drawPolygon', 'renderOverlayFx', 'nosFeel', 'loopNear']) {
      expect(main).not.toMatch(new RegExp(`function ${fn}\\(`));
    }
    expect(main).not.toContain('createLinearGradient');
    expect(main).not.toContain('ctx.fillRect');
  });

  it('main.js shrank by at least 900 lines (2797 before the carve)', () => {
    expect(lines(main)).toBeLessThanOrEqual(2797 - 900);
  });

  it('every render module is under 500 lines and each piece has its home', () => {
    expect(renderFiles.sort()).toEqual(['canvas.js', 'fx.js', 'player.js', 'road.js', 'scene.js', 'sprites.js']);
    for (const f of renderFiles) expect(lines(src(`render/${f}`)), f).toBeLessThanOrEqual(500);
    expect(src('render/scene.js')).toMatch(/export function renderScene\(/);
    expect(src('render/player.js')).toMatch(/export function drawPlayerCar\(/);
    expect(src('render/road.js')).toMatch(/export function drawRoad\(/);
    expect(src('render/sprites.js')).toMatch(/export function drawRoadside\(/);
    expect(src('render/fx.js')).toMatch(/export function renderOverlayFx\(/);
  });

  it('the startup renderer never pulls in three.js, the live chunk or the race step', () => {
    for (const f of renderFiles) {
      const s = src(`render/${f}`);
      expect(s, f).not.toMatch(/from ['"]three/);
      expect(s, f).not.toMatch(/from ['"]\.\.\/(live\/|render3d\/|race-step|race-flow)/);
    }
  });
});
