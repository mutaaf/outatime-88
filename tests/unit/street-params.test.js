// Street-tuner sound rules (ticket 0193): drivetrain, tyres, speed and road → sound parameters.
import { describe, it, expect } from 'vitest';
import {
  CHARACTERS, characterFor, boostTarget, stepBoost, spoolVoice, blowOff, shiftChirp, onLimiter,
  crackleRate, squealLayer, driftTone, windFor, dopplerRatio, passedBy, passByGain, crunchFor,
  reverbFor, musicCutoff,
} from '../../src/sfx/street-params.js';
import { POP_CULTURE_ROSTER } from '../../src/data.js';

describe('engine character per car', () => {
  it('maps every roster car to a known character', () => {
    for (const c of POP_CULTURE_ROSTER) expect(CHARACTERS[characterFor(c.shape, c.car)], c.car).toBeTruthy();
  });
  it('muscle rumbles, tuners and the rotary spool a turbo, the electric and the rocket stay clean', () => {
    expect(characterFor('MUSCLE')).toBe('v8');
    expect(characterFor('TUNER_WING')).toBe('tuner');
    expect(characterFor('TUNER_WING', 'Fortune Widebody Rotary')).toBe('rotary');
    expect(characterFor('LIGHTCYCLE')).toBe('rotary');
    expect(characterFor('ROADSTER', 'Rotary-ish name')).toBe('electric');
    expect(characterFor('ROCKET')).toBe('rocket');
    expect(CHARACTERS.v8.turbo).toBe(false);
    expect(CHARACTERS.tuner.turbo).toBe(true);
    expect(CHARACTERS.electric.crackle).toBe(0);
    expect(characterFor('SOMETHING_NEW')).toBe('i6');
  });
});

describe('turbo spool', () => {
  it('boost builds with revs on throttle and is nothing off it', () => {
    expect(boostTarget(30, true)).toBe(0);
    expect(boostTarget(60, true)).toBeGreaterThan(boostTarget(40, true));
    expect(boostTarget(100, true)).toBe(1);
    expect(boostTarget(100, false)).toBe(0);
  });
  it('spools up with lag and dumps fast', () => {
    let b = 0;
    for (let i = 0; i < 6; i++) b = stepBoost(b, 1, 1 / 60); // 0.1 s
    expect(b).toBeGreaterThan(0.1);
    expect(b).toBeLessThan(0.5);
    let d = 1;
    for (let i = 0; i < 6; i++) d = stepBoost(d, 0, 1 / 60);
    expect(d).toBeLessThan(0.4);
  });
  it('the whistle rises in pitch and level with boost, only on turbo cars', () => {
    const lo = spoolVoice(0.2, 'tuner'), hi = spoolVoice(0.9, 'tuner');
    expect(hi.hz).toBeGreaterThan(lo.hz);
    expect(hi.gain).toBeGreaterThan(lo.gain);
    expect(spoolVoice(1, 'v8')).toEqual({ hz: 0, gain: 0 });
    expect(spoolVoice(1, 'electric').gain).toBe(0);
  });
});

describe('lifts, shifts and the limiter', () => {
  it('the blow-off valve vents on a lift or a shift with boost built up', () => {
    expect(blowOff(true, false, 0.8)).toBe(true);
    expect(blowOff(true, false, 0.1)).toBe(false);
    expect(blowOff(true, true, 0.8)).toBe(false);
    expect(blowOff(true, true, 0.8, true)).toBe(true);
  });
  it('chirps on an upshift under throttle, not a downshift or a crawl', () => {
    expect(shiftChirp(2, 3, true, 50)).toBe(true);
    expect(shiftChirp(3, 2, true, 40)).toBe(false);
    expect(shiftChirp(1, 2, false, 30)).toBe(false);
    expect(shiftChirp(1, 2, true, 5)).toBe(false);
  });
  it('bounces off the limiter only at the red line on the gas', () => {
    expect(onLimiter(100, true)).toBe(true);
    expect(onLimiter(90, true)).toBe(false);
    expect(onLimiter(100, false)).toBe(false);
  });
  it('crackles on the overrun, fading as the revs and the moment pass', () => {
    expect(crackleRate(true, 90, 80, 'v8', 0)).toBe(0);
    expect(crackleRate(false, 90, 20, 'v8', 0)).toBe(0); // a crawl
    const fresh = crackleRate(false, 90, 80, 'v8', 0);
    expect(fresh).toBeGreaterThan(crackleRate(false, 90, 80, 'v8', 1));
    expect(crackleRate(false, 90, 80, 'v8', 2)).toBe(0);
    expect(crackleRate(false, 90, 80, 'electric', 0)).toBe(0);
  });
});

