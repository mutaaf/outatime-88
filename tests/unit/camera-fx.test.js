// Camera effects comfort setting (ticket 0216): one scale for camera shake and FOV push-in.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SETTINGS_DEFAULTS, normalizeSettings } from '../../src/settings.js';
import { cameraFxScale } from '../../src/camera-fx.js';

describe('camera effects (0216)', () => {
  it('scales 1 / 0.4 / 0 for full / gentle / off; junk is full', () => {
    expect(cameraFxScale('full')).toBe(1);
    expect(cameraFxScale('gentle')).toBe(0.4);
    expect(cameraFxScale('off')).toBe(0);
    for (const junk of [undefined, null, '', 'wobbly', 'toString']) expect(cameraFxScale(junk)).toBe(1);
  });

  it('an old save without cameraFx loads as full; junk is repaired', () => {
    expect(SETTINGS_DEFAULTS.cameraFx).toBe('full');
    // A real pre-0216 settings blob, as saved by the 0211 build.
    const old = { tilt: false, tiltInvert: false, musicVolume: 0.8, sfxVolume: 1, musicStyle: 'auto', voice: true, proximity: true, coach: true, hud: 'normal', motion: 'auto', difficulty: 'normal', rivals: 'pack', graphics: 'auto', steer: '', assist: '', keys: null };
    const s = normalizeSettings(old);
    expect(s.cameraFx).toBe('full');
    expect(cameraFxScale(s.cameraFx)).toBe(1);
    expect(normalizeSettings({ cameraFx: 'gentle' }).cameraFx).toBe('gentle');
    expect(normalizeSettings({ cameraFx: 'wobbly' }).cameraFx).toBe('full');
  });

  it('calm motion still wins: every renderer path the scale touches is also gated on reducedMotion', () => {
    const fx = readFileSync('src/render/fx.js', 'utf8');
    const fxSrc = readFileSync('src/fx.js', 'utf8');
    expect(fxSrc).toMatch(/if \(reducedMotion \|\| speedMph < 40\)/); // speed shake + push-in → 0
    expect(fx).toMatch(/nosBurning && GameState.status === 'PLAYING' && !GameState.reducedMotion/); // NOS push-in
    expect(readFileSync('src/render/scene.js', 'utf8')).toMatch(/screenShake > 0 && !GameState.reducedMotion/);
  });

  it('only renderers and the settings panel read it: the sim never does', () => {
    for (const f of ['src/race-step.js', 'src/race-flow.js', 'src/handling.js', 'src/contact.js', 'src/physics.js', 'src/world.js', 'src/hazard-run.js']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/cameraFx/);
    }
  });
});
