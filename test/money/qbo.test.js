// QuickBooks Online — OAuth token handling and pushing a contract invoice.
//
// This is a MONEY path, and the two ways it can hurt someone are specific:
//   1. Posting the same invoice twice, so a client is asked to pay twice.
//   2. Losing the connection silently, so invoicing quietly stops days later.
//
// (2) has one overwhelmingly likely cause: Intuit ROTATES the refresh token. Most refresh calls
// return a NEW refresh_token and invalidate the old one. Persist the access token but not the
// refresh token and everything works for an hour, then dies permanently — at the moment somebody
// tries to invoice. Several tests below exist only to pin that.
//
// Intuit is stubbed via globalThis.fetch. No network, no credentials, and the assertions are on
// real behaviour rather than on source text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from '../helpers/d1.js';
import {
  qboConfigured, accessToken, ensureCustomer, ensureItem, pushInvoice, invoiceLines, authorizeUrl, redirectUri,
} from '../../functions/_lib/qbo.js';

const ENV = { QBO_CLIENT_ID: 'cid', QBO_CLIENT_SECRET: 'csec' };
const HOUR = 3600 * 1000;

// A qbo_connection row plus the routes every path needs.
function db(connOverrides = {}, extra = []) {
  const conn = {
    id: 'qbo', realm_id: '4620816365', access_token: 'at_old', refresh_token: 'rt_old',
    expires_at: Date.now() + HOUR, refresh_expires_at: Date.now() + 100 * 24 * HOUR,
    environment: 'production', connected_by: 'stf_owner', connected_at: 1, refreshed_at: null,
    last_error: null, updated_at: 1, ...connOverrides,
  };
  const writes = [];
  const routes = [
    [/SELECT \* FROM qbo_connection/, () => conn],
    [/INSERT INTO qbo_connection/, ({ args }) => {
      writes.push(args);
      conn.access_token = args[1]; conn.refresh_token = args[2];
      conn.expires_at = args[3]; conn.refreshed_at = args[8];
      return 1;
    }],
    [/UPDATE qbo_connection SET last_error/, () => 1],
    ...extra,
  ];
  const d1 = makeD1(routes);
  return { d1, conn, writes };
}

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler({ url: String(url), init, calls });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const jsonRes = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- configuration posture ----------

