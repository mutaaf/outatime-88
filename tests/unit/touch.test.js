// Touch controls (ticket 0061): stick math, D-pad, slide-between-buttons, presets, settings.
import { describe, it, expect } from 'vitest';
import { stickVector, followThumb, clampToRing, dpadDirection, dpadAxes, smoothSteer } from '../../src/touch/stick.js';
import { hitButton, slideTransition } from '../../src/touch/buttons.js';
import {
  presetLayout, layoutProblems, applyCustom, toCustomItem, layoutKey, deviceClass, PRESET_IDS, SHORTCUT_IDS, ACTION_IDS,
} from '../../src/touch/layouts.js';
import { normalizeControls, movementFor, CONTROL_DEFAULTS } from '../../src/touch/settings.js';

const v = () => ({ x: 0, y: 0, mag: 0 });

describe('stickVector', () => {
  it('is zero inside the radial dead zone', () => {
    expect(stickVector(5, 5, 50, 0.2, 1, v()).mag).toBe(0);
    expect(stickVector(0, 0, 50, 0.1, 1, v())).toMatchObject({ x: 0, y: 0, mag: 0 });
  });
  it('rescales past the dead zone with no jump, and reaches 1 at the rim', () => {
    const just = stickVector(10.5, 0, 50, 0.2, 1, v());
    expect(just.x).toBeGreaterThan(0);
    expect(just.x).toBeLessThan(0.02);
    expect(stickVector(50, 0, 50, 0.2, 1.5, v()).x).toBeCloseTo(1, 6);
    expect(stickVector(500, 0, 50, 0.2, 1.5, v()).x).toBeCloseTo(1, 6); // clamped past the rim
  });
  it('is symmetric left/right and up/down', () => {
    const r = stickVector(30, -12, 50, 0.12, 1.5, v());
    const l = stickVector(-30, 12, 50, 0.12, 1.5, v());
    expect(l.x).toBeCloseTo(-r.x, 9);
    expect(l.y).toBeCloseTo(-r.y, 9);
  });
  it('the curve gives finer control near centre without changing full deflection', () => {
    const lin = stickVector(25, 0, 50, 0, 1, v()).x;
    const curved = stickVector(25, 0, 50, 0, 2, v()).x;
    expect(lin).toBeCloseTo(0.5, 6);
    expect(curved).toBeCloseTo(0.25, 6);
  });
  it('keeps direction in diagonals (no axis snapping)', () => {
    const d = stickVector(40, 40, 50, 0.1, 1, v());
    expect(d.x).toBeCloseTo(d.y, 9);
  });
});

describe('followThumb (dynamic recentering)', () => {
  it('does nothing inside the ring', () => {
    const o = { x: 100, y: 100 };
    expect(followThumb(o, 130, 100, 50)).toBe(false);
    expect(o).toEqual({ x: 100, y: 100 });
  });
  it('drags the ring behind a thumb that runs past it, keeping it exactly one radius away', () => {
    const o = { x: 100, y: 100 };
    expect(followThumb(o, 200, 100, 50)).toBe(true);
    expect(o.x).toBeCloseTo(150, 6);
    expect(Math.hypot(200 - o.x, 100 - o.y)).toBeCloseTo(50, 6);
  });
  it('clampToRing keeps the knob on the rim', () => {
    const p = clampToRing({ x: 0, y: 100 }, 0, 0, 40);
    expect(p).toEqual({ x: 0, y: 40 });
  });
});

describe('8-way D-pad', () => {
  const ax = (dir) => dpadAxes(dir, { x: 0, y: 0 });
  it('quantises angles to 8 directions and returns 0 in the middle', () => {
    expect(dpadDirection(2, 1, 10)).toBe(0);
    expect(ax(dpadDirection(50, 0, 10))).toEqual({ x: 1, y: 0 });
    expect(ax(dpadDirection(-50, 0, 10))).toEqual({ x: -1, y: 0 });
    expect(ax(dpadDirection(0, -50, 10))).toEqual({ x: 0, y: -1 });
    expect(ax(dpadDirection(0, 50, 10))).toEqual({ x: 0, y: 1 });
    expect(ax(dpadDirection(40, -40, 10))).toEqual({ x: 1, y: -1 });
    expect(ax(dpadDirection(-40, 40, 10))).toEqual({ x: -1, y: 1 });
  });
  it('sector edges are 22.5° either side of each direction', () => {
    const at = (deg) => dpadDirection(Math.cos((deg * Math.PI) / 180) * 50, Math.sin((deg * Math.PI) / 180) * 50, 5);
    expect(ax(at(22))).toEqual({ x: 1, y: 0 });
    expect(ax(at(23))).toEqual({ x: 1, y: 1 });
    expect(ax(at(-22))).toEqual({ x: 1, y: 0 });
    expect(ax(at(-23))).toEqual({ x: 1, y: -1 });
    expect(ax(at(179))).toEqual({ x: -1, y: 0 });
  });
});

