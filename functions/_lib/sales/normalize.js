// Sales OS — normalisation and dedupe keys. Pure functions, no I/O. Reusable engine (not Añejo-specific).
// Files under functions/_lib are NOT routed.
//
// Dedupe is the property that makes every later step honest: if the same clinic arrives twice —
// from two search queries, or once from Places and once from a CSV — it must become ONE row, or it
// gets two emails, two scores and two opportunities. The order of trust is the spec's:
//   1. a strong external id (Google place_id)   2. own domain + address   3. normalised name + zip/city

const SUFFIXES = new Set(['llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd',
  'pa', 'pllc', 'plc', 'lp', 'llp', 'the', 'of', 'at']);

// Hosts that are NOT an organization's own domain. Deduping on facebook.com would merge every clinic
// whose "website" is its Facebook page into one row.
const NOT_OWN_DOMAIN = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'yelp.com', 'google.com',
  'business.site', 'sites.google.com', 'youtube.com', 'tiktok.com', 'psychologytoday.com',
  'healthgrades.com', 'zocdoc.com', 'yellowpages.com', 'bbb.org', 'mapquest.com', 'linktr.ee',
  'wixsite.com', 'godaddysites.com', 'squarespace.com', 'weebly.com',
];

export const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'live.com', 'msn.com', 'comcast.net', 'bellsouth.net', 'att.net', 'protonmail.com']);

// Local parts that address a function, not a person. Still a legitimate business contact channel —
// the spec's "generic office email" rung — but ranked below a named decision-maker.
const ROLE_LOCALS = /^(info|contact|admin|administration|office|hello|help|admissions|intake|referrals?|frontdesk|front\.?desk|reception|inquiries|inquiry|enquiries|operations|ops|billing|accounts?|hr|careers|jobs|support|team|mail|general|director|services)$/i;

export function stripAccents(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeOrgName(name) {
  const words = stripAccents(name).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !SUFFIXES.has(w));
  return words.join(' ').trim();
}

/** https://example.org/ form, or null. Only http(s); anything else is not a website. */
export function normalizeWebsite(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname || !u.hostname.includes('.')) return null;
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.port ? ':' + u.port : ''}/`;
  } catch { return null; }
}

export function hostOf(raw) {
  try {
    const w = normalizeWebsite(raw);
    return w ? new URL(w).hostname.replace(/^www\./, '') : null;
  } catch { return null; }
}

/** The organization's OWN domain, or null for social/directory/website-builder hosts. */
export function domainOf(raw) {
  const h = hostOf(raw);
  if (!h) return null;
  if (NOT_OWN_DOMAIN.some((d) => h === d || h.endsWith('.' + d))) return null;
  return h;
}

export function normEmail(e) {
  const s = String(e == null ? '' : e).trim().toLowerCase().replace(/^mailto:/, '');
  return /^[^\s@<>()"',;:]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

export function emailDomain(e) {
  const s = normEmail(e);
  return s ? s.split('@')[1] : null;
}

export function isRoleAddress(e) {
  const s = normEmail(e);
  return !!s && ROLE_LOCALS.test(s.split('@')[0]);
}

/** 10 US digits, or null. */
export function phoneDigits(p) {
  let d = String(p == null ? '' : p).replace(/[^0-9]/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? d : null;
}

export function formatPhone(p) {
  const d = phoneDigits(p);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

export function zip5(z) {
  const m = String(z == null ? '' : z).match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

const STREET_ABBR = [
  [/\bstreet\b/g, 'st'], [/\bavenue\b/g, 'ave'], [/\bboulevard\b/g, 'blvd'], [/\broad\b/g, 'rd'],
  [/\bdrive\b/g, 'dr'], [/\blane\b/g, 'ln'], [/\bcourt\b/g, 'ct'], [/\bparkway\b/g, 'pkwy'],
  [/\bhighway\b/g, 'hwy'], [/\bnorth\b/g, 'n'], [/\bsouth\b/g, 's'], [/\beast\b/g, 'e'], [/\bwest\b/g, 'w'],
  [/\bplace\b/g, 'pl'], [/\bterrace\b/g, 'ter'], [/\bcircle\b/g, 'cir'], [/\btrail\b/g, 'trl'],
];

/** Street line without the unit — "2226 West Atlantic Avenue, Suite 4" → "2226 w atlantic ave". */
export function streetKey(street) {
  let s = stripAccents(street).toLowerCase()
    .replace(/\b(suite|ste|unit|apt|bldg|building|floor|fl|room|rm)\b\.?\s*[#a-z0-9-]*/g, ' ')
    .replace(/#\s*[a-z0-9-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ');
  for (const [re, to] of STREET_ABBR) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

export function cityKey(city) {
  return stripAccents(city).toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The single key two records of the same place must share. Stored UNIQUE on
 * sales_organizations.dedupe_key, so a race between two discovery runs still cannot insert twice.
 */
export function dedupeKey({ source, source_external_id, domain, street, zip, city, name }) {
  if (source_external_id) return `x:${String(source || 'ext').toLowerCase()}:${String(source_external_id).trim()}`;
  const nn = normalizeOrgName(name);
  const where = zip5(zip) || cityKey(city) || '';
  const sk = streetKey(street);
  if (domain) return `d:${domain}|${sk || nn}|${where}`;
  return `n:${nn}|${sk}|${where}`;
}

/** Split "Dr. Maria del Carmen Ruiz, LCSW" → { first: 'Maria', last: 'Ruiz', full }. */
export function splitName(full) {
  const clean = String(full == null ? '' : full)
    .replace(/,.*$/, '')
    .replace(/\b(dr|mr|mrs|ms|mx|prof)\.?\s+/gi, '')
    .replace(/\s+/g, ' ').trim();
  if (!clean) return { first: null, last: null, full: null };
  const parts = clean.split(' ');
  return { first: parts[0] || null, last: parts.length > 1 ? parts[parts.length - 1] : null, full: clean };
}

/** Bounded, markup-free text for evidence snippets and captured payloads. */
export function cleanText(s, max = 280) {
  return String(s == null ? '' : s)
    .replace(/<[^>]*>/g, ' ')
    .split('').map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
