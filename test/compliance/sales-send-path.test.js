// Sales OS — the compliance properties of the prospect email path. Each test names the rule it pins.
// Real SQLite (every migration), fetch stubbed: nothing here can reach Resend or a real inbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  readyEnv, seedProspect, previewAndApprove, stubFetch, reload, OWNER, TUESDAY_10AM_ET, SATURDAY_10AM_ET,
} from '../helpers/sales-fixture.js';
import { sendEmail } from '../../functions/_lib/email.js';
import { resolveAudience } from '../../functions/_lib/audience.js';
import { setFlag, flagsFrom } from '../../functions/_lib/sales/config.js';
import { addContact, updateContact } from '../../functions/_lib/sales/store.js';
import {
  startSequence, previewOutreach, approveOutreach, sendApproved, renderOutreachEmail, markReplied, draftDueFollowups,
  applyProviderEvent, editOutreach,
} from '../../functions/_lib/sales/outreach.js';
import { onRequestGet as unsubGet, onRequestPost as unsubPost } from '../../functions/api/sales/unsubscribe.js';
import { onRequestPost as requestPost } from '../../functions/api/sales/request.js';

const LIB = new URL('../../functions/_lib/sales/', import.meta.url);

async function drafted(opts) {
  const { env, cfg } = await readyEnv(opts);
  const p = await seedProspect(env, cfg);
  const s = await startSequence(env, { opportunity_id: p.oppId, cfg, ctx: OWNER });
  assert.equal(s.ok, true, s.error);
  return { env, cfg, ...p, outreachId: s.outreach_id };
}

// ---------------------------------------------------------------- the shared sender stays unchanged

test('sendEmail without from/replyTo sends the body it always sent — existing campaigns are unaffected', async () => {
  const f = stubFetch();
  try {
    await sendEmail({ RESEND_API_KEY: 'k' }, { to: 'a@b.co', subject: 'S', html: '<p>x</p>', text: 'x', unsubscribeUrl: 'https://u' });
    const body = f.calls[0].body;
    assert.deepEqual(Object.keys(body), ['from', 'to', 'subject', 'html', 'text', 'headers']);
    assert.equal(body.from, 'Añejo Catering Co. <noreply@anejocateringco.com>');
    assert.equal('reply_to' in body, false);
  } finally { f.restore(); }
});

test('sendEmail sets from and reply_to only when a caller passes them (the Sales path does)', async () => {
  const f = stubFetch();
  try {
    await sendEmail({ RESEND_API_KEY: 'k' }, { to: 'a@b.co', subject: 'S', html: 'h', from: 'Dayan <d@anejocateringco.com>', replyTo: 'D@AnejoCateringCo.com' });
    assert.equal(f.calls[0].body.from, 'Dayan <d@anejocateringco.com>');
    assert.deepEqual(f.calls[0].body.reply_to, ['d@anejocateringco.com']);
  } finally { f.restore(); }
});

// ---------------------------------------------------------------- CAN-SPAM structure

test('every prospect email carries identification, a working opt-out and the postal address — in text AND html, whatever the body says', () => {
  for (const body of ['Hello', '', 'I removed the footer myself.']) {
    const r = renderOutreachEmail({ subject: 's', body, unsubUrl: 'https://anejocateringco.com/api/sales/unsubscribe?t=abc', postal: '1 Main St, Boca Raton, FL 33432', orgName: 'Clinic', areaLabel: 'Palm Beach' });
    for (const part of [r.text, r.html]) {
      assert.match(part, /business solicitation/i);
      assert.match(part, /api\/sales\/unsubscribe\?t=abc/);
      assert.match(part, /1 Main St, Boca Raton, FL 33432/);
    }
  }
});

test('the unsubscribe link carries a random token, never the address', async () => {
  const { env, cfg, outreachId } = await drafted();
  const p = await previewOutreach(env, outreachId, { cfg });
  const link = p.text.match(/https:\/\/\S+\/api\/sales\/unsubscribe\?t=\S+/)[0];
  assert.doesNotMatch(link, /@|%40/);
  assert.match(link, /t=[a-f0-9]{32}$/);
});

