import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../../functions/api/hub/admin/cutoff-check.js';

test('forced cutoff check excludes terminated accounts even if a site was left active', async () => {
  const db = new DatabaseSync(':memory:');
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'short' }).format(new Date()).toLowerCase();
  db.exec(`CREATE TABLE contract_accounts(id TEXT,name TEXT,status TEXT);
    CREATE TABLE contract_sites(id TEXT,name TEXT,account_id TEXT,active INTEGER,cutoff_time TEXT,delivery_days TEXT,contact_name TEXT,contact_phone TEXT);
    CREATE TABLE contract_orders(site_id TEXT,service_date TEXT,headcount INTEGER);
    INSERT INTO contract_accounts VALUES('old','Former office','terminated'),('live','Current office','active');`);
  for (const [id, account, active] of [['old','old',1],['paused','live',0],['live','live',1]]) {
    db.prepare('INSERT INTO contract_sites VALUES(?,?,?,?,?,?,NULL,NULL)').run(id,id,account,active,'09:15',weekday);
  }
  const DB = { prepare(sql) { const q = db.prepare(sql); let args=[]; return {bind(...a){args=a;return this;},async all(){return {results:q.all(...args)};},async first(){return q.get(...args)||null;}}; } };
  const response = await onRequestPost({env:{DB,CRON_KEY:'test-cron'},request:new Request('https://example.com/api/hub/admin/cutoff-check?force=1',{method:'POST',headers:{'x-cron-key':'test-cron'}})});
  const body = await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(body.checked,['live']);
  assert.deepEqual(body.missing.map(x=>x.site),['live']);
  db.close();
});
