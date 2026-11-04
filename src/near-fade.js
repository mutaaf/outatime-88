// Near-camera traffic (ticket 0200), pure: a car passing beside the chase camera shrinks to a
// sane size and turns see-through, so a semi's flank never walls off half the road.
//
// Depth comes from what the 2D renderer already knows: a car's road-scaled width over the view
// width (`q`). It doesn't depend on the screen's shape (about 0.16 a few car lengths ahead,
// 0.26 level with the player, 0.33+ at the near plane, at 1280x720, 390x844 and 844x390 alike).
// Cars ahead of or level with you are never touched: they are what you read, dodge and slam.

export const NEAR = {
  from: 0.27,  // q where the fade starts: level with you or just behind (a car you are
               // side-slamming stays solid)
  to: 0.31,    // q where it is complete: on the way past the camera
  alpha: 0.35, // opacity from there to the near plane
  cover: 0.22, // widest a car's body may be from there on, as a share of the view width
               // (under the 25% the ticket allows: wheels and shading spill past the box)
};

/** How far into the near zone a car is: 0 (ahead, untouched) → 1 (beside the camera). */
export function nearFade(q) {
  if (!(q > NEAR.from)) return 0;
  if (q >= NEAR.to) return 1;
  const s = (q - NEAR.from) / (NEAR.to - NEAR.from);
  return s * s * (3 - 2 * s);
}

/** Opacity for a fade amount `t` (nearFade). */
export function nearAlpha(t) {
  return 1 - (1 - NEAR.alpha) * Math.max(0, Math.min(1, t || 0));
}

/** Width multiplier for a body covering `cover` of the view width at fade `t`: eases to `cap`. */
export function nearScale(cover, t, cap = NEAR.cover) {
  if (!(cover > cap)) return 1;
  return 1 - Math.max(0, Math.min(1, t || 0)) * (1 - cap / cover);
}

// Near-camera props (ticket 0245): obstacles and knockable props (hurdles, barriers, gates,
// cones, barrels, era props) fade once they are behind you. A lane-wide hurdle passed on the right
// used to stand at the screen edge as a solid navy slab with a red-yellow band (half the view
// wide); it now eases to 8% of the view and 35% alpha on its way past the camera. The fade is in
// world units, not screen size (segment snapping and the FOV kick don't move it): it starts once
// the prop's centre is behind your rear bumper. A prop whose centre is alongside your car is always
// solid; only a long prop's trailing half (halfL 145) can still be clipped while it fades, and it
// is gone from the 2D view ~150 units later anyway (the near plane), so waiting for its far end
// would leave the slab on screen.
export const PROP = {
  rear: 105,    // the player's half-length (race-step playerHalfL): your rear bumper is pz - rear
  len: 150,     // world units from "centre at your rear bumper" to fully faded (about a car fade)
  cover: 0.072, // widest a prop's box (ow) may be once faded, as a share of the view width …
  spill: 1.1,   // … since art reaches ±0.55·ow: 0.072 × 1.1 ≈ 8% of the view on screen
};

/** How far into the near fade a prop is, from how far its centre is behind the player's rear
 *  bumper (`past`, world units; ≤ 0 while its centre is alongside or ahead of you): 0 → 1. */
export function propFade(past) {
  if (!(past > 0)) return 0;
  if (past >= PROP.len) return 1;
  const s = past / PROP.len;
  return s * s * (3 - 2 * s);
}
