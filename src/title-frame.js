// Title framing (ticket 0192), pure. On the home screen the camera rolls down the road with
// nobody driving the sim, so the race's bodies stood still and the hero car drove up beside
// them: the grid, then a semi filling the right third. Here the title is a cruise instead:
// the race field is parked, and traffic and obstacles ride along with the road, never nearer
// than TITLE_GAP ahead of the hero car. Every race start re-inits the road (initTrack).

/** Nearest any road body may sit ahead of the hero car on the title (sim Z). */
export const TITLE_GAP = 3000;

const lists = [];

/**
 * One title frame. road: LiveTraffic ({ racers, traffic, obstacles, props.live });
 * playerZ: the hero car's Z after this frame's roll; dz: how far the road rolled.
 * Parked bodies (takenDown) stay parked. Allocation-free.
 */
export function frameTitle(road, playerZ, dz) {
  for (let i = 0; i < road.racers.length; i++) road.racers[i].takenDown = true;
  lists[0] = road.traffic; lists[1] = road.obstacles; lists[2] = road.props ? road.props.live : null;
  let near = Infinity;
  for (let l = 0; l < 3; l++) {
    const list = lists[l];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) if (!list[i].takenDown) near = Math.min(near, list[i].worldZ + dz - playerZ);
  }
  // Lift the whole scene, not one body, so the spacing the planner chose is kept.
  const move = dz + (near < TITLE_GAP ? TITLE_GAP - near : 0);
  for (let l = 0; l < 3; l++) {
    const list = lists[l];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.takenDown) continue;
      b.worldZ += move;
      b.prevZ = b.worldZ;
    }
  }
}
