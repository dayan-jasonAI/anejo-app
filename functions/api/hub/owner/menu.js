// GET/POST /api/hub/owner/menu — the owner's menu desk: prices, items, modifier pricing.
//
// Dayan's ask: "make live updates to menu prices and add new menu items and have it reflect live
// on the website." Migration 0043 turned the menu into data; this is where it is edited.
// functions/api/checkout.js prices every line from the same rows via _lib/menu.js, so a price
// saved here is the price charged on the very next order — no deploy, no code edit.
//
// A PRICE CHANGE IS A MONEY CHANGE, so every one of them writes a menu_price_log row (who, when,
// old → new) before anyone can ask "when did this become $22.99?".
//
// The hard part of this endpoint is refusing to overstate what a saved row actually does. Two
// gaps are real, and both are reported to the UI instead of glossed over:
//
//   1. A NEW BOWL IS NOT ORDERABLE FROM A ROW ALONE. checkout.js re-validates and re-prices every
//      customized bowl against functions/_lib/bowlspec.js (macros + per-ingredient build). A bowl
//      with no spec there is rejected with "Unknown bowl: <id>" — but only AFTER the customer has
//      built their cart and pressed pay. Adding the recipe is a code change + deploy. Drinks and
//      add-ons have no such requirement: they price straight off the row and work immediately.
//   2. THE ORDER PAGE MAY STILL SHIP ITS OWN HARDCODED PRICES. If it does, a price change takes
//      effect at checkout while the menu on screen still shows the old number — the worst possible
//      version of "live". That is checked at runtime against the real page rather than asserted
//      here, so the warning disappears by itself the day that page reads /api/menu.
import { json, id, now, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { BOWL_BY_NAME } from '../../../_lib/bowlspec.js';
import { BOWL_IDS } from '../../../_lib/ondemand.js';

const KINDS = ['bowl', 'drink', 'addon'];
const SLUG = /^[a-z0-9_]+$/;                                  // checkout matches items by this id
const IMAGE = /^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|avif)$/;  // filename under /assets/img/
// $1,000. A fat-fingered 199900 ("dollars" typed into a cents box) would otherwise go live as a
// $1,999 bowl on a real Square charge.
const MAX_CENTS = 100000;
// menu_price_log.item_id for a modifier change; its `field` carries the modifier key.
const MODIFIER_ITEM_ID = 'modifier';

const text = (v, max) => {
  const s = String(v == null ? '' : v).trim().slice(0, max);
  return s || null;
};

/** Money is only ever whole cents here — anything else is refused, never rounded into a guess. */
function parseCents(raw, label) {
  if (raw === '' || raw == null) return { error: `${label} is required.` };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: `${label} must be a number of cents, got "${raw}".` };
  if (!Number.isInteger(n)) return { error: `${label} must be whole cents — 1999 means $19.99. Got ${n}.` };
  if (n <= 0) return { error: `${label} must be greater than zero.` };
  if (n > MAX_CENTS) {
    return { error: `${label} of ${n}¢ ($${(n / 100).toFixed(2)}) is over the $${(MAX_CENTS / 100).toFixed(0)} ceiling — enter cents, not dollars.` };
  }
  return { cents: n };
}

