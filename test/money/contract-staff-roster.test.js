// More than one person may order for a site — and the owner can record a count himself.
//
// THE INCIDENT (2026-08-03, Pompano Beach). The registered contact was out. A colleague opened
// the intake link, typed her own name and her own mobile, and the 6-digit code went to the ABSENT
// contact's phone anyway. The office could not order, the day went unrecorded, the count reached
// the owner as a text message — and the owner had no way to enter it either, because this API
// could set a contact, revoke a device and raise an invoice but could not write a head count.
//
// The cause was one line: `const dest = onFile || normalizePhone(phone)`. contract_intake_devices
// had always allowed many trusted devices per site; the single enrollment phone was the limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  requestIntakeOtp, verifyIntakeOtp, processIntake, ownerSetHeadcount,
  addSiteStaff, setStaffActive, listSiteStaff, maskSiteStaff, primaryContactDevice,
} from '../../functions/_lib/contract.js';

const LIB = readFileSync(new URL('../../functions/_lib/contract.js', import.meta.url), 'utf8');
const OWNER_API = readFileSync(new URL('../../functions/api/hub/owner/contracts.js', import.meta.url), 'utf8');
const STAFF_API = readFileSync(new URL('../../functions/api/contract/staff.js', import.meta.url), 'utf8');
const INTAKE = readFileSync(new URL('../../public/lunch-count.html', import.meta.url), 'utf8');
const HUB = readFileSync(new URL('../../public/hub/owner/contracts.html', import.meta.url), 'utf8');
const MIGRATION = readFileSync(new URL('../../migrations/0077_contract_site_staff.sql', import.meta.url), 'utf8');

const PRIMARY = '+15615550100';   // Liuvys-shaped: the number that used to receive every code
const COVER = '+15615550199';     // the colleague covering for her

const SITE = {
  id: 'site_x', account_id: 'acct_x', name: 'Pompano Beach', intake_token: 'tok', active: 1,
  contact_phone: PRIMARY, contact_name: 'Primary', delivery_days: 'mon,tue,wed', cutoff_time: '09:15',
  price_per_lunch_cents: 600, delivery_fee_cents: 2000, rush_fee_cents: 0, window_label: '11:30–12:30',
};

// A FIXED clock, for the paths that check the delivery schedule.
//
// processIntake() and submitHeadcount() refuse a day the site does not take delivery on, and SITE
// above delivers 'mon,tue,wed'. Tests that called them without a clock therefore read the REAL
// weekday and passed Monday through Wednesday, failing Thursday through Sunday — CI on main was
// red four days out of seven for a reason that had nothing to do with the code under test.
//
// Both functions already accept `nowMs` for exactly this. Pinning it here is not a workaround: a
// test of who may file an order should not also be a test of what day it is.
//
// 2026-08-03, 09:00 ET — a Monday (a delivery day), before the 09:15 cutoff so nothing is rush.
// It is the date of the incident in the header, which is the day these paths were written for.
const MONDAY_9AM_ET = Date.UTC(2026, 7, 3, 13, 0, 0);

