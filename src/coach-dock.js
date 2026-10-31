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

/** The coach card for the obstacle ahead (0002) as [icon, title, line], or null when there is
 *  nothing to say (a wrench at full HP). In this chunk with the dock, for the same reason (0233). */
export function obstacleTip(item, fullHp) {
  const t = item.type;
  const open = item.offset >= 0 ? '◀ LEFT' : 'RIGHT ▶';
  if (t === 'PINE_TREE_HAZARD') return ['🌲', 'TREE AHEAD', `Graze the gold ring for a slingshot — or go ${open}`];
  if (t === 'LOW_LASER_BAR') return ['🟠', 'LOW LASER', `Hop it (W / ▲ / swipe up) — or go ${open}`];
  if (t === 'HIGH_LIGHT_GATE') return ['🔵', 'HIGH GATE', `Hold drift to duck (S / ▼ / swipe down) — or go ${open}`];
  if (t === 'FLUX_CRATE') return ['📦', 'FLUX CRATE', 'Smash straight through it for flux + HP'];
  if (t === 'REPAIR_WRENCH') {
    if (fullHp) return null;
    return ['🔧', 'REPAIR', `Grab the wrench (${item.offset < 0 ? 'left' : (item.offset > 0 ? 'right' : 'center')}) for +25 HP`];
  }
  return ['⚡', 'BARRIER', `Go ${open}, jump it, or boost-smash it`];
}
