// Lazy half of graphics quality (ticket 0041): main.js imports this after the first frame,
// so the probe, the governor, the Settings → GRAPHICS buttons and the ?debug overlay cost
// the boot bundle nothing.
import { Gfx } from './gfx.js';
import { SaveStore } from '../save.js';

const LABEL = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', ultra: 'ULTRA' };

/**
 * @param {object} o
 * @param {(q: object) => void} o.onQuality  called now and after every tier/step change
 * @param {boolean} [o.debug]  show the tier/fps overlay
 */
export function bootGfx({ onQuality, debug = false }) {
  // `?gfx=low|medium|high|ultra` forces a tier for this visit (tests, comparing tiers).
  const forced = new URLSearchParams(location.search).get('gfx');
  Gfx.init(forced || (SaveStore.data.settings && SaveStore.data.settings.graphics) || 'auto');
  Gfx.onChange(onQuality);
  Gfx.onChange(syncNote);
  onQuality(Gfx.q);
  bindSettings();
  if (debug) overlay();
  return Gfx;
}

function gpuName() {
  const r = (Gfx.caps && Gfx.caps.renderer) || '';
  const m = /ANGLE \([^,]+, ([^,(]+?)(?: Direct3D| \(|,|\))/.exec(r);
  return (m ? m[1] : r).replace(/ANGLE Metal Renderer: /, '').trim().slice(0, 40) || 'this device';
}

function syncNote() {
  const note = document.getElementById('setGfxNote');
  if (!note) return;
  const what = LABEL[Gfx.tier];
  note.textContent = Gfx.pref === 'auto'
    ? `Auto picked ${what} for ${gpuName()}${Gfx.step ? `, eased ${Gfx.step} step${Gfx.step > 1 ? 's' : ''} to hold the frame rate` : ''}.`
    : `${what}, fixed. Auto picks the best this device holds at full speed.`;
}

function bindSettings() {
  const seg = document.querySelector('#settingsModal [data-setting="graphics"]');
  if (seg) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (b) Gfx.setPref(b.dataset.value);
    });
  }
  syncNote();
}

function overlay() {
  const el = document.createElement('div');
  el.id = 'gfxDebug';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:9999;pointer-events:none;font:10px/1.3 ui-monospace,monospace;color:#a5f3fc;background:rgba(2,6,23,.78);padding:4px 6px;border-radius:6px;white-space:pre';
  document.body.appendChild(el);
  let last = 0;
  const tick = (now) => {
    if (now - last > 500) {
      last = now;
      const v = window.__OT && window.__OT.view && window.__OT.view();
      const s = v && v.stats;
      el.textContent = `${LABEL[Gfx.tier]} (${Gfx.pref === 'auto' ? Gfx.source : 'player'}) step ${Gfx.step}  ${Gfx.caps.webgpu ? 'WebGPU-capable · ' : ''}${Gfx.caps.webgl2 ? 'WebGL2' : Gfx.caps.webgl ? 'WebGL1' : 'no WebGL'}\n`
        + `${gpuName()}\n${Gfx.fps.toFixed(0)} fps  p95 ${Gfx.p95.toFixed(1)}/${Gfx.budgetMs.toFixed(0)} ms  2D res ${Gfx.q.res}`
        + (s ? `\n3D dpr ${s.dpr.toFixed(2)}  ${s.drawCalls} draws  ${(s.triangles / 1000).toFixed(1)}k tris` : '');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
