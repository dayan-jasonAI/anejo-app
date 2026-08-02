// Geocoding + route optimization via Google Maps Platform.
// Files under functions/_lib are not routed.
//
// Sandbox/no-key posture (mirrors twilio.js): if GOOGLE_MAPS_API_KEY is absent, every
// function NO-OPS and returns null. Callers MUST treat null as "fall back" — manual stop
// order + a fixed-time ETA heuristic — so address capture and routing work with no key,
// and live optimization + traffic ETAs light up the moment the key is set.
//
// Origin (the kitchen/commissary the driver departs from) comes from env:
//   KITCHEN_ORIGIN_LAT / KITCHEN_ORIGIN_LNG  (preferred), else null → optimization no-ops.
// Per-stop service time (minutes spent at each drop) is DELIVERY_STOP_MINUTES (default 4).

export function geoConfigured(env) {
  return !!(env && env.GOOGLE_MAPS_API_KEY);
}

export function kitchenOrigin(env) {
  const lat = Number(env && env.KITCHEN_ORIGIN_LAT);
  const lng = Number(env && env.KITCHEN_ORIGIN_LNG);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

export function stopServiceSeconds(env) {
  const m = Number(env && env.DELIVERY_STOP_MINUTES);
  return (Number.isFinite(m) && m >= 0 ? m : 4) * 60;
}

// Build a one-line formatted address from structured parts (for geocoding + display).
export function formatAddress(a) {
  if (!a) return '';
  const line1 = [a.delivery_street || a.street, a.delivery_unit || a.unit].filter(Boolean).join(' ');
  const cityLine = [a.delivery_city || a.city, a.delivery_state || a.state].filter(Boolean).join(', ');
  return [line1, cityLine, a.delivery_zip || a.zip].filter(Boolean).join(', ').trim();
}

// Geocode a one-line address → { lat, lng, formatted, partialMatch, locationType, types,
// components } or null (no key / not found / error). `partialMatch` and `locationType` are the
// signal that catches a resolved-but-WRONG address: Google's Geocoding API will happily return
// status OK for "10330 City Center Blvb" by silently correcting the typo to "Blvd" — a naive
// "did it geocode?" check would have shipped that exact typo. `partial_match:true` means Google
// could not match the input exactly and substituted something close; `location_type` says how
// precisely — ROOFTOP/RANGE_INTERPOLATED found the actual address, GEOMETRIC_CENTER/APPROXIMATE
// only found the neighborhood or block. Callers that need to warn-and-ask compare these (and the
// formatted string) against what the customer typed; callers that only want a pin for routing can
// still just read lat/lng like before.
let lastFailure = null;
export function lastGeocodeFailure() { return lastFailure; }

// address_components -> the few fields checkout needs to offer a corrected address back to the
// customer as editable fields (not just a formatted string they'd have to retype).
function pickComponents(components) {
  const list = Array.isArray(components) ? components : [];
  const of = (type) => { const c = list.find((x) => x.types && x.types.includes(type)); return (c && c.short_name) || null; };
  const streetNum = of('street_number'), route = of('route');
  return {
    street: [streetNum, route].filter(Boolean).join(' ') || null,
    city: of('locality') || of('sublocality') || of('postal_town') || null,
    state: of('administrative_area_level_1') || null,
    zip: of('postal_code') || null,
  };
}

export async function geocode(env, address) {
  if (!geoConfigured(env)) return null;
  const q = typeof address === 'string' ? address : formatAddress(address);
  if (!q) return null;
  try {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?key=' +
      encodeURIComponent(env.GOOGLE_MAPS_API_KEY) + '&address=' + encodeURIComponent(q) +
      // Bias to Palm Beach County so partial addresses resolve locally.
      '&components=country:US|administrative_area:FL';
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.results || !data.results.length) {
      // Google says WHY — REQUEST_DENIED for a browser-restricted key, ZERO_RESULTS for an address
      // that does not exist, OVER_QUERY_LIMIT for billing. Swallowing it meant every order stored
      // no coordinates and nobody could tell a broken key from a bad address.
      lastFailure = { status: data.status || 'UNKNOWN', message: data.error_message || null, at: Date.now() };
      return null;
    }
    const r = data.results[0];
    const loc = r.geometry && r.geometry.location;
    if (!loc) return null;
    return {
      lat: loc.lat, lng: loc.lng, formatted: r.formatted_address || q,
      partialMatch: !!r.partial_match,
      locationType: (r.geometry && r.geometry.location_type) || null,
      types: Array.isArray(r.types) ? r.types : [],
      components: pickComponents(r.address_components),
    };
  } catch (e) {
    lastFailure = { status: 'FETCH_FAILED', message: String((e && e.message) || e).slice(0, 200), at: Date.now() };
    return null;
  }
}

