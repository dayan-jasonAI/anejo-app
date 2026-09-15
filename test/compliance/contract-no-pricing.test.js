// The office lunch-count page must never expose money.
//
// The person filling it in counts heads; they are not the person who approves the account's
// spending. Unit price, delivery fee, rush fee and running totals belong on the invoice, which
// goes to the account's decision-maker.
//
// This is enforced at the API, not in the UI, and that distinction is the whole point: /lunch-count
// is PUBLIC — the token sits in the URL, there is no login — so anything the endpoint returns is
// readable by anyone the link is forwarded to. Hiding a field in the markup while still sending it
// only moves the disclosure to the network tab.
//
// The amounts are still computed and stored on contract_orders; the owner's invoicing reads them
// there. These tests pin that they never travel to the office contact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LIB = readFileSync(new URL('../../functions/_lib/contract.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/lunch-count.html', import.meta.url), 'utf8');

// Pull one function's source so we assert on what a specific response returns.
function body(src, marker, endMarker) {
  const i = src.indexOf(marker);
  assert.ok(i !== -1, `could not find ${marker} — this test needs updating, not deleting`);
  const j = endMarker ? src.indexOf(endMarker, i) : src.length;
  return src.slice(i, j === -1 ? src.length : j);
}

const MONEY_FIELDS = [
  'price_per_lunch_cents',
  'subtotal_cents',
  'delivery_fee_cents',
  'rush_fee_cents',
  'total_cents',
];

test('the submit response returns no money fields', () => {
  // From the object literal returned by submitHeadcount through the end of that return.
  const ret = body(LIB, '  return {\n    ok: true, account: account.name, site: site.name', '\n}');
  for (const f of MONEY_FIELDS) {
    assert.ok(!ret.includes(f + ':'), `submitHeadcount must not return ${f}`);
  }
  assert.ok(ret.includes('count: n'), 'the headcount itself is still returned');
});

test('the site context returns no unit price and no total for today', () => {
  const ret = body(LIB, '    ok: true, account: (account && account.name)', 'export');
  assert.ok(!ret.includes('price_per_lunch_cents:'), 'unit price must not reach the intake page');
  assert.ok(!/already:.*total_cents/.test(ret), "today's stored total must not be echoed back");
  assert.ok(ret.includes('already:'), 'the existing count is still returned so it can be edited');
});

test('the month summary is counts only', () => {
  const fn = body(LIB, 'async function monthFor', '\n}');
  assert.ok(!/return \{[^}]*total_cents/.test(fn), 'no monthly total');
  assert.ok(fn.includes('safeDays'), 'per-day rows are rebuilt without amounts');
  assert.ok(!/safeDays[\s\S]{0,200}total_cents/.test(fn), 'no per-day amount survives into safeDays');
});

test('the SMS receipt carries no dollar amount', () => {
  const fn = body(LIB, 'function receiptBody', '\nfunction otpBody');
  assert.ok(!fn.includes('total_cents'), 'a texted total lands in front of whoever holds the phone');
  assert.ok(!fn.includes("'$'"), 'no currency formatting in the receipt');
  assert.ok(fn.includes('r.count'), 'the count is still confirmed back to them');
});

