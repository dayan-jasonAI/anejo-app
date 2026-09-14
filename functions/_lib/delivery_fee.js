// Delivery fee for Añejo Daily orders:   fee = max(base fee, driving miles × mileage rate)
// Files under functions/_lib are NOT routed.
//
// Owner decision (2026-09-10): a $5.00 minimum that rises with distance once the mileage charge
// exceeds it. Every number is an OWNER SETTING, never a constant here — a reimbursement rate
// changes, and nothing in this file claims to know it. The rate is never labelled as an IRS rate.
//
// DISTANCE IS EXPLICIT, NEVER GUESSED. `delivery.distance_policy` says which distance is priced:
//   off        — mileage pricing off; the base fee only (the default — deploying changes nothing)
//   one_way    — ONE-WAY DRIVING distance, kitchen → customer
//   round_trip — ROUND-TRIP DRIVING distance, kitchen → customer → kitchen (one route, both legs)
// It is measured by the same Google Routes API the dispatch optimizer already uses (geo.js), from
// the configured kitchen origin (KITCHEN_ORIGIN_LAT/LNG) to the address checkout already geocoded.
// A straight-line estimate is NEVER used to charge a customer: if any piece is missing — key,
// origin, geocode, or the route call — the fee is the base fee, and the Hub says why.
//
// SCOPE: only orders containing Añejo Daily use this. Every other order keeps the existing flat
// DELIVERY_FEE_USD fee, unchanged.
import { geoConfigured, kitchenOrigin } from './geo.js';
import { now } from './hub.js';

export const METERS_PER_MILE = 1609.344;
// A sanity bound on the DISTANCE, not on the price. Añejo delivers inside Palm Beach County and
// checkout has already refused any zip outside the service area, so a route this long is a wrong
// answer from the API — a geocode that landed in another state, or a malformed response — and the
// honest response to a wrong answer is the base fee, not a fee computed from it. Without this,
// `fee = miles × rate` has no ceiling at all and an outlier would be charged through Square.
export const MAX_PLAUSIBLE_MILES = 120;
export const DISTANCE_POLICIES = {
  off: 'Off — flat base fee',
  one_way: 'One-way driving distance, kitchen → customer',
  round_trip: 'Round-trip driving distance, kitchen → customer → kitchen',
};

function envBaseCents(env) {
  const n = Math.round(Number(env && env.DELIVERY_FEE_USD) * 100);
  return Number.isInteger(n) && n >= 0 ? n : 500;
}

/** Owner settings (app_settings delivery.*). Malformed values fall back safely; never throws. */
export async function loadDeliverySettings(env) {
  const out = { base_fee_cents: envBaseCents(env), mileage_rate_cents: null, distance_policy: 'off' };
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'delivery.%'").all();
    for (const row of (r && r.results) || []) {
      const k = String(row.key).slice(9);
      const n = Number(row.value);
      if (k === 'base_fee_cents' && Number.isInteger(n) && n >= 0 && n <= 10000) out.base_fee_cents = n;
      if (k === 'mileage_rate_cents' && Number.isInteger(n) && n > 0 && n <= 1000) out.mileage_rate_cents = n;
      if (k === 'distance_policy' && Object.prototype.hasOwnProperty.call(DISTANCE_POLICIES, row.value)) out.distance_policy = row.value;
    }
  } catch { /* defaults */ }
  return out;
}

export async function saveDeliverySettings(env, input = {}, by) {
  const errors = [];
  const put = [];
  if ('base_fee_cents' in input) {
    const n = Number(input.base_fee_cents);
    if (!Number.isInteger(n) || n < 0 || n > 10000) errors.push('Base fee must be whole cents from 0 to 10000 (e.g. 500 = $5.00).');
    else put.push(['delivery.base_fee_cents', String(n)]);
  }
  if ('mileage_rate_cents' in input) {
    const raw = input.mileage_rate_cents;
    if (raw === '' || raw == null) put.push(['delivery.mileage_rate_cents', '']);
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0 || n > 1000) errors.push('Mileage rate must be whole cents per mile from 1 to 1000, or blank.');
      else put.push(['delivery.mileage_rate_cents', String(n)]);
    }
  }
  if ('distance_policy' in input) {
    if (!Object.prototype.hasOwnProperty.call(DISTANCE_POLICIES, input.distance_policy)) errors.push(`Distance policy must be one of: ${Object.keys(DISTANCE_POLICIES).join(', ')}.`);
    else put.push(['delivery.distance_policy', input.distance_policy]);
  }
  if (errors.length) return { ok: false, errors };
  const t = now();
  for (const [k, v] of put) {
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(k, v, by || null, t).run();
  }
  return { ok: true, settings: await loadDeliverySettings(env) };
}

