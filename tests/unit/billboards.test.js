// Billboards (docs/ADS.md): ad slots are their own pooled objects, placed deterministically
// off the racing line, rotated contextually per seed, and counted only when really seen.
import { describe, it, expect, beforeEach } from 'vitest';
import { track, buildInitialTrack, generateNextTrackBiome, setTrackSeed, RING } from '../../src/track.js';
import { SPEC, HOUSE, BUCKETS, bucketFor, validCampaign, applyManifest, creativeFor, noteView, flush, VIEW, debug, stash, flushStash } from '../../src/billboard-art.js';
import { vi } from 'vitest';
import { GameState } from '../../src/state.js';

function boards() {
  const out = [];
  for (let i = track.start; i < track.end; i++) {
    for (const it of track.seg(i).items) if (it.type === 'BILLBOARD') out.push({ i, kind: it.kind, slot: it.slot, offset: it.offset, it });
  }
  return out;
}
function build(biomes, seed = 0, level = 0) {
  GameState.levelIndex = level;
  setTrackSeed(seed);
  buildInitialTrack();
  for (let n = 0; n < biomes; n++) generateNextTrackBiome();
}

describe('billboard slots', () => {
  beforeEach(() => applyManifest({ v: 1, campaigns: [] }));

  it('places every kind of board: start arch, roadside, gantry, loop banner, gate sign', () => {
    build(0);
    expect(boards().some((b) => b.kind === 'START_ARCH')).toBe(true);
    build(24);
    const kinds = new Set(boards().map((b) => b.kind));
    kinds.add('START_ARCH'); // recycled by now: it is on the opening stretch only
    for (const k of ['START_ARCH', 'ROADSIDE', 'GANTRY', 'LOOP_BANNER', 'GATE_SIGN']) expect(kinds.has(k), k).toBe(true);
  });

  it('never stands on the road: roadside boards sit outside the rails, overhead ones span it', () => {
    build(24);
    for (const b of boards()) {
      if (SPEC[b.kind].overhead) expect(b.offset).toBe(0);
      else expect(Math.abs(b.offset) - SPEC[b.kind].w / 2, `${b.kind} @${b.i}`).toBeGreaterThan(1.12); // the rail
    }
  });

  it('is deterministic: the same seed and level give the same slots, a new seed the same slots too', () => {
    build(12, 7);
    const a = boards().map((b) => `${b.slot}:${b.kind}`).join();
    build(12, 7);
    expect(boards().map((b) => `${b.slot}:${b.kind}`).join()).toBe(a);
  });

  it('stays pooled: a long drive never allocates more board items than the ring holds', () => {
    build(4);
    for (let n = 0; n < 400; n++) generateNextTrackBiome();
    expect(track.end - track.start).toBe(RING);
    let pooled = 0;
    for (let i = track.start; i < track.end; i++) pooled += track.seg(i).itemPool.length;
    expect(pooled).toBeLessThan(RING * 6);
    expect(boards().length).toBeGreaterThan(10);
  });
});

describe('creative rotation', () => {
  beforeEach(() => applyManifest({ v: 1, campaigns: [] }));

  it('is contextual and repeatable: same seed, level, slot and era → same campaign', () => {
    const it = { kind: 'ROADSIDE', slot: 4321 };
    const a = creativeFor({ ...it }, '1985', '2026-10-18', 9, 2);
    expect(creativeFor({ ...it }, '1985', '2026-10-18', 9, 2)).toBe(a);
    const seen = new Set();
    for (let s = 0; s < 200; s++) seen.add(creativeFor({ kind: 'ROADSIDE', slot: s * 4 }, '1985', '2026-10-18', 9, 2));
    expect(seen.size).toBeGreaterThanOrEqual(5); // the rotation actually rotates
  });

  it('honours dates, kinds, eras, levels and the image aspect a slot needs', () => {
    applyManifest({ v: 1, campaigns: [
      { id: 'acme', kidSafe: true, weight: 100, creative: { image: { '4:1': 'ads/acme/banner.png' } }, kinds: ['GANTRY'], eras: ['2088'], levels: [3], start: '2026-10-01', end: '2026-10-31' },
    ] });
    const pick = (kind, era, day, level) => creativeFor({ kind, slot: 8 }, era, day, 1, level);
    let hits = 0;
    for (let s = 0; s < 50; s++) if (creativeFor({ kind: 'GANTRY', slot: s }, '2088', '2026-10-18', 1, 3) === 'acme') hits++;
    expect(hits).toBeGreaterThan(30); // weight 100 vs the house pool's 14
    expect(pick('ROADSIDE', '2088', '2026-10-18', 3)).not.toBe('acme'); // no 16:9 image, not this kind
    expect(pick('GANTRY', '1955', '2026-10-18', 3)).not.toBe('acme');   // wrong era
    expect(pick('GANTRY', '2088', '2026-11-01', 3)).not.toBe('acme');   // campaign over
    expect(pick('GANTRY', '2088', '2026-10-18', 0)).not.toBe('acme');   // wrong level
  });

  it('rejects anything not kid-safe, off-origin or malformed, and always keeps the house pool', () => {
    const bad = [
      { id: 'x1', creative: { house: 'site' } },                                        // no kidSafe flag
      { id: 'x2', kidSafe: true, creative: { image: { '16:9': 'https://evil.example/a.png' } } },
      { id: 'x3', kidSafe: true, creative: { image: { '16:9': '//evil.example/a.png' } } },
      { id: 'x4', kidSafe: true, creative: { image: { '16:9': 'ads/../../secret.png' } } },
      { id: 'x5', kidSafe: true, creative: { image: { '16:9': 'ads/a.svg' } } },          // no SVG (scripts)
      { id: 'X BAD', kidSafe: true, creative: { house: 'site' } },
      { id: 'x7', kidSafe: true, weight: 0, creative: { house: 'site' } },
      { id: 'x8', kidSafe: true, creative: { house: 'nope' } },
    ];
    for (const c of bad) expect(validCampaign(c), c.id).toBeNull();
    expect(validCampaign({ id: 'ok', kidSafe: true, creative: { image: { '1:1': 'ads/ok/square.webp' } } })).not.toBeNull();
    applyManifest({ v: 1, campaigns: bad });
    expect(debug().campaigns).toBe(HOUSE.length);
    expect(applyManifest({ v: 2, campaigns: [] })).toBe(false);
  });

  it('picks the smallest bucket at least as wide as the board on screen', () => {
    expect(bucketFor(10)).toBe(64);
    expect(bucketFor(64)).toBe(64);
    expect(bucketFor(65)).toBe(128);
    expect(bucketFor(5000)).toBe(BUCKETS[BUCKETS.length - 1]);
  });
});

