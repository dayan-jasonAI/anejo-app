// Sales OS — repeated runs are harmless. Discovery, enrichment, enrollment, sending, follow-up and
// opportunity creation are all things a cron tick or a double click will do twice; each must land once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, seedProspect, previewAndApprove, stubFetch, OWNER, TUESDAY_10AM_ET } from '../helpers/sales-fixture.js';
import { OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { upsertOrganization, updateOrganization, addContact, createOpportunity } from '../../functions/_lib/sales/store.js';
import { startSequence, sendApproved, draftDueFollowups } from '../../functions/_lib/sales/outreach.js';
import { applyEnrichment } from '../../functions/_lib/sales/jobs.js';
import { onRequestPost as salesPost } from '../../functions/api/hub/owner/sales/index.js';

const PLACE = {
  name: 'Palm Recovery Center', source: 'google_places', source_external_id: 'ChIJ_palm_1', website: 'https://palmrecovery.org',
  street: '500 Clematis St', city: 'West Palm Beach', zip: '33401', county: 'Palm Beach',
};

test('repeated discovery of the same place never duplicates the organization', async () => {
  const { env } = await readyEnv();
  const a = await upsertOrganization(env, PLACE, { ctx: OWNER });
  const b = await upsertOrganization(env, PLACE, { ctx: OWNER });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.organization_id, b.organization_id);
  assert.equal(env.DB.rows('SELECT id FROM sales_organizations').length, 1);
});

test('a CSV row for a place already found by Places merges into it (own domain + street) and fills only blanks', async () => {
  const { env } = await readyEnv();
  const a = await upsertOrganization(env, PLACE, { ctx: OWNER });
  const b = await upsertOrganization(env, {
    name: 'Palm Recovery Center, LLC', source: 'csv', website: 'www.palmrecovery.org/about', street: '500 Clematis Street, Suite 2',
    city: 'West Palm Beach', zip: '33401', employee_or_capacity_hint: '40 beds',
  }, { ctx: OWNER });
  assert.equal(b.organization_id, a.organization_id);
  const org = env.DB.one('SELECT * FROM sales_organizations WHERE id = ?', a.organization_id);
  assert.equal(org.name, 'Palm Recovery Center', 'the existing name is not overwritten');
  assert.equal(org.employee_or_capacity_hint, '40 beds', 'a blank is filled');
});

test('two locations of one organization that share a website stay TWO rows (multi-site is a signal, not a duplicate)', async () => {
  const { env } = await readyEnv();
  await upsertOrganization(env, { ...PLACE, source: 'manual', source_external_id: null }, { ctx: OWNER });
  await upsertOrganization(env, { ...PLACE, source: 'manual', source_external_id: null, street: '12 Federal Hwy', city: 'Boca Raton', zip: '33432' }, { ctx: OWNER });
  assert.equal(env.DB.rows('SELECT id FROM sales_organizations WHERE domain = ?', 'palmrecovery.org').length, 2);
});

test('the same name in the same ZIP is NOT merged when the streets or the own domains differ', async () => {
  const { env } = await readyEnv();
  const a = await upsertOrganization(env, { name: 'Serenity House', street: '1 A St', city: 'Delray Beach', zip: '33444', source: 'manual' }, { ctx: OWNER });
  const b = await upsertOrganization(env, { name: 'Serenity House', street: '99 B Ave', city: 'Delray Beach', zip: '33444', source: 'manual' }, { ctx: OWNER });
  assert.notEqual(a.organization_id, b.organization_id, 'two street addresses are two places');
  const c = await upsertOrganization(env, { name: 'Harbor House', website: 'harbor-a.org', zip: '33445', source: 'manual' }, { ctx: OWNER });
  const d = await upsertOrganization(env, { name: 'Harbor House', website: 'harbor-b.org', zip: '33445', source: 'manual' }, { ctx: OWNER });
  assert.notEqual(c.organization_id, d.organization_id, 'two own domains are two organizations');
  const e = await upsertOrganization(env, { name: 'Serenity House', street: '1 A Street', city: 'Delray Beach', zip: '33444', source: 'csv' }, { ctx: OWNER });
  assert.equal(e.organization_id, a.organization_id, 'the same name at the same street still merges');
});

test('owner edits survive a later re-discovery of the same place', async () => {
  const { env } = await readyEnv();
  const a = await upsertOrganization(env, PLACE, { ctx: OWNER });
  await updateOrganization(env, a.organization_id, { name: 'Palm Recovery — Clematis campus', business_category: 'behavioral_health' }, { ctx: OWNER });
  await upsertOrganization(env, { ...PLACE, name: 'Palm Recovery Center' }, { ctx: OWNER });
  const org = env.DB.one('SELECT name, business_category, category_locked FROM sales_organizations WHERE id = ?', a.organization_id);
  assert.equal(org.name, 'Palm Recovery — Clematis campus');
  assert.equal(org.business_category, 'behavioral_health');
  assert.equal(org.category_locked, 1);
});

