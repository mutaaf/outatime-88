import { describe, it, expect } from 'vitest';
import { PENALTY, hitPenalty, wallPenalty, wallContactPenalty, createPenaltyLog, logHit, logWall, penaltyPoints, breakdown, logPayload, penaltyMismatch } from '../../src/scoring.js';

describe('penalty scoring (ticket 0073)', () => {
  it('a hit costs more the faster you hit it; traffic costs more than a barrier', () => {
    expect(hitPenalty('obstacle', 0)).toBe(PENALTY.obstacle.base);
    expect(hitPenalty('obstacle', 100)).toBeGreaterThan(hitPenalty('obstacle', 40));
    expect(hitPenalty('traffic', 80)).toBeGreaterThan(hitPenalty('obstacle', 80));
    expect(hitPenalty('obstacle', 9999)).toBe(hitPenalty('obstacle', PENALTY.maxMph));
    expect(hitPenalty('obstacle', 88.6)).toBe(hitPenalty('obstacle', 89));
  });

  it('a 90 mph hit stings next to a ~1M race but never wipes it out', () => {
    const p = hitPenalty('obstacle', 90);
    expect(p).toBeGreaterThan(10000);
    expect(p).toBeLessThan(50000);
  });

  it('live charges add up to exactly what the server recomputes from the log', () => {
    const log = createPenaltyLog();
    let charged = 0;
    charged += logHit(log, 'obstacle', 91.4);
    charged += logHit(log, 'traffic', 63.2);
    // 2.5 s of wall at 120 Hz in 1/120 s steps, plus a crawl that doesn't count
    for (let i = 0; i < 300; i++) charged += logWall(log, 1000 / 120, 70);
    for (let i = 0; i < 120; i++) charged += logWall(log, 1000 / 120, 12);
    const sent = JSON.parse(JSON.stringify(logPayload(log)));
    expect(penaltyPoints(sent)).toBe(charged);
    expect(Number.isInteger(sent.wallMs)).toBe(true);
    expect(sent.wallMs).toBeGreaterThanOrEqual(2499);
    expect(sent.wallMs).toBeLessThanOrEqual(2500);
    const earned = 812345;
    const sheet = breakdown(earned, log);
    expect(sheet.final).toBe(earned - charged);
    expect(penaltyMismatch({ score: sheet.final, earned, pen: sent, durationMs: 90000 })).toBeNull();
  });

  it('the breakdown never goes below zero and explains itself', () => {
    const log = createPenaltyLog();
    logHit(log, 'traffic', 120);
    logHit(log, 'obstacle', 50);
    logWall(log, 1234, 80);
    const b = breakdown(3000, log);
    expect(b.final).toBe(0);
    expect(b).toMatchObject({ obstacleHits: 1, trafficHits: 1, wallSec: 1.2 });
    expect(breakdown(5000, createPenaltyLog())).toMatchObject({ penalty: 0, final: 5000 });
  });

  it('the log is capped so a payload always fits the API body limit', () => {
    const log = createPenaltyLog();
    for (let i = 0; i < 1000; i++) logHit(log, i % 2 ? 'traffic' : 'obstacle', 255);
    expect(log.obstacle.length + log.traffic.length).toBe(PENALTY.maxHits);
    const body = JSON.stringify({ token: 'x'.repeat(120), initials: 'ABC', score: 1, earned: 1, distance: 1, durationMs: 1, warps: 1, level: 1, mode: 'ARCADE', car: 'TWIN_TURBINE', pen: logPayload(log) });
    expect(body.length).toBeLessThan(2048);
  });

  it('old clients (no log) are still accepted', () => {
    expect(penaltyMismatch({ score: 100 })).toBeNull();
    expect(wallPenalty(-5)).toBe(0);
  });
});

