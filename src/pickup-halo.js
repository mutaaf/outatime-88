// Pickup halo cap (ticket 0235), pure: the glow and white ring a pickup floats in (0198) grow
// with the pickup as it nears the car, and close in they covered the traffic behind it. The
// halo's outer edge (the glow, GLOW × the halo size) is capped at CAP_PX on a 720-px view
// (scaled by the view's shorter side), and its alpha fades out as the pickup closes in. The
// pickup icon itself keeps its size; collection is the sim's and never reads any of this.
// No clock goes in: the halo has no animation of its own, so calm motion needs no branch.

export const RING = 0.56;   // ring radius / icon size (src/pickup-art.js paintIcon)
export const GLOW = 0.82;   // glow outer radius / icon size
export const CAP_PX = 64;   // max halo radius at a 720-px short side
export const FADE_FROM = 0.7; // fade starts at this fraction of the capped size…
export const FADE_TO = 1.6;   // …and reaches 0 here

/** The largest halo radius (view units) on a view rw × rh. */
export function haloCap(rw, rh) {
  return CAP_PX * Math.min(rw, rh) / 720;
}

/** The icon size the halo is painted at for a pickup `size` units across: never past the cap. */
export function haloSize(size, rw, rh) {
  return Math.min(size, haloCap(rw, rh) / GLOW);
}

/** The halo's outer radius on screen for a pickup `size` units across. */
export function haloRadius(size, rw, rh) {
  return haloSize(size, rw, rh) * GLOW;
}

/** The halo's alpha: 1 while the pickup is small, fading to 0 as it closes in. */
export function haloAlpha(size, rw, rh) {
  const t = size * GLOW / haloCap(rw, rh);
  if (t <= FADE_FROM) return 1;
  if (t >= FADE_TO) return 0;
  return 1 - (t - FADE_FROM) / (FADE_TO - FADE_FROM);
}
