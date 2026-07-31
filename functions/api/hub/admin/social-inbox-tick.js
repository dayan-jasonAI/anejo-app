// POST /api/hub/admin/social-inbox-tick — Aña drafts replies to waiting Instagram DMs and
// comments. Auth: owner session OR the X-Cron-Key header, same as every other tick. Fired every
// minute by anejo-cron; safe to fire by hand.
//
// THIS TICK ONLY DRAFTS. sendDirectMessage and replyToComment are deliberately NOT imported —
// the owner's decision #1 is that nothing reaches a customer or the public profile without a
// human pressing send, and the strongest way to keep that true is for the sending code to not
// even be reachable from here. The send path lives in owner/social-inbox.js behind an owner
// session.
//
// Idempotency comes from the data, not a lock:
//   · a comment is drafted once because handled=0 is flipped when its rows land;
//   · a DM thread is drafted once because the draft row itself becomes the thread's last message,
//     and the tick only touches threads whose LAST message is the customer's.
// A dismissed draft still occupies that slot (dismissed_at, not DELETE), so "owner said no"
// never turns into "ask Aña again every minute".
import { json, bad, id, now, ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { sendPushTickle } from '../../../_lib/push.js';
import { draftReply, reactionReplyFor, looksLikeScaffolding } from '../../../_lib/ana_social.js';
// The tick was built structurally unable to send — by design, while every reply awaited the
// owner's tap. On 2026-07-31 the owner reviewed Aña's live drafts and the FAQ set and turned
// auto-reply ON. The carve-outs are not negotiable: escalations still send NOTHING, the 24-hour
// legality window stays enforced inside sendDirectMessage itself, and the whole path only runs
// when the social.auto_reply setting says so — flipping it off restores draft-only instantly.
import { sendDirectMessage, replyToComment } from '../../../_lib/instagram_messaging.js';
import { resolveTarget, accountInfo } from '../../../_lib/instagram.js';
import { raiseAlert } from '../../../_lib/alerts.js';

// Claude calls per tick. The tick runs every minute, so a backlog drains at ~4/min — fast enough
// that a busy post gets answered within minutes, bounded enough that a spam flood can't turn the
// inbox into an open-ended API bill.
const DRAFT_BUDGET = 4;

// Mirrors the messaging library's 24-hour rule (which the send path re-checks itself — the
// library stays unimported here, so this constant is duplicated on purpose). The tick doesn't
// send, but drafting for a thread whose window already closed produces copy the send op must
// then refuse — a draft that exists only to be rejected. Better to not write it.
const WINDOW_MS = 24 * 60 * 60 * 1000;

export const onRequestPost = async ({ request, env }) => {
  const cronKey = request.headers.get('x-cron-key') || '';
  const viaCron = !!(env.CRON_KEY && ctEq(cronKey, env.CRON_KEY));
  if (!viaCron) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  if (!env.DB) return bad('Database not configured.', 500);
  if (!env.ANTHROPIC_API_KEY) return json({ ok: true, skipped: 'anthropic_not_configured' });

  const t = now();
  let budget = DRAFT_BUDGET;
  // 'both' | 'dm' | 'comment' | 'off'. Default OFF in code — the prod row is what turns it on,
  // so a fresh environment can never auto-send before an owner has decided it should.
  let autoMode = 'off';
  try {
    const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key='social.auto_reply'").first();
    if (r && ['both', 'dm', 'comment'].includes(String(r.value))) autoMode = String(r.value);
  } catch { autoMode = 'off'; }
  const autoOk = (kind) => autoMode === 'both' || autoMode === kind;

  // WHO WE ARE, from the live API — never from env config. The 2026-07-31 self-reply loop
  // happened because env.IG_USER_ID held a different id than the one Meta stamps on our own
  // comments (17841410209362773): the self-check silently never matched, Aña treated her own
  // replies as new customers, and answered herself in public seven times. /me is the authority;
  // the username is matched too, so either signal alone is enough to recognise ourselves.
  const target = await resolveTarget(env);
  const acct = target.ok ? await accountInfo(env) : { ok: false };
  const selfId = String((target.ok && target.id) || '');
  const selfName = String((acct.ok && acct.username) || '').toLowerCase();
  const isSelf = (ev) =>
    (selfId && String(ev.from_id || '') === selfId) ||
    (selfName && String(ev.from_username || '').toLowerCase() === selfName) ||
    (env.IG_USER_ID && String(ev.from_id || '') === String(env.IG_USER_ID));
  // If we cannot confirm our own identity, we must not auto-send anything: replying to an
  // unidentified account risks replying to ourselves, which is exactly the loop.
  const identityKnown = !!(selfId || selfName);

  // THE CIRCUIT BREAKER. Even with every identity check right, a conversation loop (with
  // ourselves, with another bot, with a hostile prankster) burns trust at machine speed. No
  // thread may receive more than 2 auto-sent replies in any rolling hour — past that, Aña goes
  // quiet on that thread and everything lands as human-review drafts. A slow reply costs a
  // little; a machine-gun reply thread on a public post costs the brand.
  const breakerTripped = async (threadId) => {
    try {
      const r = await env.DB.prepare(
        "SELECT COUNT(*) n FROM messages WHERE thread_id=? AND direction='outbound' AND channel='instagram' AND sent_at IS NOT NULL AND sent_at > ?"
      ).bind(threadId, t - 3600 * 1000).first();
      return Number((r && r.n) || 0) >= 2;
    } catch { return true; }   // cannot count → do not send
  };

  let drafted = 0, escalated = 0, sent = 0, specials = 0, skipped = 0;

  // ---------- comments (public, no reply window) ----------
  let events = [];
  try {
    const r = await env.DB.prepare(
      "SELECT * FROM social_events WHERE platform='instagram' AND kind='comment' AND handled=0 ORDER BY created_at ASC LIMIT ?"
    ).bind(DRAFT_BUDGET).all();
    events = (r && r.results) || [];
  } catch { events = []; }

  for (const ev of events) {
    if (budget <= 0) break;
    // Our own replies echo back through the webhook as comments. Aña answering Aña would loop
    // forever, so they are marked handled without spending a draft on them.
    if (isSelf(ev)) {
      try { await env.DB.prepare('UPDATE social_events SET handled=1 WHERE id=?').bind(ev.id).run(); } catch { /* retried next tick */ }
      skipped += 1;
      continue;
    }

    // Applause first: a bare 🔥/❤️ gets a warm fixed-rotation line and never touches the model.
    // The live failure this prevents: Haiku, handed an emoji with nothing to answer, broke
    // character and posted its own scaffolding under a real customer's comment.
    const reaction = reactionReplyFor(ev.text, ev.id);
    let d;
    if (reaction) {
      d = { ok: true, draft: reaction };
    } else {
      budget -= 1;
      d = await draftReply(env, { kind: 'comment', text: ev.text || '', username: ev.from_username, auto: autoOk('comment') });
      // A failed draft leaves handled=0 on purpose — the next tick retries it. Marking it handled
      // here would silently drop a real customer's comment on an API blip.
      if (!d.ok) continue;
    }

    try {
      const threadId = await commentThread(env, ev, t);
      if (!threadId) continue;

      // The comment itself, as an inbound row — the thread must read as a conversation, not a
      // lone Aña draft with no visible question above it.
      await env.DB.prepare(
        `INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, ref_id, created_at)
         VALUES (?,?,'inbound','instagram',?,'customer',?,0,?,?)`
      ).bind(id('msg'), threadId, ev.from_id || null, String(ev.text || '').slice(0, 4000), ev.id, t).run();

      if (d.escalate) {
        await insertEscalation(env, threadId, ev.id, d.reason, t);
        escalated += 1;
      } else {
        const mid = await insertDraft(env, threadId, ev.id, d.draft, t);
        drafted += 1;
        if (d.special) { specials += 1; await specialAlert(env, threadId, ev.text, t); }
        // Public comment replies have no 24-hour window — the reply is public. The guard is the
        // last gate: a reply that smells like scaffolding stays a human-review draft, because a
        // broken-character reply on a public post costs more than a slow one.
        if (identityKnown && autoOk('comment') && !looksLikeScaffolding(d.draft) && !(await breakerTripped(threadId))) {
          const res = await replyToComment(env, { commentId: ev.id, text: d.draft });
          if (res && res.ok && await markSent(env, mid, t)) sent += 1;
        }
      }
      await env.DB.prepare('UPDATE threads SET last_message_at=?, updated_at=? WHERE id=?').bind(t, t, threadId).run();
      await env.DB.prepare('UPDATE social_events SET thread_id=?, handled=1 WHERE id=?').bind(threadId, ev.id).run();
    } catch { /* event stays handled=0 and is retried; a duplicate draft beats a dropped comment */ }
  }

  // ---------- DMs (24-hour reply window) ----------
  // "Needs a draft" is one condition: the thread's LAST message is the customer's. A pending
  // draft, a dismissed draft, an escalation marker, or an owner send are all outbound rows that
  // take the thread out of this set until the customer writes again.
  let threads = [];
  try {
    const r = await env.DB.prepare(
      `SELECT * FROM threads
        WHERE audience='instagram' AND status='open'
          AND COALESCE(ref_type,'') != 'ig_media'
          AND last_inbound_at > ?
        ORDER BY last_inbound_at ASC LIMIT 20`
    ).bind(t - WINDOW_MS).all();
    threads = (r && r.results) || [];
  } catch { threads = []; }

  for (const th of threads) {
    if (budget <= 0) break;
    let last = null;
    try {
      last = await env.DB.prepare('SELECT * FROM messages WHERE thread_id=? ORDER BY created_at DESC LIMIT 1').bind(th.id).first();
    } catch { continue; }
    if (!last || last.direction !== 'inbound') continue;

    budget -= 1;
    const d = await draftReply(env, { kind: 'dm', text: last.body || '', username: th.external_username, auto: autoOk('dm') });
    if (!d.ok) continue;

    try {
      if (d.escalate) {
        await insertEscalation(env, th.id, null, d.reason, t);
        escalated += 1;
      } else {
        const mid = await insertDraft(env, th.id, null, d.draft, t);
        drafted += 1;
        if (d.special) { specials += 1; await specialAlert(env, th.id, last.body, t); }
        if (autoOk('dm')) {
          // sendDirectMessage re-checks never-messaged-first and the 24-hour ceiling internally —
          // the legality gate is not this file's to skip.
          if (!identityKnown || looksLikeScaffolding(d.draft) || await breakerTripped(th.id)) { continue; }   // quarantined, never sent
          const res = await sendDirectMessage(env, { thread: th, recipientId: th.external_id, text: d.draft });
          if (res && res.ok && await markSent(env, mid, t)) sent += 1;
        }
      }
    } catch { /* retried next tick — the thread's last message is still inbound */ }
  }

  // One tickle however many drafts landed — the owner opens the inbox once, not four times.
  // Payload-less web push; no-op safe without VAPID, and never allowed to fail the tick.
  if (drafted || escalated) {
    try { await sendPushTickle(env, { roles: ['owner'] }); } catch { /* best-effort */ }
  }

  return json({ ok: true, mode: autoMode, drafted, sent, specials, escalated, skipped });
};

// Find-or-create the Comms thread for a comment's MEDIA (one thread per post, many comments).
// last_inbound_at is deliberately NEVER set on comment threads: a public comment grants no DM
// permission, and leaving it NULL means even a mis-routed sendDirectMessage fails closed with
// "never_messaged_us" instead of DMing someone who only commented.
async function commentThread(env, ev, t) {
  const key = ev.media_id || ev.id;
  const existing = await env.DB.prepare(
    "SELECT id FROM threads WHERE audience='instagram' AND external_id=? LIMIT 1"
  ).bind(key).first();
  if (existing) return existing.id;
  const tid = id('thr');
  await env.DB.prepare(
    `INSERT INTO threads (id, audience, subject, external_id, external_username, ref_type, ref_id, last_message_at, status, created_at, updated_at)
     VALUES (?, 'instagram', ?, ?, ?, 'ig_media', ?, ?, 'open', ?, ?)`
  ).bind(tid, 'Instagram comments', key, ev.from_username || null, ev.media_id || null, t, t, t).run();
  return tid;
}

// A pending draft: outbound + ai_drafted, with sent_at/dismissed_at both NULL until the owner acts.
async function insertDraft(env, threadId, refId, body, t) {
  const mid = id('msg');
  await env.DB.prepare(
    `INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, ref_id, created_at)
     VALUES (?,?,'outbound','instagram','ana','ana_draft',?,1,?,?)`
  ).bind(mid, threadId, body, refId, t).run();
  return mid;
}

// A special request pings the kitchen and the owner — Aña has already sent the holding reply, so
// the alert is the promise that a human follows through. Deduped per thread per day.
async function specialAlert(env, threadId, text, t) {
  try {
    await raiseAlert(env, {
      type: 'special_request',
      severity: 'action',
      title: 'Instagram special request — Aña is holding',
      body: `"${String(text || '').slice(0, 180)}" — Aña told them we are checking with the kitchen. Someone needs to actually check.`,
      dedupe_key: `special:${threadId}:${new Date(t).toISOString().slice(0, 10)}`,
    });
  } catch { /* the thread row still exists either way */ }
}

// Mark a draft as auto-sent. sender_role 'ana_auto' keeps the audit trail honest: the owner can
// always tell which replies a human approved and which Aña sent herself.
async function markSent(env, mid, t) {
  try {
    await env.DB.prepare("UPDATE messages SET sent_at=?, sender_role='ana_auto' WHERE id=? AND sent_at IS NULL").bind(t, mid).run();
    return true;
  } catch { return false; }
}

// Aña refused to draft (angry / medical / refund). The marker row carries the reason into the
// thread and, because sender_role is not 'ana_draft', the send op cannot ever send it. It also
// stops the tick re-asking Aña about the same message every minute.
async function insertEscalation(env, threadId, refId, reason, t) {
  await env.DB.prepare(
    `INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, ref_id, dismissed_at, created_at)
     VALUES (?,?,'outbound','instagram','ana','ana_escalation',?,0,?,?,?)`
  ).bind(id('msg'), threadId, `Aña escalated this to you — ${String(reason || 'needs the owner').slice(0, 200)}. No reply was drafted.`, refId, t, t).run();
}
