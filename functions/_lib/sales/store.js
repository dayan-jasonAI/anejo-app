// Sales OS — the data layer: organizations, contacts, evidence, scores, opportunities, stops.
// Files under functions/_lib are NOT routed.
//
// Every write that matters lands twice: in sales_activity (the Sales workspace's own append-only
// feed) and, through _lib/track.js capture(), in the global activity_log the owner already reads.
// Telemetry properties carry IDS AND COUNTS ONLY — no names, emails, phones, or message text
// (tracking plan pii_policy: none).
import { id, now, toJson, parseJson } from '../hub.js';
import { randToken } from '../util.js';
import { capture } from '../track.js';
import { kitchenOrigin } from '../geo.js';
import {
  normalizeOrgName, normalizeWebsite, domainOf, dedupeKey, normEmail, phoneDigits, formatPhone, zip5,
  splitName, cleanText, emailDomain, cityKey, streetKey,
} from './normalize.js';
import { scoreOrganization, classifyCategory, haversineMiles, SENDABLE_EMAIL_STATUSES } from './scoring.js';
import { configHash } from './config.js';
import { ICP_CATEGORIES } from './anejo.js';

export const ORG_STATUSES = ['discovered', 'researching', 'qualified', 'disqualified', 'active_opportunity', 'converted', 'suppressed'];
export const OPP_STAGES = ['qualified', 'outreach_ready', 'contacted', 'engaged', 'meeting_requested', 'meeting_booked',
  'tasting', 'proposal', 'negotiating', 'won', 'lost', 'nurture'];
export const CLOSED_STAGES = ['won', 'lost'];
export const EMAIL_STATUSES = ['none', 'public_site', 'owner_provided', 'owner_verified', 'provider_verified',
  'self_provided', 'unverified_guess', 'bounced', 'invalid'];
export const ROLE_CATEGORIES = ['executive_director', 'administrator', 'operations_director', 'office_manager',
  'program_director', 'facility_manager', 'procurement', 'owner_executive', 'admissions', 'general_office', 'other'];

const STAGE_EVENTS = {
  meeting_requested: 'sales.meeting_requested',
  meeting_booked: 'sales.meeting_booked',
  lost: 'sales.opportunity_lost',
};

const s = (v, max = 200) => {
  const t = String(v == null ? '' : v).trim();
  return t ? t.slice(0, max) : null;
};
const intOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const actorOf = (ctx) => (ctx && ctx.distinct_id) || (ctx && ctx.email) || 'system';

async function rows(env, sql, ...args) {
  try { const r = await env.DB.prepare(sql).bind(...args).all(); return (r && r.results) || []; } catch { return []; }
}
async function row(env, sql, ...args) {
  try { return (await env.DB.prepare(sql).bind(...args).first()) || null; } catch { return null; }
}

// ---------------------------------------------------------------- activity + telemetry

/**
 * Append to sales_activity, and mirror to activity_log/PostHog when an `event` is named.
 * `detail` is for the Sales feed (may name the org); `props` go to telemetry and must be ids/counts.
 */
export async function logActivity(env, { organization_id, opportunity_id, contact_id, outreach_id, kind, detail, actor, ctx, event, props } = {}) {
  if (!env || !env.DB || !kind) return;
  try {
    await env.DB.prepare(
      'INSERT INTO sales_activity (id, organization_id, opportunity_id, contact_id, outreach_id, kind, detail_json, actor, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(id('sact'), organization_id || null, opportunity_id || null, contact_id || null, outreach_id || null,
      kind, detail ? toJson(detail) : null, actor || actorOf(ctx), now()).run();
  } catch { /* the feed must never break the action it describes */ }
  if (event) {
    await capture(env, {
      event,
      distinct_id: ctx ? ctx.distinct_id : undefined,
      role: ctx ? ctx.role : 'system',
      team: ctx ? ctx.team : undefined,
      actor_type: ctx && ctx.distinct_id ? 'human' : 'system',
      properties: {
        organization_id: organization_id || null,
        opportunity_id: opportunity_id || null,
        outreach_id: outreach_id || null,
        ...(props || {}),
      },
    });
  }
}

// ---------------------------------------------------------------- evidence

