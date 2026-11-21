import { describe, it, expect, beforeEach } from 'vitest';
import { toKmh, unitsFor, formatSpeed, unitsFrame, KMH_PER_MPH } from '../../src/units.js';
import { GameState } from '../../src/state.js';
import { SaveStore } from '../../src/save.js';
import { createHud } from '../../src/hud.js';

describe('speed units (ticket 0293)', () => {
  it('converts mph to whole km/h: 88 mph is 142', () => {
    expect(KMH_PER_MPH).toBe(1.609344);
    expect(toKmh(0)).toBe(0);
    expect(toKmh(88)).toBe(142);
    expect(toKmh(160)).toBe(257);
    expect(toKmh(100)).toBe(161);
    expect(toKmh(0.3)).toBe(0); // 0.48 rounds down
    expect(toKmh(0.4)).toBe(1); // 0.64 rounds up
    expect(toKmh(-5)).toBe(0);
    expect(toKmh(NaN)).toBe(0);
    expect(toKmh(undefined)).toBe(0);
  });

  it('formats in either unit, mph unchanged', () => {
    expect(formatSpeed(88, true)).toBe('142 KM/H');
    expect(formatSpeed(88, false)).toBe('88 MPH');
    expect(formatSpeed(187.6, false)).toBe('188 MPH');
    expect(formatSpeed(187.6, true)).toBe('302 KM/H');
    expect(formatSpeed(-3, false)).toBe('0 MPH');
  });

  it('a saved choice wins over the device language', () => {
    expect(unitsFor('mph', 'de-DE')).toBe('mph');
    expect(unitsFor('kmh', 'en-US')).toBe('kmh');
  });

  it('with no choice the language picks: en-US, en-GB and bare en stay mph, the rest km/h', () => {
    for (const l of ['en-US', 'en-GB', 'en', 'EN-us', 'en_GB', 'es-US', 'en-Latn-US', '', undefined, null]) expect(unitsFor(undefined, l)).toBe('mph');
    for (const l of ['fr-FR', 'de', 'de-DE', 'en-IN', 'en-NG', 'id-ID', 'pt-BR', 'en-CA', 'en-AU', 'ja-JP', 'zh-Hans-CN']) expect(unitsFor('', l)).toBe('kmh');
  });

  it('junk saved values read as unset', () => {
    expect(unitsFor('furlongs', 'fr-FR')).toBe('kmh');
    expect(unitsFor(42, 'en-US')).toBe('mph');
    expect(unitsFor(null, 'en-GB')).toBe('mph');
  });
});

/** A tiny DOM for unitsFrame: the HUD caption and the speed meter. */
function frameDoc() {
  const writes = { n: 0 };
  const cap = { t: 'MPH', get textContent() { return this.t; }, set textContent(v) { writes.n++; this.t = v; } };
  const attrs = {};
  const meter = { attrs, setAttribute(k, v) { writes.n++; attrs[k] = String(v); }, removeAttribute(k) { writes.n++; delete attrs[k]; } };
  const num = { t: '88', get textContent() { return this.t; }, set textContent(v) { writes.n++; this.t = v; } };
  return { writes, cap, meter, num, getElementById: (id) => (id === 'hudSpeed' ? num : null), querySelector: (s) => (s.includes('small') ? cap : s.includes('speed-meter') ? meter : null) };
}

describe('unitsFrame (0293)', () => {
  beforeEach(() => { SaveStore.data.settings = SaveStore.data.settings || {}; });

  it('sets GameState.kmh, the caption and the spoken value, change-only, and back', () => {
    const doc = frameDoc();
    SaveStore.data.settings.units = 'mph';
    GameState.speed = 88;
    unitsFrame(doc); // the first frame: the HUD already wrote the number, only the caption is set
    expect(doc.num.textContent).toBe('88');
    SaveStore.data.settings.units = 'kmh';
    unitsFrame(doc);
    expect(GameState.kmh).toBe(true);
    expect(doc.cap.textContent).toBe('KM/H');
    expect(doc.meter.attrs['aria-valuetext']).toBe('142 km/h');
    expect(doc.num.textContent).toBe('142'); // a flip repaints the number too (the HUD only repaints while racing)
    const n = doc.writes.n;
    unitsFrame(doc);
    expect(doc.writes.n).toBe(n); // nothing changed: nothing written
    GameState.speed = 100;
    unitsFrame(doc);
    expect(doc.meter.attrs['aria-valuetext']).toBe('161 km/h');
    SaveStore.data.settings.units = 'mph';
    unitsFrame(doc);
    expect(GameState.kmh).toBe(false);
    expect(doc.cap.textContent).toBe('MPH');
    expect(doc.num.textContent).toBe('100');
    expect(doc.meter.attrs['aria-valuetext']).toBeUndefined(); // mph: aria-valuenow (mph) speaks
    delete SaveStore.data.settings.units;
    GameState.speed = 0;
  });
});

describe('race HUD in km/h (0293)', () => {
  function hudDoc() {
    const nodes = new Map();
    const node = () => {
      const attrs = {};
      return {
        _t: '', get textContent() { return this._t; }, set textContent(v) { this._t = String(v); }, dataset: {}, style: { setProperty() {} }, children: [], className: '',
        parentNode: { attrs, setAttribute(k, v) { attrs[k] = String(v); } },
        classList: { toggle() {}, contains: () => false }, appendChild() {},
      };
    };
    return { getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement: node };
  }
  const view = (over) => ({
    position: 1, total: 2, progress: 100, length: 6500, raceTime: 1, timeLeft: 30, clockUrgent: false, infinite: false,
    flux: 0, hpFrac: 1, score: 0, field: [{ id: 'YOU', short: 'YOU', progress: 100, isPlayer: true }], ...over,
  });

  it('shows km/h in the number while the bar, its value and the 88 mark stay mph', () => {
    const doc = hudDoc();
    const hud = createHud(doc);
    hud.update(view({ mph: 88, spd: 142 })); // race-flow passes spd = toKmh(speed) in KM/H
    expect(doc.getElementById('hudSpeed').textContent).toBe('142');
    expect(doc.getElementById('hudSpeedBar').parentNode.attrs['aria-valuenow']).toBe('88');
    expect(doc.getElementById('hudSpeedBar').style.width).toBe('55%');
    hud.update(view({ mph: 160, spd: toKmh(160) }));
    expect(doc.getElementById('hudSpeed').textContent).toBe('257');
    hud.update(view({ mph: 160, spd: 160 }));
    expect(doc.getElementById('hudSpeed').textContent).toBe('160');
    hud.update(view({ mph: 88.4, spd: 88 }));
    expect(doc.getElementById('hudSpeed').textContent).toBe('88');
  });
});
