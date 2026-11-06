// Where the first-race thumb guide's bubbles go (ticket 0166). Pure: each bubble takes the free
// spot nearest the pad it teaches, inside the safe view, on no pad and on no earlier bubble;
// above the pad wins a tie. On a crowded phone that spot can be a little way off, so the bubble
// gets a leader line to its pad's ring. It must still read as that pad's: nearer to it than to any
// other pad, its line crossing no other pad. A bubble with no such spot within reach is dropped.

// The guide ring is d + 18 across and pulses to 1.12×: past the pad by up to 0.06·d + 10.1.
const ringOut = (d) => 0.06 * d + 10.1;
const OWN = 4;       // clear of that ring, around its own pad
const GAP = 4;       // clear of every other pad and bubble
const GRID = 4;      // search step, px
const REACH = 140;   // past this a bubble no longer reads as "this pad"
const RING = 9;      // the guide ring's radius past the pad (its size is d + 18)
const LEAD_FROM = 16; // further out than this, draw a leader line
const BELOW = 24;    // a bubble below its pad (under the thumb) counts as this much further

/**
 * tips: [{ x, y, d, w, h, ring? }] — the pad it teaches (centre, diameter), the bubble's size and
 *   its pad's guide-ring radius (0252; default d / 2 + 9), where a leader line ends.
 * pads: [{ x, y, d, ring }] — every visible pad (ring: it wears a guide ring). view: { l, t, r, b }.
 * Returns, per tip and in the same order, null (no room) or { x, y, lead } — the bubble's
 * top-left, and lead: null or { x1, y1, x2, y2 }, a line from the bubble's edge to the ring.
 */
export function placeTips(tips, pads, view) {
  const taken = pads.map((p) => {
    const m = p.d / 2 + GAP + (p.ring ? ringOut(p.d) : 0);
    return { l: p.x - m, t: p.y - m, r: p.x + m, b: p.y + m };
  });
  const bubbles = [];
  return tips.map((tip) => {
    const at = spotFor(tip, taken, pads, bubbles, view);
    if (at) {
      const box = { l: at.x - GAP, t: at.y - GAP, r: at.x + tip.w + GAP, b: at.y + tip.h + GAP };
      taken.push(box);
      bubbles.push(box);
    }
    return at;
  });
}

function spotFor({ x, y, d, w, h, ring }, taken, pads, bubbles, view) {
  const r = d / 2;
  const GAP_OWN = ringOut(d) + OWN;
  const others = pads.filter((p) => p.x !== x || p.y !== y);
  // Only the boxes that could be within reach of the pad: a few thousand at most, once a race.
  const far = r + GAP_OWN + REACH;
  // The grid runs through the spot centred on the pad, so straight above is always a candidate.
  const ax = Math.round(x - w / 2), ay = Math.round(y - h / 2);
  const x0 = ax - GRID * Math.floor((ax - Math.ceil(Math.max(view.l, x - far - w))) / GRID), x1 = Math.min(view.r, x + far + w);
  const y0 = ay - GRID * Math.floor((ay - Math.ceil(Math.max(view.t, y - far - h))) / GRID), y1 = Math.min(view.b, y + far + h);
  let best = null, bestCost = Infinity;
  for (let top = y0; top + h <= y1; top += GRID) {
    for (let left = x0; left + w <= x1; left += GRID) {
      const gap = gapTo(left, top, w, h, x, y) - r;
      if (gap < GAP_OWN || gap > GAP_OWN + REACH) continue;
      // Ties go to the bubble most nearly centred on the pad (straight above beats off to one side).
      const cost = gap + (top + h / 2 > y ? BELOW : 0) + 0.1 * Math.hypot(left + w / 2 - x, top + h / 2 - y);
      if (cost >= bestCost) continue;
      if (taken.some((o) => left < o.r && o.l < left + w && top < o.b && o.t < top + h)) continue;
      const lead = leadFor(left, top, w, h, x, y, r, ring || r + RING);
      if (lead ? others.some((p) => segGap(lead, p.x, p.y) < p.d / 2 + GAP) || bubbles.some((o) => segHitsBox(lead, o))
        : others.some((p) => gapTo(left, top, w, h, p.x, p.y) - p.d / 2 <= gap)) continue;
      best = { x: left, y: top, lead };
      bestCost = cost;
    }
  }
  return best;
}