test('the sent message carries List-Unsubscribe + one-click headers, the owner’s From and Reply-To', async () => {
  const { env, cfg, outreachId } = await drafted();
  await previewAndApprove(env, cfg, outreachId);
  const f = stubFetch();
  try {
    const r = await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET });
    assert.equal(r.sent, 1, JSON.stringify(r));
    const b = f.calls[0].body;
    assert.match(b.headers['List-Unsubscribe'], /^<https:\/\/anejocateringco\.com\/api\/sales\/unsubscribe\?t=[a-f0-9]{32}>$/);
    assert.equal(b.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.equal(b.from, 'Dayan at Añejo <dayan@anejocateringco.com>');
    assert.deepEqual(b.reply_to, ['dayan@anejocateringco.com']);
    assert.deepEqual(b.to, ['mruiz@sunriserecovery.org']);
  } finally { f.restore(); }
});

// ---------------------------------------------------------------- the approval law

test('no send without approval: a pending draft is never sent, however many ticks run', async () => {
  const { env, cfg } = await drafted();
  const f = stubFetch();
  try {
    for (let i = 0; i < 3; i++) assert.equal((await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET })).sent, 0);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});

test('approval requires the hash of the preview the owner saw; a stale or missing preview is refused', async () => {
  const { env, cfg, outreachId } = await drafted();
  const none = await approveOutreach(env, outreachId, { cfg, ctx: OWNER });
  assert.equal(none.ok, false);
  assert.equal(none.code, 'stale_preview');
  const p = await previewOutreach(env, outreachId, { cfg });
  const changed = await approveOutreach(env, outreachId, { cfg, body: 'Different words.', render_hash: p.render_hash, ctx: OWNER });
  assert.equal(changed.ok, false, 'approving text that is not the previewed text is refused');
  assert.equal(changed.code, 'stale_preview');
  // The same text with a textarea's trailing newline is the same email.
  const p2 = await previewOutreach(env, outreachId, { cfg, body: 'Different words.\n' });
  const ok = await approveOutreach(env, outreachId, { cfg, body: 'Different words.\n\n', render_hash: p2.render_hash, ctx: OWNER });
  assert.equal(ok.ok, true, ok.error);
});

test('approval needs a signed-in owner identity', async () => {
  const { env, cfg, outreachId } = await drafted();
  const p = await previewOutreach(env, outreachId, { cfg });
  assert.equal((await approveOutreach(env, outreachId, { cfg, render_hash: p.render_hash, ctx: null })).ok, false);
});

test('flagged claims block approval unless the owner explicitly acknowledges them — and the acknowledgement is recorded', async () => {
  const { env, cfg, outreachId } = await drafted();
  const body = 'We can do lunches at $9 per meal, and the first week is free.';
  const r = await previewAndApprove(env, cfg, outreachId, { body });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'flags');
  assert.ok(r.flags.some((f) => f.type === 'price'));
  assert.ok(r.flags.some((f) => f.type === 'offer'));
  const ok = await previewAndApprove(env, cfg, outreachId, { body, acknowledge: true });
  assert.equal(ok.ok, true);
  const row = env.DB.one('SELECT flags_acknowledged, edited FROM sales_outreach WHERE id = ?', outreachId);
  assert.equal(row.flags_acknowledged, 1);
  assert.equal(row.edited, 1);
});

test('the auto-send and approval-required flags are LOCKED in this build — a settings write cannot remove the gate', async () => {
  const { env } = await readyEnv();
  for (const [k, v] of [['sales.auto_send_enabled', true], ['sales.owner_approval_required', false], ['sales.voice_enabled', true]]) {
    const r = await setFlag(env, k, v, 'stf_owner');
    assert.equal(r.ok, false, `${k} must refuse`);
    assert.equal(r.locked, true);
  }
  // Even a row written straight into app_settings is ignored for a locked flag.
  const flags = flagsFrom(new Map([['sales.auto_send_enabled', 'true'], ['sales.owner_approval_required', 'false']]));
  assert.equal(flags['sales.auto_send_enabled'], false);
  assert.equal(flags['sales.owner_approval_required'], true);
});

// ---------------------------------------------------------------- suppression, checked at every door

