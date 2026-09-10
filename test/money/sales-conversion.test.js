// Sales OS → contract account: the money bridge. Owner-confirmed terms only, integer cents only,
// totals that must agree, never overwriting an existing account, and idempotent on a double click.
// Runs against a REAL SQLite database with every migration applied (test/helpers/sqlite-d1.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, seedProspect, OWNER } from '../helpers/sales-fixture.js';
import {
  validateProposal, monthlyEstimateCents, saveProposal, confirmProposal, convertToContractAccount, linkExistingAccount,
} from '../../functions/_lib/sales/convert.js';
import { registerAccount, activateAccount } from '../../functions/_lib/contract.js';

const TERMS = {
  account_name: 'Sunrise Recovery Center', meal_window: 'lunch', price_per_meal_cents: 950, meals_per_day: 40, days_per_week: 5,
  delivery_days: 'mon,tue,wed,thu,fri', delivery_fee_cents: 2500, rush_fee_cents: 1500, cutoff_time: '09:00',
  billing_model: 'biweekly', billing_email: 'billing@sunriserecovery.org', billing_contact: 'Ana Perez',
  sites: [{ name: 'Delray campus', street: '100 Main St', city: 'Delray Beach', state: 'FL', zip: '33444' }],
  contacts: [{ site_index: 0, name: 'Maria Ruiz', phone: '(561) 555-0100' }],
};
// ((950 × 40) + 2500) × 5 × 52 / 12 = 877,500 cents = $8,775.00
const MONTHLY = 877500;

test('the monthly estimate is (price × meals + one delivery fee) × days × 52 / 12, to the cent', () => {
  assert.equal(monthlyEstimateCents(TERMS), MONTHLY);
});

test('no phantom $0: a zero, empty, float or dollar-string price is refused — never read as zero or rounded', () => {
  for (const p of [0, '', null, 9.5, '9.50', '$9.50', -100]) {
    const v = validateProposal({ ...TERMS, price_per_meal_cents: p });
    assert.equal(v.ok, false, `price ${JSON.stringify(p)} must be refused`);
    assert.ok(v.errors.some((e) => /price per meal/i.test(e)), `the error names the price for ${JSON.stringify(p)}`);
  }
  assert.equal(validateProposal(TERMS).ok, true);
});

test('a stated monthly total that disagrees with its line terms by one cent is REFUSED, not reconciled', () => {
  const v = validateProposal({ ...TERMS, estimated_monthly_cents: MONTHLY + 1 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /does not match these terms/.test(e)));
  assert.equal(validateProposal({ ...TERMS, estimated_monthly_cents: MONTHLY }).ok, true);
});

test('delivery days and days-per-week must agree; an empty delivery or rush fee is refused (use 0)', () => {
  assert.equal(validateProposal({ ...TERMS, delivery_days: 'mon,tue,wed' }).ok, false);
  assert.equal(validateProposal({ ...TERMS, delivery_fee_cents: '' }).ok, false);
  assert.equal(validateProposal({ ...TERMS, rush_fee_cents: undefined }).ok, false);
  assert.equal(validateProposal({ ...TERMS, billing_model: 'whenever' }).ok, false, 'an unknown billing model is refused, not defaulted');
});

// The migrations seed the real DGP account, so counts are always taken relative to what was there.
const accountCount = (env) => env.DB.rows('SELECT id FROM contract_accounts').length;

