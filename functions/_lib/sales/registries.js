// Sales OS — PUBLIC REGISTRY discovery providers. Files under functions/_lib are NOT routed.
//
// The buyers Añejo sells to are LICENSED facilities, and the state and federal governments publish
// who they are. These two providers read those registries directly, so a prospect arrives with a
// license status and (for AHCA) a licensed capacity instead of a guess:
//
//   · ahca_healthfinder    — Florida AHCA FloridaHealthFinder facility locator. State public-records
//                            data. One call = every licensed facility of one TYPE in one COUNTY,
//                            with bed count, license status and coordinates.
//   · samhsa_findtreatment — SAMHSA FindTreatment.gov locator (N-SUMHSS). U.S. Government data under
//                            the Open Database License. One call = one page of facilities within a
//                            radius of a point, with their service settings.
//
// Both return the record shape upsertOrganization() takes, like every provider. Neither ever returns
// sample data: a failed request is an error with its reason, never an empty success.
//
// VERIFIED AGAINST LIVE RESPONSES 2026-09-18, not documentation:
//   AHCA — GET the search page for its antiforgery token + cookies, POST the AdvancedSearch form,
//          follow the 302 with the same cookies; the results page embeds its rows as JSON in
//          `const data = [[{...}]];` (Name, Address, City, Zip, PhoneNumber, BedCount, LicenseStatus,
//          IsClosed, Latitude, Longitude, LicenseID, FileNumber, FacilityType). Palm Beach adult day
//          care returned 27 centers.
//   SAMHSA — `sAddr` must be "lat,lng". A free-text address is what returned a Maryland facility at
//          "0 miles" when this adapter was first probed; with coordinates, a 10-mile Boca Raton radius
//          returned 59 Florida facilities sorted by distance.
import { cleanText } from './normalize.js';

const AHCA_BASE = 'https://quality.healthfinder.fl.gov';
const SAMHSA_URL = 'https://findtreatment.gov/locator/exportsAsJson/v2';

// AHCA facility-type codes (the locator's own option values) → the ICP category they belong to.
// Only types that feed people on a schedule. Hospitals and nursing homes run their own kitchens.
export const AHCA_TYPES = {
  'Adult-DayCare': { category: 'adult_day', label: 'Adult Day Care Center' },
  Crisis: { category: 'behavioral_health', label: 'Crisis Stabilization Unit / Short Term Residential Treatment' },
  CMH: { category: 'behavioral_health', label: 'Community Mental Health: Partial Hospitalization Program' },
  RTF: { category: 'residential_care', label: 'Residential Treatment Facility' },
  ALF: { category: 'residential_care', label: 'Assisted Living Facility' },
};
// The locator's county option values.
export const AHCA_COUNTIES = { 'palm beach': '50', broward: '6', 'miami-dade': '13', 'st. lucie': '56', martin: '43' };
const OPEN_STATUSES = /^(LICENSED|ACTIVE|CONDITIONAL|PROVISIONAL)$/i;

// What a license ESTABLISHES, as scoring signals. A licensed adult day care serves a meal because the
// rule says it must; the scorer should not wait for a website to mention lunch before believing it.
// Each signal quotes its basis, so "why this score" shows a rule, not an assumption.
const LICENSE_SIGNALS = {
  adult_day: [
    { kind: 'day_program', snippet: 'AHCA-licensed adult day care center: participants attend for the day.' },
    { kind: 'meals_provided', snippet: 'Florida requires licensed adult day care centers to serve a meal providing 1/3 of the DRI to participants present 4+ hours (Rule 59A-16.105).' },
  ],
  residential: [
    { kind: 'residential', snippet: 'Licensed residential program: clients live on site.' },
    { kind: 'meals_provided', snippet: 'Licensed residential programs must serve at least three meals and a snack every day.' },
  ],
  day: [
    { kind: 'day_program', snippet: 'Licensed day program (partial hospitalization / day treatment / intensive outpatient): clients on site for hours.' },
  ],
};
const withUrl = (list, url) => list.map((x) => ({ ...x, url }));

// ---------------------------------------------------------------- name tidying

