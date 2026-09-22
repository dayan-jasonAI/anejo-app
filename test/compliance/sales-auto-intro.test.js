// THE STANDING APPROVAL. The owner may decide that one exact email goes out on its own; he may not
// accidentally approve a different one. These tests pin the difference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, seedProspect, setting, reload, OWNER, TUESDAY_10AM_ET } from '../helpers/sales-fixture.js';
import { OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import {
  templateFingerprint, attest, getAttestation, autoIntroStatus, autoEnrollNew, autoApproveIntros, healthHalt,
} from '../../functions/_lib/sales/autosend.js';
import { setReadiness } from '../../functions/_lib/sales/requirements.js';
import { runSalesJob } from '../../functions/_lib/sales/jobs.js';
import { onRequestPost as settingsPost } from '../../functions/api/hub/owner/sales/settings.js';

const req = (body) => new Request('https://anejocateringco.com/api/hub/owner/sales/settings', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE }, body: JSON.stringify(body),
});

/** An env where the standing approval is on, attested, and the buyer has no readiness gap. */
async function attestedEnv(extra = {}) {
  const { env, cfg } = await readyEnv({ flags: { 'sales.auto_intro_enabled': 'true' }, ...extra });
  for (const k of ['dietitian_signed_menu', 'dbpr_license_certificate', 'w9', 'contract_template',
    'general_liability_coi', 'inspection_report', 'adult_meal_pattern_menu', 'therapeutic_diets']) {
    await setReadiness(env, k, { status: 'ready' }, OWNER);
  }
  const fresh = await reload(env);
  await attest(env, { cfg: fresh, sample: { subject: 'Scheduled meals', text: 'The letter he read.' }, ctx: OWNER });
  return { env, cfg: fresh };
}

test('nothing is automatic until the owner attests, and the attestation stores what he read', async () => {
  const { env, cfg } = await readyEnv({ flags: { 'sales.auto_intro_enabled': 'true' } });
  const before = await autoIntroStatus(env, cfg);
  assert.equal(before.ok, false);
  assert.match(before.reasons.join(' '), /No standing approval/);

  const r = await attest(env, { cfg, sample: { subject: 'Scheduled meals for your program', text: 'Hi — we deliver…' }, ctx: OWNER });
  assert.equal(r.ok, true);
  const stored = await getAttestation(env);
  assert.equal(stored.sample_subject, 'Scheduled meals for your program');
  assert.equal(stored.approved_by, OWNER.distinct_id);
  assert.ok(stored.fingerprint);
  const after = await autoIntroStatus(env, await reload(env));
  assert.equal(after.ok, true);
  assert.equal(after.fingerprint_matches, true);
});

test('changing ANY part of the email halts it until he reads and attests again', async () => {
  const { env, cfg } = await attestedEnv();
  assert.equal((await autoIntroStatus(env, cfg)).ok, true);

  // The offer is the words that go to a buyer. Changing it changes the letter.
  setting(env, 'sales.offer', { confirmed: true, headline: 'Completely different headline' });
  const afterOffer = await autoIntroStatus(env, await reload(env));
  assert.equal(afterOffer.ok, false);
  assert.equal(afterOffer.fingerprint_matches, false);
  assert.match(afterOffer.reasons.join(' '), /changed since you approved it/);

  // Re-attesting on the NEW text starts it again.
  const cfg2 = await reload(env);
  await attest(env, { cfg: cfg2, sample: { subject: 'New', text: 'New body' }, ctx: OWNER });
  assert.equal((await autoIntroStatus(env, await reload(env))).ok, true);

  // So does changing who it comes from.
  setting(env, 'sales.sender', { from_name: 'Someone Else', from_email: 'other@anejocateringco.com', reply_to: 'other@anejocateringco.com' });
  assert.equal((await autoIntroStatus(env, await reload(env))).ok, false);
});

test('a buyer whose own licensing requirement we cannot meet is never written to automatically', async () => {
  const { env, cfg } = await attestedEnv();
  // Put the dietitian signature back to missing — the real state on 2026-09-21.
  await setReadiness(env, 'dietitian_signed_menu', { status: 'in_progress' }, OWNER);
  const p = await seedProspect(env, cfg, { name: 'Gated Adult Day', website: 'https://gated.org/', email: 'dir@gated.org' });
  env.DB.sqlite.prepare("UPDATE sales_organizations SET business_category='adult_day', current_tier='A' WHERE id=?").run(p.orgId);

  const enrolled = await autoEnrollNew(env, { cfg });
  assert.equal(enrolled.enrolled, 0, 'not even drafted automatically');
  assert.match(JSON.stringify(enrolled.skipped), /readiness/);

  // And if a draft already exists, approval refuses it too — a machine has no acknowledgement.
  await (await import('../../functions/_lib/sales/outreach.js')).startSequence(env, { opportunity_id: p.oppId, cfg, ctx: OWNER });
  const approved = await autoApproveIntros(env, { cfg });
  assert.equal(approved.approved, 0);
  assert.match(JSON.stringify(approved.skipped), /readiness|dietitian/i);
  assert.equal(env.DB.rows("SELECT status FROM sales_outreach WHERE step_number = 1")[0].status, 'pending_approval');
});