/** Immutable evidence row. captured is sanitised: text only, bounded to 8 KB serialised. */
export async function recordSource(env, { organization_id, contact_id, source_type, source_url, external_id, captured }) {
  let json = null;
  if (captured != null) {
    json = JSON.stringify(captured, (_k, v) => (typeof v === 'string' ? cleanText(v, 1200) : v));
    if (json.length > 8000) json = JSON.stringify({ truncated: true, excerpt: json.slice(0, 7800) });
  }
  const sid = id('ssrc');
  try {
    await env.DB.prepare(
      'INSERT INTO sales_prospect_sources (id, organization_id, contact_id, source_type, source_url, external_id, captured_json, captured_at) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(sid, organization_id, contact_id || null, source_type, s(source_url, 600), s(external_id, 200), json, now()).run();
    return sid;
  } catch { return null; }
}

// ---------------------------------------------------------------- organizations

function cleanOrgInput(input = {}) {
  const website = normalizeWebsite(input.website);
  const street = s(input.street, 160);
  const city = s(input.city, 80);
  const zip = zip5(input.zip) || s(input.zip, 12);
  const name = s(input.name, 160);
  const county = s(String(input.county || '').replace(/\s*county\s*$/i, ''), 60);
  const state = (s(input.state, 20) || 'FL').toUpperCase();
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  return {
    name,
    normalized_name: normalizeOrgName(name),
    website,
    domain: domainOf(website),
    phone: formatPhone(input.phone) || null,
    street, city, state, zip, county,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    source: s(input.source, 40) || 'manual',
    source_external_id: s(input.source_external_id, 200),
    provider_status: s(input.provider_status, 40),
    business_category: input.business_category && ICP_CATEGORIES[input.business_category] ? input.business_category : null,
    employee_or_capacity_hint: s(input.employee_or_capacity_hint, 80),
    notes: s(input.notes, 2000),
    types: Array.isArray(input.types) ? input.types.slice(0, 12).map(String) : [],
  };
}

/** Find the row this record is a duplicate of, in the spec's order of trust. */
export async function findExistingOrganization(env, rec) {
  if (rec.source_external_id) {
    const r = await row(env, 'SELECT * FROM sales_organizations WHERE source = ? AND source_external_id = ?', rec.source, rec.source_external_id);
    if (r) return r;
  }
  const key = dedupeKey(rec);
  const byKey = await row(env, 'SELECT * FROM sales_organizations WHERE dedupe_key = ?', key);
  if (byKey) return byKey;
  const where = zip5(rec.zip);
  const sk = streetKey(rec.street);
  if (rec.domain) {
    const candidates = await rows(env, 'SELECT * FROM sales_organizations WHERE domain = ? LIMIT 50', rec.domain);
    const hit = candidates.find((c) =>
      (sk && streetKey(c.street) === sk) ||
      (!sk && where && zip5(c.zip) === where && c.normalized_name === rec.normalized_name) ||
      (!sk && !where && c.normalized_name === rec.normalized_name));
    if (hit) return hit;
  }
  if (rec.normalized_name) {
    const candidates = await rows(env, 'SELECT * FROM sales_organizations WHERE normalized_name = ? LIMIT 50', rec.normalized_name);
    const hit = candidates.find((c) =>
      (where && zip5(c.zip) === where) ||
      (!where && rec.city && cityKey(c.city) === cityKey(rec.city)) ||
      (sk && streetKey(c.street) === sk));
    if (hit) return hit;
  }
  return null;
}

/**
 * Insert a discovered/imported/manual organization, or merge into the row it duplicates.
 * Merging only FILLS BLANKS — a discovery run never overwrites what the owner typed.
 * Returns { ok, organization_id, created } or { ok:false, error }.
 */
export async function upsertOrganization(env, input, { ctx, captured, source_url } = {}) {
  const rec = cleanOrgInput(input);
  if (!rec.name || rec.normalized_name.length < 2) return { ok: false, error: 'An organization needs a name.' };
  const t = now();

  const existing = await findExistingOrganization(env, rec);
  if (existing) {
    const fill = {};
    for (const k of ['website', 'domain', 'phone', 'street', 'city', 'state', 'zip', 'county', 'lat', 'lng', 'provider_status', 'employee_or_capacity_hint']) {
      if ((existing[k] === null || existing[k] === '' || existing[k] === undefined) && rec[k] != null) fill[k] = rec[k];
    }
    // A provider saying a place has permanently closed is news even when the field was set.
    if (rec.provider_status && rec.provider_status !== existing.provider_status && /closed/i.test(rec.provider_status)) fill.provider_status = rec.provider_status;
    if (Object.keys(fill).length) {
      const cols = Object.keys(fill);
      await env.DB.prepare(`UPDATE sales_organizations SET ${cols.map((c) => `${c}=?`).join(', ')}, updated_at=? WHERE id=?`)
        .bind(...cols.map((c) => fill[c]), t, existing.id).run();
    }
    if (captured || source_url) {
      await recordSource(env, { organization_id: existing.id, source_type: rec.source === 'google_places' ? 'google_places' : rec.source === 'csv' ? 'csv_row' : 'manual_entry', source_url, external_id: rec.source_external_id, captured });
    }
    return { ok: true, organization_id: existing.id, created: false, filled: Object.keys(fill) };
  }

  const cat = rec.business_category || classifyCategory({ name: rec.name, types: rec.types }, ICP_CATEGORIES).key;
  const oid = id('sorg');
  const key = dedupeKey(rec);
  try {
    await env.DB.prepare(
      `INSERT INTO sales_organizations (id, name, normalized_name, dedupe_key, website, domain, phone, street, city, state, zip, county,
         lat, lng, business_category, category_locked, source, source_external_id, provider_status, status, employee_or_capacity_hint,
         notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'discovered',?,?,?,?,?)`
    ).bind(oid, rec.name, rec.normalized_name, key, rec.website, rec.domain, rec.phone, rec.street, rec.city, rec.state, rec.zip,
      rec.county, rec.lat, rec.lng, cat, rec.business_category ? 1 : 0, rec.source, rec.source_external_id, rec.provider_status,
      rec.employee_or_capacity_hint, rec.notes, actorOf(ctx), t, t).run();
  } catch (e) {
    // Lost a race to a concurrent insert of the same place: the UNIQUE index held. Return the winner.
    const again = await findExistingOrganization(env, rec);
    if (again) return { ok: true, organization_id: again.id, created: false, filled: [] };
    return { ok: false, error: 'Could not save the organization.', detail: String((e && e.message) || e).slice(0, 160) };
  }
  await recordSource(env, {
    organization_id: oid,
    source_type: rec.source === 'google_places' ? 'google_places' : rec.source === 'csv' ? 'csv_row' : 'manual_entry',
    source_url, external_id: rec.source_external_id, captured: captured || null,
  });
  await logActivity(env, {
    organization_id: oid, kind: 'discovery', ctx,
    detail: { source: rec.source, name: rec.name, category: cat },
    event: 'sales.organization_discovered', props: { source: rec.source, category: cat },
  });
  return { ok: true, organization_id: oid, created: true };
}

const ORG_EDITABLE = ['name', 'website', 'phone', 'street', 'city', 'state', 'zip', 'county', 'business_category',
  'employee_or_capacity_hint', 'notes'];

/** Owner edit. Setting a category locks it so enrichment never overrides his judgement. */
export async function updateOrganization(env, orgId, patch = {}, { ctx } = {}) {
  const org = await row(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return { ok: false, error: 'Organization not found.' };
  const set = {};
  for (const k of ORG_EDITABLE) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    if (k === 'business_category') {
      if (patch.business_category && !ICP_CATEGORIES[patch.business_category]) return { ok: false, error: 'Unknown category.' };
      set.business_category = patch.business_category || null;
      set.category_locked = patch.business_category ? 1 : 0;
    } else if (k === 'website') {
      set.website = normalizeWebsite(patch.website);
      set.domain = domainOf(set.website);
    } else if (k === 'phone') set.phone = formatPhone(patch.phone) || s(patch.phone, 30);
    else if (k === 'zip') set.zip = zip5(patch.zip) || s(patch.zip, 12);
    else if (k === 'name') {
      const n = s(patch.name, 160);
      if (!n) return { ok: false, error: 'Name cannot be empty.' };
      set.name = n; set.normalized_name = normalizeOrgName(n);
    } else set[k] = s(patch[k], k === 'notes' ? 2000 : 160);
  }
  if (!Object.keys(set).length) return { ok: true, organization_id: orgId, changed: [] };
  const cols = Object.keys(set);
  await env.DB.prepare(`UPDATE sales_organizations SET ${cols.map((c) => `${c}=?`).join(', ')}, updated_at=? WHERE id=?`)
    .bind(...cols.map((c) => set[c]), now(), orgId).run();
  await logActivity(env, { organization_id: orgId, kind: 'edit', ctx, detail: { changed: cols } });
  return { ok: true, organization_id: orgId, changed: cols };
}

// ---------------------------------------------------------------- contacts

function allowedToEmail(status, suppressed) {
  return !suppressed && SENDABLE_EMAIL_STATUSES.includes(status) ? 1 : 0;
}

/**
 * Add a contact, or return the one it duplicates. Nothing is promoted: a name found on a page is
 * `confidence:'low'|'medium'`, an email constructed by anyone is `unverified_guess` and NOT sendable.
 * SMS and voice are never enabled here — a phone number is not consent.
 */
export async function addContact(env, organizationId, input = {}, { ctx, source = 'manual', source_url } = {}) {
  const org = await row(env, 'SELECT id, domain FROM sales_organizations WHERE id = ?', organizationId);
  if (!org) return { ok: false, error: 'Organization not found.' };
  const email = normEmail(input.email);
  if (input.email && !email) return { ok: false, error: 'That email address does not look valid.' };
  const phone = formatPhone(input.phone);
  const nm = splitName(input.full_name || [input.first_name, input.last_name].filter(Boolean).join(' '));
  if (!email && !nm.full && !phone) return { ok: false, error: 'A contact needs a name, an email, or a phone number.' };

  let emailStatus = EMAIL_STATUSES.includes(input.email_status) ? input.email_status : null;
  if (!emailStatus) emailStatus = !email ? 'none' : source === 'website' ? 'public_site' : 'owner_provided';
  if (!email) emailStatus = 'none';

  const blocked = email ? await isEmailBlocked(env, email) : { blocked: false };
  const suppressed = blocked.blocked ? 1 : 0;
  const key = email ? `${organizationId}|e:${email}` : nm.full ? `${organizationId}|n:${nm.full.toLowerCase()}` : `${organizationId}|p:${phoneDigits(phone)}`;

  const existing = await row(env, 'SELECT * FROM sales_contacts WHERE dedupe_key = ?', key);
  if (existing) {
    // Fill blanks only (a later page may name the person behind an address we already had).
    const fill = {};
    if (!existing.full_name && nm.full) { fill.full_name = nm.full; fill.first_name = nm.first; fill.last_name = nm.last; }
    if (!existing.title && input.title) fill.title = s(input.title, 120);
    if ((!existing.role_category || existing.role_category === 'other') && input.role_category) fill.role_category = input.role_category;
    if (!existing.phone && phone) { fill.phone = phone; fill.phone_status = source === 'website' ? 'public_site' : 'owner_provided'; }
    if (Object.keys(fill).length) {
      const cols = Object.keys(fill);
      await env.DB.prepare(`UPDATE sales_contacts SET ${cols.map((c) => `${c}=?`).join(', ')}, updated_at=? WHERE id=?`)
        .bind(...cols.map((c) => fill[c]), now(), existing.id).run();
    }
    return { ok: true, contact_id: existing.id, created: false };
  }

  // A merge key can also miss when the same address arrives with a name the first time and without
  // one the second. Match on the email within the org before inserting a second row for it.
  if (email) {
    const same = await row(env, 'SELECT id FROM sales_contacts WHERE organization_id = ? AND email = ?', organizationId, email);
    if (same) return { ok: true, contact_id: same.id, created: false };
  }

  const cid = id('scon');
  const t = now();
  const role = ROLE_CATEGORIES.includes(input.role_category) ? input.role_category : null;
  const confidence = ['verified', 'high', 'medium', 'low'].includes(input.confidence) ? input.confidence : (source === 'manual' ? 'high' : 'low');
  try {
    await env.DB.prepare(
      `INSERT INTO sales_contacts (id, organization_id, dedupe_key, first_name, last_name, full_name, title, email, phone, role_category,
         source, source_url, confidence, email_status, phone_status, marketing_email_allowed, marketing_sms_allowed, voice_allowed,
         suppressed, is_primary, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?)`
    ).bind(cid, organizationId, key, nm.first, nm.last, nm.full, s(input.title, 120), email, phone, role,
      source, s(source_url, 600), confidence, emailStatus, phone ? (source === 'website' ? 'public_site' : 'owner_provided') : 'none',
      allowedToEmail(emailStatus, suppressed), suppressed, input.is_primary ? 1 : 0, t, t).run();
  } catch {
    const again = await row(env, 'SELECT id FROM sales_contacts WHERE dedupe_key = ?', key);
    if (again) return { ok: true, contact_id: again.id, created: false };
    return { ok: false, error: 'Could not save the contact.' };
  }
  await logActivity(env, {
    organization_id: organizationId, contact_id: cid, kind: 'contact_added', ctx,
    detail: { source, role_category: role, email_status: emailStatus, has_email: !!email, own_domain: !!(email && org.domain && emailDomain(email) === org.domain) },
  });
  return { ok: true, contact_id: cid, created: true };
}

/** Owner edit of a contact. Channel permissions for SMS/voice cannot be switched on here. */
export async function updateContact(env, contactId, patch = {}, { ctx } = {}) {
  const c = await row(env, 'SELECT * FROM sales_contacts WHERE id = ?', contactId);
  if (!c) return { ok: false, error: 'Contact not found.' };
  if (patch.marketing_sms_allowed || patch.voice_allowed) {
    return { ok: false, error: 'SMS and voice outreach to prospects are not enabled in this release. A discovered phone number is not consent.' };
  }
  const set = {};
  if ('full_name' in patch) { const n = splitName(patch.full_name); set.full_name = n.full; set.first_name = n.first; set.last_name = n.last; }
  if ('title' in patch) set.title = s(patch.title, 120);
  if ('role_category' in patch) set.role_category = ROLE_CATEGORIES.includes(patch.role_category) ? patch.role_category : null;
  if ('phone' in patch) { set.phone = formatPhone(patch.phone); set.phone_status = set.phone ? 'owner_provided' : 'none'; }
  if ('email' in patch) {
    const e = normEmail(patch.email);
    if (patch.email && !e) return { ok: false, error: 'That email address does not look valid.' };
    set.email = e;
    set.email_status = e ? (EMAIL_STATUSES.includes(patch.email_status) ? patch.email_status : 'owner_provided') : 'none';
    set.dedupe_key = e ? `${c.organization_id}|e:${e}` : c.dedupe_key;
  } else if ('email_status' in patch && EMAIL_STATUSES.includes(patch.email_status)) set.email_status = patch.email_status;
  if ('is_primary' in patch) set.is_primary = patch.is_primary ? 1 : 0;
  const email = 'email' in set ? set.email : c.email;
  const status = set.email_status || c.email_status;
  const blocked = email ? (await isEmailBlocked(env, email)).blocked : false;
  set.suppressed = blocked || c.suppressed ? 1 : 0;
  set.marketing_email_allowed = email ? allowedToEmail(status, set.suppressed) : 0;
  const cols = Object.keys(set);
  try {
    await env.DB.prepare(`UPDATE sales_contacts SET ${cols.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`)
      .bind(...cols.map((k) => set[k]), now(), contactId).run();
  } catch { return { ok: false, error: 'Another contact at this organization already has that email.' }; }
  if (set.is_primary) {
    await env.DB.prepare('UPDATE sales_contacts SET is_primary=0 WHERE organization_id=? AND id<>?').bind(c.organization_id, contactId).run();
  }
  await logActivity(env, { organization_id: c.organization_id, contact_id: contactId, kind: 'contact_edited', ctx, detail: { changed: cols } });
  return { ok: true, contact_id: contactId };
}

// ---------------------------------------------------------------- suppression

/**
 * Is this address out of bounds for prospecting? Checked at draft, at approval, and IMMEDIATELY
 * before delivery. Fails CLOSED: if the lookup itself errors we report blocked, because a missed
 * opt-out is a legal problem and a delayed cold email is not.
 */
export async function isEmailBlocked(env, email) {
  const e = normEmail(email);
  if (!e) return { blocked: true, why: 'no valid address' };
  try {
    const su = await env.DB.prepare("SELECT id FROM sales_unsubscribes WHERE email = ? AND channel IN ('email','all') LIMIT 1").bind(e).first();
    if (su) return { blocked: true, why: 'unsubscribed from Añejo prospecting' };
    const cu = await env.DB.prepare("SELECT id FROM campaign_unsubscribes WHERE LOWER(email) = ? AND channel IN ('email','all') LIMIT 1").bind(e).first();
    if (cu) return { blocked: true, why: 'unsubscribed from Añejo marketing email' };
    const es = await env.DB.prepare('SELECT reason FROM email_suppressions WHERE email = ?').bind(e).first();
    if (es) return { blocked: true, why: `suppressed (${es.reason})` };
    const sc = await env.DB.prepare('SELECT id FROM sales_contacts WHERE email = ? AND suppressed = 1 LIMIT 1').bind(e).first();
    if (sc) return { blocked: true, why: 'contact marked do-not-contact' };
    return { blocked: false, why: null };
  } catch {
    return { blocked: true, why: 'suppression check unavailable — not sending' };
  }
}

/**
 * Stop every active sequence for an opportunity and/or contact, and cancel anything drafted or
 * approved but not yet sent. The one function every stop condition calls, so they cannot drift.
 */
export async function stopSequences(env, { opportunity_id, contact_id, reason, ctx } = {}) {
  if (!opportunity_id && !contact_id) return { stopped: 0, canceled: 0 };
  const t = now();
  const where = opportunity_id && contact_id ? '(opportunity_id = ? OR contact_id = ?)' : opportunity_id ? 'opportunity_id = ?' : 'contact_id = ?';
  const args = opportunity_id && contact_id ? [opportunity_id, contact_id] : [opportunity_id || contact_id];
  const e = await env.DB.prepare(
    `UPDATE sales_enrollments SET status='stopped', stop_reason=?, stopped_at=?, next_step_at=NULL, updated_at=? WHERE status='active' AND ${where}`
  ).bind(String(reason || 'manual').slice(0, 40), t, t, ...args).run();
  const o = await env.DB.prepare(
    `UPDATE sales_outreach SET status='canceled', failure_reason=?, updated_at=? WHERE status IN ('pending_approval','approved') AND ${where}`
  ).bind(`sequence stopped: ${String(reason || 'manual').slice(0, 40)}`, t, ...args).run();
  const stopped = (e.meta && e.meta.changes) || 0;
  const canceled = (o.meta && o.meta.changes) || 0;
  if (stopped || canceled) {
    await logActivity(env, { opportunity_id: opportunity_id || null, contact_id: contact_id || null, kind: 'sequence_stopped', ctx, detail: { reason, stopped, canceled } });
  }
  return { stopped, canceled };
}

/** Record a prospect opt-out: suppress the address everywhere and stop everything aimed at it. */
export async function recordSalesUnsubscribe(env, { email, contact_id, organization_id, reason, source = 'link', channel = 'email', ctx } = {}) {
  const e = normEmail(email);
  if (!e && !contact_id) return { ok: false };
  const t = now();
  try {
    await env.DB.prepare(
      'INSERT INTO sales_unsubscribes (id, email, phone, channel, organization_id, contact_id, reason, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(id('suns'), e, null, ['email', 'sms', 'voice', 'all'].includes(channel) ? channel : 'email', organization_id || null,
      contact_id || null, s(reason, 200), s(source, 30) || 'link', t).run();
  } catch { return { ok: false }; }
  const ids = e ? (await rows(env, 'SELECT id FROM sales_contacts WHERE email = ?', e)).map((r) => r.id) : [];
  if (contact_id && !ids.includes(contact_id)) ids.push(contact_id);
  for (const cid of ids) {
    await env.DB.prepare('UPDATE sales_contacts SET suppressed=1, marketing_email_allowed=0, updated_at=? WHERE id=?').bind(t, cid).run();
    await stopSequences(env, { contact_id: cid, reason: source === 'bounce' ? 'bounce' : source === 'complaint' ? 'complaint' : 'unsubscribe', ctx });
  }
  await logActivity(env, { organization_id, contact_id, kind: 'unsubscribe', actor: ctx ? undefined : 'prospect', ctx, detail: { source }, event: null });
  return { ok: true, contacts: ids.length };
}

/** Owner do-not-contact for a whole organization. */
export async function suppressOrganization(env, orgId, { reason, ctx } = {}) {
  const org = await row(env, 'SELECT id FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return { ok: false, error: 'Organization not found.' };
  const t = now();
  await env.DB.prepare("UPDATE sales_organizations SET do_not_contact=1, status='suppressed', updated_at=? WHERE id=?").bind(t, orgId).run();
  await env.DB.prepare('UPDATE sales_contacts SET suppressed=1, marketing_email_allowed=0, updated_at=? WHERE organization_id=?').bind(t, orgId).run();
  for (const o of await rows(env, 'SELECT id FROM sales_opportunities WHERE organization_id = ?', orgId)) {
    await stopSequences(env, { opportunity_id: o.id, reason: 'do_not_contact', ctx });
  }
  await logActivity(env, { organization_id: orgId, kind: 'do_not_contact', ctx, detail: { reason: s(reason, 200) } });
  return { ok: true };
}

// ---------------------------------------------------------------- scoring

async function distanceFor(env, org) {
  // NULL coordinates are unknown, not the equator (Number(null) === 0).
  if (org.lat == null || org.lng == null || org.lat === '' || org.lng === '') return null;
  if (!Number.isFinite(Number(org.lat)) || !Number.isFinite(Number(org.lng))) return null;
  const here = { lat: Number(org.lat), lng: Number(org.lng) };
  const origins = [];
  const k = kitchenOrigin(env);
  if (k) origins.push(k);
  for (const r of await rows(env, "SELECT delivery_lat AS lat, delivery_lng AS lng FROM contract_sites WHERE active = 1 AND delivery_lat IS NOT NULL AND delivery_lng IS NOT NULL")) {
    origins.push({ lat: r.lat, lng: r.lng });
  }
  const ds = origins.map((o) => haversineMiles(here, o)).filter((d) => d != null);
  return ds.length ? Math.min(...ds) : null;
}

/** Signals from the evidence rows (the enrichment stores them there), newest capture first. */
export async function signalsFor(env, orgId) {
  const out = [];
  const seen = new Set();
  for (const r of await rows(env, "SELECT source_url, captured_json FROM sales_prospect_sources WHERE organization_id = ? AND source_type = 'website_page' ORDER BY captured_at DESC LIMIT 40", orgId)) {
    const cap = parseJson(r.captured_json, {}) || {};
    for (const sig of Array.isArray(cap.signals) ? cap.signals : []) {
      const k = `${sig.kind}|${sig.snippet}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ kind: sig.kind, snippet: sig.snippet, value: sig.value == null ? null : sig.value, url: sig.url || r.source_url });
    }
  }
  return out;
}

export async function buildFacts(env, orgId) {
  const org = await row(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return null;
  const contacts = await rows(env, 'SELECT full_name, title, email, email_status, role_category, phone, suppressed, confidence FROM sales_contacts WHERE organization_id = ?', orgId);
  const sib = org.domain ? await row(env, 'SELECT COUNT(*) AS n FROM sales_organizations WHERE domain = ? AND id <> ?', org.domain, orgId) : null;
  return {
    organization: org,
    signals: await signalsFor(env, orgId),
    contacts,
    sibling_count: sib ? Number(sib.n) || 0 : 0,
    distance_miles: await distanceFor(env, org),
  };
}

/** Score, store the reasons, and move the org's status along the discovered → qualified path. */
export async function scoreAndStore(env, orgId, { cfg, ctx } = {}) {
  const facts = await buildFacts(env, orgId);
  if (!facts) return { ok: false, error: 'Organization not found.' };
  const result = scoreOrganization(facts, cfg.icp, cfg.service_area);
  const t = now();
  await env.DB.prepare(
    'INSERT INTO sales_scores (id, organization_id, score, tier, criteria_json, disqualified_by, model_version, config_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(id('sscr'), orgId, result.score, result.tier, toJson(result.criteria),
    result.disqualified_by.length ? toJson(result.disqualified_by) : null, result.model_version,
    configHash({ icp: cfg.icp, area: cfg.service_area }), t).run();

  const status = facts.organization.status;
  let next = status;
  if (['discovered', 'researching', 'qualified', 'disqualified'].includes(status)) {
    if (result.tier === 'A' || result.tier === 'B') next = 'qualified';
    else if (result.tier === 'D') next = 'disqualified';
    else next = facts.organization.last_enriched_at ? 'researching' : status === 'discovered' ? 'discovered' : 'researching';
  }
  await env.DB.prepare('UPDATE sales_organizations SET current_score=?, current_tier=?, last_scored_at=?, status=?, updated_at=? WHERE id=?')
    .bind(result.score, result.tier, t, next, t, orgId).run();
  await logActivity(env, {
    organization_id: orgId, kind: 'score', ctx,
    detail: { score: result.score, tier: result.tier, disqualified_by: result.disqualified_by },
    event: 'sales.prospect_scored', props: { score: result.score, tier: result.tier, model_version: result.model_version },
  });
  return { ok: true, ...result, status: next };
}

// ---------------------------------------------------------------- opportunities

/** Idempotent: an organization has at most one OPEN opportunity; asking again returns it. */
export async function createOpportunity(env, orgId, { primary_contact_id, ctx } = {}) {
  const org = await row(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return { ok: false, error: 'Organization not found.' };
  if (org.do_not_contact || org.status === 'suppressed') return { ok: false, error: 'This organization is marked do-not-contact.' };
  const open = await row(env, "SELECT * FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost')", orgId);
  if (open) return { ok: true, opportunity_id: open.id, created: false };

  let contactId = primary_contact_id || null;
  if (contactId) {
    const c = await row(env, 'SELECT id FROM sales_contacts WHERE id = ? AND organization_id = ?', contactId, orgId);
    if (!c) return { ok: false, error: 'That contact does not belong to this organization.' };
  } else {
    const best = await row(env,
      `SELECT id FROM sales_contacts WHERE organization_id = ? AND suppressed = 0 AND marketing_email_allowed = 1
        ORDER BY is_primary DESC, CASE WHEN full_name IS NOT NULL THEN 0 ELSE 1 END, created_at LIMIT 1`, orgId);
    contactId = best ? best.id : null;
  }
  const oid = id('sopp');
  const t = now();
  try {
    await env.DB.prepare(
      `INSERT INTO sales_opportunities (id, organization_id, primary_contact_id, stage, owner, landing_token, source, tier_at_creation,
         stage_changed_at, created_by, created_at, updated_at) VALUES (?,?,?,'qualified',?,?,?,?,?,?,?,?)`
    ).bind(oid, orgId, contactId, actorOf(ctx), randToken(16), org.source, org.current_tier || null, t, actorOf(ctx), t, t).run();
  } catch {
    const again = await row(env, "SELECT id FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost')", orgId);
    if (again) return { ok: true, opportunity_id: again.id, created: false };
    return { ok: false, error: 'Could not create the opportunity.' };
  }
  await env.DB.prepare("UPDATE sales_organizations SET status='active_opportunity', updated_at=? WHERE id=? AND status NOT IN ('converted','suppressed')").bind(t, orgId).run();
  await logActivity(env, {
    organization_id: orgId, opportunity_id: oid, kind: 'opportunity_created', ctx,
    detail: { tier: org.current_tier, score: org.current_score },
    event: 'sales.opportunity_created', props: { tier: org.current_tier || null, source: org.source },
  });
  return { ok: true, opportunity_id: oid, created: true };
}

const STOPPING_STAGES = { lost: 'lost', nurture: 'nurture' };

/** Move a stage. `won` is refused here: it happens only through Convert to Contract Account. */
export async function setStage(env, oppId, stage, { loss_reason, ctx, note } = {}) {
  if (!OPP_STAGES.includes(stage)) return { ok: false, error: 'Unknown stage.' };
  if (stage === 'won') return { ok: false, error: 'An opportunity is won by converting it to a contract account, not by changing its stage.' };
  const opp = await row(env, 'SELECT * FROM sales_opportunities WHERE id = ?', oppId);
  if (!opp) return { ok: false, error: 'Opportunity not found.' };
  if (CLOSED_STAGES.includes(opp.stage)) return { ok: false, error: `This opportunity is ${opp.stage}. Create a new one to reopen the conversation.` };
  if (opp.stage === stage) return { ok: true, opportunity_id: oppId, stage, unchanged: true };
  if (stage === 'lost' && !s(loss_reason, 200)) return { ok: false, error: 'Say why it was lost — that is what the funnel learns from.' };
  const t = now();
  await env.DB.prepare(
    'UPDATE sales_opportunities SET stage=?, stage_changed_at=?, loss_reason=COALESCE(?, loss_reason), lost_at=CASE WHEN ?=\'lost\' THEN ? ELSE lost_at END, updated_at=? WHERE id=?'
  ).bind(stage, t, stage === 'lost' ? s(loss_reason, 200) : null, stage, t, t, oppId).run();
  if (STOPPING_STAGES[stage]) await stopSequences(env, { opportunity_id: oppId, reason: STOPPING_STAGES[stage], ctx });
  if (stage === 'lost') {
    await env.DB.prepare("UPDATE sales_organizations SET status='qualified', updated_at=? WHERE id=? AND status='active_opportunity'").bind(t, opp.organization_id).run();
  }
  await logActivity(env, {
    organization_id: opp.organization_id, opportunity_id: oppId, kind: 'stage_change', ctx,
    detail: { from: opp.stage, to: stage, note: s(note, 300), loss_reason: stage === 'lost' ? s(loss_reason, 200) : undefined },
    event: STAGE_EVENTS[stage] || null, props: { from: opp.stage, to: stage },
  });
  return { ok: true, opportunity_id: oppId, stage };
}

/** Advance automatically only FORWARD from early stages (a send never pulls a proposal back to "contacted"). */
export async function advanceStage(env, oppId, stage, ctx) {
  const order = OPP_STAGES;
  const opp = await row(env, 'SELECT stage FROM sales_opportunities WHERE id = ?', oppId);
  if (!opp || CLOSED_STAGES.includes(opp.stage) || opp.stage === 'nurture') return false;
  if (order.indexOf(stage) <= order.indexOf(opp.stage)) return false;
  const r = await setStage(env, oppId, stage, { ctx, note: 'automatic' });
  return !!(r && r.ok);
}

export async function updateOpportunity(env, oppId, patch = {}, { ctx } = {}) {
  const opp = await row(env, 'SELECT * FROM sales_opportunities WHERE id = ?', oppId);
  if (!opp) return { ok: false, error: 'Opportunity not found.' };
  const set = {};
  if ('estimated_meals_per_day' in patch) set.estimated_meals_per_day = intOrNull(patch.estimated_meals_per_day);
  if ('estimated_days_per_week' in patch) {
    const d = intOrNull(patch.estimated_days_per_week);
    if (d != null && (d < 1 || d > 7)) return { ok: false, error: 'Days per week is 1 to 7.' };
    set.estimated_days_per_week = d;
  }
  if ('estimated_monthly_revenue_cents' in patch) {
    const v = patch.estimated_monthly_revenue_cents;
    if (v !== null && v !== '' && !Number.isInteger(Number(v))) return { ok: false, error: 'Estimated monthly revenue must be whole cents.' };
    set.estimated_monthly_revenue_cents = intOrNull(v);
  }
  if ('probability' in patch) {
    const p = intOrNull(patch.probability);
    if (p != null && (p < 0 || p > 100)) return { ok: false, error: 'Probability is 0 to 100.' };
    set.probability = p;
  }
  if ('next_action' in patch) set.next_action = s(patch.next_action, 200);
  if ('next_action_at' in patch) set.next_action_at = intOrNull(patch.next_action_at);
  if ('reply_sentiment' in patch) set.reply_sentiment = ['positive', 'neutral', 'negative'].includes(patch.reply_sentiment) ? patch.reply_sentiment : null;
  if ('primary_contact_id' in patch) {
    const c = patch.primary_contact_id ? await row(env, 'SELECT id FROM sales_contacts WHERE id = ? AND organization_id = ?', patch.primary_contact_id, opp.organization_id) : null;
    if (patch.primary_contact_id && !c) return { ok: false, error: 'That contact does not belong to this organization.' };
    set.primary_contact_id = c ? c.id : null;
  }
  const cols = Object.keys(set);
  if (!cols.length) return { ok: true, opportunity_id: oppId };
  await env.DB.prepare(`UPDATE sales_opportunities SET ${cols.map((c) => `${c}=?`).join(', ')}, updated_at=? WHERE id=?`)
    .bind(...cols.map((c) => set[c]), now(), oppId).run();
  await logActivity(env, { organization_id: opp.organization_id, opportunity_id: oppId, kind: 'opportunity_edited', ctx, detail: { changed: cols } });
  return { ok: true, opportunity_id: oppId };
}

// ---------------------------------------------------------------- reads

export async function listOrganizations(env, f = {}) {
  const where = [];
  const args = [];
  if (f.tier && ['A', 'B', 'C', 'D'].includes(f.tier)) { where.push('current_tier = ?'); args.push(f.tier); }
  if (f.status && ORG_STATUSES.includes(f.status)) { where.push('status = ?'); args.push(f.status); }
  if (f.category && ICP_CATEGORIES[f.category]) { where.push('business_category = ?'); args.push(f.category); }
  if (f.county) { where.push('LOWER(county) = ?'); args.push(String(f.county).toLowerCase().replace(/\s*county$/, '')); }
  if (f.city) { where.push('LOWER(city) = ?'); args.push(String(f.city).toLowerCase()); }
  if (f.stage && OPP_STAGES.includes(f.stage)) { where.push('opp_stage = ?'); args.push(f.stage); }
  if (f.contactable === 'yes') where.push('sendable_contacts > 0');
  if (f.contactable === 'no') where.push('sendable_contacts = 0');
  if (f.sequence === 'active') where.push('active_sequences > 0');
  if (f.sequence === 'none') where.push('active_sequences = 0');
  if (f.q) { where.push('(normalized_name LIKE ? OR LOWER(city) LIKE ?)'); const q = `%${normalizeOrgName(f.q)}%`; args.push(q, `%${String(f.q).toLowerCase()}%`); }
  const limit = Math.max(1, Math.min(200, Number(f.limit) || 60));
  const offset = Math.max(0, Number(f.offset) || 0);
  const sql = `SELECT * FROM (
      SELECT o.id, o.name, o.normalized_name, o.city, o.county, o.state, o.website, o.domain, o.business_category, o.status,
             o.current_score, o.current_tier, o.source, o.last_enriched_at, o.do_not_contact, o.updated_at, o.created_at,
             (SELECT p.stage FROM sales_opportunities p WHERE p.organization_id = o.id ORDER BY CASE WHEN p.stage IN ('won','lost') THEN 1 ELSE 0 END, p.updated_at DESC LIMIT 1) AS opp_stage,
             (SELECT p.next_action FROM sales_opportunities p WHERE p.organization_id = o.id AND p.stage NOT IN ('won','lost') LIMIT 1) AS next_action,
             (SELECT p.next_action_at FROM sales_opportunities p WHERE p.organization_id = o.id AND p.stage NOT IN ('won','lost') LIMIT 1) AS next_action_at,
             (SELECT MAX(x.sent_at) FROM sales_outreach x WHERE x.organization_id = o.id) AS last_touch_at,
             (SELECT COUNT(*) FROM sales_contacts c WHERE c.organization_id = o.id AND c.suppressed = 0 AND c.marketing_email_allowed = 1) AS sendable_contacts,
             (SELECT COUNT(*) FROM sales_enrollments e JOIN sales_opportunities p ON p.id = e.opportunity_id WHERE p.organization_id = o.id AND e.status = 'active') AS active_sequences
        FROM sales_organizations o
    ) WHERE ${where.length ? where.join(' AND ') : '1=1'}
    ORDER BY CASE WHEN current_score IS NULL THEN 1 ELSE 0 END, current_score DESC, updated_at DESC
    LIMIT ? OFFSET ?`;
  return rows(env, sql, ...args, limit, offset);
}

export async function organizationDetail(env, orgId) {
  const org = await row(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return null;
  const [contacts, sources, scores, brief, opps, activity] = await Promise.all([
    rows(env, 'SELECT * FROM sales_contacts WHERE organization_id = ? ORDER BY is_primary DESC, created_at', orgId),
    rows(env, 'SELECT id, source_type, source_url, external_id, captured_json, captured_at FROM sales_prospect_sources WHERE organization_id = ? ORDER BY captured_at DESC LIMIT 30', orgId),
    rows(env, 'SELECT * FROM sales_scores WHERE organization_id = ? ORDER BY created_at DESC LIMIT 5', orgId),
    row(env, 'SELECT * FROM sales_briefs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1', orgId),
    rows(env, 'SELECT * FROM sales_opportunities WHERE organization_id = ? ORDER BY created_at DESC', orgId),
    rows(env, 'SELECT * FROM sales_activity WHERE organization_id = ? ORDER BY created_at DESC LIMIT 60', orgId),
  ]);
  const opp = opps.find((o) => !CLOSED_STAGES.includes(o.stage)) || opps[0] || null;
  const oppIds = opps.map((o) => o.id);
  let outreach = [];
  let enrollments = [];
  let proposals = [];
  if (oppIds.length) {
    const ph = oppIds.map(() => '?').join(',');
    outreach = await rows(env, `SELECT * FROM sales_outreach WHERE opportunity_id IN (${ph}) ORDER BY created_at DESC`, ...oppIds);
    enrollments = await rows(env, `SELECT * FROM sales_enrollments WHERE opportunity_id IN (${ph}) ORDER BY created_at DESC`, ...oppIds);
    proposals = await rows(env, `SELECT * FROM sales_proposals WHERE opportunity_id IN (${ph}) ORDER BY created_at DESC`, ...oppIds);
  }
  return {
    organization: org,
    contacts,
    sources: sources.map((r) => ({ ...r, captured: parseJson(r.captured_json, null), captured_json: undefined })),
    score: scores[0] ? { ...scores[0], criteria: parseJson(scores[0].criteria_json, []), disqualified_by: parseJson(scores[0].disqualified_by, []) } : null,
    score_history: scores.map((r) => ({ score: r.score, tier: r.tier, created_at: r.created_at, model_version: r.model_version })),
    brief: brief ? { ...brief, brief: parseJson(brief.brief_json, null), sources: parseJson(brief.sources_json, []), flags: parseJson(brief.flags_json, []) } : null,
    opportunity: opp,
    opportunities: opps,
    enrollments,
    outreach,
    proposals: proposals.map((p) => ({ ...p, sites: parseJson(p.sites_json, []), contacts: parseJson(p.contacts_json, []) })),
    activity: activity.map((a) => ({ ...a, detail: parseJson(a.detail_json, null) })),
  };
}

export async function getOrganization(env, orgId) {
  return row(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
}
export async function getOpportunity(env, oppId) {
  return row(env, 'SELECT * FROM sales_opportunities WHERE id = ?', oppId);
}
export async function getContact(env, contactId) {
  return row(env, 'SELECT * FROM sales_contacts WHERE id = ?', contactId);
}

export { rows as salesRows, row as salesRow };
