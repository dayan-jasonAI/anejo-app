// The six things that turned a list into a pipeline: finding a website for a facility that has no
// inbox, the call queue, batch approval, campaigns, replies, and a readiness gate that blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, seedProspect, setting, reload, OWNER } from '../helpers/sales-fixture.js';
import { OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { candidateDomains, verifyPage, findWebsite } from '../../functions/_lib/sales/sitefind.js';
import { callQueue, logCall, callCard, callStats, CALL_OUTCOMES } from '../../functions/_lib/sales/calls.js';
import { classifyReply, logReply, startCampaign, campaignList, setCampaignStatus } from '../../functions/_lib/sales/campaigns.js';
import { doeaEligibility, buyerChecklist, loadReadiness, setReadiness } from '../../functions/_lib/sales/requirements.js';
import { previewOutreach, approveOutreach } from '../../functions/_lib/sales/outreach.js';
import { onRequestGet as salesGet, onRequestPost as salesPost } from '../../functions/api/hub/owner/sales/index.js';
import { onRequestPost as outreachPost } from '../../functions/api/hub/owner/sales/outreach.js';

const req = (path, init = {}) => new Request('https://anejocateringco.com' + path, {
  ...init, headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE, ...(init.headers || {}) },
});

function registryOrg(env, { name = 'Sunny Days Adult Day Care', phone = '(561) 555-0142', city = 'Boynton Beach', street = '3427 W Woolbright Rd', cat = 'adult_day', score = 82 } = {}) {
  const oid = 'sorg_' + Math.random().toString(36).slice(2, 10);
  env.DB.sqlite.prepare(
    `INSERT INTO sales_organizations (id, name, normalized_name, dedupe_key, phone, street, city, state, zip, business_category,
       source, status, employee_or_capacity_hint, current_score, current_tier, do_not_contact, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,'FL','33436',?,'ahca_healthfinder','discovered','48 licensed capacity (AHCA)',?,'A',0,?,?)`
  ).run(oid, name, name.toLowerCase(), oid, phone, street, city, cat, score, Date.now(), Date.now());
  return oid;
}

// ---------------------------------------------------------------- 1 · finding a website

test('candidate domains lead with the distinctive words, not the generic ones', () => {
  const c = candidateDomains('THE VOLEN CENTER', { city: 'Boca Raton' });
  assert.ok(c.includes('volencenter.com'), c.join(','));
  assert.ok(c.includes('volen.com'), 'the bare distinctive word is tried too');
  assert.ok(c.indexOf('volen.com') < c.indexOf('volencenter.com'), 'most distinctive first');
  assert.ok(c.length <= 8);
  assert.deepEqual(candidateDomains('Adult Day Care Center'), [], 'nothing distinctive: no guesses at all');
});

test('a page is only accepted when it proves it belongs to THIS facility', () => {
  const org = { name: 'Sunny Days Adult Day Care', phone: '(561) 555-0142', street: '3427 W Woolbright Rd', city: 'Boynton Beach' };
  const right = verifyPage('<h1>Sunny Days Adult Day Care</h1><p>3427 W Woolbright Rd, Boynton Beach FL</p><p>Call (561) 555-0142</p>', org);
  assert.equal(right.matched, true);
  assert.ok(right.signals.includes('phone'));

  const other = verifyPage('<h1>Sunny Days Adult Day Care of Ohio</h1><p>Call (614) 555-9999</p>', org);
  assert.equal(other.matched, false, 'a name match alone is never enough — every such page says it');

  const parked = verifyPage('<h1>Sunny Days Adult Day Care</h1><p>Boynton Beach</p><p>This domain is available. Buy this domain.</p>', org);
  assert.equal(parked.parked, true);
  assert.equal(parked.matched, false);
});

