import { describe, it, expect } from 'vitest';
import { SCENE_IDS } from '../../src/scenes/stage.js';
import { WORLD_LEVELS, ERAS, POP_CULTURE_ROSTER, MULTIVERSE_POOL, LIVERY_OPTIONS, UPGRADE_DEFS, PACE_MODES, CAMERA_MODES } from '../../src/data.js';

describe('game content integrity', () => {
  it('levels are indexed contiguously and reference valid eras', () => {
    WORLD_LEVELS.forEach((lvl, i) => {
      expect(lvl.index).toBe(i);
      expect(ERAS[lvl.startEra]).toBeDefined();
    });
  });

  it('level and roster ids are unique', () => {
    const lvlIds = WORLD_LEVELS.map((l) => l.id);
    expect(new Set(lvlIds).size).toBe(lvlIds.length);
    const rosterIds = POP_CULTURE_ROSTER.map((c) => c.id ?? c.name);
    expect(new Set(rosterIds).size).toBe(rosterIds.length);
  });

  it('has non-empty upgrade, pace and camera tables', () => {
    expect(UPGRADE_DEFS.length).toBeGreaterThan(0);
    expect(PACE_MODES.length).toBeGreaterThan(0);
    expect(CAMERA_MODES.length).toBeGreaterThan(0);
  });

  it('every roster and multiverse car uses a body shape the renderer knows', () => {
    const SHAPES = ['GULLWING', 'MUSCLE', 'SCANNER', 'ROCKET', 'LIGHTCYCLE', 'TUNER_WING', 'HEAVY_VAN', 'ROADSTER'];
    for (const c of [...POP_CULTURE_ROSTER, ...MULTIVERSE_POOL]) expect(SHAPES).toContain(c.shape);
  });

  it('livery ids are unique', () => {
    const ids = LIVERY_OPTIONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('eras (ticket 0008)', () => {
  const REQUIRED = ['id', 'name', 'presentDate', 'destDate', 'skyTop', 'skyBot', 'horizonGlow', 'groundA', 'groundB', 'trackA', 'trackB', 'railColor', 'sunStyle'];

  it('every era has the fields the HUD and both renderers read; ids are unique', () => {
    for (const era of ERAS) for (const k of REQUIRED) expect(era[k], `${era.id}.${k}`).toBeTruthy();
    const ids = ERAS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the 1955 Atomic Diner era is in the warp rotation and the date chain closes the loop', () => {
    const i = ERAS.findIndex((e) => e.id === '1955');
    expect(i).toBeGreaterThan(-1);
    expect(ERAS[i].name).toMatch(/^1955 • ATOMIC DINER/);
    // Each era's destination is the next era's present.
    ERAS.forEach((era, k) => expect(era.destDate).toBe(ERAS[(k + 1) % ERAS.length].presentDate));
  });

  it('existing era indices are unchanged (levels and render overrides point at them)', () => {
    expect(ERAS.slice(0, 5).map((e) => e.id)).toEqual(['2026', '1985', '1885', '2015', '2088']);
  });

  it('every era has its own 2D scene chunk; 1955 keeps its roadside prop set', () => {
    expect([...SCENE_IDS].sort()).toEqual(ERAS.map((e) => e.id).sort());
    expect(ERAS.find((e) => e.id === '1955').props).toBe('atomic');
  });
});
