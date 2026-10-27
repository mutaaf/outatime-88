// "Fair field" (ticket 0211): Settings → RIVALS → FAIR FIELD scales the rivals' catch-up (the
// rubber band) to FAIR_FIELD of today's; CLOSE PACK, the default, keeps today's exact numbers.
// Live rooms and the daily always race the close pack, so a seeded race is the same for everyone.
import { describe, it, expect } from 'vitest';
import { FAIR_FIELD, catchUpScale } from '../../src/fair-field.js';
import { rivalTargetMph } from '../../src/raceflow.js';
import { AI, driverProfile, createBrain, createAiWorld, fillWorld, stepRival } from '../../src/rival-ai.js';
import { SETTINGS_DEFAULTS, normalizeSettings } from '../../src/settings.js';

const DT = 1 / 120;

describe('catchUpScale', () => {
  it('is 1 for the close pack (the default and anything unknown) and FAIR_FIELD for a fair field', () => {
    expect(FAIR_FIELD).toBe(0.4);
    expect(catchUpScale(SETTINGS_DEFAULTS.rivals)).toBe(1);
    expect(catchUpScale('pack')).toBe(1);
    expect(catchUpScale(undefined)).toBe(1);
    expect(catchUpScale('nonsense')).toBe(1);
    expect(catchUpScale('fair')).toBe(FAIR_FIELD);
    expect(catchUpScale('fair', { mode: 'ARCADE' })).toBe(FAIR_FIELD);
    expect(catchUpScale('fair', { mode: 'INFINITE' })).toBe(FAIR_FIELD);
  });

  it('is ignored in live rooms and the daily challenge', () => {
    expect(catchUpScale('fair', { mode: 'LIVE' })).toBe(1);
    expect(catchUpScale('fair', { mode: 'ARCADE', daily: { day: '2026-10-27' } })).toBe(1);
    expect(catchUpScale('fair', { mode: 'LIVE', daily: null })).toBe(1);
  });
});

describe('fallback driver (raceflow rivalTargetMph)', () => {
  const LEADS = [-2000, -500, -221, -220, -100, -61, -60, 0, 200, 350, 351, 600, 700, 701, 3000];
  it('without a scale gives exactly the old pace for every gap', () => {
    const old = (pace, lead) => (lead < -220 ? pace + 26 : lead < -60 ? pace + 10 : lead > 700 ? pace - 18 : lead > 350 ? pace - 8 : pace);
    for (const pace of [68, 80, 92]) for (const lead of LEADS) {
      expect(rivalTargetMph(pace, lead)).toBe(old(pace, lead));
      expect(rivalTargetMph(pace, lead, 1)).toBe(old(pace, lead));
    }
  });
  it('scales the push and the ease-off by the catch-up scale', () => {
    for (const lead of LEADS) {
      const full = rivalTargetMph(80, lead) - 80;
      expect(rivalTargetMph(80, lead, FAIR_FIELD) - 80).toBeCloseTo(full * FAIR_FIELD, 9);
    }
  });
});

describe('rival AI rubber band (rival-ai stepRival)', () => {
  /** The speed a fresh rival wants on a straight, `lead` ahead of you, with `band` catch-up. */
  function want(lead, band, tier = 0) {
    const w = createAiWorld();
    w.curvatureAt = () => 0; w.bankAt = () => 0; w.featureAt = () => null; w.lineAt = () => 0;
    w.tier = tier;
    if (band !== undefined) w.band = band;
    const b = createBrain(driverProfile('ALL-ROUNDER', 3), { seed: 3, pace: 80, carP: { gripMult: 1, accelMult: 1, topMphBonus: 0 } });
    b.nosTank = 0; // no NOS, so the cruise speed is what it wants
    const r = { worldZ: 1000, offset: 0, vx: 0, mph: 80, halfW: 0.14, halfL: 115, progress: 0, finishTime: null, takenDown: false };
    w.cars.push(r);
    stepRival(r, b, w, lead, DT);
    return b.wantMph;
  }

  it('a world without a band set (and band 1) drives exactly as before', () => {
    for (const lead of [-1500, -400, 0, 500, 1500]) expect(want(lead, 1)).toBe(want(lead));
    expect(want(-1500) - want(0)).toBeCloseTo(AI.band.push, 9);
    expect(want(0) - want(1500)).toBeCloseTo(AI.band.ease, 9);
  });

  it('FAIR FIELD pushes and eases off FAIR_FIELD as hard, at every tier', () => {
    for (const tier of [0, 0.5, 1]) {
      const base = want(0, 1, tier);
      for (const lead of [-1500, -500, 600, 1500]) {
        const pack = want(lead, 1, tier) - base;
        const fair = want(lead, FAIR_FIELD, tier) - base;
        if (lead < 0) expect(pack).toBeGreaterThan(0);
        expect(fair).toBeCloseTo(pack * FAIR_FIELD, 9);
      }
    }
  });

  it('fillWorld takes the race catch-up from GameState, defaulting to 1', () => {
    const w = createAiWorld();
    const field = { racers: [], traffic: [], drawObstacles: [] };
    const road = { curvatureAt: () => 0, bankAt: () => 0, featureAt: () => null, line: null };
    const g = { playerX: 0, speed: 0, raceTime: 0, difficulty: 0, levelIndex: 0, waveTier: 1 };
    expect(fillWorld(w, field, 0, road, g, 125).band).toBe(1);
    expect(fillWorld(w, field, 0, road, { ...g, catchUp: FAIR_FIELD }, 125).band).toBe(FAIR_FIELD);
  });
});

describe('the RIVALS setting (save compatibility)', () => {
  it('defaults to the close pack, also for a real pre-0211 save', () => {
    expect(SETTINGS_DEFAULTS.rivals).toBe('pack');
    // A settings blob as saved by the 0216-era build: no rivals field at all.
    const old = { tilt: false, tiltInvert: false, musicVolume: 0.8, sfxVolume: 1, musicStyle: 'auto', voice: true, proximity: true, coach: true, hud: 'normal', motion: 'auto', difficulty: 'hard', graphics: 'auto', steer: '', assist: '', keys: null };
    const s = normalizeSettings(old);
    expect(s.rivals).toBe('pack');
    expect(s.difficulty).toBe('hard');
    expect(catchUpScale(s.rivals)).toBe(1);
  });
  it('keeps a saved FAIR FIELD and repairs a bad value', () => {
    expect(normalizeSettings({ rivals: 'fair' }).rivals).toBe('fair');
    expect(normalizeSettings({ rivals: 'off' }).rivals).toBe('pack');
  });
});
