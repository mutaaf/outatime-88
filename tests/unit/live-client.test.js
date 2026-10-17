// Live races, client side (sprint 3): remote-car smoothing, clock sync, standings, QR.
import { describe, it, expect, vi } from 'vitest';
import { createGhostTrack, createClockSync, GHOST } from '../../src/live/ghosts.js';
import { suggestInitials, fmtTime, UNITS_PER_MPH, setRoomParam } from '../../src/live/controller.js';
import { GameState } from '../../src/state.js';
import { cleanInitials } from '../../src/worker/initials.js';

describe('ghost interpolation', () => {
  it('draws a remote car between its two snapshots, ~100 ms in the past', () => {
    const g = createGhostTrack(40);
    g.push(1000, [1000, 0, 0, 80, 0]);
    g.push(1100, [2000, 500, 0, 80, 0]);
    const out = {};
    expect(g.sample(1100 + GHOST.delayMs - 50, out)).toBe(true); // render time 1050: halfway
    expect(out.z).toBeCloseTo(1500);
    expect(out.x).toBeCloseTo(0.25);
  });
  it('extrapolates briefly on its own speed when a packet is late, then holds', () => {
    const g = createGhostTrack(40);
    g.push(0, [0, 0, 0, 100, 0]);
    const out = {};
    g.sample(GHOST.delayMs + 200, out);
    expect(out.z).toBeCloseTo(100 * 40 * 0.2);
    g.sample(GHOST.delayMs + 5000, out);
    expect(out.z).toBeCloseTo(100 * 40 * GHOST.maxExtrapMs / 1000);
  });
  it('keeps a bounded buffer and survives same-timestamp packets', () => {
    const g = createGhostTrack(40);
    for (let i = 0; i < 50; i++) g.push(5, [i, 0, 0, 0, 0]);
    expect(g.size).toBe(GHOST.keep);
    expect(g.last.z).toBe(49);
  });
  it('an empty track has nothing to draw', () => {
    expect(createGhostTrack(40).sample(0, {})).toBe(false);
  });
});

describe('clock sync', () => {
  it('uses the lowest-latency ping to estimate the server offset', () => {
    const c = createClockSync();
    c.add(1000, 1200 + 5300, 1400); // slow round trip (400 ms), skewed by queuing
    c.add(2000, 2025 + 5000, 2050); // fast (50 ms): server = local + 5000
    expect(c.offset).toBeCloseTo(5000, -1);
    expect(c.rtt).toBe(50);
  });
});

describe('standings and labels', () => {
  it('suggests clean initials and keeps saved ones', () => {
    expect(suggestInitials('cld')).toBe('CLD');
    for (let i = 0; i < 30; i++) expect(cleanInitials(suggestInitials('', () => i / 30))).toBeTruthy();
  });
  it('formats race times', () => {
    expect(fmtTime(83456)).toBe('1:23.46');
    expect(fmtTime(null)).toBe('DNF');
  });
  it('live races run at one shared pace', () => {
    expect(UNITS_PER_MPH).toBeCloseTo(40, 0);
  });
});

describe('rematch invites', () => {
  it('a joined room publishes its invite link for the share card; leaving clears it', () => {
    vi.stubGlobal('location', { origin: 'https://mutaafaziz.com', pathname: '/outatime/', search: '' });
    vi.stubGlobal('history', { replaceState() {} });
    setRoomParam('ABCD');
    expect(GameState.liveInvite).toMatch(/\?room=ABCD$/);
    setRoomParam(null);
    expect(GameState.liveInvite).toBeNull();
    vi.unstubAllGlobals();
  });
});
