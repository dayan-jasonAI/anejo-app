// The personalised landing page (/for/<token>) and its event beacon: the token is the only
// credential, the page names one organization and nothing internal, prospect data never leaks
// between tokens, and staff previews are not counted as prospect engagement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, seedProspect, setting } from '../helpers/sales-fixture.js';
import { onRequestGet as landing } from '../../functions/for/[token].js';
import { onRequestPost as landingEvent } from '../../functions/api/sales/landing-event.js';
import { suppressOrganization } from '../../functions/_lib/sales/store.js';

const tokenOf = (env, oppId) => env.DB.one('SELECT landing_token FROM sales_opportunities WHERE id = ?', oppId).landing_token;
const open = (env, token, cookie = '') => landing({ env, params: { token }, request: new Request(`https://anejocateringco.com/for/${token}`, { headers: cookie ? { Cookie: cookie } : {} }) });

test('the page names its organization (escaped), is noindex, and shows nothing internal', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg, { name: 'Sunrise <b>Recovery</b> Center' });
  const res = await open(env, tokenOf(env, oppId));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('X-Robots-Tag'), /noindex/);
  const html = await res.text();
  assert.match(html, /Prepared for Sunrise &lt;b&gt;Recovery&lt;\/b&gt; Center/);
  assert.doesNotMatch(html, /<b>Recovery<\/b>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  for (const internal of [/\btier\b/i, /current_score/, /Maria Ruiz/, /mruiz@/, /criteria/i, /disqualif/i]) assert.doesNotMatch(html, internal);
});

test('one prospect’s page never shows another prospect', async () => {
  const { env, cfg } = await readyEnv();
  const a = await seedProspect(env, cfg);
  await seedProspect(env, cfg, { name: 'Harbor Day Program', website: 'https://harbordayprogram.org/', email: 'leo@harbordayprogram.org', fullName: 'Leo Grant', street: '9 Ocean Ave' });
  const html = await (await open(env, tokenOf(env, a.oppId))).text();
  assert.match(html, /Sunrise Recovery Center/);
  assert.doesNotMatch(html, /Harbor/);
});

test('unknown, malformed, and do-not-contact tokens all get the same 404', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId, orgId } = await seedProspect(env, cfg);
  assert.equal((await open(env, 'f'.repeat(32))).status, 404);
  assert.equal((await open(env, '../../etc/passwd')).status, 404);
  const token = tokenOf(env, oppId);
  await suppressOrganization(env, orgId, { reason: 'asked' });
  assert.equal((await open(env, token)).status, 404);
});

test('a prospect visit is recorded once (and marks the email clicked); a staff preview is not recorded', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const token = tokenOf(env, oppId);
  await open(env, token, 'anejo_sess=tok-owner');
  assert.equal(env.DB.rows("SELECT id FROM sales_activity WHERE kind = 'landing_view'").length, 0, 'the owner previewing is not engagement');
  const html = await (await open(env, token, 'anejo_sess=tok-owner')).text();
  assert.match(html, /Staff preview/);
  await open(env, token);
  await open(env, token);
  assert.equal(env.DB.rows("SELECT id FROM sales_activity WHERE kind = 'landing_view'").length, 1, 'a reload within 30 minutes is one visit');
  assert.equal(env.DB.rows("SELECT id FROM activity_log WHERE event = 'sales.outreach_clicked'").length, 1);
});

test('no price appears unless the owner chose to show one; tasting appears only when enabled', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const token = tokenOf(env, oppId);
  let html = await (await open(env, token)).text();
  assert.doesNotMatch(html, /\$\d/);
  assert.match(html, /Pricing is quoted for your headcount/);
  assert.doesNotMatch(html, /value="tasting"/);
  setting(env, 'sales.offer', { confirmed: true, pricing_display_policy: 'show_from', price_from_cents: 850, tasting_enabled: true });
  html = await (await open(env, token)).text();
  assert.match(html, /From \$8\.50 per meal/);
  assert.match(html, /value="tasting"/);
});

test('the event beacon answers 204 either way, writes only for a real token and an allowed event, and dedupes', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg);
  const token = tokenOf(env, oppId);
  const send = (t, event) => landingEvent({ env, request: new Request('https://anejocateringco.com/api/sales/landing-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t, event }) }) });
  assert.equal((await send('a'.repeat(32), 'cta_click')).status, 204);
  assert.equal((await send(token, 'drop_table')).status, 204);
  assert.equal(env.DB.rows("SELECT id FROM sales_activity WHERE kind = 'landing_event'").length, 0);
  await send(token, 'cta_click');
  await send(token, 'cta_click');
  await send(token, 'pricing_view');
  assert.equal(env.DB.rows("SELECT id FROM sales_activity WHERE kind = 'landing_event'").length, 2);
});
