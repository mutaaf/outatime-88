// Desktop coach tip placement (0229). In the race-step chunk (race-step.js re-exports it for
// race-flow's coach; race-flow's chunk has no budget room). On the full HUD with keys/mouse the tip docks in the HUD row, under the track strip
// between the place card and the time pills (styles.css .coach-desk; there #hudTimes hugs its pills).
// Measured when it shows and when those boxes resize (a ResizeObserver runs after layout, so no forced
// reflow); the pills sit centred, so a gap pill coming or going changes the room. Too little room: the
// card keeps its spot.
const DESK_DOCK_AT = 240, DESK_UNDOCK_UNDER = 220, DESK_MAX_W = 320;
let deskWatch = null;
export function dockDeskCoach(banner) {
  const root = document.documentElement, $ = (id) => document.getElementById(id);
  const pos = $('hudPosCard').getBoundingClientRect(), strip = $('hudTrack').getBoundingClientRect();
  const left = pos.right + 10, top = strip.bottom + 6;
  const room = Math.min(DESK_MAX_W, $('hudTimes').getBoundingClientRect().left - 10 - left);
  const on = root.dataset.hud === 'full' && !root.classList.contains('touch-ui')
    && room >= (banner.classList.contains('coach-desk') ? DESK_UNDOCK_UNDER : DESK_DOCK_AT);
  banner.classList.toggle('coach-desk', on);
  const st = banner.style;
  if (on) [left, top, room, Math.max(40, pos.bottom - top)].forEach((v, i) => st.setProperty('--cd-' + 'ltwh'[i], v + 'px'));
  if (!deskWatch && typeof ResizeObserver === 'function') {
    deskWatch = new ResizeObserver(() => { if (document.body.classList.contains('coach-up')) dockDeskCoach(banner); });
    for (const id of ['hudPosCard', 'hudTrack', 'hudTimes']) deskWatch.observe($(id));
  }
}
