// Ticket 0282: reflector posts stream past both road edges at a fixed world spacing.
import { describe, it, expect } from 'vitest';
import { POSTS, postPhase, postSide, postsIn, drawEdgePosts, stats } from '../../src/edge-posts.js';
import { ROAD_CFG, ERAS } from '../../src/data.js';

const S = POSTS.spacing, L = ROAD_CFG.segLength;

/** World z of every post in [z0, z1), the way the draw loop walks them. */
function postsBetween(z0, z1) {
  const out = [];
  for (let z = postPhase(z0); z < z1; z += S / 2) out.push(z);
  return out;
}

/** A canvas stand-in that records fills (colour, alpha, rect). */
function fakeCtx(width = 1280) {
  const fills = [];
  return {
    canvas: { width, height: 720 }, globalAlpha: 1, fillStyle: '#000',
    fillRect(x, y, w, h) { fills.push({ style: this.fillStyle, alpha: this.globalAlpha, x, y, w, h }); },
    fills,
  };
}

/** `count` straight-road segments from world z `z0`, projected so they shrink into the distance. */
function segsFrom(z0, count, type = 'STANDARD') {
  const segs = [];
  for (let i = 0; i < count; i++) {
    const w1 = 600 / (1 + i * 0.25), w2 = 600 / (1 + (i + 1) * 0.25);
    segs.push({
      trackType: type,
      p1: { world: { z: z0 + i * L }, screen: { x: 640, y: 700 - i * 4, w: w1 } },
      p2: { world: { z: z0 + (i + 1) * L }, screen: { x: 640, y: 700 - (i + 1) * 4, w: w2 } },
    });
  }
  return segs;
}

