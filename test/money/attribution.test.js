// Instagram → order attribution: the /l/:code tracked redirect, the /go bio page, and the
// owner links report.
//
// Three behaviors here are load-bearing and each gets pinned:
//   · The person mid-tap ALWAYS lands somewhere real — a stale code, a down database, or a
//     failed click insert must never turn a bio tap into a 404 or a hang.
//   · The IP is hashed before it is stored. A click log grows forever; a raw IP in it is PII
//     the business has no retention story for.
//   · The utm_* the redirect appends must actually survive to checkout — /order stashes and
//     sends them (anejo:attr), which is the only thing that makes the orders join real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet as redirectGet } from '../../functions/l/[code].js';
import { onRequestGet as linksGet, onRequestPost as linksPost } from '../../functions/api/hub/owner/links.js';
import { makeD1, makeKV } from '../helpers/d1.js';

const REDIR = readFileSync(new URL('../../functions/l/[code].js', import.meta.url), 'utf8');
const LINKS = readFileSync(new URL('../../functions/api/hub/owner/links.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0065_tracked_links.sql', import.meta.url), 'utf8');
const GO = readFileSync(new URL('../../public/go.html', import.meta.url), 'utf8');
const ORDER = readFileSync(new URL('../../public/order.html', import.meta.url), 'utf8');
const CHECKOUT = readFileSync(new URL('../../functions/api/checkout.js', import.meta.url), 'utf8');

const IG_ORDER = { id: 'lnk_ig_order', dest_url: '/order', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'ig-order' };

// The redirect's Pages context: params carry the /l/:code segment, waitUntil collects the
// off-path click insert so tests can await it explicitly.
function tapContext({ code, linkRow, insert, headers = {} } = {}) {
  const inserts = [];
  const DB = makeD1([
    [/^SELECT id, dest_url, utm_source, utm_medium, utm_campaign FROM tracked_links/, ({ args }) => (linkRow && args[0] === linkRow.code ? linkRow.row : null)],
    [/^INSERT INTO link_clicks/, ({ args }) => { inserts.push(args); if (insert) return insert(args); return 1; }],
  ]);
  const tasks = [];
  return {
    inserts,
    tasks,
    ctx: {
      request: new Request(`https://anejocateringco.com/l/${code}`, {
        headers: { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Mozilla/5.0 Instagram', referer: 'https://l.instagram.com/', ...headers },
      }),
      env: { DB },
      params: { code },
      waitUntil: (p) => tasks.push(p),
    },
  };
}

test('a bio tap 302s to the destination with utm_* appended — and the click is on the books', async () => {
  const t = tapContext({ code: 'ig-order', linkRow: { code: 'ig-order', row: IG_ORDER } });
  const res = await redirectGet(t.ctx);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), 'https://anejocateringco.com/order?utm_source=instagram&utm_medium=bio&utm_campaign=ig-order');
  assert.equal(res.headers.get('Cache-Control'), 'no-store', 'a cached 302 would swallow every later tap');

  await Promise.all(t.tasks);
  assert.equal(t.inserts.length, 1, 'exactly one click row');
  const [, linkId, , referer, ua] = t.inserts[0];
  assert.equal(linkId, 'lnk_ig_order');
  assert.match(referer, /instagram/);
  assert.match(ua, /Instagram/);
});

test('the IP is stored as a hash, never as itself', async () => {
  const t = tapContext({ code: 'ig-order', linkRow: { code: 'ig-order', row: IG_ORDER } });
  await redirectGet(t.ctx);
  await Promise.all(t.tasks);
  const args = t.inserts[0];
  const ipHash = args[5];
  assert.match(ipHash, /^[0-9a-f]{64}$/, 'SHA-256 hex, not an address');
  assert.ok(!JSON.stringify(args).includes('203.0.113.9'), 'the raw IP appears NOWHERE in what is written');
  // And the schema says why, so nobody "simplifies" it back to a raw column later.
  assert.match(MIG, /salted SHA-256/);
  assert.match(MIG, /PII/);
  assert.match(REDIR, /SHA-256/);
});

test('a destination with a #fragment keeps its anchor AFTER the utm params', async () => {
  const row = { id: 'lnk_ig_catering', dest_url: '/#tasting', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'ig-catering' };
  const t = tapContext({ code: 'ig-catering', linkRow: { code: 'ig-catering', row } });
  const res = await redirectGet(t.ctx);
  assert.equal(res.headers.get('Location'), 'https://anejocateringco.com/?utm_source=instagram&utm_medium=bio&utm_campaign=ig-catering#tasting');
});

test('an unknown or inactive code sends the human HOME, silently — never a 404 from a bio', async () => {
  const t = tapContext({ code: 'ig-retired', linkRow: null });
  const res = await redirectGet(t.ctx);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), 'https://anejocateringco.com');
  await Promise.all(t.tasks);
  assert.equal(t.inserts.length, 0, 'no phantom click rows for codes that do not exist');
});

test('a click-recording failure never blocks the redirect', async () => {
  const t = tapContext({
    code: 'ig-order',
    linkRow: { code: 'ig-order', row: IG_ORDER },
    insert: () => { throw new Error('D1 write outage'); },
  });
  const res = await redirectGet(t.ctx);
  assert.equal(res.status, 302, 'the visitor already left before the insert failed');
  assert.equal(res.headers.get('Location'), 'https://anejocateringco.com/order?utm_source=instagram&utm_medium=bio&utm_campaign=ig-order');
  await Promise.all(t.tasks); // must resolve, not reject — waitUntil rejections are noisy in prod
});

