// One announcement channel (pillar 3, ticket 0002): exactly one message is visible; a more
// important one preempts, an equal one waits its turn, a repeat refreshes instead of
// flickering, and anything that waited too long is dropped rather than shown late.

const MAX_QUEUE = 3;
const STALE_MS = 2500;

/** Rough importance from the text, so the ~30 existing call sites need no changes. */
export function priorityFor(main) {
  if (/WARP|ERA SHIFT|WRECKED/i.test(main)) return 3;
  if (/TAKEDOWN|CHECKPOINT|WAVE|FINISH|LAP/i.test(main)) return 2;
  return 1;
}

export function createAnnouncer({ now, show, hide }) {
  let current = null; // { main, sub, until, priority }
  const queue = [];

  function display(msg) {
    current = { main: msg.main, sub: msg.sub, priority: msg.priority, until: now() + msg.duration };
    show(current);
  }

  function next() {
    const t = now();
    while (queue.length && t - queue[0].at > STALE_MS) queue.shift();
    if (queue.length) display(queue.shift());
    else { current = null; hide(); }
  }

  return {
    push(main, sub = '', duration = 950, priority = priorityFor(main)) {
      const msg = { main, sub, duration, priority, at: now() };
      if (current && current.main === main) { // refresh, don't flicker
        current.sub = sub;
        current.until = Math.max(current.until, now() + duration);
        show(current);
        return;
      }
      if (!current || priority > current.priority) { display(msg); return; }
      // Wait in line: higher priority first, then arrival order.
      let i = queue.length;
      while (i > 0 && queue[i - 1].priority < priority) i--;
      queue.splice(i, 0, msg);
      if (queue.length > MAX_QUEUE) queue.pop();
    },
    update() {
      if (current && now() >= current.until) next();
    },
    isVisible() { return current !== null; },
    pending() { return queue.length; },
    clear() { queue.length = 0; current = null; hide(); },
  };
}
