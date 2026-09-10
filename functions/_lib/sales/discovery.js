// Sales OS — prospect discovery: a PROVIDER INTERFACE, not a vendor woven through the app.
// Files under functions/_lib are NOT routed.
//
//   discoverOrganizations(env, { provider, query, area, cursor, limit }) → { ok, results, next_cursor }
//
// Every provider normalises into the same record shape upsertOrganization() takes, so dedupe,
// scoring and the Hub never know which vendor a clinic came from — only `source` says.
//
// Providers in this build:
//   · google_places — Places API (New) Text Search. Needs GOOGLE_PLACES_API_KEY (or the existing
//     GOOGLE_MAPS_API_KEY with the Places API enabled on it). Without a key it FAILS CLEARLY; it
//     never returns sample data that could be mistaken for real clinics.
//   · csv — owner-supplied rows (public licensure lists, a list he bought, his own notes). Always on.
//
// TERMS NOTE (see docs/SALES_OS_COMPLIANCE.md): Google's Places terms restrict long-term caching
// of Places content other than place IDs. This module stores the place_id as the external id and
// keeps the provider payload in the evidence row; facts the scoring relies on come from the
// organization's OWN website. Whether to keep Places-derived name/address beyond the terms'
// window is an owner/legal decision recorded in the compliance doc, not a code default.
import { cleanText } from './normalize.js';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents', 'places.location',
  'places.websiteUri', 'places.nationalPhoneNumber', 'places.types', 'places.primaryType', 'places.businessStatus',
  'nextPageToken',
].join(',');

export function placesKey(env) {
  return (env && (env.GOOGLE_PLACES_API_KEY || env.GOOGLE_MAPS_API_KEY)) || null;
}

/** What the Hub shows under "Discovery sources". Honest about what is and is not wired. */
export function providerStatus(env) {
  const key = placesKey(env);
  return [
    {
      key: 'google_places',
      label: 'Google Places (Text Search)',
      configured: !!key,
      note: key
        ? (env.GOOGLE_PLACES_API_KEY ? 'Key set (GOOGLE_PLACES_API_KEY).' : 'Using GOOGLE_MAPS_API_KEY — the Places API (New) must be enabled on it in Google Cloud, or searches will fail with a clear error.')
        : 'No key. Set GOOGLE_PLACES_API_KEY in the Pages settings to enable automatic discovery.',
    },
    { key: 'csv', label: 'CSV import (owner-supplied list)', configured: true, note: 'Always available from Sales → Prospects → Import.' },
  ];
}

function component(place, type) {
  const c = (place.addressComponents || []).find((x) => Array.isArray(x.types) && x.types.includes(type));
  return c || null;
}

