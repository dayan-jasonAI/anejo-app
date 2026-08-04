// The ONE place a row is ever written to `leads`. Files under _lib are NOT routed.
//
// Before 0078 there was exactly one INSERT INTO leads in the whole codebase (api/leads.js, fed by
// the public web forms). Instagram-sourced leads (_lib/social_leads.js) need the same table, and
// the whole point is that it stays the SAME table with the SAME shape — not a second, divergent
// leads path that the owner's HUB, the launch-list dedupe, and the founding-member repair all have
// to learn about separately. Both callers build a `rec` and hand it to insertLead(); nothing else
// touches this table directly.
import { id, now } from './util.js';

export const newLeadId = () => id('ld');

// rec fields not supplied default to null/0/'en'/'web' exactly as the original inline SQL in
// api/leads.js did for a web-form submission — so refactoring that endpoint onto this helper is a
// pure extraction, not a behavior change.
export async function insertLead(env, rec) {
  await env.DB
    .prepare(
      `INSERT INTO leads (id, kind, name, email, phone, company, interest, message, source_lang, sms_consent,
          marketing_sms_consent, marketing_sms_consent_at, marketing_sms_consent_src,
          src, utm_source, utm_medium, utm_campaign, referrer,
          channel, ig_username, ig_user_id, ig_intent, ig_confidence, trigger_message,
          source_thread_id, source_message_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      rec.id, rec.kind, rec.name || null, rec.email || null, rec.phone || null, rec.company || null,
      rec.interest || null, rec.message || null, rec.source_lang || 'en', rec.sms_consent ? 1 : 0,
      rec.marketing_sms_consent ? 1 : 0, rec.marketing_sms_consent_at || null, rec.marketing_sms_consent_src || null,
      rec.src || null, rec.utm_source || null, rec.utm_medium || null, rec.utm_campaign || null, rec.referrer || null,
      rec.channel || 'web', rec.ig_username || null, rec.ig_user_id || null, rec.ig_intent || null,
      rec.ig_confidence || null, rec.trigger_message || null,
      rec.source_thread_id || null, rec.source_message_id || null,
      rec.created_at || now()
    )
    .run();
}
