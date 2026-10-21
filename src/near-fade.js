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

/** Width multiplier for a body covering `cover` of the view width at fade `t`: eases to the cap. */
export function nearScale(cover, t) {
  if (!(cover > NEAR.cover)) return 1;
  return 1 - Math.max(0, Math.min(1, t || 0)) * (1 - NEAR.cover / cover);
}
