// Stand-in for the `cloudflare:workers` module under Vitest (aliased in vite.config.js).
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
