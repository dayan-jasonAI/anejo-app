// Regressions for the defects found in the 2026-09-10 pre-production review of the Sales OS.
// Each test names the failure it prevents. Real SQLite (every migration), fetch stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readyEnv, seedProspect, previewAndApprove, stubFetch, setting, reload, OWNER, TUESDAY_10AM_ET,
} from '../helpers/sales-fixture.js';
import { OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { setStage, suppressOrganization } from '../../functions/_lib/sales/store.js';
import { onRequestPost as requestPost } from '../../functions/api/sales/request.js';
import {
  startSequence, sendApproved, sendReadiness, editOutreach, rejectOutreach, draftDueFollowups,
} from '../../functions/_lib/sales/outreach.js';
import { runSalesJob, JOBS } from '../../functions/_lib/sales/jobs.js';
import { onRequestPost as outreachPost } from '../../functions/api/hub/owner/sales/outreach.js';

async function approvedDraft(opts, prospect) {
  const { env, cfg } = await readyEnv(opts);
  const p = await seedProspect(env, cfg, prospect);
  const s = await startSequence(env, { opportunity_id: p.oppId, cfg, ctx: OWNER });
  const a = await previewAndApprove(env, cfg, s.outreach_id);
  assert.equal(a.ok, true, a.error);
  return { env, cfg, ...p, outreachId: s.outreach_id };
}

test('prospect links use the canonical origin, never the host the owner previewed from (www / *.pages.dev)', async () => {
  const { env, cfg } = await readyEnv({ extraEnv: { APP_BASE_URL: '' } });
  const p = await seedProspect(env, cfg);
  const s = await startSequence(env, { opportunity_id: p.oppId, cfg, ctx: OWNER });
  const res = await outreachPost({ env, request: new Request('https://feat-sales-os.anejo-app.pages.dev/api/hub/owner/sales/outreach', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE }, body: JSON.stringify({ op: 'preview', id: s.outreach_id }),
  }) });
  const r = await res.json();
  assert.equal(r.ok, true, r.error);
  assert.doesNotMatch(r.text + r.html, /pages\.dev/);
  assert.match(r.text, /https:\/\/anejocateringco\.com\/for\/[a-f0-9]{32}/);
  assert.match(r.text, /https:\/\/anejocateringco\.com\/api\/sales\/unsubscribe\?t=[a-f0-9]{32}/);
});

test('an email whose sender changed after approval is NOT sent — it returns to the queue for re-approval', async () => {
  const { env, outreachId } = await approvedDraft();
  setting(env, 'sales.sender', { from_name: 'Somebody Else', from_email: 'hello@anejocateringco.com', reply_to: 'hello@anejocateringco.com', signature_name: 'Dayan' });
  let cfg = await reload(env);
  const f = stubFetch();
  try {
    const r = await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET });
    assert.equal(r.sent, 0);
    assert.equal(r.reapproval, 1);
    assert.equal(f.calls.length, 0, 'nothing went out');
  } finally { f.restore(); }
  const row = env.DB.one('SELECT status, approved_at, approved_render_hash, failure_reason FROM sales_outreach WHERE id = ?', outreachId);
  assert.equal(row.status, 'pending_approval');
  assert.equal(row.approved_at, null);
  assert.match(row.failure_reason, /Changed after approval/);
  // Re-previewed and re-approved under the new sender, it goes.
  cfg = await reload(env);
  assert.equal((await previewAndApprove(env, cfg, outreachId)).ok, true);
  const g = stubFetch();
  try {
    assert.equal((await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET })).sent, 1);
    assert.equal(g.calls[0].body.from, 'Somebody Else <hello@anejocateringco.com>');
  } finally { g.restore(); }
});

test('a changed postal address after approval also sends the email back — the footer is part of what was approved', async () => {
  const { env, outreachId } = await approvedDraft();
  setting(env, 'campaign.postal_address', '500 Different Rd, Boca Raton, FL 33431');
  const cfg = await reload(env);
  const f = stubFetch();
  try { assert.equal((await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET })).reapproval, 1); } finally { f.restore(); }
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', outreachId).status, 'pending_approval');
});

test('a from-address outside the verified sending domain blocks sending (the provider would refuse every email)', async () => {
  const { env, cfg } = await readyEnv({ sender: { from_email: 'dayan@gmail.com' } });
  const r = sendReadiness(env, cfg, { atMs: TUESDAY_10AM_ET });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /verified sending domain \(@anejocateringco\.com\)/.test(x)), JSON.stringify(r.reasons));
  const env2 = { ...env, EMAIL_FROM: 'Añejo <hola@mail.anejo.example>' };
  assert.ok(sendReadiness(env2, cfg, { atMs: TUESDAY_10AM_ET }).reasons.some((x) => /@mail\.anejo\.example/.test(x)), 'the domain comes from EMAIL_FROM');
});

