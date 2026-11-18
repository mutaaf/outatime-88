// Reflector posts along both road edges (ticket 0282): speed is read from things streaming past,
// and the long stretches between boards and palms showed only the deck stripes moving. Short posts
// stand at a fixed world spacing, one every POSTS.spacing per side, the two sides half a step apart
// (post k stands on the left when k is even). Spacing never changes with speed, so speed alone
// sets the rate they pass: speed / spacing per side.
//
// Drawn by src/setpieces-2d.js drawAhead (a lazy chunk, after the road deck and before every
// sprite), so cars, pickups and labels always draw over them. Steady in time (no flashing), no
// allocation per frame. The 2061 skyway (an era with a `deck`) has no guardrail and no posts.
import { ROAD_CFG } from './data.js';

export const POSTS = {
  spacing: 1600,   // world units between posts on one side (8 segments; ~3 a second per side at 88)
  cap: 48,         // most posts drawn in a frame (the far ones are culled first: drawn far to near)
  minW: 6,         // road half-width (px) below which a segment is too far for a post
  out: 1.3,        // post x, in road half-widths from the centre (the rail lip is at 1.12)
  capColor: '#fff1b8', // the reflector cap (e2e counts posts by this fill)
};

/** World z of the first post at or after `z` (posts every spacing / 2, alternating sides). */
export function postPhase(z, spacing = POSTS.spacing) {
  const half = spacing / 2;
  return Math.ceil(z / half) * half;
}

/** -1 left, +1 right: which edge the post at world `z` stands on. */
export function postSide(z, spacing = POSTS.spacing) {
  return (Math.round(z / (spacing / 2)) & 1) ? 1 : -1;
}

/** How many posts stand in [z0, z1). */
export function postsIn(z0, z1, spacing = POSTS.spacing) {
  if (z1 <= z0) return 0;
  const half = spacing / 2;
  return Math.max(0, Math.ceil(z1 / half) - Math.ceil(z0 / half));
}

/** What the last frame drew (tests/debug). */
export const stats = { posts: 0 };

/**
 * Draws the posts on the visible road segments, far to near. `segs` are the segments the road
 * pass just projected (near first). Returns the number drawn.
 */
export function drawEdgePosts(ctx, segs, eraCfg, W) {
  stats.posts = 0;
  if (!eraCfg || eraCfg.deck || !segs || !segs.length) return 0;
  const S = POSTS.spacing, L = ROAD_CFG.segLength, half = S / 2;
  const body = eraCfg.railColor || '#ffaa00';
  const lightW = Math.max(1, (W || ctx.canvas.width) * 0.5);
  const alpha0 = ctx.globalAlpha;
  let n = 0;
  // Count first so the cap drops the farthest posts, then draw far to near.
  let skip = -POSTS.cap;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.trackType !== 'GAP' && s.p1.screen.w >= POSTS.minW) skip += postsIn(s.p1.world.z, s.p1.world.z + L, S);
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    if (seg.trackType === 'GAP') continue;
    const a = seg.p1.screen, b = seg.p2.screen;
    if (a.w < POSTS.minW) continue;
    const z0 = seg.p1.world.z;
    for (let z = postPhase(z0, S); z < z0 + L; z += half) {
      if (skip-- > 0) continue;
      const t = (z - z0) / L;
      const w = a.w + (b.w - a.w) * t;
      const x = a.x + (b.x - a.x) * t + postSide(z, S) * w * POSTS.out;
      const y = a.y + (b.y - a.y) * t;
      const h = w * 0.15, pw = Math.max(1, w * 0.026);
      ctx.globalAlpha = alpha0;
      ctx.fillStyle = body;
      ctx.fillRect(x - pw / 2, y - h, pw, h);
      // The reflector catches the headlights: brighter the nearer (and bigger) the post.
      ctx.globalAlpha = alpha0 * (0.4 + 0.6 * Math.min(1, w / lightW));
      ctx.fillStyle = POSTS.capColor;
      ctx.fillRect(x - pw * 0.8, y - h, pw * 1.6, Math.max(1, h * 0.22));
      n++;
    }
  }
  ctx.globalAlpha = alpha0;
  stats.posts = n;
  return n;
}
