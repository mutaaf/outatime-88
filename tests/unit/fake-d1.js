// A D1-shaped wrapper over node:sqlite so worker tests run real SQL (ticket 0024).
import { DatabaseSync } from 'node:sqlite';

export function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const statement = (text, binds = []) => ({
    bind: (...b) => statement(text, b),
    async first() { return sql.prepare(text).get(...binds) ?? null; },
    async all() { return { results: sql.prepare(text).all(...binds) }; },
    async run() { const r = sql.prepare(text).run(...binds); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: (text) => statement(text),
    async batch(stmts) { return Promise.all(stmts.map((s) => s.run())); },
    raw: sql,
  };
}
