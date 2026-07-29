// /api/hub/owner/campaigns — the broadcast desk (owner-only).
//   GET                                → campaigns (newest first) + segment metadata + channel readiness
//   POST { op:'preview', segment, channel }        → who a segment resolves to, and who it EXCLUDES and why
//   POST { op:'save', id?, name, subject, body, segment, channel } → upsert a DRAFT
//   POST { op:'send', id, expect? }    → freeze the audience, then send in resumable batches
//
// Two rules shape every line below.
//   1. CONSENT IS PER-CHANNEL. `sms_consent` was collected with wording about order and delivery
//      updates — transactional. A promotional text needs its own express opt-in ($500–$1,500 per
//      message per recipient under the TCPA), so SMS audiences come only from
//      `marketing_sms_consent`, which _lib/audience.js already enforces. This file never widens it.
//   2. EVERY MARKETING EMAIL CARRIES AN EXIT. CAN-SPAM requires a working opt-out and a physical
//      address in the message itself, and Gmail/Yahoo bulk rules require one-click
//      List-Unsubscribe. Both are unconditional here — there is no code path that sends marketing
//      mail without them, because the day a rushed send skips it is the day the sending domain
//      that also carries receipts and magic links starts landing in spam.
import { json, bad, id, now, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { sendEmail, emailShell, escHtml } from '../../../_lib/email.js';
import { sendSms, isTwilioConfigured } from '../../../_lib/twilio.js';
import { SEGMENTS, isSegment, resolveAudience, testRecipients } from '../../../_lib/audience.js';
import { renderTemplate, ensureCompliance, sanitizeTemplate, htmlToText, templateAudit } from '../../../_lib/email-template.js';

// A Worker has a wall-clock budget. A 500-recipient campaign therefore cannot be one request —
// it is many small ones, each resumable, driven by the page. Half-sent-and-lost is the failure
// mode these two numbers exist to prevent.
const BATCH = 25;
const TIME_BUDGET_MS = 15000;

// CAN-SPAM requires a valid PHYSICAL POSTAL ADDRESS in every marketing message — a street address
// or a registered PO/private mailbox. "Palm Beach County, FL" is a service area, not an address, so
// it does not satisfy the requirement; the owner sets the real one in the HUB and it is read from
// there. Falling back to a service area is better than an empty footer, but it is a fallback.
const ADDRESS_FALLBACK = 'Añejo Catering Co. · Palm Beach County, FL';

async function addressLine(env) {
  try {
    const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key='campaign.postal_address'").first();
    const v = String((r && r.value) || '').trim();
    if (v) return v;
  } catch { /* fall through */ }
  return ADDRESS_FALLBACK;
}
const SMS_OPT_OUT = 'Reply STOP to opt out.';

// ---------- message rendering ----------

// Owner-typed plain text → email HTML. Escaped FIRST: the body comes out of a browser field and
// must never be able to inject markup into what lands in a customer's inbox.
function bodyHtml(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<p>${escHtml(b).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// The compliance footer. The unsubscribe link and the postal address travel together with the
// copy rather than relying on a shared template someone might restyle later — so the shell's own
// footer is suppressed for marketing mail (emailShell(..., {footer:false})) and this is the single
// place the address appears.
function marketingFooter(unsubUrl, addr) {
  return `<div style="margin-top:26px;padding-top:16px;border-top:1px solid #e6e1d4;font-size:12px;color:#8a8a8a;line-height:1.7">
    You're receiving this because you ordered from Añejo or asked us to keep you posted.
    <a href="${escHtml(unsubUrl)}" style="color:#8B6B3E">Unsubscribe from marketing email</a>.<br>
    ${escHtml(addr || ADDRESS_FALLBACK)}
  </div>`;
}

// The same two facts, for a designed template. A separate block because the plain-text footer
// above assumes the Añejo shell's cream card: dropped under an owner's artwork it could be grey
// text on a background of any colour, including its own. This one carries its own light band, so
// it stays legible no matter what it lands beneath — which is the point of a legal notice.
//
// It is what an owner AVOIDS by putting {{unsubscribe_url}} and {{postal_address}} in their own
// footer, and the HUB tells them so before they send.
function appendedHtmlFooter(unsubUrl, addr) {
  // The band is set FOUR ways on purpose. Outlook ignores CSS `background` on a table, and if the
  // band silently fails to paint, #5b5b5b text lands on whatever the template's body colour is —
  // on the dark template that prompted this feature, that is near-black on near-black. An
  // unreadable opt-out is legally the same as no opt-out, so the colour is carried by the bgcolor
  // ATTRIBUTE (which every client honours) as well as by CSS, on both the table and the cell.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f2ec" style="background:#f4f2ec;border-collapse:collapse;"><tr><td align="center" bgcolor="#f4f2ec" style="background:#f4f2ec;padding:22px 18px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.75;color:#5b5b5b;">
    You're receiving this because you ordered from Añejo or asked us to keep you posted.<br>
    <a href="${escHtml(unsubUrl)}" style="color:#8B6B3E">Unsubscribe from marketing email</a><br>
    ${escHtml(addr || ADDRESS_FALLBACK)}
  </td></tr></table>`;
}

// One place decides what a campaign actually looks like on the wire, so the plain and template
// paths cannot drift apart on the thing they must agree about: the exit.
export function renderCampaignEmail({ body, format, unsubUrl, postal, name, address }) {
  if (format !== 'html') {
    return { html: emailShell(bodyHtml(body) + marketingFooter(unsubUrl, postal), { footer: false }), text: null, footerAppended: true };
  }
  const raw = sanitizeTemplate(body);
  const rendered = renderTemplate(raw, {
    unsubscribe_url: unsubUrl,
    postal_address: postal,
    name: name || '',
    first_name: String(name || '').trim().split(/\s+/)[0] || '',
    email: address || '',
  });
  const { html, footerAppended } = ensureCompliance(rendered, { rawTemplate: raw, footerHtml: appendedHtmlFooter(unsubUrl, postal) });
  // Derived from the FINAL html, so the text part carries the unsubscribe link too — for a client
  // that shows text/plain, that link is the only exit there is.
  return { html, text: htmlToText(html), footerAppended };
}

function unsubscribeUrlFor(base, address) {
  return `${base}/api/unsubscribe?a=${encodeURIComponent(address)}&c=email`;
}

// Every marketing SMS must tell the recipient how to stop. Appended rather than assumed, and
// only when the owner hasn't already written it, so the copy never says it twice.
function smsBody(text) {
  const b = String(text == null ? '' : text).trim();
  return /reply\s+stop/i.test(b) ? b : `${b}\n\n${SMS_OPT_OUT}`;
}

// ---------- GET ----------
export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let campaigns = [];
  try {
    const r = await env.DB.prepare(
      `SELECT c.id, c.channel, c.name, c.subject, c.body, c.body_format, c.segment, c.status, c.recipients,
              c.sent_count, c.failed_count, c.created_by, c.created_at, c.updated_at, c.sent_at,
              (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id=c.id AND s.status='queued')  AS queued,
              (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id=c.id AND s.status='skipped') AS skipped
         FROM campaigns c ORDER BY c.created_at DESC LIMIT 100`
    ).all();
    campaigns = (r && r.results) || [];
  } catch { campaigns = []; }

  return json({
    ok: true,
    campaigns,
    segments: Object.keys(SEGMENTS).map((k) => ({ key: k, label: SEGMENTS[k].label, why: SEGMENTS[k].why })),
    test_recipients: (await testRecipients(env)).join(', '),
    postal_address: await addressLine(env),
    postal_is_fallback: (await addressLine(env)) === ADDRESS_FALLBACK,
    email_ready: !!env.RESEND_API_KEY,
    sms_ready: isTwilioConfigured(env),
  });
};

// ---------- POST ----------
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || '';
  const t = now();

  // --- Who would actually receive this, and who would not.
  // The skipped breakdown is the whole point of this op. A segment that silently shrinks is how
  // an owner ends up believing they reached an audience they never touched.
  if (op === 'set_postal_address') {
    const v = String((b && b.value) || '').trim().slice(0, 160);
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('campaign.postal_address',?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(v, ctx.distinct_id || null, now()).run();
    return json({ ok: true, postal_address: v });
  }

  if (op === 'set_test_recipients') {
    const raw = String((b && b.value) || '');
    const list = raw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5);
    // NB: not named `bad` — that is the imported error helper, and shadowing it here would turn
    // `return bad(...)` into calling an array.
    const invalid = list.filter((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x) && !/^[+0-9()\-\s]{7,}$/.test(x));
    if (invalid.length) return bad(`Not a valid email or phone: ${invalid[0]}`);
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('campaign.test_recipients',?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(list.join(','), ctx.distinct_id || null, now()).run();
    return json({ ok: true, test_recipients: list.join(', ') });
  }

  if (op === 'preview') {
    const segment = (b.segment || '').toString();
    const channel = b.channel === 'sms' ? 'sms' : 'email';
    if (!isSegment(segment)) return bad('Pick a segment.');

    const a = await resolveAudience(env, { segment, channel });
    const bySource = {};
    for (const r of a.recipients) bySource[r.source] = (bySource[r.source] || 0) + 1;
    const excluded = a.skipped.no_consent + a.skipped.unsubscribed + a.skipped.no_address;

    return json({
      ok: true, segment, channel,
      count: a.recipients.length,
      by_source: bySource,
      skipped: a.skipped,
      excluded,
      evaluated: a.recipients.length + excluded,   // people considered, before de-duplication
      channel_ready: channel === 'sms' ? isTwilioConfigured(env) : !!env.RESEND_API_KEY,
    });
  }

  // --- Upsert a draft. Drafts only: see the guard below.
  if (op === 'save') {
    const channel = b.channel === 'sms' ? 'sms' : 'email';
    const segment = (b.segment || '').toString();
    if (!isSegment(segment)) return bad('Pick a segment.');
    const name = (b.name || '').toString().trim().slice(0, 120);
    if (!name) return bad('Give the campaign a name.');
    const body = (b.body || '').toString().trim();
    if (!body) return bad('Write the message.');
    const subject = (b.subject || '').toString().trim().slice(0, 200);
    if (channel === 'email' && !subject) return bad('An email campaign needs a subject line.');
    // SMS has no HTML. Silently storing 'html' on an SMS campaign would put a format on a row that
    // can never honour it, and the send path would have to guess later.
    const format = channel === 'email' && b.body_format === 'html' ? 'html' : 'text';

    const cid = (b.id || '').toString().trim();
    if (cid) {
      const row = await env.DB.prepare('SELECT status FROM campaigns WHERE id=?').bind(cid).first();
      if (!row) return bad('Campaign not found.', 404);
      // Editing a campaign that has gone out rewrites history: the copy in the database would no
      // longer be the copy sitting in people's inboxes, and that record is the defence if anyone
      // ever asks what was sent.
      if (row.status !== 'draft') {
        return bad('That campaign has already gone out — start a new draft instead of editing it.', 409);
      }
      await env.DB.prepare(
        'UPDATE campaigns SET channel=?, name=?, subject=?, body=?, body_format=?, segment=?, updated_at=? WHERE id=?'
      ).bind(channel, name, subject || null, body, format, segment, t, cid).run();
      return json({ ok: true, id: cid, body_format: format, audit: format === 'html' ? templateAudit(body) : null });
    }

    const nid = id('cmp');
    await env.DB.prepare(
      `INSERT INTO campaigns (id, channel, name, subject, body, body_format, segment, status, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,'draft',?,?,?)`
    ).bind(nid, channel, name, subject || null, body, format, segment, ctx.email || ctx.distinct_id || null, t, t).run();
    return json({ ok: true, id: nid, body_format: format, audit: format === 'html' ? templateAudit(body) : null });
  }

  // --- Send (or resume sending).
  if (op === 'send') {
    const cid = (b.id || '').toString().trim();
    if (!cid) return bad('Missing campaign.');
    const c = await env.DB.prepare('SELECT * FROM campaigns WHERE id=?').bind(cid).first();
    if (!c) return bad('Campaign not found.', 404);
    if (c.status === 'sent') return bad('That campaign has already been sent.', 409);
    if (c.status === 'canceled') return bad('That campaign was canceled.', 409);

    const channel = c.channel === 'sms' ? 'sms' : 'email';
    // Refuse loudly rather than marking a whole audience 'failed' one address at a time.
    if (channel === 'email' && !env.RESEND_API_KEY) return bad('Email is not configured (RESEND_API_KEY).', 503);
    if (channel === 'sms' && !isTwilioConfigured(env)) return bad('SMS is not configured (Twilio).', 503);

    // FIRST invocation only: freeze the audience into campaign_sends. Every later batch works
    // from those rows, never from a re-resolved query that could have grown or shrunk underneath
    // the send — and UNIQUE(campaign_id,address) means a retry can never add someone twice.
    if (c.status === 'draft') {
      const a = await resolveAudience(env, { segment: c.segment, channel });
      if (!a.recipients.length) return bad('Nobody in that segment is reachable on this channel right now.', 409);

      // The owner confirmed a number on screen. If the audience moved between preview and send,
      // stop — "I thought I was mailing 40 people" is exactly the mistake worth one extra click.
      const expect = Number(b.expect);
      if (Number.isFinite(expect) && expect !== a.recipients.length) {
        return bad(
          `The audience changed since you previewed it — it is ${a.recipients.length} now, not ${expect}. Preview again, then send.`,
          409
        );
      }

      // Claim the campaign, and only from 'draft'. Two clicks race here; exactly one of them
      // changes a row, and the loser is told so instead of starting a second send.
      const claim = await env.DB.prepare(
        "UPDATE campaigns SET status='sending', recipients=?, updated_at=? WHERE id=? AND status='draft'"
      ).bind(a.recipients.length, t, cid).run();
      if (!claim.meta || claim.meta.changes !== 1) return bad('That campaign is already sending.', 409);

      // Every recipient MUST carry `address` — see the contract on resolveAudience. A segment that
      // returns a different shape binds undefined here, and INSERT OR IGNORE swallows it: the
      // campaign then claims N recipients and sits at 'sending' with an empty roster, no email, and
      // no error anywhere. That is precisely how the first real test send failed. Fail loudly.
      const bogus = a.recipients.filter((r) => !r || typeof r.address !== 'string' || !r.address.trim());
      if (bogus.length) {
        await env.DB.prepare("UPDATE campaigns SET status='draft', recipients=0, updated_at=? WHERE id=?").bind(t, cid).run();
        return bad(
          `Internal error: ${bogus.length} of ${a.recipients.length} recipients had no address. Nothing was sent — the campaign is back to draft.`,
          500,
        );
      }

      const ins = env.DB.prepare(
        "INSERT OR IGNORE INTO campaign_sends (id, campaign_id, address, name, status, created_at) VALUES (?,?,?,?,'queued',?)"
      );
      const stmts = a.recipients.map((r) => ins.bind(id('snd'), cid, r.address, r.name || null, t));
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    }

    // Recovery: 'sending' with an empty roster means the claim landed but the roster write did
    // not. Put it back to draft rather than declaring a campaign complete that never left.
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM campaign_sends WHERE campaign_id=?').bind(cid).first();
    if (!total || !total.n) {
      await env.DB.prepare("UPDATE campaigns SET status='draft', recipients=0, updated_at=? WHERE id=?").bind(t, cid).run();
      return bad('The recipient list did not save — the campaign is back to draft. Try sending again.', 409);
    }

    // Resolved once per request rather than per recipient — one query for a value that cannot
    // change mid-batch.
    const postal = await addressLine(env);

    const startedAt = Date.now();
    const base = appBaseUrl(env, request).replace(/\/$/, '');
    const q = await env.DB.prepare(
      "SELECT id, address, name FROM campaign_sends WHERE campaign_id=? AND status='queued' ORDER BY rowid LIMIT ?"
    ).bind(cid, BATCH).all();
    const work = (q && q.results) || [];

    let sent = 0, failed = 0, skipped = 0;
    for (const row of work) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;   // leave the rest queued; the page resumes

      // CLAIM BEFORE SENDING — deliberately at-most-once. This conditional UPDATE is the only
      // mutex available, so a crash between the claim and the send costs one undelivered message.
      // The alternative (mark after sending) loses the mutex and can text the same person the
      // same promo twice: an annoyance on email, a per-message TCPA event on SMS.
      const claimed = await env.DB.prepare(
        "UPDATE campaign_sends SET status='sent', reason=NULL WHERE id=? AND status='queued'"
      ).bind(row.id).run();
      if (!claimed.meta || claimed.meta.changes !== 1) continue;   // another batch already has it

      let ok = false, skip = false, reason = null;
      try {
        if (channel === 'email') {
          const unsub = unsubscribeUrlFor(base, row.address);
          const msg = renderCampaignEmail({
            body: c.body, format: c.body_format, unsubUrl: unsub, postal, name: row.name, address: row.address,
          });
          const res = await sendEmail(env, {
            to: row.address,
            subject: c.subject || c.name,
            html: msg.html,
            text: msg.text,             // text/plain alternative; bulk HTML without one scores as spam
            unsubscribeUrl: unsub,      // List-Unsubscribe + one-click POST
          });
          // sendEmail refuses bounced/complained addresses. That is a skip, not a failure —
          // nothing went wrong and retrying would only hurt the sending domain.
          if (res && res.skipped) { skip = true; reason = 'suppressed: ' + (res.suppressed || 'unknown'); }
          else ok = true;
        } else {
          const res = await sendSms(env, { to: row.address, body: smsBody(c.body) });
          if (res && res.noop) { skip = true; reason = 'sms provider not configured'; }
          else if (res && res.ok && res.sent) ok = true;
          else reason = ((res && res.error) || 'send failed').toString().slice(0, 200);
        }
      } catch (e) {
        reason = String((e && e.message) || e).slice(0, 200);
      }

      if (ok) { sent += 1; continue; }                        // row is already 'sent' from the claim
      await env.DB.prepare('UPDATE campaign_sends SET status=?, reason=? WHERE id=?')
        .bind(skip ? 'skipped' : 'failed', reason, row.id).run();
      if (skip) skipped += 1; else failed += 1;
    }

    // Counters are recomputed from campaign_sends, never incremented: the rows are the truth, and
    // an interrupted batch must not leave the campaign claiming numbers the roster disagrees with.
    const tally = await env.DB.prepare(
      `SELECT SUM(status='sent') AS sent, SUM(status='failed') AS failed,
              SUM(status='skipped') AS skipped, SUM(status='queued') AS queued
         FROM campaign_sends WHERE campaign_id=?`
    ).bind(cid).first();
    const totals = {
      sent: Number((tally && tally.sent) || 0),
      failed: Number((tally && tally.failed) || 0),
      skipped: Number((tally && tally.skipped) || 0),
    };
    const remaining = Number((tally && tally.queued) || 0);
    const done = remaining === 0;
    const t2 = now();

    if (done) {
      await env.DB.prepare(
        "UPDATE campaigns SET sent_count=?, failed_count=?, status='sent', updated_at=?, sent_at=COALESCE(sent_at,?) WHERE id=?"
      ).bind(totals.sent, totals.failed, t2, t2, cid).run();
    } else {
      await env.DB.prepare('UPDATE campaigns SET sent_count=?, failed_count=?, updated_at=? WHERE id=?')
        .bind(totals.sent, totals.failed, t2, cid).run();
    }

    return json({
      ok: true, id: cid, done,
      status: done ? 'sent' : 'sending',
      batch: { sent, failed, skipped },
      totals, remaining,
    });
  }

  return bad('Unknown action.');
};
