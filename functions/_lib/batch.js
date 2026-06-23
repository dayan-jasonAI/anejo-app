// Grouping orders into efficient driver routes. Geographic clustering keeps each route's stops
// near each other (fewer driven miles); the per-route stop ORDER is optimized separately by
// geo.optimizeRoute. Files under _lib are NOT routed. Pure functions — no I/O.
import { haversineMiles } from './geo.js';

// Split stops into `groups` geographic clusters via a few rounds of k-means (Lloyd's), seeded
// deterministically (farthest-point) so results are stable across calls. Each stop:
// { id, lat, lng }. Returns an array of clusters, each an array of stop objects.
export function clusterByGeo(stops, groups) {
  const pts = (stops || []).filter((s) => s && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)));
  const G = Math.max(1, Math.min(Math.round(Number(groups) || 1), pts.length || 1));
  if (G <= 1 || pts.length <= 1) return pts.length ? [pts] : [];
  if (pts.length <= G) return pts.map((p) => [p]);

  // Seed centroids: first point, then repeatedly the point farthest from all chosen seeds.
  const seeds = [pts[0]];
  while (seeds.length < G) {
    let best = null, bestD = -1;
    for (const p of pts) {
      const d = Math.min(...seeds.map((s) => haversineMiles(p, s)));
      if (d > bestD) { bestD = d; best = p; }
    }
    seeds.push(best || pts[seeds.length]);
  }
  let centroids = seeds.map((s) => ({ lat: s.lat, lng: s.lng }));

  let clusters = [];
  for (let iter = 0; iter < 12; iter++) {
    clusters = Array.from({ length: G }, () => []);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < G; i++) { const d = haversineMiles(p, centroids[i]); if (d < bd) { bd = d; bi = i; } }
      clusters[bi].push(p);
    }
    let moved = false;
    centroids = clusters.map((c, i) => {
      if (!c.length) return centroids[i];
      const lat = c.reduce((a, p) => a + p.lat, 0) / c.length;
      const lng = c.reduce((a, p) => a + p.lng, 0) / c.length;
      if (Math.abs(lat - centroids[i].lat) > 1e-6 || Math.abs(lng - centroids[i].lng) > 1e-6) moved = true;
      return { lat, lng };
    });
    if (!moved) break;
  }
  return clusters.filter((c) => c.length);
}

// Split into clusters AND keep any stops that have no coordinates as a trailing group, so they
// are never silently dropped (the owner still gets to assign them somewhere).
export function groupOrders(orders, groups) {
  const withGeo = (orders || []).filter((o) => o && o.lat != null && o.lng != null);
  const noGeo = (orders || []).filter((o) => !o || o.lat == null || o.lng == null);
  const clusters = clusterByGeo(withGeo, groups);
  if (noGeo.length) clusters.push(noGeo);
  return clusters;
}
