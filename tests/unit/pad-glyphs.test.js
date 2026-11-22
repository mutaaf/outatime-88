// Ticket 0283: pad prompts name the buttons of the pad in hand (PlayStation, Switch), not only Xbox letters.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { padFamily, padLabels, padText, padTable, padSpoken, padHTML, PAD_KEYS } from '../../src/pad-glyphs.js';
import { START_HINTS } from '../../src/racecall.js';
import { PLAY_HINTS } from '../../src/play-hints.js';
import { controlRows, pauseNote } from '../../src/controls-ref.js';

const XBOX = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
const XBOX_ONE = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const DUALSENSE = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const DUALSHOCK_FF = '054c-09cc-Wireless Controller'; // Firefox's id shape
const SWITCH_PRO = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';
const JOYCON = 'Joy-Con L+R (STANDARD GAMEPAD)';

describe('padFamily', () => {
  it('reads the family from real pad ids', () => {
    expect(padFamily(XBOX)).toBe('xbox');
    expect(padFamily(XBOX_ONE)).toBe('xbox');
    expect(padFamily(DUALSENSE)).toBe('ps');
    expect(padFamily(DUALSHOCK_FF)).toBe('ps');
    expect(padFamily('DualSense Wireless Controller')).toBe('ps');
    expect(padFamily('Wireless Controller')).toBe('ps');
    expect(padFamily(SWITCH_PRO)).toBe('switch');
    expect(padFamily(JOYCON)).toBe('switch');
  });
  it('anything unknown, empty or missing is Xbox (no change for current players)', () => {
    for (const id of ['', undefined, null, 'Generic USB Joystick', '8BitDo SN30 Pro', 42]) expect(padFamily(id)).toBe('xbox');
    // A Sony or Nintendo number as another maker's product id is not that maker's pad.
    expect(padFamily('Arcade Stick (STANDARD GAMEPAD Vendor: 0f0d Product: 054c)')).toBe('xbox');
    expect(padFamily('Arcade Stick (STANDARD GAMEPAD Vendor: 0f0d Product: 057e)')).toBe('xbox');
    expect(padFamily('057e-2009-Pro Controller')).toBe('switch');
  });
});

