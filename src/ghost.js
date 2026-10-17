// Ghost racing (ticket 0092). Every race records a compact trace (distance + lane at 5 Hz,
// src/ghost-codec.js) that is posted with the score; the Worker keeps the best one per
// initials per track. Racing a ghost puts it on the HUD track strip as a 👻 dot labelled with
// the live gap, so it works the same in 2D and 3D (no renderer coupling), and calls the
// result when you cross the line.

import { encodeGhost, decodeGhost, ghostAt, GHOST } from './ghost-codec.js';

export function createGhostRecorder(hz = GHOST.hz) {
  const samples = [];
  return {
    reset() { samples.length = 0; },
    /** Call every sim step with race time (s), distance and lane; samples on the 5 Hz grid. */
    sample(t, d, x) {
      // Sample i is due at (i + 1) / hz, computed fresh each time so it can't drift.
      while (samples.length < GHOST.maxSamples && t * hz >= samples.length + 1 - 1e-9) samples.push({ d, x });
    },
    get count() { return samples.length; },
    /** The trace to post, or undefined when the run is too short to be worth racing. */
    encode() { return samples.length >= hz * 5 ? encodeGhost(samples) : undefined; },
  };
}

/** Time (s) at which a decoded ghost reached `length`, or null if it never did. */
export function ghostFinishTime(g, length) {
  for (let i = 0; i < g.d.length; i++) {
    if (g.d[i] >= length) {
      const d0 = i ? g.d[i - 1] : 0;
      const k = (length - d0) / Math.max(1e-6, g.d[i] - d0);
      return (i + k) / g.hz;
    }
  }
  return null;
}

/** Signed seconds you lead the ghost by (negative = behind), at your current speed. */
export function ghostGap(myDist, ghostDist, mph) {
  return (myDist - ghostDist) / Math.max(30, mph);
}

export function createGhostRace(doc = document) {
  let ghost = null; // { initials, score, g, finish }
  let dot = null;
  let lastText = '';
  let lastLeft = -1;

  function ensureDot() {
    // Inside the strip's dot layer so it lines up with the racers; the HUD rebuilds that layer
    // when the field changes, so the dot is re-attached whenever it has been dropped.
    const track = doc.getElementById('hudDots');
    if (!track) return null;
    if (!dot || !dot.isConnected) {
      dot = doc.createElement('span');
      dot.id = 'hudGhost';
      dot.className = 'hud-dot hud-dot-ghost';
      track.appendChild(dot);
      lastText = ''; lastLeft = -1;
    }
    return dot;
  }

  return {
    /** data: { initials, score, trace } from /api/ghost; false if the trace is unusable. */
    load(data, length) {
      const g = data && decodeGhost(data.trace);
      if (!g) { this.clear(); return false; }
      ghost = { initials: data.initials, score: data.score, g, finish: ghostFinishTime(g, length) };
      return true;
    },
    clear() {
      ghost = null;
      if (dot) dot.remove();
      dot = null;
    },
    get active() { return Boolean(ghost); },
    get initials() { return ghost?.initials || ''; },
    get finish() { return ghost?.finish ?? null; },
    /** HUD tick: place the 👻 dot on the strip and label it with the live gap. */
    update(raceTime, myDist, mph, length) {
      if (!ghost) return;
      const node = ensureDot();
      if (!node) return;
      const at = ghostAt(ghost.g, raceTime);
      const left = Math.round(Math.max(0, Math.min(1, at.d / length)) * 1000) / 10;
      if (left !== lastLeft) { lastLeft = left; node.style.left = `${left}%`; }
      const gap = ghostGap(myDist, at.d, mph);
      const text = `👻 ${ghost.initials} ${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)}`;
      if (text !== lastText) {
        lastText = text;
        node.textContent = text;
        node.classList.toggle('is-behind', gap < 0);
      }
    },
    /** At the line: did you beat the ghost? { beat, by } (by = seconds, or null when the
     *  ghost's run never reached the line), or null if you didn't finish / no ghost. */
    verdict(myFinish) {
      if (!ghost || myFinish == null) return null;
      if (ghost.finish == null) return { beat: true, by: null };
      return { beat: myFinish < ghost.finish, by: Math.abs(ghost.finish - myFinish) };
    },
  };
}
