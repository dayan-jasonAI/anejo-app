// Shared set-up for the Sales OS tests: a real SQLite database with every migration, an owner
// session, a send-ready configuration, and one well-evidenced prospect. Nothing here reaches the
// network — fetch is stubbed per test with stubFetch().
import { ownerEnv } from './sqlite-d1.js';
import { loadSalesConfig } from '../../functions/_lib/sales/config.js';
import { upsertOrganization, addContact, scoreAndStore, createOpportunity, recordSource } from '../../functions/_lib/sales/store.js';
import { previewOutreach, approveOutreach } from '../../functions/_lib/sales/outreach.js';

export const OWNER = { type: 'staff', distinct_id: 'stf_owner', role: 'owner', email: 'owner@test.example', team: null };
// Tuesday 2026-09-15 10:00 ET (EDT = UTC-4) — inside the default weekday 9–4 send window.
export const TUESDAY_10AM_ET = Date.parse('2026-09-15T14:00:00Z');
export const SATURDAY_10AM_ET = Date.parse('2026-09-19T14:00:00Z');
export const POSTAL = '1200 N Federal Hwy, Suite 200, Boca Raton, FL 33432';

export function setting(env, key, value) {
  env.DB.sqlite.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run(key, typeof value === 'string' ? value : JSON.stringify(value), 'test', Date.now());
}

/** An env + config in which a prospect email COULD be sent: every gate satisfied. */
export async function readyEnv({ emailEnabled = true, followup = true, offer = {}, sender = {}, postal = POSTAL, flags = {}, extraEnv = {} } = {}) {
  const env = ownerEnv({ RESEND_API_KEY: 're_test', APP_BASE_URL: 'https://anejocateringco.com', ...extraEnv });
  if (emailEnabled) setting(env, 'sales.email_enabled', 'true');
  if (followup) setting(env, 'sales.followup_enabled', 'true');
  for (const [k, v] of Object.entries(flags)) setting(env, k, String(v));
  if (postal) setting(env, 'campaign.postal_address', postal);
  setting(env, 'sales.offer', { confirmed: true, ...offer });
  setting(env, 'sales.sender', {
    from_name: 'Dayan at Añejo', from_email: 'dayan@anejocateringco.com', reply_to: 'dayan@anejocateringco.com',
    signature_name: 'Dayan', signature_title: 'Owner', ...sender,
  });
  return { env, cfg: await loadSalesConfig(env) };
}

export async function reload(env) { return loadSalesConfig(env); }

export const SIGNALS = (site) => [
  { kind: 'day_program', snippet: 'Our partial hospitalization program runs Monday through Friday.', url: site + 'programs' },
  { kind: 'weekday_schedule', snippet: 'Our partial hospitalization program runs Monday through Friday.', url: site + 'programs' },
  { kind: 'meals_provided', snippet: 'Lunch is provided for clients every day.', url: site + 'programs' },
  { kind: 'capacity', value: 60, snippet: 'We serve up to 60 clients a day.', url: site + 'about' },
];

/** One prospect with website evidence, a named decision-maker with a published email, a score and an open opportunity. */
export async function seedProspect(env, cfg, {
  name = 'Sunrise Recovery Center', website = 'https://sunriserecovery.org/', city = 'Delray Beach', county = 'Palm Beach',
  street = '100 Main St', zip = '33444', email = 'mruiz@sunriserecovery.org', fullName = 'Maria Ruiz', title = 'Executive Director',
  signals = true, opportunity = true,
} = {}) {
  const u = await upsertOrganization(env, { name, website, city, county, state: 'FL', street, zip, source: 'manual' }, { ctx: OWNER });
  if (!u.ok) throw new Error('seed org failed: ' + u.error);
  const orgId = u.organization_id;
  if (signals) {
    await recordSource(env, { organization_id: orgId, source_type: 'website_page', source_url: website + 'programs', captured: { signals: SIGNALS(website) } });
  }
  let contactId = null;
  if (email || fullName) {
    const c = await addContact(env, orgId, { full_name: fullName, title, role_category: 'executive_director', email, confidence: 'medium' },
      { ctx: OWNER, source: 'website', source_url: website + 'team' });
    if (!c.ok) throw new Error('seed contact failed: ' + c.error);
    contactId = c.contact_id;
  }
  await scoreAndStore(env, orgId, { cfg, ctx: OWNER });
  let oppId = null;
  if (opportunity) oppId = (await createOpportunity(env, orgId, { primary_contact_id: contactId, ctx: OWNER })).opportunity_id;
  return { orgId, contactId, oppId };
}

/** Preview, then approve with the preview's hash — exactly what the Hub's Approve button does. */
export async function previewAndApprove(env, cfg, outreachId, { subject, body, acknowledge = false } = {}) {
  const p = await previewOutreach(env, outreachId, { cfg, subject, body });
  if (!p.ok) return p;
  return approveOutreach(env, outreachId, { cfg, subject, body, render_hash: p.render_hash, acknowledge_flags: acknowledge, ctx: OWNER });
}

/** Replace global fetch; every call is recorded with its parsed JSON body. */
export function stubFetch(handler) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: String(url), init, body });
    if (handler) return handler(String(url), init, calls.length);
    return new Response(JSON.stringify({ id: 'em_' + calls.length }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