describe('tyres', () => {
  it('the squeal layer rises with slip and is silent when gripping', () => {
    expect(squealLayer(0.1).gain).toBe(0);
    const a = squealLayer(0.5), b = squealLayer(1.1);
    expect(b.gain).toBeGreaterThan(a.gain);
    expect(b.hz).toBeGreaterThan(a.hz);
    expect(squealLayer(-1.1)).toEqual(b); // either way round
  });
  it('the drift tone climbs with the drift tier', () => {
    expect(driftTone(false, 2).gain).toBe(0);
    expect(driftTone(true, 3).hz).toBeGreaterThan(driftTone(true, 0).hz);
    expect(driftTone(true, 3).gain).toBeGreaterThan(driftTone(true, 0).gain);
  });
});

describe('speed and space', () => {
  it('wind rises with the square of speed', () => {
    expect(windFor(0).gain).toBe(0);
    expect(windFor(140).gain).toBeGreaterThan(windFor(70).gain * 3);
    expect(windFor(140).hz).toBeGreaterThan(windFor(40).hz);
  });
  it('Doppler: higher closing in, lower going away', () => {
    expect(dopplerRatio(60)).toBeGreaterThan(1);
    expect(dopplerRatio(-60)).toBeLessThan(1);
    expect(dopplerRatio(0)).toBe(1);
  });
  it('spots a pass-by either way round, only close enough to hear', () => {
    expect(passedBy(30, -5, 0.3)).toBe(1);
    expect(passedBy(-30, 5, 0.3)).toBe(-1);
    expect(passedBy(30, 10, 0.3)).toBe(0);
    expect(passedBy(30, -5, 1.4)).toBe(0);
    expect(passedBy(undefined, -5, 0)).toBe(0);
    expect(passedBy(-1e6, 16000, 0)).toBe(0); // a parked car placed ahead in a formation (0027)
    expect(passByGain(80, 0.2)).toBeGreaterThan(passByGain(20, 0.2));
    expect(passByGain(5, 0)).toBe(0);
  });
  it('tunnels and loop rings get reverb; open road does not', () => {
    expect(reverbFor('BOOSTER')).toBeGreaterThan(reverbFor('LOOP'));
    expect(reverbFor('STANDARD')).toBe(0);
    expect(reverbFor('STANDARD', true)).toBeGreaterThan(0);
  });
});

describe('impacts and moments', () => {
  it('the crunch scales with the hit, and only big ones break glass and duck the music', () => {
    expect(crunchFor(20)).toBeNull();
    const small = crunchFor(300), big = crunchFor(1600);
    expect(big.gain).toBeGreaterThan(small.gain);
    expect(big.dur).toBeGreaterThan(small.dur);
    expect(big.rate).toBeLessThan(small.rate); // heavier = lower
    expect(small.glass).toBe(false);
    expect(big.glass).toBe(true);
    expect(small.duck).toBe(0);
    expect(big.duck).toBeGreaterThan(0);
    expect(crunchFor(99999)).toEqual(big); // capped
  });
  it('the music closes down for NOS, deeper for slow-mo, a little for big air', () => {
    const open = musicCutoff({});
    expect(musicCutoff({ nos: true })).toBeLessThan(open);
    expect(musicCutoff({ slowmo: true, nos: true })).toBeLessThan(musicCutoff({ nos: true }));
    expect(musicCutoff({ air: true })).toBeGreaterThan(musicCutoff({ nos: true }));
  });
});