test('the page renders no amounts at all', () => {
  assert.ok(!/money\s*\(/.test(PAGE.replace(/no money\(\) helper/g, '')), 'no money() calls remain');
  for (const f of MONEY_FIELDS) {
    assert.ok(!PAGE.includes('ctx.' + f), `page must not read ctx.${f}`);
    assert.ok(!PAGE.includes('d.' + f), `page must not read d.${f}`);
  }
});

test('the cut-off warning states the operational fact without quoting a fee', () => {
  // Late counts really are a rush and the office should know — they just should not be shown
  // a charge for it here.
  assert.ok(/rush/i.test(PAGE), 'the rush condition is still communicated');
  assert.ok(!/rush fee of/i.test(PAGE), 'no fee amount phrasing');
  assert.ok(!/small rush fee applies/i.test(PAGE), 'no fee language on the cut-off banner');
});

test('invoicing still has the numbers it needs', () => {
  // The guard above must not be satisfied by deleting the pricing logic outright.
  const quote = body(LIB, 'export async function quoteContractDay', '\n}');
  assert.ok(quote.includes('const sitePrice = Number(site.price_per_lunch_cents)'), 'the site price is still the fallback');
  assert.ok(LIB.includes('rush_fee_cents=excluded.rush_fee_cents'), 'fees still persisted per order');
  assert.ok(LIB.includes('price_per_lunch_cents=excluded.price_per_lunch_cents'), 'the price actually used is what the ledger snapshots');
  assert.ok(/INSERT INTO contract_orders|contract_orders\s*\n/.test(LIB), 'orders still store money');
});

test('both head-count paths price a day through the ONE shared rule', () => {
  // Two copies of count × price + delivery + rush is how an owner override and an office submit
  // come to disagree about the same day. A per-dish price makes that drift a billing error.
  const submit = body(LIB, 'export async function submitHeadcount', '\n}');
  const override = body(LIB, 'export async function ownerSetHeadcount', '\n}');
  for (const [name, fn] of [['submitHeadcount', submit], ['ownerSetHeadcount', override]]) {
    assert.ok(fn.includes('await quoteContractDay(env, {'), `${name} must use quoteContractDay`);
    assert.ok(!/Number\(site\.price_per_lunch_cents\)/.test(fn), `${name} must not price inline`);
  }
});

// ---- the weekly menu ----
// The menu row carries a per-dish PRICE. The office page may be told today's dish; it must never be
// handed the row the dish came from.

test("today's dish reaches the office as a name only", () => {
  const ctxFn = body(LIB, 'export async function siteContext', '\n}');
  const dish = (ctxFn.match(/const todayDish = [^\n]*/) || [''])[0];
  assert.ok(dish, "siteContext still builds today's dish");
  assert.ok(/name: menu\.row\.item_name, name_es: menu\.row\.item_name_es/.test(dish), 'built field by field from the name columns');
  assert.ok(!/price/.test(dish), 'no price field on the dish');
  assert.ok(!/today_dish: menu/.test(ctxFn), 'the raw menu row is never returned');
});

test('the office page reads no price off the dish', () => {
  assert.ok(PAGE.includes('ctx.today_dish'), 'the page shows the dish');
  assert.ok(!/today_dish\.[a-z_]*price/.test(PAGE), 'and nothing priced about it');
});

// ---- the campaign test segment ----
// A send-to-myself segment so a real campaign can be rehearsed end to end without touching a
// customer. It is the ONLY segment not derived from customer data, and the only one that skips the
// marketing-consent check — you do not need your own permission to email yourself. That exemption
// is exactly why it must be impossible for it to reach anyone but the configured addresses.
import { SEGMENTS, isSegment } from '../../functions/_lib/audience.js';

test('the test segment exists and is selectable', () => {
  assert.ok(isSegment('test'));
  assert.match(SEGMENTS.test.label, /test/i);
});

test('the test segment is built from an explicit list, never filtered from customers', () => {
  const src = readFileSync(new URL('../../functions/_lib/audience.js', import.meta.url), 'utf8');
  // Slice to where the NORMAL path begins, not a magic character count — a fixed window silently
  // stops covering the block the moment a comment is added, which is how this test broke once.
  const start = src.indexOf("if (segment === 'test')");
  const end = src.indexOf('const isSms', start);
  assert.ok(start !== -1 && end > start, 'could not locate the test-segment block');
  const block = src.slice(start, end);
  assert.ok(block.includes('testRecipients'), 'reads the explicit list');
  assert.ok(!/FROM (clients|leads|orders|subscriptions)/i.test(block),
    'must not query customer tables — an exempt segment that can select customers is a consent hole');
  assert.ok(block.includes('return out'), 'returns before the customer queries run');
});
