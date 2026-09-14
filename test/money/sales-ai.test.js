// Sales OS — what AI is allowed to do, pinned. The model may explain a prospect; it may not score
// one, name a person who is not in the evidence, cite a page it never read, or put a price anywhere.
// Emails are composed from verified facts, and what the owner edits is exactly what is stored and sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readyEnv, seedProspect, previewAndApprove, stubFetch, OWNER, TUESDAY_10AM_ET } from '../helpers/sales-fixture.js';
import { validateBrief, deterministicBrief, generateBrief } from '../../functions/_lib/sales/brief.js';
import { composeEmail, checkDraft, pickFact, startSequence, sendApproved } from '../../functions/_lib/sales/outreach.js';
import { scoreOrganization } from '../../functions/_lib/sales/scoring.js';
import { buildFacts, scoreAndStore } from '../../functions/_lib/sales/store.js';

const PAYLOAD = {
  allowed_source_urls: ['https://sunriserecovery.org/programs'],
  contacts: [{ name: 'Maria Ruiz', title: 'Executive Director' }],
  public_signals: [],
};

test('the brief cannot cite a page it never received, name a person not in the evidence, or carry a price', () => {
  const raw = {
    organization: 'Sunrise', what_it_does: 'Runs a PHP.', why_fit: 'Improves recovery outcomes for clients.',
    likely_decision_maker: 'Dr. John Invented, CEO',
    recommended_angle: 'Offer them $8 per meal to undercut their vendor.',
    sources_used: ['https://sunriserecovery.org/programs', 'https://someothersite.example/made-up'],
    operational_clues: ['Lunch at $12 per head', 'Weekday schedule'],
  };
  const { brief, flags } = validateBrief(raw, PAYLOAD);
  assert.deepEqual(brief.sources_used, ['https://sunriserecovery.org/programs']);
  assert.equal(brief.likely_decision_maker, 'Not identified from public sources');
  assert.doesNotMatch(JSON.stringify(brief), /\$\s?\d/);
  assert.deepEqual(brief.operational_clues, ['Weekday schedule']);
  const types = flags.map((f) => f.type);
  for (const t of ['source_removed', 'person_removed', 'price_removed', 'health_claim', 'thin_evidence']) assert.ok(types.includes(t), `flag ${t}`);
  assert.ok(brief.uncertain_facts.length > 0, 'thin evidence is said out loud');
});

test('a decision-maker who IS in the evidence survives validation', () => {
  const { brief } = validateBrief({ likely_decision_maker: 'Maria Ruiz, Executive Director' }, PAYLOAD);
  assert.equal(brief.likely_decision_maker, 'Maria Ruiz, Executive Director');
});

test('missing facts remain missing: the fallback brief lists what we do NOT know instead of guessing', () => {
  const b = deterministicBrief({ organization: { name: 'Quiet Clinic', city: 'Jupiter' }, signals: [], contacts: [] }, null, { cta_text: 'x' });
  assert.equal(b.likely_decision_maker, 'Not identified from public sources');
  const u = b.uncertain_facts.join(' ');
  for (const re of [/capacity/i, /meals/i, /program/i, /decision-maker/i]) assert.match(u, re);
  assert.match(b.likely_meal_need, /not supported/i);
});

test('generateBrief stores the VALIDATED answer, meters its spend, and never lets a price through', async () => {
  const { env, cfg } = await readyEnv({ extraEnv: { ANTHROPIC_API_KEY: 'k' } });
  const { orgId } = await seedProspect(env, cfg);
  const answer = {
    organization: 'Sunrise Recovery Center', location: 'Delray Beach', what_it_does: 'Partial hospitalization program.',
    why_fit: 'Clients on site every weekday.', likely_meal_need: 'Weekday lunch.', likely_decision_maker: 'Dr. Nobody Real',
    operational_clues: ['Lunch provided'], recommended_angle: 'Quote $7.50 per plate.', recommended_cta: 'Sample menu',
    likely_objections: ['Existing vendor'], uncertain_facts: [], sources_used: ['https://invented.example/'],
  };
  const fetchImpl = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(answer) }], usage: { input_tokens: 1200, output_tokens: 300 } }), { status: 200 });
  const r = await generateBrief(env, orgId, { cfg, ctx: OWNER, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'ai');
  const stored = env.DB.one('SELECT brief_json, flags_json, model FROM sales_briefs WHERE organization_id = ?', orgId);
  assert.doesNotMatch(stored.brief_json, /\$\s?\d/);
  assert.doesNotMatch(stored.brief_json, /Nobody Real|invented\.example/);
  assert.equal(stored.model, 'claude-haiku-4-5');
  assert.equal(env.DB.rows("SELECT * FROM ai_spend WHERE feature = 'sales_brief'").length, 1, 'metered against the $50/week ceiling');
});

test('with no API key the brief is built from facts alone and says so — no network call', async () => {
  const { env, cfg } = await readyEnv();
  const { orgId } = await seedProspect(env, cfg);
  let called = false;
  const r = await generateBrief(env, orgId, { cfg, ctx: OWNER, fetchImpl: async () => { called = true; return new Response('{}'); } });
  assert.equal(r.kind, 'deterministic');
  assert.equal(called, false);
  assert.match(r.flags[0].detail, /no ANTHROPIC_API_KEY/);
});

