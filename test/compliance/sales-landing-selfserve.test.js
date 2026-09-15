// The self-serve half of the prospect landing page: the "How it works" walkthrough and the FAQ
// that are supposed to let a program director answer their own questions instead of emailing
// Dayan. The risk in writing that copy is not that it is thin — it is that it is CONFIDENT about
// things nobody recorded. So the assertions below are mostly about what the page must NOT say:
// no price it was not given, no delivery time, no dietary guarantee, no customer's name, and no
// day of the week unless the owner typed one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, seedProspect, setting } from '../helpers/sales-fixture.js';
import { onRequestGet as landing } from '../../functions/for/[token].js';
import { BILLING_MODEL_LABELS } from '../../functions/_lib/contract.js';

const tokenOf = (env, oppId) => env.DB.one('SELECT landing_token FROM sales_opportunities WHERE id = ?', oppId).landing_token;
const open = (env, token) => landing({ env, params: { token }, request: new Request(`https://anejocateringco.com/for/${token}`) });

async function page(offer = {}) {
  const { env, cfg } = await readyEnv({ offer });
  const { oppId } = await seedProspect(env, cfg);
  return { env, html: await (await open(env, tokenOf(env, oppId))).text() };
}

test('the FAQ answers every question the brief says a prospect should not have to ask', async () => {
  const { html } = await page();
  for (const [what, re] of [
    ['the headcount link', /How does the daily headcount link work\?/],
    ['who may order', /Who on our team can send the count\?/],
    ['a late change', /What if the count changes after we have sent it\?/],
    ['a closed day', /What happens on a holiday, or a day we are closed\?/],
    ['the delivery area', /Which areas do you deliver to\?/],
    ['allergies', /Can you handle allergies and special requests\?/],
    ['billing', /How does billing work\?/],
    ['the first day', /What does the first service day look like\?/],
  ]) assert.match(html, re, `${what} must be answerable without an email`);
});

test('the billing answer names the four schedules the system actually runs, in the words the signup form already uses', async () => {
  const { html } = await page();
  for (const m of Object.values(BILLING_MODEL_LABELS)) assert.match(html, new RegExp(m.title.replace(/\+/g, '\\+')));
  // Card payment is opt-in per account (migration 0095). The page must not imply a "Pay now"
  // button is waiting for them.
  assert.match(html, /switched on per account and only at your request/);
  // Square is named on purpose: "who ends up holding my card number" is the question behind the
  // question, and the honest answer is one worth giving before they have to ask it.
  assert.match(html, /processed by <b>Square<\/b>/);
  assert.match(html, /never see or store your card details/);
});

test('the page states no fact it was not given: no price, no delivery time, no diet promise, no customer', async () => {
  const { html } = await page();
  assert.doesNotMatch(html, /\$\d/, 'no price unless the owner chose to show one');
  assert.doesNotMatch(html, /\b\d+\s*(minutes|mins|hours)\b/i, 'no delivery-time promise');
  assert.doesNotMatch(html, /\b(we (can|do) (accommodate|cater to)|gluten-free options|dairy-free options)\b/i);
  assert.doesNotMatch(html, /\bDGP\b/, 'no customer is named anywhere, ever');
  assert.doesNotMatch(html, /10:45/, 'the freeze time belongs to a site row, not to a prospect who has none');
  // The soft/hard cutoff mechanics are described, but only in terms of THEIR cutoff.
  assert.match(html, /goes in as a rush on the terms agreed for your account/);
});

test('no day of the week is claimed unless the owner typed one, and a typed one is used everywhere', async () => {
  const blank = (await page()).html;
  assert.doesNotMatch(blank, /Monday|Tuesday|Wednesday|Thursday|Friday|weekdays/i);
  assert.match(blank, /by a morning cutoff we agree with you/);

  const set = (await page({ delivery_days_text: 'Monday–Wednesday', headcount_cutoff_text: '9:00 AM' })).html;
  assert.match(set, /deliveries Monday–Wednesday/);
  assert.match(set, /by 9:00 AM/);
  assert.doesNotMatch(set, /by a morning cutoff we agree with you/);
});

