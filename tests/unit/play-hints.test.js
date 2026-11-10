// Ticket 0007: in-race prompts name the controls of the input in hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLAY_HINTS, playHint } from '../../src/play-hints.js';
import { obstacleTip } from '../../src/coach-dock.js';

describe('playHint', () => {
  it('keeps the original keyboard words for keys and no input yet (touch too, for the boost prompts)', () => {
    const keys = { coachFlux: 'Hold 88 mph — or hit SPACE / ⚡ — to jump eras', flux: '⚡ FLUX READY! HIT 88 MPH OR SPACE!', ramp: 'PRESS SPACE OR HOVER FOR MID-AIR TRICK!', slide: '💥 BLOCKED! HOLD DRIFT (S) TO SLIDE UNDER!', jump: '💥 BLOCKED! JUMP (H/E) OR STEER AROUND!', hop: 'Hop it (H / E)', duck: 'Hold drift to duck (S / ▼)' };
    for (const kind of ['keys', '', undefined, 'nonsense']) expect(playHint(kind)).toEqual(keys);
    const t = playHint('touch');
    for (const k of ['coachFlux', 'flux', 'ramp']) expect(t[k]).toBe(keys[k]);
  });

  // Ticket 0253: the obstacle crash lines name the control in hand, never a keyboard letter off the keyboard.
  it('touch names the DRIFT and JUMP pads, no key letters', () => {
    const t = playHint('touch');
    expect(t.slide).toMatch(/HOLD DRIFT\b/);
    expect(t.jump).toMatch(/\bJUMP\b/);
    expect(`${t.slide} ${t.jump}`).not.toMatch(/\([A-Z/]+\)/);
  });

  it('a pad names its buttons for the crash lines: B / LT to slide, Y to jump', () => {
    const h = playHint('pad');
    expect(h.slide).toMatch(/\bB\b.*\bLT\b/);
    expect(h.jump).toMatch(/\(Y\)/);
    expect(`${h.slide} ${h.jump}`).not.toMatch(/\((S|H\/E)\)|DRIFT \(S\)/);
  });

  it('a paired TV phone names its BRAKE and JUMP buttons', () => {
    const h = playHint('phone');
    expect(h.slide).toMatch(/HOLD BRAKE/);
    expect(h.jump).toMatch(/\bJUMP\b/);
    expect(`${h.slide} ${h.jump}`).not.toMatch(/\([A-Z/]+\)/);
  });

  it('a rebound BRAKE key is named in the slide line; touch and pads ignore it', () => {
    const h = playHint('keys', '', 'K');
    expect(h.slide).toBe('💥 BLOCKED! HOLD DRIFT (K) TO SLIDE UNDER!');
    expect(h.flux).toBe(PLAY_HINTS.keys.flux);
    expect(playHint('keys', '', 'K')).toBe(h); // cached: built once per binding
    expect(playHint('keys', 'O', 'K').flux).toBe('⚡ FLUX READY! HIT 88 MPH OR O!');
    expect(playHint('touch', 'O', 'K')).toBe(PLAY_HINTS.touch);
    expect(playHint('pad', 'O', 'K')).toBe(PLAY_HINTS.pad);
  });

  it('names the pad buttons with a pad in hand, never a key', () => {
    const h = playHint('pad');
    expect(h.flux).toMatch(/\bX\b/);
    expect(h.coachFlux).toMatch(/\bX\b.*\bRB\b/);
    expect(h.ramp).toMatch(/\bX\b.*\bY\b/);
    expect(Object.values(h).join(' ')).not.toMatch(/SPACE|ENTER|TAP|KEY/);
  });

  it('names BOOST for a paired TV phone', () => {
    const h = playHint('phone');
    expect([h.coachFlux, h.flux, h.ramp].every((t) => /BOOST/.test(t))).toBe(true);
    expect(Object.values(h).some((t) => /SPACE/.test(t))).toBe(false);
  });

  it('every kind has every prompt, short enough for the HUD line', () => {
    for (const h of Object.values(PLAY_HINTS)) {
      expect(Object.keys(h).sort()).toEqual(['coachFlux', 'duck', 'flux', 'hop', 'jump', 'ramp', 'slide']);
      expect(h.flux.length).toBeLessThanOrEqual(40);
      expect(h.slide.length).toBeLessThanOrEqual(42); // one plate line at 390 px, no longer than today's keyboard line
      expect(h.jump.length).toBeLessThanOrEqual(42);
    }
  });
});

