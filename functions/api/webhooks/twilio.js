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
import { id, now, ctEq } from '../../_lib/util.js';
import { capture } from '../../_lib/track.js';
import { logInbound } from '../../_lib/twilio.js';
import { recordUnsubscribe } from '../../_lib/audience.js';

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

  // Signature validation. FAIL CLOSED in production if no token is configured (an unsigned/forged
  // inbound SMS could otherwise spoof a staff phone). Sandbox/dev stays permissive for testing.
  if (!env.TWILIO_AUTH_TOKEN) {
    if (env.SQUARE_ENV === 'production') return new Response('forbidden', { status: 403 });
  } else {
    const sig = request.headers.get('X-Twilio-Signature') || '';
    const url = env.TWILIO_WEBHOOK_URL || request.url;
    let expected = null;
    try { expected = await twilioSignature(env.TWILIO_AUTH_TOKEN, url, params); } catch { expected = null; }
    if (!sig || !expected || !ctEq(expected, sig)) {
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

  // Honor SMS opt-out/opt-in keywords in our own records (Twilio also enforces STOP at the
  // carrier level; this keeps clients.sms_consent accurate so we never re-attempt a texted opt-out).
  const kw = body.trim().toUpperCase();
  const STOP_KW = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
  const START_KW = ['START', 'YES', 'UNSTOP'];
  if (STOP_KW.includes(kw) || START_KW.includes(kw)) {
    const consent = START_KW.includes(kw) ? 1 : 0;
    const last10 = digits(from).slice(-10);
    if (last10.length >= 7) {
      const like = '%' + last10;
      try {
        await env.DB.prepare(
          "UPDATE clients SET sms_consent = ?, updated_at = ? WHERE replace(replace(replace(replace(replace(phone,'+',''),'-',''),' ',''),'(',''),')','') LIKE ?"
        ).bind(consent, ts, like).run();
      } catch { /* best-effort */ }
      // STOP is the single most important opt-out signal there is, and it must clear MARKETING
      // consent too — not just the transactional flag. Broadcast audiences read
      // marketing_sms_consent + campaign_unsubscribes and deliberately ignore sms_consent, so
      // without this a person who texted STOP stayed in the next marketing audience. Twilio blocks
      // delivery at the carrier level, so nothing would actually have been sent — but our record of
      // their wishes would have been wrong, and the reach shown to the owner overstated.
      if (!consent) {
        try {
          await env.DB.prepare(
            "UPDATE clients SET marketing_sms_consent = 0 WHERE replace(replace(replace(replace(replace(phone,'+',''),'-',''),' ',''),'(',''),')','') LIKE ?"
          ).bind(like).run();
        } catch { /* column may predate 0047 in an early env */ }
        try {
          await env.DB.prepare(
            "UPDATE leads SET marketing_sms_consent = 0 WHERE replace(replace(replace(replace(replace(phone,'+',''),'-',''),' ',''),'(',''),')','') LIKE ?"
          ).bind(like).run();
        } catch { /* same */ }
        // The durable record: campaign_unsubscribes survives anything done to the consent columns.
        await recordUnsubscribe(env, { address: from, channel: 'sms', source: 'reply_stop', reason: kw });
      } else {
        // START is the ONLY way back from a texted STOP: /preferences deliberately refuses to clear
        // a reply_stop row (a web click is not express written consent for texts), and it tells the
        // person in as many words to "text START to that number to turn them back on". If START did
        // not lift the block, that instruction would be a lie and the person would be stranded off
        // the list forever with no working path back.
        //
        // Lifting the block is NOT the same as re-granting marketing consent: this only removes the
        // suppression, leaving marketing_sms_consent at 0. They still have to tick the box on
        // /preferences to actually receive marketing texts again — which now works, as promised.
        const bare = "replace(replace(replace(replace(replace(phone,'+',''),'-',''),' ',''),'(',''),')','')";
        try {
          await env.DB.prepare(
            `UPDATE campaign_unsubscribes SET channel = 'email'
              WHERE channel = 'all' AND source = 'reply_stop' AND phone IS NOT NULL AND ${bare} LIKE ?`
          ).bind(like).run();
          await env.DB.prepare(
            `DELETE FROM campaign_unsubscribes
              WHERE channel = 'sms' AND source = 'reply_stop' AND phone IS NOT NULL AND ${bare} LIKE ?`
          ).bind(like).run();
        } catch { /* best-effort */ }
      }
    }
  }

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