test('importing the same CSV twice creates nothing the second time', async () => {
  const { env } = await readyEnv();
  const csv = 'name,website,street,city,zip,contact_name,contact_title,contact_email\n'
    + '"Harbor Day Program, Inc.",harbordayprogram.org,9 Ocean Ave,Boynton Beach,33435,Leo Grant,Program Director,leo@harbordayprogram.org\n'
    + 'Coral Adult Day Center,coraladultday.org,77 Palm Rd,Coral Springs,33065,,,info@coraladultday.org\n';
  const call = async () => (await salesPost({ env, request: new Request('https://anejocateringco.com/api/hub/owner/sales', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE }, body: JSON.stringify({ op: 'import_csv', csv }),
  }) })).json();
  const first = await call();
  assert.equal(first.ok, true, first.error);
  assert.equal(first.created, 2);
  assert.equal(first.contacts, 2);
  const second = await call();
  assert.equal(second.created, 0);
  assert.equal(second.merged, 2);
  assert.equal(second.contacts, 0);
  assert.equal(env.DB.rows('SELECT id FROM sales_contacts').length, 2);
  assert.equal(env.DB.one("SELECT email_status FROM sales_contacts WHERE email = 'leo@harbordayprogram.org'").email_status, 'owner_provided');
});

test('the same email at the same organization is one contact however it arrives', async () => {
  const { env } = await readyEnv();
  const a = await upsertOrganization(env, PLACE, { ctx: OWNER });
  for (const input of [{ email: 'info@palmrecovery.org' }, { email: 'INFO@palmrecovery.org', full_name: 'Front Desk' }, { email: ' info@palmrecovery.org ' }]) {
    const r = await addContact(env, a.organization_id, input, { source: 'website', source_url: 'https://palmrecovery.org/contact' });
    assert.equal(r.ok, true);
  }
  assert.equal(env.DB.rows('SELECT id FROM sales_contacts').length, 1);
});

test('re-applying the same website crawl adds no duplicate contacts', async () => {
  const { env } = await readyEnv();
  const a = await upsertOrganization(env, PLACE, { ctx: OWNER });
  const crawl = {
    ok: true, skipped: [], text: 'Palm Recovery Center partial hospitalization program',
    pages: [{
      url: 'https://palmrecovery.org/team',
      emails: [{ email: 'info@palmrecovery.org', own_domain: true, role_address: true }, { email: 'jcole@palmrecovery.org', own_domain: true, role_address: false }],
      phones: ['(561) 555-0100'],
      people: [{ full_name: 'Jane Cole', title: 'Executive Director', role_category: 'executive_director', confidence: 'medium', snippet: 'Jane Cole — Executive Director' }],
      signals: [{ kind: 'day_program', snippet: 'Our partial hospitalization program', url: 'https://palmrecovery.org/team' }],
      excerpt: 'Team',
    }],
  };
  for (let i = 0; i < 2; i++) {
    const org = env.DB.one('SELECT * FROM sales_organizations WHERE id = ?', a.organization_id);
    await applyEnrichment(env, org, crawl);
  }
  const contacts = env.DB.rows('SELECT full_name, email FROM sales_contacts ORDER BY email');
  assert.equal(contacts.length, 2);
  assert.deepEqual(contacts.map((c) => c.email), ['info@palmrecovery.org', 'jcole@palmrecovery.org']);
  assert.equal(contacts.find((c) => c.email === 'jcole@palmrecovery.org').full_name, 'Jane Cole', 'the address lands on the person it belongs to');
});

test('starting a sequence twice returns the one draft', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const a = await startSequence(env, { opportunity_id: oppId, cfg, ctx: OWNER });
  const b = await startSequence(env, { opportunity_id: oppId, cfg, ctx: OWNER });
  assert.equal(a.outreach_id, b.outreach_id);
  assert.equal(b.created, false);
  assert.equal(env.DB.rows('SELECT id FROM sales_outreach').length, 1);
  assert.equal(env.DB.rows('SELECT id FROM sales_enrollments').length, 1);
});

test('a repeated send tick never sends the same step twice', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const s = await startSequence(env, { opportunity_id: oppId, cfg, ctx: OWNER });
  await previewAndApprove(env, cfg, s.outreach_id);
  const f = stubFetch();
  try {
    await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET });
    await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET });
    await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET + 3600000 });
    assert.equal(f.calls.length, 1);
  } finally { f.restore(); }
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', s.outreach_id).status, 'sent');
});

test('a repeated follow-up tick drafts step 2 exactly once, and never on the same day as step 1', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const s = await startSequence(env, { opportunity_id: oppId, cfg, ctx: OWNER });
  await previewAndApprove(env, cfg, s.outreach_id);
  const f = stubFetch();
  try { await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET }); } finally { f.restore(); }
  assert.equal((await draftDueFollowups(env, { cfg, atMs: TUESDAY_10AM_ET + 3600000 })).drafted, 0, 'not due the same day');
  const later = TUESDAY_10AM_ET + 4 * 86400000;
  assert.equal((await draftDueFollowups(env, { cfg, atMs: later })).drafted, 1);
  assert.equal((await draftDueFollowups(env, { cfg, atMs: later })).drafted, 0);
  assert.equal((await draftDueFollowups(env, { cfg, atMs: later + 86400000 })).drafted, 0);
  assert.equal(env.DB.rows('SELECT id FROM sales_outreach WHERE step_number = 2').length, 1);
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE step_number = 2').status, 'pending_approval', 'follow-ups are drafted for approval, never sent');
});

test('creating an opportunity twice returns the one open opportunity', async () => {
  const { env, cfg } = await readyEnv();
  const { orgId, oppId } = await seedProspect(env, cfg);
  const again = await createOpportunity(env, orgId, { ctx: OWNER });
  assert.equal(again.opportunity_id, oppId);
  assert.equal(again.created, false);
  assert.equal(env.DB.rows('SELECT id FROM sales_opportunities').length, 1);
});
