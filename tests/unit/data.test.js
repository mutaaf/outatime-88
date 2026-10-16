import { describe, it, expect } from 'vitest';
import { WORLD_LEVELS, ERAS, POP_CULTURE_ROSTER, UPGRADE_DEFS, PACE_MODES, CAMERA_MODES } from '../../src/data.js';

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
});
