// Colour-vision cue audit (ticket 0295), pure: the in-world marks that decide a run must not
// rest on hue. Machado et al. (2009) severity-1.0 matrices (tests/e2e/cvd.js, the same ones the
// 0198 pixel audit uses) for protanopia, deuteranopia and tritanopia, plus greyscale.
//
// Rule for every pair that a player must tell apart: they differ by silhouette, or their signal
// colours keep a simulated luminance contrast >= 3:1 under every simulation.
//   - pickup vs pickup (different effects)
//   - pickup vs hazard: every pickup floats in a white ring (paintIcon); no hazard may draw a
//     ring of its own that loses 3:1 to that white in any simulation
//   - hazard vs hazard with a different answer (steer / jump / slide / knock aside)
// Silhouettes and colours are not typed in here: the real 2D draw code runs against a recording
// canvas context (paintIcon, the era props, and the obstacle chain of src/render/sprites.js run
// as-is), and a silhouette is the recorded geometry. Every pickup, road hazard and era prop kind
// must have an answer listed below, so a new kind fails until it is audited.
// 2D only: the 3D view (opt-in, src/render3d) draws era props as plain blocks and is not covered.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SIMS, simLum, contrast, worstContrast, parseColor } from '../e2e/cvd.js';
import { PICKUPS } from '../../src/pickups.js';
import { ART, paintIcon } from '../../src/pickup-art.js';
import { MATERIALS } from '../../src/materials.js';
import { ERA_HAZARDS } from '../../src/era-hazards.js';
import { drawEraProp } from '../../src/scenes/era-props.js';

const MIN = 3;
const OW = 40, OH = 24; // a mid-distance sprite (sprites.js: oh = max(7, ow·0.58))

/** A canvas context that records what is painted: colours, an op trace (the silhouette: op names
 *  and coordinates in units of the sprite's size) and every ring. A ring is a closed round outline
 *  that gets stroked: a full arc, a full ellipse no flatter than 0.6 (a flat oval on the ground is a
 *  shadow, not a ring), or a closed polyline of 8+ points within 15% of one radius. */
function recorder(unit) {
  const out = { colors: [], trace: [], rings: [] };
  let shapes = [], pts = null;
  const q = (v) => Math.round((v / unit) * 100) / 100;
  const t = (op, ...a) => out.trace.push(op + '(' + a.map(q).join(',') + ')');
  const endSub = (closed) => {
    if (closed && pts && pts.length >= 8) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const rs = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
      const hi = Math.max(...rs), lo = Math.min(...rs);
      if (hi > 0 && (hi - lo) / hi < 0.15) shapes.push(hi);
    }
    pts = null;
  };
  const grad = () => ({ addColorStop: (_o, c) => out.colors.push(c) });
  const paint = (style) => { if (typeof style === 'string') out.colors.push(style); };
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineJoin: '', lineCap: '', globalAlpha: 1,
    beginPath() { shapes = []; pts = null; t('begin'); },
    arc(x, y, r, a0, a1) { t('arc', x, y, r, a0 * unit, a1 * unit); if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6) shapes.push(r); },
    ellipse(x, y, rx, ry, rot, a0, a1) {
      t('ellipse', x, y, rx, ry);
      if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6 && Math.min(rx, ry) / Math.max(rx, ry) >= 0.6) shapes.push(Math.max(rx, ry));
    },
    moveTo(x, y) { endSub(false); pts = [[x, y]]; t('move', x, y); },
    lineTo(x, y) { (pts ||= []).push([x, y]); t('line', x, y); },
    closePath() { t('close'); endSub(true); },
    arcTo(...a) { t('arcTo', ...a); }, quadraticCurveTo(...a) { t('quad', ...a); }, bezierCurveTo(...a) { t('bez', ...a); },
    rect(...a) { t('rect', ...a); },
    fill() { paint(ctx.fillStyle); t('fill'); },
    stroke() {
      paint(ctx.strokeStyle); t('stroke');
      for (const r of shapes) out.rings.push({ r, color: ctx.strokeStyle });
    },
    fillRect(...a) { paint(ctx.fillStyle); t('fillRect', ...a); },
    strokeRect(...a) { paint(ctx.strokeStyle); t('strokeRect', ...a); },
    fillText(s) { out.trace.push('text(' + s + ')'); }, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    createLinearGradient: grad, createRadialGradient: grad,
  };
  return { ctx, out };
}
const shapeOf = (out) => out.trace.join(' ');

