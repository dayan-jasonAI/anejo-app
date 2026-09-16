// The two photos a cook takes before an order can be marked ready. Files under functions/_lib are NOT routed.
//
// Dayan, 2026-09-15: "I want to see what's inside it", then the container closed — "I need those two
// pictures. If I don't get those two pictures, the order cannot be set as ready."
//   contents  the food inside the open bowl, tray or box
//   packed    the same container closed and ready to go
//
// Only a photo that is not superseded counts. A retake supersedes the earlier photo of that kind, and
// an office count change supersedes both (contract.js), because the food inside changed. The gate
// itself lives in the same statement that sets the status (kitchen-ready.js), so no path reaches
// 'ready' without both.
export const PHOTO_KINDS = Object.freeze(['contents', 'packed']);

export const photoUrl = (key) => `/api/hub/media/${key}`;

/** order id → { contents?: {url, taken_at, by}, packed?: {…} } for current photos. */
export async function currentPhotosByOrder(env, orderIds) {
  const out = new Map();
  const ids = [...new Set((orderIds || []).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = ((await env.DB.prepare(
      `SELECT order_id, kind, media_key, taken_by_name, taken_at FROM kitchen_photos
        WHERE superseded_at IS NULL AND order_id IN (${chunk.map(() => '?').join(',')})
        ORDER BY taken_at DESC`
    ).bind(...chunk).all()).results) || [];
    for (const r of rows) {
      const cur = out.get(r.order_id) || {};
      if (!cur[r.kind]) cur[r.kind] = { url: photoUrl(r.media_key), taken_at: r.taken_at, by: r.taken_by_name || null };
      out.set(r.order_id, cur);
    }
  }
  return out;
}
