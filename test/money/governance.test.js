// Governance gates: the Brand Auditor + Claims Checker that scores every generated draft
// BEFORE the owner sees it.
//
// The behaviors that carry the risk, each pinned:
//   · Deterministic claim checks catch what the model cannot be trusted to catch on itself —
//     an invented price, a hard-coded "6 PM", a bare '/order' link.
//   · A deterministic flag OVERRULES a model "pass" — code catches lies, it does not absolve.
//   · The audit fails OPEN INTO REVIEW: no key / budget ceiling / API failure all produce
//     verdict 'flag' with 'audit_unavailable' — an unscored draft must never look passed.
//   · The one model call is budget-gated before and metered after, feature 'governance_audit'.
//   · socialPlan writes the audit onto every draft row, and the owner GET carries it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditDraft, deterministicFlags } from '../../functions/_lib/governance.js';
import { WEEKLY_LIMIT_MICRO } from '../../functions/_lib/ai_budget.js';

const GOV = readFileSync(new URL('../../functions/_lib/governance.js', import.meta.url), 'utf8');
const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const SOCIAL_API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0071_governance.sql', import.meta.url), 'utf8');

// A D1 stub that serves a live menu, the owner's ops dials, the budget SUM, and captures
// ai_spend inserts — everything auditDraft touches. `docsRows`/`trainingRows` are optional so
// most tests exercise the honest-empty path (no live brief, no training) without having to say so.
function stubDb({ weekSpent = 0, menuItems = [], settings = [], docsRows = [], trainingRows = [] } = {}) {
  const spendInserts = [];
  const db = {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() { return /FROM ai_spend/.test(sql) ? { c: weekSpent } : null; },
        async all() {
          if (/FROM menu_items/.test(sql)) return { results: menuItems };
          if (/menu_modifier_prices/.test(sql)) return { results: [] };
          if (/FROM app_settings/.test(sql)) return { results: settings };
          if (/FROM docs/.test(sql)) return { results: docsRows };
          if (/FROM training_rules/.test(sql)) return { results: trainingRows };
          if (/FROM training_examples/.test(sql)) return { results: [] };
          return { results: [] };
        },
        async run() {
          if (/INSERT INTO ai_spend/.test(sql)) spendInserts.push(stmt.args);
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { db, spendInserts };
}

const MENU = [
  { id: 'vida', kind: 'bowl', name: 'VIDA', price_cents: 1999, description: 'seared tuna, mango, lime', active: 1, sort: 1 },
  { id: 'fuego', kind: 'bowl', name: 'FUEGO', price_cents: 2299, description: 'grilled steak, chimichurri', active: 1, sort: 2 },
];

// A model answer factory for stubbing fetch. Restores are the caller's job (try/finally).
const modelAnswer = (body) => async () => ({
  ok: true,
  async json() {
    return { usage: { input_tokens: 500, output_tokens: 80 }, content: [{ text: JSON.stringify(body) }] };
  },
});

test('an invented price is caught DETERMINISTICALLY — a $14.99 no menu row charges is a claim flag', async () => {
  const { db } = stubDb({ menuItems: MENU });
  const a = await auditDraft({ DB: db }, { caption: 'VIDA tonight, only $14.99!', image_brief: 'bowl on matte black' });
  assert.equal(a.verdict, 'flag');
  assert.ok(a.flags.some((f) => f.type === 'claim' && /\$14\.99/.test(f.detail)),
    `expected a claim flag naming $14.99, got ${JSON.stringify(a.flags)}`);

  // The same caption with the REAL price draws no price flag — the check reads the live
  // menu, it does not blanket-ban dollar signs.
  const b = await auditDraft({ DB: db }, { caption: 'VIDA tonight, $19.99.', image_brief: '' });
  assert.ok(!b.flags.some((f) => f.type === 'claim' && /\$19\.99/.test(f.detail)),
    'a price the menu actually charges must not be flagged');
});

test('"6 PM" is checked against the OWNER\'S dial, not assumed — flagged only when the dial moved', async () => {
  // Default order_by_hour is 18, so "6 PM" is currently true → no cutoff flag.
  const { db: dbDefault } = stubDb({ menuItems: MENU });
  const ok = await auditDraft({ DB: dbDefault }, { caption: 'Order by 6 PM the day before.' });
  assert.ok(!ok.flags.some((f) => /6 PM/.test(f.detail) && f.type === 'claim'),
    'with the dial at 18, "6 PM" is a true statement');

  // The owner moves the dial to 17 → the same caption is now a lie, and both spellings catch.
  const { db: dbMoved } = stubDb({ menuItems: MENU, settings: [{ key: 'ops.order_by_hour', value: '17' }] });
  for (const caption of ['Order by 6 PM the day before.', 'order by 6pm!']) {
    const a = await auditDraft({ DB: dbMoved }, { caption });
    assert.ok(a.flags.some((f) => f.type === 'claim' && /order-by hour is 17/.test(f.detail)),
      `"${caption}" must be flagged once the dial reads 17`);
    assert.equal(a.verdict, 'flag');
  }
});

test("a bare '/order' is flagged; the full-domain link is not", () => {
  const opts = { priceCents: new Set(), orderByHour: 18 };
  assert.ok(deterministicFlags('Tap /order to get yours', opts).some((f) => /full domain/.test(f.detail)));
  assert.equal(deterministicFlags('Order at anejocateringco.com/order', opts).length, 0);
});

test("fail-open means open INTO REVIEW: no API key → verdict 'flag' + audit_unavailable, even on a clean caption", async () => {
  const { db } = stubDb({ menuItems: MENU });
  const a = await auditDraft({ DB: db }, { caption: 'Fresh bowls this week. Link in bio.' });
  assert.equal(a.verdict, 'flag', 'an unscored draft must never look passed');
  assert.ok(a.flags.some((f) => f.type === 'audit_unavailable'));
  assert.equal(a.brand_score, 0);
});

test('the model call is BUDGET-GATED: at the $50 ceiling no request leaves, and the draft is not silently passed', async () => {
  const { db } = stubDb({ weekSpent: WEEKLY_LIMIT_MICRO, menuItems: MENU });
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not be called'); };
  try {
    const a = await auditDraft({ DB: db, ANTHROPIC_API_KEY: 'k' }, { caption: 'hola' });
    assert.equal(calls, 0, 'budgetGate must refuse before fetch');
    assert.equal(a.verdict, 'flag');
    assert.ok(a.flags.some((f) => f.type === 'audit_unavailable' && /budget/i.test(f.detail)));
  } finally { globalThis.fetch = realFetch; }
});

test("a clean draft the model passes IS a pass — and the call is metered as 'governance_audit' on Haiku", async () => {
  const { db, spendInserts } = stubDb({ menuItems: MENU });
  const realFetch = globalThis.fetch;
  let sentBody = null;
  globalThis.fetch = async (url, init) => {
    sentBody = JSON.parse(init.body);
    return modelAnswer({ brand_score: 92, flags: [], verdict: 'pass' })();
  };
  try {
    const a = await auditDraft({ DB: db, ANTHROPIC_API_KEY: 'k' }, { caption: 'VIDA is back. Link in bio.', image_brief: 'bowl front and center, matte black' });
    assert.equal(a.verdict, 'pass');
    assert.equal(a.brand_score, 92);
    assert.equal(sentBody.model, 'claude-haiku-4-5', 'audits ride Haiku');
    assert.ok(sentBody.system.includes('Añejo Catering Co'), 'the judge speaks for the brand');
    assert.ok(sentBody.system.includes('VIDA ($19.99)'), 'the LIVE menu is in the prompt, price included');
    assert.equal(spendInserts.length, 1, 'one metered row per call');
    assert.equal(spendInserts[0][3], 'governance_audit', 'feature name pins the ledger line');
  } finally { globalThis.fetch = realFetch; }
});

test("a deterministic flag OVERRULES a model 'pass' — code catches lies, it does not absolve", async () => {
  const { db } = stubDb({ menuItems: MENU });
  const realFetch = globalThis.fetch;
  globalThis.fetch = modelAnswer({ brand_score: 95, flags: [], verdict: 'pass' });
  try {
    const a = await auditDraft({ DB: db, ANTHROPIC_API_KEY: 'k' }, { caption: 'All bowls $9.99 today!' });
    assert.equal(a.verdict, 'flag', 'the invented price wins over the model verdict');
    assert.equal(a.brand_score, 95, 'the score is still the model\'s — the verdict is not');
    assert.ok(a.flags.some((f) => f.type === 'claim' && /\$9\.99/.test(f.detail)));
  } finally { globalThis.fetch = realFetch; }
});

test('socialPlan wires the audit onto every draft row — source pin', () => {
  assert.ok(AUTO.includes("from './governance.js'"), 'automations.js imports the auditor');
  assert.ok(AUTO.includes('auditDraft(env, { caption, image_brief: brief })'), 'each draft is audited as inserted');
  assert.match(AUTO, /UPDATE social_posts SET audit_score=\?, audit_flags=\?, audit_at=\?/,
    'the audit lands on the row the owner will read');
});

test('the owner GET carries the audit out — audit columns in the posts SELECT', () => {
  assert.match(SOCIAL_API, /SELECT [^']*audit_score, audit_flags, audit_at[^']* FROM social_posts/);
});

test('migration 0071 is additive and complete — three ALTERs, and NULL documented as unscored-not-passed', () => {
  assert.match(MIG, /ALTER TABLE social_posts ADD COLUMN audit_score INTEGER/);
  assert.match(MIG, /ALTER TABLE social_posts ADD COLUMN audit_flags TEXT/);
  assert.match(MIG, /ALTER TABLE social_posts ADD COLUMN audit_at INTEGER/);
  assert.match(MIG, /never as passed/i);
  assert.ok(!/DROP|CREATE TABLE/i.test(MIG), 'additive only');
});

test('the auditor itself is gated AND metered — the sweep in ai-budget.test.js must keep passing here', () => {
  assert.ok(GOV.includes('api.anthropic.com'));
  assert.ok(GOV.includes('budgetGate('), 'gate before the call');
  assert.ok(GOV.includes('recordSpend('), 'meter after the call');
  assert.match(GOV, /feature: 'governance_audit'/);
});

// ---------------------------------------------------------------------------
// One brand source: the auditor reads the SAME shared loader as the Team Lead and the planner
// (functions/_lib/brand_source.js), not a private BRAND_CONTEXT import — source-pinned so an
// unused import can never pass for wiring.
// ---------------------------------------------------------------------------

test('the auditor reads the shared brand loader, not a private BRAND_CONTEXT import', () => {
  assert.match(GOV, /import \{ loadBrand \} from '\.\/brand_source\.js'/);
  assert.match(GOV, /await loadBrand\(env, \{ maxChars: BRAND_BUDGET \}\)/, 'and must actually CALL it — an unused import is not wiring');
  assert.ok(!/from '\.\/brand_context\.js'/.test(GOV), 'no private brand_context import left behind');
});

test('the auditor prefers the live D1 brief and falls back to the compiled snapshot, same as the Team Lead and planner', async () => {
  const { db } = stubDb({ menuItems: MENU, docsRows: [{ title: 'Brand & Standards Brief', body: 'Owner-approved voice, live from the HUB.' }] });
  const realFetch = globalThis.fetch;
  let sentBody = null;
  globalThis.fetch = async (url, init) => { sentBody = JSON.parse(init.body); return modelAnswer({ brand_score: 90, flags: [], verdict: 'pass' })(); };
  try {
    await auditDraft({ DB: db, ANTHROPIC_API_KEY: 'k' }, { caption: 'Fresh bowls this week. Link in bio.' });
    assert.match(sentBody.system, /live from the HUB, owner-maintained/, 'the header names the live source');
    assert.match(sentBody.system, /Owner-approved voice, live from the HUB\./, 'the live text itself reached the judge');
  } finally { globalThis.fetch = realFetch; }

  // No live doc in D1 → the compiled snapshot is the floor, never an empty brief.
  const { db: dbEmpty } = stubDb({ menuItems: MENU });
  globalThis.fetch = async (url, init) => { sentBody = JSON.parse(init.body); return modelAnswer({ brand_score: 90, flags: [], verdict: 'pass' })(); };
  try {
    const a = await auditDraft({ DB: dbEmpty, ANTHROPIC_API_KEY: 'k' }, { caption: 'Fresh bowls this week. Link in bio.' });
    assert.equal(a.brand_source, 'repo');
    assert.match(sentBody.system, /verbatim, written by the owner/);
    assert.match(sentBody.system, /40% protein \/ 30% carbs \/ 30% fat/, 'the Golden Rule from the compiled snapshot');
  } finally { globalThis.fetch = realFetch; }
});

// ---------------------------------------------------------------------------
// Owner training reaches the judge too — a rule is an instruction, and violating one is a flag
// that can never verdict "pass", even when the model itself says otherwise.
// ---------------------------------------------------------------------------

test("owner training reaches the audit prompt, framed as instructions the judge must enforce", async () => {
  const { db } = stubDb({ menuItems: MENU, trainingRows: [{ id: 't1', text: 'Never use the word "diet" anywhere in a caption.', created_by: 'owner', created_at: 1, updated_at: 2 }] });
  let sentBody = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sentBody = JSON.parse(init.body); return modelAnswer({ brand_score: 90, flags: [], verdict: 'pass' })(); };
  try {
    await auditDraft({ DB: db, ANTHROPIC_API_KEY: 'k' }, { caption: 'Fresh bowls. Link in bio.' });
    assert.match(sentBody.system, /Never use the word "diet" anywhere in a caption\./, 'the owner rule reached the judge');
    assert.match(sentBody.system, /must NEVER verdict "pass"/, 'the scoring instruction is explicit, not implied');
  } finally { globalThis.fetch = realFetch; }
});

test('a reported training violation OVERRULES a model "pass" — the same discipline as a deterministic claim flag', async () => {
  const { db } = stubDb({ menuItems: MENU, trainingRows: [{ id: 't1', text: 'Never mention a competitor.', created_by: 'owner', created_at: 1, updated_at: 2 }] });
  const realFetch = globalThis.fetch;
  // The model reports the violation it was asked to look for, but (a bug, or an inattentive
  // judge) still calls the draft "pass" — the code must not trust that.
  globalThis.fetch = modelAnswer({ brand_score: 88, flags: [{ type: 'training', detail: 'Mentions a rival caterer by name.' }], verdict: 'pass' });
  try {
    const a = await auditDraft({ DB: db, ANTHROPIC_API_KEY: 'k' }, { caption: 'Better than [Rival Caterer], every time.' });
    assert.equal(a.verdict, 'flag', 'a training violation can never pass, regardless of what the model claims');
    assert.ok(a.flags.some((f) => f.type === 'training' && /rival caterer/i.test(f.detail)));
    assert.equal(a.brand_score, 88, 'the score itself is still the model\'s — only the verdict is overruled');
  } finally { globalThis.fetch = realFetch; }
});

test('with no training recorded, the audit prompt and verdict logic are exactly as before this wiring', async () => {
  const { db } = stubDb({ menuItems: MENU }); // trainingRows defaults to []
  let sentBody = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sentBody = JSON.parse(init.body); return modelAnswer({ brand_score: 92, flags: [], verdict: 'pass' })(); };
  try {
    const a = await auditDraft({ DB: db, ANTHROPIC_API_KEY: 'k' }, { caption: 'VIDA is back. Link in bio.' });
    assert.ok(!sentBody.system.includes("OWNER'S TRAINING"), 'no header when there is nothing to say — never a dangling section');
    assert.equal(a.verdict, 'pass');
  } finally { globalThis.fetch = realFetch; }
});

test('"training" joins the model flag allowlist without weakening it — an unknown type still coerces to claim', () => {
  assert.match(GOV, /new Set\(\['claim', 'voice', 'photo', 'training'\]\)/);
});

test('training is wired with an explicit, budget-capped call — source pin', () => {
  assert.match(GOV, /import \{ trainingContext \} from '\.\/training\.js'/);
  assert.match(GOV, /await trainingContext\(env, \{ maxChars: TRAINING_BUDGET \}\)/, 'an unused import is not wiring');
});
