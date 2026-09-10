// "Start a quote" arrives with a number in it.
//
// Dayan, 2026-09-09: "when I receive the order in the hub, I only see the option to email client
// and start quote but I get no help in pricing out the order." The request card listed the seven
// things the customer had chosen and then handed him an empty Agreed total, while the live menu
// had a published price for five of them. He typed 1200.00 by hand.
//
// The suggestion is computed with the SAME estimator and the SAME volume discount the public
// quote builder uses, so the number he is offered is the number the customer already saw. These
// tests pin that it is a SUGGESTION: never a payable amount on its own, never hiding the lines it
// could not price, and never silently standing in for his judgement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../../functions/api/hub/owner/catering-deposit.js';

const items = JSON.parse(readFileSync(new URL('../../docs/menu-2026-09/catalog.json', import.meta.url)));
const HUB = readFileSync(new URL('../../public/hub/owner/catering.html', import.meta.url), 'utf8');

// Dayan's actual 2026-09-09 birthday request. Six of the seven lines price themselves off the
// ratified 2026-09 menu — including the sausage croquetas, which the old menu cooked and never
// published. The seventh is the yuca he had to file as "Other custom request", and it stays his
// to price because nobody can price a line whose only description is free text.
const HIS_ORDER = [
  { id: 'lechon', quantity: 30 },
  { id: 'congri', quantity: 30 },
  { id: 'tamales', quantity: 30 },
  { id: 'salad', quantity: 30 },
  { id: 'skewer', quantity: 30 },
  { id: 'croqueta', quantity: 50, flavor: 'sausage' },
  { id: 'custom-1', quantity: 30, notes: 'Yuca' },
];

// A real owner session, the same way the other Hub tests build one — so these tests actually run
// against requireRole instead of skipping themselves into a green tick.
const sessionKv = () => new Map([['session:tok-owner', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'owner@test', la: Date.now(), created: Date.now() })]]);

function env(products, { leadRows = null, requestRows = null } = {}) {
  const kv = sessionKv();
  const leads = leadRows || [{ id: 'lead_1', name: 'Dayan', email: 'd@example.test', phone: '', company: '', interest: 'Cuban Food', message: 'Event date: 2026-09-15\nGuest count: 30', source_lang: 'en', created_at: 1 }];
  const reqs = requestRows !== null ? requestRows : [{ lead_id: 'lead_1', event_json: JSON.stringify({ products }) }];
  return {
    SESSIONS: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); } },
    DB: {
      prepare(sql) {
        const stmt = {
          bind: () => stmt,
          all: async () => {
            if (sql.includes('menu_items')) return { results: items };
            if (sql.includes('menu_modifier_prices')) return { results: [] };
            if (sql.includes('FROM leads')) return { results: leads };
            if (sql.includes('FROM catering_requests')) return { results: reqs };
            if (sql.includes('catering_attachments')) return { results: [] };
            return { results: [] };
          },
          // requireRole re-checks that the staff row is still active on every request; a stub
          // that answers null here reads as a deactivated account and 401s.
          first: async () => (sql.includes('FROM staff') ? { active: 1 } : null),
          run: async () => ({ meta: {} }),
        };
        return stmt;
      },
    },
  };
}

const OWNER = () => new Request('https://anejocateringco.com/api/hub/owner/catering-deposit', { headers: { Cookie: 'anejo_sess=tok-owner' } });
const load = async (e) => {
  const res = await onRequestGet({ request: OWNER(), env: e });
  assert.equal(res.status, 200, 'the owner session must authenticate');
  return res.json();
};

test('the Hub suggests a total instead of an empty box', async () => {
  const data = await load(env(HIS_ORDER));
  const request = data.requests[0];
  assert.ok(request.suggested, 'the request must arrive carrying a suggestion');
  assert.ok(request.suggested.total_cents > 0);
  assert.ok(request.suggested.priced_lines > 0);
});

test('the suggestion prices what the menu prices and lists what it cannot', async () => {
  const { suggested } = (await load(env(HIS_ORDER))).requests[0];
  // The line the menu has no published price for must be named, not folded into the total.
  const openIds = suggested.unpriced.map((u) => u.id);
  assert.ok(openIds.includes('custom-1'), 'the yuca custom line is still his to price');
  // The other half of the same story: the sausage croqueta line that used to land here is priced
  // now. If it ever comes back to this list, a filling has fallen off the menu.
  assert.ok(!openIds.includes('croqueta'), 'sausage croquetas are published and priced now');
  assert.ok(suggested.total_cents > 0, 'and the rest is still priced rather than refused');
});

test('the volume discount in the Hub is the one the customer was shown', async () => {
  const { suggested } = (await load(env([{ id: 'lechon', quantity: 200 }]))).requests[0];
  assert.equal(suggested.subtotal_cents, 64000, 'four $160 fifty-trays');
  assert.equal(suggested.discount_cents, 700, '5% of the $140 above $500');
  assert.equal(suggested.total_cents, 63300);
  assert.equal(suggested.subtotal_cents - suggested.discount_cents, suggested.total_cents);
});

test('a request with no structured products gets no invented number', async () => {
  for (const rows of [[], [{ lead_id: 'lead_1', event_json: JSON.stringify({}) }], [{ lead_id: 'lead_1', event_json: JSON.stringify({ products: [] }) }]]) {
    const data = await load(env(null, { requestRows: rows }));
    assert.equal(data.requests[0].suggested, undefined, 'silence beats a guess');
  }
});

test('a missing catering_requests table leaves the request loadable', async () => {
  const broken = env(HIS_ORDER);
  const inner = broken.DB.prepare.bind(broken.DB);
  broken.DB.prepare = (sql) => {
    if (sql.includes('FROM catering_requests')) {
      const s = { bind: () => s, all: async () => { throw new Error('no such table'); }, first: async () => null, run: async () => ({}) };
      return s;
    }
    return inner(sql);
  };
  const data = await load(broken);
  assert.equal(data.requests.length, 1, 'the migration may not be applied; the queue must still work');
  assert.equal(data.requests[0].suggested, undefined);
});

// ---------------------------------------------------------------- the page that renders it

test('the Hub page fills the total from the suggestion and still calls it AGREED', () => {
  assert.match(HUB, /r\.suggested && r\.suggested\.total_cents/, 'the prefill must carry the suggestion');
  assert.match(HUB, /document\.getElementById\('q-total'\)\.value = r\.total \|\| ''/);
  assert.match(HUB, /Agreed total/, 'the field is still the agreed total, not a computed one');
  assert.match(HUB, /change it if you agreed something else/, 'and the toast must say it is editable');
});

test('the page shows what is still to be priced, so the gap is visible', () => {
  assert.match(HUB, /You still need to price/);
  assert.match(HUB, /Suggested total/);
  assert.match(HUB, /Live menu unavailable/, 'a stale suggestion must announce itself');
});
