// Twilio SMS / WhatsApp bridge for the HUB.
//   sendSms(env, { to, body, thread_id })
//   sendWhatsApp(env, { to, body, thread_id })
// Sandbox posture: if TWILIO_* env vars are absent, this NO-OPS the network call
// but still writes a row to sms_log (status='noop') so threads/UX work end-to-end.
// Never throws on the caller — returns a small result object.
// Files under functions/_lib are not routed.
import { id, now } from './util.js';

function configured(env) {
  return !!(env && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
}

// Persist an outbound row to sms_log. Best-effort.
async function logSms(env, row) {
  if (!env || !env.DB) return null;
  const sid = id('sms');
  try {
    await env.DB
      .prepare(
        'INSERT INTO sms_log (id, direction, channel, to_number, from_number, body, thread_id, status, provider_sid, error, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      )
      .bind(
        sid,
        row.direction || 'outbound',
        row.channel || 'sms',
        row.to || null,
        row.from || null,
        row.body || null,
        row.thread_id || null,
        row.status || 'queued',
        row.provider_sid || null,
        row.error || null,
        now()
      )
      .run();
  } catch {
    /* best-effort */
  }
  return sid;
}

// Core sender. channel = 'sms' | 'whatsapp'. Pass mediaUrl (string or array of public HTTPS
// URLs) to send an MMS — Twilio fetches each and attaches it. Logged as channel 'mms'.
async function send(env, { to, body, thread_id, mediaUrl }, channel) {
  if (!to || !body) {
    return { ok: false, sent: false, error: 'Missing to/body.' };
  }
  const media = mediaUrl ? (Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl]).filter(Boolean) : [];
  const logChannel = (media.length && channel === 'sms') ? 'mms' : channel;

  // Sandbox / no creds → record a no-op and return.
  if (!configured(env)) {
    const logId = await logSms(env, { direction: 'outbound', channel: logChannel, to, body, thread_id, status: 'noop' });
    return { ok: true, sent: false, noop: true, sms_log_id: logId };
  }

  const from = channel === 'whatsapp'
    ? (env.TWILIO_WHATSAPP_FROM || env.TWILIO_FROM)
    : (env.TWILIO_FROM || env.TWILIO_MESSAGING_FROM);
  const toAddr = channel === 'whatsapp' ? `whatsapp:${to.replace(/^whatsapp:/, '')}` : to;
  const fromAddr = channel === 'whatsapp' && from ? `whatsapp:${from.replace(/^whatsapp:/, '')}` : from;

  const params = new URLSearchParams();
  params.set('To', toAddr);
  if (env.TWILIO_MESSAGING_SERVICE_SID) {
    params.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
  } else if (fromAddr) {
    params.set('From', fromAddr);
  }
  params.set('Body', body);
  for (const m of media) params.append('MediaUrl', m);   // Twilio accepts up to 10 MediaUrl

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const logId = await logSms(env, { direction: 'outbound', channel: logChannel, to, from, body, thread_id, status: 'failed', error: (data && data.message) || `HTTP ${r.status}` });
      return { ok: false, sent: false, error: (data && data.message) || `HTTP ${r.status}`, sms_log_id: logId };
    }
    const logId = await logSms(env, { direction: 'outbound', channel: logChannel, to, from, body, thread_id, status: 'sent', provider_sid: data.sid });
    return { ok: true, sent: true, provider_sid: data.sid, sms_log_id: logId };
  } catch (e) {
    const logId = await logSms(env, { direction: 'outbound', channel: logChannel, to, from, body, thread_id, status: 'failed', error: String(e).slice(0, 200) });
    return { ok: false, sent: false, error: String(e).slice(0, 200), sms_log_id: logId };
  }
}

export function sendSms(env, opts) {
  return send(env, opts || {}, 'sms');
}

// MMS = SMS with media. Returns the same result object; falls back to plain SMS upstream
// (in notify.js) if MMS isn't deliverable.
export function sendMms(env, opts) {
  return send(env, opts || {}, 'sms');
}

export function sendWhatsApp(env, opts) {
  return send(env, opts || {}, 'whatsapp');
}

// Record an inbound message (e.g., from a Twilio webhook). Returns sms_log id.
export function logInbound(env, { from, to, body, channel = 'sms', thread_id }) {
  return logSms(env, { direction: 'inbound', channel, to, from, body, thread_id, status: 'delivered' });
}

export const isTwilioConfigured = configured;
