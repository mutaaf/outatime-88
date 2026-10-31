// Desktop coach tip placement (0229). In the race-step chunk (race-step.js re-exports it for
// race-flow's coach; race-flow's chunk has no budget room). On the full HUD with keys/mouse the tip docks in the HUD row, under the track strip
// between the place card and the time pills (styles.css .coach-desk; there #hudTimes hugs its pills).
// Measured when it shows and when those boxes resize (a ResizeObserver runs after layout, so no forced
// reflow); the pills sit centred, so a gap pill coming or going changes the room. Too little room when
// it shows: the card keeps its spot.
const DESK_DOCK_AT = 240, DESK_MAX_W = 320;
let deskWatch = null;
// `again`: a re-measure while the tip shows keeps the dock decision made when it appeared (the chip
// narrows instead of jumping to the other spot), and writes only what changed.
export function dockDeskCoach(banner, again) {
  const root = document.documentElement, $ = (id) => document.getElementById(id), st = banner.style;
  const pos = $('hudPosCard').getBoundingClientRect(), strip = $('hudTrack').getBoundingClientRect();
  const left = Math.round(pos.right + 10), top = Math.round(strip.bottom + 6);
  const room = Math.round(Math.min(DESK_MAX_W, $('hudTimes').getBoundingClientRect().left - 10 - left));
  const on = again ? banner.classList.contains('coach-desk')
    : root.dataset.hud === 'full' && !root.classList.contains('touch-ui') && room >= DESK_DOCK_AT;
  if (!again) banner.classList.toggle('coach-desk', on);
  if (on) {
    const set = (k, v) => { if (st.getPropertyValue(k) !== v) st.setProperty(k, v); };
    set('--cd-l', left + 'px'); set('--cd-t', top + 'px'); set('--cd-w', Math.max(0, room) + 'px');
    set('--cd-h', Math.max(40, Math.round(pos.bottom) - top) + 'px');
  }
  if (!deskWatch && typeof ResizeObserver === 'function') {
    deskWatch = new ResizeObserver(() => { if (document.body.classList.contains('coach-up')) dockDeskCoach(banner, true); });
    for (const id of ['hudPosCard', 'hudTrack', 'hudTimes']) deskWatch.observe($(id));
  }
}

/** Writes the coach card for the obstacle ahead (0002) into icon/title/line, allocation-free; false
 *  when there is nothing to say (a wrench at full HP). In this chunk with the dock, for the same reason (0233). */
export function obstacleTip(item, fullHp, icon, title, line) {
  const t = item.type;
  const open = item.offset >= 0 ? '◀ LEFT' : 'RIGHT ▶';
  let i = '⚡', h = 'BARRIER', d = `Go ${open}, jump it, or boost-smash it`;
  if (t === 'PINE_TREE_HAZARD') { i = '🌲'; h = 'TREE AHEAD'; d = `Graze the gold ring for a slingshot — or go ${open}`; }
  else if (t === 'LOW_LASER_BAR') { i = '🟠'; h = 'LOW LASER'; d = `Hop it (W / ▲ / swipe up) — or go ${open}`; }
  else if (t === 'HIGH_LIGHT_GATE') { i = '🔵'; h = 'HIGH GATE'; d = `Hold drift to duck (S / ▼ / swipe down) — or go ${open}`; }
  else if (t === 'FLUX_CRATE') { i = '📦'; h = 'FLUX CRATE'; d = 'Smash straight through it for flux + HP'; }
  else if (t === 'REPAIR_WRENCH') {
    if (fullHp) return false;
    i = '🔧'; h = 'REPAIR'; d = `Grab the wrench (${item.offset < 0 ? 'left' : (item.offset > 0 ? 'right' : 'center')}) for +25 HP`;
  }
  icon.textContent = i; title.textContent = h; line.textContent = d;
  return true;
}