// A D1 + KV + SMS stand-in scoped to what these paths touch, in the fakeDB style already used in
// contract-billing-contact.test.js. Every SMS is captured, never sent.
function harness({ staff = [], devices = [], site = SITE } = {}) {
  const sms = [];
  const kv = new Map();
  const rows = { staff: staff.map((s) => ({ ...s })), devices: devices.map((d) => ({ ...d })), events: [], orders: [], ledger: [] };
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...a) {
          return {
            async first() {
              if (q.includes('FROM contract_sites WHERE intake_token')) return a[0] === site.intake_token ? { ...site } : null;
              if (q.includes('FROM contract_sites WHERE id')) return a[0] === site.id ? { ...site } : null;
              if (q.includes('FROM contract_accounts WHERE id')) return { id: 'acct_x', name: 'DGP Health & Wellness', status: 'active' };
              if (q.includes('FROM contract_intake_devices WHERE id')) return rows.devices.find((d) => d.id === a[0] && !d.revoked) || null;
              if (q.includes('FROM contract_site_staff WHERE id = ? AND site_id = ? AND active = 1')) return rows.staff.find((s) => s.id === a[0] && s.site_id === a[1] && s.active) || null;
              if (q.includes('FROM contract_site_staff WHERE id = ? AND site_id = ?')) return rows.staff.find((s) => s.id === a[0] && s.site_id === a[1]) || null;
              if (q.includes('SELECT phone FROM contract_site_staff WHERE id')) return rows.staff.find((s) => s.id === a[0]) || null;
              if (q.includes('FROM contract_site_staff WHERE site_id = ? AND phone = ?')) return rows.staff.find((s) => s.site_id === a[0] && s.phone === a[1]) || null;
              if (q.includes('FROM orders WHERE id')) return rows.orders.find((o) => o.id === a[0]) || null;
              if (q.includes('FROM contract_orders WHERE site_id')) return rows.ledger.find((l) => l.site_id === a[0] && l.service_date === a[1]) || null;
              return null;
            },
            async all() {
              if (q.includes('FROM contract_site_staff WHERE site_id = ? AND active = 1')) return { results: rows.staff.filter((s) => s.site_id === a[0] && s.active) };
              if (q.includes('FROM contract_site_staff WHERE site_id = ?')) return { results: rows.staff.filter((s) => s.site_id === a[0]) };
              return { results: [] };
            },
            async run() {
              if (q.startsWith('INSERT INTO contract_site_staff')) {
                const [rid, site_id, account_id, name, phone, is_primary, added_by, active] = a;
                const hit = rows.staff.find((s) => s.site_id === site_id && s.phone === phone);
                if (hit) { hit.name = name; hit.active = active; hit.is_primary = is_primary; }
                else rows.staff.push({ id: rid, site_id, account_id, name, phone, is_primary, added_by, active });
              } else if (q.startsWith('UPDATE contract_site_staff SET active')) {
                const hit = rows.staff.find((s) => s.id === a[2]); if (hit) hit.active = a[0];
                return { meta: { changes: hit ? 1 : 0 } };
              } else if (q.startsWith('INSERT INTO contract_intake_devices')) {
                rows.devices.push({ id: a[0], site_id: a[1], account_id: a[2], contact_name: a[3], phone: a[4], revoked: 0 });
              } else if (q.startsWith('INSERT INTO contract_order_events')) {
                rows.events.push({ site_id: a[1], service_date: a[3], event: a[5], headcount: a[6], total_cents: a[7], notes: a[8], name: a[9], verified: a[11] });
              } else if (q.startsWith('INSERT INTO orders')) {
                rows.orders.push({ id: a[0], delivery_date: a[2], subtotal: a[4], fee: a[5], total: a[6], status: a[7], headcount: a[18], is_rush: a[19] });
              } else if (q.startsWith('INSERT INTO contract_orders')) {
                rows.ledger.push({ site_id: a[1], service_date: a[3], headcount: a[4], total_cents: a[9], submitted_by: a[11], is_rush: a[12], notes: a[13] });
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  const env = {
    DB: db, rows, sms,
    SESSIONS: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); } },
    // twilio.js sendSms feature-detects credentials; with none set nothing leaves the building.
    // Captured here so a test can assert WHO would have been texted.
    TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '',
  };
  return env;
}

