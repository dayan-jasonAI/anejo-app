// The AI budget meter: the owner's $50/week ceiling on model spend, and HARD MEANS HARD.
//
// Three behaviors carry the money here, and each is pinned:
//   · The gate REFUSES at the limit — spent >= $50 means no new model call, anywhere.
//   · Every spend is integer microdollars — floating-point money drifts, and a drifting
//     sum is a ceiling that moves.
//   · Every api.anthropic.com caller is wired in — one unmetered caller and the ledger
//     is fiction, so the sweep below checks the codebase, not a hand-kept list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  priceFor, isoWeekOf, recordSpend, weekSpend, underBudget, budgetGate, WEEKLY_LIMIT_MICRO,
} from '../../functions/_lib/ai_budget.js';
import { runAutomation } from '../../functions/_lib/automations.js';

const LIB = readFileSync(new URL('../../functions/_lib/ai_budget.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0066_ai_spend.sql', import.meta.url), 'utf8');
const RUN = readFileSync(new URL('../../functions/api/hub/automations/run.js', import.meta.url), 'utf8');
const FUNCTIONS_DIR = fileURLToPath(new URL('../../functions/', import.meta.url));

// A D1 stub that answers the gate's SUM with `weekSpent` and captures ai_spend inserts.
function stubDb(weekSpent = 0) {
  const inserts = [];
  const db = {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() { return /FROM ai_spend/.test(sql) ? { c: weekSpent } : null; },
        async all() { return { results: [] }; },
        async run() { if (/INSERT INTO ai_spend/.test(sql)) inserts.push(stmt.args); return {}; },
      };
      return stmt;
    },
  };
  return { db, inserts };
}

test('the gate REFUSES at the limit — hard means hard, with the reason spelled out', async () => {
  const { db } = stubDb(WEEKLY_LIMIT_MICRO); // exactly $50 spent
  const g = await budgetGate({ DB: db });
  assert.equal(g.ok, false);
  assert.equal(g.reason, 'weekly AI budget reached');
  assert.equal(g.remaining, 0);

  const over = await budgetGate({ DB: stubDb(WEEKLY_LIMIT_MICRO + 1).db });
  assert.equal(over.ok, false, 'over the ceiling is refused too, not just exactly at it');
});

test('one microdollar under the limit still passes — the ceiling is >=, not fuzzy', async () => {
  const { db } = stubDb(WEEKLY_LIMIT_MICRO - 1);
  const g = await budgetGate({ DB: db });
  assert.equal(g.ok, true);
  assert.equal(g.remaining, 1);
  const b = await underBudget({ DB: db });
  assert.equal(b.spent, WEEKLY_LIMIT_MICRO - 1);
});

test('spend is recorded per call, in exact integer microdollars', async () => {
  const { db, inserts } = stubDb(0);
  await recordSpend({ DB: db }, {
    feature: 'chat', model: 'claude-sonnet-4-6',
    usage: { input_tokens: 1000, output_tokens: 200 },
  });
  assert.equal(inserts.length, 1, 'one row per call');
  const [, week, , feature, model, inTok, outTok, cost] = inserts[0];
  assert.equal(feature, 'chat');
  assert.equal(model, 'claude-sonnet-4-6');
  assert.equal(inTok, 1000);
  assert.equal(outTok, 200);
  // THE pinned multiplication: $3/MTok in + $15/MTok out == 3 and 15 microdollars per token,
  // so 1000 in + 200 out MUST cost exactly 1000*3 + 200*15 = 6000 microdollars ($0.006).
  assert.equal(cost, 6000);
  assert.equal(week, isoWeekOf(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })));
});

test('pricing: dated model ids resolve by prefix, unknown models are priced HIGH, not free', () => {
  // Haiku at $1/MTok input: a full MTok of input is exactly $1 = 1,000,000 microdollars.
  assert.equal(priceFor('claude-haiku-4-5-20251001', { in: 1_000_000, out: 0 }), 1_000_000);
  // An id the table has never heard of bills at the most expensive row — undercounting an
  // unknown model is how spend sails past the ceiling unnoticed. Opus rows raised this ceiling
  // from sonnet's $3 to opus's $15 per input MTok, which is the point: MORE conservative.
  assert.equal(priceFor('claude-mystery-9', { in: 1_000_000, out: 0 }), 15_000_000);
  assert.equal(priceFor('claude-sonnet-4-6', { in: 0, out: 1_000_000 }), 15_000_000);
});

test('ISO weeks own the year boundary — Jan 1 must not start a fresh budget mid-week', () => {
  assert.equal(isoWeekOf('2026-01-01'), '2026-01');       // a Thursday: week 1 of its own year
  assert.equal(isoWeekOf('2027-01-01'), '2026-53');       // a Friday: still ISO week 53 of 2026
  assert.equal(isoWeekOf('2026-07-31'), '2026-31');
});

test('a broken meter fails OPEN, and no usage means no row', async () => {
  // A missing table has recorded nothing, so blocking every AI surface on it would punish
  // the customer for our migration gap.
  const env = { DB: { prepare() { throw new Error('no such table: ai_spend'); } } };
  assert.equal(await weekSpend(env), 0);
  assert.equal((await budgetGate(env)).ok, true);
  const { db, inserts } = stubDb(0);
  await recordSpend({ DB: db }, { feature: 'x', model: 'claude-haiku-4-5', usage: { input_tokens: 0, output_tokens: 0 } });
  assert.equal(inserts.length, 0);
});

test('socialPlan SKIPS with reason "budget" when gated — no template fallback, no quiet gap', async () => {
  const { db } = stubDb(WEEKLY_LIMIT_MICRO);
  const r = await runAutomation({ DB: db, ANTHROPIC_API_KEY: 'k' }, 'social_plan', { date: '2026-07-31' });
  assert.equal(r.outcome, 'skipped');
  assert.equal(r.output.reason, 'budget');
  assert.match(r.summary, /weekly ai budget/i, 'the summary says so plainly, not in a code');
});

test('EVERY api.anthropic.com caller is gated AND metered — the sweep, not a hand-kept list', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : (e.name.endsWith('.js') ? [p] : []);
  });
  const callers = walk(FUNCTIONS_DIR).filter((p) => readFileSync(p, 'utf8').includes('api.anthropic.com'));
  assert.ok(callers.length >= 10, `expected the known caller set, found ${callers.length}`);
  for (const p of callers) {
    const src = readFileSync(p, 'utf8');
    assert.ok(src.includes('budgetGate('), `${p} hits api.anthropic.com without asking budgetGate first`);
    assert.ok(src.includes('recordSpend('), `${p} hits api.anthropic.com without recording its spend`);
  }
});

test('the prices table is dated and warns that stale prices UNDERCOUNT', () => {
  assert.match(LIB, /2026-07-31/, 'the day the prices were copied is written down');
  assert.match(LIB, /STALE PRICES UNDERCOUNT/i);
  assert.match(LIB, /quarterly/i, 'and a review cadence is named');
});

test('money is integer microdollars end to end, and the ledger says why', () => {
  assert.match(MIG, /cost_microdollars INTEGER/);
  assert.match(MIG, /floating-point money drifts/i);
  assert.equal(WEEKLY_LIMIT_MICRO, 50_000_000, 'the owner said $50, the constant says $50');
});

test('the owner can SEE the meter: the automations GET carries ai_budget in dollars', () => {
  assert.match(RUN, /ai_budget: \{/);
  assert.match(RUN, /spent_usd/);
  assert.match(RUN, /limit_usd/);
  assert.match(RUN, /remaining_usd/);
});
