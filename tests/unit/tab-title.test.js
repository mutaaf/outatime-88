// Tab title says PAUSED while the game is paused (ticket 0309).
import { describe, it, expect } from 'vitest';
import { tabTitle, PAUSED_TITLE, createTabTitle } from '../../src/tab-title.js';

const BASE = 'OUTATIME 88: Neon Time-Warp Street Racer';

describe('tabTitle', () => {
  it('is the paused title while paused and the original string otherwise', () => {
    expect(tabTitle(true, BASE)).toBe(PAUSED_TITLE);
    expect(PAUSED_TITLE).toBe('⏸ PAUSED · OUTATIME 88');
    expect(tabTitle(false, BASE)).toBe(BASE);
  });
});

function fakeDoc(title) {
  let t = title;
  const doc = { writes: 0 };
  Object.defineProperty(doc, 'title', { get: () => t, set: (v) => { t = v; doc.writes++; } });
  return doc;
}

describe('createTabTitle', () => {
  it('writes once per transition, never per frame, and restores the original exactly', () => {
    const doc = fakeDoc(BASE);
    const title = createTabTitle(doc);
    for (let i = 0; i < 30; i++) title.sync('PLAYING');
    expect(doc.writes).toBe(0);
    for (let i = 0; i < 30; i++) title.sync('PAUSED');
    expect(doc.writes).toBe(1);
    expect(doc.title).toBe(PAUSED_TITLE);
    for (let i = 0; i < 30; i++) title.sync('PLAYING');
    expect(doc.writes).toBe(2);
    expect(doc.title).toBe(BASE);
  });

  it('is the original on the title screen and results', () => {
    const doc = fakeDoc(BASE);
    const title = createTabTitle(doc);
    title.sync('PAUSED');
    title.sync('GAMEOVER');
    expect(doc.title).toBe(BASE);
    title.sync('PAUSED');
    title.sync('TITLE');
    expect(doc.title).toBe(BASE);
    expect(doc.writes).toBe(4);
  });

  it('does nothing without a document', () => {
    expect(() => createTabTitle(null).sync('PAUSED')).not.toThrow();
  });
});

describe('a hidden tab', () => {
  it('syncs on visibilitychange from the last game state it saw, with no frame in between', () => {
    const doc = fakeDoc(BASE);
    const listeners = [];
    doc.defaultView = { addEventListener: (t, fn) => { if (t === 'visibilitychange') listeners.push(fn); } };
    const title = createTabTitle(doc);
    const G = { status: 'PLAYING' };
    listeners.forEach((fn) => fn()); // before any frame: nothing to read
    title.frame(G);
    expect(doc.writes).toBe(0);
    G.status = 'PAUSED'; // settings-ui paused it on the hide
    listeners.forEach((fn) => fn());
    expect(doc.title).toBe(PAUSED_TITLE);
    expect(doc.writes).toBe(1);
  });
});