test('end to end: save → confirm (owner, matching total) → convert creates ONE active account on exactly the confirmed terms', async () => {
  const { env, cfg } = await readyEnv();
  const baseline = accountCount(env);
  const { oppId, orgId } = await seedProspect(env, cfg);
  const s = await saveProposal(env, { opportunity_id: oppId, fields: TERMS, ctx: OWNER });
  assert.equal(s.ok, true);
  assert.equal(s.complete, true);
  assert.equal(s.estimated_monthly_cents, MONTHLY);

  const early = await convertToContractAccount(env, { proposal_id: s.proposal_id, ctx: OWNER, expect_monthly_cents: MONTHLY });
  assert.equal(early.ok, false, 'an unconfirmed proposal cannot be converted');
  assert.equal(early.code, 'not_confirmed');

  const stale = await confirmProposal(env, s.proposal_id, { ctx: OWNER, expect_monthly_cents: MONTHLY - 100 });
  assert.equal(stale.ok, false, 'confirming a number that is not on the terms is refused');
  const notOwner = await confirmProposal(env, s.proposal_id, { ctx: { ...OWNER, role: 'marketing' }, expect_monthly_cents: MONTHLY });
  assert.equal(notOwner.ok, false, 'only the owner confirms commercial terms');
  assert.equal((await confirmProposal(env, s.proposal_id, { ctx: OWNER, expect_monthly_cents: MONTHLY })).ok, true);

  const wrong = await convertToContractAccount(env, { proposal_id: s.proposal_id, ctx: OWNER, expect_monthly_cents: MONTHLY + 5 });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, 'stale_total');

  const conv = await convertToContractAccount(env, { proposal_id: s.proposal_id, ctx: OWNER, expect_monthly_cents: MONTHLY });
  assert.equal(conv.ok, true, conv.error);
  const acct = env.DB.one('SELECT * FROM contract_accounts WHERE id = ?', conv.account_id);
  assert.equal(acct.status, 'active');
  assert.equal(acct.name, 'Sunrise Recovery Center');
  assert.equal(acct.billing_model, 'biweekly');
  assert.equal(acct.billing_email, 'billing@sunriserecovery.org');
  const sites = env.DB.rows('SELECT * FROM contract_sites WHERE account_id = ?', conv.account_id);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].price_per_lunch_cents, 950);
  assert.equal(sites[0].delivery_fee_cents, 2500);
  assert.equal(sites[0].rush_fee_cents, 1500);
  assert.equal(sites[0].cutoff_time, '09:00');
  assert.equal(sites[0].delivery_days, 'mon,tue,wed,thu,fri');
  assert.match(sites[0].intake_token, /^[a-f0-9]{32}$/);
  assert.equal(env.DB.rows('SELECT * FROM contract_site_staff WHERE account_id = ?', conv.account_id).length, 1, 'the authorised contact is on the roster');
  const ev = env.DB.rows('SELECT * FROM contract_terms_events WHERE account_id = ?', conv.account_id);
  assert.equal(ev.length, 1);
  assert.match(ev[0].note, /Sales OS conversion/);

  const opp = env.DB.one('SELECT * FROM sales_opportunities WHERE id = ?', oppId);
  assert.equal(opp.stage, 'won');
  assert.equal(opp.converted_contract_account_id, conv.account_id);
  assert.equal(opp.estimated_monthly_revenue_cents, MONTHLY);
  assert.equal(env.DB.one('SELECT status FROM sales_organizations WHERE id = ?', orgId).status, 'converted');
  const prop = env.DB.one('SELECT * FROM sales_proposals WHERE id = ?', s.proposal_id);
  assert.equal(prop.status, 'converted');
  assert.equal(JSON.parse(prop.converted_terms_json).terms.price_per_meal_cents, 950, 'the agreed terms are snapshotted');
  assert.ok(env.DB.rows("SELECT * FROM activity_log WHERE event = 'sales.contract_account_created'").length === 1);

  // A second click — or a retried request — returns the same account and creates nothing.
  const again = await convertToContractAccount(env, { proposal_id: s.proposal_id, ctx: OWNER, expect_monthly_cents: MONTHLY });
  assert.equal(again.ok, true);
  assert.equal(again.already, true);
  assert.equal(again.account_id, conv.account_id);
  assert.equal(accountCount(env), baseline + 1, 'exactly one contract account was created');
  assert.equal(env.DB.rows("SELECT id FROM contract_accounts WHERE name = 'Sunrise Recovery Center'").length, 1);
});

