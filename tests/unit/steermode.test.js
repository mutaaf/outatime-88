// Steering modes (ticket 0130): which modes a device has, cycling, assist levels, mouse steering.
import { describe, it, expect } from 'vitest';
import {
  STEER_MODES, STEER_IDS, ASSISTS, availableModes, resolveMode, nextMode, nextAssist, effectiveAssist,
  savedAssist, assistById, assistForJarvis, mouseSteer, touchMovementFor, MOUSE,
} from '../../src/steermode.js';
import { normalizeSettings } from '../../src/settings.js';

describe('modes per device', () => {
  it('a laptop gets keys and mouse; a phone gets stick, D-pad and tilt; a touch laptop gets all', () => {
    expect(availableModes({ fine: true, touch: false, tilt: false })).toEqual(['keys', 'mouse']);
    expect(availableModes({ fine: false, touch: true, tilt: true })).toEqual(['stick', 'dpad', 'tilt']);
    expect(availableModes({ fine: false, touch: true, tilt: false })).toEqual(['stick', 'dpad']);
    expect(availableModes({ fine: true, touch: true, tilt: true })).toEqual(['keys', 'mouse', 'stick', 'dpad', 'tilt']);
    expect(availableModes({})).toEqual(['keys', 'mouse']);
  });
  it('every mode has a label, icon and hint', () => {
    for (const id of STEER_IDS) {
      expect(STEER_MODES[id].label).toMatch(/\S/);
      expect(STEER_MODES[id].icon).toMatch(/\S/);
      expect(STEER_MODES[id].hint).toMatch(/\S/);
    }
  });
  it('the saved mode wins when the device has it; otherwise the natural one', () => {
    expect(resolveMode('mouse', ['keys', 'mouse'])).toBe('mouse');
    expect(resolveMode('tilt', ['keys', 'mouse'])).toBe('keys');
    expect(resolveMode('', ['stick', 'dpad', 'tilt'], { touch: true })).toBe('stick');
    expect(resolveMode('', ['keys', 'mouse', 'stick'], { touch: true })).toBe('stick');
    expect(resolveMode('', [], {})).toBe('keys');
  });
  it('cycles forward and back, wrapping round', () => {
    const list = ['stick', 'dpad', 'tilt'];
    expect(nextMode('stick', list)).toBe('dpad');
    expect(nextMode('tilt', list)).toBe('stick');
    expect(nextMode('stick', list, -1)).toBe('tilt');
    expect(nextMode('keys', list)).toBe('stick'); // unknown current: start at the first
  });
  it('maps steering modes onto the touch kit without losing the preset stick style', () => {
    expect(touchMovementFor('dpad', 'floating')).toBe('dpad');
    expect(touchMovementFor('stick', 'dpad')).toBe('');
    expect(touchMovementFor('stick', 'fixed')).toBe('fixed');
    expect(touchMovementFor('tilt', '')).toBe('tilt');
    expect(touchMovementFor('keys', 'floating')).toBe('floating');
  });
});

describe('co-pilot', () => {
  it('cycles OFF → SMART ASSIST → AUTOPILOT → OFF on GameState.jarvisMode', () => {
    expect(nextAssist('off')).toBe('assist');
    expect(nextAssist('assist')).toBe('auto');
    expect(nextAssist('auto')).toBe('off');
    expect(assistById('off').jarvis).toBe(2);
    expect(assistById('assist').jarvis).toBe(0);
    expect(assistById('auto').jarvis).toBe(1);
    expect(assistForJarvis(1).id).toBe('auto');
    expect(ASSISTS).toHaveLength(3);
  });
  it('live races skip autopilot (friends drive their own cars) but keep smart assist', () => {
    expect(nextAssist('assist', { live: true })).toBe('off');
    expect(effectiveAssist('auto', true)).toBe('assist');
    expect(effectiveAssist('auto', false)).toBe('auto');
    expect(effectiveAssist('bogus', false)).toBe('off');
  });
  it('first run after this shipped: the touch kit\'s old steer-assist switch carries over', () => {
    expect(savedAssist({ assist: '' }, { steerAssist: true })).toBe('assist');
    expect(savedAssist({ assist: '' }, { steerAssist: false })).toBe('off');
    expect(savedAssist({ assist: 'auto' }, { steerAssist: true })).toBe('auto');
    expect(savedAssist({}, undefined)).toBe('off');
  });
  it('settings save and repair the steering choices', () => {
    expect(normalizeSettings({ steer: 'mouse', assist: 'auto' })).toMatchObject({ steer: 'mouse', assist: 'auto' });
    expect(normalizeSettings({ steer: 'warp', assist: 7 })).toMatchObject({ steer: '', assist: '' });
  });
});

describe('mouse steering', () => {
  it('is centred in the middle, with a dead zone, and full lock at 30% of the width either side', () => {
    expect(mouseSteer(500, 1000)).toBe(0);
    expect(mouseSteer(500 + 1000 * MOUSE.reach * MOUSE.dead * 0.9, 1000)).toBe(0);
    expect(mouseSteer(800, 1000)).toBeCloseTo(1, 6);
    expect(mouseSteer(1000, 1000)).toBe(1);
    expect(mouseSteer(0, 1000)).toBe(-1);
    expect(mouseSteer(650, 1000)).toBeGreaterThan(0);
    expect(mouseSteer(650, 1000)).toBeLessThan(0.5); // the curve keeps small moves fine
    expect(mouseSteer(350, 1000)).toBeCloseTo(-mouseSteer(650, 1000), 9);
    expect(mouseSteer(10, 0)).toBe(0);
  });
});
