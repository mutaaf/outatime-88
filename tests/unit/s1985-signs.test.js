// Ticket 0224: the 1985 strip-mall signs are our own names (AGENTS.md invariant 7), and every
// sign's text fits the board it is painted on.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import scene, { SHOPS, MALL, ADS } from '../../src/scenes/s1985.js';

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8');

// A real video chain (one letter off) with its rental slogan, a film's rival dojo and its kids'
// tagline, and the mall name that echoed a film's one.
const BANNED = ['BLOCKBUST', 'BE KIND', 'REWIND', 'VIPER KAN', 'COBRA', 'KARATE FOR KIDS', 'TRIPLE PINES', 'DOUBLE PINES', 'PINES MALL'];

// Courier New: a glyph is 0.6 em wide.
const GLYPH = 0.6;

describe('1985 signs (0224)', () => {
  it('quote no real brand, slogan or film in the scene or its easter-egg notes', () => {
    for (const file of ['src/scenes/s1985.js', 'docs/EASTER_EGGS.md']) {
      const text = read(file).toUpperCase();
      for (const b of BANNED) expect(text.includes(b), `${b} in ${file}`).toBe(false);
    }
  });

  it('the roadside boards are the scene ads, each line non-empty and at most 20% squeezed on the 160 px face', () => {
    expect(scene.ads).toBe(ADS);
    for (const [top, bottom, bg, fg] of ADS) {
      expect(top.trim() && bottom.trim() && bg && fg).toBeTruthy();
      // adSprite (src/scenes/stage.js): 22 px top, 13 px bottom, fillText maxWidth 150
      expect(top.length * 22 * GLYPH, top).toBeLessThanOrEqual(150 / 0.8);
      expect(bottom.length * 13 * GLYPH, bottom).toBeLessThanOrEqual(150 / 0.8);
    }
  });

  it('every shop label fits its unit with a 1u margin each side', () => {
    expect(SHOPS.map((s) => s[0])).toEqual(['ARCADE 88', 'VIDEO VORTEX', 'LOTUS DOJO']);
    for (const [label, w] of SHOPS) expect(label.length * 2.2 * GLYPH, label).toBeLessThanOrEqual(w - 2);
  });

  it('the mall pylon loses one elm and changes its count word after lap 1, and the words fit the 22u box', () => {
    expect(MALL.trees[0] - MALL.trees[1]).toBe(1);
    expect(MALL.before).not.toBe(MALL.after);
    expect(MALL.name.length * 2.6 * GLYPH).toBeLessThanOrEqual(22 - 2);
    // the count word sprite is 22u x 4u, text at 0.8 of its height
    for (const w of [MALL.before, MALL.after]) expect(w.length * 4 * 0.8 * GLYPH).toBeLessThanOrEqual(22);
    // six elms in a row (3.4u, 1.05 spacing) stay within the 22u pylon box
    expect(MALL.trees[0] * 3.4 * 1.05).toBeLessThanOrEqual(22);
  });
});
