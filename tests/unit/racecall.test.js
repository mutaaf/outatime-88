import { describe, it, expect } from 'vitest';
import { START, startHint, judgeLaunch, LAUNCH_EFFECT, createStartSequence, lineupCall, createCallouts, finishResults, resultHeadline } from '../../src/racecall.js';

const run = (seq, seconds, step = 0.05) => {
  const out = [];
  for (let t = 0; t < seconds; t += step) out.push(...seq.update(step).map((e) => ({ ...e })));
  return out;
};

describe('start sequence (ticket 0052)', () => {
  it('calls every racer, shows the grid, then 3-2-1-GO', () => {
    const seq = createStartSequence({ racers: 6, lineup: true });
    const ev = run(seq, 6 * START.card + START.hold + 3 * START.light + START.goHold + 0.2);
    const types = ev.map((e) => e.type + (e.index ?? '') + (e.n ?? ''));
    expect(types).toEqual(['card0', 'card1', 'card2', 'card3', 'card4', 'card5', 'grid', 'light3', 'light2', 'light1', 'go', 'done']);
    expect(seq.done).toBe(true);
  });

  it('a retry skips the lineup and goes straight to the lights', () => {
    const seq = createStartSequence({ racers: 6, lineup: false });
    const ev = run(seq, 3 * START.light + 0.1);
    expect(ev.map((e) => e.type)).toEqual(['light', 'light', 'light', 'go']);
  });

  it('a tap during the lineup jumps to the lights without replaying cards', () => {
    const seq = createStartSequence({ racers: 6, lineup: true });
    run(seq, 1.0);
    expect(seq.inLineup).toBe(true);
    expect(seq.skip()).toBe(true);
    expect(seq.inLineup).toBe(false);
    const ev = run(seq, 3 * START.light + 0.1);
    expect(ev.filter((e) => e.type === 'card')).toEqual([]);
    expect(ev.map((e) => e.type)).toContain('go');
    expect(seq.skip()).toBe(false);
  });

  it('t counts to GO: negative during the lights, zero at green', () => {
    const seq = createStartSequence({ racers: 2, lineup: false });
    seq.update(0.1);
    expect(seq.t).toBeCloseTo(0.1 - 3 * START.light);
    run(seq, 3 * START.light);
    expect(seq.started).toBe(true);
  });
});

describe('rocket start', () => {
  it('judges a tap against green', () => {
    expect(judgeLaunch(-1.5)).toBe('early');
    expect(judgeLaunch(-0.2)).toBe('perfect');
    expect(judgeLaunch(0.05)).toBe('perfect');
    expect(judgeLaunch(0.3)).toBe('good');
    expect(judgeLaunch(0.8)).toBe(null);
    expect(judgeLaunch(null)).toBe(null);
  });
  it('perfect beats good, and jumping the start stalls you', () => {
    expect(LAUNCH_EFFECT.perfect.mph).toBeGreaterThan(LAUNCH_EFFECT.good.mph);
    expect(LAUNCH_EFFECT.early.stall).toBeGreaterThan(0);
  });
});

describe('announcer lines', () => {
  it('names each racer by grid slot and calls you last', () => {
    expect(lineupCall({ driver: 'Dez Navarro' }, 0, 6)).toMatchObject({ tag: 'ON POLE', name: 'DEZ NAVARRO' });
    expect(lineupCall({ driver: 'Vex & Ion Arden' }, 2, 6).say).toBe('Vex and Ion Arden');
    expect(lineupCall({ isPlayer: true }, 5, 6)).toMatchObject({ name: 'YOU!', tag: 'AND AT THE BACK…' });
  });
});

