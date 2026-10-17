import { describe, it, expect } from 'vitest';
import { PENALTY, hitPenalty, wallPenalty, createPenaltyLog, logHit, logWall, penaltyPoints, breakdown, logPayload, penaltyMismatch } from '../../src/scoring.js';

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