// Expand common street-type / directional abbreviations so "St" and "Street" (or "N" and "North")
// compare equal — the point is to catch a REAL difference (the typo Google silently corrected, a
// different street entirely), not to nag the customer over formatting Google's response happens to
// prefer. Order matters: longer words first so e.g. "street" doesn't get half-replaced.
const ADDR_WORD = [
  ['street', 'st'], ['avenue', 'ave'], ['boulevard', 'blvd'], ['drive', 'dr'], ['road', 'rd'],
  ['lane', 'ln'], ['court', 'ct'], ['place', 'pl'], ['parkway', 'pkwy'], ['circle', 'cir'],
  ['highway', 'hwy'], ['terrace', 'ter'], ['trail', 'trl'], ['square', 'sq'], ['apartment', 'apt'],
  ['suite', 'ste'], ['north', 'n'], ['south', 's'], ['east', 'e'], ['west', 'w'],
];
function normalizeAddressText(s) {
  let t = String(s || '').toLowerCase();
  t = t.replace(/,?\s*usa\s*$/, '');           // Google appends ", USA" — never something typed
  t = t.replace(/[.,#]/g, ' ');
  for (const [word, abbr] of ADDR_WORD) t = t.replace(new RegExp('\\b' + word + '\\b', 'g'), abbr);
  return t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// True when the geocoder's formatted address is a MEANINGFULLY different string from what the
// customer typed. This is the check that actually catches "10330 City Center Blvb, Pembroke
// Pines": Google returns status OK (it resolved!) with `partial_match` sometimes unset, but the
// formatted_address comes back with "Blvd" — a resolves/doesn't-resolve check alone would have let
// that exact typo straight through to the kitchen.
export function addressWasCorrected(typedLine, formatted) {
  if (!typedLine || !formatted) return false;
  return normalizeAddressText(typedLine) !== normalizeAddressText(formatted);
}

/**
 * Prove the key works, and say plainly what is wrong when it does not. One lookup against a
 * known-good address, so the answer is about the KEY rather than the input.
 */
export async function geoSelfTest(env) {
  if (!geoConfigured(env)) return { ok: false, configured: false, reason: 'GOOGLE_MAPS_API_KEY is not set.' };
  const probe = '301 N Olive Ave, West Palm Beach, FL 33401';
  const r = await geocode(env, probe);
  if (r) return { ok: true, configured: true, probe, resolved: r.formatted, lat: r.lat, lng: r.lng };
  const f = lastFailure || {};
  // READ THE MESSAGE, NOT JUST THE STATUS. Google returns REQUEST_DENIED for billing, for a
  // referrer-restricted key, and for an API that is not enabled — three different fixes behind one
  // code. Keying the advice off the status alone confidently pointed at the wrong one, which is
  // worse than no advice: it sends someone to change a setting that was never the problem.
  const msg = String(f.message || '').toLowerCase();
  let hint;
  if (msg.includes('billing')) {
    hint = 'BILLING is not enabled on the Google Cloud project. Open console.cloud.google.com → Billing, link a billing account to this project, then reload. Nothing about the key needs changing.';
  } else if (msg.includes('not authorized') || msg.includes('api is not enabled') || msg.includes('has not been used')) {
    hint = 'The Geocoding API is not enabled on this project. Google Cloud → APIs & Services → Library → Geocoding API → Enable. Enable the Routes API too, which driver routing uses.';
  } else if (msg.includes('referer') || msg.includes('referrer') || msg.includes('ip address') || msg.includes('restrict')) {
    hint = 'The key is restricted in a way that blocks server-side calls. Google Cloud → Credentials → this key → Application restrictions → None. An HTTP-referrer restriction is browser-only and blocks Cloudflare.';
  } else if (f.status === 'REQUEST_DENIED') {
    hint = 'Google refused the request. The message above is the specific reason — the usual causes are billing not enabled, the Geocoding API not enabled, or a referrer restriction on the key.';
  } else if (f.status === 'OVER_QUERY_LIMIT') {
    hint = 'Quota or billing limit on the Google Cloud project.';
  } else if (f.status === 'ZERO_RESULTS') {
    hint = 'The key answered but could not resolve a known-good address — check that the Geocoding API (not Places) is the one enabled.';
  } else {
    hint = 'No usable response from Google.';
  }
  return { ok: false, configured: true, probe, status: f.status || 'NO_RESULT', message: f.message || null, hint };
}

const latLng = (lat, lng) => ({ location: { latLng: { latitude: Number(lat), longitude: Number(lng) } } });

// Optimize stop order + compute traffic-aware ETAs via the Routes API.
//   stops: [{ id, lat, lng }] (need coordinates — geocode first).
//   departAtMs: planned departure (ms epoch). Must be in the future for TRAFFIC_AWARE.
// Returns { order:[stopId…optimized], arrivalMs:{stopId:ms}, completeAtMs, backAtBaseMs, totalDriveSeconds }
//   or null to signal "fall back to manual order + heuristic ETA".
export async function optimizeRoute(env, stops, departAtMs) {
  if (!geoConfigured(env)) return null;
  const origin = kitchenOrigin(env);
  if (!origin) return null;
  const pts = (stops || []).filter((s) => s && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)));
  if (!pts.length) return null;

  const depart = Number(departAtMs) || Date.now();
  // Routes API needs departureTime strictly in the future; nudge it if needed.
  const departIso = new Date(Math.max(depart, Date.now() + 60000)).toISOString();
  const serviceSec = stopServiceSeconds(env);

  const body = {
    origin: latLng(origin.lat, origin.lng),
    destination: latLng(origin.lat, origin.lng), // round-trip: driver returns to base
    intermediates: pts.map((s) => latLng(s.lat, s.lng)),
    travelMode: 'DRIVE',
    optimizeWaypointOrder: true,
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: departIso,
  };

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.legs.duration,routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const route = data && data.routes && data.routes[0];
    if (!route || !route.legs || !route.legs.length) return null;

    // optimizedIntermediateWaypointIndex maps optimized position → original intermediates index.
    const optIdx = route.optimizedIntermediateWaypointIndex ||
      pts.map((_, i) => i); // fallback: original order
    const order = optIdx.map((i) => pts[i].id);

    // legs = [origin→stop1, stop1→stop2, …, stopN→origin]. Arrival at optimized stop k uses
    // cumulative drive (legs 0..k-1) + service time for the (k-1) prior drops.
    const dur = (leg) => {
      const s = leg && leg.duration ? String(leg.duration) : '0s';
      return parseInt(s.replace('s', ''), 10) || 0;
    };
    const arrivalMs = {};
    let t = depart;
    let totalDrive = 0;
    for (let k = 0; k < order.length; k++) {
      const driveSec = dur(route.legs[k]);
      totalDrive += driveSec;
      t += driveSec * 1000;
      arrivalMs[order[k]] = t;     // arrival at this drop
      t += serviceSec * 1000;      // time spent dropping off, before next leg
    }
    const completeAtMs = t; // last drop fully done (loop added the final service time)
    // Final leg back to base (last entry in legs):
    const backLeg = dur(route.legs[order.length]);
    const backAtBaseMs = t + backLeg * 1000;
    totalDrive += backLeg;

    const totalMeters = Number(route.distanceMeters) || null; // round-trip driving distance
    return { order, arrivalMs, completeAtMs, backAtBaseMs, totalDriveSeconds: totalDrive, totalMeters };
  } catch {
    return null;
  }
}