// Ticket 0259: the coach card's LOW LASER / HIGH GATE lines name the input in hand, never all three.
describe('obstacleTip (coach card)', () => {
  const el = () => ({ textContent: '' });
  const tip = (type, kind, boostKey = '', downKey = '') => {
    const icon = el(), title = el(), line = el();
    expect(obstacleTip({ type, offset: 0.3 }, false, icon, title, line, playHint(kind, boostKey, downKey))).toBe(true);
    return line.textContent;
  };
  const both = (kind, b, d) => [tip('LOW_LASER_BAR', kind, b, d), tip('HIGH_LIGHT_GATE', kind, b, d)];

  it('keys: the real jump keys (H / E) and S / ▼ to duck, no swipe, no W (that is the gas)', () => {
    const [hop, duck] = both('keys');
    expect(hop).toBe('Hop it (H / E) — or go ◀ LEFT');
    expect(duck).toBe('Hold drift to duck (S / ▼) — or go ◀ LEFT');
    for (const t of [hop, duck]) expect(t).not.toMatch(/swipe|\bW\b|▲/i);
    expect(both('')).toEqual([hop, duck]); // no input yet: the keyboard words
  });

  it('touch names the on-screen JUMP and DRIFT pads: no key letters, no key arrows', () => {
    const [hop, duck] = both('touch');
    expect(hop).toMatch(/\bJUMP\b/);
    expect(duck).toMatch(/\bDRIFT\b/);
    for (const t of [hop, duck]) {
      expect(t).not.toMatch(/\([^)]*\)|[▲▼]|\b(W|S|H|E)\b|swipe/);
    }
  });

  it('a pad names its buttons (Y to hop, B / LT to duck); a TV phone its JUMP and BRAKE', () => {
    const [hop, duck] = both('pad');
    expect(hop).toMatch(/\(Y\)/);
    expect(duck).toMatch(/\bB\b.*\bLT\b/);
    for (const t of [hop, duck]) expect(t).not.toMatch(/swipe|[▲▼]|\b(W|S|H|E)\b|DRIFT|TAP/i);
    const [phop, pduck] = both('phone');
    expect(phop).toMatch(/\bJUMP\b/);
    expect(pduck).toMatch(/\bBRAKE\b/);
    for (const t of [phop, pduck]) expect(t).not.toMatch(/swipe|[▲▼]|\(/i);
  });

  it('a rebound BRAKE key is named in the duck line', () => {
    expect(tip('HIGH_LIGHT_GATE', 'keys', '', 'K')).toBe('Hold drift to duck (K / ▼) — or go ◀ LEFT');
    expect(tip('HIGH_LIGHT_GATE', 'touch', '', 'K')).toBe('Hold DRIFT to duck — or go ◀ LEFT');
  });

  it('every device fits one coach line at 390 px (no longer than the old keyboard line)', () => {
    for (const kind of ['keys', 'touch', 'pad', 'phone']) {
      for (const t of both(kind)) expect(t.length).toBeLessThanOrEqual(46);
    }
  });
});

// The race chunks import main.js, so they are checked as source: every control prompt there must
// come from the table, never a hard-coded key (the coach's FLUX FULL line, the flux hint, the ramp call).
describe('race prompts use the table', () => {
  const src = (f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
  it('race-flow and race-step name no key outright', () => {
    for (const f of ['race-flow.js', 'race-step.js']) {
      for (const h of Object.values(PLAY_HINTS.keys)) expect(src(f)).not.toContain(h);
      expect(src(f)).not.toMatch(/OR SPACE|hit SPACE|PRESS SPACE/);
    }
    expect(src('race-flow.js')).toMatch(/descEl\.textContent = hintNow\(\)\.coachFlux/);
    expect(src('race-flow.js')).toMatch(/fluxHint\.textContent = hintNow\(\)\.flux/);
    // 0259: the coach card's obstacle tips get the words for the input in hand, and name no device outright.
    expect(src('race-flow.js')).toMatch(/obstacleTip\([^)]*descEl, hintNow\(\)\)/);
    expect(src('coach-dock.js')).not.toMatch(/swipe|W \/ ▲|S \/ ▼/);
    expect(src('race-step.js')).toMatch(/RF\.hintNow\(\)\.ramp/);
    // 0253: the obstacle crash lines too, never "(S)" / "(H/E)" hard-coded.
    expect(src('race-step.js')).not.toMatch(/\((S|H\/E)\)/);
    expect(src('race-step.js')).toMatch(/RF\.hintNow\(\)\.jump/);
    expect(src('race-step.js')).toMatch(/RF\.hintNow\(\)\.slide/);
    expect(src('race-flow.js')).toMatch(/playHint\(InputState\.lastInput, InputState\.boostKey, InputState\.downKey\)/);
  });
});