test('conversion can NEVER overwrite an existing account — the seeded DGP rows stay byte-for-byte identical', async () => {
  const { env, cfg } = await readyEnv();
  // The migrations seed the REAL DGP account; the guard is tested against that row, not a stand-in.
  let dgp = env.DB.one("SELECT id, name, billing_email FROM contract_accounts WHERE name LIKE 'DGP%' ORDER BY created_at LIMIT 1");
  if (!dgp) {
    const reg = await registerAccount(env, { company: 'DGP Health & Wellness', billing_email: 'accounts@dgp.example.com', sites: [{ name: 'Delray Beach', street: '2226 W Atlantic Ave', city: 'Delray Beach', zip: '33445' }] });
    await activateAccount(env, reg.account_id, { price_per_lunch_cents: 600, delivery_fee_cents: 2500, rush_fee_cents: 1500, cutoff_time: '09:00' });
    dgp = env.DB.one('SELECT id, name, billing_email FROM contract_accounts WHERE id = ?', reg.account_id);
  }
  // A second, unrelated account with a billing email, to prove the email match independently of DGP's data.
  const other = await registerAccount(env, { company: 'Existing Client Co', billing_email: 'ap@existingclient.example.com', sites: [{ name: 'HQ', street: '1 Main', city: 'Jupiter' }] });
  const snapshot = () => JSON.stringify([env.DB.rows('SELECT * FROM contract_accounts ORDER BY id'), env.DB.rows('SELECT * FROM contract_sites ORDER BY id')]);
  const before = snapshot();

  const { oppId } = await seedProspect(env, cfg, { name: 'DGP Health and Wellness Pompano' });
  const p = await saveProposal(env, { opportunity_id: oppId, fields: { ...TERMS, account_name: dgp.name }, ctx: OWNER });
  await confirmProposal(env, p.proposal_id, { ctx: OWNER, expect_monthly_cents: MONTHLY });
  const r = await convertToContractAccount(env, { proposal_id: p.proposal_id, ctx: OWNER, expect_monthly_cents: MONTHLY });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'account_exists');
  assert.equal(r.existing_account_id, dgp.id);
  assert.equal(snapshot(), before, 'not one field of any existing account or site changed');

  // Same billing email under a different name is caught too.
  const p2 = await saveProposal(env, { opportunity_id: oppId, fields: { ...TERMS, account_name: 'Somebody Else', billing_email: 'AP@existingclient.example.com' }, ctx: OWNER });
  await confirmProposal(env, p2.proposal_id, { ctx: OWNER, expect_monthly_cents: MONTHLY });
  const r2 = await convertToContractAccount(env, { proposal_id: p2.proposal_id, ctx: OWNER, expect_monthly_cents: MONTHLY });
  assert.equal(r2.code, 'account_exists');
  assert.equal(r2.existing_account_id, other.account_id);
  assert.equal(snapshot(), before);

  // The owner's way out: link, which marks the opportunity won and touches the account not at all.
  const link = await linkExistingAccount(env, { opportunity_id: oppId, account_id: dgp.id, ctx: OWNER });
  assert.equal(link.ok, true);
  assert.equal(env.DB.one('SELECT stage FROM sales_opportunities WHERE id = ?', oppId).stage, 'won');
  assert.equal(snapshot(), before);
});

test('a confirmed $0 rush fee is honoured — activateAccount’s default does not leak into confirmed terms', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const p = await saveProposal(env, { opportunity_id: oppId, fields: { ...TERMS, rush_fee_cents: 0 }, ctx: OWNER });
  await confirmProposal(env, p.proposal_id, { ctx: OWNER, expect_monthly_cents: MONTHLY });
  const r = await convertToContractAccount(env, { proposal_id: p.proposal_id, ctx: OWNER, expect_monthly_cents: MONTHLY });
  assert.equal(r.ok, true, r.error);
  assert.equal(env.DB.one('SELECT rush_fee_cents FROM contract_sites WHERE account_id = ?', r.account_id).rush_fee_cents, 0);
});

test('editing a confirmed proposal un-confirms it: terms he has not re-confirmed cannot be converted', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const p = await saveProposal(env, { opportunity_id: oppId, fields: TERMS, ctx: OWNER });
  await confirmProposal(env, p.proposal_id, { ctx: OWNER, expect_monthly_cents: MONTHLY });
  await saveProposal(env, { opportunity_id: oppId, fields: { ...TERMS, price_per_meal_cents: 1000 }, ctx: OWNER });
  assert.equal(env.DB.one('SELECT status FROM sales_proposals WHERE id = ?', p.proposal_id).status, 'draft');
  const r = await convertToContractAccount(env, { proposal_id: p.proposal_id, ctx: OWNER, expect_monthly_cents: monthlyEstimateCents({ ...TERMS, price_per_meal_cents: 1000 }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not_confirmed');
});

test('only the owner can convert', async () => {
  const { env, cfg } = await readyEnv();
  const baseline = accountCount(env);
  const { oppId } = await seedProspect(env, cfg);
  const p = await saveProposal(env, { opportunity_id: oppId, fields: TERMS, ctx: OWNER });
  await confirmProposal(env, p.proposal_id, { ctx: OWNER, expect_monthly_cents: MONTHLY });
  const r = await convertToContractAccount(env, { proposal_id: p.proposal_id, ctx: { ...OWNER, role: 'marketing' }, expect_monthly_cents: MONTHLY });
  assert.equal(r.ok, false);
  assert.equal(accountCount(env), baseline, 'nothing was created');
});
