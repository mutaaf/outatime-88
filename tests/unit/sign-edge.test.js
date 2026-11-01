// Ticket 0237: a sign baked into a backdrop layer is never cut by the screen edge. Layers pan
// with steering and curves; every frame, a sign near or across an edge is covered by a clean
// patch of the layer under it (fully once it touches the edge), and a sign well inside the view
// is left exactly as painted. Built on a fake canvas, swept over every pan offset.
import { describe, it, expect, beforeAll } from 'vitest';
import { edgeAlpha, fadeEdgeSigns, SIGN_SQUEEZE } from '../../src/scenes/kit.js';

const GLYPH = 0.6; // Courier New: a glyph is 0.6 em wide
const pxOf = (font) => parseFloat(/(\d+(\.\d+)?)px/.exec(font)[1]);

function fakeCanvas() {
  const c = { width: 1, height: 1, texts: [], draws: [] };
  const state = { font: '10px x', textAlign: 'start', globalAlpha: 1, canvas: c };
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'fillText') {
        return (s, x, y, maxWidth) => {
          const px = pxOf(t.font);
          const w = Math.min([...s].length * GLYPH * px, maxWidth ?? Infinity);
          const left = t.textAlign === 'center' ? x - w / 2 : x;
          c.texts.push({ text: s, x0: left, x1: left + w, y0: y - px * 0.6, y1: y + px * 0.6 });
        };
      }
      if (k === 'drawImage') return (img, ...a) => c.draws.push({ img, a, alpha: t.globalAlpha });
      if (k === 'measureText') return (s) => ({ width: [...s].length * GLYPH * pxOf(t.font) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  c.getContext = () => ctx;
  return c;
}

beforeAll(() => { globalThis.document = { createElement: fakeCanvas }; });

const ERAS = ['s1885', 's1955', 's1985', 's2015', 's2026', 's2061', 's2088'];
const VIEWS = [[390, 844], [1280, 720], [844, 390]];

async function build(id, rw, rh, scale = 1) {
  const scene = (await import(`../../src/scenes/${id}.js`)).default;
  const hz0 = Math.round(rh * 0.46);
  const k = Math.min(1, 1100 / Math.max(rw, rh * 0.9)) * scale;
  const out = scene.build({ rw, rh, hz0, k, W: Math.ceil(Math.max(rw * 1.5, hz0 * 2.9) * k), pad: Math.round(rh * 0.3) });
  return { ...out, k };
}

describe('backdrop signs at the screen edge (0237)', () => {
  it('edgeAlpha: whole well inside, easing to 0 at either edge', () => {
    expect(edgeAlpha(100, 50, 390)).toBe(1);
    expect(edgeAlpha(0, 50, 390)).toBe(0);
    expect(edgeAlpha(-20, 50, 390)).toBe(0);
    expect(edgeAlpha(390 - 50, 50, 390)).toBe(0);
    expect(edgeAlpha(370, 50, 390)).toBe(0);
    const a = edgeAlpha(8, 50, 390); // band = max(8, 0.04 * 390 = 15.6)
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(edgeAlpha(16, 50, 390)).toBe(1);
  });

  it('every sign painted on a layer is recorded, and its box and patch hold all of its text', async () => {
    let n = 0;
    for (const [rw, rh] of VIEWS) {
      for (const id of ERAS) {
        const B = await build(id, rw, rh);
        for (const L of B.layers) {
          const c = L.c;
          for (const t of c.texts) {
            if (t.x1 <= 0 || t.x0 >= c.width) continue; // a wrapped twin painted off the canvas
            const r = c.signs.find((s) => s.text === t.text && s.x <= t.x0 && s.x + s.w >= t.x1);
            expect(r, `${id} "${t.text}" at ${rw}x${rh}: recorded`).toBeTruthy();
            // the patch covers the on-canvas part of the text
            expect(r.px).toBeLessThanOrEqual(Math.max(0, t.x0));
            expect(r.px + r.patch.width).toBeGreaterThanOrEqual(Math.min(c.width, t.x1));
            expect(r.py).toBeLessThanOrEqual(Math.max(0, t.y0));
            expect(r.py + r.patch.height).toBeGreaterThanOrEqual(Math.min(B.hzL, t.y1));
            n++;
          }
        }
      }
    }
    expect(n).toBeGreaterThan(25 * VIEWS.length);
  });

  it('at every pan offset, a sign touching the screen edge is fully covered and one well inside is untouched', async () => {
    for (const [rw, rh] of VIEWS) {
      for (const id of ERAS) {
        const B = await build(id, rw, rh);
        const W = B.layers[0].c.width / B.k;
        const band = Math.max(8, rw * 0.04);
        for (const L of B.layers) {
          if (!L.c.signs.length) continue;
          const screen = fakeCanvas();
          const ctx = screen.getContext('2d');
          for (let off = 0; off < W; off += 3.7) {
            screen.draws.length = 0;
            fadeEdgeSigns(ctx, L.c.signs, off, 0, W, rw, B.k);
            expect(ctx.globalAlpha).toBe(1);
            for (const r of L.c.signs) {
              const w = r.w / B.k;
              // where the layer's blits (at -off and W - off) put this sign on screen (W >= 1.5 rw: at most once)
              const at = [-W, 0, W, 2 * W].map((d) => r.x / B.k - off + d).filter((s) => s < rw && s + w > 0);
              expect(at.length).toBeLessThanOrEqual(1);
              const cover = screen.draws.filter((d) => d.img === r.patch);
              const where = `${id} "${r.text}" at ${rw}x${rh}, off ${off.toFixed(1)}`;
              for (const s of at) {
                const cut = s < 0 || s + w > rw;
                const inside = s >= band && s + w <= rw - band;
                if (cut) {
                  expect(cover.length, `${where}: covered`).toBe(1);
                  expect(cover[0].alpha, `${where}: fully`).toBe(1);
                  expect(cover[0].a[0], where).toBeCloseTo(s + (r.px - r.x) / B.k, 6);
                }
                if (inside) expect(cover, `${where}: untouched`).toEqual([]);
              }
            }
          }
        }
      }
    }
  });

  it('a phone at 390x844 starts on 2026 with the BIJOU marquee at the left edge: it is covered, not cut', async () => {
    const [rw, rh] = [390, 844];
    const B = await build('s2026', rw, rh);
    const W = B.layers[0].c.width / B.k;
    const mid = B.layers[1];
    const off = ((B.focus / B.k - rw / 2) % W + W) % W; // stage.js: the scene starts centred on the clock tower
    const screen = fakeCanvas();
    fadeEdgeSigns(screen.getContext('2d'), mid.c.signs, off, 0, W, rw, B.k);
    const marquee = mid.c.signs.filter((r) => /ALIENS|ATTACK|BIJOU/.test(r.text));
    expect(marquee.length).toBeGreaterThan(0);
    for (const r of marquee) {
      const s = r.sx, w = r.w / B.k;
      if (s < 0 && s + w > 0) expect(r.v, r.text).toBe(0);
      expect(r.v === 1 || r.v === 0 || (s > 0 && s + w < rw), r.text).toBe(true);
    }
    expect(marquee.some((r) => r.sx < 0 && r.sx + r.w / B.k > 0), 'the marquee straddles the edge at rest').toBe(true);
    expect(SIGN_SQUEEZE).toBeGreaterThan(0);
  });
});