describe('live callouts', () => {
  it('announces a settled place change once, not every flicker in a pack', () => {
    const c = createCallouts({ settle: 0.5, gap: 1 });
    c.reset(6);
    expect(c.update(0.1, 5, 1)).toBe(null); // just changed: wait to see if it sticks
    expect(c.update(0.2, 6, 1)).toBe(null); // flicked back
    expect(c.update(0.1, 5, 1)).toBe(null);
    expect(c.update(0.3, 5, 1)).toBe(null);
    const up = c.update(0.3, 5, 1);
    expect(up).toMatchObject({ kind: 'up' });
    expect(up.main).toContain('5TH');
    expect(c.update(0.1, 5, 1)).toBe(null); // no repeat
  });
  it('rate-limits, celebrates the lead, and always calls laps', () => {
    const c = createCallouts({ settle: 0.1, gap: 2 });
    c.reset(3);
    c.update(0.05, 1, 1);
    expect(c.update(0.2, 1, 1).main).toContain('1ST');
    c.update(0.05, 2, 1);
    expect(c.update(0.3, 2, 1)).toBe(null); // settled, but too soon after the last callout
    const lap = c.update(0.1, 1, 2);
    expect(lap).toMatchObject({ kind: 'lap', main: 'LAP 2/3' });
    expect(c.update(0.1, 1, 3)).toMatchObject({ kind: 'final' });
  });
});

describe('results', () => {
  const field = [
    { id: 'a', driver: 'Dez Navarro', progress: 5200, finishTime: 61.2, mph: 90 },
    { id: 'b', driver: 'Kai Mercer', progress: 5100, finishTime: null, mph: 100 },
    { id: 'YOU', isPlayer: true, progress: 5200, finishTime: 60.4 },
    { id: 'c', driver: 'Rin Takamura', progress: 4000, finishTime: null, mph: 80 },
  ];
  it('orders finishers by time then the rest by distance, projecting their times', () => {
    const rows = finishResults(field, { elapsed: 62, length: 5200 });
    expect(rows.map((r) => r.name)).toEqual(['YOU', 'Dez Navarro', 'Kai Mercer', 'Rin Takamura']);
    expect(rows[0]).toMatchObject({ place: 1, isPlayer: true, timeText: '1:00.4' });
    expect(rows[2].timeText).toBe('1:03.0*');
    expect(rows[3].timeText).toBe('1:17.0*');
  });
  it('marks your row TIME UP or WRECKED when you did not reach the line', () => {
    const f = field.map((e) => (e.isPlayer ? { ...e, progress: 4500, finishTime: null } : e));
    expect(finishResults(f, { elapsed: 100, length: 5200, playerOutcome: 'timeup' }).find((r) => r.isPlayer).timeText).toBe('TIME UP');
    expect(finishResults(f, { elapsed: 100, length: 5200, playerOutcome: 'wrecked' }).find((r) => r.isPlayer).place).toBe(3);
  });
  it('picks a headline for how it went', () => {
    expect(resultHeadline(1, 6, { startPos: 6 }).line).toMatch(/back of the grid/);
    expect(resultHeadline(2, 6, { startPos: 6 }).line).toMatch(/comeback/);
    expect(resultHeadline(4, 6, { beatBy: 0.4 }).line).toMatch(/So close/);
    expect(resultHeadline(6, 6, { beatBy: 3 }).title).toBe('6TH PLACE');
    expect(resultHeadline(3, 6, { outcome: 'wrecked' }).title).toBe('WRECKED!');
  });
});

describe('start prompt worded for the input in hand (ticket 0111)', () => {
  it('keyboard names the real keys and never says TAP', () => {
    const h = startHint('keys');
    expect(h.launch).toMatch(/SPACE/);
    expect(h.skip).toMatch(/ENTER/);
    expect(h.launch + h.skip).not.toMatch(/TAP/);
  });
  it('a gamepad names the pad button, touch keeps the ⚡ wording, a paired phone its BOOST button', () => {
    expect(startHint('pad').launch).toMatch(/\bX\b/);
    expect(startHint('pad').skip).toMatch(/\bX\b/);
    expect(startHint('pad').launch + startHint('pad').skip).not.toMatch(/TAP|SPACE|ENTER/);
    expect(startHint('touch')).toEqual({ launch: 'TAP ⚡ RIGHT ON GREEN FOR A ROCKET START', skip: 'TAP TO SKIP ▶▶' });
    expect(startHint('phone').launch).toMatch(/BOOST/);
  });
  it('an unknown input falls back to the touch wording, or keys when told it is a desktop', () => {
    expect(startHint(undefined)).toEqual(startHint('touch'));
    expect(startHint('', 'keys')).toEqual(startHint('keys'));
  });
});
