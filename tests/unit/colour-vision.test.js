// Colour-vision cue audit (ticket 0295), pure: the in-world marks that decide a run must not
// rest on hue. Machado et al. (2009) severity-1.0 matrices (tests/e2e/cvd.js, the same ones the
// 0198 pixel audit uses) for protanopia, deuteranopia and tritanopia, plus greyscale.
//
// Rule for every pair that a player must tell apart: they differ by shape, or their signal
// colours keep a simulated luminance contrast >= 3:1 under every simulation.
//   - pickup vs pickup (different effects): each kind has its own silhouette (ART.shape)
//   - pickup vs hazard: every pickup floats in a white ring (paintIcon); no hazard may draw a
//     clean ring of its own unless it keeps 3:1 against that white in every simulation
//   - hazard vs hazard with a different answer (steer / jump / slide / knock aside)
// Every pickup and hazard kind must be listed here, so a new kind fails until it has a cue.
// The 2D art is recorded through a fake canvas context (paintIcon, the era props), so the test
// reads what is really drawn; the road hazards' colours are checked against src/render/sprites.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SIMS, simLum } from '../e2e/cvd.js';
import { PICKUPS } from '../../src/pickups.js';
import { ART, paintIcon } from '../../src/pickup-art.js';
import { MATERIALS } from '../../src/materials.js';
import { ERA_HAZARDS } from '../../src/era-hazards.js';
import { drawEraProp } from '../../src/scenes/era-props.js';

const MIN = 3;

const rgb = (c) => {
  const s = String(c).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) return m[1].split(',').slice(0, 3).map((v) => Math.round(+v));
  return null;
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** Lowest simulated luminance contrast between two colours over every simulation. */
export function worstContrast(a, b) {
  const A = rgb(a), B = rgb(b);
  let worst = Infinity;
  for (const k in SIMS) worst = Math.min(worst, ratio(simLum(...A, SIMS[k]), simLum(...B, SIMS[k])));
  return worst;
}

/** A canvas context that records what is painted: fills, strokes and every closed ring (a full
 *  circle arc that gets stroked). Gradients record their colour stops. */
function recorder() {
  const out = { fills: [], strokes: [], rings: [] };
  let arcs = [];
  const grad = () => ({ addColorStop: (_o, c) => out.fills.push(c) });
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineJoin: '', lineCap: '',
    beginPath() { arcs = []; },
    arc(x, y, r, a0, a1) { if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6) arcs.push(r); },
    ellipse() {}, arcTo() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {}, rect() {},
    fill() { if (typeof ctx.fillStyle === 'string') out.fills.push(ctx.fillStyle); },
    stroke() {
      if (typeof ctx.strokeStyle === 'string') out.strokes.push(ctx.strokeStyle);
      for (const r of arcs) out.rings.push({ r, color: ctx.strokeStyle });
    },
    fillRect() { if (typeof ctx.fillStyle === 'string') out.fills.push(ctx.fillStyle); },
    strokeRect() { if (typeof ctx.strokeStyle === 'string') out.strokes.push(ctx.strokeStyle); },
    fillText() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    createLinearGradient: grad, createRadialGradient: grad,
  };
  return { ctx, out };
}

// The road hazards drawn by src/render/sprites.js: what the player does about each, its 2D
// silhouette and the signal colours of its branch (checked against the source below).
// FLUX_CRATE has no 2D art of its own: it is drawn as the barricade (the else branch).
const ROAD_HAZARDS = {
  TRAFFIC_CONE: { answer: 'knock', shape: 'cone', colors: ['#ff6a00', '#f8fafc'] },
  OIL_BARREL: { answer: 'knock', shape: 'barrel', colors: ['#1d4ed8', '#fbbf24'] },
  PINE_TREE_HAZARD: { answer: 'steer', shape: 'tree', colors: ['#064e3b'] },
  LOW_LASER_BAR: { answer: 'jump', shape: 'low-beam', colors: ['#ef4444', '#fde047'] },
  HIGH_LIGHT_GATE: { answer: 'slide', shape: 'gantry', colors: ['#334155', '#f59e0b'] },
  HOLO_BARRIER: { answer: 'steer', shape: 'barricade', colors: ['#f97316', '#facc15'] },
  FLUX_CRATE: { answer: 'steer', shape: 'barricade', colors: ['#f97316', '#facc15'] },
};
// Era signature props (0113): all knocked aside for a cone penalty, so they share one answer;
// their silhouettes still differ, and none may borrow the pickup ring.
const ERA_SHAPES = {
  SIDEWALK_SIGN: 'a-frame', SHOPPING_CART: 'cart', TUMBLEWEED: 'burr', DRONE_WRECK: 'drone',
  LIGHT_PYLON: 'pylon', MILK_CRATE: 'crates', ICE_SHARD: 'crystal',
};

