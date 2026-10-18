// Pickups: typed definitions, a deterministic rhythm on the clean line that never stacks two
// pickups or puts one inside a hazard, pooled with the track ring, magnet and reach math, and
// a bounded crisp-icon cache.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PICKUPS, PICKUP, kindAt, pickupOffset, pickupReach, magnetPull, isPickup } from '../../src/pickups.js';
import { track, RING, buildInitialTrack, generateNextTrackBiome, setTrackSeed, setTrackLine } from '../../src/track.js';
import { createLine, createHazardPlanner } from '../../src/cleanline.js';
import { materialFor } from '../../src/materials.js';
import { FLUX } from '../../src/flux.js';
import { NOS } from '../../src/nos.js';
import { GameState } from '../../src/state.js';
import { ROAD_CFG } from '../../src/data.js';

const L = ROAD_CFG.segLength;

function liveItems() {
  const out = [];
  for (let i = track.start; i < track.end; i++) {
    const s = track.seg(i);
    for (const it of s.items) if (isPickup(it.type)) out.push({ i, z: i * L, offset: it.offset, type: it.type });
  }
  return out;
}

beforeEach(() => { GameState.levelIndex = 0; setTrackSeed(0); setTrackLine(createLine(7)); });

describe('pickup definitions', () => {
  it('every kind has a valid effect, reach and shape-coded art', async () => {
    const shapes = new Set();
    for (const [k, d] of Object.entries(PICKUPS)) {
      expect(d.reach, k).toBeGreaterThan(0.3);
      if (d.flux) expect(FLUX.gains[d.flux], k).toBeGreaterThan(0);
      if (d.nos) expect(NOS.refill[d.nos], k).toBeGreaterThan(0);
      expect(d.pts > 0 || d.nos || d.heal, k).toBeTruthy();
    }
    const { ART } = await import('../../src/pickup-art.js');
    for (const k of Object.keys(PICKUPS)) shapes.add(ART[k].shape);
    expect(shapes.size).toBe(Object.keys(PICKUPS).length); // no two kinds share a silhouette
  });

  it('keeps the old point values (medals and the server rate checks still hold)', () => {
    expect(PICKUPS.HW_COIN.pts).toBe(300);
    expect(PICKUPS.PLUTONIUM.pts).toBe(500);
    expect(PICKUPS.REPAIR_WRENCH.pts).toBe(400);
  });
});

describe('rhythm', () => {
  it('places every kind, never two within the gap, and is a pure function of the index', () => {
    const seen = new Set();
    let last = -Infinity;
    for (let i = 0; i < 6000; i++) {
      const k = kindAt(i);
      expect(kindAt(i)).toBe(k);
      if (!k) continue;
      seen.add(k);
      expect(i - last, `segment ${i}`).toBeGreaterThan(PICKUP.gap);
      last = i;
    }
    expect([...seen].sort()).toEqual(Object.keys(PICKUPS).sort());
  });

  it('pays about what the old layout did per kilometre (±15%)', () => {
    const oldPts = (i) => (i % 18 === 0 ? (i % 12 === 0 ? 500 : 300) : 0) + (i > 30 && i % 38 === 0 ? 400 : 0);
    let a = 0, b = 0;
    for (let i = 12; i < 7200; i++) { a += oldPts(i); const k = kindAt(i); if (k) b += PICKUPS[k].pts; }
    expect(b / a).toBeGreaterThan(0.85);
    expect(b / a).toBeLessThan(1.15);
  });

  it('hugs the clean line and leans toward the apex', () => {
    const line = createLine(3);
    for (let z = 0; z < 400000; z += 777) {
      for (const curve of [-3, -1, 0, 1, 3]) {
        const o = pickupOffset(line, z, curve);
        expect(Math.abs(o - line.centreAt(z))).toBeLessThanOrEqual(PICKUP.LINE_HUG + 1e-9);
        if (curve) expect(Math.sign(o - line.centreAt(z))).toBe(Math.sign(curve));
      }
    }
  });
});