test('a provider error does not burn the approved email or the rest of the queue; retries carry an idempotency key; the third failure is final', async () => {
  const { env, cfg, outreachId } = await approvedDraft({ flags: {} });
  const b = await seedProspect(env, cfg, { name: 'Harbor Day Program', website: 'https://harbordayprogram.org/', email: 'director@harbordayprogram.org', fullName: 'Leo Grant', street: '9 Ocean Ave' });
  const s2 = await startSequence(env, { opportunity_id: b.oppId, cfg, ctx: OWNER });
  await previewAndApprove(env, cfg, s2.outreach_id);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const f = stubFetch(() => new Response('{"message":"domain not verified"}', { status: 403 }));
    try {
      const r = await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET + attempt * 3600000 });
      assert.equal(r.failed, 1);
      assert.equal(f.calls.length, 1, 'the batch stops at the first provider error');
      assert.match(f.calls[0].init.headers['Idempotency-Key'], /^sales-outreach-sout_/);
    } finally { f.restore(); }
    const row = env.DB.one('SELECT status, send_attempts FROM sales_outreach WHERE id = ?', outreachId);
    assert.equal(row.send_attempts, attempt);
    assert.equal(row.status, attempt < 3 ? 'approved' : 'failed');
  }
  assert.equal(env.DB.one('SELECT status, send_attempts FROM sales_outreach WHERE id = ?', s2.outreach_id).status, 'approved', 'the second email was never burned');
  assert.equal(env.DB.one('SELECT e.stop_reason FROM sales_enrollments e JOIN sales_outreach x ON x.enrollment_id = e.id WHERE x.id = ?', outreachId).stop_reason,
    'send_failed', 'a final failure ends the sequence instead of leaving it active with nothing due');
});

test('an email stuck in "sending" (Worker killed mid-send) returns to the queue after 15 minutes and retries under the same idempotency key', async () => {
  const { env, cfg, outreachId } = await approvedDraft();
  env.DB.sqlite.prepare("UPDATE sales_outreach SET status='sending', updated_at=? WHERE id = ?").run(Date.now() - 20 * 60000, outreachId);
  const f = stubFetch();
  try {
    const r = await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET });
    assert.equal(r.sent, 1);
    assert.equal(f.calls[0].init.headers['Idempotency-Key'], `sales-outreach-${outreachId}`);
  } finally { f.restore(); }
  const row = env.DB.one('SELECT status, send_attempts FROM sales_outreach WHERE id = ?', outreachId);
  assert.equal(row.status, 'sent');
  assert.equal(row.send_attempts, 1, 'the interruption counts as an attempt');
});

test('a send claimed moments ago is NOT recovered by another pass (no double work while it is in flight)', async () => {
  const { env, cfg, outreachId } = await approvedDraft();
  env.DB.sqlite.prepare("UPDATE sales_outreach SET status='sending', updated_at=? WHERE id = ?").run(Date.now() - 60000, outreachId);
  const f = stubFetch();
  try { assert.equal((await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET })).sent, 0); } finally { f.restore(); }
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', outreachId).status, 'sending');
});

test('a do-not-contact organization’s landing token cannot raise a request, an alert, or a stage change', async () => {
  const { env, oppId, orgId } = await approvedDraft();
  const token = env.DB.one('SELECT landing_token FROM sales_opportunities WHERE id = ?', oppId).landing_token;
  const before = env.DB.one('SELECT stage FROM sales_opportunities WHERE id = ?', oppId).stage;
  await suppressOrganization(env, orgId, { reason: 'asked' });
  const res = await requestPost({ env, request: new Request('https://anejocateringco.com/api/sales/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: token, kind: 'call', name: 'X', email: 'x@sunriserecovery.org' }),
  }) });
  assert.equal(res.status, 404);
  assert.equal(env.DB.rows("SELECT id FROM alerts WHERE alert_type = 'sales_prospect_request'").length, 0);
  assert.equal(env.DB.one('SELECT stage FROM sales_opportunities WHERE id = ?', oppId).stage, before);
});

test('an address typed into the landing form is recorded but NOT sendable until the owner confirms it', async () => {
  const { env, cfg } = await readyEnv();
  const p = await seedProspect(env, cfg);
  const token = env.DB.one('SELECT landing_token FROM sales_opportunities WHERE id = ?', p.oppId).landing_token;
  const res = await requestPost({ env, request: new Request('https://anejocateringco.com/api/sales/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: token, kind: 'pricing', name: 'Someone', email: 'someone@elsewhere.example.com' }),
  }) });
  assert.equal(res.status, 200);
  const c = env.DB.one("SELECT id, email_status, marketing_email_allowed FROM sales_contacts WHERE email = 'someone@elsewhere.example.com'");
  assert.equal(c.email_status, 'self_provided');
  assert.equal(c.marketing_email_allowed, 0);
  const s = await startSequence(env, { opportunity_id: p.oppId, contact_id: c.id, cfg, ctx: OWNER });
  assert.equal(s.ok, false, 'a forwarded link cannot enroll an arbitrary address in a sequence');
});

