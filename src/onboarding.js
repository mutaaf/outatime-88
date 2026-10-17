// First-run teaching (ticket 0022): the title asks for one tap and no reading, so the race
// itself teaches. Only steering needs a prompt up front; obstacles are taught by the coach
// as they appear. Pure and clock-injected so it's unit-testable.

export const STEER_HINT_DELAY_MS = 700;   // let the green light land first
export const STEER_HINT_MAX_MS = 9000;    // never nag for a whole run

/** A player who has ever finished a run (or has an old save with a score) is not new. */
export function isNewPlayer(save) {
  return !save.onboarded && !(save.bestScore > 0);
}

export function createOnboarding({ newPlayer }) {
  let startedAt = null;
  let steered = !newPlayer;
  return {
    start(now) { startedAt = now; },
    steer() { steered = true; },
    /** 'steer' while a new player hasn't steered yet, otherwise null. */
    hint(now) {
      if (steered || startedAt === null) return null;
      const t = now - startedAt;
      return t >= STEER_HINT_DELAY_MS && t < STEER_HINT_MAX_MS ? 'steer' : null;
    },
    done() { return steered; },
  };
}
