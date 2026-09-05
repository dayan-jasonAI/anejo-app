// Public catering intake — the customer request must reach both owner surfaces without inventing
// a price. These tests drive the real route and pin the public/Hub wiring that makes it usable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import { normalizeCateringRequest, onRequestPost } from '../../functions/api/leads.js';

const PAGE = readFileSync(new URL('../../public/catering.html', import.meta.url), 'utf8');
const CAJITA = readFileSync(new URL('../../public/cajita.html', import.meta.url), 'utf8');
const HOME = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const HUB = readFileSync(new URL('../../public/hub/owner/catering.html', import.meta.url), 'utf8');
const OWNER_HOME = readFileSync(new URL('../../public/hub/owner/index.html', import.meta.url), 'utf8');
const PUSH_PEEK = readFileSync(new URL('../../functions/api/hub/push/peek.js', import.meta.url), 'utf8');
const ALERTS = readFileSync(new URL('../../functions/_lib/alerts.js', import.meta.url), 'utf8');
const SITEMAP = readFileSync(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');

const valid = {
  kind: 'catering', name: 'Marisol Reyes', email: 'marisol@example.test', phone: '561-555-0102',
  company: 'Reyes Studio', menu_options: ['Añejo Fit Menu', 'Cuban Food', 'Individual Cajitas'],
  event_date: '2026-10-18', event_time: '12:30', guests: 60,
  event_type: 'Office or team meal', location: 'West Palm Beach 33401',
  event_theme: 'First birthday', theme_colors: 'Pink and gold with custom guest tags',
  dietary_needs: 'Two vegetarian meals; one nut allergy',
  event_details: 'Individually packed. Please include serving utensils.',
};

function post(body, env) {
  return onRequestPost({
    env,
    request: new Request('https://anejocateringco.com/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  });
}

test('catering normalization refuses to guess around missing event facts', () => {
  for (const patch of [
    { menu_options: [] }, { menu_options: ['Something invented'] }, { guests: 0 },
    { guests: 4.5 }, { event_date: '' }, { event_date: '2026-99-99' },
    { event_time: 'lunchtime' }, { event_time: '29:70' },
    { event_type: '' }, { location: '' },
  ]) {
    assert.equal(normalizeCateringRequest({ ...valid, ...patch }).ok, false, JSON.stringify(patch));
  }
});

test('the lead route rejects JSON that is not an object before reading fields', async () => {
  const response = await post(null, {});
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Invalid request body/);
});

test('a catering request refuses to pretend it was recorded when D1 is unavailable', async () => {
  const response = await post(valid, { RESEND_API_KEY: 'resend-test' });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /form is briefly unavailable/i);
});

test('the public form stores one complete catering request in the shared Hub lead stream', async () => {
  let args = null;
  const DB = makeD1([[/INSERT INTO leads/i, (call) => { args = call.args; return 1; }]]);
  const response = await post(valid, { DB });
  const out = await response.json();

  assert.equal(response.status, 200);
  assert.equal(out.ok, true);
  assert.match(out.id, /^ld_/);
  assert.equal(args[1], 'catering');
  assert.equal(args[2], 'Marisol Reyes');
  assert.equal(args[5], 'Reyes Studio');
  assert.equal(args[6], 'Añejo Fit Menu, Cuban Food, Individual Cajitas');
  assert.match(args[7], /Event date: 2026-10-18/);
  assert.match(args[7], /Guest count: 60/);
  assert.match(args[7], /Location: West Palm Beach 33401/);
  assert.match(args[7], /Event theme \/ occasion: First birthday/);
  assert.match(args[7], /Colors \/ special touches: Pink and gold/);
  assert.match(args[7], /Two vegetarian meals; one nut allergy/);
  assert.match(args[7], /Individually packed/);
  assert.doesNotMatch(args[7], /\$\d/, 'a request must not fabricate a catering price');
});

test('a catering submission sends the full brief to the configured Añejo inbox', async () => {
  const DB = makeD1([
    [/INSERT INTO leads/i, () => 1],
    [/SELECT email, reason FROM email_suppressions/i, () => null],
  ]);
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ id: 'email_1' }) };
  };
  try {
    const response = await post(valid, { DB, RESEND_API_KEY: 'resend-test', LEADS_NOTIFY_TO: 'owner@example.test' });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(calls[0].body.to, ['owner@example.test']);
  assert.match(calls[0].body.subject, /catering quote request.*60 guests/i);
  assert.match(calls[0].body.html, /West Palm Beach 33401/);
  assert.match(calls[0].body.html, /Individual Cajitas/);
  assert.match(calls[0].body.html, /First birthday/);
  assert.match(calls[0].body.html, /Pink and gold/);
  assert.match(calls[0].body.html, /Two vegetarian meals/);
});

