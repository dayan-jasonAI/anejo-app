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
    return { stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 80 }, content: [{ text: JSON.stringify(body) }] };
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

test('socialPlan audits finished media after photo preparation', () => {
  assert.ok(AUTO.includes("from './social_audit.js'"));
  assert.ok(AUTO.indexOf('await auditSavedDraft(env, postId, caption)') > AUTO.indexOf('const photo = await ensureFoodPhoto'));
  assert.match(AUTO, /audit_scope='caption_and_media'/);
  assert.match(AUTO, /audit_snapshot=\$\{SOCIAL_AUDIT_SNAPSHOT\}/);
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

test('visual audit sends ordered actual JPEG blocks and flags observed visual faults',async()=>{
 const {db}=stubDb({menuItems:MENU});const savedFetch=globalThis.fetch;let sent;
 globalThis.fetch=async(url,init)=>{sent=JSON.parse(init.body);return modelAnswer({brand_score:90,flags:[{type:'photo',detail:'Slide 2: emblem covers food'}],verdict:'pass'})();};
 try {
  const result=await auditDraft({DB:db,ANTHROPIC_API_KEY:'test'}, {caption:'Catering',images:[{data:'first'},{data:'second'}]});
  assert.deepEqual(sent.messages[0].content.filter(c=>c.type==='image').map(c=>c.source.data),['first','second']);
  assert.deepEqual(sent.thinking,{type:'disabled'});
  assert.equal(sent.output_config.format.type,'json_schema');
  assert.equal(sent.output_config.format.schema.additionalProperties,false);
  assert.match(sent.system,/Inspect every image/);assert.equal(result.verdict,'flag');
 }finally{globalThis.fetch=savedFetch;}
});
test('unavailable audits are shown as unavailable rather than a fabricated zero score',()=>{
 const page=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
 assert.match(page,/Brand Auditor · unavailable/);
 assert.ok(page.indexOf('Brand Auditor · unavailable')<page.indexOf('var scoreStr'));
});

test('finished-image judge receives evidence discipline and retains actionable flag explanations', async () => {
  const { db } = stubDb({ menuItems: MENU });
  const original = globalThis.fetch;
  const detail = 'Slide 2: the lower-right headline overlaps the printed label. ' + 'Preserve the complete explanation and the exact conflicting rule. '.repeat(6);
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return modelAnswer({ brand_score: 70, verdict: 'flag', flags: [{ type: 'photo', detail }] })();
  };
  try {
    const result = await auditDraft({ DB: db, ANTHROPIC_API_KEY: 'test-only' }, {
      caption: 'Planning an event? Share your city to confirm availability.',
      images: [{ data: '/9j/AA==' }],
    });
    assert.equal(result.flags.find(f => f.type === 'photo').detail, detail);
    assert.equal(result.verdict, 'flag');
    assert.match(request.system, /Read the whole applicable owner rule/);
    assert.match(request.system, /not a promise of coverage/);
    assert.match(request.system, /Still flag unconditional unsupported service promises/);
    assert.match(request.system, /actual saved slides/);
    assert.equal(request.messages[0].content[1].type, 'image');
    assert.equal(request.model, 'claude-sonnet-5', 'finished images use the existing Studio reasoning model');
  } finally { globalThis.fetch = original; }
});

test('truncated provider JSON never becomes a visual pass and multi-block text can be parsed', async () => {
  const { db, spendInserts } = stubDb({ menuItems: MENU });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ stop_reason: 'max_tokens', usage: {input_tokens:1,output_tokens:4096}, content: [{type:'text',text:'{"brand_score":99'}] }) });
    const limited = await auditDraft({ DB:db, ANTHROPIC_API_KEY:'test-only' }, {caption:'Menu',images:[{data:'/9j/AA=='}]});
    assert.equal(limited.verdict, 'flag');
    assert.match(limited.flags.find(f=>f.type==='audit_unavailable').detail, /output limit/);
    assert.equal(spendInserts.length, 1, 'truncated paid answer still metered');
    globalThis.fetch = async () => ({ ok:true, json:async () => ({stop_reason:'end_turn',content:[{type:'thinking',thinking:'not an audit result'},{type:'text',text:'{"brand_score":95,"flags":[],"verdict":"pass"}'}]}) });
    const complete = await auditDraft({ DB:db, ANTHROPIC_API_KEY:'test-only' }, {caption:'Menu',images:[{data:'/9j/AA=='}]});
    assert.equal(complete.verdict, 'pass');
    assert.equal(complete.brand_score,95);
  } finally { globalThis.fetch=original; }
});

test('any reported actionable violation overrides an inconsistent model pass', async () => {
  const { db } = stubDb({menuItems:MENU}); const original=globalThis.fetch;
  try {
    for (const type of ['claim','voice','training','photo']) {
      globalThis.fetch=modelAnswer({brand_score:98,flags:[{type,detail:'A concrete contradiction remains.'}],verdict:'pass'});
      assert.equal((await auditDraft({DB:db,ANTHROPIC_API_KEY:'test-only'},{caption:'Menu'})).verdict,'flag',type);
    }
  } finally {globalThis.fetch=original;}
});

test('visual structured audit fails closed on incomplete or invalid provider envelopes', async () => {
  const {db}=stubDb({menuItems:MENU});const original=globalThis.fetch;
  try {
    for(const [stop_reason,data] of [
      ['refusal',{brand_score:100,flags:[],verdict:'pass'}],
      ['max_tokens',{brand_score:100,flags:[],verdict:'pass'}],
      ['end_turn',{brand_score:100,verdict:'pass'}],
      ['end_turn',{brand_score:'100',flags:[],verdict:'pass'}],
      ['end_turn',{brand_score:100,flags:Array.from({length:7},()=>({type:'photo',detail:'Issue'})),verdict:'pass'}],
    ]) {
      globalThis.fetch=async()=>({ok:true,json:async()=>({stop_reason,content:[{type:'text',text:JSON.stringify(data)}]})});
      const out=await auditDraft({DB:db,ANTHROPIC_API_KEY:'test'},{caption:'Menu',images:Array.from({length:6},()=>({data:'/9j/AA=='}))});
      assert.equal(out.verdict,'flag');assert.ok(out.flags.some(f=>f.type==='audit_unavailable'));
    }
  }finally{globalThis.fetch=original;}
});
