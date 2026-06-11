// POST /api/webhooks/twilio — inbound SMS/WhatsApp from Twilio (form-encoded:
// From, To, Body, MessagingServiceSid, …). No session auth — this is a provider webhook.
//
// Signature: if TWILIO_AUTH_TOKEN is configured we best-effort validate
// X-Twilio-Signature (HMAC-SHA1 over url + sorted key/value params, base64) and
// return 403 on mismatch. Without a token (sandbox) we accept the request.
// Set TWILIO_WEBHOOK_URL if the public URL differs from request.url (proxies).
//
// Routing: the sender's number (last 10 digits) is matched against staff.phone.
//   match   → latest open thread with that staff_id, else create one
//             (audience = their role, subject 'SMS from <name>').
//   unknown → create a thread audience 'client', subject 'SMS from <last4>'.
// Inserts the inbound message + sms_log row, bumps thread.last_message_at and
// fires message.received {channel}. Responds with empty TwiML.
import { id, now } from '../../_lib/util.js';
import { capture } from '../../_lib/track.js';
import { logInbound } from '../../_lib/twilio.js';

function twiml() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

const digits = (s) => String(s || '').replace(/\D+/g, '');

// Twilio request signature: base64(HMAC-SHA1(authToken, url + concat(sortedKey+value))).
async function twilioSignature(token, url, params) {
  const keys = [...params.keys()].sort();
  let data = url;
  for (const k of keys) data += k + (params.get(k) || '');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export const onRequestPost = async ({ request, env }) => {
  const raw = await request.text();
  const params = new URLSearchParams(raw);

  // Best-effort signature validation (only when a token is configured).
  if (env.TWILIO_AUTH_TOKEN) {
    const sig = request.headers.get('X-Twilio-Signature') || '';
    const url = env.TWILIO_WEBHOOK_URL || request.url;
    let expected = null;
    try { expected = await twilioSignature(env.TWILIO_AUTH_TOKEN, url, params); } catch { expected = null; }
    if (!sig || !expected || expected !== sig) {
      return new Response('invalid signature', { status: 403 });
    }
  }

  const rawFrom = params.get('From') || '';
  const to = (params.get('To') || '').replace(/^whatsapp:/i, '');
  const body = (params.get('Body') || '').trim();
  const channel = /^whatsapp:/i.test(rawFrom) ? 'whatsapp' : 'sms';
  const from = rawFrom.replace(/^whatsapp:/i, '');

  if (!env.DB || !from) return twiml();

  const ts = now();

  try {
    // Match the sender against staff phones (last 10 digits, JS-side normalize).
    const fromDigits = digits(from).slice(-10);
    let staff = null;
    if (fromDigits.length >= 7) {
      const { results } = await env.DB.prepare(
        "SELECT id, name, role, team, phone FROM staff WHERE active = 1 AND phone IS NOT NULL AND phone != ''"
      ).all();
      staff = (results || []).find((r) => digits(r.phone).slice(-10) === fromDigits) || null;
    }

    // Find (or create) the thread.
    let thread = null;
    if (staff) {
      thread = await env.DB.prepare(
        "SELECT * FROM threads WHERE staff_id = ? AND status = 'open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1"
      ).bind(staff.id).first();
    }

    if (!thread) {
      const tid = id('thr');
      const audience = staff ? staff.role : 'client';
      const subject = staff
        ? `SMS from ${staff.name || staff.role}`
        : `SMS from ${fromDigits.slice(-4) || 'unknown'}`;
      await env.DB.prepare(
        `INSERT INTO threads (id, audience, subject, created_by, staff_id, last_message_at, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,'open',?,?)`
      ).bind(tid, audience, subject, staff ? staff.id : null, staff ? staff.id : null, ts, ts, ts).run();
      thread = { id: tid, audience, subject };
      await capture(env, {
        event: 'thread.created',
        distinct_id: staff ? staff.id : null,
        role: staff ? staff.role : null,
        team: staff ? staff.team : null,
        properties: { thread_id: tid, audience, channel, source: 'twilio_inbound' },
      });
    }

    // sms_log row + inbound message, linked together.
    const smsLogId = await logInbound(env, { from, to, body, channel, thread_id: thread.id });
    await env.DB.prepare(
      `INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, sms_log_id, created_at)
       VALUES (?,?,?,?,?,?,?,0,?,?)`
    ).bind(
      id('msg'), thread.id, 'inbound', channel,
      staff ? staff.id : null, staff ? staff.role : null,
      body, smsLogId || null, ts
    ).run();
    await env.DB.prepare('UPDATE threads SET last_message_at = ?, updated_at = ? WHERE id = ?')
      .bind(ts, ts, thread.id).run();

    await capture(env, {
      event: 'message.received',
      distinct_id: staff ? staff.id : null,
      role: staff ? staff.role : null,
      team: staff ? staff.team : null,
      properties: { channel, thread_id: thread.id, known_sender: !!staff },
    });
  } catch {
    /* best-effort: always answer Twilio with TwiML so it doesn't retry-storm */
  }

  return twiml();
};
