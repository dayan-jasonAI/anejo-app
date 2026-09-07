// Public catering intake is committed as one D1 batch before any external work.
// Email acceptance is not inbox delivery. Resend retries share one immutable payload/key;
// ambiguous sends older than its 24h idempotency window require owner reconciliation.
import { id, now } from './util.js';
import { sendEmail, emailShell, escHtml } from './email.js';
import { raiseAlert } from './alerts.js';

export function validCateringRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(value);
}

export async function cateringPayloadHash(payload) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().filter((key) => key !== 'request_id').map((key) => [key, canonical(value[key])]))
      : value;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(payload))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function findCateringReplay(env, requestId, payloadHash) {
  const row = await env.DB.prepare('SELECT request_id, payload_hash, lead_id, attachment_ids FROM catering_requests WHERE request_id=?')
    .bind(requestId).first();
  if (!row) return null;
  if (row.payload_hash !== payloadHash) return { conflict: true };
  return { id: row.lead_id, request_id: row.request_id, attachment_count: JSON.parse(row.attachment_ids).length, replayed: true };
}

function emailPayload(env, rec, catering) {
  const detail = `Name: ${rec.name}\nEmail: ${rec.email}\nPhone: ${rec.phone || 'Not provided'}\nCompany: ${rec.company || 'Not provided'}\n${rec.message}`;
  return {
    from: env.EMAIL_FROM || 'Añejo Catering Co. <noreply@anejocateringco.com>',
    to: env.LEADS_NOTIFY_TO || 'dayan@anejocateringco.com',
    subject: `New catering quote request — ${rec.name} · ${catering.guests} guests`.slice(0, 120),
    text: `${detail}\nReview: https://anejocateringco.com/hub/owner/catering.html?lead=${rec.id}`,
    html: emailShell(`<p>New catering quote request from the website:</p><div style="white-space:pre-wrap">${escHtml(detail)}</div><p><a href="https://anejocateringco.com/hub/owner/catering.html?lead=${encodeURIComponent(rec.id)}">Open the Catering desk →</a></p>`),
  };
}

