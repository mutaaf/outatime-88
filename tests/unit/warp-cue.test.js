// Ticket 0112: the WARP READY cue fires once on the rising edge, never again while ready.
import { describe, it, expect } from 'vitest';
import { createReadyCue } from '../../src/warp-cue.js';
import { FLUX } from '../../src/flux.js';

const run = (cue, values) => values.map((v) => cue(v)).filter(Boolean).length;

describe('createReadyCue', () => {
  it('fires once when the meter crosses into warp range', () => {
    const cue = createReadyCue(FLUX.warpBoostMin);
    expect(cue(20)).toBe(false);
    expect(cue(91.9)).toBe(false);
    expect(cue(FLUX.warpBoostMin)).toBe(true);
    // held ready for a while (120 Hz steps): silent
    for (let i = 0; i < 600; i++) expect(cue(95 + (i % 5))).toBe(false);
  });

  it('does not chatter when the meter wobbles around the threshold', () => {
    const cue = createReadyCue(92);
    expect(run(cue, [90, 92, 91, 92.5, 90, 93, 89, 92])).toBe(1);
  });

  it('re-arms once the meter is spent, so the next fill cues again', () => {
    const cue = createReadyCue(92);
    expect(run(cue, [50, 92, 100, 0, 30, 60, 92, 95])).toBe(2);
  });

  it('a race starting below the threshold re-arms a cue left spent by the last race', () => {
    const cue = createReadyCue(92);
    expect(run(cue, [96])).toBe(1);
    expect(run(cue, [FLUX.start, FLUX.start, 92])).toBe(1);
  });

  it('a meter that starts full cues on the first step', () => {
    expect(run(createReadyCue(92), [100, 100, 100])).toBe(1);
  });
});
