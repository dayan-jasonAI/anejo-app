// /start/<intake token> — the onboarding page a newly activated location gets from its own
// ordering link. Every fact on it belongs to a row: this site's delivery days, this site's cutoff,
// this account's billing schedule, this site's ordering roster.
//
// The failure this file exists to prevent is the one _lib/contract.js already learned the hard way
// with admin/cutoff-check: a page that DEFAULTS a week. A site with no delivery_days must produce
// a page that says so, not a page that says Monday to Friday — telling an office it is getting
// lunch on a day it never ordered is worse than telling it nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { setting } from '../helpers/sales-fixture.js';
import { onRequestGet as start } from '../../functions/start/[token].js';
import { HARD_CUTOFF_TIME } from '../../functions/_lib/contract.js';

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0a1b2';
const INTAKE = readFileSync(new URL('../../public/lunch-count.html', import.meta.url), 'utf8');

function env({ token = TOKEN, site = {}, account = {}, staff = [] } = {}) {
  const e = ownerEnv();
  const t = Date.now();
  const cols = { intake_token: token, ...site };
  for (const [k, v] of Object.entries(cols)) {
    e.DB.sqlite.prepare(`UPDATE contract_sites SET ${k} = ?, updated_at = ? WHERE id = 'site_dgp_delray'`).run(v, t);
  }
  for (const [k, v] of Object.entries(account)) {
    e.DB.sqlite.prepare(`UPDATE contract_accounts SET ${k} = ?, updated_at = ? WHERE id = 'acct_dgp'`).run(v, t);
  }
  staff.forEach((s, i) => {
    e.DB.sqlite.prepare(
      'INSERT INTO contract_site_staff (id, site_id, account_id, name, phone, is_primary, added_by, active, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(`css_${i}`, 'site_dgp_delray', 'acct_dgp', s.name, s.phone, s.is_primary ? 1 : 0, 'owner', s.active === false ? 0 : 1, t);
  });
  return e;
}

const open = (e, token = TOKEN) => start({ env: e, params: { token }, request: new Request(`https://anejocateringco.com/start/${token}`) });
const body = async (e, token) => (await open(e, token)).text();

test('the page states this location’s own schedule, read off its row', async () => {
  const html = await body(env());
  assert.match(html, /Delray Beach/);
  assert.match(html, /DGP Health &amp; Wellness/, 'the account name is escaped like any other string');
  assert.match(html, /Monday, Tuesday and Wednesday/);
  assert.match(html, /11:30–12:30/);
  assert.match(html, /<span class="v">09:00 AM<\/span>/, 'the same words the count page uses');
  assert.match(html, new RegExp(`${HARD_CUTOFF_TIME} AM`), 'the freeze time is the one submitHeadcount actually enforces');
  assert.match(html, /Every two weeks/, 'the account’s own billing schedule, in the words the signup form uses');
});

test('a different site produces a different page — nothing here is hardcoded', async () => {
  const html = await body(env({ site: { name: 'Boynton Beach', delivery_days: 'tue,thu', cutoff_time: '08:30', window_label: '12:00–12:45' }, account: { billing_model: 'monthly' } }));
  assert.match(html, /Tuesday and Thursday/);
  assert.doesNotMatch(html, /Monday/);
  assert.match(html, /08:30 AM/);
  assert.match(html, /12:00–12:45/);
  assert.match(html, /Monthly invoice/);
  assert.doesNotMatch(html, /Every two weeks/);
});

test('a site with no delivery days claims no week at all, and says the gap out loud', async () => {
  const html = await body(env({ site: { delivery_days: '' } }));
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'weekdays']) {
    assert.doesNotMatch(html, new RegExp(d, 'i'), `${d} must never be invented for a site that has no days recorded`);
  }
  assert.match(html, /delivery days are not recorded on this location yet/);
});

test('a site with no cutoff recorded asks for one instead of implying nine o’clock', async () => {
  const html = await body(env({ site: { cutoff_time: '' } }));
  assert.match(html, /morning cutoff is not recorded on this location yet/);
  assert.doesNotMatch(html, /Count in by/);
  // The freeze is a business-wide constant, not a per-site negotiation, so it still appears.
  assert.match(html, new RegExp(`${HARD_CUTOFF_TIME} AM`));
});

