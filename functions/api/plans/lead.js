// POST /api/plans/lead — OPT-IN lead capture for the free macro calculator.
//
// The calculator itself (functions/api/plans/generate.js) is deliberately STATELESS: the free
// result must never be gated on, or delayed by, a lead write. This is the separate, opt-in half —
// the visitor ticks a box and leaves an email, and only then is a row written to the SAME `leads`
// table every other capture uses (via _lib/leads.js insertLead — the one place a lead is written).
//
// It SENDS NOTHING. No welcome, no owner notification, no SMS — capturing consent to be contacted
// is not the same as contacting anyone. That stays a deliberate, owner-driven action from the HUB.
// (This is why it does not reuse the /api/leads endpoint, which fires an owner notification for
// every lead: the calculator can be submitted many times a minute, and the contract here is
// "collect quietly, send nothing.")
import { json, bad, id, now, isEmail } from '../../_lib/util.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { insertLead } from '../../_lib/leads.js';

// Same shape api/leads.js accepts, kept intentionally small — this is a low-friction capture.
function parseAttribution(b) {
  const a = (b && typeof b.attribution === 'object' && b.attribution) || b || {};
  const s = (v, n) => (String(v == null ? '' : v).trim().slice(0, n) || null);
  return {
    src: s(a.src, 64) || 'calculator',
    utm_source: s(a.utm_source, 120),
    utm_medium: s(a.utm_medium, 120),
    utm_campaign: s(a.utm_campaign, 120),
    referrer: s(a.referrer, 300),
  };
}

export const onRequestPost = async ({ request, env }) => {
  // Cost/abuse guard — a public form. Same discipline as api/leads.js.
  const limited = await limitOr429(env, request, { name: 'plans_lead', limit: 6, windowSec: 60 });
  if (limited) return limited;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const email = (b.email || '').trim().slice(0, 160);
  if (!isEmail(email)) return bad('Please enter a valid email.');
  const name = (b.name || '').trim().slice(0, 120) || null;
  const goal = (b.primary_goal || '').trim().slice(0, 60) || null;
  const lang = b.lang === 'es' ? 'es' : 'en';
  const attr = parseAttribution(b);

  // No DB configured (preview/local) — accept quietly so the page never shows an error for an
  // OPTIONAL capture that must never interfere with the free result the visitor came for.
  if (!env.DB) return json({ ok: true, stored: false });

  try {
    // Dedupe: a returning visitor re-running the calculator should not pile up rows. One calculator
    // lead per email is enough for the owner to follow up. Mirrors the select-first pattern used by
    // the launch-list dedupe and the Instagram capture.
    const existing = await env.DB
      .prepare("SELECT id FROM leads WHERE lower(email)=lower(?) AND src='calculator' LIMIT 1")
      .bind(email)
      .first();
    if (existing) return json({ ok: true, stored: false, deduped: true });

    await insertLead(env, {
      id: id('ld'),
      kind: 'tasting',                 // best-fit existing enum bucket (leads.kind is NOT NULL, no default)
      name,
      email,
      interest: 'Macro calculator',
      message: goal ? ('Free macro calculator — goal: ' + goal) : 'Free macro calculator',
      source_lang: lang,
      channel: 'web',
      src: attr.src, utm_source: attr.utm_source, utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign, referrer: attr.referrer,
      created_at: now(),
    });
    // NOTHING is sent. See file header.
    return json({ ok: true, stored: true });
  } catch {
    // Additive, optional feature — never fail the visitor. The free plan already rendered.
    return json({ ok: true, stored: false });
  }
};

// Helpful 405 for a casual GET.
export const onRequest = ({ request }) => {
  if (request.method === 'POST') return;
  return json({ error: 'Method not allowed. Use POST.' }, 405);
};
