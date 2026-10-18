import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { forkLean, forkCueState } from '../../src/fork.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const label = (id) => html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))[1].trim();

describe('fork cue (0019)', () => {
  it('labels are a word each plus arrows, never a banner sentence', () => {
    for (const id of ['forkLeftCard', 'forkRightCard']) {
      const text = label(id);
      expect(text.split(/\s+/).filter((w) => /[A-Z]/.test(w)).length).toBeLessThanOrEqual(2);
      expect(text.length).toBeLessThanOrEqual(14);
    }
    expect(label('forkLeftCard').startsWith('◀')).toBe(true);
    expect(label('forkRightCard').endsWith('▶')).toBe(true);
  });
  it('leans the way the outcome will go', () => {
    expect(forkLean(-0.01)).toBe('LEFT');
    expect(forkLean(0)).toBe('RIGHT');
    expect(forkLean(0.5)).toBe('RIGHT');
  });
  it('is OFF away from a fork', () => {
    expect(forkCueState(false, -0.4)).toBe('OFF');
    expect(forkCueState(true, -0.4)).toBe('LEFT');
    expect(forkCueState(true, 0.4)).toBe('RIGHT');
  });
});
