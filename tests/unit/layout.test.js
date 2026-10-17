import { describe, it, expect } from 'vitest';
import { hudMode, overlaySlots } from '../../src/layout.js';

describe('hudMode', () => {
  it('uses the compact HUD on phones in both orientations and small tablets', () => {
    for (const [w, h] of [[390, 844], [360, 640], [430, 932], [844, 390], [932, 430], [768, 1024]]) {
      expect(hudMode(w, h), `${w}x${h}`).toBe('compact');
    }
  });
  it('keeps the full HUD on desktops and large tablets', () => {
    for (const [w, h] of [[1280, 720], [1024, 768], [1920, 1080], [1366, 1024]]) {
      expect(hudMode(w, h), `${w}x${h}`).toBe('full');
    }
  });
});

describe('overlaySlots', () => {
  it('stacks messages below the HUD with the telemetry pill under them', () => {
    const s = overlaySlots(60, 700);
    expect(s.message).toBeGreaterThan(60);
    expect(s.telemetry).toBeGreaterThan(s.message);
    expect(s.fork).toBeGreaterThan(s.telemetry);
  });
  it('pulls the fork banner up when the controls are close, but never above the telemetry slot', () => {
    const s = overlaySlots(60, 200);
    expect(s.fork).toBeLessThanOrEqual(200);
    expect(s.fork).toBeGreaterThanOrEqual(s.telemetry);
  });
});