describe('placement on the endless track', () => {
  it('is deterministic per seed and line', () => {
    buildInitialTrack();
    for (let n = 0; n < 30; n++) generateNextTrackBiome();
    const a = JSON.stringify(liveItems());
    setTrackLine(createLine(7));
    buildInitialTrack();
    for (let n = 0; n < 30; n++) generateNextTrackBiome();
    expect(JSON.stringify(liveItems())).toBe(a);
  });

  it('never puts a pickup inside a hazard the planner places', () => {
    const line = createLine(11);
    setTrackLine(line);
    buildInitialTrack();
    for (let n = 0; n < 40; n++) generateNextTrackBiome();
    const items = liveItems();
    expect(items.length).toBeGreaterThan(50);
    let r = 1;
    const planner = createHazardPlanner({ line, rand: () => ((r = (r * 16807) % 2147483647) / 2147483647), level: 2 });
    const hazards = [];
    let z = 3000;
    for (let i = 0; i < 300 && z < track.end * L; i++) {
      const h = planner.placeObstacle(i, z, 3);
      if (h) { hazards.push(h); z = h.z + planner.obstacleSpacing(h.z, 3); } else z += 5000;
    }
    for (let pz = 3000; pz < track.end * L; ) { const p = planner.planProps(pz, 3); hazards.push(...p.items); pz = p.nextZ; }
    const ICON_HALF = 0.95 * 0.24 / 2; // the 2D icon's half-width in lane units
    for (const h of hazards) {
      const m = materialFor(h.type);
      for (const p of items) {
        if (Math.abs(p.z - h.z) > m.halfL + L) continue;
        expect(Math.abs(p.offset - h.offset), `${p.type} at ${p.z} vs ${h.type}`).toBeGreaterThan(m.halfW + ICON_HALF);
      }
    }
  });

  it('reuses the ring’s pooled item objects over a long run', () => {
    buildInitialTrack();
    let n = 0;
    while (track.end < RING * 20) { generateNextTrackBiome(); n++; }
    let maxPool = 0;
    for (const s of track.ring) maxPool = Math.max(maxPool, s.itemPool.length);
    expect(maxPool).toBeLessThan(8);
    expect(track.allocated).toBeLessThanOrEqual(RING);
    expect(n).toBeGreaterThan(50);
  });

  it('keeps loops clear (set pieces other than booster gates carry none)', () => {
    buildInitialTrack();
    for (let n = 0; n < 40; n++) generateNextTrackBiome();
    for (let i = track.start; i < track.end; i++) {
      const s = track.seg(i);
      if (s.feature && s.feature.kind !== 'BOOSTER') expect(s.items.some((it) => isPickup(it.type))).toBe(false);
    }
  });
});

describe('reach and magnet', () => {
  it('reach grows with speed and touch; the magnet power-up widens it', () => {
    const c = PICKUPS.HW_COIN;
    expect(pickupReach(c, 120, false, false)).toBeGreaterThan(pickupReach(c, 30, false, false));
    expect(pickupReach(c, 60, true, false)).toBeCloseTo(pickupReach(c, 60, false, false) * PICKUP.touchAssist);
    expect(pickupReach(c, 60, false, true)).toBeGreaterThanOrEqual(1.25);
    expect(pickupReach(PICKUPS.REPAIR_WRENCH, 120, false, true)).toBe(PICKUPS.REPAIR_WRENCH.reach); // not magnetic
  });

  it('pulls nearby magnetic pickups toward the car, never past it', () => {
    const it0 = { offset: 0.5, collected: false };
    let moved = false;
    for (let k = 0; k < 240; k++) moved = magnetPull(it0, PICKUPS.HW_COIN, 0.1, 1, 0.5, 1 / 120) || moved;
    expect(moved).toBe(true);
    expect(it0.offset).toBeLessThan(0.5);
    expect(it0.offset).toBeGreaterThanOrEqual(0.1);
    const far = { offset: 0.5, collected: false };
    expect(magnetPull(far, PICKUPS.HW_COIN, -0.9, 1, 0.3, 1 / 120)).toBe(false);
    const ahead = { offset: 0.5, collected: false };
    expect(magnetPull(ahead, PICKUPS.HW_COIN, 0.2, PICKUP.magnetSegs + 1, 0.5, 1 / 120)).toBe(false);
    const wrench = { offset: 0.5, collected: false };
    expect(magnetPull(wrench, PICKUPS.REPAIR_WRENCH, 0.2, 1, 0.5, 1 / 120)).toBe(false);
  });
});

describe('crisp icon cache', () => {
  class FakeCanvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() {
      return new Proxy({}, { get(_, k) { return k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}; }, set() { return true; } });
    }
  }
  it('builds each kind once per size bucket, never upscales, and stays bounded', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const art = await import('../../src/pickup-art.js');
    const a = art.iconFor('HW_COIN', 40);
    expect(art.iconFor('HW_COIN', 40)).toBe(a);
    expect(a.iconSize).toBeGreaterThanOrEqual(40);           // drawn at or above its on-screen size
    expect(a.iconSize).toBeLessThan(40 * 1.13);               // …but never far above (stays sharp)
    expect(art.iconFor('PLUTONIUM', 40)).not.toBe(a);
    for (let px = 4; px < 2000; px += 3) for (const k of Object.keys(PICKUPS)) art.iconFor(k, px);
    expect(art.stats.icons).toBeLessThanOrEqual(160);
    expect(art.iconFor('NOPE', 10)).toBeNull();
    vi.unstubAllGlobals();
  });
});
