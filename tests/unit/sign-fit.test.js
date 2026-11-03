// Ticket 0236: an era backdrop's sign text shows whole words or nothing, never a mid-word clip.
// Every sign in every era scene is painted onto a box (`maxW`); fitWords drops trailing words
// (and a dangling separator) until the text fits that box squeezed by at most SIGN_SQUEEZE.
import { describe, it, expect, vi, beforeAll } from 'vitest';

const calls = [];
const painted = []; // every fillText on a fake canvas: { text, px, maxWidth }
vi.mock('../../src/scenes/kit.js', async (importOriginal) => {
  const kit = await importOriginal();
  return {
    ...kit,
    sign: (ctx, text, x, y, size, color, opts) => {
      const from = painted.length;
      const drawn = kit.sign(ctx, text, x, y, size, color, opts);
      calls.push({ text, alt: opts && opts.alt, maxW: opts && opts.maxW, drawn, fills: painted.slice(from) });
      return drawn;
    },
  };
});

const { fitWords, SIGN_SQUEEZE, SIGN_MIN_PX } = await import('../../src/scenes/kit.js');

// Courier New: a glyph is 0.6 em wide. The fake canvas measures text the same way.
const GLYPH = 0.6;
const width = (t, px) => [...t].length * GLYPH * px;
const pxOf = (font) => parseFloat(/(\d+(\.\d+)?)px/.exec(font)[1]);

function fakeCtx() {
  const state = { font: '10px x' };
  const noop = () => {};
  const grad = { addColorStop: noop };
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'fillText') return (s, x, y, maxWidth) => painted.push({ text: s, px: pxOf(t.font), maxWidth });
      if (k === 'measureText') return (s) => ({ width: width(s, pxOf(t.font)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

beforeAll(() => {
  globalThis.document = {
    createElement: () => {
      const c = { width: 1, height: 1 };
      const ctx = fakeCtx();
      ctx.canvas = c;
      c.getContext = () => ctx;
      return c;
    },
  };
});

const ERAS = ['s1885', 's1955', 's1985', 's2015', 's2026', 's2061', 's2088'];
// stage.js build(): hz0 = round(rh * 0.46), k = min(1, 1100 / max(rw, rh * 0.9)) * tier scale
// (stage clamps the tier scale at 1: low 0.6, medium 0.8, high/ultra 1), W = ceil(max(rw * 1.5, hz0 * 2.9) * k), pad = round(rh * 0.3).
const VIEWS = [[1280, 720], [390, 844], [844, 390], [360, 640], [320, 568]];
const SCALES = [0.6, 0.8, 1];

async function buildAll(rw, rh, scale) {
  const out = [];
  for (const id of ERAS) {
    const scene = (await import(`../../src/scenes/${id}.js`)).default;
    calls.length = 0;
    const hz0 = Math.round(rh * 0.46);
    const k = Math.min(1, 1100 / Math.max(rw, rh * 0.9)) * scale;
    scene.build({ rw, rh, hz0, k, W: Math.ceil(Math.max(rw * 1.5, hz0 * 2.9) * k), pad: Math.round(rh * 0.3) });
    out.push(...calls.map((c) => ({ ...c, id })));
  }
  return out;
}

describe('sign text fits whole words (0236)', () => {
  it('fitWords keeps whole words, drops dangling separators, and gives up when no word fits', () => {
    const m = (t) => t.length * 10;
    expect(fitWords('ALIENS FROM PLUTO II', 1000, m)).toBe('ALIENS FROM PLUTO II');
    expect(fitWords('+ ATTACK OF THE 50 FT MALL', 21 * 10 * SIGN_SQUEEZE, m)).toBe('+ ATTACK OF THE 50 FT');
    expect(fitWords('+ ATTACK OF THE 50 FT MALL', 16 * 10 * SIGN_SQUEEZE, m)).toBe('+ ATTACK');
    expect(fitWords('GULCH OF NO NAME', 9 * 10 * SIGN_SQUEEZE, m)).toBe('GULCH');
    expect(fitWords('140 MILLION MI · KEEP LEFT', 17 * 10 * SIGN_SQUEEZE, m)).toBe('140 MILLION MI');
    expect(fitWords('HOOK & LADDER 8', 7 * 10 * SIGN_SQUEEZE, m)).toBe('HOOK');
    expect(fitWords('+ ATTACK', 3 * 10 * SIGN_SQUEEZE, m)).toBe('');
    expect(fitWords('LIVERY', 5 * 10 * SIGN_SQUEEZE, m)).toBe('');
    expect(fitWords('LIVERY', 0, m)).toBe('');
  });

  it('every era sign has a box, and at every view size and tier shows a whole-word prefix that fits it', async () => {
    let n = 0;
    for (const [rw, rh] of VIEWS) {
      for (const s of SCALES) {
        for (const c of await buildAll(rw, rh, s)) {
          n++;
          const where = `${c.id} "${c.text}" at ${rw}x${rh} x${s}`;
          expect(c.maxW > 0, `${where}: no box`).toBe(true);
          // a whole-word prefix: what follows it in the full text is not a letter or digit
          const ok = c.drawn === '' || c.drawn === c.alt || (c.text.startsWith(c.drawn) && !/[\p{L}\p{N}]/u.test(c.text[c.drawn.length] || ' '));
          expect(ok, `${where}: drew "${c.drawn}"`).toBe(true);
          // what reached the canvas: the fitted text once (or nothing), legible and inside the box
          expect(c.fills.map((f) => f.text), where).toEqual(c.drawn ? [c.drawn] : []);
          for (const f of c.fills) {
            expect(f.px, where).toBeGreaterThanOrEqual(SIGN_MIN_PX);
            expect(f.maxWidth, where).toBe(c.maxW);
            expect(width(f.text, f.px) * SIGN_SQUEEZE, where).toBeLessThanOrEqual(c.maxW + 1e-6);
          }
        }
      }
    }
    expect(n).toBeGreaterThan(30 * VIEWS.length * SCALES.length);
  });

  it('a sign keeps every word a smaller font can hold before it blanks', async () => {
    const low = await buildAll(844, 390, 0.6);
    for (const t of ['PARANORMAL DIV.', 'HOVR-BORD CO.', 'AUTO-LACE KICKS']) {
      expect(low.find((c) => c.text === t).drawn, t).not.toBe('');
    }
  });

  it('the rain countdown always shows its number', async () => {
    for (const [rw, rh] of VIEWS) {
      for (const s of SCALES) {
        for (const c of (await buildAll(rw, rh, s)).filter((c) => c.text.startsWith('RAIN ENDS IN'))) {
          expect(c.drawn, `${rw}x${rh} x${s}`).toMatch(/\d+s$/);
        }
      }
    }
  });

  it('the high tier at 1280x720 and 390x844 shows every sign in full', async () => {
    for (const [rw, rh] of [[1280, 720], [390, 844]]) {
      const cut = (await buildAll(rw, rh, 1)).filter((c) => c.drawn !== c.text).map((c) => `${c.id} "${c.text}" → "${c.drawn}"`);
      expect(cut, `${rw}x${rh}`).toEqual([]);
    }
  });
});
