// The Sales workspace page and its API guards. The page is plain HTML + inline script (no build),
// so these read it as text and compile its script — the same convention as the other test/ui files —
// and the reachability tests drive the real route handlers against a real SQLite database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { onRequestGet as salesGet, onRequestPost as salesPost } from '../../functions/api/hub/owner/sales/index.js';
import { onRequestPost as settingsPost } from '../../functions/api/hub/owner/sales/settings.js';
import { onRequestPost as outreachPost } from '../../functions/api/hub/owner/sales/outreach.js';
import { onRequestPost as dealPost } from '../../functions/api/hub/owner/sales/deal.js';

const PAGE = readFileSync(new URL('../../public/hub/owner/sales.html', import.meta.url), 'utf8');
const slice = (from, to) => PAGE.slice(PAGE.indexOf(from), PAGE.indexOf(to));
const CARD = slice('function card(', 'function previewHtml(');
const PREVIEW = slice('function previewHtml(', '// ---------------------------------------------------------------- settings');

test('the Sales workspace is an owner page: noindex, the owner nav, and the Owner.init role gate', () => {
  assert.match(PAGE, /<meta name="robots" content="noindex">/);
  assert.match(PAGE, /Owner\.init\('sales',/);
  assert.match(PAGE, /<nav id="owner-nav" class="hub-nav"><\/nav>/);
  assert.match(PAGE, /\/hub\/owner\/assets\/owner\.js/);
});

test('its inline script compiles', () => {
  const scripts = [...PAGE.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 1);
  for (const m of scripts) new vm.Script(m[1]);
});

test('the Approve button exists in exactly ONE place — the rendered preview — and carries that preview’s hash', () => {
  assert.equal([...PAGE.matchAll(/data-act="approve"/g)].length, 1);
  assert.match(PREVIEW, /data-act="approve" data-hash="\$\{esc\(r\.render_hash\)\}"/);
  assert.doesNotMatch(CARD, /data-act="approve"/, 'a queue card has no Approve until it has been previewed');
});

test('editing after a preview removes Approve until the owner previews again', () => {
  assert.match(PAGE, /pv\.innerHTML = '<p class="muted">Edited — preview again before approving\.<\/p>'/);
});

test('the approve request sends the preview hash it was given', () => {
  assert.match(PAGE, /op: 'approve', id, \.\.\.vals\(c\), render_hash: b\.dataset\.hash/);
});

test('every approval card names the actual recipient, the organization, and why it qualifies', () => {
  assert.match(CARD, /To: <b>\$\{esc\(x\.contact_name/);
  assert.match(CARD, /x\.recipient_email/);
  assert.match(CARD, /Organization: <b>/);
  assert.match(CARD, /Why this prospect qualifies/);
  assert.match(PREVIEW, /<div>To<\/div><div>\$\{esc\(r\.to\)\}/);
  assert.match(PREVIEW, /Claims this email relies on/);
});

test('a suppressed recipient gets no Approve button at all', () => {
  assert.match(PREVIEW, /blocked \? '<div class="bad">This email cannot be approved: the recipient is suppressed\.<\/div>'/);
});

test('every email preview iframe is fully sandboxed — no scripts, no same-origin', () => {
  const frames = [...PAGE.matchAll(/<iframe[^>]*>/g)];
  assert.ok(frames.length >= 2);
  for (const m of frames) assert.match(m[0], /sandbox=""/);
});

test('money typed as dollars becomes exact cents — never rounded, never a phantom zero', () => {
  const m = PAGE.match(/const toCents = (\(v\) => \{[^\n]*\});/);
  assert.ok(m, 'toCents is defined on one line');
  const toCents = vm.runInNewContext(m[1]);
  assert.equal(toCents('9.50'), 950);
  assert.equal(toCents('9.5'), 950);
  assert.equal(toCents('$1,250.00'), 125000);
  assert.equal(toCents('9.505'), null);
  assert.equal(toCents(''), null);
  assert.equal(toCents('nine'), null);
});

test('form labels are tied to their controls (screen readers announce every field)', () => {
  assert.match(PAGE, /function linkLabels\(\)/);
  assert.match(PAGE, /l\.htmlFor = next\.id/);
  assert.match(PAGE, /new MutationObserver\(linkLabels\)\.observe\(root, \{ childList: true, subtree: true \}\)/);
});

test('locked switches render disabled with the reason, not as a working toggle', () => {
  assert.match(PAGE, /🔒 Locked/);
  assert.match(PAGE, /\$\{locked \? ' disabled' : ''\}/);
});

// ---------------------------------------------------------------- the API is owner-only

const req = (url, cookie, body) => new Request(url, body
  ? { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) }
  : { headers: { Cookie: cookie } });

test('every Sales endpoint refuses kitchen and marketing staff and the signed-out', async () => {
  const env = ownerEnv();
  for (const cookie of ['anejo_sess=tok-kitchen', 'anejo_sess=tok-marketing', '']) {
    const want = cookie ? 403 : 401;
    assert.equal((await salesGet({ env, request: req('https://x.test/api/hub/owner/sales', cookie) })).status, want);
    assert.equal((await salesPost({ env, request: req('https://x.test/api/hub/owner/sales', cookie, { op: 'create_org', name: 'X' }) })).status, want);
    assert.equal((await settingsPost({ env, request: req('https://x.test/api/hub/owner/sales/settings', cookie, { op: 'set_flag', key: 'sales.email_enabled', value: true }) })).status, want);
    assert.equal((await outreachPost({ env, request: req('https://x.test/api/hub/owner/sales/outreach', cookie, { op: 'send_now' }) })).status, want);
    assert.equal((await dealPost({ env, request: req('https://x.test/api/hub/owner/sales/deal', cookie, { op: 'convert', proposal_id: 'p' }) })).status, want);
  }
});

test('the owner reaches every view', async () => {
  const env = ownerEnv();
  for (const view of ['dashboard', 'list', 'queue', 'settings', 'review', 'metrics']) {
    const r = await salesGet({ env, request: req(`https://x.test/api/hub/owner/sales?view=${view}`, 'anejo_sess=tok-owner') });
    assert.equal(r.status, 200, view);
    assert.equal((await r.json()).ok, true, view);
  }
});

test('the settings API refuses to unlock auto-send or remove the approval requirement (409, with the reason)', async () => {
  const env = ownerEnv();
  for (const [key, value] of [['sales.auto_send_enabled', true], ['sales.owner_approval_required', false], ['sales.voice_enabled', true]]) {
    const r = await settingsPost({ env, request: req('https://x.test/api/hub/owner/sales/settings', 'anejo_sess=tok-owner', { op: 'set_flag', key, value }) });
    assert.equal(r.status, 409, key);
    assert.match((await r.json()).error, /release|Phase 2/);
  }
});

test('the institutional positioning is filed as a Brief PROPOSAL (whole current brief + one section) — never an edit to the brief', async () => {
  const env = ownerEnv();
  const call = () => settingsPost({ env, request: req('https://x.test/api/hub/owner/sales/settings', 'anejo_sess=tok-owner', { op: 'propose_positioning' }) });
  const hadBrief = env.DB.one("SELECT body FROM docs WHERE id = 'doc_brand_main'");
  if (!hadBrief) {
    // With no live brief, an approval would REPLACE everything with one section, so it refuses.
    assert.equal((await call()).status, 409);
    const t = Date.now();
    env.DB.sqlite.prepare("INSERT INTO docs (id, doc_type, title, body, version, active, created_at, updated_at) VALUES ('doc_brand_main','brand','Brand & Standards Brief','## 1. Who we are\nAñejo.',1,1,?,?)").run(t, t);
  }
  const before = env.DB.one("SELECT body FROM docs WHERE id = 'doc_brand_main'").body;
  const r = await (await call()).json();
  assert.equal(r.ok, true, r.error);
  const p = env.DB.one('SELECT * FROM brief_proposals WHERE id = ?', r.proposal_id);
  assert.equal(p.status, 'pending', 'it waits for the owner in Reviews');
  assert.ok(p.proposed_body.startsWith(before.trim()), 'the whole current brief is kept');
  assert.match(p.proposed_body, /Añejo Managed Meal Service/);
  assert.match(p.proposed_body, /Never name a customer \(DGP included\)/);
  assert.equal(env.DB.one("SELECT body FROM docs WHERE id = 'doc_brand_main'").body, before, 'the live brief is untouched');
  const again = await (await call()).json();
  assert.equal(again.already, true, 'a second click does not file a duplicate');
  assert.equal(env.DB.rows('SELECT id FROM brief_proposals').length, 1);
});

test('saving the offer without the confirm box leaves it unconfirmed (and so unsendable)', async () => {
  const env = ownerEnv();
  const save = (confirm) => settingsPost({ env, request: req('https://x.test/api/hub/owner/sales/settings', 'anejo_sess=tok-owner', {
    op: 'save', key: 'sales.offer', value: { headline: 'H', value_prop: 'V', cta_text: 'C', pricing_display_policy: 'on_request' }, confirm,
  }) });
  assert.equal((await (await save(false)).json()).value.confirmed, false);
  assert.equal((await (await save(true)).json()).value.confirmed, true);
  const bad = await settingsPost({ env, request: req('https://x.test/api/hub/owner/sales/settings', 'anejo_sess=tok-owner', {
    op: 'save', key: 'sales.offer', value: { headline: 'H', value_prop: 'V', cta_text: 'C', pricing_display_policy: 'show_from', price_from_cents: 9.5 }, confirm: true,
  }) });
  assert.equal(bad.status, 400, 'a float "from" price is refused');
});
