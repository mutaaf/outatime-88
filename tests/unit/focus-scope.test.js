// Focus scope (ticket 0207): Tab wraps inside a menu and skips controls a player can't reach.
import { describe, it, expect } from 'vitest';
import { nextTab, tabbables, visible } from '../../src/focus-scope.js';

/** A stand-in element: enough of the DOM for tabbables() (vitest runs in node). */
const el = (id, { disabled = false, tabindex = null, shown = true } = {}) => ({
  id, disabled, isConnected: true,
  getAttribute: (k) => (k === 'tabindex' ? tabindex : null),
  checkVisibility: () => shown,
});
const root = (items) => ({ querySelectorAll: () => items });

describe('nextTab', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((id) => el(id));
  const list = [a, b, c];
  it('moves forward and back through the list', () => {
    expect(nextTab(list, a, false)).toBe(b);
    expect(nextTab(list, c, true)).toBe(b);
  });
  it('wraps from the last control to the first and from the first to the last', () => {
    expect(nextTab(list, c, false)).toBe(a);
    expect(nextTab(list, a, true)).toBe(c);
  });
  it('enters from outside at the first (Tab) or last (Shift+Tab) control', () => {
    expect(nextTab(list, el('body'), false)).toBe(a);
    expect(nextTab(list, null, true)).toBe(c);
  });
  it('stays put on a one-control menu and gives nothing for an empty one', () => {
    expect(nextTab([a], a, false)).toBe(a);
    expect(nextTab([], a, false)).toBe(null);
  });
});

describe('tabbables', () => {
  it('skips disabled, tabindex=-1 and hidden controls, keeping document order', () => {
    const ok1 = el('ok1'), ok2 = el('ok2', { tabindex: '0' });
    const items = [el('off', { disabled: true }), ok1, el('neg', { tabindex: '-1' }), el('gone', { shown: false }), ok2];
    expect(tabbables(root(items)).map((e) => e.id)).toEqual(['ok1', 'ok2']);
  });
  it('a detached element is never visible', () => {
    expect(visible({ ...el('x'), isConnected: false })).toBe(false);
    expect(visible(null)).toBe(false);
  });
});