function leadFor(left, top, w, h, x, y, r, to) {
  const nx = Math.max(left, Math.min(x, left + w));
  const ny = Math.max(top, Math.min(y, top + h));
  const dist = Math.hypot(nx - x, ny - y);
  if (dist - r <= LEAD_FROM) return null;
  const k = to / dist;
  return { x1: Math.round(nx), y1: Math.round(ny), x2: Math.round(x + (nx - x) * k), y2: Math.round(y + (ny - y) * k) };
}

// Does the segment pass through the box? Sampled every 2 px: plenty for a line a few dozen long.
function segHitsBox({ x1, y1, x2, y2 }, o) {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2);
  for (let i = 0; i <= n; i++) {
    const px = x1 + ((x2 - x1) * i) / (n || 1), py = y1 + ((y2 - y1) * i) / (n || 1);
    if (px > o.l && px < o.r && py > o.t && py < o.b) return true;
  }
  return false;
}

// Distance from (px, py) to the line segment.
function segGap({ x1, y1, x2, y2 }, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

// Distance from the pad's centre to the nearest point of the bubble.
function gapTo(left, top, w, h, x, y) {
  const nx = Math.max(left, Math.min(x, left + w));
  const ny = Math.max(top, Math.min(y, top + h));
  return Math.hypot(nx - x, ny - y);
}

// The guide rings (0252): each wants to be its pad's diameter + 18 across, and pulses to 1.12×
// (touch.css tc-pulse). At the pulse's peak no two rings may touch and no ring may reach another
// pad's centre. Rings shrink toward d + 4 (the 3 px border just over the pad's rim) to fit; if two still collide even
// then, they cannot share the screen and take turns instead.
const PULSE = 1.12;
const RING_CLEAR = 2; // px between two rings, or between a ring and a pad's centre, at the peak
const ringWant = (d) => d / 2 + 9;
const ringMin = (d) => d / 2 + 2;

/**
 * rings: [{ x, y, d }] — the pads that wear a ring. pads: [{ x, y, d }] — every visible pad.
 * Returns { d: [diameter per ring, same order], together } — together: false means two rings
 * would collide even at their smallest, so show them one at a time (each at its own size).
 */
export function ringSizes(rings, pads) {
  // Alone, each ring is bounded only by the other pads' centres.
  const alone = rings.map((g) => {
    let max = ringWant(g.d);
    for (const p of pads) {
      const dist = Math.hypot(p.x - g.x, p.y - g.y);
      if (dist >= 1) max = Math.min(max, (dist - RING_CLEAR) / PULSE); // dist < 1: its own pad
    }
    return Math.max(ringMin(g.d), max);
  });
  // Together, each pair that collides gives up the excess in proportion to the room each has.
  const r = alone.slice();
  let together = true;
  for (let i = 0; i < rings.length && together; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const room = (Math.hypot(rings[i].x - rings[j].x, rings[i].y - rings[j].y) - RING_CLEAR) / PULSE;
      const excess = r[i] + r[j] - room;
      if (excess <= 0) continue;
      const si = r[i] - ringMin(rings[i].d), sj = r[j] - ringMin(rings[j].d);
      if (si + sj < excess) { together = false; break; }
      r[i] -= (excess * si) / (si + sj);
      r[j] -= (excess * sj) / (si + sj);
    }
  }
  return { d: (together ? r : alone).map((x) => Math.floor(x * 2)), together };
}