test('it drafts and approves step 1 for a clear prospect, and records which attestation authorised it', async () => {
  const { env, cfg } = await attestedEnv();
  const p = await seedProspect(env, cfg, { name: 'Clear Center', website: 'https://clear.org/', email: 'dir@clear.org', opportunity: false });
  env.DB.sqlite.prepare("UPDATE sales_organizations SET current_tier='A' WHERE id=?").run(p.orgId);

  const enrolled = await autoEnrollNew(env, { cfg });
  assert.equal(enrolled.enrolled, 1);
  const approved = await autoApproveIntros(env, { cfg });
  assert.equal(approved.approved, 1);
  const row = env.DB.rows('SELECT status, auto_approved, attestation_hash, approved_by, step_number FROM sales_outreach')[0];
  assert.equal(row.status, 'approved');
  assert.equal(row.auto_approved, 1);
  assert.equal(row.step_number, 1);
  assert.equal(row.attestation_hash, (await getAttestation(env)).fingerprint);
  assert.equal(row.approved_by, OWNER.distinct_id, 'the standing approval is his, and is recorded as his');
});

test('follow-ups are never automatic — only the letter he read', async () => {
  const { env, cfg } = await attestedEnv();
  const p = await seedProspect(env, cfg, { name: 'Step Two Center', website: 'https://s2.org/', email: 'dir@s2.org' });
  const { startSequence } = await import('../../functions/_lib/sales/outreach.js');
  const first = await startSequence(env, { opportunity_id: p.oppId, cfg, ctx: OWNER });
  // Pretend step 1 went and a step-2 draft exists.
  env.DB.sqlite.prepare("UPDATE sales_outreach SET status='sent', sent_at=? WHERE id=?").run(Date.now(), first.outreach_id);
  env.DB.sqlite.prepare(
    `INSERT INTO sales_outreach (id, organization_id, opportunity_id, contact_id, enrollment_id, step_number,
       subject, body_snapshot, recipient_email, status, created_at, updated_at)
     SELECT 'sout_step2', organization_id, opportunity_id, contact_id, enrollment_id, 2, 'Following up',
       'Just checking in.', recipient_email, 'pending_approval', ?, ? FROM sales_outreach WHERE id = ?`
  ).run(Date.now(), Date.now(), first.outreach_id);

  const approved = await autoApproveIntros(env, { cfg });
  assert.equal(approved.approved, 0);
  assert.equal(env.DB.rows("SELECT status FROM sales_outreach WHERE id='sout_step2'")[0].status, 'pending_approval');
});

test('a flagged claim is always a person’s decision', async () => {
  const { env, cfg } = await attestedEnv();
  const p = await seedProspect(env, cfg, { name: 'Flagged Center', website: 'https://flag.org/', email: 'dir@flag.org' });
  const { startSequence } = await import('../../functions/_lib/sales/outreach.js');
  const r = await startSequence(env, { opportunity_id: p.oppId, cfg, ctx: OWNER });
  env.DB.sqlite.prepare("UPDATE sales_outreach SET flags_json = ? WHERE id = ?").run(JSON.stringify([{ kind: 'price', text: 'cheapest in Florida' }]), r.outreach_id);
  const approved = await autoApproveIntros(env, { cfg });
  assert.equal(approved.approved, 0);
  assert.match(JSON.stringify(approved.skipped), /flagged claim/);
});

test('bounces and complaints stop it on their own', async () => {
  const { env, cfg } = await attestedEnv();
  const mk = (i, col) => env.DB.sqlite.prepare(
    `INSERT INTO sales_outreach (id, opportunity_id, organization_id, contact_id, step_number, subject, body_snapshot,
       recipient_email, status, sent_at, ${col}, created_at, updated_at)
     VALUES (?, 'sopp_x', 'sorg_x', 'scon_x', 1, 's', 'b', 'a@b.com', 'sent', ?, ?, ?, ?)`
  ).run('so_' + i + col, Date.now(), Date.now(), Date.now(), Date.now());
  for (let i = 0; i < 4; i++) mk(i, 'sent_at');
  mk(90, 'complained_at'); mk(91, 'complained_at');
  const halt = await healthHalt(env);
  assert.match(String(halt), /spam complaints/);
  const status = await autoIntroStatus(env, cfg);
  assert.equal(status.ok, false);
  assert.match(status.reasons.join(' '), /deliverability/);
});

