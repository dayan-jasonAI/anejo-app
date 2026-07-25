// GET /api/menu — the public catalog (bowls, drinks, add-ons, modifier prices).
//
// One source of truth for every surface that shows a price: the order page, the homepage cards,
// and the AI assistant. Before this each of those carried its own hardcoded copy, and the
// homepage had already drifted out of sync with what checkout actually charges.
//
// Cached at the edge — the menu changes a few times a year, and a stale price for 60s is far
// better than a D1 read on every pageview.
import { json } from '../_lib/util.js';
import { loadMenu, publicCatalog } from '../_lib/menu.js';

export const onRequestGet = async ({ env }) => {
  const menu = await loadMenu(env);
  const res = json({ ok: true, ...publicCatalog(menu), source: menu.source });
  // `source: 'fallback'` means D1 didn't answer — don't cache that, or a blip gets pinned for a
  // minute across the edge.
  res.headers.set('Cache-Control', menu.source === 'd1' ? 'public, max-age=60' : 'no-store');
  return res;
};
