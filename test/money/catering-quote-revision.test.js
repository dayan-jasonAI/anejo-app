import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { reviseQuote, revisionPayload, canceledUnpaidOrder } from '../../functions/_lib/catering_quote_revision.js';
import { cateringQuoteEmail } from '../../functions/_lib/catering_quote_email.js';
import { quoteForLead } from '../../functions/_lib/catering_lead_service.js';
import { normalizeRecommendations } from '../../functions/api/hub/owner/catering-deposit.js';
import { onRequestGet } from '../../functions/q/[token].js';

function fixture(status = 'unpaid') {
  const sql = new DatabaseSync(':memory:');
  for (const f of ['0085_catering_quotes_deposits.sql','0101_catering_quote_delivery.sql','0147_catering_quote_revisions.sql','0154_catering_quote_creation_claim.sql']) sql.exec(readFileSync(new URL('../../migrations/' + f, import.meta.url), 'utf8'));
  sql.exec('ALTER TABLE catering_quotes ADD COLUMN source_lead_id TEXT');
  sql.prepare(`INSERT INTO catering_quotes(id,customer_name,customer_email,customer_phone,event_date,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,square_order_id,payment_link_id,payment_link_url,terms_version,terms_json,quote_json,created_at,updated_at,access_token) VALUES ('old','Test Guest','guest@example.test','5615550101','2027-01-01',30,10000,.5,5000,5000,?,'order_old','link_old','https://square.link/old','v1','{}','{"lead_id":"lead1"}',1,1,'11111111111111111111111111111111')`).run(status);
  function prep(query, args = []) { return { bind: (...a) => prep(query, a), first: async () => sql.prepare(query).get(...args) || null, run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }) }; }
  return { env: { DB: { prepare: prep }, SQUARE_ACCESS_TOKEN: 'fixture', SQUARE_LOCATION_ID: 'fixture', SQUARE_ENV: 'sandbox' }, sql };
}
const body = () => ({ quote_id: 'old', expected_updated_at: 1, customer_name: 'Test Guest', customer_email: 'guest@example.test', customer_phone: '5615550101', event_date: '2027-01-02', guests: 40, lines: [{ name: 'Party food', qty: '40', cents: 20000 }], recommendations: [{ name: 'Croquetas', name_es: 'Croquetas', sku: 'catering_platter-jamon-30', pieces: 30, packs: 1, cents: 4500 }] });
const options = { actor: 'owner', baseUrl: 'https://example.test' };
async function provider(work, { orderState = 'OPEN', tender = false, deleteFailure = false, createFailure = false } = {}) {
  const real = globalThis.fetch, calls = []; let state = orderState;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body && JSON.parse(init.body) });
    let data, status = 200;
    if (String(url).endsWith('/orders/order_old')) data = { order: { id: 'order_old', state, tenders: tender ? [{ id: 'payment1' }] : [] } };
    else if (init.method === 'DELETE') { if (deleteFailure) { status = 503; data = {}; } else { state = 'CANCELED'; data = { id: 'link_old', cancelled_order_id: 'order_old' }; } }
    else if (init.method === 'POST' && String(url).endsWith('/payment-links')) { if (createFailure) { status = 503; data = {}; } else data = { payment_link: { id: 'link_new', order_id: 'order_new', url: 'https://square.link/new' } }; }
    else throw Error('Unexpected provider call ' + url);
    return new Response(JSON.stringify(data), { status });
  };
  try { return await work(calls); } finally { globalThis.fetch = real; }
}

