// In-memory stand-ins for the Cloudflare bindings, so the money path can be tested without a
// database. Routes are [RegExp, handler] pairs matched against the SQL text in order.
//
// An UNROUTED query throws instead of returning null. That is deliberate: every module here
// treats a D1 failure as "no data" and degrades silently, so a test whose regex has drifted out
// of sync with the real SQL would keep passing while asserting nothing. Failing loudly is the
// only way these tests stay honest as the queries change.

// D1's run() result. Handlers may return a number (changes), a boolean, or a full result.
function runResult(r) {
  if (r && typeof r === 'object' && r.meta) return r;
  if (typeof r === 'number') return { success: true, meta: { changes: r } };
  return { success: true, meta: { changes: r === false ? 0 : 1 } };
}

export function makeD1(routes = []) {
  const calls = [];
  const dispatch = (kind, sql, args) => {
    calls.push({ kind, sql, args });
    for (const [pattern, handler] of routes) {
      if (pattern.test(sql)) return handler({ sql, args, kind });
    }
    throw new Error(`Unrouted ${kind}() SQL: ${sql}`);
  };
  const statement = (sql, args) => ({
    async first() {
      const r = dispatch('first', sql, args);
      return r === undefined ? null : r;
    },
    async all() {
      const r = dispatch('all', sql, args);
      return Array.isArray(r) ? { results: r } : (r || { results: [] });
    },
    async run() {
      return runResult(dispatch('run', sql, args));
    },
  });
  return {
    calls,
    // Every SQL string the module actually sent — used to assert the query itself, not just its result.
    sqlLog: () => calls.map((c) => c.sql),
    prepare(sql) {
      return { bind: (...args) => statement(sql, args), ...statement(sql, []) };
    },
  };
}

// KV stand-in for env.SESSIONS (rewards config lives here).
export function makeKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}
