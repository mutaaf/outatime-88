import { describe, it, expect } from 'vitest';
import { wantsFullscreen, createWakeKeeper } from '../../src/touch/device.js';

const base = { enabled: true, vw: 390, vh: 844, canRequest: true, displayMode: 'browser', webdriver: false, inFullscreen: false };

describe('fullscreen on race start', () => {
  it('phones in a browser tab go fullscreen', () => {
    expect(wantsFullscreen(base)).toBe(true);
    expect(wantsFullscreen({ ...base, vw: 844, vh: 390 })).toBe(true);
  });
  it('never for tablets, installed apps, automation, iPhone Safari, when off, or when already fullscreen', () => {
    expect(wantsFullscreen({ ...base, vw: 820, vh: 1180 })).toBe(false);
    expect(wantsFullscreen({ ...base, displayMode: 'standalone' })).toBe(false);
    expect(wantsFullscreen({ ...base, webdriver: true })).toBe(false);
    expect(wantsFullscreen({ ...base, canRequest: false })).toBe(false);
    expect(wantsFullscreen({ ...base, enabled: false })).toBe(false);
    expect(wantsFullscreen({ ...base, inFullscreen: true })).toBe(false);
  });
});

describe('screen wake lock while racing', () => {
  function fakeNav() {
    const calls = { req: 0, rel: 0 };
    const nav = { wakeLock: { request: () => { calls.req++; const l = { listeners: [], addEventListener(_, f) { this.listeners.push(f); }, release() { calls.rel++; this.listeners.forEach((f) => f()); return Promise.resolve(); } }; return Promise.resolve(l); } } };
    return { nav, calls };
  }
  const doc = () => ({ hidden: false, listeners: [], addEventListener(_, f) { this.listeners.push(f); } });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('holds the lock while racing and lets go when the race stops', async () => {
    const { nav, calls } = fakeNav();
    const w = createWakeKeeper(nav, doc());
    w.set(true); w.set(true);
    await flush();
    expect(calls.req).toBe(1);
    expect(w.held()).toBe(true);
    w.set(false);
    await flush();
    expect(calls.rel).toBe(1);
    expect(w.held()).toBe(false);
  });
  it('asks again when you come back to the tab (the browser drops it while hidden)', async () => {
    const locks = [];
    const nav = { wakeLock: { request: () => { const l = { fns: [], addEventListener(_, f) { this.fns.push(f); }, release() { return Promise.resolve(); } }; locks.push(l); return Promise.resolve(l); } } };
    const d = doc();
    const w = createWakeKeeper(nav, d);
    w.set(true);
    await flush();
    expect(w.held()).toBe(true);
    d.hidden = true; locks[0].fns.forEach((f) => f()); // hidden: the browser releases it
    expect(w.held()).toBe(false);
    d.hidden = false; d.listeners.forEach((f) => f());
    await flush();
    expect(locks.length).toBe(2);
    expect(w.held()).toBe(true);
  });
  it('is a no-op without the API', () => {
    const w = createWakeKeeper({}, doc());
    expect(w.supported).toBe(false);
    expect(() => { w.set(true); w.set(false); }).not.toThrow();
  });
});
