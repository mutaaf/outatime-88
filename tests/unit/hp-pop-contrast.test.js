// Ticket 0255: the floating ±N HP pop under the place card sits on a dark plate, so its text
// meets 4.5:1 (invariant 8, WCAG 1.4.3) over any sky: the plate is composited over both a white
// and a black backdrop and the hit / heal colours are checked against each.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');

function rule(selector) {
  const at = css.indexOf(`${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}
function colour(body, prop) {
  const m = body.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+);`));
  expect(m, `${prop} set`).toBeTruthy();
  const v = m[1].trim();
  let r;
  if ((r = v.match(/^#([0-9a-f]{6})$/i))) return [0, 2, 4].map((i) => parseInt(r[1].slice(i, i + 2), 16)).concat(1);
  if ((r = v.match(/^rgba?\(([^)]+)\)$/))) {
    const p = r[1].split(',').map((s) => parseFloat(s));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`unparsed colour ${v}`);
}
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = ([r, g, b, a], back) => [r, g, b].map((c, i) => c * a + back[i] * (1 - a));

describe('HP pop plate (0255)', () => {
  const base = rule('.hud-hp-pop');
  const plate = colour(base, 'background');
  const hit = colour(rule('.hud-hp-pop[data-fx^="hit"]'), 'color');
  const heal = colour(rule('.hud-hp-pop[data-fx^="heal"]'), 'color');

  it('is a dark, nearly opaque plate', () => {
    expect(plate[3]).toBeGreaterThanOrEqual(0.85);
    expect(lum(plate)).toBeLessThan(0.02);
  });

  for (const [name, text] of [['hit', hit], ['heal', heal]]) {
    for (const [sky, back] of [['white', [255, 255, 255]], ['black', [0, 0, 0]], ['neon pink', [255, 0, 127]]]) {
      it(`${name} text is ≥ 4.5:1 on the plate over a ${sky} sky`, () => {
        expect(ratio(text, over(plate, back))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
