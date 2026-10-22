import { describe, it, expect } from 'vitest';
import { createAnnouncer, priorityFor } from '../../src/announcer.js';

function rig() {
  let t = 0;
  const shown = [];
  let visible = null;
  const a = createAnnouncer({
    now: () => t,
    show: (m) => { visible = m; shown.push(m.main); },
    hide: () => { visible = null; },
  });
  return { a, shown, get visible() { return visible; }, advance(ms) { t += ms; a.update(); } };
}

describe('announcer queue (ticket 0002)', () => {
  it('shows one message at a time and hides it after its duration', () => {
    const r = rig();
    r.a.push('A', '', 1000, 1);
    expect(r.visible.main).toBe('A');
    r.advance(999);
    expect(r.visible.main).toBe('A');
    r.advance(2);
    expect(r.visible).toBe(null);
  });

  it('equal priority waits its turn instead of drawing on top', () => {
    const r = rig();
    r.a.push('A', '', 1000, 1);
    r.a.push('B', '', 1000, 1);
    expect(r.visible.main).toBe('A');
    r.advance(1001);
    expect(r.visible.main).toBe('B');
  });

  it('higher priority preempts immediately', () => {
    const r = rig();
    r.a.push('tip', '', 3000, 1);
    r.a.push('WARP', '', 2000, 3);
    expect(r.visible.main).toBe('WARP');
  });

  it('re-pushing the visible message refreshes it rather than flickering or queueing', () => {
    const r = rig();
    r.a.push('A', '', 1000, 1);
    r.advance(800);
    r.a.push('A', '', 1000, 1);
    r.advance(800);
    expect(r.visible.main).toBe('A');
    expect(r.a.pending()).toBe(0);
  });

  it('drops stale queued messages and caps the queue', () => {
    const r = rig();
    r.a.push('long', '', 4000, 2);
    for (let i = 0; i < 10; i++) r.a.push('q' + i, '', 500, 1);
    expect(r.a.pending()).toBeLessThanOrEqual(3);
    r.advance(4001); // the queued ones are now older than the staleness window
    expect(r.visible).toBe(null);
  });

  it('isVisible reflects state for the coach to yield', () => {
    const r = rig();
    expect(r.a.isVisible()).toBe(false);
    r.a.push('A', '', 500, 1);
    expect(r.a.isVisible()).toBe(true);
  });

  it('infers priority from the message', () => {
    expect(priorityFor('⚡ 88 MPH TIME WARP! ➔ 1985 ⚡')).toBe(3);
    expect(priorityFor('SIDE-SLAM TAKEDOWN!')).toBe(2);
    expect(priorityFor('💨 SLIPSTREAM TURBO SLINGSHOT!')).toBe(1);
  });
});

describe('announcer writes once per announcement for screen readers (ticket 0030)', () => {
  it('re-pushing the visible message does not repaint it unless its sub line changes', () => {
    const r = rig();
    r.a.push('FINAL LAP', '', 1000, 2);
    r.advance(100);
    r.a.push('FINAL LAP', '', 1000, 2);
    r.a.push('FINAL LAP', '', 1000, 2);
    expect(r.shown).toEqual(['FINAL LAP']);
    expect(r.visible.main).toBe('FINAL LAP');
    r.advance(950); // the refresh still extended it
    expect(r.visible.main).toBe('FINAL LAP');
    r.a.push('FINAL LAP', 'LAST CHANCE', 1000, 2);
    expect(r.shown).toEqual(['FINAL LAP', 'FINAL LAP']);
  });
});
