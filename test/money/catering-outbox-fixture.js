// Real SQLite adapter with D1's transactional batch semantics; providers remain stubbed.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function makeCateringDB(observers = []) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE leads (id TEXT PRIMARY KEY,kind TEXT,name TEXT,email TEXT,phone TEXT,company TEXT,
      interest TEXT,message TEXT,source_lang TEXT,sms_consent INTEGER,marketing_sms_consent INTEGER,
      marketing_sms_consent_at INTEGER,marketing_sms_consent_src TEXT,src TEXT,utm_source TEXT,
      utm_medium TEXT,utm_campaign TEXT,referrer TEXT,created_at INTEGER);
    CREATE TABLE alerts (id TEXT PRIMARY KEY,alert_type TEXT,severity TEXT,title TEXT,body TEXT,
      team TEXT,ref_type TEXT,ref_id TEXT,source TEXT,dedupe_key TEXT,status TEXT,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE email_suppressions (email TEXT PRIMARY KEY,reason TEXT);`);
  for (const migration of ['0097_catering_request_attachments.sql', '0098_catering_request_outbox.sql']) {
    sqlite.exec(readFileSync(new URL(`../../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  const calls = [];
  function execute(kind, sql, args) {
    calls.push({ kind, sql, args });
    for (const [pattern, observe] of observers) if (pattern.test(sql)) observe({ kind, sql, args });
    const stmt = sqlite.prepare(sql);
    if (kind === 'first') return stmt.get(...args) || null;
    if (kind === 'all') return { results: stmt.all(...args) };
    return { success: true, meta: { changes: Number(stmt.run(...args).changes) } };
  }
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...values) => statement(sql, values),
    first: async () => execute('first', sql, args),
    all: async () => execute('all', sql, args),
    run: async () => execute('run', sql, args),
  });
  return {
    sqlite, calls, sqlLog: () => calls.map((call) => call.sql), prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((stmt) => execute('run', stmt.sql, stmt.args));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

export function seedUpload(DB) {
  DB.sqlite.prepare('INSERT INTO catering_upload_sessions (id,created_at,expires_at) VALUES (?,?,?)')
    .run('cup_0123456789abcdefabcd', Date.now(), Date.now() + 3600000);
  DB.sqlite.prepare(`INSERT INTO catering_attachments
    (id,session_id,slot,r2_key,filename,content_type,byte_size,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run('cat_0123456789abcdefabcd', 'cup_0123456789abcdefabcd', 1, 'private/design.pdf', 'party-idea.pdf', 'application/pdf', 2400, Date.now());
}