// sendSms is a no-op without Twilio credentials, so intercept at the KV record instead: the OTP
// destination is stored on the pending record and is the thing that was wrong.
async function otpDestination(env) {
  const raw = await env.SESSIONS.get('cintake_otp:site_x');
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------------------
// THE BUG ITSELF
// ---------------------------------------------------------------------------

test('THE REGRESSION: a covering staffer\'s code no longer goes to the absent contact\'s phone', async () => {
  const env = harness();
  await requestIntakeOtp(env, { token: 'tok', name: 'Roxana', phone: COVER });
  const rec = await otpDestination(env);
  assert.equal(rec.phone, COVER, 'the code must reach the person actually placing the order');
  assert.notEqual(rec.phone, PRIMARY, 'this is the exact line that blocked Pompano on 2026-08-03');
  assert.equal(rec.stand_in, 1, 'and they are marked a stand-in, because they are not on the roster');
});

test('picking a name from the roster texts THAT person — the number comes from the roster, not the request', async () => {
  const env = harness({ staff: [{ id: 'cst_a', site_id: 'site_x', name: 'Roxana', phone: COVER, active: 1, is_primary: 0 }] });
  // A hostile page sends a roster id AND its own phone. The roster row must win.
  await requestIntakeOtp(env, { token: 'tok', name: 'Roxana', staff_id: 'cst_a', phone: '+15619999999' });
  const rec = await otpDestination(env);
  assert.equal(rec.phone, COVER, 'an id must never be pointable at somebody else’s handset');
  assert.equal(rec.stand_in, 0, 'an authorized person is not a stand-in');
});

test('a removed staffer cannot receive a code, and is told what to do instead', async () => {
  const env = harness({ staff: [{ id: 'cst_a', site_id: 'site_x', name: 'Gone', phone: COVER, active: 0, is_primary: 0 }] });
  const r = await requestIntakeOtp(env, { token: 'tok', name: 'Gone', staff_id: 'cst_a' });
  assert.equal(r.ok, false);
  assert.match(r.error, /covering/i);
  assert.equal(await otpDestination(env), null, 'no code is issued');
});

test('with no staff_id and no phone it still falls back to the contact on file — old clients keep working', async () => {
  const env = harness();
  await requestIntakeOtp(env, { token: 'tok', name: 'Primary' });
  assert.equal((await otpDestination(env)).phone, PRIMARY);
});

// ---------------------------------------------------------------------------
// Verifying a stand-in: allowed to order, NOT silently authorized
// ---------------------------------------------------------------------------

test('a stand-in who verifies is recorded as PENDING — one order does not make you authorized', async () => {
  const env = harness();
  await requestIntakeOtp(env, { token: 'tok', name: 'Roxana', phone: COVER });
  const rec = await otpDestination(env);
  const v = await verifyIntakeOtp(env, { token: 'tok', code: rec.code });
  assert.equal(v.ok, true);
  assert.equal(v.stand_in, true);
  const added = env.rows.staff.find((s) => s.phone === COVER);
  assert.ok(added, 'they appear on the roster so the owner can see who ordered');
  assert.equal(added.active, 0, 'but inactive — authorizing is a deliberate act');
  assert.equal(added.added_by, 'stand_in');
  assert.ok(env.rows.events.some((e) => e.event === 'verified_stand_in'), 'the audit trail names it');
});

test('a stand-in NEVER replaces the site\'s registered contact', async () => {
  const env = harness();
  await requestIntakeOtp(env, { token: 'tok', name: 'Roxana', phone: COVER });
  const rec = await otpDestination(env);
  assert.equal(rec.enrolled, 0, 'enrolment is only for a site with no contact at all');
  await verifyIntakeOtp(env, { token: 'tok', code: rec.code });
  assert.equal(SITE.contact_phone, PRIMARY, 'the primary contact is who stays on every receipt');
});

test('a wrong code still refuses, and burns an attempt', async () => {
  const env = harness();
  await requestIntakeOtp(env, { token: 'tok', name: 'Roxana', phone: COVER });
  const bad = await verifyIntakeOtp(env, { token: 'tok', code: '000000' });
  assert.equal(bad.ok, false);
  assert.equal((await otpDestination(env)).tries, 1, 'the OTP gate did not move');
});

// ---------------------------------------------------------------------------
// The shared office computer
// ---------------------------------------------------------------------------

test('a trusted device does NOT let one person file an order under another\'s name', async () => {
  // The office shares a browser. The cookie belongs to the DEVICE, not to whoever is sitting at
  // it — so a request that names somebody else must re-verify rather than sail through.
  const env = harness({ devices: [{ id: 'dev1', site_id: 'site_x', phone: PRIMARY, contact_name: 'Primary', revoked: 0 }] });
  const r = await processIntake(env, {
    token: 'tok', count: 23, name: 'Roxana', phone: COVER,
    cookieHeader: 'aintake_site_x=dev1', nowMs: MONDAY_9AM_ET,
  });
  assert.equal(r.needs_verify, true, 'a different person must prove who they are');
  assert.equal((await otpDestination(env)).phone, COVER);
  assert.deepEqual(env.rows.ledger, [], 'and nothing is recorded until they do');
});

test('the trusted device\'s OWN person still gets the one-tap path — no needless code', async () => {
  const env = harness({
    devices: [{ id: 'dev1', site_id: 'site_x', phone: PRIMARY, contact_name: 'Primary', revoked: 0 }],
    staff: [{ id: 'cst_p', site_id: 'site_x', name: 'Primary', phone: PRIMARY, active: 1, is_primary: 1 }],
  });
  const r = await processIntake(env, { token: 'tok', count: 20, name: 'Primary', staff_id: 'cst_p', cookieHeader: 'aintake_site_x=dev1', nowMs: MONDAY_9AM_ET });
  assert.equal(r.ok, true, r.error);
  assert.equal(await otpDestination(env), null, 'picking your own name on your own verified device costs nothing');
});

// ---------------------------------------------------------------------------
// Roster management — who may change the list
// ---------------------------------------------------------------------------

test('only the MAIN contact\'s verified device may change the roster — the link alone is not enough', async () => {
  const noDevice = harness();
  assert.equal((await primaryContactDevice(noDevice, 'tok', '')).ok, false, 'holding the link proves nothing');

  const asStandIn = harness({ devices: [{ id: 'd2', site_id: 'site_x', phone: COVER, revoked: 0 }] });
  const r = await primaryContactDevice(asStandIn, 'tok', 'aintake_site_x=d2');
  assert.equal(r.ok, false, 'a verified non-primary staffer cannot widen who may commit the account to spend');

  const asPrimary = harness({ devices: [{ id: 'd1', site_id: 'site_x', phone: PRIMARY, revoked: 0 }] });
  assert.equal((await primaryContactDevice(asPrimary, 'tok', 'aintake_site_x=d1')).ok, true);
});

test('adding the same number twice updates the person instead of duplicating them', async () => {
  const env = harness();
  await addSiteStaff(env, { site_id: 'site_x', name: 'Roxana', phone: COVER, added_by: 'owner' });
  await addSiteStaff(env, { site_id: 'site_x', name: 'Roxana Diaz', phone: COVER, added_by: 'owner' });
  const list = await listSiteStaff(env, 'site_x');
  assert.equal(list.length, 1, 'one row per number per site — approving a stand-in must not clone them');
  assert.equal(list[0].name, 'Roxana Diaz');
});

test('approving a pending stand-in makes them orderable', async () => {
  const env = harness({ staff: [{ id: 'cst_a', site_id: 'site_x', name: 'Roxana', phone: COVER, active: 0, is_primary: 0 }] });
  assert.equal((await listSiteStaff(env, 'site_x')).length, 0, 'pending people are not in the picker');
  await setStaffActive(env, { staff_id: 'cst_a', active: true });
  assert.equal((await listSiteStaff(env, 'site_x')).length, 1);
});

test('a bad phone is refused rather than stored', async () => {
  const env = harness();
  const r = await addSiteStaff(env, { site_id: 'site_x', name: 'X', phone: 'not a phone' });
  assert.equal(r.ok, false);
  assert.deepEqual(env.rows.staff, []);
});

test('the roster leaves the server MASKED — the intake page is public', async () => {
  const masked = maskSiteStaff([{ id: 'a', name: 'Roxana', phone: COVER, is_primary: 0, active: 1 }]);
  assert.equal(masked[0].phone_hint, '•••• 0199');
  assert.equal(masked[0].phone, undefined, 'a full number returned to a token-only page is readable by anyone forwarded the link');
});

// ---------------------------------------------------------------------------
// Owner override — the control that did not exist
// ---------------------------------------------------------------------------

test('the owner can record a count for a day the office could not submit — and NO text is sent', async () => {
  const env = harness();
  const r = await ownerSetHeadcount(env, {
    site_id: 'site_x', service_date: '2026-08-03', headcount: 23, reason: 'texted by Roxana (accountant)',
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.headcount, 23);
  assert.equal(r.total_cents, 23 * 600 + 2000, '23 × $6.00 + $20 delivery');
  assert.equal(r.sms_sent, false, 'this is the owner correcting his own books, not the client confirming an order');
  assert.equal(env.sms.length, 0);
  assert.equal(env.rows.ledger[0].headcount, 23, 'the billing ledger is written');
  assert.equal(env.rows.orders[0].headcount, 23, 'and the kitchen order');
});

test('a backfilled PAST day lands fulfilled — it must not reappear as work on the kitchen board', async () => {
  const env = harness();
  await ownerSetHeadcount(env, { site_id: 'site_x', service_date: '2020-01-06', headcount: 10, reason: 'backfill' });
  assert.equal(env.rows.orders[0].status, 'fulfilled');
});

test('an override without a stated source is refused', async () => {
  const env = harness();
  const r = await ownerSetHeadcount(env, { site_id: 'site_x', service_date: '2026-08-03', headcount: 23, reason: '  ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /where this count came from/i);
  assert.deepEqual(env.rows.ledger, [], 'nothing is written — six weeks later a reasonless number is indistinguishable from a typo');
});

test('the override writes an audit row that names it, carries the reason, and does not claim verification', async () => {
  const env = harness();
  await ownerSetHeadcount(env, { site_id: 'site_x', service_date: '2026-08-03', headcount: 23, reason: 'texted by Roxana', by: 'Dayan' });
  const ev = env.rows.events.find((e) => e.event === 'owner_override');
  assert.ok(ev, 'a distinct event name, not disguised as a client submission');
  assert.match(ev.notes, /texted by Roxana/);
  assert.equal(ev.verified, 0, 'an override is asserted by the owner, not proven by a code');
  assert.equal(ev.headcount, 23);
});

test('the override ignores the delivery-day and cutoff rules', async () => {
  // Those rules stop a CLIENT ordering into a day we do not serve. They must never stop the owner
  // recording what was actually delivered — 2026-08-08 is a Saturday, and the site runs Mon-Wed.
  const env = harness();
  const r = await ownerSetHeadcount(env, { site_id: 'site_x', service_date: '2026-08-08', headcount: 12, reason: 'special event' });
  assert.equal(r.ok, true, r.error);
});

test('a nonsense date or count is refused', async () => {
  const env = harness();
  assert.equal((await ownerSetHeadcount(env, { site_id: 'site_x', service_date: 'today', headcount: 5, reason: 'x' })).ok, false);
  assert.equal((await ownerSetHeadcount(env, { site_id: 'site_x', service_date: '2026-08-03', headcount: 9999, reason: 'x' })).ok, false);
});

// ---------------------------------------------------------------------------
// Wiring + the migration
// ---------------------------------------------------------------------------

test('the receipt reaches the submitter AND the site primary, de-duplicated', () => {
  const block = LIB.slice(LIB.indexOf('RECEIPT GOES TO BOTH'), LIB.indexOf('return {\n    ok: true, account:'));
  assert.match(block, /new Set\(\[submitterPhone, primaryPhone\]/, 'the ordinary case is still exactly one text');
  assert.match(block, /for \(const to of recipients\)/);
});

test('the endpoints are wired', () => {
  assert.match(OWNER_API, /op === 'set_headcount'/);
  assert.match(OWNER_API, /op === 'add_staff'/);
  assert.match(OWNER_API, /op === 'set_staff_active'/);
  assert.match(STAFF_API, /primaryContactDevice/);
  assert.match(HUB, /op: 'set_headcount'/);
  assert.match(HUB, /op: 'add_staff'/);
  assert.match(INTAKE, /staff_id/, 'the intake page sends the roster pick');
  assert.match(INTAKE, /otherPerson/, 'and offers the covering-for-them path');
});

test('the migration seeds every existing site so no picker is empty after deploy', () => {
  assert.match(MIGRATION, /INSERT OR IGNORE INTO contract_site_staff/);
  assert.match(MIGRATION, /FROM contract_sites s/);
  assert.match(MIGRATION, /WHERE s\.contact_phone IS NOT NULL/);
  assert.match(MIGRATION, /idx_css_site_phone/, 'one row per number per site');
  assert.match(MIGRATION, /'cst_primary_' \|\| s\.id/, 'a derived id, so re-running the migration is a no-op');
});

// ---------------------------------------------------------------------------
// siteContext — what each kind of viewer is allowed to see
// Caught live, after deploy: the manage panel renders an "Allow" button for a pending stand-in,
// but siteContext only ever returned ACTIVE staff and omitted the active flag — so the control
// existed and could never be reached on page load. A half-built feature, found by reading the
// real production response instead of trusting the unit tests.
// ---------------------------------------------------------------------------

test('the MAIN CONTACT sees pending stand-ins — otherwise the Allow button is unreachable', async () => {
  const { siteContext } = await import('../../functions/_lib/contract.js');
  const env = harness({
    devices: [{ id: 'd1', site_id: 'site_x', phone: PRIMARY, revoked: 0 }],
    staff: [
      { id: 'cst_p', site_id: 'site_x', name: 'Primary', phone: PRIMARY, active: 1, is_primary: 1 },
      { id: 'cst_s', site_id: 'site_x', name: 'Stand-in', phone: COVER, active: 0, is_primary: 0, added_by: 'stand_in' },
    ],
  });
  const ctx = await siteContext(env, 'tok', Date.parse('2026-08-03T14:00:00Z'), { cookieHeader: 'aintake_site_x=d1' });
  assert.equal(ctx.can_manage_staff, true);
  const pending = ctx.staff.find((s) => s.id === 'cst_s');
  assert.ok(pending, 'the person awaiting approval must be visible to the person who approves them');
  assert.equal(pending.active, false);
});

test('everyone else sees only who may CURRENTLY order — this page is public', async () => {
  const { siteContext } = await import('../../functions/_lib/contract.js');
  const env = harness({
    staff: [
      { id: 'cst_p', site_id: 'site_x', name: 'Primary', phone: PRIMARY, active: 1, is_primary: 1 },
      { id: 'cst_s', site_id: 'site_x', name: 'Stand-in', phone: COVER, active: 0, is_primary: 0 },
    ],
  });
  const ctx = await siteContext(env, 'tok', Date.parse('2026-08-03T14:00:00Z'), { cookieHeader: '' });
  assert.equal(ctx.can_manage_staff, false);
  assert.deepEqual(ctx.staff.map((s) => s.id), ['cst_p'], 'an unauthorized person’s name is not for whoever holds the link');
  assert.equal(ctx.staff[0].active, undefined, 'and the flag is only meaningful to a manager');
});

// ---------------------------------------------------------------------------
// Invites + the owner's heads-up. Both were missing from the first cut: adding somebody
// authorized them and told them nothing, so they were on the list with no link and no idea.
// ---------------------------------------------------------------------------

test('the invite carries the ordering link and says who added them', async () => {
  const { sendStaffInvite } = await import('../../functions/_lib/contract.js');
  const sent = [];
  const env = {
    APP_BASE_URL: 'https://anejocateringco.com',
    TWILIO_ACCOUNT_SID: 'x', TWILIO_AUTH_TOKEN: 'y', TWILIO_FROM: '+15610000000',
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => { sent.push({ u: String(u), body: String(i && i.body || '') }); return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }); };
  try {
    const r = await sendStaffInvite(env, {
      site: { id: 'site_x', name: 'Pompano Beach', intake_token: 'TOK123' },
      name: 'Roxana', phone: COVER, addedBy: 'Dayan',
    });
    assert.equal(r.sent, true);
    const body = decodeURIComponent(sent[0].body.replace(/\+/g, ' '));
    assert.match(body, /lunch-count\?t=TOK123/, 'without the link they are authorized and have no way in');
    assert.match(body, /Pompano Beach/);
    assert.match(body, /Dayan/, 'an unexplained link from an unknown number reads as a scam');
  } finally { globalThis.fetch = realFetch; }
});

test('no link means no invite is attempted — never a text with a dead URL', async () => {
  const { sendStaffInvite } = await import('../../functions/_lib/contract.js');
  const r = await sendStaffInvite({}, { site: { id: 's', name: 'X' }, phone: COVER });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'no_link');
});

test('adding somebody NEVER sends on its own — only the explicit tick does', () => {
  const LIBSRC = readFileSync(new URL('../../functions/_lib/contract.js', import.meta.url), 'utf8');
  const fn = LIBSRC.slice(LIBSRC.indexOf('export async function addSiteStaff'), LIBSRC.indexOf('function inviteBody'));
  assert.ok(!/sendSms|sendStaffInvite/.test(fn), 'folding the send into the write would make every future caller text a client’s employee');
  const OWNER = readFileSync(new URL('../../functions/api/hub/owner/contracts.js', import.meta.url), 'utf8');
  assert.match(OWNER, /if \(b\.invite\)/, 'the owner route sends only when asked');
  assert.match(STAFF_API, /if \(b\.invite\)/, 'and so does the client route');
});

test('the owner is told when a CLIENT changes their own roster', () => {
  assert.match(STAFF_API, /notifyOwnerRosterChange/);
  assert.match(STAFF_API, /raiseAlert/, 'reuses the existing owner channel rather than inventing one');
  assert.match(STAFF_API, /dedupe_key: `roster:/, 'repeated taps on one row must not stack up alerts');
  // Every mutating branch of the client route reports.
  for (const marker of ["op === 'add'", "op === 'approve' || op === 'remove'"]) {
    const i = STAFF_API.indexOf(marker);
    assert.ok(i > -1, marker);
    assert.match(STAFF_API.slice(i, i + 1400), /notifyOwnerRosterChange/, `${marker} must notify`);
  }
});

test('both UIs offer the tick and default it ON', () => {
  assert.match(HUB, /id="si_'/, 'owner tick-box');
  assert.match(HUB, /invite: invite/);
  assert.match(INTAKE, /id="stInvite" checked/, 'client tick-box, ticked by default');
  assert.match(INTAKE, /invite: !inv \|\| inv\.checked/);
  // The toast must report what happened to the text, not what was requested.
  assert.match(HUB, /the text did not go through/);
});

test('the invite never uses the brand as the person who added you', async () => {
  // The first live invites read "Añejo Catering: Añejo added you to place the lunch order" —
  // the session context has no `name` (contextFromSession: type/role/distinct_id/team/email), so
  // `ctx.name` always fell through to the brand and the one line meant to carry the WHO said
  // nothing. With no name known, the sentence must drop its subject, not repeat the brand.
  const { sendStaffInvite } = await import('../../functions/_lib/contract.js');
  const sent = [];
  const env = { APP_BASE_URL: 'https://x.test', TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b', TWILIO_FROM: '+15610000000' };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => { sent.push(String((i && i.body) || '')); return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }); };
  try {
    await sendStaffInvite(env, { site: { id: 's', name: 'Pompano Beach', intake_token: 'T' }, phone: COVER, addedBy: null });
    const body = decodeURIComponent(sent[0].replace(/\+/g, ' '));
    assert.match(body, /You have been added to place the lunch order/);
    assert.ok(!/Añejo added you/.test(body), body);

    sent.length = 0;
    await sendStaffInvite(env, { site: { id: 's', name: 'Pompano Beach', intake_token: 'T' }, phone: COVER, addedBy: 'Dayan' });
    assert.match(decodeURIComponent(sent[0].replace(/\+/g, ' ')), /Dayan added you/);
  } finally { globalThis.fetch = realFetch; }
});

test('the owner route reads the real staff name, not the session context', () => {
  const OWNER = readFileSync(new URL('../../functions/api/hub/owner/contracts.js', import.meta.url), 'utf8');
  assert.match(OWNER, /async function staffName/);
  assert.match(OWNER, /SELECT name FROM staff WHERE/);
  assert.match(OWNER, /addedBy: await staffName\(env, ctx\)/);
  assert.ok(!/addedBy: \(ctx && ctx\.name\)/.test(OWNER), 'ctx has no name field — reading it silently loses the sender');
});