describe('edge reflector posts (ticket 0282)', () => {
  it('postPhase gives the same post positions every time, on the half-step grid', () => {
    const a = postsBetween(12345, 40000), b = postsBetween(12345, 40000);
    expect(a).toEqual(b);
    expect(a[0]).toBeGreaterThanOrEqual(12345);
    expect(a[0] - S / 2).toBeLessThan(12345);
    for (const z of a) expect(z % (S / 2)).toBe(0);
    expect(postPhase(S)).toBe(S); // a post exactly at z stays at z
  });

  it('sides alternate, so each side has one post per spacing', () => {
    const zs = postsBetween(0, S * 10);
    for (let i = 1; i < zs.length; i++) expect(postSide(zs[i])).toBe(-postSide(zs[i - 1]));
    const left = zs.filter((z) => postSide(z) < 0), right = zs.filter((z) => postSide(z) > 0);
    expect(left.length).toBe(10);
    expect(right.length).toBe(10);
    for (let i = 1; i < left.length; i++) expect(left[i] - left[i - 1]).toBe(S);
  });

  it('counts the expected number of posts in a visible window', () => {
    const window = ROAD_CFG.drawDistance * L;
    expect(postsIn(1000, 1000 + window)).toBe(postsBetween(1000, 1000 + window).length);
    expect(postsIn(1000, 1000 + window)).toBe(Math.round(window / (S / 2)));
    expect(postsIn(500, 500)).toBe(0);
  });

  it('the pass rate at a fixed screen line is speed / spacing per side (within 5%)', () => {
    // A camera driving at `speed` units/s: count right-side posts crossing a line 1250 ahead.
    for (const speed of [1500, 3900, 5060, 8000]) {
      const T = 30, line = 1250;
      let passed = 0;
      for (const z of postsBetween(line, line + speed * T)) if (postSide(z) > 0) passed++;
      const rate = passed / T, want = speed / S;
      expect(Math.abs(rate - want) / want).toBeLessThan(0.05);
    }
  });

  it('draws posts on both edges in the era rail colour, on every railed era', () => {
    for (const era of ERAS.filter((e) => !e.deck)) {
      const ctx = fakeCtx();
      const n = drawEdgePosts(ctx, segsFrom(0, 40), era, 1280);
      expect(n, era.id).toBeGreaterThan(0);
      expect(stats.posts).toBe(n);
      const bodies = ctx.fills.filter((f) => f.style === era.railColor);
      const caps = ctx.fills.filter((f) => f.style === POSTS.capColor);
      expect(bodies.length, era.id).toBe(n);
      expect(caps.length, era.id).toBe(n);
      expect(bodies.some((f) => f.x < 640)).toBe(true);
      expect(bodies.some((f) => f.x > 640)).toBe(true);
      expect(ctx.globalAlpha).toBe(1); // left as it found it
    }
  });

  it('the 2061 skyway (no guardrail) draws no posts', () => {
    const sky = ERAS.find((e) => e.id === '2061');
    expect(sky.deck).toBeTruthy();
    const ctx = fakeCtx();
    expect(drawEdgePosts(ctx, segsFrom(0, 40), sky, 1280)).toBe(0);
    expect(ctx.fills.length).toBe(0);
  });

  it('no posts over a jump gap or on segments too far to see', () => {
    const era = ERAS[0];
    expect(drawEdgePosts(fakeCtx(), segsFrom(0, 40, 'GAP'), era, 1280)).toBe(0);
    const tiny = segsFrom(0, 40).map((s) => ({ ...s, p1: { ...s.p1, screen: { ...s.p1.screen, w: 2 } } }));
    expect(drawEdgePosts(fakeCtx(), tiny, era, 1280)).toBe(0);
  });

  it('caps the count, dropping the farthest posts first', () => {
    const era = ERAS[0];
    const segs = segsFrom(0, 400).map((s) => ({ ...s, p1: { ...s.p1, screen: { ...s.p1.screen, w: 50 } } }));
    const ctx = fakeCtx();
    expect(drawEdgePosts(ctx, segs, era, 1280)).toBe(POSTS.cap);
    // Drawn far to near: the last body is the nearest post (the segment nearest the camera).
    const bodies = ctx.fills.filter((f) => f.style === era.railColor);
    expect(bodies.at(-1).y).toBeGreaterThan(bodies[0].y);
    expect(bodies.at(-1).y).toBeGreaterThan(690);
  });

  it('nearer reflectors are brighter (headlights), and the same frame draws the same thing', () => {
    const era = ERAS[0];
    const a = fakeCtx(), b = fakeCtx();
    drawEdgePosts(a, segsFrom(0, 40), era, 1280);
    drawEdgePosts(b, segsFrom(0, 40), era, 1280);
    expect(a.fills).toEqual(b.fills); // steady: nothing depends on the clock
    const caps = a.fills.filter((f) => f.style === POSTS.capColor);
    expect(caps.at(-1).alpha).toBeGreaterThan(caps[0].alpha);
  });

  it('a post beyond a hill crest is hidden (its foot is below the nearer deck)', () => {
    const era = ERAS[0];
    const segs = segsFrom(0, 40);
    // Segments 0-9 climb to a crest at y 600; segment 10 onward reappears lower, behind it.
    for (let i = 0; i < 40; i++) {
      const s = segs[i];
      if (i < 10) { s.p1.screen.y = 700 - i * 10; s.p2.screen.y = 700 - (i + 1) * 10; }
      else { s.p1.screen.y = 650 - (i - 10); s.p2.screen.y = 649 - (i - 10); }
    }
    const ctx = fakeCtx();
    drawEdgePosts(ctx, segs, era, 1280);
    const feet = ctx.fills.filter((f) => f.style === era.railColor).map((f) => f.y + f.h);
    // Only the posts in front of the crest (segments 0-9: z 0, 800, 1600) are drawn.
    expect(feet.sort((a, b) => b - a)).toEqual([700, 660, 620]);
    // Without the crest the same road shows posts beyond it too.
    expect(drawEdgePosts(fakeCtx(), segsFrom(0, 40), era, 1280)).toBeGreaterThan(3);
  });

  it('a thousand frames on the same road draw exactly the same posts (no state, no growth)', () => {
    const era = ERAS[0], segs = segsFrom(0, 140);
    const first = fakeCtx();
    const n = drawEdgePosts(first, segs, era, 1280);
    let ctx;
    for (let k = 0; k < 1000; k++) { ctx = fakeCtx(); expect(drawEdgePosts(ctx, segs, era, 1280)).toBe(n); }
    expect(ctx.fills).toEqual(first.fills);
  });
});
