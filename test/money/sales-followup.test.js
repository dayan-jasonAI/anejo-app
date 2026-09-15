// The follow-up drafter, the touch log, and the owner's own send button.
//
// What these pin down is the promise the Hub now makes: everything a prospect says reaches one
// place, the next letter is written from that place, and the owner can send it the moment he
// approves it rather than at nine the next morning.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const OWNER_COOKIE_P = import('../helpers/sqlite-d1.js').then((m) => m.OWNER_COOKIE);

const post = async (env, path, body) => {
  const { onRequestPost } = await import(path);
  return onRequestPost({ env, request: new Request('https://anejo.test/api/hub/owner/sales', {
    method: 'POST', headers: { Cookie: await OWNER_COOKIE_P, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) });
};
const SALES = '../../functions/api/hub/owner/sales/index.js';
const OUTREACH = '../../functions/api/hub/owner/sales/outreach.js';

test('the intent is chosen from the record, and what the prospect SAID outranks what we measured', async () => {
  const { chooseIntent } = await import('../../functions/_lib/sales/followup.js');
  const DAY = 86400000;
  const t = Date.parse('2026-09-20T15:00:00Z');

  // Nothing has happened at all.
  assert.equal(chooseIntent({ outreach: [], touches: [], visit: null, last_inbound: null, opportunity: null }, t).key, 'check_in');

  // A visit with no email since it is the clearest signal there is.
  assert.equal(chooseIntent({ outreach: [], touches: [], visit: { at: t - DAY }, last_inbound: null, opportunity: null }, t).key, 'post_visit');

  // They answered. That beats the visit, and it beats any click telemetry.
  assert.equal(chooseIntent({
    outreach: [{ sent_at: t - 3 * DAY, clicked_at: t - 2 * DAY }], touches: [], visit: { at: t - 5 * DAY },
    last_inbound: { at: t - DAY }, opportunity: null,
  }, t).key, 'after_reply');

  // Opened, silent, and long enough ago to be worth one more note.
  assert.equal(chooseIntent({
    outreach: [{ sent_at: t - 3 * DAY, clicked_at: t - 3 * DAY, replied_at: null }], touches: [], visit: null, last_inbound: null, opportunity: null,
  }, t).key, 'viewed_no_reply');

  // Opened three hours ago is not "gone quiet". Chasing that is how you lose a prospect.
  assert.equal(chooseIntent({
    outreach: [{ sent_at: t - 3 * 3600000, clicked_at: t - 3600000, replied_at: null }], touches: [], visit: null, last_inbound: null, opportunity: null,
  }, t).key, 'check_in');
});

test('with no AI available a follow-up is still written, lands in the approval queue, and is editable', async () => {
  const { readyEnv, seedProspect } = await import('../helpers/sales-fixture.js');
  const { env, cfg } = await readyEnv();                         // no ANTHROPIC_API_KEY in the fixture
  const { orgId } = await seedProspect(env, cfg);

  const res = await post(env, OUTREACH, { op: 'draft_followup', organization_id: orgId });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.ok, true);
  assert.equal(out.kind, 'deterministic', 'no key means the deterministic writer, never a silent failure');
  assert.ok(out.outreach_id);

  const { salesRow } = await import('../../functions/_lib/sales/store.js');
  const row = await salesRow(env, 'SELECT * FROM sales_outreach WHERE id = ?', out.outreach_id);
  assert.equal(row.status, 'pending_approval', 'a drafted follow-up is never approved and never sent');
  assert.equal(row.ai_assisted, 0);
  assert.ok(row.body_snapshot.length > 120, 'the fallback writes a real letter, not a stub');
  assert.match(row.body_snapshot, /Añejo Catering Co\./, 'it is signed');
  assert.doesNotMatch(row.body_snapshot, /\$\d/, 'no price appears unless the offer says one may');

  // It reaches the queue the owner already uses, where subject and body are editable.
  const { approvalQueue } = await import('../../functions/_lib/sales/outreach.js');
  assert.ok((await approvalQueue(env)).some((q) => q.id === out.outreach_id), 'it is in the approval queue');

  const edit = await post(env, OUTREACH, { op: 'edit', id: out.outreach_id, subject: 'My own words', body: 'Hello.\n\nMine.\n\nDayan' });
  assert.equal((await edit.json()).ok, true, 'the owner can rewrite every word of it');
  assert.equal((await salesRow(env, 'SELECT subject, edited FROM sales_outreach WHERE id = ?', out.outreach_id)).subject, 'My own words');
});

test('a follow-up refuses politely rather than inventing a way to send', async () => {
  const { readyEnv, seedProspect } = await import('../helpers/sales-fixture.js');
  const { env, cfg } = await readyEnv();

  const noOpp = await seedProspect(env, cfg, { name: 'No Opportunity Clinic', website: 'https://nooppclinic.org/', opportunity: false, email: 'a@nooppclinic.org' });
  let r = await (await post(env, OUTREACH, { op: 'draft_followup', organization_id: noOpp.orgId })).json();
  assert.equal(r.ok, false);
  assert.match(r.error, /no open opportunity/i);

  const noEmail = await seedProspect(env, cfg, { name: 'Unreachable Center', website: 'https://unreachablecenter.org/', email: '', fullName: '' });
  r = await (await post(env, OUTREACH, { op: 'draft_followup', organization_id: noEmail.orgId })).json();
  assert.equal(r.ok, false);
  assert.match(r.error, /can receive email/i);
});

test('a logged reply becomes capacity, stops the sequence, moves the stage and rescores', async () => {
  const { readyEnv, seedProspect } = await import('../helpers/sales-fixture.js');
  const { salesRow, salesRows, scoreAndStore } = await import('../../functions/_lib/sales/store.js');
  const { env, cfg } = await readyEnv();
  const { orgId, oppId } = await seedProspect(env, cfg, { name: 'Bare Bones Counseling', website: 'https://barebonescounseling.org/', signals: false, email: 'admin@barebonescounseling.org' });
  const before = await scoreAndStore(env, orgId, { cfg, ctx: { type: 'staff', distinct_id: 'stf_owner', role: 'owner' } });

  const r = await (await post(env, SALES, {
    op: 'log_touch', organization_id: orgId, channel: 'email_reply', sentiment: 'question',
    summary: 'Asked what it would cost for about 48 people and whether we can do Fridays.',
    asked: 'A price for 48 and Friday availability', headcount: '48', lunch_time: '12:00', stage: 'engaged',
    next_action: 'Send pricing for 48',
  })).json();
  assert.equal(r.ok, true);
  assert.equal(r.capacity_set, true);
  assert.equal(r.stage, 'engaged');
  assert.equal(r.sequence_stopped, true, 'a person answered, so nothing automated keeps talking');

  assert.equal(String((await salesRow(env, 'SELECT employee_or_capacity_hint h FROM sales_organizations WHERE id = ?', orgId)).h), '48');
  const after = await scoreAndStore(env, orgId, { cfg, ctx: { type: 'staff', distinct_id: 'stf_owner', role: 'owner' } });
  assert.ok(after.score > before.score, `what they said moved the score (${before.score} → ${after.score})`);
  const vol = after.criteria.find((x) => x.key === 'volume');
  assert.ok(vol.points > 0, 'a headcount heard on the phone earns the same volume points as one found on a website');

  const acts = await salesRows(env, "SELECT detail_json FROM sales_activity WHERE organization_id = ? AND kind = 'touch'", orgId);
  assert.equal(acts.length, 1);
  const d = JSON.parse(acts[0].detail_json);
  assert.equal(d.channel, 'email_reply');
  assert.equal(d.headcount, 48);
  assert.match(d.summary, /48 people/);

  const opp = await salesRow(env, 'SELECT next_action FROM sales_opportunities WHERE id = ?', oppId);
  assert.match(opp.next_action, /pricing for 48/);
});

test('a touch with nothing said is refused, and an unasked headcount is never a zero', async () => {
  const { readyEnv, seedProspect } = await import('../helpers/sales-fixture.js');
  const { salesRow } = await import('../../functions/_lib/sales/store.js');
  const { env, cfg } = await readyEnv();
  const { orgId } = await seedProspect(env, cfg);

  assert.equal((await post(env, SALES, { op: 'log_touch', organization_id: orgId, channel: 'phone_call' })).status, 400);

  const r = await (await post(env, SALES, {
    op: 'log_touch', organization_id: orgId, channel: 'voicemail', summary: 'Left a voicemail, no detail.',
  })).json();
  assert.equal(r.ok, true);
  assert.equal(r.capacity_set, false);
  assert.ok(!(await salesRow(env, 'SELECT employee_or_capacity_hint h FROM sales_organizations WHERE id = ?', orgId)).h,
    'a question nobody answered stays unanswered');
  assert.equal(r.sequence_stopped, false, 'a voicemail we left is not the prospect answering');
});

test('the owner pressing Send now sends outside the window; the scheduler still does not', async () => {
  const { readyEnv, seedProspect, previewAndApprove, SATURDAY_10AM_ET } = await import('../helpers/sales-fixture.js');
  const { sendApproved, startSequence, inSendWindow } = await import('../../functions/_lib/sales/outreach.js');
  const { env, cfg } = await readyEnv();
  assert.equal(inSendWindow(cfg.send_window, SATURDAY_10AM_ET), false, 'Saturday is outside the window, as designed');

  const { oppId, contactId } = await seedProspect(env, cfg);
  const st = await startSequence(env, { opportunity_id: oppId, contact_id: contactId, cfg, ctx: { type: 'staff', distinct_id: 'stf_owner', role: 'owner' } });
  await previewAndApprove(env, cfg, st.outreach_id);

  // The scheduled pass, on a Saturday: refuses, and says why in words the Hub shows as-is.
  const scheduled = await sendApproved(env, { cfg, atMs: SATURDAY_10AM_ET });
  assert.equal(scheduled.sent, 0);
  assert.match(scheduled.blocked_by.join(' '), /business-hours send window/i);

  // The same moment, owner-initiated: the window is not a reason to make him wait.
  const byHand = await sendApproved(env, { cfg, atMs: SATURDAY_10AM_ET, ignoreWindow: true });
  assert.doesNotMatch(byHand.blocked_by.join(' '), /send window/i, 'the window never blocks a send he pressed himself');
});