test('a closed day is explained by what the code actually does — no count, no delivery, no invoice line', async () => {
  const { html } = await page();
  assert.match(html, /Send no count/);
  assert.match(html, /nothing to invoice/);
  assert.match(html, /no standing order running in the background/);
  // The page now PROMISES two things, so the machinery that keeps them ships in the same change
  // (functions/_lib/holiday_notices.js). Copy that makes a promise the code cannot keep is the one
  // kind of copy this page must never carry.
  assert.match(html, /ahead of every US federal holiday we write and ask/i);
  assert.match(html, /at least seven days beforehand/i);
});

test('the allergy answer describes the notes box, and promises nothing on the kitchen’s behalf', async () => {
  const { html } = await page();
  assert.match(html, /notes box/);
  assert.match(html, /travels with that day’s order to the kitchen/);
  assert.match(html, /agreed with you before you start, not something this page should promise/);
});

test('the owner’s own notes appear only when he has written them, and are escaped', async () => {
  const blank = (await page()).html;
  assert.doesNotMatch(blank, /class="own"/, 'an empty note renders as nothing, not as an empty box');

  const { html } = await page({
    dietary_note: 'Ask us about <b>vegetarian</b> days.',
    billing_note: 'We can complete your vendor packet.',
    first_day_note: 'Dayan delivers the first service day himself.',
  });
  assert.equal(html.match(/class="own"/g).length, 3);
  assert.match(html, /Ask us about &lt;b&gt;vegetarian&lt;\/b&gt; days\./);
  assert.doesNotMatch(html, /Ask us about <b>vegetarian<\/b>/);
  assert.match(html, /We can complete your vendor packet\./);
  assert.match(html, /Dayan delivers the first service day himself\./);
});

test('an over-long owner note is refused by the settings API rather than rendered', async () => {
  const { onRequestPost } = await import('../../functions/api/hub/owner/sales/settings.js');
  const { env } = await readyEnv();
  const res = await onRequestPost({
    env,
    request: new Request('https://anejocateringco.com/api/hub/owner/sales/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'anejo_sess=tok-owner' },
      body: JSON.stringify({
        op: 'save', key: 'sales.offer',
        value: { headline: 'h', value_prop: 'v', cta_text: 'c', billing_note: 'x'.repeat(601) },
      }),
    }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /billing note is too long/);
});

test('the how-it-works steps describe the real mechanism, not a brochure', async () => {
  const { html } = await page();
  const how = html.slice(html.indexOf('<section id="how">'), html.indexOf('<section id="pricing"'));
  assert.match(how, /its own private link/);
  assert.match(how, /confirms once by text code/);
  assert.match(how, /A day nobody sends a count for is not delivered and not billed/);
  assert.doesNotMatch(how, /\$\d/);
});

test('the escaping and no-leak guarantees of the original page still hold with the longer copy', async () => {
  const { env, cfg } = await readyEnv();
  const { oppId } = await seedProspect(env, cfg, { name: 'Sunrise <b>Recovery</b> Center' });
  await seedProspect(env, cfg, { name: 'Harbor Day Program', website: 'https://harbordayprogram.org/', email: 'leo@harbordayprogram.org', fullName: 'Leo Grant', street: '9 Ocean Ave' });
  setting(env, 'sales.media', { how_it_works: { url: 'https://media.anejocateringco.com/how.mp4' } });
  const html = await (await open(env, tokenOf(env, oppId))).text();
  assert.doesNotMatch(html, /<b>Recovery<\/b>/);
  assert.doesNotMatch(html, /Harbor/);
  for (const internal of [/\btier\b/i, /current_score/, /Maria Ruiz/, /mruiz@/]) assert.doesNotMatch(html, internal);
});
