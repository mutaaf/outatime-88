// Pickup halo cap (ticket 0235), pure: the glow and white ring a pickup floats in (0198) grew
// with the pickup as it neared the car, and close in they covered the traffic behind it.
// - The glow's outer edge (GLOW × its size) stops at CAP_PX on a 720-px view (scaled by the
//   view's shorter side), and fades out once it would have grown past that.
// - The ring stops growing at the same cap; only once the pickup is so big that the cap would
//   put the ring under the icon does it hug the icon's edge (RING_HUG × the size, i.e. about half
//   the sprite's width), so close in it is an outline of the sprite, never a halo around it. It
//   never fades: it is the shape every pickup shares and no hazard has (0198).
// The icon itself keeps its size; collection is the sim's and never reads any of this. No clock
// goes in: the halo has no animation of its own, so calm motion needs no branch.

export const RING = 0.56;     // ring radius / icon size (src/pickup-art.js paintIcon)
export const GLOW = 0.82;     // glow outer radius / icon size
export const RING_HUG = 0.47; // ring radius / icon size once it hugs the icon (bodies reach ~0.45)
export const CAP_PX = 64;     // max halo radius at a 720-px short side
export const FADE_FROM = 1;   // the glow is at full strength up to the cap…
export const FADE_TO = 1.3;   // …and gone by here

/** The largest halo radius (view units) on a view rw × rh. */
export function haloCap(rw, rh) {
  return CAP_PX * Math.min(rw, rh) / 720;
}

/** The icon size the glow is painted at for a pickup `size` units across: never past the cap. */
export function haloSize(size, rw, rh) {
  return Math.min(size, haloCap(rw, rh) / GLOW);
}

/** The glow's outer radius on screen for a pickup `size` units across. */
export function haloRadius(size, rw, rh) {
  return haloSize(size, rw, rh) * GLOW;
}

/** The glow's alpha: 1 up to the cap, fading to 0 as the pickup closes in. */
export function haloAlpha(size, rw, rh) {
  const t = size * GLOW / haloCap(rw, rh);
  if (t <= FADE_FROM) return 1;
  if (t >= FADE_TO) return 0;
  return 1 - (t - FADE_FROM) / (FADE_TO - FADE_FROM);
}

/** The icon size the ring is painted at (its radius is RING × this). */
export function ringSize(size, rw, rh) {
  return Math.min(size, Math.max(haloCap(rw, rh), RING_HUG * size) / RING);
}

/** The ring's radius on screen: RING × size while small, then the cap, then hugging the icon. */
export function ringRadius(size, rw, rh) {
  return ringSize(size, rw, rh) * RING;
}
