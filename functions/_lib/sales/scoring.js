// Sales OS — the ICP scoring engine. DETERMINISTIC, PURE, and the only thing that decides a score.
// Files under functions/_lib are NOT routed.
//
// THE RULE: a model may explain a prospect; it may not score one. The function below takes
// structured facts (organization fields, extracted signals with their source URLs, contacts, and a
// distance) plus the owner's ICP settings, and returns points per criterion WITH THE REASON for
// each. Nothing in this file reads an AI brief, imports a model client, or accepts free text as an
// input to a number — a test pins that. "Why is this clinic an A?" must always have an answer the
// owner can check against a web page.
//
// Missing facts stay missing: an unknown capacity earns zero volume points with the reason
// "no public capacity evidence", never an estimate.

export const MODEL_VERSION = 'icp-v1';

export const CRITERIA = [
  { key: 'category_fit', label: 'Category fit' },
  { key: 'recurring_meal', label: 'Recurring-meal likelihood' },
  { key: 'volume', label: 'Volume potential' },
  { key: 'route_fit', label: 'Route / geographic fit' },
  { key: 'contact_quality', label: 'Decision-maker / contact quality' },
  { key: 'multi_site', label: 'Multi-site upside' },
  { key: 'operational_fit', label: 'Operational fit' },
];

// Roles that can plausibly sign a meal-service contract, best first.
export const DECISION_ROLES = ['executive_director', 'administrator', 'operations_director', 'office_manager',
  'program_director', 'facility_manager', 'procurement', 'owner_executive'];

// An email we are allowed to put a cold note into. `unverified_guess` is deliberately absent: an
// address constructed from a name and a domain is not sendable until a verifier says otherwise.
// `self_provided` is an address the prospect typed into our own request form — they asked us to write.
export const SENDABLE_EMAIL_STATUSES = ['public_site', 'owner_provided', 'owner_verified', 'provider_verified', 'self_provided'];