test('revision retires and verifies original before creating replacement; options never increase deposit', async () => {
  const { env, sql } = fixture();
  await provider(async (calls) => {
    const result = await reviseQuote(env, body(), options);
    assert.equal(result.ok, true);
    assert.equal(result.total_cents, 20000); assert.equal(result.deposit_cents, 10000);
    assert.deepEqual(calls.map((c) => c.method), ['GET','DELETE','GET','POST']);
    assert.equal(sql.prepare("SELECT deposit_status FROM catering_quotes WHERE id='old'").get().deposit_status, 'void');
    const replacement = sql.prepare('SELECT * FROM catering_quotes WHERE id=?').get(result.quote_id);
    assert.equal(JSON.parse(replacement.quote_json).lead_id, 'lead1');
    assert.equal(JSON.parse(replacement.quote_json).recommendations[0].cents, 4500);
    const again = await reviseQuote(env, body(), options);
    assert.equal(again.quote_id, result.quote_id); assert.equal(calls.length, 4, 'retry creates no second provider order');
  });
});
test('paid quotes and stale editor versions cannot retire or replace anything', async () => {
  for (const status of ['paid','void']) {
    const { env } = fixture(status);
    await provider(async (calls) => { assert.equal((await reviseQuote(env, body(), options)).ok, false); assert.equal(calls.length, 0); });
  }
  const { env } = fixture();
  await provider(async (calls) => { assert.equal((await reviseQuote(env, { ...body(), expected_updated_at: 0 }, options)).ok, false); assert.equal(calls.length, 0); });
});
test('Square payment evidence blocks retirement despite stale local unpaid status', async () => {
  const { env } = fixture();
  await provider(async (calls) => { assert.equal((await reviseQuote(env, body(), options)).ok, false); assert.deepEqual(calls.map((c) => c.method), ['GET']); }, { tender: true });
});
test('uncertain retirement never creates a replacement and recovery reuses saved payload', async () => {
  const { env, sql } = fixture();
  await provider(async (calls) => { assert.equal((await reviseQuote(env, body(), options)).ok, false); assert.equal(calls.some((c) => c.method === 'POST'), false); }, { deleteFailure: true });
  assert.equal(sql.prepare("SELECT deposit_status FROM catering_quotes WHERE id='old'").get().deposit_status, 'unpaid');
  await provider(async () => { const result = await reviseQuote(env, { ...body(), lines: [{ name: 'tampered retry', cents: 90000 }] }, options); assert.equal(result.total_cents, 20000); });
});
test('provider-create failure after cancellation resumes original deterministic identity', async () => {
  const { env, sql } = fixture(); let firstKey;
  await provider(async (calls) => { assert.equal((await reviseQuote(env, body(), options)).ok, false); firstKey = calls.at(-1).body.idempotency_key; }, { createFailure: true });
  assert.equal(sql.prepare('SELECT state FROM catering_quote_revisions').get().state, 'retired');
  await provider(async (calls) => { const result = await reviseQuote(env, body(), options); assert.equal(result.ok, true); assert.equal(calls.at(-1).body.idempotency_key, firstKey); assert.equal(calls.length, 1); });
});
test('lost final persistence acknowledgement recovers without a second checkout', async () => {
  const { env, sql } = fixture(); const prepare = env.DB.prepare;
  let fail = true;
  env.DB.prepare = (query) => { if (fail && query.includes("SET state='complete'")) { fail = false; throw Error('lost write acknowledgement'); } return prepare(query); };
  await provider(async () => { await assert.rejects(reviseQuote(env, body(), options), /acknowledgement/); });
  await provider(async (calls) => { assert.equal((await reviseQuote(env, body(), options)).ok, true); assert.equal(calls.length, 0); });
  assert.equal(sql.prepare('SELECT state FROM catering_quote_revisions').get().state, 'complete');
});
test('void and in-progress original quote pages do not expose payable links', async () => {
  for (const status of ['void','unpaid']) {
    const { env, sql } = fixture(status);
    if (status === 'unpaid') sql.prepare("INSERT INTO catering_quote_revisions VALUES ('old','new','token','{}',1,'pending','owner',1,1)").run();
    const response = await onRequestGet({ env, params: { token: '11111111111111111111111111111111' }, request: new Request('https://example.test/q/11111111111111111111111111111111') });
    assert.equal(response.status, 404); assert.doesNotMatch(await response.text(), /square\.link\/old/);
  }
});
test('optional croquetas render separately and their CTA only requests a change', () => {
  const rendered = cateringQuoteEmail({ lines: [{ name: 'Base menu', cents: 20000 }], totalCents: 20000, depositCents: 10000, modifyUrl: 'https://example.test/q/token?edit=1', recommendations: body().recommendations });
  assert.match(rendered.html, /Excluded from your total and deposit/); assert.match(rendered.html, /\+\$45\.00/); assert.match(rendered.html, /recommendation=catering_platter-jamon-30/);
  assert.match(rendered.html, /\$200\.00/);
});
test('cancellation proof rejects completed or tendered orders', () => {
  assert.equal(canceledUnpaidOrder({ id: 'o', state: 'CANCELED' }, 'o'), true);
  assert.equal(canceledUnpaidOrder({ id: 'o', state: 'COMPLETED' }, 'o'), false);
  assert.equal(canceledUnpaidOrder({ id: 'o', state: 'CANCELED', tenders: [{ id: 'p' }] }, 'o'), false);
  assert.equal(revisionPayload({ ...body(), guests: 1.5 }, { deposit_pct: .5 }).ok, false);
});

 test('recommendation price and quantity are derived from live pack rows; unavailable, stale and arbitrary prices are refused', async () => {
  const sku = 'catering_platter-jamon-30';
  const row = { id: sku, kind: 'tray', active: 1, availability: 'available', price_cents: 4500, name: 'Ham croqueta platter' };
  const envFor = (rows) => ({ DB: { prepare: (sql) => ({ all: async () => ({ results: sql.includes('menu_items') ? rows : [] }) }) } });
  const normalized = await normalizeRecommendations([{ sku, packs: 2, expected_cents: 9000 }], envFor([row]));
  assert.equal(normalized[0].pieces, 60); assert.equal(normalized[0].cents, 9000);
  await assert.rejects(normalizeRecommendations([{ sku, packs: 2, expected_cents: 1 }], envFor([row])), /pricing changed/);
  await assert.rejects(normalizeRecommendations([{ sku, packs: 2 }], envFor([{ ...row, availability: 'sold_out' }])), /available catalog price/);
  await assert.rejects(normalizeRecommendations([{ sku, packs: 2 }], {}), /available catalog price/);
  await assert.rejects(normalizeRecommendations([{ sku: 'traditional_croq-jamon', packs: 2 }], envFor([row])), /published croqueta/);
});