test('an edit or a reject that loses the race to approval/sending says so instead of claiming success', async () => {
  const { env, cfg, outreachId } = await approvedDraft();
  const e = await editOutreach(env, outreachId, { subject: 'x', body: 'y', cfg, ctx: OWNER });
  assert.equal(e.ok, false, 'the approved email was not edited, and the owner is told');
  env.DB.sqlite.prepare("UPDATE sales_outreach SET status='sending' WHERE id = ?").run(outreachId);
  const r = await rejectOutreach(env, outreachId, { reason: 'changed my mind', ctx: OWNER });
  assert.equal(r.ok, false);
  assert.match(r.error, /sending/);
});

test('the daily cap counts emails another tick has claimed but not finished', async () => {
  const { env, outreachId } = await approvedDraft({ flags: { 'sales.max_emails_per_day': 1 } });
  const cfg = await reload(env);
  // Another tick claimed this one "today" (the day the pass runs as of) and has not finished it.
  env.DB.sqlite.prepare("UPDATE sales_outreach SET status='sending', updated_at=? WHERE id = ?").run(TUESDAY_10AM_ET, outreachId);
  const b = await seedProspect(env, cfg, { name: 'Harbor Day Program', website: 'https://harbordayprogram.org/', email: 'director@harbordayprogram.org', fullName: 'Leo Grant', street: '9 Ocean Ave' });
  const s2 = await startSequence(env, { opportunity_id: b.oppId, cfg, ctx: OWNER });
  await previewAndApprove(env, cfg, s2.outreach_id);
  const f = stubFetch();
  try {
    const r = await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET });
    assert.equal(r.sent, 0);
    assert.ok(r.blocked_by.some((x) => /cap/i.test(x)));
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

test('moving an opportunity to a meeting stage stops the sequence and cancels an already-approved follow-up', async () => {
  const { env, cfg, outreachId, oppId } = await approvedDraft();
  let f = stubFetch();
  try { await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET }); } finally { f.restore(); }
  await draftDueFollowups(env, { cfg, atMs: TUESDAY_10AM_ET + 4 * 86400000 });
  const step2 = env.DB.one('SELECT id FROM sales_outreach WHERE opportunity_id = ? AND step_number = 2', oppId).id;
  await previewAndApprove(env, cfg, step2);
  assert.equal((await setStage(env, oppId, 'meeting_booked', { ctx: OWNER })).ok, true);
  assert.equal(env.DB.one('SELECT stop_reason FROM sales_enrollments WHERE opportunity_id = ?', oppId).stop_reason, 'engaged');
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', step2).status, 'canceled');
  f = stubFetch();
  try {
    assert.equal((await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET + 5 * 86400000 })).sent, 0);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', outreachId).status, 'sent');
});

test('with the production defaults, every scheduled job is inert: no provider call, no email, no agent_runs row, no telemetry', async () => {
  const { env } = await readyEnv({ emailEnabled: false, followup: false, extraEnv: { GOOGLE_PLACES_API_KEY: 'k' } });
  const cfg = await reload(env);
  for (const k of ['sales.discovery_enabled', 'sales.enrichment_enabled', 'sales.email_enabled', 'sales.followup_enabled', 'sales.auto_send_enabled', 'sales.voice_enabled', 'sales.places_persistence_approved']) {
    assert.equal(cfg.flags[k], false, `${k} defaults off`);
  }
  assert.equal(cfg.flags['sales.enabled'], true, 'the workspace itself is on');
  assert.equal(cfg.flags['sales.owner_approval_required'], true);
  const f = stubFetch();
  try {
    for (const job of JOBS) {
      const r = await runSalesJob(env, job, { cfg, fetchImpl: async () => { throw new Error('no network expected'); } });
      assert.equal(r.outcome, 'skipped', `${job} must be inert`);
    }
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
  assert.equal(env.DB.rows("SELECT id FROM agent_runs WHERE automation_type LIKE 'sales_%'").length, 0);
  assert.equal(env.DB.rows("SELECT id FROM activity_log WHERE event = 'automation.run'").length, 0);
  assert.equal(env.DB.rows('SELECT id FROM sales_organizations').length, 0);
});

test('with outreach approved but email switched off, the send job is inert too', async () => {
  const { env, outreachId } = await approvedDraft({ emailEnabled: false });
  const cfg = await reload(env);
  const f = stubFetch();
  try {
    const r = await runSalesJob(env, 'send', { cfg, atMs: TUESDAY_10AM_ET });
    assert.equal(r.outcome, 'skipped');
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', outreachId).status, 'approved');
});