test('with no credentials the whole module no-ops instead of throwing', async () => {
  // Same posture as twilio.js / geo.js: invoicing already works without QuickBooks and must not
  // start failing because an integration is half-set-up.
  assert.equal(qboConfigured({}), false);
  const r = await accessToken({ DB: makeD1([]) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_configured');
  const p = await pushInvoice({ DB: makeD1([]) }, { invoiceId: 'inv_1' });
  assert.equal(p.reason, 'not_configured');
});

test('not connected is distinct from not configured', async () => {
  // They need different actions — one is "press Connect", the other "there is nothing you can do
  // on this screen".
  const r = await accessToken({ ...ENV, DB: makeD1([[/SELECT \* FROM qbo_connection/, () => null]]) });
  assert.equal(r.reason, 'not_connected');
});

test('the authorize URL carries the exact redirect it will be checked against', () => {
  const req = { url: 'https://anejocateringco.com/api/hub/owner/qbo' };
  const u = new URL(authorizeUrl(ENV, req, 'nonce123'));
  assert.equal(u.searchParams.get('client_id'), 'cid');
  assert.equal(u.searchParams.get('state'), 'nonce123');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://anejocateringco.com/api/hub/owner/qbo/callback');
  assert.equal(redirectUri({ ...ENV, QBO_REDIRECT_URI: 'https://x.test/cb' }, req), 'https://x.test/cb',
    'an explicit override wins — the registered URI must match byte for byte');
});

// ---------- token refresh + ROTATION ----------

test('a still-valid access token is reused rather than refreshed', async () => {
  const { d1 } = db({ expires_at: Date.now() + HOUR });
  const f = stubFetch(() => { throw new Error('must not call Intuit'); });
  try {
    const r = await accessToken({ ...ENV, DB: d1 });
    assert.equal(r.ok, true);
    assert.equal(r.token, 'at_old');
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

test('a token near expiry refreshes BEFORE it dies', async () => {
  // Expiring in 2 minutes: inside the skew, so it refreshes now rather than 401-ing mid-request.
  const { d1 } = db({ expires_at: Date.now() + 2 * 60 * 1000 });
  const f = stubFetch(() => jsonRes({ access_token: 'at_new', refresh_token: 'rt_new', expires_in: 3600 }));
  try {
    const r = await accessToken({ ...ENV, DB: d1 });
    assert.equal(r.ok, true);
    assert.equal(r.token, 'at_new');
  } finally { f.restore(); }
});

test('THE ROTATION BUG: a rotated refresh token is persisted', async () => {
  // If this regresses, QuickBooks works for exactly one hour and then dies forever.
  const { d1, conn } = db({ expires_at: Date.now() - 1 });
  const f = stubFetch(() => jsonRes({ access_token: 'at_new', refresh_token: 'rt_ROTATED', expires_in: 3600 }));
  try {
    await accessToken({ ...ENV, DB: d1 });
    assert.equal(conn.refresh_token, 'rt_ROTATED', 'the NEW refresh token must be stored');
    assert.equal(conn.access_token, 'at_new');
  } finally { f.restore(); }
});

test('a refresh response WITHOUT a new refresh token keeps the old one', async () => {
  // Intuit does not rotate on every call. Storing undefined here would break the connection just
  // as thoroughly as dropping a rotated one.
  const { d1, conn } = db({ expires_at: Date.now() - 1 });
  const f = stubFetch(() => jsonRes({ access_token: 'at_new', expires_in: 3600 }));
  try {
    await accessToken({ ...ENV, DB: d1 });
    assert.equal(conn.refresh_token, 'rt_old');
  } finally { f.restore(); }
});

test('an expired REFRESH token asks for a reconnect, not a retry', async () => {
  const { d1 } = db({ expires_at: Date.now() - 1, refresh_expires_at: Date.now() - 1 });
  const f = stubFetch(() => { throw new Error('must not attempt a doomed refresh'); });
  try {
    const r = await accessToken({ ...ENV, DB: d1 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'reconnect_required');
    assert.match(r.error, /expired/i);
  } finally { f.restore(); }
});

test('a refused refresh reports reconnect_required rather than a generic failure', async () => {
  const { d1 } = db({ expires_at: Date.now() - 1 });
  const f = stubFetch(() => jsonRes({ error: 'invalid_grant', error_description: 'Token invalid' }, 400));
  try {
    const r = await accessToken({ ...ENV, DB: d1 });
    assert.equal(r.reason, 'reconnect_required');
    assert.match(r.error, /Token invalid/);
  } finally { f.restore(); }
});

// ---------- customers ----------

test('an account already mapped is not looked up again', async () => {
  const { d1 } = db();
  const f = stubFetch(() => { throw new Error('must not call Intuit'); });
  try {
    const r = await ensureCustomer({ ...ENV, DB: d1 }, { id: 'acct_dgp', name: 'DGP', qbo_customer_id: '42' });
    assert.deepEqual(r, { ok: true, customer_id: '42', created: false });
  } finally { f.restore(); }
});

test('an existing QuickBooks customer is ADOPTED, not duplicated', async () => {
  // Duplicate customers are what make a bookkeeper stop trusting an integration.
  const { d1 } = db({}, [[/UPDATE contract_accounts SET qbo_customer_id/, () => 1]]);
  const f = stubFetch(({ url }) => {
    if (url.includes('/query')) return jsonRes({ QueryResponse: { Customer: [{ Id: '77', DisplayName: 'DGP' }] } });
    throw new Error('must not create a customer that already exists');
  });
  try {
    const r = await ensureCustomer({ ...ENV, DB: d1 }, { id: 'acct_dgp', name: 'DGP' });
    assert.equal(r.customer_id, '77');
    assert.equal(r.created, false);
  } finally { f.restore(); }
});

test('a customer name with a quote cannot break the query', async () => {
  // DisplayName goes into a QBO query string. "Rosa's Clinic" must not end the literal.
  const { d1 } = db({}, [[/UPDATE contract_accounts SET qbo_customer_id/, () => 1]]);
  let asked = '';
  const f = stubFetch(({ url }) => {
    if (url.includes('/query')) { asked = decodeURIComponent(url.split('query=')[1]); return jsonRes({ QueryResponse: {} }); }
    return jsonRes({ Customer: { Id: '90' } });
  });
  try {
    await ensureCustomer({ ...ENV, DB: d1 }, { id: 'a1', name: "Rosa's Clinic" });
    assert.match(asked, /Rosa\\'s Clinic/, 'the quote must be escaped');
  } finally { f.restore(); }
});

// ---------- invoice lines ----------

test('line amounts come off the STORED invoice, never recomputed', () => {
  // The email, the printable page and QuickBooks must not be able to disagree about what is owed.
  const lines = invoiceLines(
    { total_cents: 26600, lunches: 38 },
    { sites: [
      { name: 'Delray Beach', lunches: 20, subtotal_cents: 12000, delivery_cents: 2000, rush_cents: 1500 },
      { name: 'Pompano Beach', lunches: 18, subtotal_cents: 10800, delivery_cents: 2000, rush_cents: 0 },
    ] },
    '7',
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].Amount, 155.00);   // 12000 + 2000 + 1500 cents
  assert.equal(lines[1].Amount, 128.00);
  assert.match(lines[0].Description, /incl\. rush/);
});

test('EVERY line carries an ItemRef', () => {
  // CORRECTED after testing against the live sandbox (2026-07-29). Intuit's docs say the Amount is
  // ignored without an ItemRef; it is not — $266.00 posted with no ItemRef came back as TotalAmt
  // 266.00. What QuickBooks actually does is substitute its DEFAULT item (Id 1, "Services").
  // So this pins revenue to OUR catering item and income account, rather than guarding a $0 post.
  const lines = invoiceLines(
    { total_cents: 26600, lunches: 38 },
    { sites: [{ name: 'Delray Beach', lunches: 38, subtotal_cents: 22800, delivery_cents: 3800, rush_cents: 0 }] },
    '7',
  );
  for (const l of lines) {
    assert.equal(l.SalesItemLineDetail.ItemRef.value, '7', 'no ItemRef ⇒ revenue files under QuickBooks\' default item');
  }
});

test('an invoice with a total but no site breakdown still books its total — with an ItemRef', () => {
  // Posting zero lines against a real total would silently book nothing.
  const lines = invoiceLines({ total_cents: 5000, lunches: 10, period_from: '2026-07-01', period_to: '2026-07-15' }, { sites: [] }, '7');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].Amount, 50);
  assert.equal(lines[0].SalesItemLineDetail.ItemRef.value, '7');
});

// ---------- the service item ----------

test('a cached item id skips the lookup entirely', async () => {
  const { d1 } = db({}, [[/SELECT value FROM app_settings/, () => ({ value: '7' })]]);
  const f = stubFetch(() => { throw new Error('must not call Intuit'); });
  try {
    const r = await ensureItem({ ...ENV, DB: d1 });
    assert.deepEqual(r, { ok: true, item_id: '7', created: false });
  } finally { f.restore(); }
});

test('an existing Catering item is reused rather than duplicated', async () => {
  const { d1 } = db({}, [
    [/SELECT value FROM app_settings/, () => null],
    [/INSERT INTO app_settings/, () => 1],
  ]);
  const f = stubFetch(({ url }) => {
    if (url.includes('Item%20where%20Name') || url.includes('from%20Item')) return jsonRes({ QueryResponse: { Item: [{ Id: '12', Name: 'Catering' }] } });
    throw new Error('must not create an item that exists');
  });
  try {
    const r = await ensureItem({ ...ENV, DB: d1 });
    assert.equal(r.item_id, '12');
    assert.equal(r.created, false);
  } finally { f.restore(); }
});

test('creating the item resolves an INCOME account first — it is required for a Service', async () => {
  const { d1 } = db({}, [
    [/SELECT value FROM app_settings/, () => null],
    [/INSERT INTO app_settings/, () => 1],
  ]);
  let sentItem = null;
  const f = stubFetch(({ url, init }) => {
    if (url.includes('from%20Item')) return jsonRes({ QueryResponse: {} });
    if (url.includes('from%20Account')) return jsonRes({ QueryResponse: { Account: [{ Id: '81', Name: 'Services Income' }] } });
    if (url.includes('/item?')) { sentItem = JSON.parse(init.body); return jsonRes({ Item: { Id: '13' } }); }
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await ensureItem({ ...ENV, DB: d1 });
    assert.equal(r.item_id, '13');
    assert.equal(sentItem.Type, 'Service');
    assert.equal(sentItem.IncomeAccountRef.value, '81', 'a Service item without one is rejected');
  } finally { f.restore(); }
});

test('no income account is a clear message, not a mystery 400', async () => {
  // We must never CREATE an account — the chart of accounts is the bookkeeper's decision.
  const { d1 } = db({}, [[/SELECT value FROM app_settings/, () => null]]);
  const f = stubFetch(({ url }) => {
    if (url.includes('from%20Item')) return jsonRes({ QueryResponse: {} });
    if (url.includes('from%20Account')) return jsonRes({ QueryResponse: {} });
    throw new Error('must not create an account');
  });
  try {
    const r = await ensureItem({ ...ENV, DB: d1 });
    assert.equal(r.ok, false);
    assert.match(r.error, /No active income account/);
  } finally { f.restore(); }
});

// ---------- pushing ----------

const INV = {
  id: 'inv_1', account_id: 'acct_dgp', number: 'DGP-0001', status: 'open',
  total_cents: 26600, lunches: 38, period_from: '2026-07-01', period_to: '2026-07-15',
  line_items: JSON.stringify({ sites: [{ name: 'Delray Beach', lunches: 38, subtotal_cents: 22800, delivery_cents: 3800, rush_cents: 0 }] }),
  qbo_invoice_id: null,
};
const ACCT = { id: 'acct_dgp', name: 'DGP Health & Wellness', billing_email: 'ap@dgp.test', qbo_customer_id: '42' };

function pushDb(invOverrides = {}) {
  const saved = {};
  const { d1 } = db({}, [
    [/SELECT \* FROM contract_invoices WHERE id/, () => ({ ...INV, ...invOverrides })],
    [/SELECT \* FROM contract_accounts WHERE id/, () => ACCT],
    [/SELECT value FROM app_settings/, () => ({ value: '7' })],   // Catering item already resolved
    [/UPDATE contract_invoices SET qbo_invoice_id/, ({ args }) => { saved.qbo = args[0]; return 1; }],
  ]);
  return { d1, saved };
}

test('an invoice already in QuickBooks is NEVER posted twice', async () => {
  // A duplicate here is a client asked to pay twice.
  const { d1 } = pushDb({ qbo_invoice_id: '900' });
  const f = stubFetch(() => { throw new Error('must not post again'); });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.deepEqual(r, { ok: true, already: true, qbo_invoice_id: '900' });
  } finally { f.restore(); }
});

test('a void invoice is refused', async () => {
  const { d1 } = pushDb({ status: 'void' });
  const f = stubFetch(() => { throw new Error('must not post a void invoice'); });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, false);
    assert.match(r.error, /void/);
  } finally { f.restore(); }
});

test('a successful push stores the link immediately', async () => {
  const { d1, saved } = pushDb();
  const f = stubFetch(({ url, init }) => {
    if (url.includes('/invoice')) {
      const body = JSON.parse(init.body);
      assert.equal(body.CustomerRef.value, '42');
      assert.equal(body.DocNumber, 'DGP-0001');
      assert.equal(body.BillEmail.Address, 'ap@dgp.test');
      assert.equal(body.TxnDate, '2026-07-15');
      // The payload actually SENT is asserted, not just the response — a stub that answers
      // "created!" to any payload proves nothing about what QuickBooks did with it.
      assert.ok(body.Line.length > 0);
      for (const l of body.Line) assert.equal(l.SalesItemLineDetail.ItemRef.value, '7');
      return jsonRes({ Invoice: { Id: '1001' } });
    }
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, true);
    assert.equal(r.qbo_invoice_id, '1001');
    assert.equal(saved.qbo, '1001', 'the link must be written or the next push duplicates it');
  } finally { f.restore(); }
});

test("Intuit's nested error message is surfaced, not just the status", async () => {
  // "400 Bad Request" tells the owner nothing about what to fix.
  const { d1 } = pushDb();
  const f = stubFetch(({ url }) => {
    if (url.includes('/invoice')) {
      return jsonRes({ Fault: { Error: [{ Message: 'Duplicate Document Number', Detail: 'DocNumber DGP-0001 exists' }] } }, 400);
    }
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, false);
    assert.match(r.error, /Duplicate Document Number/);
    assert.match(r.error, /DGP-0001 exists/);
  } finally { f.restore(); }
});

test('a 401 mid-call refreshes once and retries, rather than failing the click', async () => {
  const { d1 } = pushDb();
  let posts = 0;
  const f = stubFetch(({ url }) => {
    if (url.includes('tokens/bearer')) return jsonRes({ access_token: 'at_new', refresh_token: 'rt_new', expires_in: 3600 });
    if (url.includes('/invoice')) {
      posts++;
      return posts === 1 ? jsonRes({}, 401) : jsonRes({ Invoice: { Id: '1002' } });
    }
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, true);
    assert.equal(r.qbo_invoice_id, '1002');
    assert.equal(posts, 2, 'exactly one retry');
  } finally { f.restore(); }
});

test('a repeated 401 gives up instead of looping', async () => {
  const { d1 } = pushDb();
  let posts = 0;
  const f = stubFetch(({ url }) => {
    if (url.includes('tokens/bearer')) return jsonRes({ access_token: 'at_new', refresh_token: 'rt_new', expires_in: 3600 });
    if (url.includes('/invoice')) { posts++; return jsonRes({}, 401); }
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, false);
    assert.equal(posts, 2, 'one retry, then stop');
  } finally { f.restore(); }
});

test('an unreachable Intuit is an error, never a silent success', async () => {
  const { d1 } = pushDb();
  const f = stubFetch(() => { throw new Error('network down'); });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, false);
    assert.match(r.error, /Could not reach QuickBooks/);
  } finally { f.restore(); }
});