describe('smoothSteer', () => {
  it('approaches the target at the rise rate and never overshoots', () => {
    let s = 0;
    s = smoothSteer(s, 1, 0.05, 10, 20);
    expect(s).toBeCloseTo(0.5, 6);
    s = smoothSteer(s, 1, 0.5, 10, 20);
    expect(s).toBe(1);
  });
  it('returns to centre faster than it turns in', () => {
    expect(smoothSteer(1, 0, 0.02, 10, 20)).toBeCloseTo(0.6, 6);
    expect(smoothSteer(0, 1, 0.02, 10, 20)).toBeCloseTo(0.2, 6);
  });
  it('is frame-rate independent', () => {
    let a = 0; for (let i = 0; i < 6; i++) a = smoothSteer(a, 1, 1 / 60);
    let b = 0; for (let i = 0; i < 3; i++) b = smoothSteer(b, 1, 1 / 30);
    expect(a).toBeCloseTo(b, 9);
  });
});

describe('buttons', () => {
  const btns = [
    { id: 'boost', cx: 300, cy: 700, r: 45, enabled: true },
    { id: 'jump', cx: 230, cy: 640, r: 30, enabled: true },
    { id: 'pause', cx: 40, cy: 400, r: 24, enabled: true },
    { id: 'off', cx: 300, cy: 700, r: 80, enabled: false },
  ];
  it('hit-tests the nearest enabled button, with slop', () => {
    expect(hitButton(btns, 300, 700).id).toBe('boost');
    expect(hitButton(btns, 230, 672, 0)).toBe(null);
    expect(hitButton(btns, 230, 672, 4).id).toBe('jump');
    expect(hitButton(btns, 10, 10, 6)).toBe(null);
  });
  const slidable = (id) => id !== 'pause';
  it('sliding from one action onto another releases the first and presses the second', () => {
    expect(slideTransition('jump', btns[0], slidable)).toEqual({ release: 'jump', press: 'boost' });
  });
  it('staying on the same button, or rolling off every button, changes nothing', () => {
    expect(slideTransition('boost', btns[0], slidable)).toEqual({ release: null, press: null });
    expect(slideTransition('boost', null, slidable)).toEqual({ release: null, press: null });
  });
  it('shortcuts never take part in a slide', () => {
    expect(slideTransition('boost', btns[2], slidable)).toEqual({ release: null, press: null });
    expect(slideTransition('pause', btns[0], slidable)).toEqual({ release: null, press: null });
  });
});

// HUD and message-lane boxes measured from the real page (tests/e2e layout spec viewports).
const MEASURED = {
  '390x844': [78, 12, 378, 232], '360x640': [78, 12, 348, 220], '430x932': [66, 12, 418, 220],
  '844x390': [70, 122, 722, 212], '640x360': [70, 20, 620, 212], '667x375': [70, 34, 633, 212], '932x430': [70, 166, 766, 212],
  '768x1024': [70, 84, 684, 212], '1024x768': [182, 102, 922, 328], '820x1180': [70, 110, 710, 212],
  '1180x820': [182, 180, 1000, 328], '1024x1366': [182, 102, 922, 328], '1366x1024': [182, 273, 1093, 328],
  '800x1280': [70, 100, 700, 212], '1280x800': [182, 230, 1050, 328], '1280x720': [182, 230, 1050, 328],
};
const NOTCHED = new Set(['390x844', '430x932', '844x390', '932x430']);
function envs() {
  const out = [];
  for (const [k, [hb, x0, x1, y1]] of Object.entries(MEASURED)) {
    const [vw, vh] = k.split('x').map(Number);
    const safes = [{ t: 0, r: 0, b: 0, l: 0 }];
    if (NOTCHED.has(k)) safes.push(vw > vh ? { t: 0, r: 47, b: 21, l: 47 } : { t: 47, r: 0, b: 34, l: 0 });
    for (const safe of safes) {
      for (const autoAccel of [true, false]) {
        for (const size of [0.8, 1, 1.3]) out.push({ name: `${k} safe${safe.l || safe.t} accel:${!autoAccel} size:${size}`, env: { vw, vh, safe, top: hb + 4, lane: { x0: x0 - 4, x1: x1 + 4, y1: y1 + 4 }, autoAccel, size } });
      }
    }
  }
  return out;
}

