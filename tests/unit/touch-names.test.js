// Touch button names (ticket 0266): each touch control has a spoken name that says what it does,
// in plain sentence case so a screen reader reads words, not letters ("NOS", "RESET" were shouted
// abbreviations). The visible labels stay as they are.
import { describe, it, expect } from 'vitest';
import { NAMES, LABELS, ICONS } from '../../src/touch/icons.js';
import { ACTION_IDS, SHORTCUT_IDS } from '../../src/touch/layouts.js';

const IDS = [...ACTION_IDS, ...SHORTCUT_IDS];

describe('touch control names', () => {
  it('every action and shortcut has a spoken name', () => {
    for (const id of IDS) expect(typeof NAMES[id], id).toBe('string');
  });
  it('names are sentence case words, never all caps or an emoji', () => {
    for (const id of IDS) {
      expect(NAMES[id], id).toMatch(/^[A-Z][a-z]+( [a-z-]+)*$/);
    }
  });
  it('names are distinct from each other', () => {
    const seen = IDS.map((id) => NAMES[id]);
    expect(new Set(seen).size).toBe(seen.length);
  });
  it('each name contains its visible label (WCAG 2.5.3 Label in Name)', () => {
    for (const id of IDS) expect(NAMES[id].toLowerCase(), id).toContain(LABELS[id].toLowerCase());
  });
  it('names say what the button does', () => {
    expect(NAMES.horn).toMatch(/nitro/i);
    expect(NAMES.respawn).toMatch(/road/i);
    expect(NAMES.camera).toMatch(/camera/i);
    expect(NAMES.pause).toMatch(/pause/i);
  });
  it('the visible labels and icons are unchanged in shape', () => {
    for (const id of IDS) { expect(LABELS[id], id).toBeTruthy(); expect(ICONS[id], id).toContain('aria-hidden="true"'); }
  });
});
