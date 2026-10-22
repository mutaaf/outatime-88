import { describe, it, expect } from 'vitest';
import { createPlaceCall, placeText } from '../../src/place-call.js';

function rig() {
  let t = 0;
  const said = [];
  const call = createPlaceCall({ now: () => t, write: (s) => said.push(s) });
  return { call, said, at(ms) { t = ms; } };
}

describe('screen-reader place call (ticket 0030)', () => {
  it('words the place for a screen reader', () => {
    expect(placeText(3, 6)).toBe('Now 3rd of 6');
    expect(placeText(1, 6)).toBe('Now 1st of 6');
    expect(placeText(2, 6)).toBe('Now 2nd of 6');
    expect(placeText(11, 12)).toBe('Now 11th of 12');
  });

  it('says nothing for the starting place or while the race has not started', () => {
    const r = rig();
    r.call.update(8, 6, false); // the grid sets 8 before standings land
    r.call.update(6, 6, false);
    r.call.update(6, 6, true);
    r.at(5000);
    r.call.update(6, 6, true);
    expect(r.said).toEqual([]);
  });

  it('the first place after a reset is the baseline even when the race is already on', () => {
    const r = rig();
    r.call.update(6, 6, true); // a race that skips the lineup starts RACING straight away
    r.at(100); r.call.update(6, 6, true);
    expect(r.said).toEqual([]);
    r.at(200); r.call.update(5, 6, true);
    expect(r.said).toEqual(['Now 5th of 6']);
  });

  it('speaks once per place change, never for an unchanged place', () => {
    const r = rig();
    r.call.update(6, 6, false);
    r.at(100); r.call.update(5, 6, true);
    r.at(150); r.call.update(5, 6, true);
    r.at(4000); r.call.update(5, 6, true);
    expect(r.said).toEqual(['Now 5th of 6']);
  });

  it('holds changes inside 2 s and then says only the latest place', () => {
    const r = rig();
    r.call.update(6, 6, false);
    r.at(100); r.call.update(5, 6, true);
    r.at(600); r.call.update(4, 6, true);
    r.at(1200); r.call.update(3, 6, true);
    r.at(2099); r.call.update(3, 6, true);
    expect(r.said).toEqual(['Now 5th of 6']);
    r.at(2100); r.call.update(3, 6, true);
    r.at(2150); r.call.update(3, 6, true);
    expect(r.said).toEqual(['Now 5th of 6', 'Now 3rd of 6']);
  });

  it('a swap that undoes itself inside the window is never spoken', () => {
    const r = rig();
    r.call.update(4, 6, false);
    r.at(100); r.call.update(3, 6, true);
    r.at(500); r.call.update(4, 6, true);
    r.at(800); r.call.update(3, 6, true);
    r.at(1000); r.call.update(4, 6, true);
    r.at(3000); r.call.update(4, 6, true);
    expect(r.said).toEqual(['Now 3rd of 6', 'Now 4th of 6']);
  });

  it('reset forgets the last race', () => {
    const r = rig();
    r.call.update(6, 6, false);
    r.at(100); r.call.update(1, 6, true);
    r.call.reset();
    r.at(200); r.call.update(6, 6, false);
    r.at(300); r.call.update(5, 6, true);
    expect(r.said).toEqual(['Now 1st of 6', '', 'Now 5th of 6']); // cleared, and the new race isn't held by the old window
  });
});