describe('presets', () => {
  it('every preset fits every screen: on screen, clear of the HUD, ≥44 px, no overlaps, every shortcut placed', () => {
    const failures = [];
    for (const { name, env } of envs()) {
      for (const p of PRESET_IDS) {
        const L = presetLayout(p, env);
        const probs = layoutProblems(L, env);
        for (const id of [...SHORTCUT_IDS, 'boost', 'drift', 'jump', 'special', 'stick']) if (!L[id] || L[id].hidden) probs.push(`${id} missing`);
        if (!env.autoAccel && L.accel.hidden) probs.push('accel missing');
        if (probs.length) failures.push(`${p} @ ${name}: ${probs.join('; ')}`);
      }
    }
    expect(failures).toEqual([]);
  });
  it('the gas pedal only shows when auto-accelerate is off', () => {
    const base = { vw: 390, vh: 844, safe: { t: 0, r: 0, b: 0, l: 0 }, top: 82, lane: null };
    expect(presetLayout('default', { ...base, autoAccel: true }).accel.hidden).toBe(true);
    expect(presetLayout('default', { ...base, autoAccel: false }).accel.hidden).toBe(false);
  });
  it('left-handed mirrors the default: buttons left, stick right', () => {
    const env = { vw: 844, vh: 390, safe: { t: 0, r: 0, b: 0, l: 0 }, top: 74, lane: { x0: 118, x1: 726, y1: 216 }, autoAccel: true };
    const d = presetLayout('default', env);
    const l = presetLayout('lefty', env);
    expect(d.boost.x).toBeGreaterThan(env.vw / 2);
    expect(d.stick.x).toBeLessThan(env.vw / 2);
    expect(l.boost.x).toBeLessThan(env.vw / 2);
    expect(l.stick.x).toBeGreaterThan(env.vw / 2);
  });
  it('the Roblox preset has the biggest primary button; tablets get bigger controls than phones', () => {
    const phone = { vw: 390, vh: 844, safe: { t: 0, r: 0, b: 0, l: 0 }, top: 82, lane: null, autoAccel: true };
    const tab = { vw: 820, vh: 1180, safe: { t: 0, r: 0, b: 0, l: 0 }, top: 74, lane: null, autoAccel: true };
    expect(presetLayout('roblox', phone).boost.d).toBeGreaterThan(presetLayout('default', phone).boost.d);
    expect(presetLayout('default', tab).boost.d).toBeGreaterThan(presetLayout('default', phone).boost.d);
  });
  it('device class and storage key follow size and orientation', () => {
    expect(deviceClass(390, 844)).toBe('phone');
    expect(deviceClass(1024, 768)).toBe('tablet');
    expect(layoutKey(844, 390)).toBe('phone-landscape');
    expect(layoutKey(820, 1180)).toBe('tablet-portrait');
  });
});

describe('custom layouts (editor round trip)', () => {
  const env = { vw: 390, vh: 844, safe: { t: 0, r: 0, b: 0, l: 0 }, top: 82, lane: null, autoAccel: true };
  it('saving and re-applying an edited layout reproduces it', () => {
    const base = presetLayout('default', env);
    const edited = { ...base, jump: { ...base.jump, x: 120, y: 500, d: Math.round(base.jump.d * 1.2), opacity: 0.5 } };
    const custom = { items: {} };
    for (const id of Object.keys(edited)) custom.items[id] = toCustomItem(base[id], edited[id], env);
    const again = applyCustom(base, custom, env);
    expect(again.jump.x).toBeCloseTo(120, 0);
    expect(again.jump.y).toBeCloseTo(500, 0);
    expect(again.jump.d).toBe(edited.jump.d);
    expect(again.jump.opacity).toBe(0.5);
  });
  it('garbage in a saved layout is clamped, never trusted', () => {
    const base = presetLayout('default', env);
    const again = applyCustom(base, { items: { boost: { fx: 9, fy: 'x', s: 0.01, o: -3 } } }, env);
    expect(again.boost.x).toBe(env.vw);
    expect(again.boost.y).toBe(base.boost.y);
    expect(again.boost.d).toBeGreaterThanOrEqual(44);
    expect(again.boost.opacity).toBe(0.2);
  });
  it('the auto-accelerate state of the gas pedal is not baked into a saved layout', () => {
    const base = presetLayout('default', env);
    expect(toCustomItem(base.accel, base.accel, env).h).toBe(0);
  });
});

describe('control settings', () => {
  it('defaults are sane and an old save without controls gets them', () => {
    const c = normalizeControls(undefined);
    expect(c).toMatchObject({ preset: 'default', autoAccel: true, coachSeen: false });
    expect(movementFor(c)).toBe('dynamic');
  });
  it('repairs out-of-range and unknown values', () => {
    const c = normalizeControls({ preset: 'nope', movement: 'warp', sensitivity: 9, deadZone: 'x', layouts: [], special: 'LASER' });
    expect(c.preset).toBe('default');
    expect(c.movement).toBe('');
    expect(c.sensitivity).toBe(1.5);
    expect(c.deadZone).toBe(CONTROL_DEFAULTS.deadZone);
    expect(c.layouts).toEqual({});
    expect(c.special).toBe('ROAR');
  });
  it('the player override wins over the preset movement', () => {
    expect(movementFor(normalizeControls({ preset: 'fortnite' }))).toBe('floating');
    expect(movementFor(normalizeControls({ preset: 'fortnite', movement: 'dpad' }))).toBe('dpad');
  });
  it('every action id has a layout slot in every preset', () => {
    const env = { vw: 390, vh: 844, safe: { t: 0, r: 0, b: 0, l: 0 }, top: 82, lane: null, autoAccel: false };
    for (const p of PRESET_IDS) for (const id of ACTION_IDS) expect(presetLayout(p, env)[id], `${p}.${id}`).toBeTruthy();
  });
});