for (const [label, seed] of [
  ['a prospect unsubscribe', (env) => env.DB.sqlite.prepare("INSERT INTO sales_unsubscribes (id,email,channel,source,created_at) VALUES ('u1','mruiz@sunriserecovery.org','email','link',1)").run()],
  ['an Añejo marketing unsubscribe', (env) => env.DB.sqlite.prepare("INSERT INTO campaign_unsubscribes (id,email,channel,source,created_at) VALUES ('u2','MRuiz@SunriseRecovery.org','all','link',1)").run()],
  ['a bounce/complaint suppression', (env) => env.DB.sqlite.prepare("INSERT INTO email_suppressions (email,reason,created_at,updated_at) VALUES ('mruiz@sunriserecovery.org','complained',1,1)").run()],
]) {
  test(`${label} blocks approval of a draft to that address`, async () => {
    const { env, cfg, outreachId } = await drafted();
    seed(env);
    const r = await previewAndApprove(env, cfg, outreachId);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'suppressed');
  });
  test(`${label} that lands AFTER approval still stops the send — checked immediately before delivery`, async () => {
    const { env, cfg, outreachId } = await drafted();
    assert.equal((await previewAndApprove(env, cfg, outreachId)).ok, true);
    seed(env);
    const f = stubFetch();
    try {
      const r = await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET });
      assert.equal(r.sent, 0);
      assert.equal(f.calls.length, 0);
      assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', outreachId).status, 'skipped');
    } finally { f.restore(); }
  });
}

test('a link scanner’s GET of the unsubscribe link changes NOTHING — it only shows the one-button page', async () => {
  const { env, outreachId, contactId, oppId } = await drafted();
  const token = env.DB.one('SELECT unsub_token FROM sales_outreach WHERE id = ?', outreachId).unsub_token;
  const res = await unsubGet({ request: new Request(`https://anejocateringco.com/api/sales/unsubscribe?t=${token}`), env });
  assert.equal(res.status, 200);
  assert.match(await res.text(), new RegExp(`<form method="post" action="/api/sales/unsubscribe\\?t=${token}">`));
  assert.equal(env.DB.one('SELECT suppressed FROM sales_contacts WHERE id = ?', contactId).suppressed, 0);
  assert.equal(env.DB.one('SELECT status FROM sales_enrollments WHERE opportunity_id = ?', oppId).status, 'active');
  assert.equal(env.DB.rows('SELECT * FROM sales_unsubscribes').length, 0);
});

