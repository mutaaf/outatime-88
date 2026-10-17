import { describe, it, expect } from 'vitest';
import { resolveRenderMode, toggledPref, isLowEnd, hasWebGL } from '../../src/render-mode.js';
import { SaveStore } from '../../src/save.js';

describe('render mode', () => {
  it('never picks 3D without WebGL, whatever was saved or asked for', () => {
    expect(resolveRenderMode({ saved: '3d', query: '3d', webgl: false, lowEnd: false })).toBe('2d');
  });

  it('the URL wins for this visit, then the saved choice', () => {
    expect(resolveRenderMode({ saved: '2d', query: '3d', webgl: true, lowEnd: false })).toBe('3d');
    expect(resolveRenderMode({ saved: '3d', query: '2d', webgl: true, lowEnd: false })).toBe('2d');
    expect(resolveRenderMode({ saved: '3d', webgl: true, lowEnd: true })).toBe('3d');
    expect(resolveRenderMode({ saved: '2d', webgl: true, lowEnd: false })).toBe('2d');
  });

  it('auto stays 2D, and always 2D on low-end devices', () => {
    expect(resolveRenderMode({ saved: 'auto', webgl: true, lowEnd: true })).toBe('2d');
    expect(resolveRenderMode({ webgl: true, lowEnd: false })).toBe('2d');
    expect(resolveRenderMode({ saved: 'junk', query: 'junk', webgl: true, lowEnd: false })).toBe('2d');
  });

  it('flips between 2D and 3D', () => {
    expect(toggledPref('2d')).toBe('3d');
    expect(toggledPref('3d')).toBe('2d');
  });

  it('flags low-memory or dual-core devices as low-end and tolerates missing fields', () => {
    expect(isLowEnd({ deviceMemory: 2, hardwareConcurrency: 8 })).toBe(true);
    expect(isLowEnd({ deviceMemory: 8, hardwareConcurrency: 2 })).toBe(true);
    expect(isLowEnd({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false);
    expect(isLowEnd({})).toBe(false);
  });

  it('reports no WebGL when canvases or contexts are unavailable', () => {
    expect(hasWebGL(null)).toBe(false);
    expect(hasWebGL({ createElement: () => ({ getContext: () => null }) })).toBe(false);
    expect(hasWebGL({ createElement: () => { throw new Error('no'); } })).toBe(false);
    expect(hasWebGL({ createElement: () => ({ getContext: (k) => (k === 'webgl' ? {} : null) }) })).toBe(true);
  });

  it('old saves get the auto preference and keep the rest of their data', () => {
    const store = { _d: {} };
    globalThis.localStorage = { getItem: () => JSON.stringify({ bestScore: 42 }), setItem: (k, v) => { store._d[k] = v; } };
    SaveStore.load();
    expect(SaveStore.data.renderMode).toBe('auto');
    expect(SaveStore.data.bestScore).toBe(42);
    delete globalThis.localStorage;
  });
});