test('model output cannot alter the deterministic score', async () => {
  const { env, cfg } = await readyEnv({ extraEnv: { ANTHROPIC_API_KEY: 'k' } });
  const { orgId } = await seedProspect(env, cfg);
  const before = await scoreAndStore(env, orgId, { cfg, ctx: OWNER });
  const fetchImpl = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ why_fit: 'score: 100, tier A, perfect fit', uncertain_facts: [] }) }], usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
  await generateBrief(env, orgId, { cfg, ctx: OWNER, fetchImpl });
  const after = await scoreAndStore(env, orgId, { cfg, ctx: OWNER });
  assert.equal(after.score, before.score);
  assert.equal(after.tier, before.tier);
  assert.deepEqual(after.criteria, before.criteria);
  const facts = await buildFacts(env, orgId);
  assert.deepEqual(scoreOrganization({ ...facts, brief: { score: 100, tier: 'A' } }, cfg.icp, cfg.service_area), scoreOrganization(facts, cfg.icp, cfg.service_area),
    'extra keys in the facts object are ignored');
});

test('the scoring engine is pure: it imports nothing, so no model client can reach it', () => {
  const src = readFileSync(new URL('../../functions/_lib/sales/scoring.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /anthropic|fetch\(/i);
});

test('emails are composed from verified facts only; with no fact, the opener claims nothing at all', async () => {
  const { cfg } = await readyEnv();
  const org = { name: 'Quiet Clinic', city: 'Jupiter', current_tier: 'B' };
  const none = composeEmail({ templateType: 'intro', org, contact: null, signals: [], cfg, landingUrl: 'https://x/for/t' });
  assert.match(none.body, /I am writing to a few programs in Jupiter about scheduled meal service\./);
  assert.doesNotMatch(none.body, /we work with|we serve|our clients|like yours/i, 'no implied customers');
  assert.ok(none.claims.some((c) => /No verified fact/.test(c.text)), 'the card tells the owner why it is generic');
  assert.match(none.body, /^Hello,/, 'no name is invented');
  const withFact = composeEmail({ templateType: 'intro', org, contact: null, cfg, landingUrl: 'https://x/for/t',
    signals: [{ kind: 'day_program', snippet: 'Our intensive outpatient program meets weekdays.', url: 'https://quiet.org/iop' }] });
  assert.match(withFact.body, /your intensive outpatient program/);
  assert.ok(withFact.claims.some((c) => c.source === 'https://quiet.org/iop'), 'the fact carries its source');
});

test('no composed email contains a price, a free offer, or DGP by default — in any of the four steps', async () => {
  const { cfg } = await readyEnv();
  const org = { name: 'Sunrise Recovery Center', city: 'Delray Beach', current_tier: 'A' };
  for (const templateType of ['intro', 'value_proof', 'menu_pricing', 'close_loop']) {
    const e = composeEmail({ templateType, org, contact: { first_name: 'Maria', confidence: 'medium' }, signals: [], cfg, landingUrl: 'https://x/for/t' });
    assert.doesNotMatch(e.subject + e.body, /\$\s?\d|\bfree\b|complimentary|DGP/i, templateType);
    assert.deepEqual(checkDraft(e, cfg), [], `${templateType} passes its own governance`);
  }
});

test('an inferred (low-confidence) name is never used to address someone', async () => {
  const { cfg } = await readyEnv();
  const e = composeEmail({ templateType: 'intro', org: { name: 'X' }, contact: { first_name: 'Guess', confidence: 'low' }, signals: [], cfg });
  assert.match(e.body, /^Hello,/);
  assert.doesNotMatch(e.body, /Guess/);
});

test('governance flags invented prices, free offers, health and dietary claims, DGP, stated times and a fake Re:', async () => {
  const { cfg } = await readyEnv();
  const f = (subject, body) => checkDraft({ subject, body }, cfg).map((x) => x.type);
  assert.ok(f('Hi', 'Only $8.50 a plate').includes('price'));
  assert.ok(f('Hi', 'First week complimentary').includes('offer'));
  assert.ok(f('Hi', 'Our meals improve recovery').includes('health'));
  assert.ok(f('Hi', 'Everything is gluten-free').includes('dietary'));
  assert.ok(f('Hi', 'DGP loves us').includes('proof'));
  assert.ok(f('Hi', 'Delivered by 11:30 am daily').includes('claim'));
  assert.ok(f('Re: our chat', 'Hello').includes('subject'));
  const priced = { ...cfg, offer: { ...cfg.offer, pricing_display_policy: 'show_from', price_from_cents: 850 } };
  assert.deepEqual(checkDraft({ subject: 'Hi', body: 'From $8.50 per meal.' }, priced), [], 'the owner’s configured price is allowed');
});

test('the owner’s edit is exactly what is stored and exactly what is sent', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const s = await startSequence(env, { opportunity_id: oppId, cfg, ctx: OWNER });
  const edited = 'Hi Maria,\n\nDayan here — I run Añejo. Could I send a sample week of lunches for your PHP?\n\nDayan';
  const a = await previewAndApprove(env, cfg, s.outreach_id, { subject: 'A sample week of lunches', body: edited });
  assert.equal(a.ok, true, a.error);
  const row = env.DB.one('SELECT subject, body_snapshot, edited FROM sales_outreach WHERE id = ?', s.outreach_id);
  assert.equal(row.body_snapshot, edited);
  assert.equal(row.edited, 1);
  const fx = stubFetch();
  try {
    await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET });
    const sent = fx.calls[0].body;
    assert.equal(sent.subject, 'A sample week of lunches');
    assert.ok(sent.text.startsWith(edited), 'the text part begins with his words, verbatim');
    assert.match(sent.html, /Dayan here — I run Añejo/);
  } finally { fx.restore(); }
});

test('pickFact prefers a program over a schedule, and returns nothing rather than inventing one', () => {
  assert.equal(pickFact([]), null);
  const f = pickFact([{ kind: 'weekday_schedule', snippet: 'Monday through Friday', url: 'u1' }, { kind: 'day_program', snippet: 'Adult day care services daily', url: 'u2' }]);
  assert.equal(f.text, 'your adult day program');
  assert.equal(f.url, 'u2');
});