const logStmt = (env, itemId, field, oldCents, newCents, by, ts) =>
  env.DB.prepare(
    `INSERT INTO menu_price_log (id, item_id, field, old_cents, new_cents, changed_by, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(id('mpl'), itemId, field, oldCents, newCents, by, ts);

/**
 * Say whether a row is actually buyable, and if not, exactly why.
 * Bowls carry a second source of truth (bowlspec) that a D1 row cannot satisfy on its own.
 */
function decorate(row) {
  const out = { ...row };
  if (row.kind !== 'bowl') {
    out.orderable = true;
    out.blocker = null;
    return out;
  }
  const spec = BOWL_BY_NAME[String(row.id).toUpperCase()];
  if (!spec) {
    out.orderable = false;
    out.blocker = `No recipe in functions/_lib/bowlspec.js — checkout rejects this bowl with "Unknown bowl: ${row.id}".`;
  } else if (spec.hidden) {
    out.orderable = false;
    out.blocker = `Its bowlspec recipe is flagged hidden, so checkout still rejects it with "Unknown bowl: ${row.id}".`;
  } else {
    out.orderable = true;
    out.blocker = null;
  }
  // Not a blocker: the per-day on-demand production cap only counts ids listed in ondemand.js.
  out.on_demand_capped = BOWL_IDS.includes(row.id);
  return out;
}

function warningsFor(items) {
  const out = [];
  for (const it of items) {
    if (it.kind !== 'bowl') continue;
    if (!it.orderable) {
      out.push({
        level: it.active ? 'block' : 'info',
        item_id: it.id,
        message: it.active
          ? `${it.name} is on the menu but CANNOT be bought. ${it.blocker} A developer must add its build + macros and deploy before it is real.`
          : `${it.name} is inactive, and would not be buyable if switched on. ${it.blocker}`,
      });
    } else if (it.active && !it.on_demand_capped) {
      out.push({
        level: 'warn',
        item_id: it.id,
        message: `${it.name} is not in ondemand.js BOWL_IDS, so the per-day production cap does not count it — same-day orders for it are unlimited.`,
      });
    }
  }
  return out;
}

/**
 * Does the customer-facing order page read the live menu, or does it still carry its own copy of
 * the prices? Asked of the real page at request time: a belief hardcoded here would go stale the
 * moment that page is wired up, and would then be a lie in the safest-sounding direction.
 */
async function storefrontCheck(env, request) {
  try {
    const res = await fetch(`${appBaseUrl(env, request)}/order`, { cf: { cacheTtl: 300 } });
    if (!res.ok) return { checked: false, reads_menu_api: null };
    const html = await res.text();
    return { checked: true, reads_menu_api: html.includes('/api/menu') };
  } catch {
    return { checked: false, reads_menu_api: null };   // never fail the desk over a self-fetch
  }
}

async function snapshot(env, request) {
  const [ri, rm, rl] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM menu_items
       ORDER BY CASE kind WHEN 'bowl' THEN 0 WHEN 'drink' THEN 1 ELSE 2 END, sort, id`
    ).all(),
    env.DB.prepare('SELECT * FROM menu_modifier_prices ORDER BY key').all(),
    env.DB.prepare('SELECT * FROM menu_price_log ORDER BY created_at DESC LIMIT 40').all(),
  ]);
  const items = ((ri && ri.results) || []).map(decorate);
  return {
    ok: true,
    items,
    modifiers: (rm && rm.results) || [],
    log: (rl && rl.results) || [],
    warnings: warningsFor(items),
    storefront: await storefrontCheck(env, request),
  };
}

// ---------- GET ----------
export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  try {
    return json(await snapshot(env, request));
  } catch (e) {
    // An empty/missing menu table is a migration that hasn't run, not an empty menu — say so
    // rather than showing the owner a blank editor over a live storefront.
    return json({ ok: false, error: `menu tables unreadable — apply migration 0043 (${e.message})` }, 501);
  }
};