test('revision preserves legacy column-only lead linkage and paid replacement is associated correctly', async () => {
  const { env, sql } = fixture();
  sql.prepare("UPDATE catering_quotes SET source_lead_id='lead1',quote_json='{}' WHERE id='old'").run();
  await provider(async () => {
    const result = await reviseQuote(env, body(), options);
    assert.equal(result.ok, true);
    const replacement = sql.prepare('SELECT * FROM catering_quotes WHERE id=?').get(result.quote_id);
    assert.equal(JSON.parse(replacement.quote_json).lead_id, 'lead1');
    sql.prepare("UPDATE catering_quotes SET deposit_status='paid' WHERE id=?").run(result.quote_id);
    const quotes = sql.prepare('SELECT * FROM catering_quotes').all().map((q) => ({ ...q, breakdown: JSON.parse(q.quote_json || '{}') }));
    assert.equal(quoteForLead({ id: 'lead1' }, [{ id: 'lead1' }], quotes).deposit_status, 'paid');
  });
});
test('original payment winning a revision race keeps its paid receipt readable', async () => {
  const { env, sql } = fixture('paid');
  sql.prepare("INSERT INTO catering_quote_revisions VALUES ('old','new','token','{}',1,'pending','owner',1,1)").run();
  const response = await onRequestGet({ env, params: { token: '11111111111111111111111111111111' }, request: new Request('https://example.test/q/11111111111111111111111111111111') });
  assert.equal(response.status, 200); assert.match(await response.text(), /Deposit received/);
});
test('source changed between initial read and journal claim causes no provider effects', async () => {
  const { env, sql } = fixture(); const original = env.DB.prepare; let changed = false;
  env.DB.prepare = (query) => {
    if (!changed && /INSERT OR IGNORE INTO catering_quote_revisions/.test(query)) {
      changed = true; sql.prepare("UPDATE catering_quotes SET updated_at=2 WHERE id='old'").run();
    }
    return original(query);
  };
  await provider(async (calls) => { assert.equal((await reviseQuote(env, body(), options)).ok, false); assert.equal(calls.length, 0); });
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM catering_quote_revisions').get().n, 0);
});