export async function storeCateringRequest(env, { rec, catering, requestId, payloadHash, uploadSessionId, attachments }) {
  const t = now();
  const statements = [env.DB.prepare(`INSERT INTO leads
    (id, kind, name, email, phone, company, interest, message, source_lang, sms_consent,
     marketing_sms_consent, marketing_sms_consent_at, marketing_sms_consent_src,
     src, utm_source, utm_medium, utm_campaign, referrer, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    rec.id, rec.kind, rec.name, rec.email, rec.phone, rec.company, rec.interest, rec.message,
    rec.source_lang, rec.sms_consent, rec.marketing_sms_consent, rec.marketing_sms_consent_at,
    rec.marketing_sms_consent_src, rec.src, rec.utm_source, rec.utm_medium, rec.utm_campaign, rec.referrer, t,
  )];
  if (uploadSessionId) {
    statements.push(env.DB.prepare(`UPDATE catering_upload_sessions SET claimed_lead_id=?, claimed_at=?
      WHERE id=? AND claimed_lead_id IS NULL AND expires_at>?`).bind(rec.id, t, uploadSessionId, t));
    statements.push(env.DB.prepare(`UPDATE catering_attachments SET lead_id=? WHERE session_id=? AND lead_id IS NULL
      AND EXISTS (SELECT 1 FROM catering_upload_sessions WHERE id=? AND claimed_lead_id=?)`)
      .bind(rec.id, uploadSessionId, uploadSessionId, rec.id));
  }
  statements.push(env.DB.prepare(`INSERT INTO catering_requests
    (request_id,payload_hash,lead_id,upload_session_id,attachment_ids,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(requestId, payloadHash, rec.id, uploadSessionId || null, JSON.stringify(attachments.map((a) => a.id)), t));
  const hub = {
    alert_type: 'catering_request', severity: 'info',
    title: `Catering request: ${rec.name} · ${catering.guests} guests`,
    body: `${catering.event_date} · ${catering.location} · ${catering.interest} · ${attachments.length} private design files. Open the Catering desk to review and quote.`,
    ref_type: 'lead', ref_id: rec.id, dedupe_key: `catering:${rec.id}`,
  };
  for (const [channel, payload] of [['hub', hub], ['email', emailPayload(env, rec, catering)]]) {
    statements.push(env.DB.prepare(`INSERT INTO catering_notification_outbox
      (id,request_id,lead_id,channel,payload_json,next_attempt_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(id('cno'), requestId, rec.id, channel, JSON.stringify(payload), t, t, t));
  }
  try { await env.DB.batch(statements); }
  catch (error) {
    // A concurrent identical request can win the unique key while this whole batch rolls back.
    const replay = await findCateringReplay(env, requestId, payloadHash);
    if (replay) return replay;
    if (String(error).includes('catering_upload_claim_conflict')) return { uploadConflict: true };
    throw error;
  }
  return { id: rec.id, request_id: requestId, attachment_count: attachments.length, replayed: false };
}

export async function cateringReceipt(env, saved) {
  const rows = await env.DB.prepare('SELECT channel,status FROM catering_notification_outbox WHERE request_id=?')
    .bind(saved.request_id).all();
  const status = Object.fromEntries((rows.results || []).map((row) => [row.channel, row.status]));
  return { ok: true, id: saved.id, request_id: saved.request_id, replayed: saved.replayed,
    notifications: { hub: status.hub === 'accepted', email: status.email === 'accepted' },
    notification_status: status,
    attachments: { received: saved.attachment_count, linked: true } };
}

export async function drainCateringOutbox(env, { requestId = null, limit = 10 } = {}) {
  const t = now();
  const result = await env.DB.prepare(`SELECT id FROM catering_notification_outbox
    WHERE (status='pending' OR (status='leased' AND lease_until<=?)) AND next_attempt_at<=?
      AND (? IS NULL OR request_id=?) ORDER BY created_at,channel DESC LIMIT ?`)
    .bind(t, t, requestId, requestId, Math.min(25, Math.max(1, limit))).all();
  const counts = { accepted: 0, pending: 0, needs_review: 0 };
  for (const candidate of result.results || []) {
    const token = crypto.randomUUID();
    const claimed = await env.DB.prepare(`UPDATE catering_notification_outbox
      SET status='leased', lease_token=?, lease_until=?, attempts=attempts+1,
        first_attempt_at=COALESCE(first_attempt_at,?), updated_at=?
      WHERE id=? AND (status='pending' OR (status='leased' AND lease_until<=?)) AND next_attempt_at<=?`)
      .bind(token, now() + 120000, now(), now(), candidate.id, now(), now()).run();
    if (!claimed.meta?.changes) continue;
    const row = await env.DB.prepare('SELECT * FROM catering_notification_outbox WHERE id=? AND lease_token=?')
      .bind(candidate.id, token).first();
    if (!row) continue;
    let status = 'pending';
    let receipt = null;
    let lastError = null;
    try {
      if (row.channel === 'email' && now() - row.first_attempt_at >= 23 * 3600000) {
        status = 'needs_review';
        lastError = 'Provider idempotency retry window elapsed; reconcile the send before resending.';
      } else {
        const payload = JSON.parse(row.payload_json);
        if (row.channel === 'hub') {
          // Closed/acknowledged alerts count too: a crash after alert insertion must not reopen it.
          const existing = await env.DB.prepare('SELECT id FROM alerts WHERE dedupe_key=? LIMIT 1').bind(payload.dedupe_key).first();
          const alert = existing ? { ok: true, id: existing.id } : await raiseAlert(env, payload);
          if (!alert.ok) throw new Error('Hub alert unavailable');
          receipt = alert.id;
        } else {
          const sent = await sendEmail({ ...env, EMAIL_FROM: payload.from }, { ...payload,
            idempotencyKey: `catering/${row.id}`, timeoutMs: 15000 });
          if (!sent?.id || sent.skipped) throw new Error(sent?.suppressed ? 'Notification address suppressed' : 'Email not accepted');
          receipt = sent.id;
        }
        status = 'accepted';
      }
    } catch { lastError = row.channel === 'email' ? 'Email not accepted; queued for retry.' : 'Hub alert unavailable; queued for retry.'; }
    await env.DB.prepare(`UPDATE catering_notification_outbox SET status=?,receipt_id=?,last_error=?,
      next_attempt_at=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`)
      .bind(status, receipt, lastError, now() + Math.min(3600000, 60000 * 2 ** Math.min(row.attempts - 1, 6)), now(), row.id, token).run();
    counts[status]++;
    if (row.channel === 'email' && status !== 'accepted') {
      await raiseAlert(env, { alert_type: 'catering_email_failed', severity: 'warning',
        title: 'Catering email needs attention', body: `${lastError} The complete request is saved in the Catering desk.`,
        ref_type: 'lead', ref_id: row.lead_id, dedupe_key: `catering-email:${row.lead_id}` });
    }
  }
  return counts;
}