// The obstacle chain of src/render/sprites.js (from the cone branch to the ctx.restore() that
// closes it), run as written against the recorder. drawHazardArt (the era's tree art, lazy) is
// absent, so the tree draws its own fallback; drawEraProp is the real era-prop painter.
const SPRITES = readFileSync('src/render/sprites.js', 'utf8');
const chainStart = SPRITES.indexOf("if (ob.type === 'TRAFFIC_CONE')");
const chainEnd = SPRITES.indexOf('ctx.restore();', chainStart);
const CHAIN = SPRITES.slice(chainStart, chainEnd);
const runChain = new Function('ctx', 'ob', 'ow', 'oh', 'roadW', 'rw', 'rh', 'drawEraProp', 'drawHazardArt', CHAIN);
const ROAD_TYPES = [...CHAIN.matchAll(/ob\.type === '([A-Z_]+)'/g)].map((m) => m[1]);

function paintRoad(type) {
  const { ctx, out } = recorder(OW);
  runChain(ctx, { type, knockable: !!(MATERIALS[type] || {}).knockable }, OW, OH, 400, 1280, 720, drawEraProp, () => false);
  return out;
}
function paintEra(kind) {
  const { ctx, out } = recorder(OW);
  expect(drawEraProp(ctx, kind, OW, OH)).toBe(true);
  return out;
}
function paintPickup(kind) {
  const { ctx, out } = recorder(40);
  paintIcon(ctx, kind, 40, 68);
  return out;
}

// What the player does about each hazard (gameplay meaning, not looks). Era props are all
// knocked aside for a cone penalty (src/era-hazards.js).
const ROAD_ANSWERS = {
  TRAFFIC_CONE: 'knock', OIL_BARREL: 'knock', PINE_TREE_HAZARD: 'steer', LOW_LASER_BAR: 'jump',
  HIGH_LIGHT_GATE: 'slide', HOLO_BARRIER: 'steer', FLUX_CRATE: 'steer',
};
const eraKinds = Object.values(ERA_HAZARDS).map((h) => h.kind);
const hazards = () => [
  ...Object.keys(ROAD_ANSWERS).map((kind) => ({ kind, answer: ROAD_ANSWERS[kind], ...paintRoad(kind) })),
  ...eraKinds.map((kind) => ({ kind, answer: 'knock', ...paintEra(kind) })),
];