test('the page shows no money: no price per lunch, no delivery fee, no rush fee, no total', async () => {
  const html = await body(env({ staff: [{ name: 'Carmen Ortega', phone: '+15615550101', is_primary: true }] }));
  // Past the stylesheet — `font-weight:600` is not a price, and a money check that trips on CSS
  // would be deleted by the next person rather than fixed.
  const visible = html.slice(html.indexOf('</style>'));
  assert.doesNotMatch(visible, /\$\d/);
  assert.doesNotMatch(visible, /\b600\b|\b2500\b|\b1500\b/, 'the site’s cents columns must not leak in any form');
  assert.match(visible, /never shows a price or a total/);
});

test('the ordering roster is names only — no phone numbers, masked or otherwise', async () => {
  const html = await body(env({
    staff: [
      { name: 'Carmen Ortega', phone: '+15615550101', is_primary: true },
      { name: 'Luis Peña', phone: '+15615550102' },
      { name: 'Former Colleague', phone: '+15615550103', active: false },
    ],
  }));
  assert.match(html, /Carmen Ortega/);
  assert.match(html, /Luis Peña/);
  assert.match(html, /main contact/);
  assert.doesNotMatch(html, /Former Colleague/, 'someone removed from the list is not on the page');
  assert.doesNotMatch(html, /5550101|•••|\*{3}|\+1561/, 'a page that only explains has no reason to carry a handset');
});

test('an empty roster invites one instead of pretending there is one', async () => {
  const html = await body(env());
  assert.match(html, /Nobody is on the list for this location yet/);
});

test('a pending account gets the set-up notice, not a first-week walkthrough', async () => {
  const html = await body(env({ account: { status: 'pending' } }));
  assert.match(html, /Your account is being set up/);
  assert.doesNotMatch(html, /Open your count link/, 'a link that would refuse every count must not be offered');
  assert.doesNotMatch(html, /Your first week/);
  assert.match(html, /561-778-7474/);
});

test('an unknown, inactive, or malformed token gets the same soft 404', async () => {
  assert.equal((await open(env(), 'f'.repeat(44))).status, 404);
  assert.equal((await open(env(), '../../etc/passwd')).status, 404);
  assert.equal((await open(env(), 'short')).status, 404);
  assert.equal((await open(env({ site: { active: 0 } }))).status, 404);
  const res = await open(env(), 'f'.repeat(44));
  assert.match(await res.text(), /no longer available/);
});

test('it explains a closed day and a frozen count the way the code behaves', async () => {
  const html = await body(env());
  assert.match(html, /Send no count/);
  assert.match(html, /nothing on your invoice/);
  assert.match(html, /We do not keep a holiday calendar/);
  assert.match(html, /goes in as a rush on the terms agreed for your account/);
  assert.match(html, /the day’s number is frozen/);
  assert.match(html, /Tomorrow’s count opens again overnight/);
});

test('it is reachable from the count link the office already has, in both languages', () => {
  assert.match(INTAKE, /href="\/start\/'\+encodeURIComponent\(token\)/);
  assert.match(INTAKE, /firstWeek:\{en:'[^']+',es:'[^']+'\}/);
  // On every state of that page, including the two states where somebody is most likely to need it.
  assert.equal((INTAKE.match(/\+startLink\(\)/g) || []).length, 4);
});

test('the orientation and first-week video slots render only when the owner has set them', async () => {
  const e = env();
  let html = await body(e);
  assert.doesNotMatch(html, /<video/);
  setting(e, 'sales.media', {
    orientation: { url: 'https://media.anejocateringco.com/orientation.mp4', caption: 'Start here' },
    onboarding: { url: '/assets/video/first-week.mp4' },
  });
  html = await body(e);
  assert.equal(html.match(/<video/g).length, 2);
  assert.doesNotMatch(html, /autoplay/);
  assert.match(html, /<section id="orientation">[\s\S]*?<video/);
  assert.match(html, /<section id="week">[\s\S]*?<video/);
});

test('the page is read-only: no form, no POST, and no visit recorded', async () => {
  const e = env();
  const before = e.DB.rows('SELECT id FROM activity_log').length;
  const html = await body(e);
  assert.doesNotMatch(html, /<form|<input|method="post"/i);
  assert.equal(e.DB.rows('SELECT id FROM activity_log').length, before);
  assert.match((await open(e)).headers.get('X-Robots-Tag'), /noindex/);
});