const KEEP_UPPER = new Set(['LLC', 'INC', 'PA', 'PLLC', 'LLP', 'LP', 'CORP', 'CO', 'II', 'III', 'IV', 'FAU', 'PACE', 'USA', 'DBA', 'ALF', 'ADC', 'CSU']);
const KEEP_LOWER = new Set(['and', 'of', 'the', 'at', 'for', 'in', 'on', 'by', 'to', 'a', 'an']);

/**
 * "MORSELIFE ADULT DAY CARE CENTER" → "Morselife Adult Day Care Center". The registry writes in
 * capitals, and a name in capitals reads like a form letter in the first line of an email. Legal
 * suffixes stay capitalised; small words stay lower unless they start the name.
 */
export function tidyName(s) {
  const raw = cleanText(s, 160);
  if (!raw) return null;
  if (/[a-z]/.test(raw)) return raw;   // already mixed case: someone typed it on purpose
  return raw.toLowerCase().split(/(\s+|-|\/)/).map((w, i) => {
    if (/^\s+$|^[-/]$/.test(w) || !w) return w;
    const bare = w.replace(/[^a-z0-9&']/gi, '');
    if (KEEP_UPPER.has(bare.toUpperCase())) return w.toUpperCase();
    if (i > 0 && KEEP_LOWER.has(bare)) return w;
    return w.replace(/^([^a-z0-9]*)([a-z])/, (_, p, c) => p + c.toUpperCase()).replace(/'([a-z])\b/, (m) => m.toLowerCase());
  }).join('');
}

// The registry abbreviates cities to fit a column ("WEST PALM BCH", "ROYAL PLM BCH", "N PALM BEACH").
// The service-area check matches city names, so an abbreviation would read as out of area.
const CITY_FIX = [[/\bBCH\b/g, 'BEACH'], [/\bPLM\b/g, 'PALM'], [/^N\b/, 'NORTH'], [/^S\b/, 'SOUTH'], [/^W\b/, 'WEST'], [/\bGRDNS\b/g, 'GARDENS'], [/\bSPGS\b/g, 'SPRINGS'], [/\bFT\b/g, 'FORT']];
export function tidyCity(s) {
  let c = String(s || '').trim().toUpperCase();
  if (!c) return null;
  for (const [re, to] of CITY_FIX) c = c.replace(re, to);
  if (c === 'GREEN ACRES') c = 'GREENACRES';
  return tidyName(c);
}

const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;   // 0,0 is the Atlantic, not an address
};
const zip5 = (z) => { const m = String(z || '').match(/\d{5}/); return m ? m[0] : null; };

// ---------------------------------------------------------------- AHCA

function setCookies(res) {
  const h = res.headers;
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie()
    : typeof h.getAll === 'function' ? h.getAll('set-cookie')
      : (h.get('set-cookie') ? [h.get('set-cookie')] : []);
  return list.map((c) => String(c).split(';')[0]).filter(Boolean);
}
const mergeJar = (jar, add) => { const m = new Map(jar.map((c) => [c.split('=')[0], c])); for (const c of add) m.set(c.split('=')[0], c); return [...m.values()]; };

/** Pull the `const data = [[...]];` rows out of an AHCA results page. Exported for tests. */
export function parseAhcaResults(html) {
  const m = String(html || '').match(/const\s+data\s*=\s*(\[[\s\S]*?\]);\s*\n/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }
  const out = [];
  for (const group of Array.isArray(data) ? data : []) for (const row of Array.isArray(group) ? group : [group]) if (row && typeof row === 'object') out.push(row);
  return out;
}

/** One AHCA row → the record shape upsertOrganization() takes, or null for a closed facility. */
export function normalizeAhca(row, typeCode) {
  if (!row || !row.Name) return null;
  if (String(row.IsClosed).toLowerCase() === 'true') return null;
  if (row.LicenseStatus && !OPEN_STATUSES.test(String(row.LicenseStatus).trim())) return null;
  const t = AHCA_TYPES[typeCode] || {};
  const beds = Number(row.BedCount);
  const street = [row.Address, row.Address2].map((x) => cleanText(x, 120)).filter(Boolean).join(', ');
  return {
    name: tidyName(row.Name),
    website: null,
    phone: cleanText(row.PhoneNumber, 30) || null,
    street: street ? tidyName(street) : null,
    city: tidyCity(row.City),
    state: cleanText(row.State, 2) || 'FL',
    zip: zip5(row.Zip),
    county: null,
    lat: num(row.Latitude),
    lng: num(row.Longitude),
    business_category: t.category || null,
    employee_or_capacity_hint: Number.isFinite(beds) && beds > 0 ? `${beds} licensed capacity (AHCA)` : null,
    provider_status: cleanText(row.LicenseStatus, 30) || null,
    types: [],
    source: 'ahca_healthfinder',
    source_external_id: row.LicenseID ? `ahca:${row.LicenseID}` : (row.FileNumber ? `ahca-file:${row.FileNumber}` : null),
    source_url: row.LicenseID ? `${AHCA_BASE}/Facility-Provider/Profile/?LID=${encodeURIComponent(row.LicenseID)}` : `${AHCA_BASE}/Facility-Search/FacilityLocateSearch`,
    captured: {
      registry: 'Florida AHCA FloridaHealthFinder',
      facility_type: cleanText(row.FacilityType, 120) || t.label || null,
      license_status: cleanText(row.LicenseStatus, 30) || null,
      license_number: cleanText(row.LicenseNumber, 30) || null,
      file_number: cleanText(row.FileNumber, 30) || null,
      licensed_beds: Number.isFinite(beds) ? beds : null,
      signals: withUrl(typeCode === 'Adult-DayCare' ? LICENSE_SIGNALS.adult_day
        : typeCode === 'CMH' ? LICENSE_SIGNALS.day : LICENSE_SIGNALS.residential,
      row.LicenseID ? `${AHCA_BASE}/Facility-Provider/Profile/?LID=${encodeURIComponent(row.LicenseID)}` : AHCA_BASE),
    },
  };
}

export async function ahcaHealthfinder(env, { facility_type, county, fetchImpl = fetch } = {}) {
  if (!AHCA_TYPES[facility_type]) return { ok: false, error: `Unknown AHCA facility type "${facility_type}".`, code: 'bad_request' };
  const countyCode = AHCA_COUNTIES[String(county || '').toLowerCase()];
  if (!countyCode) return { ok: false, error: `No AHCA county code for "${county}".`, code: 'bad_request' };
  const ua = { 'User-Agent': 'AnejoSalesResearch/1.0 (+https://anejocateringco.com/business)' };
  try {
    const page = await fetchImpl(`${AHCA_BASE}/Facility-Search/FacilityLocateSearch`, { headers: ua });
    if (!page.ok) return { ok: false, error: `AHCA search page returned HTTP ${page.status}.`, code: 'provider_error' };
    let jar = setCookies(page);
    const html = await page.text();
    const tok = (html.match(/name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"/) || [])[1];
    if (!tok) return { ok: false, error: 'AHCA search page changed: no request token found.', code: 'provider_changed' };
    const form = new URLSearchParams({ FacilityTypeSelection: facility_type, countySelection: countyCode, __RequestVerificationToken: tok });
    const post = await fetchImpl(`${AHCA_BASE}/Facility-Search/FacilityLocateSearch?handler=AdvancedSearch`, {
      method: 'POST', redirect: 'manual',
      headers: { ...ua, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.join('; ') },
      body: form.toString(),
    });
    jar = mergeJar(jar, setCookies(post));
    let resultsRes = post;
    const loc = post.headers.get('location');
    if (post.status >= 300 && post.status < 400 && loc) {
      resultsRes = await fetchImpl(new URL(loc, AHCA_BASE).toString(), { headers: { ...ua, Cookie: jar.join('; ') } });
    }
    if (!resultsRes.ok) return { ok: false, error: `AHCA results returned HTTP ${resultsRes.status}.`, code: 'provider_error' };
    const rows = parseAhcaResults(await resultsRes.text());
    if (rows === null) return { ok: false, error: 'AHCA results page changed: no facility data found.', code: 'provider_changed' };
    const results = rows.map((r) => normalizeAhca(r, facility_type)).filter(Boolean);
    for (const r of results) r.county = String(county).replace(/\b\w/g, (c) => c.toUpperCase());
    return { ok: true, results, next_cursor: null };
  } catch (e) {
    return { ok: false, error: 'Could not reach AHCA FloridaHealthFinder: ' + String((e && e.message) || e).slice(0, 120), code: 'network' };
  }
}

// ---------------------------------------------------------------- SAMHSA

// Settings that mean the facility feeds people on site on a schedule. Outpatient-only offices
// (a therapist's suite) do not, so they are left out of discovery rather than scored low.
const MEAL_SETTINGS = /residential|partial hospitalization|day treatment|intensive outpatient|hospital inpatient/i;

const serviceText = (row, label) => {
  const s = (row.services || []).find((x) => x && String(x.f1 || '').trim().toLowerCase() === label.toLowerCase());
  return s ? String(s.f3 || '') : '';
};

/** One FindTreatment row → a record, or null when it has no meal-bearing service setting. */
export function normalizeSamhsa(row) {
  if (!row || !row.name1) return null;
  const setting = serviceText(row, 'Service Setting');
  if (!MEAL_SETTINGS.test(setting)) return null;
  const care = serviceText(row, 'Type of Care');
  const residential = /residential/i.test(setting);
  const category = /substance use|detox/i.test(care) || row.typeFacility === 'SA' ? 'addiction_treatment' : 'behavioral_health';
  const name = [row.name1, row.name2].map((x) => cleanText(x, 120)).filter(Boolean).join(' — ');
  const street = [row.street1, row.street2].map((x) => cleanText(x, 120)).filter(Boolean).join(', ');
  const key = `${String(row.name1).toLowerCase().replace(/[^a-z0-9]/g, '')}|${String(row.street1 || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${zip5(row.zip) || ''}`;
  return {
    name,
    website: cleanText(row.website, 200) || null,
    phone: cleanText(row.phone, 30) || cleanText(row.intake1, 30) || null,
    street: street || null,
    city: cleanText(row.city, 60) || null,
    state: cleanText(row.state, 2) || null,
    zip: zip5(row.zip),
    county: null,
    lat: num(row.latitude),
    lng: num(row.longitude),
    business_category: category,
    employee_or_capacity_hint: null,
    provider_status: null,
    types: [],
    source: 'samhsa_findtreatment',
    source_external_id: `samhsa:${key}`,
    source_url: 'https://findtreatment.gov/',
    captured: {
      registry: 'SAMHSA FindTreatment.gov (Open Database License)',
      type_of_care: cleanText(care, 300) || null,
      service_setting: cleanText(setting, 300) || null,
      residential,
      facility_type: row.typeFacility || null,
      signals: withUrl(residential ? LICENSE_SIGNALS.residential : LICENSE_SIGNALS.day, 'https://findtreatment.gov/'),
    },
  };
}

export async function samhsaFindTreatment(env, { lat, lng, radius_miles = 10, cursor, fetchImpl = fetch } = {}) {
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return { ok: false, error: 'FindTreatment search needs a point (lat, lng).', code: 'bad_request' };
  const page = Math.max(1, Number(cursor) || 1);
  const meters = Math.round(Math.max(1, Math.min(50, Number(radius_miles) || 10)) * 1609.34);
  const url = `${SAMHSA_URL}?sAddr=${la},${lo}&limitType=2&limitValue=${meters}&pageSize=100&page=${page}&sort=0`;
  let r;
  try { r = await fetchImpl(url, { headers: { Accept: 'application/json' } }); } catch (e) {
    return { ok: false, error: 'Could not reach FindTreatment.gov: ' + String((e && e.message) || e).slice(0, 120), code: 'network' };
  }
  if (!r.ok) return { ok: false, error: `FindTreatment.gov returned HTTP ${r.status}.`, code: 'provider_error', status: r.status };
  let d;
  try { d = await r.json(); } catch { return { ok: false, error: 'FindTreatment.gov returned something that is not JSON.', code: 'provider_changed' }; }
  const rows = Array.isArray(d && d.rows) ? d.rows : [];
  // A result 300 miles away means the point was not understood — refuse the page rather than
  // import another state's facilities as "nearby".
  const far = rows.filter((x) => Number(x.miles) > (Number(radius_miles) || 10) * 1.5);
  if (rows.length && far.length === rows.length) return { ok: false, error: 'FindTreatment.gov returned only far-away facilities; the search point was not understood.', code: 'provider_changed' };
  const results = rows.map(normalizeSamhsa).filter(Boolean);
  const total = Number(d && d.totalPages) || 1;
  return { ok: true, results, next_cursor: page < total ? String(page + 1) : null, scanned: rows.length };
}