describe('colour-vision cues (0295)', () => {
  it('the maths: white on black is 21:1, and a pair that passes for normal vision can fail under a simulation', () => {
    expect(contrast(simLum(255, 255, 255, null), simLum(0, 0, 0, null))).toBeCloseTo(21, 5);
    // Red vs green: 3.74:1 for normal vision, 2.85:1 for a deuteranope.
    expect(contrast(simLum(224, 0, 0, null), simLum(64, 255, 64, null))).toBeGreaterThan(MIN);
    expect(contrast(simLum(224, 0, 0, SIMS.deuteranopia), simLum(64, 255, 64, SIMS.deuteranopia))).toBeLessThan(MIN);
    expect(worstContrast('#e00000', '#40ff40')).toBeLessThan(MIN);
  });

  it('the recorder finds rings however they are drawn, and not a burr or a flat ground oval', () => {
    const rings = (draw) => { const { ctx, out } = recorder(1); draw(ctx); return out.rings.length; };
    expect(rings((c) => { c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.stroke(); })).toBe(1);
    expect(rings((c) => { c.beginPath(); c.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2); c.stroke(); })).toBe(1);
    expect(rings((c) => { c.beginPath(); for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; c[k ? 'lineTo' : 'moveTo'](Math.cos(a) * 10, Math.sin(a) * 10); } c.closePath(); c.stroke(); })).toBe(1);
    expect(rings((c) => { c.beginPath(); for (let k = 0; k < 14; k++) { const a = k * Math.PI / 7, r = k & 1 ? 6.8 : 10; c[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.stroke(); })).toBe(0);
    expect(rings((c) => { c.beginPath(); c.ellipse(0, 0, 30, 9, 0, 0, Math.PI * 2); c.stroke(); })).toBe(0);
    expect(rings((c) => { c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.fill(); })).toBe(0); // a filled disc
  });

  it('every pickup and hazard kind is audited (a new kind fails until it gets an answer here)', () => {
    expect(Object.keys(ART).sort()).toEqual(Object.keys(PICKUPS).sort());
    const road = new Set([...Object.keys(MATERIALS), ...ROAD_TYPES]);
    expect(Object.keys(ROAD_ANSWERS).sort()).toEqual([...road].sort());
    expect(chainStart).toBeGreaterThan(0);
    for (const kind of eraKinds) expect(Object.keys(ROAD_ANSWERS)).not.toContain(kind);
  });

  it('every pickup floats in the white ring', () => {
    for (const kind of Object.keys(PICKUPS)) {
      const white = paintPickup(kind).rings.filter((r) => /^#fff(fff)?$/i.test(r.color));
      expect(white.length, `${kind} has no white ring`).toBeGreaterThan(0);
    }
  });

  it('pickup vs pickup: each kind has its own silhouette, or 3:1 in every simulation', () => {
    const kinds = Object.keys(PICKUPS);
    const fails = [];
    for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
      const a = paintPickup(kinds[i]), b = paintPickup(kinds[j]);
      if (shapeOf(a) !== shapeOf(b)) continue;
      const c = worstContrast(ART[kinds[i]].body, ART[kinds[j]].body);
      if (c < MIN) fails.push(`${kinds[i]}/${kinds[j]} ${c.toFixed(2)}`);
    }
    expect(fails).toEqual([]);
  });

  it('pickup vs hazard: no hazard draws a ring of its own that loses 3:1 to the pickup ring', () => {
    const fails = [];
    for (const h of hazards()) for (const ring of h.rings) {
      const c = worstContrast('#ffffff', ring.color);
      if (c < MIN) fails.push(`${h.kind} ring ${ring.color} ${c.toFixed(2)}`);
    }
    expect(fails).toEqual([]);
  });

  it('hazard vs hazard: a different answer means a different silhouette, or 3:1 in every simulation', () => {
    const list = hazards();
    const fails = [];
    const same = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (shapeOf(a) !== shapeOf(b)) continue;
      same.push(`${a.kind}=${b.kind}`);
      if (a.answer === b.answer) continue;
      // Same art, different answer: every colour pair must still hold 3:1.
      let worst = Infinity;
      for (const ca of a.colors) for (const cb of b.colors) worst = Math.min(worst, worstContrast(ca, cb));
      if (worst < MIN) fails.push(`${a.kind}/${b.kind}`);
    }
    expect(fails).toEqual([]);
    // FLUX_CRATE has no 2D art of its own: it draws as the barricade, and means the same thing.
    expect(same).toEqual(['HOLO_BARRIER=FLUX_CRATE']);
  });

  it('every colour the 2D art paints is one this audit can read', () => {
    for (const h of hazards()) {
      expect(h.colors.length, h.kind).toBeGreaterThan(0);
      for (const c of h.colors) expect(parseColor(c), `${h.kind}: ${c}`).not.toBeNull();
    }
  });
});