/** One Places result → the record shape upsertOrganization() takes. */
export function normalizePlace(place) {
  const num = component(place, 'street_number');
  const route = component(place, 'route');
  const city = component(place, 'locality') || component(place, 'sublocality') || component(place, 'postal_town');
  const state = component(place, 'administrative_area_level_1');
  const county = component(place, 'administrative_area_level_2');
  const zip = component(place, 'postal_code');
  const loc = place.location || {};
  return {
    name: place.displayName && place.displayName.text ? place.displayName.text : null,
    website: place.websiteUri || null,
    phone: place.nationalPhoneNumber || null,
    street: [num && num.longText, route && route.longText].filter(Boolean).join(' ') || null,
    city: city ? city.longText : null,
    state: state ? state.shortText : null,
    zip: zip ? zip.longText : null,
    county: county ? String(county.longText).replace(/\s*County$/i, '') : null,
    lat: Number.isFinite(Number(loc.latitude)) ? Number(loc.latitude) : null,
    lng: Number.isFinite(Number(loc.longitude)) ? Number(loc.longitude) : null,
    types: Array.isArray(place.types) ? place.types : [],
    provider_status: place.businessStatus || null,
    source: 'google_places',
    source_external_id: place.id || null,
    source_url: place.id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}` : null,
    captured: {
      formatted_address: cleanText(place.formattedAddress, 200),
      primary_type: place.primaryType || null,
      types: Array.isArray(place.types) ? place.types.slice(0, 10) : [],
      business_status: place.businessStatus || null,
    },
  };
}

async function googlePlaces(env, { query, area, cursor, limit = 20, fetchImpl = fetch }) {
  const key = placesKey(env);
  if (!key) return { ok: false, error: 'Google Places is not configured (no GOOGLE_PLACES_API_KEY).', code: 'not_configured' };
  const body = {
    textQuery: area ? `${query} in ${area}` : query,
    pageSize: Math.max(1, Math.min(20, Number(limit) || 20)),
    regionCode: 'US',
    languageCode: 'en',
  };
  if (cursor) body.pageToken = cursor;
  let r;
  try {
    r = await fetchImpl(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACES_FIELDS },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: 'Could not reach Google Places: ' + String((e && e.message) || e).slice(0, 120), code: 'network' };
  }
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : `HTTP ${r.status}`;
    return { ok: false, error: `Google Places refused the search: ${String(msg).slice(0, 200)}`, code: 'provider_error', status: r.status };
  }
  const places = (data && Array.isArray(data.places)) ? data.places : [];
  return {
    ok: true,
    results: places.map(normalizePlace).filter((p) => p.name && p.source_external_id),
    next_cursor: (data && data.nextPageToken) || null,
  };
}

export const PROVIDERS = { google_places: googlePlaces };

export async function discoverOrganizations(env, { provider = 'google_places', ...opts } = {}) {
  const fn = PROVIDERS[provider];
  if (!fn) return { ok: false, error: `Unknown discovery provider "${provider}".`, code: 'unknown_provider' };
  return fn(env, opts);
}

// ---------------------------------------------------------------- CSV

/** RFC 4180-ish: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text, { maxRows = 500 } = {}) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const out = [];
  let rowv = [];
  let field = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { q = true; continue; }
    if (ch === ',') { rowv.push(field); field = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      rowv.push(field); field = '';
      if (rowv.some((v) => v.trim() !== '')) out.push(rowv);
      rowv = [];
      if (out.length > maxRows) break;
      continue;
    }
    field += ch;
  }
  if (field !== '' || rowv.length) { rowv.push(field); if (rowv.some((v) => v.trim() !== '')) out.push(rowv); }
  if (!out.length) return { header: [], rows: [] };
  const header = out[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const rows = out.slice(1, maxRows + 1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
  return { header, rows, truncated: out.length > maxRows + 1 };
}

const pick = (r, ...keys) => { for (const k of keys) if (r[k]) return r[k]; return null; };

/** One CSV row → an organization record plus (optionally) one contact. */
export function csvRowToRecord(r) {
  return {
    org: {
      name: pick(r, 'name', 'organization', 'organization_name', 'company', 'facility', 'facility_name', 'provider_name'),
      website: pick(r, 'website', 'url', 'web', 'site'),
      phone: pick(r, 'phone', 'telephone', 'phone_number', 'main_phone'),
      street: pick(r, 'street', 'address', 'street_address', 'address_1', 'address1'),
      city: pick(r, 'city', 'town'),
      state: pick(r, 'state', 'st'),
      zip: pick(r, 'zip', 'zipcode', 'zip_code', 'postal_code'),
      county: pick(r, 'county'),
      business_category: pick(r, 'category', 'icp_category'),
      employee_or_capacity_hint: pick(r, 'capacity', 'beds', 'licensed_capacity', 'census'),
      notes: pick(r, 'notes', 'note'),
      source: 'csv',
    },
    contact: {
      full_name: pick(r, 'contact_name', 'contact', 'administrator', 'director'),
      title: pick(r, 'contact_title', 'title'),
      email: pick(r, 'contact_email', 'email'),
      phone: pick(r, 'contact_phone'),
      source_url: pick(r, 'source_url', 'source'),
    },
  };
}