test('a database that is DOWN still lands the visitor on the homepage', async () => {
  const ctx = {
    request: new Request('https://anejocateringco.com/l/ig-order'),
    env: { DB: { prepare() { throw new Error('D1 unavailable'); } } },
    params: { code: 'ig-order' },
    waitUntil: () => {},
  };
  const res = await redirectGet(ctx);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), 'https://anejocateringco.com');
});

// ---- the owner links desk ----

function ownerEnv(routes) {
  const sess = JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_owner', la: Date.now(), created: Date.now() });
  return {
    SESSIONS: makeKV({ 'session:tok': sess }),
    DB: makeD1([
      [/^SELECT active FROM staff WHERE id=\?/, () => ({ active: 1 })],
      ...routes,
    ]),
  };
}
const ownerReq = (init = {}) => new Request('https://anejocateringco.com/api/hub/owner/links', {
  headers: { Cookie: 'anejo_sess=tok', 'Content-Type': 'application/json' }, ...init,
});

test('the links API is owner-gated — no session, no report', async () => {
  const env = { SESSIONS: makeKV({}), DB: makeD1([]) };
  const res = await linksGet({ request: new Request('https://anejocateringco.com/api/hub/owner/links'), env });
  assert.equal(res.status, 401);
  assert.match(LINKS, /requireRole\(request, env, \['owner'\]\)/);
});

test('the report joins clicks to PAID orders by utm_campaign — pending checkouts do not count', async () => {
  const env = ownerEnv([
    [/FROM tracked_links ORDER BY created_at/, () => [
      { id: 'lnk_ig_order', code: 'ig-order', label: 'IG bio → Order Now', dest_url: '/order', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'ig-order', active: 1, created_at: 1 },
      { id: 'lnk_ig_macro', code: 'ig-macro', label: 'IG bio → The Macro Portal', dest_url: '/calculator', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'ig-macro', active: 1, created_at: 2 },
    ]],
    [/FROM link_clicks GROUP BY link_id/, () => [{ link_id: 'lnk_ig_order', c7: 5, c30: 12, total: 40 }]],
    [/FROM orders[\s\S]*GROUP BY utm_campaign/, () => [{ utm_campaign: 'ig-order', n: 3 }]],
  ]);
  const res = await linksGet({ request: ownerReq(), env });
  assert.equal(res.status, 200);
  const j = await res.json();
  const order = j.links.find((l) => l.code === 'ig-order');
  assert.equal(order.clicks_7d, 5);
  assert.equal(order.clicks_30d, 12);
  assert.equal(order.orders_attributed, 3);
  const macro = j.links.find((l) => l.code === 'ig-macro');
  assert.equal(macro.clicks_7d, 0, 'no clicks yet reads as zero, not undefined');
  assert.equal(macro.orders_attributed, 0);
  // "Attributed" means money collected: the orders query itself excludes pending rows.
  assert.ok(env.DB.sqlLog().some((s) => /status IN \('paid','prep','ready','fulfilled'\)/.test(s)));
});

test('create refuses a destination that would make /l/* an open redirect', async () => {
  for (const dest of ['http://evil.example/phish', '//evil.example', 'javascript:alert(1)', '']) {
    const env = ownerEnv([]);
    const res = await linksPost({
      request: ownerReq({ method: 'POST', body: JSON.stringify({ op: 'create', label: 'Bad', dest_url: dest }) }),
      env,
    });
    assert.equal(res.status, 400, `refused: ${JSON.stringify(dest)}`);
  }
});

test('create auto-generates a short lowercase code and campaigns default to it', async () => {
  let inserted = null;
  const env = ownerEnv([
    [/^INSERT INTO tracked_links/, ({ args }) => { inserted = args; return 1; }],
  ]);
  const res = await linksPost({
    request: ownerReq({ method: 'POST', body: JSON.stringify({ op: 'create', label: 'Story link', dest_url: '/order' }) }),
    env,
  });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.match(j.code, /^[a-z2-9]{6}$/, 'short, lowercase, no ambiguous characters');
  assert.equal(inserted[6], j.code, 'utm_campaign defaults to the code so the orders join needs no setup');
});

// ---- the funnel actually connects end to end ----

test('the migration seeds the three bio links the /go page points at', () => {
  for (const code of ['ig-order', 'ig-macro', 'ig-catering']) {
    assert.ok(MIG.includes(`'${code}'`), `${code} seeded`);
    assert.ok(GO.includes(`/l/${code}`), `/go button hits /l/${code}`);
  }
  // Destinations were verified against public/ — there is no /macro-portal or /catering page.
  assert.match(MIG, /'\/calculator'/);
  assert.match(MIG, /'\/#tasting'/);
});

test('/order captures the utm the redirect appended and sends it with checkout', () => {
  // Without these two lines the entire module measures nothing: checkout.js only records
  // attribution the BROWSER sends, and before this build /order never sent any.
  assert.match(ORDER, /anejo:attr/);
  assert.match(ORDER, /payload\.attribution = anejoAttr/);
  assert.match(CHECKOUT, /parseAttribution\(b\.attribution\)/);
});