test('a stored request raises a durable Hub alert and reports an accepted owner email', async () => {
  const alertTypes = [];
  const DB = makeD1([
    [/INSERT INTO leads/i, () => 1],
    [/SELECT id FROM alerts WHERE dedupe_key/i, () => null],
    [/INSERT INTO alerts/i, ({ args }) => { alertTypes.push(args[1]); return 1; }],
    [/INSERT INTO activity_log/i, () => 1],
    [/SELECT email, reason FROM email_suppressions/i, () => null],
  ]);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 'email_catering_1' }) });
  try {
    const response = await post(valid, { DB, RESEND_API_KEY: 'resend-test', LEADS_NOTIFY_TO: 'owner@example.test' });
    const out = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(out.notifications, { hub: true, email: true });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(alertTypes, ['catering_request']);
});

test('an email outage leaves the request stored and raises a visible Hub warning', async () => {
  let leadWrites = 0;
  const alertTypes = [];
  const DB = makeD1([
    [/INSERT INTO leads/i, () => { leadWrites++; return 1; }],
    [/SELECT id FROM alerts WHERE dedupe_key/i, () => null],
    [/INSERT INTO alerts/i, ({ args }) => { alertTypes.push(args[1]); return 1; }],
    [/INSERT INTO activity_log/i, () => 1],
    [/SELECT email, reason FROM email_suppressions/i, () => null],
  ]);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => 'provider unavailable' });
  try {
    const response = await post(valid, { DB, RESEND_API_KEY: 'resend-test' });
    const out = await response.json();
    assert.equal(response.status, 200);
    assert.equal(leadWrites, 1);
    assert.deepEqual(out.notifications, { hub: true, email: false });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(alertTypes, ['catering_request', 'catering_email_failed']);
});

test('the customer and owner surfaces expose one connected catering journey', () => {
  assert.match(HOME, /href="\/catering">Catering<\/a>/, 'Catering is in the homepage header/footer');
  assert.match(HOME, /href="\/cajita">La Cajita<\/a>/, 'La Cajita is linked from the homepage');
  assert.match(PAGE, /id="cateringForm"/);
  assert.match(PAGE, /name="menu_option"[^>]+Añejo Fit Menu/);
  assert.match(PAGE, /name="menu_option"[^>]+Cuban Food/);
  assert.match(PAGE, /name="menu_option"[^>]+Individual Cajitas/);
  assert.match(PAGE, /name="guests"/);
  assert.match(PAGE, /name="event_theme"/);
  assert.match(PAGE, /name="theme_colors"/);
  assert.match(PAGE, /Mini sandwiches and sliders/);
  assert.match(PAGE, /Croquetas and empanadas/);
  assert.match(PAGE, /fetch\('\/api\/leads'/);
  assert.match(PAGE, /mailto:dayan@anejocateringco\.com/, 'email fallback preserves the request');
  assert.match(HUB, /Website quote requests/);
  assert.match(HUB, /data-prefill/);
  assert.match(HUB, /Start a quote/);
  assert.match(ALERTS, /'catering_request'/);
  assert.match(OWNER_HOME, /case 'catering_request'/);
  assert.match(PUSH_PEEK, /alert_type === 'catering_request'/);
  assert.match(SITEMAP, /https:\/\/anejocateringco\.com\/catering/);
  assert.match(SITEMAP, /https:\/\/anejocateringco\.com\/cajita/);
});

test('La Cajita has one canonical public route and enters the catering form preselected', () => {
  assert.match(CAJITA, /<link rel="canonical" href="https:\/\/anejocateringco\.com\/cajita">/);
  assert.match(CAJITA, /<meta property="og:url" content="https:\/\/anejocateringco\.com\/cajita">/);
  assert.match(CAJITA, /href="\/catering\?menu=cajita#quote"/);
  assert.match(PAGE, /requestedMenu==='cajita'/);
  assert.match(PAGE, /getElementById\('menu-cajita'\)/);
  assert.match(CAJITA, /pink-first-birthday-cajita-held\.jpg/);
  assert.match(CAJITA, /Your theme\. Your colors\. Your Cajita\./);
  assert.match(CAJITA, /First birthdays/);
  assert.doesNotMatch(CAJITA, /bowl_congreen\.jpg/, 'the Cajita page must use real Cajita photography');
  assert.doesNotMatch(CAJITA, /\$\d/, 'the Cajita page must not invent a price');
});

test('customer-facing catering copy speaks for the Añejo team, not an individual', () => {
  assert.match(PAGE, /anything else Añejo should know\./);
  assert.match(PAGE, /the Añejo team will follow up/i);
  assert.match(CAJITA, /the Añejo team will follow up/i);
  assert.doesNotMatch(PAGE, /\bDayan\b/);
  assert.doesNotMatch(CAJITA, /\bDayan\b/);
});