test('findWebsite keeps a verified site and reports what it tried when nothing verifies', async () => {
  const org = { name: 'Sunny Days Adult Day Care', phone: '561-555-0142', street: '3427 W Woolbright Rd', city: 'Boynton Beach' };
  const pages = {
    'https://sunnydays.com/': '<h1>Sunny Days Roofing</h1><p>Ohio</p>',
    'https://sunnydays.org/': '<h1>Sunny Days Adult Day Care</h1><p>3427 W Woolbright Rd, Boynton Beach</p><p>(561) 555-0142</p>',
  };
  const fetchImpl = async (u) => {
    const body = pages[String(u)];
    return body ? new Response(body, { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('nope', { status: 404 });
  };
  const r = await findWebsite(org, { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.domain, 'sunnydays.org');
  assert.ok(r.signals.includes('phone'));

  const none = await findWebsite({ name: 'Quiet Days Adult Day Care', phone: '561-555-9999', city: 'Delray Beach' },
    { fetchImpl: async () => new Response('not found', { status: 404 }) });
  assert.equal(none.ok, false);
  assert.ok(none.tried.length > 0, 'the attempt is recorded, so nobody repeats it blindly');
});

// ---------------------------------------------------------------- 2 · the call list

test('the call queue is the part of the pipeline email cannot reach, best first', async () => {
  const { env, cfg } = await readyEnv();
  const noEmail = registryOrg(env, { name: 'Sunny Days Adult Day Care', score: 82 });
  const lowerNoEmail = registryOrg(env, { name: 'Palm Adult Day Center', score: 60 });
  env.DB.sqlite.prepare("UPDATE sales_organizations SET current_tier='B' WHERE id=?").run(lowerNoEmail);
  await seedProspect(env, cfg, { name: 'Emailable Recovery', website: 'https://emailable.org/', email: 'director@emailable.org' });

  const q = await callQueue(env);
  const ids = q.map((x) => x.organization_id);
  assert.ok(ids.includes(noEmail) && ids.includes(lowerNoEmail));
  assert.equal(ids[0], noEmail, 'A tier before B');
  assert.ok(!q.some((x) => x.name === 'Emailable Recovery'), 'a prospect email can reach is not on the call list');
  assert.ok(q[0].card.facts.some((f) => /Licensed for 48/.test(f)), 'the card carries what the registry already told us');
  assert.ok(q[0].card.never.some((n) => /dietitian-approved/.test(n)), 'and what never to say');
});

test('a logged call writes into the model: capacity, a contact, the stage — and rests the number', async () => {
  const { env } = await readyEnv();
  const oid = registryOrg(env);
  const r = await logCall(env, {
    organization_id: oid, outcome: 'reached_decision_maker', headcount: 26,
    contact_name: 'Marta Reyes', contact_title: 'Program Director', contact_email: 'marta@sunnydays.org',
    notes: 'Serves lunch daily, unhappy with current vendor',
  }, { ctx: OWNER });
  assert.equal(r.ok, true);
  assert.equal(r.capacity_set, true);
  assert.equal(r.contact_added, true);
  assert.equal(r.rescored, true);

  const org = env.DB.rows('SELECT employee_or_capacity_hint FROM sales_organizations WHERE id = ?', oid)[0];
  assert.match(org.employee_or_capacity_hint, /26 attend daily/);
  const contact = env.DB.rows('SELECT full_name, email, email_status FROM sales_contacts WHERE organization_id = ?', oid)[0];
  assert.equal(contact.email, 'marta@sunnydays.org');
  assert.equal(contact.email_status, 'owner_verified', 'said to the owner on a call beats scraped from a page');

  // Called today, so it is not offered again today.
  const q = await callQueue(env);
  assert.ok(!q.some((x) => x.organization_id === oid), 'a number just called is resting');
  const stats = await callStats(env);
  assert.equal(stats.today, 1);
  assert.equal(stats.by_outcome.reached_decision_maker, 1);
});

test('“do not call” suppresses the organization, and a bad outcome key is refused', async () => {
  const { env } = await readyEnv();
  const oid = registryOrg(env);
  await logCall(env, { organization_id: oid, outcome: 'do_not_call' }, { ctx: OWNER });
  const org = env.DB.rows('SELECT do_not_contact, status FROM sales_organizations WHERE id = ?', oid)[0];
  assert.equal(org.do_not_contact, 1);
  const bad = await logCall(env, { organization_id: oid, outcome: 'maybe_later' }, { ctx: OWNER });
  assert.equal(bad.ok, false);
  assert.ok(CALL_OUTCOMES.length >= 8);
});

test('API: the call queue and logging a call are owner endpoints', async () => {
  const { env } = await readyEnv();
  const oid = registryOrg(env);
  const view = await (await salesGet({ env, request: req('/api/hub/owner/sales?view=calls') })).json();
  assert.equal(view.ok, true);
  assert.equal(view.queue.length, 1);
  assert.ok(view.outcomes.length >= 8);
  const post = await salesPost({ env, request: req('/api/hub/owner/sales', { method: 'POST', body: JSON.stringify({ op: 'log_call', organization_id: oid, outcome: 'left_voicemail' }) }) });
  assert.equal(post.status, 200);
});

// ---------------------------------------------------------------- 3 · batch approval

test('batch approval previews and hash-checks every draft, and reports each refusal by id', async () => {
  const { env, cfg } = await readyEnv();
  // Readiness is satisfied so the gate under test is the batch, not the documents.
  for (const k of ['dietitian_signed_menu', 'dbpr_license_certificate', 'w9', 'contract_template', 'general_liability_coi', 'inspection_report', 'adult_meal_pattern_menu', 'therapeutic_diets']) {
    await setReadiness(env, k, { status: 'ready' }, OWNER);
  }
  const a = await seedProspect(env, cfg, { name: 'First Center', website: 'https://first.org/', email: 'one@first.org' });
  const b = await seedProspect(env, cfg, { name: 'Second Center', website: 'https://second.org/', email: 'two@second.org' });
  const ids = [];
  for (const p of [a, b]) {
    const r = await outreachPost({ env, request: req('/api/hub/owner/sales/outreach', { method: 'POST', body: JSON.stringify({ op: 'start_sequence', opportunity_id: p.oppId }) }) });
    const j = await r.json();
    ids.push(j.outreach_id);
  }
  const res = await outreachPost({ env, request: req('/api/hub/owner/sales/outreach', { method: 'POST', body: JSON.stringify({ op: 'approve_batch', ids: [...ids, 'sout_nope'] }) }) });
  const out = await res.json();
  assert.equal(out.ok, true);
  assert.equal(out.approved, 2);
  assert.equal(out.refused, 1);
  assert.equal(out.results.find((r) => r.id === 'sout_nope').ok, false);
  const rows = env.DB.rows("SELECT status, approved_render_hash FROM sales_outreach WHERE status = 'approved'");
  assert.equal(rows.length, 2);
  for (const r of rows) assert.ok(r.approved_render_hash, 'each was approved against its own rendered hash');
});

// ---------------------------------------------------------------- 4 · campaigns

test('a campaign enrolls a set in one action and refuses to launch over open readiness gaps', async () => {
  const { env, cfg } = await readyEnv();
  const a = await seedProspect(env, cfg, { name: 'Campaign One', website: 'https://c1.org/', email: 'a@c1.org' });
  const b = await seedProspect(env, cfg, { name: 'Campaign Two', website: 'https://c2.org/', email: 'b@c2.org' });
  for (const p of [a, b]) env.DB.sqlite.prepare("UPDATE sales_organizations SET business_category='adult_day' WHERE id=?").run(p.orgId);

  const blocked = await startCampaign(env, { name: 'October adult day', organization_ids: [a.orgId, b.orgId], cfg, ctx: OWNER });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'readiness');
  assert.ok(blocked.readiness_gaps.length >= 1);

  const ok = await startCampaign(env, { name: 'October adult day', goal: 'Find two more like Boca', organization_ids: [a.orgId, b.orgId], acknowledge_gaps: true, cfg, ctx: OWNER });
  assert.equal(ok.ok, true);
  assert.equal(ok.enrolled, 2);
  const enr = env.DB.rows('SELECT campaign_id FROM sales_enrollments WHERE campaign_id IS NOT NULL');
  assert.equal(enr.length, 2, 'both enrollments carry the campaign');
  const drafts = env.DB.rows("SELECT status FROM sales_outreach WHERE status = 'pending_approval'");
  assert.equal(drafts.length, 2, 'drafts, never sends');

  const list = await campaignList(env);
  assert.equal(list[0].stats.enrolled, 2);
  assert.equal(list[0].stats.drafted, 2);
  assert.equal(list[0].stats.sent, 0);
  assert.match(list[0].readiness_note, /Launched with these gaps open/);
});

test('pausing a campaign stops its sequences', async () => {
  const { env, cfg } = await readyEnv();
  const a = await seedProspect(env, cfg, { name: 'Pause Me', website: 'https://p1.org/', email: 'a@p1.org' });
  const c = await startCampaign(env, { name: 'Pausable', organization_ids: [a.orgId], acknowledge_gaps: true, cfg, ctx: OWNER });
  const paused = await setCampaignStatus(env, c.campaign_id, 'paused', { ctx: OWNER });
  assert.equal(paused.ok, true);
  const enr = env.DB.rows('SELECT status FROM sales_enrollments WHERE campaign_id = ?', c.campaign_id)[0];
  assert.equal(enr.status, 'stopped');
});

// ---------------------------------------------------------------- 5 · replies

test('replies are classified from what buyers actually write', () => {
  assert.equal(classifyReply('Please send the menu and pricing for 30 people').classification, 'interested');
  assert.equal(classifyReply('Yes — interested, can we set up a call?').classification, 'interested');
  assert.equal(classifyReply('Not interested, we cook in-house.').classification, 'not_interested');
  assert.equal(classifyReply('Please remove me from your list').classification, 'unsubscribe');
  assert.equal(classifyReply('Not at this time, check back next quarter').classification, 'not_now');
  assert.equal(classifyReply('How much per meal?').classification, 'question');
  assert.equal(classifyReply('').classification, 'other');
  assert.ok(classifyReply('please send the menu').signals.length, 'the phrase it keyed on is visible');
});

test('a logged reply stops the sequence, moves the stage and drafts the answer', async () => {
  const { env, cfg } = await readyEnv();
  const p = await seedProspect(env, cfg, { name: 'Replying Center', website: 'https://rep.org/', email: 'dir@rep.org' });
  const started = await outreachPost({ env, request: req('/api/hub/owner/sales/outreach', { method: 'POST', body: JSON.stringify({ op: 'start_sequence', opportunity_id: p.oppId }) }) });
  const outreachId = (await started.json()).outreach_id;

  const r = await logReply(env, { organization_id: p.orgId, outreach_id: outreachId, body: 'Please send the menu and pricing for 30 participants.', cfg, ctx: OWNER });
  assert.equal(r.ok, true);
  assert.equal(r.classification, 'interested');
  assert.equal(r.stopped, true, 'nothing automated keeps talking over a person who answered');
  assert.equal(r.stage, 'engaged');
  assert.ok(r.drafted_outreach_id, 'the answer is drafted for approval');
  const stored = env.DB.rows('SELECT body, classification, handled FROM sales_replies')[0];
  assert.match(stored.body, /30 participants/);
  assert.equal(stored.handled, 1);
});

test('an unsubscribe suppresses the organization and drafts nothing', async () => {
  const { env, cfg } = await readyEnv();
  const p = await seedProspect(env, cfg, { name: 'Leave Me Alone LLC', website: 'https://lma.org/', email: 'dir@lma.org' });
  const before = env.DB.rows("SELECT COUNT(*) AS n FROM sales_outreach")[0].n;
  const r = await logReply(env, { organization_id: p.orgId, body: 'Unsubscribe. Do not contact us again.', cfg, ctx: OWNER });
  assert.equal(r.classification, 'unsubscribe');
  assert.equal(r.suppressed, true);
  assert.equal(r.drafted_outreach_id, null, 'the right follow-up to a no is silence');
  assert.equal(env.DB.rows('SELECT do_not_contact FROM sales_organizations WHERE id = ?', p.orgId)[0].do_not_contact, 1);
  assert.equal(env.DB.rows('SELECT COUNT(*) AS n FROM sales_outreach')[0].n, before);
});

test('API: the reply inbox and logging a reply are owner endpoints', async () => {
  const { env, cfg } = await readyEnv();
  const p = await seedProspect(env, cfg, { name: 'Inbox Center', website: 'https://inbox.org/', email: 'dir@inbox.org' });
  const post = await outreachPost({ env, request: req('/api/hub/owner/sales/outreach', { method: 'POST', body: JSON.stringify({ op: 'log_reply', organization_id: p.orgId, body: 'How much per meal?' }) }) });
  assert.equal(post.status, 200);
  const list = await (await (await import('../../functions/api/hub/owner/sales/outreach.js')).onRequestGet({ env, request: req('/api/hub/owner/sales/outreach?view=replies') })).json();
  assert.equal(list.ok, true);
  assert.equal(list.replies.length, 1);
  assert.equal(list.replies[0].classification, 'question');
  assert.equal(list.replies[0].organization_name, 'Inbox Center');
});

// ---------------------------------------------------------------- 6 · the gate that blocks

test('approval is REFUSED while a required document is missing, and allowed when acknowledged', async () => {
  const { env, cfg } = await readyEnv();
  const p = await seedProspect(env, cfg, { name: 'Gated Adult Day', website: 'https://gated.org/', email: 'dir@gated.org' });
  env.DB.sqlite.prepare("UPDATE sales_organizations SET business_category='adult_day' WHERE id=?").run(p.orgId);
  const started = await outreachPost({ env, request: req('/api/hub/owner/sales/outreach', { method: 'POST', body: JSON.stringify({ op: 'start_sequence', opportunity_id: p.oppId }) }) });
  const oid = (await started.json()).outreach_id;
  const prev = await previewOutreach(env, oid, { cfg });

  const refused = await approveOutreach(env, oid, { cfg, subject: prev.subject, body: prev.body, render_hash: prev.render_hash, ctx: OWNER });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'readiness');
  assert.match(refused.error, /dietitian/i);
  assert.equal(env.DB.rows("SELECT status FROM sales_outreach WHERE id = ?", oid)[0].status, 'pending_approval');

  const deliberate = await approveOutreach(env, oid, { cfg, subject: prev.subject, body: prev.body, render_hash: prev.render_hash, acknowledge_flags: true, ctx: OWNER });
  assert.equal(deliberate.ok, true, 'the owner can still decide to send it — deliberately');
});

test('the Elder Affairs caterer list opens on a date the Hub can state', () => {
  const before = doeaEligibility({ atMs: Date.parse('2026-09-21T12:00:00Z') });
  assert.equal(before.eligible, false);
  assert.equal(before.eligible_on, '2027-01-20');
  assert.ok(before.days_remaining > 100);
  const after = doeaEligibility({ atMs: Date.parse('2027-02-01T12:00:00Z') });
  assert.equal(after.eligible, true);
  const byInspections = doeaEligibility({ atMs: Date.parse('2026-10-01T12:00:00Z'), inspections: 3 });
  assert.equal(byInspections.eligible, true);
  assert.match(byInspections.basis, /three sanitation inspections/);
});

test('the adult day care checklist carries that date; other categories do not', async () => {
  const { env } = await readyEnv();
  const readiness = await loadReadiness(env);
  const adc = buyerChecklist('adult_day', readiness, { atMs: Date.parse('2026-09-21T12:00:00Z') });
  assert.equal(adc.doea.eligible, false);
  assert.equal(adc.doea.eligible_on, '2027-01-20');
  assert.equal(buyerChecklist('addiction_treatment', readiness).doea, null);
});
