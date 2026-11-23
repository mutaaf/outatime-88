// FRAME RATE 30 cap (ticket 0302): the display-frame gate and the governor under a cap.
import { describe, it, expect } from 'vitest';
import { createFrameGate, fpsCapMs, fpsName, FPS_CAP_MS } from '../../src/frame-cap.js';
import { createGovernor } from '../../src/perf/governor.js';
import { createFixedStep } from '../../src/fixedstep.js';

/** Drawn frames over `seconds` of a `hz` display, through a gate built for `cap`. */
function drawnPerSecond(hz, cap, seconds = 10, start = 1234.5) {
  const gate = createFrameGate(cap);
  const frame = 1000 / hz;
  let drawn = 0;
  const n = Math.round(seconds * hz);
  for (let i = 0; i < n; i++) if (!gate(start + i * frame)) drawn++;
  return drawn / seconds;
}

describe('fps setting', () => {
  it('only "30" caps; unset, auto and junk are AUTO', () => {
    expect(fpsName('30')).toBe('30');
    expect(fpsName(30)).toBe('30');
    for (const v of [undefined, null, '', 'auto', '60', 'fast', {}, 0]) {
      expect(fpsName(v)).toBe('auto');
      expect(fpsCapMs(v)).toBe(0);
    }
    expect(fpsCapMs('30')).toBeCloseTo(33.333, 2);
  });
});

describe('createFrameGate', () => {
  it('AUTO (cap 0) never skips a frame', () => {
    const gate = createFrameGate(0);
    for (let t = 0; t < 1000; t += 16.7) expect(gate(t)).toBe(false);
    expect(drawnPerSecond(60, 0)).toBe(60);
    expect(drawnPerSecond(144, 0)).toBe(144);
  });

  it('a 60 Hz screen draws every other frame: 30 a second', () => {
    const gate = createFrameGate(FPS_CAP_MS);
    const seq = [0, 1, 2, 3, 4, 5].map((i) => gate(100 + i * (1000 / 60)));
    expect(seq).toEqual([false, true, false, true, false, true]);
    expect(drawnPerSecond(60, FPS_CAP_MS)).toBe(30);
  });

  it('90, 120 and 144 Hz screens also land near 30', () => {
    for (const hz of [90, 120, 144]) {
      const fps = drawnPerSecond(hz, FPS_CAP_MS);
      expect(fps, `${hz} Hz`).toBeGreaterThanOrEqual(28);
      expect(fps, `${hz} Hz`).toBeLessThanOrEqual(32);
    }
  });

  it('a 30 Hz screen (or a slow device) is never skipped', () => {
    expect(drawnPerSecond(30, FPS_CAP_MS)).toBe(30);
    expect(drawnPerSecond(24, FPS_CAP_MS)).toBe(24);
  });

  it('tolerates rAF jitter of a millisecond either way at 60 Hz', () => {
    const gate = createFrameGate(FPS_CAP_MS);
    let drawn = 0;
    for (let i = 0; i < 600; i++) if (!gate(i * (1000 / 60) + (i % 2 ? 1 : -1))) drawn++;
    expect(drawn).toBe(300);
  });

  it('re-anchors after a stall (hidden tab): no burst of catch-up draws', () => {
    const gate = createFrameGate(FPS_CAP_MS);
    gate(0);
    expect(gate(5000)).toBe(false); // first frame back draws
    expect(gate(5000 + 1000 / 60)).toBe(true); // and the cadence resumes, not a run of draws
    expect(gate(5000 + 2000 / 60)).toBe(false);
  });

  it('the sim takes the same 120 steps per wall-second whichever frames are drawn', () => {
    for (const cap of [0, FPS_CAP_MS]) {
      const gate = createFrameGate(cap);
      const clock = createFixedStep();
      let steps = 0, last = 0;
      for (let i = 1; i <= 600; i++) {
        const now = i * (1000 / 60);
        if (gate(now)) continue; // main's loop does nothing on a skipped frame
        steps += clock.advance((now - last) / 1000);
        last = now;
      }
      expect(steps, `cap ${cap}`).toBe(1200); // 10 s
    }
  });
});

describe('governor under the 30 cap', () => {
  const feed = (gov, ms, seconds) => {
    let changed = false;
    for (let t = 0; t < seconds * 1000; t += ms) changed = gov.sample(ms) || changed;
    return changed;
  };

  it('uncapped, steady 33 ms frames on a 60 Hz screen still step quality down (today)', () => {
    const gov = createGovernor();
    feed(gov, 1000 / 60, 2); // learns the 60 Hz refresh
    feed(gov, 1000 / 30, 4);
    expect(gov.step).toBeGreaterThan(0);
  });

  it('capped, steady 33 ms frames are on time: no step down', () => {
    const gov = createGovernor();
    gov.capMs = FPS_CAP_MS;
    feed(gov, 1000 / 60, 2);
    feed(gov, 1000 / 30, 10);
    expect(gov.step).toBe(0);
    expect(gov.shouldDemote).toBe(false);
  });

  it('capped, a device that misses the 30 (50 ms frames) still steps down', () => {
    const gov = createGovernor();
    gov.capMs = FPS_CAP_MS;
    feed(gov, 50, 4);
    expect(gov.step).toBeGreaterThan(0);
  });

  it('capped, quality climbs back once 30 holds', () => {
    const gov = createGovernor({ startStep: 2 });
    gov.capMs = FPS_CAP_MS;
    feed(gov, 1000 / 30, 20);
    expect(gov.step).toBeLessThan(2);
  });
});
