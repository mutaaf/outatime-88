// Car portraits for the lobby, the grid call-out and the podium: the garage's turntable car
// (src/car-art.js), drawn once per car/size into a cached bitmap and blitted, so re-rendering
// a lobby on every room message costs a few drawImage calls.

import { drawTurntable } from '../car-art.js';
import { POP_CULTURE_ROSTER } from '../data.js';

const cache = new Map();

function portrait(idx, w, h) {
  const car = POP_CULTURE_ROSTER[idx] || POP_CULTURE_ROSTER[0];
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const key = `${car.id}|${w}x${h}@${dpr}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      // Three-quarter view from the front-left, the angle cars are shown at in the garage.
      drawTurntable(ctx, w, h, car, 2.45, { t: 0 });
    }
    cache.set(key, c);
  }
  return c;
}

/** <canvas data-car="i"> placeholders for innerHTML; call paintThumbs(root) after. */
export function thumbHtml(idx, cls = 'live-thumb') {
  return `<canvas class="${cls}" data-car="${idx | 0}" aria-hidden="true"></canvas>`;
}

/** Fills every [data-car] canvas under `root` at its laid-out CSS size. */
export function paintThumbs(root) {
  for (const cv of root.querySelectorAll('canvas[data-car]')) {
    const w = Math.round(cv.clientWidth) || 84;
    const h = Math.round(cv.clientHeight) || 48;
    const src = portrait(Number(cv.dataset.car), w, h);
    if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
    const ctx = cv.getContext('2d');
    if (ctx) { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(src, 0, 0); }
  }
}
