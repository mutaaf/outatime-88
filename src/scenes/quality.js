// Quality tiers for the 2D era backdrops. The tier comes from ONE function, `getQuality()`,
// which reads whatever source is plugged in with `setQualitySource()` (the device-capability
// governor, once it lands) and defaults to 'high'.
let source = () => 'high';

export function setQualitySource(fn) { source = typeof fn === 'function' ? fn : () => 'high'; }

export function getQuality() {
  const q = source();
  return TIERS[q] ? q : 'high';
}

// layers: parallax layers drawn (far, mid, near) · detail: share of live set pieces and
// particles (0–1) · weather: rain/dust in front of the road · scale: layer resolution factor
// (the 2D renderer's DPR cap for cached art).
export const TIERS = {
  low: { layers: 2, detail: 0.35, weather: false, scale: 0.6 },
  medium: { layers: 3, detail: 0.7, weather: true, scale: 0.8 },
  high: { layers: 3, detail: 1, weather: true, scale: 1 },
  ultra: { layers: 3, detail: 1, weather: true, scale: 1.25 },
};

export function tier() { return TIERS[getQuality()]; }
