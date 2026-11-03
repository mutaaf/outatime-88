// Era signature hazards (ticket 0113): each era spills its own knockable prop. In two eras,
// the spill lands on the far side of the racing line, the race draws on without errors, and a hit
// swats it aside for a cone-scale penalty under the era's own label, never HP.
import { test, expect } from '@playwright/test';
import { APP, watchPage, racing, nextFrames } from './helpers.js';

const ERAS = [
  { index: 2, id: '1885', kind: 'TUMBLEWEED', label: 'TUMBLEWEED' },
  { index: 6, id: '2061', kind: 'ICE_SHARD', label: 'ICE HIT' },
];

for (const era of ERAS) {
  test(`${era.id}: the era's own prop spills clear of the line and costs a small penalty when hit`, async ({ page }) => {
    const problems = watchPage(page);
    await page.goto(`${APP}?debug`);
    await page.evaluate(() => window.__OT.startRace());
    await racing(page);
    await page.evaluate((i) => { window.__OT.GameState.eraIndex = i; }, era.index);

    // The spill the race places on its own: the era's kind, knockable, all on one side of the line.
    const spill = await page.evaluate(() => {
      const T = window.__OT.traffic(); const G = window.__OT.GameState;
      const z = (G.visualPlayerZ || G.trackPos + 1250) + 2000;
      const items = T.spawnEraSpill(z);
      const line = T.planner.line;
      const bodies = T.props.live.filter((b) => items.some((it) => it.z === b.worldZ && it.type === b.type));
      return {
        items, n: bodies.length, knockable: bodies.every((b) => b.knockable && b.massKg < 30),
        clear: items.every((it) => line.isClear(it.z, it.offset, 0.04, 24)),
        side: new Set(items.map((it) => Math.sign(it.offset))).size,
      };
    });
    expect(spill.items.length).toBeGreaterThan(0);
    expect(spill.items.every((it) => it.type === era.kind)).toBe(true);
    expect(spill.n).toBe(spill.items.length);
    expect(spill.knockable).toBe(true);
    expect(spill.clear).toBe(true);
    expect(spill.side).toBe(1);
    await nextFrames(page, 4);

    // Drive into one placed in the lane: it flies, you pay a cone penalty, HP is untouched.
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => window.__OT.GameState.speed > 40, null, { timeout: 15000 });
    const before = await page.evaluate((kind) => {
      const T = window.__OT.traffic(); const G = window.__OT.GameState;
      // Close ahead, so no rival or traffic car can knock it first (debris never costs points).
      const z = (G.visualPlayerZ || G.trackPos + 1250) + 320;
      T.spawnPropItems([{ type: kind, z, offset: G.playerX }]);
      T.rebuildBodyLists();
      window.__prop = T.props.live.find((b) => b.type === kind && b.worldZ === z);
      return { hp: G.hp, cones: G.penaltyLog.cone.length, found: !!window.__prop };
    }, era.kind);
    expect(before.found).toBe(true);
    await page.waitForFunction(() => window.__prop.hitCount > 0, null, { timeout: 8000 });
    const after = await page.evaluate(() => ({ vz: window.__prop.vz, hp: window.__OT.GameState.hp, cones: window.__OT.GameState.penaltyLog.cone.length }));
    await page.keyboard.up('ArrowUp');
    expect(after.vz).toBeGreaterThan(0);
    expect(after.cones).toBe(before.cones + 1);
    expect(after.hp).toBe(before.hp);
    await expect(page.locator('#hudPenalty')).toContainText(era.label);
    expect(problems).toEqual([]);
  });
}