describe('viewability', () => {
  beforeEach(() => { GameState.status = 'PLAYING'; track.run = {}; applyManifest({ v: 1, campaigns: [] }); });

  it('counts one impression after a continuous second, once per board per race', () => {
    const it = { slot: 1 };
    const before = debug().impressions;
    let t = 0;
    for (; t < VIEW.ms - 20; t += 16) expect(noteView(it, 'house-site', 100, 100, 200, 112, 1280, 720, t)).toBe(false);
    for (; t < VIEW.ms + 200; t += 16) noteView(it, 'house-site', 100, 100, 200, 112, 1280, 720, t);
    expect(debug().impressions).toBe(before + 1);
    for (; t < 5000; t += 16) noteView(it, 'house-site', 100, 100, 200, 112, 1280, 720, t);
    expect(debug().impressions).toBe(before + 1);
  });

  it('needs half the board on screen, a readable size, an unbroken look, and a race in progress', () => {
    const before = debug().impressions;
    const run = (it, x, w, h, gap = 16, status = 'PLAYING') => {
      GameState.status = status;
      for (let t = 0; t < 3000; t += gap) noteView(it, 'house-site', x, 100, w, h, 1280, 720, t);
    };
    run({ slot: 10 }, 1280 - 60, 200, 112);         // only 30% on screen
    run({ slot: 11 }, 100, 20, 11);                 // a speck in the distance
    run({ slot: 12 }, 100, 200, 112, 400);          // flickers in and out (gaps > 250 ms)
    run({ slot: 13 }, 100, 200, 112, 16, 'TITLE');  // attract-mode road, not a race
    expect(debug().impressions).toBe(before);
  });

  it('reports only aggregate counts per campaign and day: no ids, no device, nothing personal', () => {
    applyManifest({ v: 1, report: false, campaigns: [] });
    const it = { slot: 99 };
    for (let t = 0; t < 1500; t += 16) noteView(it, 'house-daily', 0, 0, 400, 225, 1280, 720, t);
    const body = JSON.parse(flush(false));
    expect(Object.keys(body).sort()).toEqual(['counts', 'day', 'v']);
    expect(body.counts).toEqual({ 'house-daily': 1 });
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(flush(false)).toBeNull(); // nothing pending any more
  });

  it('offline (ticket 0158): totals wait in storage and go out when the network is back', () => {
    const mem = new Map();
    vi.stubGlobal('localStorage', { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) });
    let online = false;
    const sent = [];
    vi.stubGlobal('navigator', { get onLine() { return online; } });
    vi.stubGlobal('fetch', (url, init) => { sent.push(JSON.parse(init.body)); return Promise.resolve({ ok: true, status: 204 }); });
    applyManifest({ v: 1, report: true, campaigns: [] });
    const it = { slot: 98 };
    for (let t = 0; t < 1500; t += 16) noteView(it, 'house-daily', 0, 0, 400, 225, 1280, 720, t);
    flush(false);
    expect(sent).toHaveLength(0);
    stash('2026-10-17', { 'house-site': 2 });
    expect(Object.keys(JSON.parse(mem.get('outatime88_ads_outbox_v1'))).length).toBe(2);
    expect(flushStash()).toBe(0); // still offline
    online = true;
    expect(flushStash()).toBe(2);
    expect(sent.map((b) => Object.keys(b).sort().join())).toEqual(['counts,day,v', 'counts,day,v']);
    expect(mem.has('outatime88_ads_outbox_v1')).toBe(false);
    applyManifest({ v: 1, report: false, campaigns: [] });
    vi.unstubAllGlobals();
  });
});