function paintPickup(kind) {
  const { ctx, out } = recorder();
  paintIcon(ctx, kind, 40, 68);
  return out;
}
function paintEra(kind) {
  const { ctx, out } = recorder();
  expect(drawEraProp(ctx, kind, 40, 24)).toBe(true);
  return out;
}

const eraKinds = Object.values(ERA_HAZARDS).map((h) => h.kind);
const hazards = () => [
  ...Object.entries(ROAD_HAZARDS).map(([kind, h]) => ({ kind, ...h, rings: [] })),
  ...eraKinds.map((kind) => {
    const art = paintEra(kind);
    return { kind, answer: 'knock', shape: ERA_SHAPES[kind], colors: [...new Set([...art.fills, ...art.strokes])], rings: art.rings };
  }),
];

describe('colour-vision cues (0295)', () => {
  it('the contrast maths matches WCAG: white on black is 21:1, a colour on itself 1:1', () => {
    expect(ratio(simLum(255, 255, 255, null), simLum(0, 0, 0, null))).toBeCloseTo(21, 5);
    expect(worstContrast('#facc15', '#facc15')).toBeCloseTo(1, 5);
    // Red vs green collapses under deuteranopia: the case this audit exists for.
    expect(worstContrast('#ef4444', '#10b981')).toBeLessThan(MIN);
  });

  it('every pickup and hazard kind has a cue listed here (a new kind fails until it gets one)', () => {
    for (const kind of Object.keys(PICKUPS)) {
      expect(ART[kind], `pickup ${kind} has no art`).toBeTruthy();
      expect(ART[kind].shape, `pickup ${kind} has no silhouette`).toBeTruthy();
    }
    expect(Object.keys(ART).sort()).toEqual(Object.keys(PICKUPS).sort());
    expect(Object.keys(ROAD_HAZARDS).sort()).toEqual(Object.keys(MATERIALS).sort());
    expect(Object.keys(ERA_SHAPES).sort()).toEqual([...eraKinds].sort());
  });

  it('the road hazards listed here are the ones src/render/sprites.js draws, in these colours', () => {
    const src = readFileSync('src/render/sprites.js', 'utf8');
    const branches = src.split(/\n\s*\} else (?=if \(ob\.(?:type|knockable)|\{)/);
    const branchOf = (kind) => branches.find((b) => b.includes(`ob.type === '${kind}'`)) || branches[branches.length - 1];
    for (const [kind, h] of Object.entries(ROAD_HAZARDS)) {
      const b = branchOf(kind);
      for (const c of h.colors) expect(b, `${kind} is not drawn in ${c}`).toContain(`'${c}'`);
    }
    // The barricade (else branch) is what HOLO_BARRIER and FLUX_CRATE fall through to.
    expect(branchOf('HOLO_BARRIER')).toBe(branches[branches.length - 1]);
    expect(src).not.toContain("ob.type === 'FLUX_CRATE'");
  });

  it('every pickup floats in the white ring; it is the one cue all pickups share', () => {
    for (const kind of Object.keys(PICKUPS)) {
      const art = paintPickup(kind);
      const white = art.rings.filter((r) => /^#fff(fff)?$/i.test(r.color));
      expect(white.length, `${kind} has no white ring`).toBeGreaterThan(0);
    }
  });

  it('pickup vs pickup: each kind has its own silhouette, or 3:1 in every simulation', () => {
    const kinds = Object.keys(PICKUPS);
    const fails = [];
    for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
      const a = ART[kinds[i]], b = ART[kinds[j]];
      if (a.shape !== b.shape) continue;
      const c = worstContrast(a.body, b.body);
      if (c < MIN) fails.push(`${kinds[i]}/${kinds[j]} ${c.toFixed(2)}`);
    }
    expect(fails).toEqual([]);
  });

  it('pickup vs hazard: no hazard draws a clean ring of its own that loses 3:1 to the pickup ring', () => {
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
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.answer === b.answer || a.shape !== b.shape) continue;
      let best = 0;
      for (const ca of a.colors) for (const cb of b.colors) best = Math.max(best, worstContrast(ca, cb));
      if (best < MIN) fails.push(`${a.kind}/${b.kind}`);
    }
    expect(fails).toEqual([]);
    // Shapes within one answer may repeat only for kinds that really share their art.
    const byShape = {};
    for (const h of list) (byShape[h.shape] ||= []).push(h.kind);
    for (const [shape, kinds] of Object.entries(byShape)) {
      if (kinds.length > 1) expect(`${shape}: ${kinds.join(',')}`).toBe('barricade: HOLO_BARRIER,FLUX_CRATE');
    }
  });

  it('every era prop draws in colours this audit can read', () => {
    for (const kind of eraKinds) {
      const art = paintEra(kind);
      expect(art.fills.length + art.strokes.length, kind).toBeGreaterThan(0);
      for (const c of [...art.fills, ...art.strokes]) expect(rgb(c), `${kind}: ${c}`).not.toBeNull();
    }
  });
});