const lc = (s) => String(s == null ? '' : s).toLowerCase();
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** First ICP category whose keywords appear in the name/types/text. Order of the object is priority. */
export function classifyCategory({ name, types, text } = {}, categories = {}) {
  const hay = ` ${lc(name)} ${(Array.isArray(types) ? types : []).map((t) => lc(t).replace(/_/g, ' ')).join(' ')} ${lc(text).slice(0, 4000)} `;
  for (const [key, cat] of Object.entries(categories)) {
    for (const kw of (cat && cat.keywords) || []) {
      const k = lc(kw).trim();
      if (!k) continue;
      // Word-boundary match so "rehab" does not fire inside "prerehabilitation", with an optional
      // plural so "Pediatrics" and "Recovery Centers" still match their singular keywords.
      const re = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?([^a-z]|$)`);
      if (re.test(hay)) return { key, matched: kw };
    }
  }
  return { key: null, matched: null };
}

// A missing value must stay missing. Number(null) is 0, so without this guard an organization with
// no coordinates sat at latitude 0 and a missing distance read as "0.0 mi" — full route points for
// a place we have never located. Found in the first real UI walkthrough, 2026-09-10.
const isBlank = (v) => v === null || v === undefined || v === '';

export function haversineMiles(a, b) {
  if (!a || !b) return null;
  const vals = [a.lat, a.lng, b.lat, b.lng];
  if (vals.some(isBlank)) return null;
  const [lat1, lng1, lat2, lng2] = vals.map(Number);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const R = 3958.8;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function signalsOf(facts, kind) {
  return (facts.signals || []).filter((s) => s && s.kind === kind);
}
function evidence(list, n = 2) {
  return list.slice(0, n).map((s) => ({ url: s.url || null, snippet: s.snippet || null }));
}

function capacityOf(facts) {
  const fromSignals = signalsOf(facts, 'capacity').map((s) => Number(s.value)).filter((v) => Number.isFinite(v) && v > 0);
  const hint = Number(String((facts.organization || {}).employee_or_capacity_hint || '').replace(/[^0-9]/g, ''));
  const all = [...fromSignals];
  if (Number.isFinite(hint) && hint > 0) all.push(hint);
  return all.length ? { value: Math.max(...all), from: fromSignals.length ? 'site' : 'owner' } : null;
}

function inServiceArea(org, area) {
  const county = lc(org.county).replace(/\s*county\s*$/, '').trim();
  const city = lc(org.city).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const counties = (area.counties || []).map((c) => lc(c).replace(/\s*county\s*$/, '').trim());
  const cities = (area.cities || []).map((c) => lc(c).trim());
  if (county && counties.includes(county)) return { known: true, inside: true, why: `${org.county} is in the service area` };
  if (city && cities.includes(city)) return { known: true, inside: true, why: `${org.city} is in the service area` };
  if (county || city) return { known: true, inside: false, why: `${org.city || org.county} is outside the configured service area` };
  return { known: false, inside: false, why: 'Location unknown' };
}

/**
 * Score one organization.
 *   facts = { organization, signals:[{kind, snippet, url, value?}], contacts:[…], sibling_count, distance_miles }
 *   icp   = merged owner ICP settings (see anejo.js DEFAULT_ICP), area = service area settings
 * Returns { score, tier, criteria:[…], disqualified_by:[…], model_version }.
 */
export function scoreOrganization(facts = {}, icp = {}, area = {}) {
  const org = facts.organization || {};
  const weights = icp.weights || {};
  const out = [];
  const add = (key, fraction, reasons, ev = []) => {
    const max = Math.max(0, Number(weights[key]) || 0);
    const f = clamp01(fraction);
    out.push({
      key,
      label: (CRITERIA.find((c) => c.key === key) || {}).label || key,
      points: Math.round(f * max * 10) / 10,
      max,
      fraction: Math.round(f * 100) / 100,
      reasons,
      evidence: ev,
    });
  };

  // 1. Category fit
  {
    const cat = org.business_category;
    const table = icp.category_fit || {};
    if (!cat) add('category_fit', 0, ['Category unknown — nothing in the name or site placed it in the ICP.']);
    else {
      const f = Number(table[cat]);
      add('category_fit', Number.isFinite(f) ? f : 0,
        [`Category: ${cat.replace(/_/g, ' ')} (${Math.round((Number.isFinite(f) ? f : 0) * 100)}% fit in your ICP settings)`]);
    }
  }

  // 2. Recurring-meal likelihood — people on site for a program, and food mentioned.
  {
    const program = [...signalsOf(facts, 'day_program'), ...signalsOf(facts, 'residential')];
    const meals = [...signalsOf(facts, 'meals_provided'), ...signalsOf(facts, 'meals')];
    let f = 0; const why = [];
    if (program.length) { f += 0.6; why.push('Runs a day or residential program (people on site for hours).'); }
    if (meals.length) { f += 0.4; why.push('Their site mentions meals or food.'); }
    if (!why.length) why.push('No public evidence of an on-site program or meals.');
    add('recurring_meal', f, why, evidence([...program, ...meals]));
  }

  // 3. Volume potential — stated capacity only.
  {
    const cap = capacityOf(facts);
    if (!cap) add('volume', 0, ['No public capacity evidence (beds, patients, participants).']);
    else {
      const band = (icp.volume_bands || []).find((b) => cap.value >= Number(b.min));
      add('volume', band ? Number(band.fraction) : 0,
        [`Capacity ${cap.value} (${cap.from === 'site' ? 'stated on their site' : 'entered by owner'}).`],
        evidence(signalsOf(facts, 'capacity')));
    }
  }

  // 4. Route / geographic fit.
  const areaCheck = inServiceArea(org, area);
  {
    let f = 0; const why = [areaCheck.why];
    if (areaCheck.inside) f += 0.7;
    const d = isBlank(facts.distance_miles) ? NaN : Number(facts.distance_miles);
    if (Number.isFinite(d)) {
      if (d <= Number(area.near_miles || 10)) { f += 0.3; why.push(`${d.toFixed(1)} mi from the kitchen or an existing contract site.`); }
      else if (d <= Number(area.max_miles || 30)) { f += 0.15; why.push(`${d.toFixed(1)} mi from the nearest run.`); }
      else why.push(`${d.toFixed(1)} mi from the nearest run — beyond the configured range.`);
    } else if (areaCheck.inside) why.push('Distance not measured (no coordinates).');
    add('route_fit', areaCheck.inside ? f : 0, why);
  }

  // 5. Contact quality.
  {
    const contacts = (facts.contacts || []).filter((c) => c && !c.suppressed);
    const sendable = (c) => c.email && SENDABLE_EMAIL_STATUSES.includes(c.email_status);
    const named = contacts.filter((c) => c.full_name && DECISION_ROLES.includes(c.role_category));
    let f = 0; let why;
    if (named.some(sendable)) { f = 1; why = 'Named decision-maker with a published email.'; }
    else if (contacts.some(sendable)) { f = 0.6; why = 'A published business email (role or general office).'; }
    else if (named.length) { f = 0.4; why = 'Named decision-maker, but no published email.'; }
    else if (contacts.some((c) => c.phone) || org.phone) { f = 0.2; why = 'Phone only — no email channel.'; }
    else { f = 0; why = 'No contact channel found.'; }
    add('contact_quality', f, [why]);
  }

  // 6. Multi-site upside.
  {
    const siblings = Number(facts.sibling_count) || 0;
    const ms = signalsOf(facts, 'multi_site');
    if (siblings > 0) add('multi_site', 1, [`${siblings + 1} locations share this organization's website.`]);
    else if (ms.length) add('multi_site', 1, ['Their site describes multiple locations.'], evidence(ms));
    else add('multi_site', 0, ['Single location as far as public evidence shows.']);
  }

  // 7. Operational fit.
  {
    const weekday = signalsOf(facts, 'weekday_schedule');
    const meals = [...signalsOf(facts, 'meals_provided'), ...signalsOf(facts, 'meals')];
    const kitchen = signalsOf(facts, 'in_house_kitchen');
    let f = 0; const why = [];
    if (weekday.length) { f += 0.5; why.push('Predictable weekday schedule.'); }
    if (meals.length) { f += 0.5; why.push('Meals are already part of their day.'); }
    if (kitchen.length) { f -= 0.5; why.push('Mentions an in-house kitchen or chef — may not need a vendor.'); }
    if (!why.length) why.push('No schedule or meal-service evidence.');
    add('operational_fit', f, why, evidence([...weekday, ...kitchen]));
  }

  // Hard disqualifiers → tier D regardless of points.
  const disq = [];
  if (org.do_not_contact || org.status === 'suppressed') disq.push('Marked do-not-contact.');
  if (icp.disqualify_closed !== false && /closed/i.test(String(org.provider_status || ''))) disq.push(`Provider reports ${org.provider_status}.`);
  if (icp.disqualify_out_of_area !== false && areaCheck.known && !areaCheck.inside) disq.push(areaCheck.why);

  const totalMax = out.reduce((s, c) => s + c.max, 0) || 1;
  const totalPts = out.reduce((s, c) => s + c.points, 0);
  const score = Math.round((totalPts / totalMax) * 100);
  const t = icp.tiers || { A: 80, B: 65, C: 45 };
  let tier = score >= t.A ? 'A' : score >= t.B ? 'B' : score >= t.C ? 'C' : 'D';
  if (disq.length) tier = 'D';

  return { score, tier, criteria: out, disqualified_by: disq, model_version: MODEL_VERSION };
}
