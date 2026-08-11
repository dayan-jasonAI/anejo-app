// Turn a commercially-intentioned Instagram DM/comment into a lead the owner actually sees.
// Files under _lib are NOT routed.
//
// This is the missing sales half: functions/api/hub/admin/social-inbox-tick.js calls
// captureInstagramLead() on every inbound DM/comment it processes, independent of Aña's draft
// (whether it succeeds, gets budget-throttled, or the API is down — none of that should be able
// to silently drop a sale). detectCommercialIntent() (ana_social.js) decides WHETHER a message is
// commercial; this file decides what to DO about it: write a `leads` row and, on a 'high'
// confidence hit only, raise an alert. It never drafts, never replies, never touches Instagram.
import { insertLead, newLeadId } from './leads.js';
import { detectCommercialIntent } from './ana_social.js';
import { raiseAlert } from './alerts.js';

// Best-fit mapping onto the existing `kind` enum (NOT NULL, no default — see migrations/0001)
// so Instagram leads slot into the SAME filter chips the owner already uses (Tasting/Wholesale)
// instead of inventing a third taxonomy. The finer-grained classification (which of the four
// intents this actually was) lives in ig_intent — kind is just "which bucket does this belong
// closest to", ig_intent is "what did the classifier actually see".
const KIND_BY_INTENT = {
  catering: 'tasting',
  bulk_corporate: 'tasting',
  wholesale_partnership: 'wholesale',
  subscription: 'tasting',
};

// Owner-facing label per intent, used in the alert title/body so "wholesale_partnership" never
// reaches a human as a raw enum value.
export const INTENT_LABEL = {
  catering: 'catering/event',
  bulk_corporate: 'bulk/corporate order',
  wholesale_partnership: 'wholesale/partnership',
  subscription: 'subscription/meal-plan',
};

const TRIGGER_MSG_CAP = 2000; // mirrors the `message`/social_events.text caps elsewhere in this file tree

/**
 * Detect + capture. Called once per inbound DM/comment from social-inbox-tick.js.
 *
 * Returns (never throws — a DB blip here must never take down the tick that also drafts Aña's
 * reply, which is why every failure path below is a plain return, not a re-throw):
 *   { ok:true, created:false }               — nothing commercial, or no way to attribute it
 *   { ok:true, created:false, deduped:true }  — already have a lead for this thread+person
 *   { ok:true, created:true, lead_id, intent, confidence, alerted }
 *   { ok:false }                              — DB missing/unavailable/errored; degrade silently
 */
export async function captureInstagramLead(env, { kind, threadId, igUserId, igUsername, messageId, text, t } = {}) {
  if (!env || !env.DB) return { ok: false };
  // Without WHO, there is nothing for the owner to follow up with — a lead with no handle and no
  // way back to the conversation is worse than not recording it at all, so this never even calls
  // the classifier. (In practice IG always supplies from_id; this guards a malformed webhook.)
  if (!threadId || !igUserId) return { ok: true, created: false };

  const hit = detectCommercialIntent(text);
  if (!hit) return { ok: true, created: false };

  try {
    // Idempotency lives in application logic first (a clear, fast no-op) with the unique partial
    // index (0078) as the backstop against a race between two concurrent ticks — same pattern the
    // launch-list dedupe in api/leads.js already uses (select first, only insert if absent).
    const existing = await env.DB
      .prepare('SELECT id FROM leads WHERE channel=? AND source_thread_id=? AND ig_user_id=? LIMIT 1')
      .bind('instagram', threadId, igUserId)
      .first();
    if (existing) return { ok: true, created: false, deduped: true };

    const leadId = newLeadId();
    const trigger = String(text || '').trim().slice(0, TRIGGER_MSG_CAP);
    try {
      await insertLead(env, {
        id: leadId,
        kind: KIND_BY_INTENT[hit.intent] || 'tasting',
        channel: 'instagram',
        ig_username: igUsername || null,
        ig_user_id: igUserId,
        ig_intent: hit.intent,
        ig_confidence: hit.confidence,
        trigger_message: trigger,
        source_thread_id: threadId,
        source_message_id: messageId || null,
        created_at: t,
      });
    } catch (_) {
      // Lost the race to a concurrent tick — the unique index (0078) caught it. That is success,
      // not a failure: exactly the "same DM never creates two leads" guarantee this exists for.
      const again = await env.DB
        .prepare('SELECT id FROM leads WHERE channel=? AND source_thread_id=? AND ig_user_id=? LIMIT 1')
        .bind('instagram', threadId, igUserId)
        .first();
      if (again) return { ok: true, created: false, deduped: true };
      return { ok: false };
    }

    // ALERT THRESHOLD: only 'high' confidence interrupts the owner. This is the honesty the task
    // asks for made concrete — "a maybe is not a yes" means a bare keyword mention (someone
    // browsing, asking if catering exists, or a word landing in an unrelated sentence) is worth
    // recording so it is not lost, but not worth a push notification. A 'high' hit required an
    // explicit intent verb (book/order/need/quote/…), a headcount, or belongs to a category
    // (wholesale/partnership) that is essentially never used casually — that is the bar for
    // "worth interrupting someone for" the task describes.
    let alerted = false;
    if (hit.confidence === 'high') {
      const who = igUsername ? `@${igUsername}` : (kind === 'comment' ? 'a commenter' : 'a DM');
      const label = INTENT_LABEL[hit.intent] || hit.intent;
      // A comment is PUBLIC (no DM window, no private contact info yet) — the owner needs to know
      // that up front, because the follow-up path (DM them, or wait for them to DM first) differs
      // from a DM where a reply is already legal.
      const via = kind === 'comment' ? 'a public comment' : 'a DM';
      const res = await raiseAlert(env, {
        alert_type: 'social_commercial_lead',
      // Her business as much as his (2026-08-11): she works these daily.
      notifyRoles: ['marketing'],
        severity: 'warning', // a single enquiry needs a human; the day still runs — see ALERT_SEVERITIES in alerts.js
        title: `Instagram ${label} enquiry — ${who}`,
        body: `Via ${via}: "${trigger.slice(0, 200)}" — open it in the HUB: /hub/owner/leads.html#l=${leadId}`,
        ref_type: 'lead',
        ref_id: leadId,
        source: 'social_inbox_tick',
        // One open alert per lead, not one per tick run — raiseAlert() itself de-dupes on this key.
        dedupe_key: `social_lead:${leadId}`,
      });
      alerted = !!(res && res.ok);
    }

    return { ok: true, created: true, lead_id: leadId, intent: hit.intent, confidence: hit.confidence, alerted };
  } catch {
    // Most likely cause: `leads` (or its 0078 columns) doesn't exist yet on this environment —
    // migrations are applied by hand per env in this repo. The tick's real job is drafting Aña's
    // reply; that must keep working even when this newer, optional feature can't write anywhere.
    return { ok: false };
  }
}