describe('padLabels', () => {
  it('names all nine buttons per family, by the position of the standard-mapping button', () => {
    // RS (right stick click, 0298) can hold a rebound action.
    expect(PAD_KEYS).toEqual(['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'RS']);
    for (const f of ['xbox', 'ps', 'switch']) expect(Object.keys(padLabels(f)).sort()).toEqual([...PAD_KEYS].sort());
    expect(padLabels('xbox')).toEqual({ A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', RS: 'RS' });
    expect(padLabels('ps')).toEqual({ A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', RS: 'R3' });
    // Nintendo's letters sit swapped: the bottom button (standard 0) is B, the left one (2) is Y.
    expect(padLabels('switch')).toEqual({ A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', RS: 'RS' });
    expect(padLabels('nope')).toBe(padLabels('xbox'));
  });
});

describe('padText', () => {
  it('rewrites the grid hint: boost is standard button 2 (left face) or RB', () => {
    expect(padText(START_HINTS.pad.launch, 'ps')).toBe('PRESS □ OR R1 RIGHT ON GREEN FOR A ROCKET START');
    expect(padText(START_HINTS.pad.launch, 'switch')).toBe('PRESS Y OR R RIGHT ON GREEN FOR A ROCKET START');
    expect(padText(START_HINTS.pad.skip, 'ps')).toBe('PRESS □ TO SKIP ▶▶');
    expect(padText(START_HINTS.pad.launch, 'xbox')).toBe(START_HINTS.pad.launch);
  });
  it('never touches the article A, words that contain a button name, or chains a swap', () => {
    expect(padText(PLAY_HINTS.pad.ramp, 'ps')).toBe('PRESS □ OR △ FOR A MID-AIR TRICK!');
    expect(padText(PLAY_HINTS.pad.ramp, 'switch')).toBe('PRESS Y OR X FOR A MID-AIR TRICK!');
    expect(padText('START · PAUSE · A or START to resume', 'switch')).toBe('START · PAUSE · B or START to resume');
    expect(padText('L-STICK · D-PAD', 'ps')).toBe('L-STICK · D-PAD');
  });
  it('every pad play hint is rewritten in full for each family', () => {
    expect(padText(PLAY_HINTS.pad.slide, 'ps')).toBe('💥 BLOCKED! HOLD ○ / L2 TO SLIDE UNDER!');
    expect(padText(PLAY_HINTS.pad.jump, 'switch')).toBe('💥 BLOCKED! JUMP (X) OR STEER AROUND!');
    expect(padText(PLAY_HINTS.pad.coachFlux, 'ps')).toBe('Hold 88 mph — or press □ / R1 — to jump eras');
    expect(padText(PLAY_HINTS.pad.flux, 'ps')).toBe('⚡ FLUX READY! HIT 88 MPH OR □!');
    expect(padText(PLAY_HINTS.pad.hop, 'ps')).toBe('Hop it (△)');
    expect(padText(PLAY_HINTS.pad.duck, 'switch')).toBe('Hold A / ZL to duck');
    // No Xbox letter survives in a PlayStation table.
    const ps = padTable(PLAY_HINTS.pad, 'ps');
    for (const t of Object.values(ps)) expect(t).not.toMatch(/\b(?:[LR][BT]|[BXY])\b/);
  });
});

describe('padTable', () => {
  it('Xbox gets the very same table; other families one cached copy, built once', () => {
    expect(padTable(PLAY_HINTS.pad, 'xbox')).toBe(PLAY_HINTS.pad);
    const a = padTable(PLAY_HINTS.pad, 'ps');
    expect(a).toBe(padTable(PLAY_HINTS.pad, 'ps'));
    expect(a).not.toBe(padTable(PLAY_HINTS.pad, 'switch'));
    expect(Object.keys(a)).toEqual(Object.keys(PLAY_HINTS.pad));
    expect(padTable(START_HINTS.pad, 'ps').launch).toBe('PRESS □ OR R1 RIGHT ON GREEN FOR A ROCKET START');
  });
});

describe('controls card', () => {
  const rows = (kind, opts) => Object.fromEntries(controlRows(kind, opts).rows.map((r) => [r.label, r.value]));
  it('the pad card names the pad in hand: ✕ · R2 for gas on a DualSense', () => {
    const ps = rows('pad', { words: (t) => padText(t, 'ps') });
    expect(ps).toEqual({ STEER: 'L-STICK · D-PAD', GAS: '✕ · R2', BRAKE: '○ · L2', WARP: '□ · R1', NOS: 'L1', JUMP: '△' });
    const sw = rows('pad', { words: (t) => padText(t, 'switch') });
    expect(sw).toMatchObject({ GAS: 'B · ZR', BRAKE: 'A · ZL', WARP: 'Y · R', NOS: 'L', JUMP: 'X' });
    expect(rows('pad', {})).toMatchObject({ GAS: 'A · RT', WARP: 'X · RB' });
    // The words only apply to the pad card.
    expect(rows('touch', { words: () => 'nope' }).GAS).toBe('AUTO');
  });
  it('the pause line names the pad in hand', () => {
    expect(pauseNote('pad', false, (t) => padText(t, 'ps'))).toBe('START · PAUSE · ✕ or START to resume');
    expect(pauseNote('pad')).toBe('START · PAUSE · A or START to resume');
    expect(pauseNote('keys', false, () => 'x')).toBe('');
  });
});

describe('padSpoken', () => {
  it('says the PlayStation shapes as words for screen readers', () => {
    expect(padSpoken('✕ or R2')).toBe('Cross or R2');
    expect(padSpoken('○ or L2 / □ / △')).toBe('Circle or L2 / Square / Triangle');
    expect(padSpoken('A or RT')).toBe('A or RT');
  });
});

describe('the reconnect line and live text', () => {
  it('"START OR A TO DRIVE" names the pad in hand', () => {
    const back = '🎮 CONTROLLER BACK. PRESS START OR A TO DRIVE';
    expect(padText(back, 'ps')).toBe('🎮 CONTROLLER BACK. PRESS START OR ✕ TO DRIVE');
    expect(padText(back, 'switch')).toBe('🎮 CONTROLLER BACK. PRESS START OR B TO DRIVE');
  });
  it('padHTML gives each shape a spoken name and escapes the rest', () => {
    expect(padHTML('PRESS □ OR R1 <now>')).toBe('PRESS <span role="img" aria-label="Square">□</span> OR R1 &lt;now&gt;');
    expect(padHTML('PRESS X')).toBe('PRESS X');
  });
});

describe('the pad in hand', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it('is the first connected pad, re-read on connect and disconnect; none is Xbox', async () => {
    const win = new EventTarget();
    let pads = [null, { connected: true, id: DUALSENSE }];
    vi.stubGlobal('window', win);
    vi.stubGlobal('navigator', { getGamepads: () => pads });
    vi.resetModules();
    const m = await import('../../src/pad-glyphs.js');
    expect(m.heldFamily()).toBe('ps');
    pads = [{ connected: true, id: SWITCH_PRO }, { connected: true, id: DUALSENSE }];
    win.dispatchEvent(new Event('gamepadconnected'));
    expect(m.heldFamily()).toBe('switch');
    pads = [{ connected: false, id: SWITCH_PRO }, null];
    win.dispatchEvent(new Event('gamepaddisconnected'));
    expect(m.heldFamily()).toBe('xbox');
    // A table read now follows the pad in hand.
    pads = [{ connected: true, id: DUALSENSE }];
    expect(m.scan()).toBe('ps');
    expect(m.padTable(START_HINTS.pad).skip).toBe('PRESS □ TO SKIP ▶▶');
  });
});