describe('wall scrapes, rules v3 (ticket 0165)', () => {
  const step = 1000 / 120;
  /** Grind the wall for `ms` starting at race time `t0` (ms); returns points charged. */
  function grind(log, t0, ms, mph = 80) {
    let charged = 0;
    for (let t = 0; t < ms; t += step) charged += logWall(log, step, mph, Math.round(t0 + t));
    return charged;
  }

  it('a touch is a small tap; a long grind is capped per contact', () => {
    const tap = createPenaltyLog();
    expect(grind(tap, 1000, 100)).toBe(PENALTY.wall.tap);
    const long = createPenaltyLog();
    const charged = grind(long, 1000, 3000);
    expect(charged).toBe(PENALTY.wall.tap + Math.floor((PENALTY.wall.billMs * PENALTY.wall.perSec) / 1000));
    expect(charged).toBeLessThanOrEqual(300);
    expect(long).toMatchObject({ wallN: 1, wallBill: PENALTY.wall.billMs });
    // The old rules would have charged ~12,000 for the same three seconds.
    expect(wallPenalty(long.wallMs)).toBeGreaterThan(11000);
  });

  it('the first 250 ms of a contact only costs the tap', () => {
    const log = createPenaltyLog();
    expect(grind(log, 0, 240)).toBe(PENALTY.wall.tap);
    expect(log.wallBill).toBe(0);
  });

  it('touches close together are one contact; a real gap starts a new one', () => {
    const log = createPenaltyLog();
    grind(log, 1000, 200);
    grind(log, 1400, 200);               // 200 ms after the last touch: same contact
    expect(log.wallN).toBe(1);
    grind(log, 3000, 200);               // well clear: a new contact
    expect(log.wallN).toBe(2);
  });

  it('bouncing along the wall all race stays far below the old cost', () => {
    const log = createPenaltyLog();
    let charged = 0;
    for (let i = 0; i < 40; i++) charged += grind(log, i * 3000, 1200);
    expect(charged).toBe(penaltyPoints(log));
    expect(charged).toBeLessThan(40 * 300 + 1);
    expect(wallPenalty(log.wallMs)).toBeGreaterThan(charged * 10);
  });

  it('client charges equal the server recompute, and the server accepts the run', () => {
    const log = createPenaltyLog();
    let charged = logHit(log, 'obstacle', 77);
    for (let i = 0; i < 12; i++) charged += grind(log, 5000 + i * 2100, 300 + i * 170);
    charged += grind(log, 5000, 50, 12); // crawling: free
    const sent = JSON.parse(JSON.stringify(logPayload(log)));
    expect(Object.values(sent).every((v) => Array.isArray(v) || Number.isInteger(v))).toBe(true);
    expect(penaltyPoints(sent)).toBe(charged);
    expect(wallContactPenalty(sent.wallN, sent.wallBill)).toBe(charged - 5000 - 150 * 77);
    const earned = 900000;
    expect(penaltyMismatch({ score: earned - charged, earned, pen: sent, durationMs: 60000 })).toBeNull();
    expect(penaltyMismatch({ score: earned - charged + 1, earned, pen: sent, durationMs: 60000 })).toMatch(/match/);
  });

  it('old v2 logs (no wallN) keep the old rules and still validate', () => {
    const pen = { obstacle: [80], traffic: [], cone: [], wallMs: 1500 };
    const earned = 500000;
    const expected = earned - (hitPenalty('obstacle', 80) + 6000);
    expect(penaltyPoints(pen)).toBe(hitPenalty('obstacle', 80) + 6000);
    expect(penaltyMismatch({ score: expected, earned, pen, durationMs: 60000 })).toBeNull();
  });

  it('the server rejects forged contact totals', () => {
    const base = { obstacle: [], traffic: [], cone: [], wallMs: 3000 };
    const ok = (pen, durationMs = 60000) => penaltyMismatch({ score: 1000 - penaltyPoints(pen), earned: 1000, pen, durationMs });
    expect(ok({ ...base, wallN: 2, wallBill: 2500 })).toBeNull();
    expect(ok({ ...base, wallN: 1, wallBill: 2000 })).toMatch(/log/);        // over the per-contact bill
    expect(ok({ ...base, wallN: 3, wallBill: 3500 })).toMatch(/log/);        // billed more than scraped
    expect(ok({ ...base, wallN: 0, wallBill: 0 })).toMatch(/log/);           // scraped without a contact
    expect(ok({ ...base, wallN: 2.5, wallBill: 0 })).toMatch(/log/);
    expect(ok({ ...base, wallN: 200, wallBill: 0 }, 20000)).toMatch(/log/); // contacts too close together
  });

  it('a full v3 log still fits the API body limit', () => {
    const log = createPenaltyLog();
    for (let i = 0; i < 1000; i++) logHit(log, i % 2 ? 'traffic' : 'obstacle', 255);
    for (let i = 0; i < 700; i++) grind(log, i * 1000, 100);
    expect(log.wallN).toBe(PENALTY.wall.maxContacts);
    const body = JSON.stringify({ token: 'x'.repeat(120), initials: 'ABC', score: 1, earned: 1, distance: 1, durationMs: 1, warps: 1, level: 1, mode: 'ARCADE', car: 'TWIN_TURBINE', pen: logPayload(log) });
    expect(body.length).toBeLessThan(2048);
  });
});