const R_EARTH_MI = 3958.7613; // mean Earth radius in miles
// Great-circle distance (miles) between {lat,lng} points.
export function haversineMiles(a, b) {
  if (!a || !b) return 0;
  const toRad = (d) => (Number(d) || 0) * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Fallback driven-miles estimate when the Routes API is unavailable: straight-line distance
// through origin → stops (in given order) → origin, inflated by a road-circuity factor.
export function estimateRouteMiles(origin, orderedStops, circuity = 1.3) {
  const pts = [origin, ...(orderedStops || []), origin].filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  let mi = 0;
  for (let i = 1; i < pts.length; i++) mi += haversineMiles(pts[i - 1], pts[i]);
  return Math.round(mi * circuity * 10) / 10;
}

// Traffic-aware drive time (seconds) between two points. null = no key / not routable.
// Used for the live per-stop ETA and the "arriving soon" auto-trigger.
export async function etaSeconds(env, from, to) {
  if (!geoConfigured(env)) return null;
  if (!from || !to || !Number.isFinite(Number(from.lat)) || !Number.isFinite(Number(to.lat))) return null;
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration',
      },
      body: JSON.stringify({
        origin: latLng(from.lat, from.lng),
        destination: latLng(to.lat, to.lng),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        departureTime: new Date(Date.now() + 60000).toISOString(),
      }),
    });
    const data = await res.json();
    const r = data && data.routes && data.routes[0];
    if (!r || !r.duration) return null;
    return parseInt(String(r.duration).replace('s', ''), 10) || null;
  } catch {
    return null;
  }
}

// Format an ms-epoch as a US Eastern clock time, e.g. "3:42 PM". null on failure.
export function clockET(ms) {
  try {
    return new Date(Number(ms)).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return null;
  }
}

// A maps directions URL for a single destination (works without a key; used in the driver app).
export function directionsUrl(dest) {
  const q = typeof dest === 'string' ? dest : (dest && Number.isFinite(Number(dest.lat))
    ? dest.lat + ',' + dest.lng : formatAddress(dest));
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q || '');
}

// A multi-stop directions URL (origin = current location, waypoints in order, final destination).
export function fullRouteUrl(stops) {
  const pts = (stops || []).map((s) =>
    (s && Number.isFinite(Number(s.lat)) ? s.lat + ',' + s.lng : formatAddress(s))
  ).filter(Boolean);
  if (!pts.length) return '';
  const destination = pts[pts.length - 1];
  const waypoints = pts.slice(0, -1).join('|');
  let u = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(destination);
  if (waypoints) u += '&waypoints=' + encodeURIComponent(waypoints);
  return u;
}