// ---------- POST ----------
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  let body = {};
  try { body = await request.json(); } catch { /* handled by the op check below */ }
  const op = String(body.op || '');
  const actor = String(ctx.email || ctx.distinct_id || ctx.role || 'owner').slice(0, 120);
  const ts = now();

  if (op === 'update_item') {
    const itemId = String(body.id || '').trim();
    const row = await env.DB.prepare('SELECT * FROM menu_items WHERE id = ?').bind(itemId).first();
    if (!row) return json({ ok: false, error: `No menu item "${itemId}".` }, 404);

    const next = { ...row };
    const errors = [];
    if ('price_cents' in body) {
      const p = parseCents(body.price_cents, 'Price');
      if (p.error) errors.push(p.error); else next.price_cents = p.cents;
    }
    if ('name' in body) {
      const v = text(body.name, 120);
      if (!v) errors.push('Name cannot be empty.'); else next.name = v;
    }
    if ('name_es' in body) next.name_es = text(body.name_es, 120);
    if ('description' in body) next.description = text(body.description, 400);
    if ('description_es' in body) next.description_es = text(body.description_es, 400);
    if ('image' in body) {
      const v = text(body.image, 120);
      if (v && !IMAGE.test(v)) errors.push('Image must be a filename under /assets/img/, e.g. bowl_vida.jpg.');
      else next.image = v;
    }
    if ('sort' in body) {
      const n = Number(body.sort);
      if (!Number.isInteger(n) || n < 0 || n > 9999) errors.push('Sort must be a whole number 0–9999.');
      else next.sort = n;
    }
    if ('active' in body) next.active = body.active ? 1 : 0;
    if (errors.length) return json({ ok: false, error: 'validation failed', errors }, 400);

    const stmts = [
      env.DB.prepare(
        `UPDATE menu_items SET name=?, name_es=?, price_cents=?, description=?, description_es=?,
           image=?, sort=?, active=?, updated_at=? WHERE id=?`
      ).bind(
        next.name, next.name_es, next.price_cents, next.description, next.description_es,
        next.image, next.sort, next.active, ts, itemId,
      ),
    ];
    if (next.price_cents !== row.price_cents) {
      stmts.push(logStmt(env, itemId, 'price_cents', row.price_cents, next.price_cents, actor, ts));
    }
    await env.DB.batch(stmts);
    return json({ ...(await snapshot(env, request)), saved: itemId });
  }

  if (op === 'create_item') {
    const itemId = String(body.id || '').trim().toLowerCase();
    const kind = String(body.kind || '').trim();
    const errors = [];
    if (!SLUG.test(itemId) || itemId.length > 40) {
      errors.push('Id must be a slug: lowercase letters, numbers and underscores only (e.g. bowl_verde), 40 chars max.');
    }
    if (!KINDS.includes(kind)) errors.push(`Kind must be one of ${KINDS.join(', ')}.`);
    const name = text(body.name, 120);
    if (!name) errors.push('Name is required.');
    const p = parseCents(body.price_cents, 'Price');
    if (p.error) errors.push(p.error);
    let sort = 100;
    if ('sort' in body && body.sort !== '' && body.sort != null) {
      const n = Number(body.sort);
      if (!Number.isInteger(n) || n < 0 || n > 9999) errors.push('Sort must be a whole number 0–9999.');
      else sort = n;
    }
    const image = text(body.image, 120);
    if (image && !IMAGE.test(image)) errors.push('Image must be a filename under /assets/img/, e.g. bowl_vida.jpg.');
    if (errors.length) return json({ ok: false, error: 'validation failed', errors }, 400);

    const clash = await env.DB.prepare('SELECT id FROM menu_items WHERE id = ?').bind(itemId).first();
    if (clash) return json({ ok: false, error: `"${itemId}" already exists — edit it instead of creating a second one.` }, 409);

    const active = 'active' in body ? (body.active ? 1 : 0) : 1;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO menu_items (id, kind, name, name_es, price_cents, description, description_es,
           image, sort, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        itemId, kind, name, text(body.name_es, 120), p.cents, text(body.description, 400),
        text(body.description_es, 400), image, sort, active, ts, ts,
      ),
      // Creating an item sets a price out of nothing — that is a money event too (old = null).
      logStmt(env, itemId, 'price_cents', null, p.cents, actor, ts),
    ]);

    const snap = await snapshot(env, request);
    const blocked = snap.items.filter((i) => i.id === itemId && !i.orderable)[0];
    return json({
      ...snap,
      saved: itemId,
      // Surfaced separately from `warnings` so the UI can put it in front of the owner NOW,
      // at the moment they think they just added a product to the menu.
      warning: blocked
        ? `"${name}" is saved and will show up in the menu API — but customers CANNOT buy it yet. ${blocked.blocker} It needs its build + macros added to functions/_lib/bowlspec.js (and its id added to ondemand.js BOWL_IDS) and a deploy. Until then, leave it inactive or expect failed checkouts.`
        : null,
    });
  }

  if (op === 'update_modifier') {
    const key = String(body.key || '').trim();
    const row = await env.DB.prepare('SELECT * FROM menu_modifier_prices WHERE key = ?').bind(key).first();
    // Deliberately no upsert: a modifier key no line of code reads would price nothing at all,
    // and would sit in the editor looking like a live knob.
    if (!row) return json({ ok: false, error: `No modifier "${key}". Modifier keys are fixed in code — you can change what they cost, not invent new ones.` }, 404);

    const p = parseCents(body.cents, 'Modifier price');
    if (p.error) return json({ ok: false, error: 'validation failed', errors: [p.error] }, 400);

    const stmts = [
      env.DB.prepare('UPDATE menu_modifier_prices SET cents=?, updated_at=? WHERE key=?').bind(p.cents, ts, key),
    ];
    if (p.cents !== row.cents) {
      stmts.push(logStmt(env, MODIFIER_ITEM_ID, key, row.cents, p.cents, actor, ts));
    }
    await env.DB.batch(stmts);
    return json({ ...(await snapshot(env, request)), saved: key });
  }

  return json({ ok: false, error: 'Unknown op.' }, 400);
};
