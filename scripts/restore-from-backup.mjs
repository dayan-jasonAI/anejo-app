// restore-from-backup.mjs — turn an Añejo D1 backup JSON into a .sql file D1 will actually accept.
//
// REHEARSED 2026-07-25 against a scratch database (anejo-restore-drill) with the real
// 2026-07-20 backup: 64 tables / 8,532 rows restored, every spot-checked table matching the
// backup manifest exactly. Three things the original runbook got wrong, all found by that drill:
//
//   1. `PRAGMA foreign_keys=OFF` — D1 REJECTS pragmas in a --file batch, so FKs stay ON and the
//      restore dies with SQLITE_CONSTRAINT_FOREIGNKEY the moment a child row precedes its parent.
//      Fixed by topologically sorting tables so referenced parents are always inserted first.
//   2. `BEGIN TRANSACTION` / `COMMIT` — D1 rejects explicit transaction control outright
//      ("please use state.storage.transaction()"). Removed. NOTE: this means a restore is NOT
//      atomic. It is idempotent instead (INSERT OR REPLACE), so re-running a partial restore is
//      safe and converges.
//   3. The schema is NOT in the backup. Into an empty database you must replay migrations/*.sql
//      FIRST. (0007_client_phone.sql errors with "duplicate column name: phone" — harmless, the
//      column is already added by an earlier migration. Expect exactly that one failure.)
//
// Usage:
//   node scripts/restore-from-backup.mjs <backup.json> <out.sql> <deps.json> [table ...]
//
// deps.json is the FK graph, produced by dumping the TARGET database's schema:
//   wrangler d1 execute <db> --remote --json \
//     --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL" \
//     > schema.json
//   node scripts/restore-from-backup.mjs --deps schema.json deps.json
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);

// --deps mode: build the FK dependency graph from a sqlite_master dump.
if (argv[0] === '--deps') {
  const [, schemaPath, outPath] = argv;
  const raw = readFileSync(schemaPath, 'utf8');
  const parsed = JSON.parse(raw.slice(raw.indexOf('[')));
  const rows = (Array.isArray(parsed) ? parsed[0]?.results : parsed?.results) || [];
  const deps = {};
  for (const r of rows) {
    const refs = new Set();
    for (const m of String(r.sql || '').matchAll(/REFERENCES\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) {
      if (m[1] !== r.name) refs.add(m[1]);
    }
    deps[r.name] = [...refs];
  }
  writeFileSync(outPath, JSON.stringify(deps, null, 1));
  console.error(`Wrote FK graph for ${Object.keys(deps).length} tables to ${outPath}`);
  process.exit(0);
}

const [inPath, outPath, depsPath, ...only] = argv;
if (!inPath || !outPath || !depsPath) {
  console.error('usage: node restore-from-backup.mjs <backup.json> <out.sql> <deps.json> [table ...]');
  console.error('       node restore-from-backup.mjs --deps <schema.json> <deps.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(inPath, 'utf8'));
const deps = JSON.parse(readFileSync(depsPath, 'utf8'));
const tables = data.tables || {};
const want = only.length ? new Set(only) : null;
const known = new Set([...Object.keys(tables), ...Object.keys(deps)]);

// Parents before children, so FK constraints hold without needing a pragma.
const order = [];
const done = new Set();
const onStack = new Set();
function visit(name) {
  if (done.has(name) || !known.has(name)) return;
  if (onStack.has(name)) return;                 // circular FK → best effort, don't hang
  onStack.add(name);
  for (const parent of deps[name] || []) visit(parent);
  onStack.delete(name);
  done.add(name);
  order.push(name);
}
for (const t of [...known].sort()) visit(t);

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  // JSON-in-TEXT columns come back as objects/arrays; re-serialize them.
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const out = [];
let restored = 0;
for (const name of order) {
  if (want && !want.has(name)) continue;
  const rows = tables[name];
  if (!Array.isArray(rows) || rows.length === 0) continue;
  const cols = Object.keys(rows[0]);
  const colSql = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
  for (const row of rows) {
    out.push(`INSERT OR REPLACE INTO "${name}" (${colSql}) VALUES (${cols.map((c) => lit(row[c])).join(', ')});`);
    restored++;
  }
}
writeFileSync(outPath, out.join('\n') + '\n');
console.error(`Wrote ${restored} INSERTs across ${order.filter((t) => tables[t]?.length).length} tables to ${outPath}`);
