// FULLSCREEN button (ticket 0307): Settings → View, for desktop and tablets.
import { describe, it, expect } from 'vitest';
import { fullscreenLabel, fullscreenApi, wireFullscreen } from '../../src/fullscreen.js';

function fakeDoc({ std = true, webkit = false } = {}) {
  const listeners = {};
  const doc = {
    fullscreenElement: null,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    fire: (t) => (listeners[t] || []).forEach((fn) => fn()),
    listeners,
    documentElement: {},
  };
  if (std) {
    doc.fullscreenEnabled = true;
    doc.documentElement.requestFullscreen = () => { doc.fullscreenElement = doc.documentElement; doc.fire('fullscreenchange'); return Promise.resolve(); };
    doc.exitFullscreen = () => { doc.fullscreenElement = null; doc.fire('fullscreenchange'); return Promise.resolve(); };
  }
  if (webkit) {
    doc.webkitFullscreenEnabled = true;
    doc.webkitFullscreenElement = null;
    doc.documentElement.webkitRequestFullscreen = () => { doc.webkitFullscreenElement = doc.documentElement; doc.fire('webkitfullscreenchange'); };
    doc.webkitExitFullscreen = () => { doc.webkitFullscreenElement = null; doc.fire('webkitfullscreenchange'); };
  }
  return doc;
}
function fakeButton() {
  const cls = new Set(['hidden']);
  const attrs = {};
  const handlers = {};
  return {
    textContent: '',
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => attrs[k],
    addEventListener: (t, fn) => { handlers[t] = fn; },
    click: () => handlers.click && handlers.click(),
  };
}

describe('fullscreenLabel', () => {
  it('offers to enter when not fullscreen and to exit when fullscreen', () => {
    expect(fullscreenLabel(false)).toBe('⛶ ENTER FULLSCREEN');
    expect(fullscreenLabel(true)).toBe('⛶ EXIT FULLSCREEN');
  });
});

describe('fullscreenApi', () => {
  it('is null without a document or without the API (iPhone)', () => {
    expect(fullscreenApi(null)).toBe(null);
    expect(fullscreenApi(fakeDoc({ std: false }))).toBe(null);
    const off = fakeDoc();
    off.fullscreenEnabled = false;
    expect(fullscreenApi(off)).toBe(null);
  });
  it('uses the standard API, or the webkit prefix (older Safari)', () => {
    const std = fullscreenApi(fakeDoc());
    expect(std.change).toBe('fullscreenchange');
    expect(std.active()).toBe(false);
    const wk = fullscreenApi(fakeDoc({ std: false, webkit: true }));
    expect(wk.change).toBe('webkitfullscreenchange');
    wk.enter();
    expect(wk.active()).toBe(true);
    wk.exit();
    expect(wk.active()).toBe(false);
  });
});

describe('wireFullscreen', () => {
  it('leaves the button hidden when the browser has no Fullscreen API', () => {
    const btn = fakeButton();
    expect(wireFullscreen(btn, fakeDoc({ std: false }))).toBe(false);
    expect(btn.classList.contains('hidden')).toBe(true);
  });
  it('shows the button; a press enters, the next exits, and the label follows the change event', () => {
    const doc = fakeDoc();
    const btn = fakeButton();
    expect(wireFullscreen(btn, doc)).toBe(true);
    expect(btn.classList.contains('hidden')).toBe(false);
    expect(btn.textContent).toBe(fullscreenLabel(false));
    btn.click();
    expect(doc.fullscreenElement).toBe(doc.documentElement);
    expect(btn.textContent).toBe(fullscreenLabel(true));
    btn.click();
    expect(doc.fullscreenElement).toBe(null);
    expect(btn.textContent).toBe(fullscreenLabel(false));
  });
  it('follows Esc (the browser leaves fullscreen without the button)', () => {
    const doc = fakeDoc();
    const btn = fakeButton();
    wireFullscreen(btn, doc);
    btn.click();
    doc.fullscreenElement = null; // Esc
    doc.fire('fullscreenchange');
    expect(btn.textContent).toBe(fullscreenLabel(false));
  });
  it('a refused request (no gesture, kiosk policy) leaves the label alone and throws nothing', async () => {
    const doc = fakeDoc();
    doc.documentElement.requestFullscreen = () => Promise.reject(new Error('denied'));
    const btn = fakeButton();
    wireFullscreen(btn, doc);
    expect(() => btn.click()).not.toThrow();
    await Promise.resolve();
    expect(btn.textContent).toBe(fullscreenLabel(false));
  });
});
