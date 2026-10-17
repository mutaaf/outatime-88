// A D1-shaped wrapper over node:sqlite so worker tests run real SQL (ticket 0024).
import { DatabaseSync } from 'node:sqlite';

export function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  const statement = (text, binds = []) => ({
    bind: (...b) => statement(text, b),
    async first() { return sql.prepare(text).get(...binds) ?? null; },
    async all() { return { results: sql.prepare(text).all(...binds) }; },
    async run() { const r = sql.prepare(text).run(...binds); return { meta: { changes: Number(r.changes) } }; },
    // D1's batch returns a result (rows + meta) per statement, in order.
    exec() {
      const st = sql.prepare(text);
      if (st.columns().length) return { results: st.all(...binds), meta: { changes: 0 } };
      const r = st.run(...binds);
      return { results: [], meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (text) => statement(text),
    async batch(stmts) {
      sql.exec('BEGIN');
      try { const out = stmts.map((s) => s.exec()); sql.exec('COMMIT'); return out; } catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
    raw: sql,
  };
}