test('the daily automatic cap is separate from, and smaller than, the email cap', async () => {
  const { env, cfg } = await attestedEnv();
  setting(env, 'sales.max_auto_intros_per_day', '1');
  const fresh = await reload(env);
  for (const n of ['One Center', 'Two Center']) {
    const p = await seedProspect(env, fresh, { name: n, website: `https://${n.split(' ')[0].toLowerCase()}.org/`, email: `dir@${n.split(' ')[0].toLowerCase()}.org`, opportunity: false });
    env.DB.sqlite.prepare("UPDATE sales_organizations SET current_tier='A' WHERE id=?").run(p.orgId);
  }
  await autoEnrollNew(env, { cfg: fresh });
  const first = await autoApproveIntros(env, { cfg: fresh });
  assert.equal(first.approved, 1);
  const second = await autoApproveIntros(env, { cfg: await reload(env) });
  assert.equal(second.approved, 0);
  assert.match(JSON.stringify(second.halted), /cap/i);
});

test('the hourly send job runs it, and says what it did', async () => {
  const { env, cfg } = await attestedEnv();
  const p = await seedProspect(env, cfg, { name: 'Job Center', website: 'https://job.org/', email: 'dir@job.org', opportunity: false });
  env.DB.sqlite.prepare("UPDATE sales_organizations SET current_tier='A' WHERE id=?").run(p.orgId);
  const out = await runSalesJob(env, 'send', { cfg, atMs: TUESDAY_10AM_ET, triggeredBy: 'cron' });
  assert.ok(out.output.auto, 'the pass reports what the standing approval did');
  assert.equal(out.output.auto.enrolled, 1);
  assert.equal(out.output.auto.approved, 1);
});

test('switched off, it does nothing at all', async () => {
  const { env, cfg } = await attestedEnv();
  setting(env, 'sales.auto_intro_enabled', 'false');
  const fresh = await reload(env);
  const p = await seedProspect(env, fresh, { name: 'Off Center', website: 'https://off.org/', email: 'dir@off.org', opportunity: false });
  env.DB.sqlite.prepare("UPDATE sales_organizations SET current_tier='A' WHERE id=?").run(p.orgId);
  const status = await autoIntroStatus(env, fresh);
  assert.equal(status.ok, false);
  const approved = await autoApproveIntros(env, { cfg: fresh });
  assert.equal(approved.approved, 0);
  const out = await runSalesJob(env, 'send', { cfg: fresh, atMs: TUESDAY_10AM_ET });
  assert.equal(out.output.auto, null, 'the switch is the switch');
});

test('API: read the exact email, then attest it', async () => {
  const { env, cfg } = await readyEnv({ flags: { 'sales.auto_intro_enabled': 'true' } });
  await seedProspect(env, cfg, { name: 'Sample Center', website: 'https://sample.org/', email: 'dir@sample.org' });
  const sample = await (await settingsPost({ env, request: req({ op: 'auto_intro_sample' }) })).json();
  assert.equal(sample.ok, true);
  assert.ok(sample.subject && sample.text);
  assert.equal(sample.status.ok, false, 'not attested yet');

  const saved = await (await settingsPost({ env, request: req({ op: 'auto_intro_attest', subject: sample.subject, text: sample.text, for: sample.for }) })).json();
  assert.equal(saved.ok, true);
  assert.equal(saved.status.ok, true);
  const stored = await getAttestation(env);
  assert.equal(stored.sample_subject, sample.subject);

  const refused = await settingsPost({ env, request: req({ op: 'auto_intro_attest', subject: '', text: '' }) });
  assert.equal(refused.status, 400, 'you cannot attest an email you were never shown');
});

test('the blanket auto-send flag stays locked — this is step 1 only', async () => {
  const { LOCKED_FLAGS } = await import('../../functions/_lib/sales/config.js');
  assert.equal(LOCKED_FLAGS['sales.auto_send_enabled'], false);
  assert.equal(LOCKED_FLAGS['sales.owner_approval_required'], true);
  assert.equal(Object.prototype.hasOwnProperty.call(LOCKED_FLAGS, 'sales.auto_intro_enabled'), false,
    'the owner may switch HIS standing approval on and off himself');
});