test('the unsubscribe button and RFC 8058 one-click POST suppress the address everywhere and stop the sequence at once', async () => {
  for (const body of ['confirm=1', 'List-Unsubscribe=One-Click']) {
    const { env, cfg, outreachId, oppId, contactId } = await drafted();
    const token = env.DB.one('SELECT unsub_token FROM sales_outreach WHERE id = ?', outreachId).unsub_token;
    const req = new Request(`https://anejocateringco.com/api/sales/unsubscribe?t=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const res = await unsubPost({ request: req, env });
    assert.equal(res.status, 200);
    if (body === 'confirm=1') assert.match(await res.text(), /You’re unsubscribed/);
    else assert.equal(await res.text(), 'unsubscribed');
    assert.equal(env.DB.one('SELECT suppressed, marketing_email_allowed FROM sales_contacts WHERE id = ?', contactId).suppressed, 1);
    assert.equal(env.DB.one('SELECT status FROM sales_enrollments WHERE opportunity_id = ?', oppId).status, 'stopped');
    assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', outreachId).status, 'canceled');
    assert.equal(env.DB.rows("SELECT * FROM sales_unsubscribes WHERE email = 'mruiz@sunriserecovery.org'").length, 1);
    assert.equal((await previewAndApprove(env, cfg, outreachId)).ok, false);
  }
});

test('an unknown unsubscribe token says so and changes nothing', async () => {
  const { env } = await drafted();
  const res = await unsubGet({ request: new Request('https://x.test/api/sales/unsubscribe?t=' + 'a'.repeat(32)), env });
  assert.equal(res.status, 404);
  assert.equal(env.DB.rows('SELECT * FROM sales_unsubscribes').length, 0);
});

test('a hard bounce or complaint from Resend suppresses the contact and stops their sequence', async () => {
  const { env, cfg, outreachId, contactId, oppId } = await drafted();
  await previewAndApprove(env, cfg, outreachId);
  const f = stubFetch(() => new Response(JSON.stringify({ id: 'em_bounce_me' }), { status: 200 }));
  try { await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET }); } finally { f.restore(); }
  assert.equal(await applyProviderEvent(env, { type: 'email.bounced', email_id: 'em_bounce_me' }), true);
  const c = env.DB.one('SELECT suppressed, email_status FROM sales_contacts WHERE id = ?', contactId);
  assert.equal(c.suppressed, 1);
  assert.equal(c.email_status, 'bounced');
  assert.equal(env.DB.one('SELECT status, stop_reason FROM sales_enrollments WHERE opportunity_id = ?', oppId).stop_reason, 'bounce');
  assert.equal(await applyProviderEvent(env, { type: 'email.bounced', email_id: 'not-a-sales-email' }), false, 'a non-sales message matches nothing');
});

// ---------------------------------------------------------------- consent: SMS and voice

test('a cold prospect is NOT admitted to marketing SMS or voice by a discovered phone number', async () => {
  const { env, cfg } = await readyEnv();
  const { orgId } = await seedProspect(env, cfg);
  const c = await addContact(env, orgId, { full_name: 'Front Desk', phone: '(561) 555-0199', email: 'office@sunriserecovery.org' }, { source: 'website', source_url: 'https://sunriserecovery.org/contact' });
  const row = env.DB.one('SELECT marketing_sms_allowed, voice_allowed FROM sales_contacts WHERE id = ?', c.contact_id);
  assert.equal(row.marketing_sms_allowed, 0);
  assert.equal(row.voice_allowed, 0);
  const up = await updateContact(env, c.contact_id, { marketing_sms_allowed: true }, { ctx: OWNER });
  assert.equal(up.ok, false, 'the Hub cannot switch SMS on for a prospect');
  // Prospects live in their own domain: Broadcast's audiences never see them, on any channel.
  for (const channel of ['sms', 'email']) {
    const a = await resolveAudience(env, { segment: 'all', channel });
    assert.ok(!a.recipients.some((r) => /555.?0199|sunriserecovery/.test(r.address)), `prospect leaked into Broadcast (${channel})`);
  }
});

test('transactional SMS consent is never read by the Sales OS, and it has no SMS or voice send path at all', () => {
  for (const f of readdirSync(LIB).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(new URL(f, LIB), 'utf8');
    assert.doesNotMatch(src, /\bsms_consent\b|marketing_sms_consent/, `${f} must not read customer SMS consent`);
    assert.doesNotMatch(src, /sendSms|sendWhatsApp|twilio/i, `${f} must not import an SMS/voice sender`);
  }
});

// ---------------------------------------------------------------- send gates

test('nothing sends outside the business-hours window, without a real postal address, an unconfirmed offer, or a reply-to', async () => {
  const cases = [
    [{}, SATURDAY_10AM_ET, /window/i],
    [{ postal: '' }, TUESDAY_10AM_ET, /postal address/i],
    [{ offer: { confirmed: false } }, TUESDAY_10AM_ET, /offer/i],
    [{ sender: { reply_to: '' } }, TUESDAY_10AM_ET, /Reply-To/i],
    [{ emailEnabled: false }, TUESDAY_10AM_ET, /switched off/i],
  ];
  for (const [opts, at, why] of cases) {
    const { env, cfg, outreachId } = await drafted(opts);
    const p = await previewAndApprove(env, cfg, outreachId);
    assert.equal(p.ok, true, 'approval itself is allowed — it queues');
    const f = stubFetch();
    try {
      const r = await sendApproved(env, { cfg, atMs: at });
      assert.equal(r.sent, 0);
      assert.ok(r.blocked_by.some((x) => why.test(x)), `expected a reason matching ${why}: ${JSON.stringify(r.blocked_by)}`);
      assert.equal(f.calls.length, 0);
    } finally { f.restore(); }
  }
});

test('the daily cap holds across ticks', async () => {
  const { env } = await readyEnv({ flags: { 'sales.max_emails_per_day': 1 } });
  let cfg = await reload(env);
  const a = await seedProspect(env, cfg);
  const b = await seedProspect(env, cfg, { name: 'Harbor Day Program', website: 'https://harbordayprogram.org/', email: 'director@harbordayprogram.org', fullName: 'Leo Grant', street: '9 Ocean Ave' });
  for (const p of [a, b]) {
    const s = await startSequence(env, { opportunity_id: p.oppId, cfg, ctx: OWNER });
    await previewAndApprove(env, cfg, s.outreach_id);
  }
  cfg = await reload(env);
  const f = stubFetch();
  try {
    assert.equal((await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET })).sent, 1);
    const second = await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET + 3600000 });
    assert.equal(second.sent, 0);
    assert.ok(second.blocked_by.some((x) => /cap/i.test(x)));
    assert.equal(f.calls.length, 1);
  } finally { f.restore(); }
});

// ---------------------------------------------------------------- stop on reply

test('stop-on-reply: once a reply is marked, no further step is drafted or sent', async () => {
  const { env, cfg, outreachId, oppId } = await drafted();
  await previewAndApprove(env, cfg, outreachId);
  const f = stubFetch();
  try { await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET }); } finally { f.restore(); }
  const enr = env.DB.one('SELECT * FROM sales_enrollments WHERE opportunity_id = ?', oppId);
  assert.ok(enr.next_step_at > TUESDAY_10AM_ET, 'step 2 is scheduled after step 1 sends');
  const r = await markReplied(env, { opportunity_id: oppId, sentiment: 'positive', ctx: OWNER });
  assert.equal(r.ok, true);
  assert.equal(env.DB.one('SELECT status, stop_reason FROM sales_enrollments WHERE opportunity_id = ?', oppId).stop_reason, 'reply');
  const d = await draftDueFollowups(env, { cfg, atMs: TUESDAY_10AM_ET + 30 * 86400000 });
  assert.equal(d.drafted, 0);
  assert.equal(env.DB.rows('SELECT id FROM sales_outreach WHERE opportunity_id = ?', oppId).length, 1, 'only step 1 exists');
});

test('a reply that arrives while a follow-up is APPROVED cancels it before it can go', async () => {
  const { env, cfg, outreachId, oppId } = await drafted();
  await previewAndApprove(env, cfg, outreachId);
  let f = stubFetch();
  try { await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET }); } finally { f.restore(); }
  const d = await draftDueFollowups(env, { cfg, atMs: TUESDAY_10AM_ET + 4 * 86400000 });
  assert.equal(d.drafted, 1);
  const step2 = env.DB.one('SELECT id FROM sales_outreach WHERE opportunity_id = ? AND step_number = 2', oppId).id;
  await previewAndApprove(env, cfg, step2);
  await markReplied(env, { opportunity_id: oppId, ctx: OWNER });
  f = stubFetch();
  try {
    assert.equal((await sendApproved(env, { cfg, atMs: TUESDAY_10AM_ET + 5 * 86400000 })).sent, 0);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', step2).status, 'canceled');
});

test('a request from the landing page stops the sequence, raises an owner alert, and emails nobody', async () => {
  const { env, oppId } = await drafted();
  const token = env.DB.one('SELECT landing_token FROM sales_opportunities WHERE id = ?', oppId).landing_token;
  const f = stubFetch();
  try {
    const res = await requestPost({ env, request: new Request('https://anejocateringco.com/api/sales/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token, kind: 'pricing', name: 'Maria Ruiz', email: 'mruiz@sunriserecovery.org', headcount: '45' }),
    }) });
    assert.equal(res.status, 200);
    assert.equal(f.calls.length, 0, 'no email is sent to the prospect by the system');
  } finally { f.restore(); }
  assert.equal(env.DB.one('SELECT status FROM sales_enrollments WHERE opportunity_id = ?', oppId).status, 'stopped');
  assert.equal(env.DB.one('SELECT stage FROM sales_opportunities WHERE id = ?', oppId).stage, 'engaged');
  assert.equal(env.DB.rows("SELECT * FROM alerts WHERE alert_type = 'sales_prospect_request'").length, 1);
});

test('a tasting cannot be requested while the tasting offer is off', async () => {
  const { env, oppId } = await drafted();
  const token = env.DB.one('SELECT landing_token FROM sales_opportunities WHERE id = ?', oppId).landing_token;
  const res = await requestPost({ env, request: new Request('https://anejocateringco.com/api/sales/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: token, kind: 'tasting', name: 'M', email: 'm@sunriserecovery.org' }),
  }) });
  assert.equal(res.status, 400);
});

test('an edit saved without approval stays a draft and is flag-checked', async () => {
  const { env, cfg, outreachId } = await drafted();
  const r = await editOutreach(env, outreachId, { subject: 'Scheduled meals', body: 'Our food cures stress.', cfg, ctx: OWNER });
  assert.ok(r.flags.some((f) => f.type === 'health'));
  assert.equal(env.DB.one('SELECT status FROM sales_outreach WHERE id = ?', outreachId).status, 'pending_approval');
});
