// Ticket 0254: on a phone the floating crash line ("💥 BLOCKED! HOLD DRIFT TO SLIDE UNDER!") and
// the score popups never run under a touch pad. layoutLabels gets the pads as road-buffer boxes
// (padBoxes, covering every FOV crop) and slides or lifts a plate clear of them.
import { describe, it, expect } from 'vitest';
import { LABEL, layoutLabels, fallbackBox, labelSlots, padBoxes } from '../../src/popups.js';
import { presetLayout, PRESET_IDS, ACTION_IDS, SHORTCUT_IDS } from '../../src/touch/layouts.js';

const measure = (s) => s.length * 6.4; // Orbitron bold 11 px is ~6-7 px a character
const CRASH = ['💥 BLOCKED! HOLD DRIFT TO SLIDE UNDER!', '💥 BLOCKED! HIT JUMP OR STEER AROUND!', '💥 BARRICADE IMPACT! -14 HP'];
const POPUP = '+1500 ⚡ 1.88GW!';

// The two phone screens the ticket names, with the HUD/message lane touch.test.js uses.
const ENVS = [
  { vw: 390, vh: 844, safe: { t: 0, r: 0, b: 0, l: 0 }, top: 82, lane: null },
  { vw: 844, vh: 390, safe: { t: 0, r: 0, b: 0, l: 0 }, top: 74, lane: { x0: 118, x1: 726, y1: 216 } },
];

/** Every shown pad of a preset as screen boxes (CSS px), the way touch-ui.js places them. */
function padsOf(L) {
  const out = [];
  for (const id of ['stick', ...ACTION_IDS, ...SHORTCUT_IDS]) {
    const it = L[id];
    if (!it || it.hidden) continue;
    out.push(it.x - it.d / 2, it.y - it.d / 2, it.x + it.d / 2, it.y + it.d / 2);
  }
  return Float32Array.from(out);
}

function rects(out, n) {
  const r = [];
  for (let i = 0; i < n; i++) {
    const o = i * LABEL.stride;
    r.push({ x0: out[o], y0: out[o + 1], x1: out[o] + out[o + 2], y1: out[o + 1] + out[o + 3], src: out[o + 5] });
  }
  return r;
}
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const boxesOf = (B, n) => Array.from({ length: n }, (_, i) => ({ x0: B[i * 4], y0: B[i * 4 + 1], x1: B[i * 4 + 2], y1: B[i * 4 + 3] }));

describe('padBoxes', () => {
  it('maps a pad to where it lands on the buffer at every FOV crop', () => {
    const B = new Float32Array(4);
    // 390x844 screen drawn from a 260x563 buffer (pixelScale 1.5).
    padBoxes(Float32Array.of(14, 650, 62, 698), 1, 390, 844, 260, 563, B);
    const F = LABEL.fovMax;
    for (const f of [1, 1.05, F]) {
      // Buffer x of the screen x through the blit's crop (src/render/scene.js).
      const bx = (sx) => 260 * (1 - 1 / f) * 0.5 + sx * (260 / 390) / f;
      const by = (sy) => 563 * (1 - 1 / f) * 0.46 + sy * (563 / 844) / f;
      expect(bx(14)).toBeGreaterThanOrEqual(B[0] - 1e-3);
      expect(bx(62)).toBeLessThanOrEqual(B[2] + 1e-3);
      expect(by(650)).toBeGreaterThanOrEqual(B[1] - 1e-3);
      expect(by(698)).toBeLessThanOrEqual(B[3] + 1e-3);
    }
  });
});

describe('layoutLabels with touch pads', () => {
  it('no crash line or popup touches a pad, on phone portrait and landscape, every preset', () => {
    const out = labelSlots();
    const B = new Float32Array(64);
    const failures = [];
    let shown = 0, cases = 0;
    for (const env0 of ENVS) {
      for (const autoAccel of [true, false]) {
        const env = { ...env0, autoAccel, size: 1 };
        for (const p of PRESET_IDS) {
          const pads = padsOf(presetLayout(p, env));
          for (const scale of [1, 1.5]) {
            const rw = Math.floor(env.vw / scale), rh = Math.floor(env.vh / scale);
            const n = padBoxes(pads, pads.length / 4, env.vw, env.vh, rw, rh, B);
            const padRects = boxesOf(B, n);
            const box = fallbackBox(rw, rh, { x0: 0, y0: 0, x1: 0, y1: 0 });
            for (const crash of CRASH) {
              for (const age of [0, 0.2, 0.5]) {
                const list = [
                  { label: POPUP, life: 0.9 - age, maxLife: 0.9 },
                  { label: crash, hit: true, life: 0.7 - age, maxLife: 0.7 },
                ];
                const k = layoutLabels(list, box, rw, rh, measure, out, false, B, n);
                const r = rects(out, k);
                cases++;
                if (r.some((q) => list[q.src].label === crash)) shown++;
                for (const q of r) {
                  for (const pr of padRects) if (hit(q, pr)) failures.push(`${p} ${env.vw}x${env.vh} /${scale} "${list[q.src].label}" over a pad`);
                  if (q.x0 < 0 || q.y0 < 0 || q.x1 > rw || q.y1 > rh) failures.push(`${p} ${env.vw}x${env.vh} off canvas`);
                }
                for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (hit(r[i], r[j])) failures.push(`${p} ${env.vw}x${env.vh} labels overlap`);
              }
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
    // The crash line still shows: lifting it above the pads, never dropping it.
    expect(shown).toBe(cases);
  });

  it('a plate keeps its column and only floats up over its life (no jump as it rises)', () => {
    const env = { ...ENVS[0], autoAccel: true, size: 1 };
    const pads = padsOf(presetLayout('default', env));
    const B = new Float32Array(64), out = labelSlots();
    const n = padBoxes(pads, pads.length / 4, 390, 844, 390, 844, B);
    const box = fallbackBox(390, 844, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const e = { label: CRASH[0], hit: true, life: 0.7, maxLife: 0.7 };
    let lastY = Infinity, x = null;
    for (let life = 0.7; life > 0; life -= 0.05) {
      e.life = life;
      expect(layoutLabels([e], box, 390, 844, measure, out, false, B, n)).toBe(1);
      if (x === null) x = out[0];
      expect(out[0]).toBeCloseTo(x, 3);
      expect(out[1]).toBeLessThanOrEqual(lastY + 1e-3);
      if (lastY < Infinity) expect(lastY - out[1]).toBeLessThan(LABEL.rise); // a float step, never a hop over a pad
      lastY = out[1];
    }
  });

  it('without pads (desktop, keyboard) placement is unchanged', () => {
    const box = fallbackBox(1280, 720, { x0: 0, y0: 0, x1: 0, y1: 0 });
    const list = () => [{ label: POPUP, life: 0.5, maxLife: 0.9 }, { label: CRASH[0], hit: true, life: 0.5, maxLife: 0.7 }];
    const a = labelSlots(), b = labelSlots();
    const na = layoutLabels(list(), box, 1280, 720, measure, a, false);
    const nb = layoutLabels(list(), box, 1280, 720, measure, b, false, new Float32Array(8), 0);
    expect(nb).toBe(na);
    expect(Array.from(b)).toEqual(Array.from(a));
  });
});
