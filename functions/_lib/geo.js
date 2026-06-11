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

// Geocode a one-line address → { lat, lng, formatted } or null (no key / not found / error).
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
    if (data.status !== 'OK' || !data.results || !data.results.length) return null;
    const r = data.results[0];
    const loc = r.geometry && r.geometry.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng, formatted: r.formatted_address || q };
  } catch {
    return null;
  }
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
        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.legs.duration,routes.duration',
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

    return { order, arrivalMs, completeAtMs, backAtBaseMs, totalDriveSeconds: totalDrive };
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
