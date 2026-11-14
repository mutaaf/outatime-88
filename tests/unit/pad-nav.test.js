// Ticket 0273: a gamepad moves focus in menus. D-pad / stick = next / previous with a repeat,
// A = select, B = back; fresh presses only.
import { describe, it, expect } from 'vitest';
import { NAV, createNav, resetNav, readNav, padMenuStep } from '../../src/pad-nav.js';

const pad = (dir = 0, a = false, b = false) => ({ dir, a, b });
/** A live state: one neutral frame seen, so presses count. */
const live = () => { const st = createNav(); padMenuStep(pad(), 16, st); return st; };

describe('padMenuStep', () => {
  it('a fresh D-pad press moves once: down/right = next, up/left = prev', () => {
    const st = live();
    expect(padMenuStep(pad(1), 16, st)).toBe('next');
    expect(padMenuStep(pad(1), 16, st)).toBe(null);
    expect(padMenuStep(pad(0), 16, st)).toBe(null);
    expect(padMenuStep(pad(-1), 16, st)).toBe('prev');
    expect(padMenuStep(pad(1), 16, st)).toBe('next'); // straight across to the other side
  });

  it('held, it repeats after the first delay, then at the repeat rate', () => {
    const st = live();
    const fired = [];
    for (let t = 0; t <= 1000; t += 10) if (padMenuStep(pad(1), 10, st)) fired.push(t);
    // 0 ms, then 350, 470, 590, 710, 830, 950.
    expect(fired[0]).toBe(0);
    expect(fired[1]).toBe(NAV.first);
    for (let i = 2; i < fired.length; i++) expect(fired[i] - fired[i - 1]).toBe(NAV.repeat);
    expect(fired.length).toBe(7);
  });

  it('on uneven frames a repeat waits a full delay from the last move (no catch-up bursts)', () => {
    const st = live();
    let t = 0, last = null;
    const gaps = [];
    for (const dt of [16, 100, 100, 100, 100, 16, 100, 100, 16, 16, 100, 100, 100, 16, 100]) {
      t += dt;
      if (padMenuStep(pad(1), dt, st)) { if (last !== null) gaps.push(t - last); last = t; }
    }
    expect(gaps[0]).toBeGreaterThanOrEqual(NAV.first);
    for (const g of gaps.slice(1)) expect(g).toBeGreaterThanOrEqual(NAV.repeat);
    expect(gaps.length).toBeGreaterThanOrEqual(3);
  });

  it('a held A fires once; a held B fires once', () => {
    const st = live();
    const a = [];
    for (let i = 0; i < 60; i++) a.push(padMenuStep(pad(0, true), 16, st));
    expect(a.filter(Boolean)).toEqual(['select']);
    padMenuStep(pad(), 16, st);
    const b = [];
    for (let i = 0; i < 60; i++) b.push(padMenuStep(pad(0, false, true), 16, st));
    expect(b.filter(Boolean)).toEqual(['back']);
  });

  it('buttons and a direction held as the menu opens do nothing until let go', () => {
    const st = createNav();
    for (let i = 0; i < 100; i++) expect(padMenuStep(pad(1, true, true), 16, st)).toBe(null);
    expect(padMenuStep(pad(0), 16, st)).toBe(null);
    expect(padMenuStep(pad(1, true), 16, st)).toBe('select'); // A wins the frame
    expect(padMenuStep(pad(1), 16, st)).toBe(null); // the direction went down that frame
    resetNav(st);
    expect(padMenuStep(pad(-1, false, true), 16, st)).toBe(null);
  });
});

describe('readNav', () => {
  const gp = (buttons = [], axes = [0, 0]) => {
    const b = Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 }));
    return { connected: true, buttons: b, axes };
  };
  it('reads the D-pad, A and B, any pad', () => {
    expect(readNav([gp([13])])).toMatchObject({ dir: 1, a: false, b: false });
    expect(readNav([gp([15])]).dir).toBe(1);
    expect(readNav([gp([12])]).dir).toBe(-1);
    expect(readNav([gp([14])]).dir).toBe(-1);
    expect(readNav([null, gp([0]), gp([1])])).toMatchObject({ dir: 0, a: true, b: true });
    expect(readNav(null)).toMatchObject({ dir: 0, a: false, b: false });
  });
  it('the stick counts past the 0.6 dead zone, the larger axis wins', () => {
    expect(readNav([gp([], [0, 0.55])]).dir).toBe(0);
    expect(readNav([gp([], [0, 0.7])]).dir).toBe(1);
    expect(readNav([gp([], [-0.65, 0.2])]).dir).toBe(-1);
    expect(readNav([gp([], [0.3, -0.9])]).dir).toBe(-1);
    expect(readNav([{ ...gp([], [0, 1]), connected: false }]).dir).toBe(0);
  });
  it('reuses one result object', () => {
    expect(readNav([gp([0])])).toBe(readNav([gp([1])]));
  });
});