// ---------- read-after-write ----------
//
// A 200 from QuickBooks is NOT evidence the client was billed the right amount. The ItemRef bug
// proved it: the invoice posted, returned an id, and booked ZERO. Since the live handshake has
// never run against the real API, the code checks QuickBooks' own answer against what we meant to
// bill — which catches any payload-shape mismatch, not just the one already found.

test('a posted total that disagrees with ours FAILS loudly', async () => {
  const { d1, saved } = pushDb();
  const f = stubFetch(({ url }) => {
    if (url.includes('/invoice')) return jsonRes({ Invoice: { Id: '1003', TotalAmt: 0 } });  // the $0 booking
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, false);
    assert.match(r.error, /\$0\.00/);
    assert.match(r.error, /\$266\.00/);
    assert.match(r.error, /VOID IT IN QUICKBOOKS/, 'the owner is told how to clean it up');
    assert.deepEqual(r.mismatch, { expected_cents: 26600, posted_cents: 0 });
    assert.equal(saved.qbo, undefined, 'a wrong invoice must NOT be recorded as linked');
  } finally { f.restore(); }
});

test('a matching total passes and is linked', async () => {
  const { d1, saved } = pushDb();
  const f = stubFetch(({ url }) => {
    if (url.includes('/invoice')) return jsonRes({ Invoice: { Id: '1004', TotalAmt: 266.00 } });
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, true);
    assert.equal(saved.qbo, '1004');
  } finally { f.restore(); }
});

test('an absent TotalAmt does not block a legitimate push', async () => {
  // Only a total QuickBooks actually reported is worth comparing; inventing a mismatch from a
  // missing field would block real invoicing over a response-shape detail.
  const { d1, saved } = pushDb();
  const f = stubFetch(({ url }) => {
    if (url.includes('/invoice')) return jsonRes({ Invoice: { Id: '1005' } });
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, true);
    assert.equal(saved.qbo, '1005');
  } finally { f.restore(); }
});

test('a rounding-level match is treated as equal, not a mismatch', async () => {
  // QBO returns dollars as a float; 266.00 must not fail against 26600 cents.
  const { d1 } = pushDb();
  const f = stubFetch(({ url }) => {
    if (url.includes('/invoice')) return jsonRes({ Invoice: { Id: '1006', TotalAmt: 265.999999 } });
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await pushInvoice({ ...ENV, DB: d1 }, { invoiceId: 'inv_1' });
    assert.equal(r.ok, true, 'float noise must not read as a wrong amount');
  } finally { f.restore(); }
});