/** Is distance pricing actually live? Every missing piece is named, for the Hub. */
export function mileageStatus(env, s) {
  const reasons = [];
  if (s.distance_policy === 'off') reasons.push('Mileage pricing is off — every Añejo Daily order pays the base fee.');
  if (!s.mileage_rate_cents) reasons.push('No mileage rate is set.');
  if (!geoConfigured(env)) reasons.push('GOOGLE_MAPS_API_KEY is not set, so driving distance cannot be measured.');
  if (!kitchenOrigin(env)) reasons.push('KITCHEN_ORIGIN_LAT / KITCHEN_ORIGIN_LNG are not set, so there is no starting point to measure from.');
  return { active: reasons.length === 0, reasons };
}

/** Pure: the formula. Unknown or bad miles/rate → the base fee. */
export function mileageFee({ baseCents, rateCents, miles }) {
  const base = Number.isInteger(baseCents) && baseCents >= 0 ? baseCents : 500;
  if (!Number.isFinite(miles) || miles < 0 || !Number.isFinite(rateCents) || rateCents <= 0) return { fee_cents: base, basis: 'base' };
  const charge = Math.round(miles * rateCents);
  return charge > base ? { fee_cents: charge, basis: 'mileage', charge_cents: charge } : { fee_cents: base, basis: 'floor', charge_cents: charge };
}

const latLng = (p) => ({ location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } } });

/**
 * DRIVING distance in meters via the Routes API. roundTrip = one route out and back to the origin.
 * null on any failure (no key, bad coordinates, API error) — the caller then charges the base fee.
 */
export async function driveDistanceMeters(env, from, to, { roundTrip = false, fetchImpl = fetch } = {}) {
  if (!geoConfigured(env)) return null;
  const ok = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
  if (!ok(from) || !ok(to)) return null;
  const body = roundTrip
    ? { origin: latLng(from), destination: latLng(from), intermediates: [latLng(to)], travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }
    : { origin: latLng(from), destination: latLng(to), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' };
  try {
    const res = await fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'routes.distanceMeters' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const m = Number(data && data.routes && data.routes[0] && data.routes[0].distanceMeters);
    return Number.isFinite(m) && m > 0 ? m : null;
  } catch { return null; }
}

/**
 * The fee for one Añejo Daily delivery to `dest` ({lat,lng} from checkout's geocode, or null).
 * → { fee_cents, basis: 'base'|'floor'|'mileage', miles|null, policy, reason? }
 */
export async function dailyDeliveryFee(env, settings, dest, { fetchImpl } = {}) {
  const s = settings || await loadDeliverySettings(env);
  const st = mileageStatus(env, s);
  if (!st.active) return { fee_cents: s.base_fee_cents, basis: 'base', miles: null, policy: s.distance_policy, reason: st.reasons[0] };
  if (!dest || !Number.isFinite(Number(dest.lat)) || !Number.isFinite(Number(dest.lng))) {
    return { fee_cents: s.base_fee_cents, basis: 'base', miles: null, policy: s.distance_policy, reason: 'The address could not be located, so no distance was measured.' };
  }
  const meters = await driveDistanceMeters(env, kitchenOrigin(env), dest, { roundTrip: s.distance_policy === 'round_trip', fetchImpl });
  if (meters == null) return { fee_cents: s.base_fee_cents, basis: 'base', miles: null, policy: s.distance_policy, reason: 'Driving distance was unavailable, so the base fee applies.' };
  const miles = Math.round((meters / METERS_PER_MILE) * 10) / 10;
  if (miles > MAX_PLAUSIBLE_MILES) {
    return { fee_cents: s.base_fee_cents, basis: 'base', miles: null, policy: s.distance_policy,
      reason: `The route came back as ${miles} miles, which is outside the delivery area — the reading was not trusted, so the base fee applies.` };
  }
  return { ...mileageFee({ baseCents: s.base_fee_cents, rateCents: s.mileage_rate_cents, miles }), miles, policy: s.distance_policy };
}
