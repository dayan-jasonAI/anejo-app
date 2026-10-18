import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/contracts.js';
import { offboardContractAccount } from '../../functions/_lib/contract_offboarding.js';
const body = { op: 'offboard', account_id: 'off_test', effective_date: '2026-10-07', reason: 'Service terminated by owner', confirm: true };
function seed() {
  const env = ownerEnv();
  env.DB.exec(`INSERT INTO contract_accounts(id,name,status,created_at,updated_at) VALUES('off_test','Example office','active',1,1);
    INSERT INTO contract_sites(id,account_id,name,created_at,updated_at) VALUES('off_site','off_test','Office East',1,1);
    INSERT INTO contract_site_staff(id,site_id,account_id,name,phone,created_at) VALUES('off_staff','off_site','off_test','Staff','+15555550123',1);
    INSERT INTO contract_intake_devices(id,site_id,account_id,created_at) VALUES('off_dev','off_site','off_test',1);
    INSERT INTO contract_feedback_qr(site_id,token,created_at) VALUES('off_site','off_qr',1);
    INSERT INTO contract_survey_reminders(id,contract_order_id,site_id,delivery_id,completed_at,due_at,to_number,link_token,created_at,updated_at) VALUES('off_survey','historical','off_site','d',1,2,'+15555550123','token',1,1);
    INSERT INTO alerts(id,alert_type,ref_type,ref_id,created_at,updated_at) VALUES('off_alert','cutoff','contract_site','Office East',1,1);
    INSERT INTO contract_orders(id,site_id,account_id,service_date,headcount,total_cents,created_at,updated_at) VALUES('off_order','off_site','off_test','2099-01-01',33,23100,1,1);`);
  return env;
}
function request(b, cookie = OWNER_COOKIE) { return new Request('https://test/api/hub/owner/contracts', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); }
test('owner offboards every access path atomically while keeping historical money/order records', async () => {
  const env = seed();
  const response = await onRequestPost({ env, request: request(body) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true); assert.equal(result.warnings.length, 1);
  assert.equal(env.DB.one("SELECT status FROM contract_accounts WHERE id='off_test'").status, 'terminated');
  for (const table of ['contract_sites', 'contract_site_staff', 'contract_feedback_qr']) assert.equal(env.DB.one(`SELECT active FROM ${table} WHERE ${table === 'contract_feedback_qr' ? "site_id='off_site'" : "id='" + (table === 'contract_sites' ? 'off_site' : 'off_staff') + "'"}`).active, 0);
  assert.equal(env.DB.one("SELECT revoked FROM contract_intake_devices WHERE id='off_dev'").revoked, 1);
  assert.equal(env.DB.one("SELECT status FROM contract_survey_reminders WHERE id='off_survey'").status, 'blocked');
  assert.equal(env.DB.one("SELECT status FROM alerts WHERE id='off_alert'").status, 'acknowledged');
  assert.equal(env.DB.one("SELECT total_cents FROM contract_orders WHERE id='off_order'").total_cents, 23100);
  const ev = env.DB.one("SELECT * FROM contract_terms_events WHERE account_id='off_test'");
  assert.equal(JSON.parse(ev.after_json).effective_date, '2026-10-07');
  assert.equal(ev.changed_by, 'owner@test.example');
  await onRequestPost({ env, request: request(body) });
  assert.equal(env.DB.one("SELECT COUNT(*) AS n FROM contract_terms_events WHERE account_id='off_test'").n, 1);
});
test('invalid dates and missing explicit confirmation do not change service', async () => {
  for (const patch of [{ effective_date: '2026-02-30' }, { effective_date: '2099-01-01' }, { confirm: false }, { reason: '' }]) {
    const env = seed();
    const r = await offboardContractAccount(env, { distinct_id: 'stf_owner' }, { ...body, ...patch });
    assert.equal(r.ok, false);
    assert.equal(env.DB.one("SELECT status FROM contract_accounts WHERE id='off_test'").status, 'active');
  }
});
test('audit failure rolls back all access changes', async () => {
  const env = seed();
  env.DB.exec("CREATE TRIGGER reject_offboard BEFORE INSERT ON contract_terms_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  const r = await onRequestPost({ env, request: request(body) });
  assert.equal(r.status, 500);
  assert.equal(env.DB.one("SELECT status FROM contract_accounts WHERE id='off_test'").status, 'active');
  assert.equal(env.DB.one("SELECT active FROM contract_sites WHERE id='off_site'").active, 1);
});
test('only owners can offboard; terminated account cannot be silently reactivated', async () => {
  const env = seed();
  assert.equal((await onRequestPost({ env, request: request(body, 'anejo_sess=tok-kitchen') })).status, 403);
  await onRequestPost({ env, request: request(body) });
  assert.equal((await onRequestPost({ env, request: request({ op: 'activate', account_id: 'off_test', price_per_lunch_cents: 850 }) })).status, 409);
  for (const op of ['add_staff', 'set_headcount', 'add_site']) {
    assert.equal((await onRequestPost({ env, request: request({ op, account_id: 'off_test', site_id: 'off_site', name: 'New staff' }) })).status, 409);
  }
  assert.equal((await onRequestPost({ env, request: request({ op: 'edit_terms', account_id: 'off_test', site_id: 'off_site', active: 1 }) })).status, 400);
});
