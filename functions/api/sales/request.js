// POST /api/sales/request — a prospect asks for pricing, a tasting, or a call from their landing page.
//
// This is a conversion event, so it does three things and promises nothing:
//   1. records the request against the opportunity (and the person as a contact, email_status
//      'self_provided' — they asked us to write)
//   2. STOPS the automated sequence — the conversation is now a person's, not a cadence's
//   3. raises an owner alert, so a warm lead waits minutes, not until someone opens the Hub
// It sends no email to the prospect (no email leaves the Hub without a human reading it first) and
// quotes no price. The reply comes from the owner.
//
// Public + token-authenticated (the 128-bit landing token), rate-limited, with a honeypot field.
// CSRF: covered by the /api middleware's Origin check; there is no session to ride anyway.
import { json, bad, isEmail } from '../../_lib/util.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { raiseAlert } from '../../_lib/alerts.js';
import { loadSalesConfig } from '../../_lib/sales/config.js';
import { salesRow, addContact, stopSequences, advanceStage, logActivity } from '../../_lib/sales/store.js';

const KINDS = { pricing: 'engaged', call: 'meeting_requested', tasting: 'meeting_requested' };
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'sales_req', limit: 6, windowSec: 600 });
  if (limited) return limited;
  if (!env.DB) return bad('Service unavailable.', 503);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  if (clip(b.website, 200)) return json({ ok: true });   // honeypot: bots fill every field; people never see this one
  const t = clip(b.t, 64);
  if (!/^[a-f0-9]{32}$/.test(t)) return bad('This link is not valid.', 404);
  const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE landing_token = ?', t);
  if (!opp) return bad('This link is not valid.', 404);
  const org = await salesRow(env, 'SELECT id, name, do_not_contact FROM sales_organizations WHERE id = ?', opp.organization_id);
  if (!org) return bad('This link is not valid.', 404);

  const cfg = await loadSalesConfig(env);
  const kind = Object.prototype.hasOwnProperty.call(KINDS, b.kind) ? b.kind : null;
  if (!kind) return bad('Choose what you would like: pricing, a call, or a tasting.');
  if (kind === 'tasting' && !cfg.offer.tasting_enabled) return bad('Tastings are not being scheduled right now — choose pricing or a call.');
  const name = clip(b.name, 80);
  const email = clip(b.email, 160).toLowerCase();
  const phone = clip(b.phone, 30);
  const headcount = b.headcount === '' || b.headcount == null ? null : Math.round(Number(b.headcount));
  const message = clip(b.message, 1000);
  if (!name) return bad('Please add your name.');
  if (!isEmail(email)) return bad('Please add an email address we can reply to.');
  if (headcount != null && (!Number.isFinite(headcount) || headcount < 1 || headcount > 5000)) return bad('Approximate headcount should be a number.');

  const c = await addContact(env, org.id, { full_name: name, email, phone, email_status: 'self_provided', confidence: 'high' }, { source: 'landing_form' });
  const t0 = Date.now();
  const last = await salesRow(env, "SELECT id FROM sales_outreach WHERE opportunity_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1", opp.id);
  if (last) await env.DB.prepare('UPDATE sales_outreach SET replied_at = COALESCE(replied_at, ?), updated_at = ? WHERE id = ?').bind(t0, t0, last.id).run();
  await stopSequences(env, { opportunity_id: opp.id, reason: 'reply' });
  await advanceStage(env, opp.id, KINDS[kind], null);
  await logActivity(env, {
    organization_id: org.id, opportunity_id: opp.id, contact_id: c.ok ? c.contact_id : null, kind: 'prospect_request', actor: 'prospect',
    detail: { kind, name, email, phone: phone || null, headcount, message: message || null },
    event: 'sales.reply_received', props: { source: 'landing_form', kind, has_headcount: headcount != null },
  });
  if (headcount != null && !opp.estimated_meals_per_day) {
    await env.DB.prepare('UPDATE sales_opportunities SET estimated_meals_per_day = ?, updated_at = ? WHERE id = ?').bind(headcount, t0, opp.id).run();
  }
  await raiseAlert(env, {
    alert_type: 'sales_prospect_request', severity: 'warning', team: 'front_office', ref_type: 'sales_opportunity', ref_id: opp.id,
    source: 'sales_os', dedupe_key: `sales_request:${opp.id}:${kind}`,
    title: `${org.name} asked for ${kind === 'pricing' ? 'pricing' : kind === 'tasting' ? 'a tasting' : 'a call'}`,
    body: `${name}${headcount ? ` · about ${headcount} people` : ''}. Their sequence has stopped — reply to them from your own mailbox.`,
    url: '/hub/owner/sales.html#org=' + encodeURIComponent(org.id),
  });
  return json({ ok: true, message: 'Thank you — we have your request, and a person from Añejo will reply to you directly.' });
};
