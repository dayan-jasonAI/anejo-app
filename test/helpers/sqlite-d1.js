// A REAL database behind D1's API: node:sqlite with every migration applied, in filename order,
// exactly as production ran them. Built for the Sales OS tests, usable by any test.
//
// Why not the regex router in ./d1.js: that helper answers the queries a test author predicted.
// The sales path is a chain — dedupe → score → enroll → draft → approve → claim → send — and each
// step reads what the previous one wrote. A mock can only agree with itself; this reads real rows,
// enforces real UNIQUE indexes, and fails on a column that does not exist.
//
// D1 parity kept deliberately:
//   · binding `undefined` THROWS (D1 raises D1_TYPE_ERROR) — a missing value must not become NULL
//   · booleans bind as 1/0 (D1 converts them; node:sqlite would throw)
//   · run() → { success, meta: { changes, last_row_id } }, all() → { results }, first(col?) → row|value|null
//   · batch() is one transaction, rolled back whole on any failure
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

const MIG_DIR = new URL('../../migrations/', import.meta.url);
let MIGRATIONS = null;

function migrations() {
  if (!MIGRATIONS) {
    MIGRATIONS = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => ({ name: f, sql: readFileSync(new URL(f, MIG_DIR), 'utf8') }));
  }
  return MIGRATIONS;
}

function bindable(args, sql) {
  return args.map((v, i) => {
    if (v === undefined) throw new Error(`D1_TYPE_ERROR: undefined bound at position ${i + 1} in: ${sql.slice(0, 160)}`);
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
}

export function makeSqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const m of migrations()) sqlite.exec(m.sql);
  const calls = [];

  function execute(kind, sql, args, col) {
    calls.push({ kind, sql, args });
    const stmt = sqlite.prepare(sql);
    const a = bindable(args, sql);
    if (kind === 'first') {
      const row = stmt.get(...a) || null;
      if (row && col) return row[col] === undefined ? null : row[col];
      return row;
    }
    if (kind === 'all') return { success: true, results: stmt.all(...a) };
    const r = stmt.run(...a);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }

  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...values) => statement(sql, values),
    first: async (col) => execute('first', sql, args, col),
    all: async () => execute('all', sql, args),
    run: async () => execute('run', sql, args),
  });

  return {
    sqlite,
    calls,
    sqlLog: () => calls.map((c) => c.sql),
    prepare: (sql) => statement(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const out = statements.map((s) => execute('run', s.sql, s.args));
        sqlite.exec('COMMIT');
        return out;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
    // Test conveniences that bypass the async API.
    rows: (sql, ...args) => sqlite.prepare(sql).all(...bindable(args, sql)),
    one: (sql, ...args) => sqlite.prepare(sql).get(...bindable(args, sql)) || null,
    exec: (sql) => sqlite.exec(sql),
  };
}

// KV stand-in with the expirationTtl option accepted and ignored.
export function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}

// An env with a signed-in, ACTIVE owner. requireRole re-checks staff.active against the real table.
export function ownerEnv(extra = {}) {
  const DB = makeSqliteD1();
  const t = Date.now();
  DB.sqlite.prepare("INSERT INTO staff (id, name, email, role, active, created_at, updated_at) VALUES ('stf_owner','Owner','owner@test.example','owner',1,?,?)").run(t, t);
  const SESSIONS = makeKV({
    'session:tok-owner': JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_owner', email: 'owner@test.example', la: t, created: t }),
    'session:tok-kitchen': JSON.stringify({ type: 'staff', role: 'kitchen', uid: 'stf_k', email: 'k@test.example', la: t, created: t }),
    'session:tok-marketing': JSON.stringify({ type: 'staff', role: 'marketing', uid: 'stf_m', email: 'm@test.example', la: t, created: t }),
  });
  DB.sqlite.prepare("INSERT INTO staff (id, name, email, role, active, created_at, updated_at) VALUES ('stf_k','Cook','k@test.example','kitchen',1,?,?)").run(t, t);
  DB.sqlite.prepare("INSERT INTO staff (id, name, email, role, active, created_at, updated_at) VALUES ('stf_m','Mkt','m@test.example','marketing',1,?,?)").run(t, t);
  return { DB, SESSIONS, ...extra };
}

export const OWNER_COOKIE = 'anejo_sess=tok-owner';
