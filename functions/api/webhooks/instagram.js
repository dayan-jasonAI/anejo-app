// Instagram webhooks — incoming comments and DMs.
//   GET  → Meta's subscription handshake (hub.challenge)
//   POST → events, signed with X-Hub-Signature-256
//
// THIS ENDPOINT IS PUBLIC AND WRITES TO THE TEAM'S INBOX, so the signature is the only thing
// standing between Meta and anyone on the internet. It FAILS CLOSED: with no IG_APP_SECRET set,
// every POST is refused. That is the opposite of the geocoding call — there, failing closed would
// have taken the storefront off sale over a missing key; here, failing open would let a stranger
// put words in a customer's mouth in Añejo's own inbox, and potentially draw a reply.
//
// Meta RETRIES deliveries, so every event is claimed by its own id before anything is written.
// A retry must not become a second copy of the same DM or a second reply to the same comment.
import { json, bad, id, now } from '../../_lib/util.js';

const enc = new TextEncoder();

/** Constant-time compare of two hex strings. */
function ctEqHex(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function signatureValid(secret, rawBody, header) {
  const got = String(header || '').replace(/^sha256=/i, '').trim();
  if (!got) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const want = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return ctEqHex(got, want);
}

// ---------- GET: the subscription handshake ----------
export const onRequestGet = async ({ request, env }) => {
  const u = new URL(request.url);
  const mode = u.searchParams.get('hub.mode');
  const token = u.searchParams.get('hub.verify_token');
  const challenge = u.searchParams.get('hub.challenge');
  // The verify token is a shared secret we choose; echoing the challenge without checking it
  // would let anyone point their app's webhooks at us.
  if (mode === 'subscribe' && env.IG_WEBHOOK_VERIFY_TOKEN && token === env.IG_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
};

// ---------- POST: events ----------
export const onRequestPost = async ({ request, env }) => {
  const raw = await request.text();

  if (!env.IG_APP_SECRET) {
    // Fail closed, and say why in the log rather than silently accepting.
    return bad('Instagram webhooks are not configured (IG_APP_SECRET).', 503);
  }
  const ok = await signatureValid(env.IG_APP_SECRET, raw, request.headers.get('x-hub-signature-256'));
  if (!ok) return new Response('Bad signature', { status: 401 });

  if (!env.DB) return bad('Database not configured.', 500);

  let payload;
  try { payload = JSON.parse(raw); } catch { return bad('Invalid JSON.'); }

  const t = now();
  const seen = [];

  for (const entry of (payload && payload.entry) || []) {
    // --- Direct messages
    for (const m of entry.messaging || []) {
      const mid = m && m.message && m.message.mid;
      const fromId = m && m.sender && m.sender.id;
      // Our own outbound messages echo back. Storing them as inbound would reset the 24-hour
      // window on our own reply and make it look like the customer wrote again.
      const isEcho = !!(m && m.message && m.message.is_echo);
      if (!mid || !fromId || isEcho) continue;
      seen.push(await ingest(env, {
        eventId: mid, kind: 'message', fromId,
        text: (m.message && m.message.text) || '', raw: m, t,
      }));
    }

    // --- Comments and mentions
    for (const ch of entry.changes || []) {
      const v = ch && ch.value;
      if (!v) continue;
      if (ch.field === 'comments') {
        const fromId = (v.from && v.from.id) || null;
        if (!v.id) continue;
        // Our own replies come back as comment webhooks. Identity from the live API (memoized),
        // never from env config — the config mismatch is how the self-reply loop happened. If we
        // cannot resolve who we are, we still store the event; the tick's own check catches it.
        const self = await resolveTarget(env).catch(() => null);
        if (self && self.ok && String(fromId || '') === String(self.id)) continue;
        seen.push(await ingest(env, {
          eventId: v.id, kind: 'comment', fromId,
          fromUsername: (v.from && v.from.username) || null,
          mediaId: (v.media && v.media.id) || null,
          text: v.text || '', raw: v, t,
        }));
      }
    }
  }

  // Meta only needs a 200. Anything else and it retries, which is right for a real outage and
  // wrong for a single malformed event — so a bad event is recorded, not thrown.
  return json({ ok: true, received: seen.length, stored: seen.filter(Boolean).length });
};

/**
 * Record one event, exactly once.
 *
 * The INSERT on the platform's own id is the dedupe: a retry hits the primary key and stops.
 * Nothing downstream runs for a duplicate, so a retried DM cannot draw a second reply.
 */
async function ingest(env, { eventId, kind, fromId, fromUsername, mediaId, text, raw, t }) {
  try {
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO social_events (id, platform, kind, from_id, from_username, media_id, text, raw, handled, created_at)
       VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(eventId, kind, fromId || null, fromUsername || null, mediaId || null, String(text || '').slice(0, 4000), JSON.stringify(raw).slice(0, 8000), t).run();
    if (!r.meta || r.meta.changes !== 1) return false;   // already had it
  } catch { return false; }

  // A DM opens or continues a thread in Añejo Comms, and stamps the reply window. A comment is
  // public and has no window, so it is left as an event for the HUB to surface.
  if (kind === 'message' && fromId) {
    try {
      let thread = await env.DB.prepare("SELECT id FROM threads WHERE external_id=? AND audience='instagram' LIMIT 1").bind(fromId).first();
      if (!thread) {
        const tid = id('thr');
        await env.DB.prepare(
          `INSERT INTO threads (id, audience, subject, external_id, external_username, last_inbound_at, last_message_at, status, created_at, updated_at)
           VALUES (?, 'instagram', ?, ?, ?, ?, ?, 'open', ?, ?)`
        ).bind(tid, 'Instagram DM', fromId, fromUsername || null, t, t, t, t).run();
        thread = { id: tid };
      } else {
        // last_inbound_at is what makes a reply legal — it moves on every inbound message.
        await env.DB.prepare('UPDATE threads SET last_inbound_at=?, last_message_at=?, updated_at=?, status=\'open\' WHERE id=?')
          .bind(t, t, t, thread.id).run();
      }
      await env.DB.prepare(
        `INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, created_at)
         VALUES (?,?,'inbound','instagram',?,'customer',?,0,?)`
      ).bind(id('msg'), thread.id, fromId, String(text || '').slice(0, 4000), t).run();
      await env.DB.prepare('UPDATE social_events SET thread_id=?, handled=1 WHERE id=?').bind(thread.id, eventId).run();
    } catch { /* the event is stored either way; the thread can be rebuilt from it */ }
  }
  return true;
}
