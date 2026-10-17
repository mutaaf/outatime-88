// Graphics tiers and the quality governor (ticket 0041).
import { describe, it, expect } from 'vitest';
import { tierFor, resolveTier, capsSignature, presetFor, PRESETS, TIERS, probe } from '../../src/perf/capabilities.js';
import { createGovernor, effectivePreset, MAX_STEP, GOV } from '../../src/perf/governor.js';

const caps = (o) => ({ webgpu: false, webgl2: true, webgl: true, renderer: '', maxTexture: 16384, cores: 8, memory: 8, dpr: 2, screen: 1440, touch: false, saveData: false, reducedMotion: false, ...o });

describe('tierFor', () => {
  it('no WebGL or a software rasteriser is low', () => {
    expect(tierFor(caps({ webgl: false, webgl2: false }))).toBe('low');
    expect(tierFor(caps({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' }))).toBe('low');
    expect(tierFor(caps({ renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' }))).toBe('low');
  });
  it('a strong desktop GPU is ultra; an unknown desktop high; a weak iGPU medium', () => {
    expect(tierFor(caps({ renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)' }))).toBe('ultra');
    expect(tierFor(caps({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)' }))).toBe('ultra');
    expect(tierFor(caps({ renderer: 'Some GPU' }))).toBe('high');
    expect(tierFor(caps({ renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' }))).toBe('medium');
  });
  it('tiny memory or 2 cores is low whatever the GPU', () => {
    expect(tierFor(caps({ renderer: 'Apple M2', memory: 2 }))).toBe('low');
    expect(tierFor(caps({ renderer: 'Apple M2', cores: 2 }))).toBe('low');
  });
  it('touch: big Apple tablets are high, phones medium, weak mobile GPUs low', () => {
    expect(tierFor(caps({ touch: true, renderer: 'Apple GPU', screen: 1366, cores: 0, memory: 0 }))).toBe('high');
    expect(tierFor(caps({ touch: true, renderer: 'Apple GPU', screen: 844, cores: 0, memory: 0 }))).toBe('medium');
    expect(tierFor(caps({ touch: true, renderer: 'Mali-G52', screen: 800, maxTexture: 8192 }))).toBe('low');
  });
  it('WebGL1-only or data saver never goes above medium', () => {
    expect(tierFor(caps({ webgl2: false, renderer: 'Apple M1' }))).toBe('medium');
    expect(tierFor(caps({ saveData: true, renderer: 'Apple M1' }))).toBe('medium');
  });
});

describe('resolveTier', () => {
  const c = caps({ renderer: 'Apple M1' });
  it('the player choice wins', () => {
    expect(resolveTier({ pref: 'low', caps: c })).toEqual({ tier: 'low', source: 'player', provisional: false });
  });
  it('auto reuses a cached tier for the same device, re-probes for a different one', () => {
    expect(resolveTier({ caps: c, cached: { tier: 'high', sig: capsSignature(c) } })).toMatchObject({ tier: 'high', source: 'cache' });
    expect(resolveTier({ caps: c, cached: { tier: 'low', sig: 'other' } })).toMatchObject({ tier: 'ultra', source: 'probe', provisional: true });
  });
});

describe('presets', () => {
  it('cost rises with the tier', () => {
    for (let i = 1; i < TIERS.length; i++) {
      const a = PRESETS[TIERS[i - 1]], b = PRESETS[TIERS[i]];
      expect(b.dpr).toBeGreaterThanOrEqual(a.dpr);
      expect(b.ahead).toBeGreaterThanOrEqual(a.ahead);
      expect(b.maxDraws).toBeGreaterThan(a.maxDraws);
      expect(b.shadows).toBeGreaterThanOrEqual(a.shadows);
    }
    expect(PRESETS.low.shadows).toBe(0);
    expect(PRESETS.low.post).toBe(false);
  });
  it('each governor step only ever gives quality up, and is memoised', () => {
    const p = presetFor('ultra');
    let prev = effectivePreset(p, 0);
    expect(prev).toBe(effectivePreset(p, 0));
    for (let s = 1; s <= MAX_STEP; s++) {
      const q = effectivePreset(p, s);
      expect(q.dpr).toBeLessThanOrEqual(prev.dpr);
      expect(q.res).toBeLessThanOrEqual(prev.res);
      expect(q.shadows).toBeLessThanOrEqual(prev.shadows);
      expect(q.ahead).toBeLessThanOrEqual(prev.ahead);
      prev = q;
    }
    expect(prev.post).toBe(false);
    expect(prev.shadows).toBe(0);
  });
});

/** Feed `secs` seconds of frames at `ms` each. Returns how many times the step changed. */
function run(g, ms, secs) {
  let changes = 0;
  for (let t = 0; t < secs * 1000; t += ms) if (g.sample(ms)) changes++;
  return changes;
}

describe('governor', () => {
  it('holds at 60 fps', () => {
    const g = createGovernor();
    run(g, 16.7, 10);
    expect(g.step).toBe(0);
  });
  it('one slow second is a hiccup; two in a row step down', () => {
    const g = createGovernor();
    run(g, 16.7, 2);
    run(g, 30, 1);
    expect(g.step).toBe(0);
    run(g, 30, 1);
    expect(g.step).toBe(1);
  });
  it('ignores pauses and tab switches', () => {
    const g = createGovernor();
    for (let i = 0; i < 50; i++) g.sample(5000);
    expect(g.step).toBe(0);
    expect(g.elapsedMs).toBe(0);
  });
  it('steps back up only after a quiet spell, and backs off longer when that was too much', () => {
    const g = createGovernor();
    run(g, 16.7, 2);
    run(g, 30, 2.1);
    expect(g.step).toBe(1);
    run(g, 16.7, GOV.upAfterMs / 1000 - 1.5);
    expect(g.step).toBe(1);           // not yet
    run(g, 16.7, 2);
    expect(g.step).toBe(0);           // quiet long enough → try again
    run(g, 30, 1);
    expect(g.step).toBe(1);           // one slow window right after an upgrade undoes it
    run(g, 16.7, GOV.upAfterMs / 1000 + 1);
    expect(g.step).toBe(1);           // the next try waits twice as long
    run(g, 16.7, GOV.upAfterMs / 1000 + 1);
    expect(g.step).toBe(0);
  });
  it('never flaps on alternating good and slow seconds', () => {
    const g = createGovernor();
    let changes = 0;
    for (let i = 0; i < 20; i++) { changes += run(g, 16.7, 1); changes += run(g, 30, 1); }
    expect(changes).toBe(0);
  });
  it('reaches the floor and asks for a lower tier when nothing helps', () => {
    const g = createGovernor();
    run(g, 40, 2 * MAX_STEP + 6);
    expect(g.step).toBe(MAX_STEP);
    expect(g.shouldDemote).toBe(true);
  });
  it('a 120 Hz display is judged against its own refresh, with a 22 ms floor', () => {
    const g = createGovernor();
    run(g, 8.3, 3);
    expect(g.refreshMs).toBeCloseTo(8.3, 1);
    expect(g.budgetMs).toBe(22);
    expect(g.step).toBe(0);
  });
});

describe('probe', () => {
  it('survives a bare environment', () => {
    const c = probe({ navigator: {}, document: { createElement: () => ({ getContext: () => null }) } });
    expect(c.webgl).toBe(false);
    expect(tierFor(c)).toBe('low');
  });
  it('reads the unmasked renderer and frees the probe context', () => {
    let lost = false;
    const gl = {
      MAX_TEXTURE_SIZE: 1, RENDERER: 2,
      getParameter: (k) => (k === 1 ? 16384 : k === 0x9246 ? 'Apple M3' : 'WebKit WebGL'),
      getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : n === 'WEBGL_lose_context' ? { loseContext: () => { lost = true; } } : null),
    };
    const c = probe({ navigator: { hardwareConcurrency: 10, gpu: {} }, devicePixelRatio: 2, document: { createElement: () => ({ getContext: (k) => (k === 'webgl2' ? gl : null) }) } });
    expect(c).toMatchObject({ webgl2: true, renderer: 'Apple M3', maxTexture: 16384, webgpu: true, cores: 10 });
    expect(lost).toBe(true);
  });
});
